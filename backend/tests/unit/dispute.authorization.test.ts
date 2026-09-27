import { DisputeAuthorizationService } from "../../src/modules/disputes/dispute.authorization";
import { AuthenticatedUserContext } from "../../src/modules/auth/auth.types";
import { DisputeRecord } from "../../src/modules/disputes/dispute.types";

function user(role: AuthenticatedUserContext["role"], id = "user-1"): AuthenticatedUserContext {
  return { id, publicId: `pub-${id}`, role };
}

function dispute(overrides: Partial<DisputeRecord> = {}): DisputeRecord {
  return {
    id: "dispute-1",
    publicId: "pub-dispute-1",
    disputeNumber: "DSP-2026-000001",
    type: "QUALITY_DISPUTE",
    category: "TRANSACTION",
    title: "t",
    description: "d",
    status: "OPEN",
    priority: "MEDIUM",
    raisedByUserId: "farmer-user",
    raisedByRole: "FARMER",
    farmerId: "farmer-profile-A",
    buyerId: "buyer-profile-A",
    transporterId: null,
    lotId: null,
    tradeOfferId: null,
    shipmentId: null,
    deliveryId: null,
    paymentObligationId: null,
    ledgerEntryId: null,
    assignedToUserId: null,
    assignedAt: null,
    assignedByUserId: null,
    resolutionCode: null,
    resolutionSummary: null,
    requestedResolution: null,
    finalResolution: null,
    financialAdjustmentPaymentObligationId: null,
    financialAdjustmentLedgerEntryId: null,
    resolvedByUserId: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("DisputeAuthorizationService — IDOR protection (Step 22)", () => {
  const service = new DisputeAuthorizationService();

  it("ADMIN can always view any dispute", () => {
    expect(service.canView(user("ADMIN"), dispute(), null, null, null)).toBe(true);
  });

  it("the raiser can always view their own dispute", () => {
    expect(service.canView(user("FARMER", "farmer-user"), dispute(), "farmer-profile-A", null, null)).toBe(true);
  });

  it("Farmer A cannot access Farmer B's dispute", () => {
    const d = dispute({ raisedByUserId: "farmer-user-A", farmerId: "farmer-profile-A" });
    expect(service.canView(user("FARMER", "farmer-user-B"), d, "farmer-profile-B", null, null)).toBe(false);
  });

  it("Farmer cannot access an unrelated buyer-only dispute", () => {
    const d = dispute({ raisedByUserId: "buyer-user", farmerId: null, buyerId: "buyer-profile-A" });
    expect(service.canView(user("FARMER", "farmer-user-B"), d, "farmer-profile-B", null, null)).toBe(false);
  });

  it("Buyer cannot access an unrelated farmer's dispute", () => {
    const d = dispute({ raisedByUserId: "farmer-user", buyerId: null, farmerId: "farmer-profile-A" });
    expect(service.canView(user("BUYER", "buyer-user-2"), d, null, "buyer-profile-2", null)).toBe(false);
  });

  it("Transporter cannot access an unrelated shipment dispute", () => {
    const d = dispute({ raisedByUserId: "buyer-user", transporterId: "transporter-profile-A" });
    expect(service.canView(user("TRANSPORTER", "transporter-user-B"), d, null, null, "transporter-profile-B")).toBe(false);
  });

  it("the referenced buyer party CAN view a dispute they did not raise", () => {
    const d = dispute({ raisedByUserId: "farmer-user", farmerId: "farmer-profile-A", buyerId: "buyer-profile-A" });
    expect(service.canView(user("BUYER", "buyer-user"), d, null, "buyer-profile-A", null)).toBe(true);
  });

  it("only ADMIN may operate (assign/resolve/reject/internal notes)", () => {
    expect(() => service.assertCanOperate(user("ADMIN"))).not.toThrow();
    expect(() => service.assertCanOperate(user("FARMER"))).toThrow();
    expect(() => service.assertCanOperate(user("BUYER"))).toThrow();
  });

  it("assertCanCreateFor blocks a farmer referencing another farmer's profile", () => {
    expect(() =>
      service.assertCanCreateFor(user("FARMER"), "farmer-profile-B", null, null, "farmer-profile-A", null, null),
    ).toThrow();
  });

  it("assertCanCreateFor allows a farmer referencing their own profile", () => {
    expect(() =>
      service.assertCanCreateFor(user("FARMER"), "farmer-profile-A", null, null, "farmer-profile-A", null, null),
    ).not.toThrow();
  });

  it("assertCanCreateFor allows ADMIN to create on behalf of any party", () => {
    expect(() =>
      service.assertCanCreateFor(user("ADMIN"), null, null, null, "farmer-profile-A", "buyer-profile-A", null),
    ).not.toThrow();
  });

  it("assertCanComment rejects an unrelated party", () => {
    const d = dispute();
    expect(() => service.assertCanComment(user("BUYER", "other-buyer"), d, null, "buyer-profile-B", null)).toThrow();
  });
});
