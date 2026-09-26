import { QuantityUnit } from "@prisma/client";
import { NetRealizationDTO } from "../net-realization/net-realization.types";

/**
 * Module 12 Enhancement — Smart Buyer Matching + Net Realization + Market
 * Trend Decision Support.
 *
 * These types describe the additive fields the buyer matcher now attaches
 * to each match (and to the lot as a whole). Nothing here replaces the
 * existing MatchResult shape from matching.ts — see buyer-matching.service.ts
 * `matches()`, which spreads these alongside the original fields so
 * existing consumers of `matchScore`/`factorsUsed`/etc. keep working
 * unchanged (build spec section 32).
 *
 * Every block below always resolves to a concrete `status`. Nothing is
 * ever silently defaulted to zero/guaranteed — an unavailable input is
 * always reported as such, with a human-readable `reason` (build spec
 * section 4/17/31).
 */

export type EconomicsAvailability = "AVAILABLE" | "UNAVAILABLE";
export type ForecastAvailability = "AVAILABLE" | "UNAVAILABLE" | "INSUFFICIENT_DATA";

/** The buyer-specific financial picture: gross offer -> costs -> expected
 * net realization. Always computed through Module 14's own Decimal-safe
 * engine (NetRealizationOrchestrationService) — never a second net
 * realization calculator (build spec section 5/14/23/29). */
export interface BuyerEconomics {
  status: EconomicsAvailability;
  /** Populated only when status is UNAVAILABLE — e.g. the buyer has not
   * specified a target price, so no gross/net figures can be honestly
   * shown for them. */
  reason?: string;

  offerPricePerUnit?: number;
  priceUnit?: QuantityUnit | null;
  quantity?: number | null;
  quantityUnit?: QuantityUnit | null;

  grossValue?: number | null;

  costs?: {
    included: Array<{ category: string; name?: string; amount: number; source: string }>;
    unavailable: Array<{ category: string; reason: string }>;
  };
  totalCosts?: number | null;

  expectedNetRealization?: number | null;
  netRealizationPerUnit?: number | null;
  netRealizationCompleteness?: string | null;

  /** True when at least one applicable cost category could not be
   * resolved from any real source — the farmer should read this offer's
   * `expectedNetRealization` as a floor/ceiling, not a final number. */
  hasOmittedCosts?: boolean;

  /** Reference to Module 14's own persisted calculation, so the farmer
   * (or a later audit) can pull up the exact same calculation again via
   * GET /api/net-realization/:publicId. */
  netRealizationCalculationId?: string;

  /** Module 14's own full DTO, kept verbatim for anyone who needs the
   * complete reasoning/provenance behind the numbers above (build spec
   * section 8/16). Flattened fields above exist purely for UI convenience. */
  detail?: NetRealizationDTO;

  /** Populated only when a road-distance transport estimate (Module 16's
   * LogisticsCostEstimator + RouteDistanceProvider) was computed and fed
   * into Module 14 as a cost override for this buyer's destination. This
   * is an ESTIMATE, not a firm transporter quote — see `isEstimated`. */
  transportEstimate?: {
    status: EconomicsAvailability;
    reason?: string;
    distanceKm?: number;
    amount?: number;
    currency?: string;
    isEstimated?: boolean;
    sourceModule?: "LOGISTICS";
  };
}

/** Buyer offer vs current market price for the crop, sourced entirely
 * from Module 6 Market Intelligence (build spec section 7/21). */
export interface MarketComparison {
  status: EconomicsAvailability;
  reason?: string;
  marketModalPricePerQuintal?: number;
  offerVsMarketAbsolute?: number;
  offerVsMarketPercentage?: number | null;
  trendDirection?: string;
  trendChangePercentage7d?: number | null;
  dataFreshness?: string | null;
  lastUpdated?: string;
}

/** Module 7 Price Forecasting context for the lot's crop — never
 * generated on the fly during a matching read; only ever a lookup of an
 * already-computed forecast (build spec section 9/20). */
export interface ForecastContext {
  status: ForecastAvailability;
  reason?: string;
  forecastedPricePerQuintal?: number;
  horizonDays?: number;
  targetDate?: string;
  generatedAt?: string;
  scope?: string;
  modelVersion?: string;
}

/** Module 8's Sell vs Store decision for the lot, computed once per
 * matching request (not once per buyer — this is a lot-level, not
 * buyer-level, question) and passed through unmodified (build spec
 * section 10/19). */
export interface SellStoreContext {
  status: EconomicsAvailability;
  reason?: string;
  decision?: "SELL_NOW" | "STORE" | "INSUFFICIENT_DATA";
  confidenceScore?: number | null;
  factorsUsed?: string[];
  omittedFactors?: string[];
  decisionPublicId?: string;
}

/** Attached once, at the top level of the matches() response — shared
 * lot/crop-level context every buyer's economics can be read against. */
export interface LotDecisionContext {
  market: MarketComparison;
  forecast: ForecastContext;
  sellVsStore: SellStoreContext;
  disclaimer: string;
}
