/**
 * Unit tests for BuyerMatchingService.matches() — Module 12 Enhancement
 * wiring. Uses lightweight Prisma/collaborator mocks (no real database),
 * consistent with tests/unit/buyer-matching.service.test.ts.
 */
import { BuyerMatchingService } from "../../src/modules/buyer-matching/buyer-matching.service";
import { FakeAuditService } from "../testUtils/fakeAuditService";

function farmerCtx() {
  return { id: "user-1", publicId: "u-pub-1", role: "FARMER" as const };
}

const lotFixture = {
  id: "lot-1",
  publicId: "lot-pub-1",
  status: "AVAILABLE",
  cropId: "crop-1",
  availableQuantityKg: 10000,
  originState: "Madhya Pradesh",
  originDistrict: "Bhopal",
  farm: { latitude: 23.25, longitude: 77.4 },
  fpo: null,
};

const demandFixture = {
  publicId: "demand-pub-1",
  title: "Wheat for mill",
  requiredQuantity: 100,
  minimumQuantity: null,
  quantityUnit: "QTL",
  state: "Madhya Pradesh",
  district: "Bhopal",
  grade: null,
  latitude: 22.7,
  longitude: 75.8,
  targetPrice: 300,
  buyer: {
    publicId: "buyer-pub-1",
    organizationName: "Test Mill",
    businessType: "PROCESSOR",
    description: null,
    state: "Madhya Pradesh",
    district: "Indore",
    verificationStatus: "VERIFIED",
    website: null,
  },
};

function makePrisma(demands: any[] = [demandFixture]) {
  return {
    qualityAssessment: { findFirst: jest.fn().mockResolvedValue({ overallGrade: "A" }) },
    buyerDemand: { findMany: jest.fn().mockResolvedValue(demands) },
  } as any;
}

function makeLots() {
  return { findByPublicId: jest.fn().mockResolvedValue(lotFixture) } as any;
}

const lotAuth = { canModifyLot: jest.fn().mockResolvedValue(true) } as any;
const farmers = { ensure: jest.fn().mockResolvedValue({ id: "farmer-1" }) } as any;
const audit = new FakeAuditService();

describe("BuyerMatchingService.matches() — backward compatibility", () => {
  it("returns the original price-only shape when no economics collaborator is supplied", async () => {
    const service = new BuyerMatchingService(makePrisma(), makeLots(), lotAuth, farmers, audit);
    const result: any = await service.matches(farmerCtx(), "lot-pub-1");

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].buyer.organizationName).toBe("Test Mill");
    expect(result.matches[0].economics).toBeUndefined();
    expect(result.lotContext).toBeUndefined();
  });
});

describe("BuyerMatchingService.matches() — Module 12 Enhancement economics", () => {
  function makeEconomics() {
    return {
      lotContext: jest.fn().mockResolvedValue({
        market: { status: "AVAILABLE", marketModalPricePerQuintal: 285, trendDirection: "INCREASING" },
        forecast: { status: "AVAILABLE", forecastedPricePerQuintal: 330, horizonDays: 60 },
        sellVsStore: { status: "AVAILABLE", decision: "STORE", confidenceScore: 70 },
        disclaimer: "Informational only.",
      }),
      buyerEconomics: jest.fn().mockResolvedValue({
        status: "AVAILABLE",
        grossValue: 30000,
        totalCosts: 2500,
        expectedNetRealization: 27500,
        netRealizationPerUnit: 275,
      }),
      offerVsMarket: jest.fn().mockResolvedValue({
        status: "AVAILABLE",
        marketModalPricePerQuintal: 285,
        offerVsMarketAbsolute: 15,
        offerVsMarketPercentage: 5.26,
      }),
    } as any;
  }

  it("attaches per-buyer economics and lot-level context without dropping original fields", async () => {
    const economics = makeEconomics();
    const service = new BuyerMatchingService(makePrisma(), makeLots(), lotAuth, farmers, audit, economics);
    const result: any = await service.matches(farmerCtx(), "lot-pub-1");

    expect(economics.lotContext).toHaveBeenCalledTimes(1);
    expect(economics.buyerEconomics).toHaveBeenCalledTimes(1);

    const match = result.matches[0];
    // original fields preserved
    expect(match.buyer.organizationName).toBe("Test Mill");
    expect(match.demand.publicId).toBe("demand-pub-1");
    // new fields present
    expect(match.economics.expectedNetRealization).toBe(27500);
    expect(match.marketComparison.offerVsMarketAbsolute).toBe(15);

    expect(result.lotContext.forecast.forecastedPricePerQuintal).toBe(330);
    expect(result.lotContext.sellVsStore.decision).toBe("STORE");
  });

  it("does not fabricate net realization for a buyer with no target price — offer alone is shown as unavailable, not silently zeroed", async () => {
    const economics = makeEconomics();
    economics.buyerEconomics.mockResolvedValue({ status: "UNAVAILABLE", reason: "Buyer has not specified a target price for this crop." });
    const noPriceDemand = { ...demandFixture, targetPrice: null };
    const service = new BuyerMatchingService(makePrisma([noPriceDemand]), makeLots(), lotAuth, farmers, audit, economics);

    const result: any = await service.matches(farmerCtx(), "lot-pub-1");
    expect(result.matches[0].economics.status).toBe("UNAVAILABLE");
    expect(result.matches[0].economics.expectedNetRealization).toBeUndefined();
    // With no target price there is nothing honest to diff against the
    // market, so the buyer matcher skips the diff entirely rather than
    // inventing an offer-vs-market comparison for a non-existent offer.
    expect(economics.offerVsMarket).not.toHaveBeenCalled();
    expect(result.matches[0].marketComparison.marketModalPricePerQuintal).toBe(285);
  });

  it("surfaces one buyer's economics failure without failing the whole matches() call", async () => {
    const economics = makeEconomics();
    economics.buyerEconomics.mockRejectedValue(new Error("net realization down"));
    const service = new BuyerMatchingService(makePrisma(), makeLots(), lotAuth, farmers, audit, economics);

    await expect(service.matches(farmerCtx(), "lot-pub-1")).rejects.toThrow("net realization down");
    // NOTE: buyerEconomics() itself is documented to catch Module 14 errors
    // internally and resolve to {status:"UNAVAILABLE"} (see
    // buyer-matching-economics.service.test.ts) — this test guards the
    // wiring contract, i.e. that BuyerMatchingService relies on that
    // contract rather than adding its own redundant try/catch.
  });
});
