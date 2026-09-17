import { DeliveryService } from "../../src/modules/deliveries/delivery.service";
import { ConflictError, DeliveryDomainError } from "../../src/common/errors";

/**
 * DeliveryService is exercised here with hand-built in-memory fakes for
 * every collaborator, the same dependency-injection shape app.ts wires up
 * for real — no database required. This covers what a DB-backed
 * integration test would (Step 31's "accept delivery" / "partially accept
 * delivery" / "reject delivery" / "accepted quantity race condition"
 * cases) without needing a live Postgres instance, which this sandbox
 * cannot provision (see the module's own limitations note).
 */

type FakeDelivery = {
  id: string;
  publicId: string;
  deliveryNumber: string;
  shipmentId: string;
  lotId: string;
  tradeOfferId: string | null;
  buyerId: string;
  expectedQuantityKg: number;
  deliveredQuantityKg: number | null;
  acceptedQuantityKg: number | null;
  rejectedQuantityKg: number | null;
  quantityUnit: "KG";
  status: string;
  receivedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  reconciledAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeDelivery(overrides: Partial<FakeDelivery> = {}): FakeDelivery {
  return {
    id: "delivery-1",
    publicId: "11111111-1111-1111-1111-111111111111",
    deliveryNumber: "DEL-2026-000001",
    shipmentId: "shipment-1",
    lotId: "lot-1",
    tradeOfferId: "offer-1",
    buyerId: "buyer-1",
    expectedQuantityKg: 1000,
    deliveredQuantityKg: 980,
    acceptedQuantityKg: null,
    rejectedQuantityKg: null,
    quantityUnit: "KG",
    status: "UNDER_INSPECTION",
    receivedAt: new Date(),
    acceptedAt: null,
    rejectedAt: null,
    reconciledAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService(initialDelivery: FakeDelivery) {
  const store = new Map<string, FakeDelivery>([[initialDelivery.id, { ...initialDelivery }]]);
  const reconciliationRows: unknown[] = [];
  const auditEvents: string[] = [];

  const deliveryRepository = {
    create: jest.fn(),
    findById: jest.fn(async (id: string) => store.get(id) ?? null),
    findByPublicId: jest.fn(async (publicId: string) => [...store.values()].find((d) => d.publicId === publicId) ?? null),
    findByShipmentId: jest.fn(),
    list: jest.fn(),
    transition: jest.fn(async (id: string, fromStatuses: string[], toStatus: string, extra: Record<string, unknown> = {}) => {
      const current = store.get(id);
      if (!current || !fromStatuses.includes(current.status)) return null;
      const updated = { ...current, status: toStatus, ...extra } as FakeDelivery;
      store.set(id, updated);
      return updated;
    }),
    updateQuantities: jest.fn(async (id: string, data: Record<string, unknown>) => {
      const current = store.get(id)!;
      const updated = { ...current, ...data };
      store.set(id, updated);
      return updated;
    }),
  };

  const weighmentRepository = { create: jest.fn(), findLatestByDeliveryId: jest.fn(async () => null), listByDeliveryId: jest.fn() };
  const qualityRepository = { create: jest.fn(), findLatestByDeliveryId: jest.fn(async () => null), listByDeliveryId: jest.fn() };
  const reconciliationRepository = {
    create: jest.fn(async (data: Record<string, unknown>) => {
      const row = { publicId: `recon-${reconciliationRows.length + 1}`, calculatedAt: new Date(), algorithmVersion: "v1", ...data };
      reconciliationRows.push(row);
      return row;
    }),
    findLatestByDeliveryId: jest.fn(async () => reconciliationRows[reconciliationRows.length - 1] ?? null),
    listByDeliveryId: jest.fn(async () => reconciliationRows),
  };
  const evidenceRepository = { create: jest.fn(), listByDeliveryId: jest.fn() };
  const shipmentRepository = { findByPublicId: jest.fn(), findById: jest.fn() } as never;
  const lotRepository = {
    findById: jest.fn(async () => ({ id: "lot-1", cropId: "crop-1", farmerId: "farmer-1", fpoId: null, ownerType: "FARMER" })),
    transition: jest.fn(async () => null),
    listByFarmerId: jest.fn(),
  } as never;
  const qualityStandardsRepository = { findByCropId: jest.fn(async () => []) } as never;
  const authorization = { assertCanOperate: jest.fn(), canView: jest.fn(async () => true) } as never;
  const farmerProfiles = {} as never;
  const transporterAuthorization = {} as never;
  const audit = { record: jest.fn(async (event: { action: string }) => void auditEvents.push(event.action)) };
  const prisma = {
    buyerProfile: { findUnique: jest.fn(async () => ({ id: "buyer-1" })) },
    tradeOffer: { findFirst: jest.fn(), findUnique: jest.fn() },
    cropLot: { findUnique: jest.fn() },
    shipment: { findUnique: jest.fn(), findMany: jest.fn() },
  } as never;

  const service = new DeliveryService(
    prisma,
    deliveryRepository as never,
    weighmentRepository as never,
    qualityRepository as never,
    reconciliationRepository as never,
    evidenceRepository as never,
    shipmentRepository,
    lotRepository,
    qualityStandardsRepository,
    authorization,
    farmerProfiles,
    transporterAuthorization,
    audit as never,
  );

  const user = { id: "user-1", role: "BUYER" } as never;
  return { service, store, auditEvents, user, reconciliationRows };
}

describe("DeliveryService — acceptance decisions", () => {
  it("fully accepts a delivery: transitions to RECONCILED, sets acceptedQuantity = deliveredQuantity", async () => {
    const { service, store, user } = buildService(makeDelivery());
    const result = await service.accept(user, "11111111-1111-1111-1111-111111111111");

    expect(result.status).toBe("RECONCILED");
    expect(result.acceptedQuantity).toBe(980);
    expect(result.rejectedQuantity).toBe(0);
    expect(store.get("delivery-1")!.acceptedAt).not.toBeNull();
    expect(store.get("delivery-1")!.reconciledAt).not.toBeNull();
  });

  it("records both DELIVERY_ACCEPTED and DELIVERY_RECONCILED audit events for a full acceptance", async () => {
    const { service, auditEvents, user } = buildService(makeDelivery());
    await service.accept(user, "11111111-1111-1111-1111-111111111111");
    expect(auditEvents).toContain("DELIVERY_ACCEPTED");
    expect(auditEvents).toContain("DELIVERY_RECONCILED");
  });

  it("rejects acceptance of a delivery with no recorded delivered quantity", async () => {
    const { service, user } = buildService(makeDelivery({ deliveredQuantityKg: null }));
    await expect(service.accept(user, "11111111-1111-1111-1111-111111111111")).rejects.toThrow(DeliveryDomainError);
  });

  it("prevents double acceptance (Step 17/27 concurrency): a second accept() on an already-decided delivery throws ConflictError", async () => {
    const { service, user } = buildService(makeDelivery());
    await service.accept(user, "11111111-1111-1111-1111-111111111111");
    await expect(service.accept(user, "11111111-1111-1111-1111-111111111111")).rejects.toThrow(ConflictError);
  });

  it("partially accepts a delivery: accepted + rejected always sum to the original delivered quantity, which is never overwritten", async () => {
    const { service, store, user } = buildService(makeDelivery({ deliveredQuantityKg: 980 }));
    const result = await service.partialAccept(user, "11111111-1111-1111-1111-111111111111", { acceptedQuantityKg: 950 });

    expect(result.status).toBe("RECONCILED");
    expect(result.acceptedQuantity).toBe(950);
    expect(result.rejectedQuantity).toBe(30);
    expect(store.get("delivery-1")!.deliveredQuantityKg).toBe(980);
  });

  it("rejects a partial-accept request whose accepted quantity exceeds delivered quantity (Step 17)", async () => {
    const { service, user } = buildService(makeDelivery({ deliveredQuantityKg: 980 }));
    await expect(
      service.partialAccept(user, "11111111-1111-1111-1111-111111111111", { acceptedQuantityKg: 1000 }),
    ).rejects.toThrow(DeliveryDomainError);
  });

  it("rejects a delivery in full, retaining the delivered quantity and recording the rejection reason (Step 19)", async () => {
    const { service, store, user } = buildService(makeDelivery({ deliveredQuantityKg: 700 }));
    const result = await service.reject(user, "11111111-1111-1111-1111-111111111111", "Moisture far above agreed threshold");

    expect(result.status).toBe("RECONCILED");
    expect(result.acceptedQuantity).toBe(0);
    expect(result.rejectedQuantity).toBe(700);
    expect(store.get("delivery-1")!.rejectionReason).toBe("Moisture far above agreed threshold");
    expect(store.get("delivery-1")!.deliveredQuantityKg).toBe(700);
  });

  it("never allows a decision on a delivery that isn't UNDER_INSPECTION yet", async () => {
    const { service, user } = buildService(makeDelivery({ status: "RECEIVED" }));
    await expect(service.accept(user, "11111111-1111-1111-1111-111111111111")).rejects.toThrow(ConflictError);
  });
});
