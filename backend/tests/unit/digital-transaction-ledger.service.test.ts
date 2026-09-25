import { DigitalTransactionLedgerService } from "../../src/modules/ledger/digital-transaction-ledger.service";
import { LedgerAuthorizationService } from "../../src/modules/ledger/digital-transaction-ledger.authorization";
import { AuthorizationError, LedgerDomainError, NotFoundError } from "../../src/common/errors";

/**
 * Same in-memory-fake convention as tests/unit/payment.service.test.ts
 * (see that file's own header comment for why: this build sandbox can't
 * fetch the Prisma engine binary, so the real repository/service classes
 * are exercised against hand-built fakes rather than a live database —
 * *.db.test.ts files exist for genuine concurrency/transaction coverage
 * once a real DATABASE_URL is available, per jest.config.js).
 */

type FakeRow = {
  id: string;
  publicId: string;
  transactionId: string;
  tradeId: string | null;
  lotId: string | null;
  farmerId: string | null;
  buyerId: string | null;
  eventType: string;
  direction: string;
  amount: number;
  currency: string;
  sourceModule: string;
  sourceEntityId: string | null;
  sourceEventId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  reversalOfEntryId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
};

const DELIVERY_ID = "delivery-1";

function buildService() {
  const rows: FakeRow[] = [];
  let seq = 0;
  const auditEvents: string[] = [];

  function keyOf(r: Pick<FakeRow, "sourceModule" | "sourceEntityId" | "sourceEventId" | "eventType">) {
    return `${r.sourceModule}::${r.sourceEntityId}::${r.sourceEventId}::${r.eventType}`;
  }

  const ledgerRepo = {
    create: jest.fn(async (data: Omit<FakeRow, "id" | "publicId" | "createdAt">) => {
      const existing = rows.find((r) => keyOf(r) === keyOf(data));
      if (existing) return { entry: existing, deduped: true };
      seq += 1;
      const row: FakeRow = { ...data, id: `entry-${seq}`, publicId: `entry-${seq}`, createdAt: new Date() };
      rows.push(row);
      return { entry: row, deduped: false };
    }),
    createMany: jest.fn(),
    findById: jest.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
    findByPublicId: jest.fn(async (publicId: string) => rows.find((r) => r.publicId === publicId) ?? null),
    findExisting: jest.fn(async (sourceModule: string, sourceEntityId: string | null, sourceEventId: string | null, eventType: string) =>
      rows.find((r) => keyOf(r) === keyOf({ sourceModule, sourceEntityId, sourceEventId, eventType } as never)) ?? null,
    ),
    findReversalsOf: jest.fn(async (entryId: string) => rows.filter((r) => r.reversalOfEntryId === entryId)),
    listByTransactionId: jest.fn(async (transactionId: string) =>
      rows.filter((r) => r.transactionId === transactionId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)),
    ),
    list: jest.fn(async (filters: { farmerId?: string; buyerId?: string; page: number; limit: number }) => {
      const items = rows.filter((r) => (filters.farmerId ? r.farmerId === filters.farmerId : true) && (filters.buyerId ? r.buyerId === filters.buyerId : true));
      return { items, total: items.length };
    }),
  };

  const fpoAuthorization = { canManageFpo: jest.fn(async () => false) } as never;
  const authorization = new LedgerAuthorizationService(fpoAuthorization);

  const audit = { record: jest.fn(async (event: { action: string }) => void auditEvents.push(event.action)) };

  const prisma = {
    paymentObligation: {
      findUnique: jest.fn(async ({ where: { deliveryId } }: { where: { deliveryId: string } }) =>
        deliveryId === DELIVERY_ID
          ? {
              id: "obligation-1",
              deliveryId: DELIVERY_ID,
              currency: "INR",
              grossAmount: 12500,
              amountPaid: 5000,
              amountDue: 7500,
              status: "PARTIALLY_PAID",
            }
          : null,
      ),
    },
    buyerProfile: { findUnique: jest.fn(async () => ({ id: "buyer-1" })) },
    farmerProfile: {
      findUnique: jest.fn(async ({ where: { userId } }: { where: { userId: string } }) =>
        userId === "farmer-user-1" ? { id: "farmer-1" } : userId === "farmer-user-2" ? { id: "farmer-2" } : null,
      ),
    },
  } as never;

  const service = new DigitalTransactionLedgerService(prisma, ledgerRepo as never, authorization, audit as never);

  const admin = { id: "admin-user-1", role: "ADMIN" } as never;
  const farmer = { id: "farmer-user-1", role: "FARMER" } as never;
  const otherFarmer = { id: "farmer-user-2", role: "FARMER" } as never;
  const buyer = { id: "buyer-user-1", role: "BUYER" } as never;

  return { service, rows, auditEvents, admin, farmer, otherFarmer, buyer };
}

function baseHandoff(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    paymentObligationId: "obligation-1",
    paymentRecordId: "record-1",
    deliveryId: DELIVERY_ID,
    buyerId: "buyer-1",
    sellerFarmerId: "farmer-1",
    sellerFpoId: null,
    payableAmount: 12500,
    paymentAmount: 5000,
    currency: "INR",
    paymentTimestamp: new Date().toISOString(),
    paymentStatus: "PARTIALLY_PAID",
    externalReference: null,
    ...overrides,
  } as never;
}

describe("DigitalTransactionLedgerService.recordPaymentEvent", () => {
  it("records a PAYMENT_OBLIGATION_CREATED entry as a CREDIT for the payable amount", async () => {
    const { service, rows } = buildService();
    const entry = await service.recordPaymentEvent(baseHandoff({ paymentAmount: 0 }), "PAYMENT_OBLIGATION_CREATED", "admin-user-1");
    expect(entry.direction).toBe("CREDIT");
    expect(entry.amount).toBe(12500);
    expect(entry.transactionId).toBe(DELIVERY_ID);
    expect(entry.sourceModule).toBe("MODULE_19_PAYMENT");
    expect(rows).toHaveLength(1);
  });

  it("is idempotent: replaying the same paymentRecordId/eventType never creates a second row (Step 'Idempotency')", async () => {
    const { service, rows } = buildService();
    await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", "admin-user-1");
    await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", "admin-user-1");
    expect(rows).toHaveLength(1);
  });

  it("rejects a negative amount", async () => {
    const { service } = buildService();
    await expect(service.recordPaymentEvent(baseHandoff({ paymentAmount: -5 }), "PARTIAL_PAYMENT", "admin-user-1")).rejects.toBeInstanceOf(
      LedgerDomainError,
    );
  });
});

describe("DigitalTransactionLedgerService.recordNetRealizationSnapshot", () => {
  it("preserves the exact figures handed off from Module 14, never recalculating them", async () => {
    const { service, rows } = buildService();
    const entry = await service.recordNetRealizationSnapshot(
      {
        transactionId: DELIVERY_ID,
        tradeId: "trade-1",
        lotId: "lot-1",
        farmerId: "farmer-1",
        buyerId: "buyer-1",
        currency: "INR",
        netRealizationCalculationId: "calc-1",
        grossRevenue: 100000,
        totalKnownCosts: 3000,
        totalEstimatedCosts: 1000,
        totalUserProvidedCosts: 1000,
        totalDeductions: 5000,
        netRealization: 95000,
      },
      "admin-user-1",
    );
    expect(entry.amount).toBe(95000);
    expect((rows[0].metadata as { grossRevenue: number }).grossRevenue).toBe(100000);
  });

  it("refuses to fabricate a value when Module 14 has not resolved net realization yet (Step 'No Fabricated Values')", async () => {
    const { service } = buildService();
    await expect(
      service.recordNetRealizationSnapshot(
        {
          transactionId: DELIVERY_ID,
          tradeId: null,
          lotId: "lot-1",
          farmerId: "farmer-1",
          buyerId: "buyer-1",
          currency: "INR",
          netRealizationCalculationId: "calc-1",
          grossRevenue: null,
          totalKnownCosts: null,
          totalEstimatedCosts: null,
          totalUserProvidedCosts: null,
          totalDeductions: null,
          netRealization: null,
        },
        "admin-user-1",
      ),
    ).rejects.toBeInstanceOf(LedgerDomainError);
  });
});

describe("DigitalTransactionLedgerService.createReversal", () => {
  it("creates a compensating REVERSAL entry rather than mutating the original (Step 'Append Only')", async () => {
    const { service, admin } = buildService();
    const original = await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", admin.id);
    const reversal = await service.createReversal(admin, original.publicId, { reason: "Duplicate payment reversed" });
    expect(reversal.eventType).toBe("REVERSAL");
    expect(reversal.reversalOfEntryId).toBe(original.id);
    expect(reversal.direction).toBe("CREDIT"); // opposite of the DEBIT it reverses
    expect(reversal.amount).toBe(original.amount);
  });

  it("rejects reversing an already-reversed entry (Step 'double reversal protection')", async () => {
    const { service, admin } = buildService();
    const original = await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", admin.id);
    await service.createReversal(admin, original.publicId, { reason: "First reversal" });
    await expect(service.createReversal(admin, original.publicId, { reason: "Second reversal" })).rejects.toBeInstanceOf(LedgerDomainError);
  });

  it("rejects reversing a reversal", async () => {
    const { service, admin } = buildService();
    const original = await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", admin.id);
    const reversal = await service.createReversal(admin, original.publicId, { reason: "Reverse it" });
    await expect(service.createReversal(admin, reversal.publicId, { reason: "Reverse the reversal" })).rejects.toBeInstanceOf(LedgerDomainError);
  });

  it("rejects a reversal from a non-admin", async () => {
    const { service, admin, farmer } = buildService();
    const original = await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", admin.id);
    await expect(service.createReversal(farmer, original.publicId, { reason: "Not allowed" })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("throws NotFoundError for a nonexistent entry", async () => {
    const { service, admin } = buildService();
    await expect(service.createReversal(admin, "does-not-exist", { reason: "n/a" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("DigitalTransactionLedgerService.createManualAdjustment", () => {
  it("requires an admin and a non-empty reason", async () => {
    const { service, farmer } = buildService();
    await expect(
      service.createManualAdjustment(farmer, { transactionId: DELIVERY_ID, amount: -500, currency: "INR", reason: "Weighment correction" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("records a signed amount as CREDIT/DEBIT and never as zero", async () => {
    const { service, admin } = buildService();
    await expect(
      service.createManualAdjustment(admin, { transactionId: DELIVERY_ID, amount: 0, currency: "INR", reason: "Zero not allowed" }),
    ).rejects.toBeInstanceOf(LedgerDomainError);

    const entry = await service.createManualAdjustment(admin, {
      transactionId: DELIVERY_ID,
      amount: -500,
      currency: "INR",
      reason: "Verified weighment correction",
    });
    expect(entry.direction).toBe("DEBIT");
    expect(entry.amount).toBe(500);
    expect(entry.eventType).toBe("MANUAL_ADJUSTMENT");
  });
});

describe("DigitalTransactionLedgerService authorization on reads", () => {
  it("lets a farmer view only their own transaction ledger", async () => {
    const { service, admin, farmer, otherFarmer } = buildService();
    await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", admin.id);

    const seen = await service.getTransactionLedger(farmer, DELIVERY_ID);
    expect(seen).toHaveLength(1);

    await expect(service.getTransactionLedger(otherFarmer, DELIVERY_ID)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lets the buyer view the transaction summary, sourced from Module 19's obligation", async () => {
    const { service, admin, buyer } = buildService();
    await service.recordPaymentEvent(baseHandoff(), "PARTIAL_PAYMENT", admin.id);

    const summary = await service.getTransactionSummary(buyer, DELIVERY_ID);
    expect(summary.amountPaid).toBe(5000);
    expect(summary.amountOutstanding).toBe(7500);
    expect(summary.status).toBe("PARTIALLY_PAID");
    expect(summary.entries).toHaveLength(1);
  });
});
