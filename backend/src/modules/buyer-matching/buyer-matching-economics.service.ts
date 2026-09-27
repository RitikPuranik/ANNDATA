import { QuantityUnit } from "@prisma/client";
import { NotFoundError, MarketDomainError } from "../../common/errors";
import { convertKgToQuantity, convertQuantityToKg } from "../fpo/unit-conversion";
import { MarketIntelligenceService } from "../market-intelligence/market-intelligence.service";
import { PriceForecastingService, ClientForecastScope } from "../price-forecasting/price-forecasting.service";
import { SellStoreOrchestrationService } from "../sell-vs-store/sell-store-orchestration.service";
import { NetRealizationOrchestrationService } from "../net-realization/net-realization-orchestration.service";
import { NetRealizationRequestOverrides } from "../net-realization/net-realization-input-resolver.types";
import { LogisticsCostEstimator } from "../logistics/logistics-cost-estimator";
import { RouteDistanceProvider } from "../logistics/route-distance.provider";
import {
  BuyerEconomics,
  ForecastContext,
  LotDecisionContext,
  MarketComparison,
  SellStoreContext,
} from "./buyer-matching-economics.types";

export interface LotEconomicsContext {
  lotPublicId: string;
  cropId: string;
  originState: string;
  originDistrict: string;
  originLat: number | null;
  originLon: number | null;
}

export interface BuyerOfferContext {
  demandTargetPrice: number | null;
  demandQuantityUnit: QuantityUnit;
  /** kg of the demand's requiredQuantity, already converted by the caller. */
  demandRequiredQuantityKg: number;
  buyerLat: number | null;
  buyerLon: number | null;
}

/**
 * Module 12 Enhancement — orchestration layer described in the build
 * spec's section 36 ("The buyer matcher is the orchestration layer. It
 * must NOT become the owner of every business rule."). This class calls
 * out to the authoritative modules and shapes their responses for the
 * buyer-matching API; it never recomputes what Modules 6/7/8/14/16
 * already compute.
 *
 * Every method degrades to an explicit UNAVAILABLE/INSUFFICIENT_DATA
 * status on any expected "no data" condition (NotFoundError,
 * MarketDomainError) rather than throwing — one buyer's or one lot's
 * missing market/forecast/storage data must never fail the whole
 * matches() response for every other buyer (build spec section 31).
 */
export class BuyerMatchingEconomicsService {
  constructor(
    private readonly netRealization: NetRealizationOrchestrationService,
    private readonly marketIntelligence: MarketIntelligenceService,
    private readonly priceForecasting: PriceForecastingService,
    private readonly sellStoreOrchestration: SellStoreOrchestrationService,
    private readonly logisticsCostEstimator: LogisticsCostEstimator,
    private readonly routeDistanceProvider: RouteDistanceProvider,
  ) {}

  /** Lot/crop-level context, resolved once per matches() call and shared
   * across every buyer in the response (build spec section 28 — market
   * data for the same crop/market is fetched once, not per buyer). */
  async lotContext(
    lot: LotEconomicsContext,
    requestingUser: { id: string; role: string },
  ): Promise<LotDecisionContext> {
    const [market, forecast, sellVsStore] = await Promise.all([
      this.marketComparison(lot, null),
      this.forecast(lot),
      this.sellStore(lot.lotPublicId, requestingUser.id),
    ]);
    return {
      market,
      forecast,
      sellVsStore,
      disclaimer:
        "Market prices, forecasts, and storage economics are informational and based on currently available " +
        "data. They do not guarantee any future price or sale outcome. You decide whether and to whom to sell.",
    };
  }

  /** Per-buyer economics: gross offer -> costs -> expected net
   * realization, entirely through Module 14. */
  async buyerEconomics(
    lot: LotEconomicsContext,
    offer: BuyerOfferContext,
    requestingUser: { id: string; role: string },
  ): Promise<BuyerEconomics> {
    if (offer.demandTargetPrice === null || offer.demandTargetPrice === undefined) {
      return { status: "UNAVAILABLE", reason: "Buyer has not specified a target price for this crop." };
    }

    const transportEstimate = this.estimateTransport(lot, offer);
    const transport = transportEstimate.status === "AVAILABLE" ? await transportEstimate.promise : null;

    try {
      const overrides: NetRealizationRequestOverrides = {
        salePricePerUnit: offer.demandTargetPrice,
        salePriceUnit: offer.demandQuantityUnit,
        saleQuantity: convertKgToQuantity(offer.demandRequiredQuantityKg, offer.demandQuantityUnit),
        saleQuantityUnit: offer.demandQuantityUnit,
        costs:
          transport && transport.status === "AVAILABLE" && transport.amount !== undefined
            ? [{ category: "TRANSPORT", amount: transport.amount, isIncludedInPrice: false }]
            : undefined,
      };

      const dto = await this.netRealization.calculate(lot.lotPublicId, overrides, requestingUser);

      const totalCosts =
        (dto.costs.totals.known ?? 0) + (dto.costs.totals.estimated ?? 0) + (dto.costs.totals.userProvided ?? 0);

      return {
        status: "AVAILABLE",
        offerPricePerUnit: offer.demandTargetPrice,
        priceUnit: dto.sale.priceUnit,
        quantity: dto.sale.quantity,
        quantityUnit: dto.sale.quantityUnit,
        grossValue: dto.sale.grossRevenue,
        costs: {
          included: dto.costs.included.map((c) => ({ category: c.category, name: c.name, amount: c.amount, source: c.source })),
          unavailable: dto.costs.unavailable,
        },
        totalCosts,
        expectedNetRealization: dto.result.netRealization,
        netRealizationPerUnit:
          dto.result.netRealization !== null && dto.sale.quantity ? round2(dto.result.netRealization / dto.sale.quantity) : null,
        netRealizationCompleteness: dto.result.completeness,
        hasOmittedCosts: dto.costs.unavailable.length > 0,
        netRealizationCalculationId: dto.publicId,
        detail: dto,
        transportEstimate: transport ?? undefined,
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        reason:
          error instanceof Error
            ? `Net realization could not be calculated: ${error.message}`
            : "Net realization could not be calculated.",
        transportEstimate: transport ?? undefined,
      };
    }
  }

  private estimateTransport(
    lot: LotEconomicsContext,
    offer: BuyerOfferContext,
  ): { status: "AVAILABLE"; promise: Promise<BuyerEconomics["transportEstimate"]> } | { status: "UNAVAILABLE" } {
    if (lot.originLat === null || lot.originLon === null || offer.buyerLat === null || offer.buyerLon === null) {
      return { status: "UNAVAILABLE" };
    }
    const origin = { latitude: lot.originLat, longitude: lot.originLon };
    const destination = { latitude: offer.buyerLat, longitude: offer.buyerLon };
    return {
      status: "AVAILABLE",
      promise: (async () => {
        try {
          const route = await this.routeDistanceProvider.estimateRoute(origin, destination);
          const breakdown = this.logisticsCostEstimator.estimate({
            distanceKm: route.distanceKm,
            requiresRefrigeration: false,
          });
          return {
            status: "AVAILABLE" as const,
            distanceKm: round2(route.distanceKm),
            amount: breakdown.totalCost,
            currency: breakdown.currency,
            isEstimated: true,
            sourceModule: "LOGISTICS" as const,
          };
        } catch {
          return { status: "UNAVAILABLE" as const, reason: "Transport cost could not be estimated." };
        }
      })(),
    };
  }

  private async marketComparison(lot: LotEconomicsContext, offerPricePerQuintal: number | null): Promise<MarketComparison> {
    try {
      const snapshot = await this.marketIntelligence.snapshot(lot.cropId, {
        state: lot.originState,
        district: lot.originDistrict,
      });
      const modal = snapshot.price.nationalAverage;
      const comparison: MarketComparison = {
        status: "AVAILABLE",
        marketModalPricePerQuintal: modal,
        trendDirection: snapshot.trend.direction,
        trendChangePercentage7d: snapshot.trend.changePercentage,
        dataFreshness: snapshot.dataQuality.freshness,
        lastUpdated: snapshot.dataQuality.lastUpdated,
      };
      if (offerPricePerQuintal !== null && modal) {
        comparison.offerVsMarketAbsolute = round2(offerPricePerQuintal - modal);
        comparison.offerVsMarketPercentage = modal !== 0 ? round2(((offerPricePerQuintal - modal) / modal) * 100) : null;
      }
      return comparison;
    } catch (error) {
      if (error instanceof MarketDomainError || error instanceof NotFoundError) {
        return { status: "UNAVAILABLE", reason: "Current market price data is unavailable for this crop/location." };
      }
      throw error;
    }
  }

  /** Public so the per-buyer caller can attach the offer-vs-market delta
   * once it knows the buyer's specific offer price (the lot-level
   * snapshot itself is still fetched only once per matches() call, via
   * lotContext() above; this only recomputes the cheap delta). */
  async offerVsMarket(lot: LotEconomicsContext, market: MarketComparison, offerPricePerQuintalEquivalent: number | null): Promise<MarketComparison> {
    if (market.status !== "AVAILABLE" || offerPricePerQuintalEquivalent === null || !market.marketModalPricePerQuintal) {
      return market;
    }
    const modal = market.marketModalPricePerQuintal;
    return {
      ...market,
      offerVsMarketAbsolute: round2(offerPricePerQuintalEquivalent - modal),
      offerVsMarketPercentage: modal !== 0 ? round2(((offerPricePerQuintalEquivalent - modal) / modal) * 100) : null,
    };
  }

  private async forecast(lot: LotEconomicsContext): Promise<ForecastContext> {
    const scopes: ClientForecastScope[] = [{ type: "REGIONAL", state: lot.originState }, { type: "CROP_WIDE" }];
    for (const scope of scopes) {
      try {
        const dto = await this.priceForecasting.findLatestForecast(lot.cropId, scope);
        if (dto.status === "INSUFFICIENT_DATA") {
          return { status: "INSUFFICIENT_DATA", reason: "Insufficient historical data to produce a reliable forecast." };
        }
        if (dto.status !== "COMPLETED" || !dto.prediction) {
          return { status: "UNAVAILABLE", reason: "No usable forecast is available for this crop." };
        }
        return {
          status: "AVAILABLE",
          forecastedPricePerQuintal: dto.prediction.predictedPrice,
          horizonDays: dto.horizonDays,
          targetDate: dto.prediction.targetDate,
          generatedAt: dto.createdAt,
          scope: scope.type,
          modelVersion: dto.metadata.modelVersion,
        };
      } catch (error) {
        if (error instanceof NotFoundError) continue;
        throw error;
      }
    }
    return { status: "UNAVAILABLE", reason: "No price forecast is available yet for this crop." };
  }

  private async sellStore(lotPublicId: string, requestedByUserId: string): Promise<SellStoreContext> {
    try {
      const decision = await this.sellStoreOrchestration.generateDecision(lotPublicId, requestedByUserId);
      return {
        status: "AVAILABLE",
        decision: decision.result ?? "INSUFFICIENT_DATA",
        confidenceScore: decision.confidenceScore,
        factorsUsed: decision.decisionMetadata?.factorsUsed as unknown as string[] | undefined,
        omittedFactors: decision.decisionMetadata?.omittedFactors as unknown as string[] | undefined,
        decisionPublicId: decision.publicId,
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        reason:
          error instanceof Error
            ? `Sell vs store analysis is unavailable: ${error.message}`
            : "Sell vs store analysis is unavailable.",
      };
    }
  }
}

/** Converts a price quoted per `unit` into an equivalent price per
 * quintal, so a buyer's offer (which may be quoted per KG/TON/etc.) can
 * be compared against Module 6's modal price, which is always
 * INR_PER_QUINTAL (see market-intelligence.service.ts). */
export function toPricePerQuintal(pricePerUnit: number, unit: QuantityUnit): number {
  const kgPerUnit = convertQuantityToKg(1, unit);
  if (!kgPerUnit) return pricePerUnit;
  return round2((pricePerUnit / kgPerUnit) * 100);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
