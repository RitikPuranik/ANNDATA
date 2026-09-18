import { PaymentService } from "../../src/modules/payments/payment.service";
import { AuthorizationError, ConflictError, PaymentDomainError } from "../../src/common/errors";
import { PaymentAuthorizationService } from "../../src/modules/payments/payment.authorization";

/**
 * PaymentService is exercised here with hand-built in-memory fakes for
 * every collaborator, the same dependency-injection shape app.ts wires up
 * for real — no database required, same convention as
 * tests/unit/delivery.service.test.ts (see this repo's own
 * prisma/README-engines.md for why: the Prisma engine binary cannot be
 * fetched in this build sandbox, and ts-jest's isolatedModules
 * transpilation elides the Prisma-generated enum/type imports this file
 * only ever uses in type positions — so PaymentService itself is
 * instantiated and run for real, with real business-logic execution).
 */

type FakeObligation = {
  id: string;
  publicId: string;
  deliveryId: string;
  tradeOfferId: string | null;
  buyerId: string;
  sellerFarmerId: string | null;
  sellerFpoId: string | null;
  currency: string;
  grossAmount: number;
  adjustments: number;
  finalPayableAmount: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeRecord = {
  id: string;
  publicId: string;
  paymentObligationId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  idempotencyKey: string;
  externalReference: string | null;
  paidAt: Date;
  status: string;
  recordedByUserId: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const DELIVERY_PUBLIC_ID = "22222222-2222-2222-2222-222222222222";

function makeObligation(overrides: Partial<FakeObligation> = {}): FakeObligation {
  return {
    id: "obligation-1",
    publicId: "11111111-1111-1111-1111-111111111111",
    deliveryId: "delivery-1",
    tradeOfferId: "offer-1",
    buyerId: "buyer-1",
    sellerFarmerId: "farmer-1",
    sellerFpoId: null,
    currency: "INR",
    grossAmount: 100000,
    adjustments: 0,
    finalPayableAmount: 100000,
    amountPaid: 0,
    amountDue: 100000,
    status: "PENDING",
    dueAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService(initialObligations: FakeObligation[] = []) {
  const obligationStore = new Map<string, FakeObligation>(initialObligations.map((o) => [o.id, { ...o }]));
  const recordStore = new Map<string, FakeRecord>();
  const auditEvents: string[] = [];
  let recordSeq = 0;

  const obligations = {
    create: jest.fn(async (data: Partial<FakeObligation>) => {
      const id = `obligation-${obligationStore.size + 1}`;
      const row: FakeObligation = {
        id,
        publicId: id,
        deliveryId: data.deliveryId!,
        tradeOfferId: data.tradeOfferId ?? null,
        buyerId: data.buyerId!,
        sellerFarmerId: data.sellerFarmerId ?? null,
        sellerFpoId: data.sellerFpoId ?? null,
        currency: data.currency ?? "INR",
        grossAmount: data.grossAmount as number,
        adjustments: data.adjustments as number,
        finalPayableAmount: data.finalPayableAmount as number,
        amountPaid: 0,
        amountDue: data.amountDue as number,
        status: "PENDING",
        dueAt: data.dueAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      obligationStore.set(id, row);
      return row;
    }),
    findById: jest.fn(async (id: string) => obligationStore.get(id) ?? null),
    findByPublicId: jest.fn(async (publicId: string) => [...obligationStore.values()].find((o) => o.publicId === publicId) ?? null),
    findByDeliveryId: jest.fn(async (deliveryId: string) => [...obligationStore.values()].find((o) => o.deliveryId === deliveryId) ?? null),
    list: jest.fn(async () => ({ items: [...obligationStore.values()], total: obligationStore.size })),
    lockForUpdate: jest.fn(async (_tx: unknown, id: string) => obligationStore.has(id)),
    findByIdInTransaction: jest.fn(async (_tx: unknown, id: string) => obligationStore.get(id) ?? null),
    updateAmountsAndStatus: jest.fn(async (_tx: unknown, id: string, data: { amountPaid: number; amountDue: number; status: string }) => {
      const current = obligationStore.get(id)!;
      const updated = { ...current, ...data };
      obligationStore.set(id, updated);
      return updated;
    }),
    transition: jest.fn(async (id: string, fromStatuses: string[], toStatus: string) => {
      const current = obligationStore.get(id);
      if (!current || !fromStatuses.includes(current.status)) return null;
      const updated = { ...current, status: toStatus };
      obligationStore.set(id, updated);
      return updated;
    }),
  };

  const records = {
    createInTransaction: jest.fn(async (_tx: unknown, data: Partial<FakeRecord>) => {
      recordSeq += 1;
      const row: FakeRecord = {
        id: `record-${recordSeq}`,
        publicId: `record-${recordSeq}`,
        paymentObligationId: data.paymentObligationId!,
        amount: data.amount as number,
        currency: data.currency ?? "INR",
        paymentMethod: data.paymentMethod as string,
        idempotencyKey: data.idempotencyKey!,
        externalReference: data.externalReference ?? null,
        paidAt: data.paidAt as Date,
        status: "RECORDED",
        recordedByUserId: data.recordedByUserId!,
        notes: data.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      recordStore.set(row.id, row);
      return row;
    }),
    findByIdempotencyKeyInTransaction: jest.fn(async (_tx: unknown, paymentObligationId: string, idempotencyKey: string) =>
      [...recordStore.values()].find((r) => r.paymentObligationId === paymentObligationId && r.idempotencyKey === idempotencyKey) ?? null,
    ),
    listActiveAmountsInTransaction: jest.fn(async (_tx: unknown, paymentObligationId: string) =>
      [...recordStore.values()].filter((r) => r.paymentObligationId === paymentObligationId && r.status !== "REVERSED").map((r) => r.amount),
    ),
    findByPublicId: jest.fn(async (publicId: string) => [...recordStore.values()].find((r) => r.publicId === publicId) ?? null),
    findById: jest.fn(async (id: string) => recordStore.get(id) ?? null),
    list: jest.fn(async (filters: { paymentObligationId: string }) => {
      const items = [...recordStore.values()].filter((r) => r.paymentObligationId === filters.paymentObligationId);
      return { items, total: items.length };
    }),
    markReversed: jest.fn(),
  };

  const deliveries = {
    findByPublicId: jest.fn(async (publicId: string) => {
      if (publicId !== DELIVERY_PUBLIC_ID) return null;
      return { id: "delivery-1", publicId: DELIVERY_PUBLIC_ID, status: "RECONCILED", tradeOfferId: "offer-1", buyerId: "buyer-1" };
    }),
    findById: jest.fn(async (id: string) =>
      id === "delivery-1" ? { id: "delivery-1", publicId: DELIVERY_PUBLIC_ID, status: "RECONCILED", tradeOfferId: "offer-1", buyerId: "buyer-1" } : null,
    ),
  } as never;

  const deliveryService = {
    getHandoff: jest.fn(async () => ({
      buyerId: "buyer-1",
      sellerFarmerId: "farmer-1",
      sellerFpoId: null,
      acceptedQuantity: 500, // kg
    })),
  } as never;

  const fpoAuthorization = { canManageFpo: jest.fn(async () => false) } as never;
  const authorization = new PaymentAuthorizationService(fpoAuthorization);

  const farmerProfiles = { ensure: jest.fn(async () => ({ id: "farmer-1" })) } as never;
  const audit = { record: jest.fn(async (event: { action: string }) => void auditEvents.push(event.action)) };

  const prisma = {
    tradeOffer: { findUnique: jest.fn(async () => ({ id: "offer-1", offeredPrice: 2500, priceUnit: "INR_PER_QUINTAL" })) },
    buyerProfile: { findUnique: jest.fn(async () => ({ id: "buyer-1" })) },
    farmerProfile: { findUnique: jest.fn(async () => ({ id: "farmer-1" })) },
    fpoAdmin: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  } as never;

  const service = new PaymentService(
    prisma,
    obligations as never,
    records as never,
    deliveries,
    deliveryService,
    authorization,
    farmerProfiles,
    audit as never,
  );

  const buyer = { id: "buyer-user-1", role: "BUYER" } as never;
  const admin = { id: "admin-user-1", role: "ADMIN" } as never;
  const farmer = { id: "farmer-user-1", role: "FARMER" } as never;

  return { service, obligationStore, recordStore, auditEvents, buyer, admin, farmer };
}

describe("PaymentService.createObligation", () => {
  it("computes finalPayableAmount from the accepted quantity and the trade offer's per-quintal price (Step 8)", async () => {
    const { service, buyer } = buildService();
    const result = await service.createObligation(buyer, { deliveryId: DELIVERY_PUBLIC_ID });
    // 500 kg at Rs 2500 per quintal (100kg) = 500/100 * 2500 = 12500
    expect(result.finalPayableAmount).toBe(12500);
    expect(result.grossAmount).toBe(12500);
    expect(result.status).toBe("PENDING");
    expect(result.amountDue).toBe(12500);
    expect(result.buyerId).toBe("buyer-1");
    expect(result.sellerFarmerId).toBe("farmer-1");
  });

  it("records a PAYMENT_OBLIGATION_CREATED audit event", async () => {
    const { service, buyer, auditEvents } = buildService();
    await service.createObligation(buyer, { deliveryId: DELIVERY_PUBLIC_ID });
    expect(auditEvents).toContain("PAYMENT_OBLIGATION_CREATED");
  });

  it("rejects creation from a delivery that is not RECONCILED (Step 7)", async () => {
    const { service, buyer } = buildService();
    // Swap in a not-yet-reconciled delivery for this one call.
    const deliveries = (service as unknown as { deliveries: { findByPublicId: jest.Mock } }).deliveries;
    deliveries.findByPublicId.mockResolvedValueOnce({
      id: "delivery-2",
      publicId: DELIVERY_PUBLIC_ID,
      status: "UNDER_INSPECTION",
      tradeOfferId: "offer-1",
      buyerId: "buyer-1",
    });
    await expect(service.createObligation(buyer, { deliveryId: DELIVERY_PUBLIC_ID })).rejects.toThrow(PaymentDomainError);
  });

  it("rejects when the delivery cannot be found", async () => {
    const { service, buyer } = buildService();
    await expect(service.createObligation(buyer, { deliveryId: "99999999-9999-9999-9999-999999999999" })).rejects.toThrow();
  });

  it("rejects creation when an obligation already exists for the delivery (Step 7)", async () => {
    const { service, buyer } = buildService([makeObligation({ deliveryId: "delivery-1" })]);
    await expect(service.createObligation(buyer, { deliveryId: DELIVERY_PUBLIC_ID })).rejects.toThrow(ConflictError);
  });

  it("rejects creation by a party who is not the buyer of the delivery (Step 14)", async () => {
    const { service, farmer } = buildService();
    await expect(service.createObligation(farmer, { deliveryId: DELIVERY_PUBLIC_ID })).rejects.toThrow(AuthorizationError);
  });

  it("allows ADMIN to create an obligation on the buyer's behalf", async () => {
    const { service, admin } = buildService();
    const result = await service.createObligation(admin, { deliveryId: DELIVERY_PUBLIC_ID });
    expect(result.status).toBe("PENDING");
  });
});

describe("PaymentService.recordPayment", () => {
  it("moves PENDING -> PARTIALLY_PAID on a partial payment", async () => {
    const { service, buyer } = buildService([makeObligation()]);
    const result = await service.recordPayment(buyer, "11111111-1111-1111-1111-111111111111", {
      amount: 40000,
      currency: "INR",
      paymentMethod: "UPI" as never,
      idempotencyKey: "idem-1",
      paidAt: new Date(),
    });
    expect(result.status).toBe("PARTIALLY_PAID");
    expect(result.amountPaid).toBe(40000);
    expect(result.amountDue).toBe(60000);
  });

  it("sums multiple payments to reach PAID and records PAYMENT_COMPLETED (Step 10)", async () => {
    const { service, buyer, auditEvents } = buildService([makeObligation()]);
    const publicId = "11111111-1111-1111-1111-111111111111";
    await service.recordPayment(buyer, publicId, { amount: 40000, currency: "INR", paymentMethod: "UPI" as never, idempotencyKey: "idem-1", paidAt: new Date() });
    await service.recordPayment(buyer, publicId, { amount: 30000, currency: "INR", paymentMethod: "UPI" as never, idempotencyKey: "idem-2", paidAt: new Date() });
    const result = await service.recordPayment(buyer, publicId, { amount: 30000, currency: "INR", paymentMethod: "UPI" as never, idempotencyKey: "idem-3", paidAt: new Date() });

    expect(result.status).toBe("PAID");
    expect(result.amountPaid).toBe(100000);
    expect(result.amountDue).toBe(0);
    expect(auditEvents).toContain("PAYMENT_COMPLETED");
  });

  it("detects an overpayment and exposes the excess amount (Step 11)", async () => {
    const { service, buyer, auditEvents } = buildService([makeObligation()]);
    const result = await service.recordPayment(buyer, "11111111-1111-1111-1111-111111111111", {
      amount: 105000,
      currency: "INR",
      paymentMethod: "BANK_TRANSFER" as never,
      idempotencyKey: "idem-1",
      paidAt: new Date(),
    });
    expect(result.status).toBe("OVERPAID");
    expect(result.excessAmount).toBe(5000);
    expect(auditEvents).toContain("PAYMENT_OVERPAID");
  });

  it("is idempotent: a repeated request with the same idempotencyKey never creates a duplicate record (Step 21)", async () => {
    const { service, buyer, recordStore } = buildService([makeObligation()]);
    const publicId = "11111111-1111-1111-1111-111111111111";
    const input = { amount: 40000, currency: "INR", paymentMethod: "UPI" as never, idempotencyKey: "idem-1", paidAt: new Date() };
    const first = await service.recordPayment(buyer, publicId, input);
    const second = await service.recordPayment(buyer, publicId, input);

    expect(recordStore.size).toBe(1);
    expect(first.amountPaid).toBe(second.amountPaid);
    expect(second.amountPaid).toBe(40000);
  });

  it("rejects a payment recorded by someone other than the obligation's buyer", async () => {
    const { service, farmer } = buildService([makeObligation()]);
    await expect(
      service.recordPayment(farmer, "11111111-1111-1111-1111-111111111111", {
        amount: 1000,
        currency: "INR",
        paymentMethod: "CASH" as never,
        idempotencyKey: "idem-1",
        paidAt: new Date(),
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects a payment against a CANCELLED obligation (Step 20)", async () => {
    const { service, buyer } = buildService([makeObligation({ status: "CANCELLED" })]);
    await expect(
      service.recordPayment(buyer, "11111111-1111-1111-1111-111111111111", {
        amount: 1000,
        currency: "INR",
        paymentMethod: "CASH" as never,
        idempotencyKey: "idem-1",
        paidAt: new Date(),
      }),
    ).rejects.toThrow(PaymentDomainError);
  });

  it("rejects a payment whose currency does not match the obligation's currency (Step 29)", async () => {
    const { service, buyer } = buildService([makeObligation()]);
    await expect(
      service.recordPayment(buyer, "11111111-1111-1111-1111-111111111111", {
        amount: 1000,
        currency: "USD",
        paymentMethod: "CASH" as never,
        idempotencyKey: "idem-1",
        paidAt: new Date(),
      }),
    ).rejects.toThrow(PaymentDomainError);
  });
});

describe("PaymentService — disputes and cancellation", () => {
  it("allows the buyer to mark an obligation disputed", async () => {
    const { service, buyer } = buildService([makeObligation()]);
    const result = await service.markDisputed(buyer, "11111111-1111-1111-1111-111111111111", "Quality mismatch after delivery");
    expect(result.status).toBe("DISPUTED");
  });

  it("never allows disputing a CANCELLED obligation (Step 4)", async () => {
    const { service, buyer } = buildService([makeObligation({ status: "CANCELLED" })]);
    await expect(service.markDisputed(buyer, "11111111-1111-1111-1111-111111111111", "reason")).rejects.toThrow(PaymentDomainError);
  });

  it("rejects cancellation attempted by a non-admin", async () => {
    const { service, buyer } = buildService([makeObligation()]);
    await expect(service.cancelObligation(buyer, "11111111-1111-1111-1111-111111111111", "duplicate obligation")).rejects.toThrow(AuthorizationError);
  });

  it("allows ADMIN to cancel a PENDING obligation", async () => {
    const { service, admin } = buildService([makeObligation()]);
    const result = await service.cancelObligation(admin, "11111111-1111-1111-1111-111111111111", "duplicate obligation");
    expect(result.status).toBe("CANCELLED");
  });

  it("never allows cancelling an obligation that is already PAID", async () => {
    const { service, admin } = buildService([makeObligation({ status: "PAID", amountPaid: 100000, amountDue: 0 })]);
    await expect(service.cancelObligation(admin, "11111111-1111-1111-1111-111111111111", "reason")).rejects.toThrow(PaymentDomainError);
  });
});

describe("PaymentService.get — derived OVERDUE", () => {
  it("advances a PENDING obligation past its due date into OVERDUE on read (Step 18)", async () => {
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { service, buyer } = buildService([makeObligation({ dueAt: pastDue })]);
    const result = await service.get(buyer, "11111111-1111-1111-1111-111111111111");
    expect(result.status).toBe("OVERDUE");
  });

  it("never marks a fully PAID obligation overdue even with a past due date", async () => {
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { service, buyer } = buildService([makeObligation({ dueAt: pastDue, status: "PAID", amountPaid: 100000, amountDue: 0 })]);
    const result = await service.get(buyer, "11111111-1111-1111-1111-111111111111");
    expect(result.status).toBe("PAID");
  });
});
