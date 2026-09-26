/**
 * Unit tests for BuyerMatchingEconomicsService — Module 12 Enhancement.
 *
 * Verifies:
 *  - never fabricates a net realization when the buyer has no target price
 *  - net realization is delegated to Module 14, never recomputed here
 *  - market/forecast/sell-store unavailability degrade to explicit
 *    UNAVAILABLE/INSUFFICIENT_DATA statuses, never thrown out of matches()
 *  - transport is only estimated when both origin and destination
 *    coordinates are known, and is clearly labeled as an estimate
 */
import { NotFoundError, MarketDomainError } from "../../src/common/errors";
import {
  BuyerMatchingEconomicsService,
  toPricePerQuintal,
} from "../../src/modules/buyer-matching/buyer-matching-economics.service";

const lot = {
  lotPublicId: "lot-pub-1",
  cropId: "crop-wheat",
  originState: "Madhya Pradesh",
  originDistrict: "Bhopal",
  originLat: 23.25,
  originLon: 77.4,
};

const user = { id: "user-1", role: "FARMER" };

function makeService(overrides: Partial<Record<string, any>> = {}) {
  const netRealization = { calculate: jest.fn() };
  const marketIntelligence = { snapshot: jest.fn() };
  const priceForecasting = { findLatestForecast: jest.fn() };
  const sellStoreOrchestration = { generateDecision: jest.fn() };
  const logisticsCostEstimator = { estimate: jest.fn().mockReturnValue({ totalCost: 2000, currency: "INR" }) };
  const routeDistanceProvider = { estimateRoute: jest.fn().mockResolvedValue({ distanceKm: 120, durationMinutes: 180, isEstimated: true }) };

  const service = new BuyerMatchingEconomicsService(
    (overrides.netRealization ?? netRealization) as any,
    (overrides.marketIntelligence ?? marketIntelligence) as any,
    (overrides.priceForecasting ?? priceForecasting) as any,
    (overrides.sellStoreOrchestration ?? sellStoreOrchestration) as any,
    (overrides.logisticsCostEstimator ?? logisticsCostEstimator) as any,
    (overrides.routeDistanceProvider ?? routeDistanceProvider) as any,
  );

  return { service, netRealization, marketIntelligence, priceForecasting, sellStoreOrchestration, logisticsCostEstimator, routeDistanceProvider };
}

describe("BuyerMatchingEconomicsService.buyerEconomics", () => {
  it("never fabricates a net realization when the buyer has no target price", async () => {
    const { service, netRealization } = makeService();
    const result = await service.buyerEconomics(
      lot,
      { demandTargetPrice: null, demandQuantityUnit: "QTL", demandRequiredQuantityKg: 10000, buyerLat: 22, buyerLon: 78 },
      user,
    );
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toMatch(/target price/i);
    expect(netRealization.calculate).not.toHaveBeenCalled();
  });

  it("delegates net realization to Module 14 and never recomputes it", async () => {
    const { service, netRealization } = makeService();
    netRealization.calculate.mockResolvedValue({
      publicId: "nr-pub-1",
      sale: { pricePerUnit: 300, priceUnit: "QTL", quantity: 100, quantityUnit: "QTL", grossRevenue: 30000 },
      costs: {
        included: [{ category: "TRANSPORT", amount: 2000, source: "USER_PROVIDED" }],
        unavailable: [{ category: "STORAGE", reason: "STORAGE_COST_UNAVAILABLE" }],
        totals: { known: 0, estimated: 0, userProvided: 2000 },
      },
      result: { netRealization: 28000, completeness: "PARTIAL", dataCompletenessScore: 80 },
    });

    const result = await service.buyerEconomics(
      lot,
      { demandTargetPrice: 300, demandQuantityUnit: "QTL", demandRequiredQuantityKg: 10000, buyerLat: 22, buyerLon: 78 },
      user,
    );

    expect(netRealization.calculate).toHaveBeenCalledTimes(1);
    const [lotPublicIdArg, overridesArg] = netRealization.calculate.mock.calls[0];
    expect(lotPublicIdArg).toBe("lot-pub-1");
    expect(overridesArg.salePricePerUnit).toBe(300);
    expect(overridesArg.costs?.[0]).toMatchObject({ category: "TRANSPORT", amount: 2000 });

    expect(result.status).toBe("AVAILABLE");
    expect(result.grossValue).toBe(30000);
    expect(result.expectedNetRealization).toBe(28000);
    expect(result.netRealizationPerUnit).toBe(280);
    expect(result.hasOmittedCosts).toBe(true);
    expect(result.netRealizationCalculationId).toBe("nr-pub-1");
  });

  it("does not estimate transport when either endpoint's coordinates are missing", async () => {
    const { service, netRealization, routeDistanceProvider } = makeService();
    netRealization.calculate.mockResolvedValue({
      publicId: "nr-pub-2",
      sale: { pricePerUnit: 300, priceUnit: "QTL", quantity: 100, quantityUnit: "QTL", grossRevenue: 30000 },
      costs: { included: [], unavailable: [{ category: "TRANSPORT", reason: "TRANSPORT_COST_UNAVAILABLE" }], totals: { known: 0, estimated: 0, userProvided: 0 } },
      result: { netRealization: 30000, completeness: "PARTIAL", dataCompletenessScore: 70 },
    });

    const result = await service.buyerEconomics(
      lot,
      { demandTargetPrice: 300, demandQuantityUnit: "QTL", demandRequiredQuantityKg: 10000, buyerLat: null, buyerLon: null },
      user,
    );

    expect(routeDistanceProvider.estimateRoute).not.toHaveBeenCalled();
    expect(result.transportEstimate).toBeUndefined();
    const [, overridesArg] = netRealization.calculate.mock.calls[0];
    expect(overridesArg.costs).toBeUndefined();
  });

  it("reports UNAVAILABLE, not a thrown error, when Module 14 fails", async () => {
    const { service, netRealization } = makeService();
    netRealization.calculate.mockRejectedValue(new Error("boom"));
    const result = await service.buyerEconomics(
      lot,
      { demandTargetPrice: 300, demandQuantityUnit: "QTL", demandRequiredQuantityKg: 10000, buyerLat: null, buyerLon: null },
      user,
    );
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toMatch(/boom/);
  });
});

describe("BuyerMatchingEconomicsService.lotContext", () => {
  it("reports market data as UNAVAILABLE (not thrown) when Module 6 has none", async () => {
    const { service, marketIntelligence, priceForecasting, sellStoreOrchestration } = makeService();
    marketIntelligence.snapshot.mockRejectedValue(new MarketDomainError("Price data is unavailable.", "INSUFFICIENT_MARKET_DATA"));
    priceForecasting.findLatestForecast.mockRejectedValue(new NotFoundError("No forecast."));
    sellStoreOrchestration.generateDecision.mockResolvedValue({
      publicId: "decision-1",
      result: "SELL_NOW",
      confidenceScore: 72,
      decisionMetadata: { factorsUsed: ["CURRENT_MARKET_PRICE"], omittedFactors: ["FORECAST"] },
    });

    const ctx = await service.lotContext(lot, user);
    expect(ctx.market.status).toBe("UNAVAILABLE");
    expect(ctx.forecast.status).toBe("UNAVAILABLE");
    expect(ctx.sellVsStore.status).toBe("AVAILABLE");
    expect(ctx.sellVsStore.decision).toBe("SELL_NOW");
  });

  it("computes offer-vs-market once real market data exists", async () => {
    const { service, marketIntelligence, priceForecasting, sellStoreOrchestration } = makeService();
    marketIntelligence.snapshot.mockResolvedValue({
      price: { nationalAverage: 285 },
      trend: { direction: "INCREASING", changePercentage: 3.2, period: "7D" },
      dataQuality: { freshness: "FRESH", lastUpdated: "2026-09-20T00:00:00.000Z" },
    });
    priceForecasting.findLatestForecast.mockRejectedValue(new NotFoundError("No forecast."));
    sellStoreOrchestration.generateDecision.mockResolvedValue({
      publicId: "decision-1",
      result: "SELL_NOW",
      confidenceScore: 72,
      decisionMetadata: { factorsUsed: [], omittedFactors: [] },
    });
    const ctx = await service.lotContext(lot, user);
    expect(ctx.market.status).toBe("AVAILABLE");
    expect(ctx.market.marketModalPricePerQuintal).toBe(285);
  });

  it("never treats a Sell vs Store failure as a matching failure", async () => {
    const { service, marketIntelligence, priceForecasting, sellStoreOrchestration } = makeService();
    marketIntelligence.snapshot.mockResolvedValue({
      price: { nationalAverage: 285 },
      trend: { direction: "STABLE", changePercentage: 0, period: "7D" },
      dataQuality: { freshness: "FRESH", lastUpdated: "2026-09-20T00:00:00.000Z" },
    });
    priceForecasting.findLatestForecast.mockRejectedValue(new NotFoundError("No forecast."));
    sellStoreOrchestration.generateDecision.mockRejectedValue(new Error("db down"));
    const ctx = await service.lotContext(lot, user);
    expect(ctx.sellVsStore.status).toBe("UNAVAILABLE");
    expect(ctx.sellVsStore.reason).toMatch(/db down/);
  });
});

describe("toPricePerQuintal", () => {
  it("passes a quintal-denominated price through unchanged", () => {
    expect(toPricePerQuintal(300, "QTL")).toBe(300);
  });

  it("converts a KG-denominated price to its quintal equivalent", () => {
    expect(toPricePerQuintal(3, "KG")).toBe(300);
  });
});
