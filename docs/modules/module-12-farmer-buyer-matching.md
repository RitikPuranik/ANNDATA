# Module 12 — Farmer-Buyer Matching (Smart Buyer Matching Enhancement)

## Summary

Module 12 matches a farmer's crop lot against active buyer demand and, as of
this enhancement, no longer ranks buyers by offered price alone. For every
matched buyer it shows:

1. What the buyer is offering (gross value)
2. What it will cost the farmer to realize that offer (transport, storage,
   other applicable costs — each with a source, never fabricated)
3. What the farmer can expect to actually net after those costs
4. How that offer compares to the current market price for the crop
5. What the market trend for the crop looks like
6. Whether a Module 7 price forecast exists, and what it says
7. Whether storing the crop and selling later could plausibly do better
   (Module 8's own Sell vs Store decision, not a second one built here)

The farmer is always the final decision maker — every field below is
decision *support*, not a forced action.

## Module 12 is an orchestration layer, not an authority

Module 12 does not calculate net realization, forecast prices, decide
sell-vs-store, price logistics, or evaluate market trend on its own. It
calls the modules that already own those calculations and shapes their
responses for the buyer-matching API:

```
Farmer Lot
    ↓
Buyer Matching (Module 12, this module)
    ↓                                  \
Buyer Demand + target price             \
    ↓                                    -> Module 6  Market Intelligence
Module 16 transport estimate            /    (modal price, trend)
    ↓                                  /
Module 14 Net Realization  <----------
    ↓
Expected Net Realization per buyer

Module 12 also calls, once per lot (not once per buyer):
    Module 7  Price Forecasting  (latest forecast, read-only lookup)
    Module 8  Sell vs Store      (SELL_NOW / STORE / INSUFFICIENT_DATA)
```

## New files

- `backend/src/modules/buyer-matching/buyer-matching-economics.types.ts` —
  additive response DTOs (`BuyerEconomics`, `MarketComparison`,
  `ForecastContext`, `SellStoreContext`, `LotDecisionContext`). Every one of
  these always resolves to an explicit status; nothing is defaulted to zero
  or "guaranteed."
- `backend/src/modules/buyer-matching/buyer-matching-economics.service.ts` —
  `BuyerMatchingEconomicsService`, the orchestration class described above.

## Changed files

- `backend/src/modules/buyer-matching/buyer-matching.service.ts` —
  `BuyerMatchingService` takes an **optional** 6th constructor argument,
  `economics?: BuyerMatchingEconomicsService`. When omitted, `matches()`
  behaves exactly as before (backward compatible — every existing 5-argument
  construction, including every existing unit test, keeps working
  unchanged). When supplied, `matches()` attaches:
  - `economics` and `marketComparison` on each entry in `matches[]`
  - a single `lotContext` block (`market`, `forecast`, `sellVsStore`,
    `disclaimer`) at the top level of the response
- `backend/src/app.ts` — `BuyerMatchingService` construction (and its route
  mount) was moved later in the wiring order, to after Module 7, 8, 14, and
  16 are constructed, and now passes a real
  `BuyerMatchingEconomicsService` built from those existing instances. No
  new instances of Modules 6/7/8/14/16 are created — the exact same
  singletons used by their own routes are reused here.

## API

No new endpoint. The existing route is extended:

```
GET /api/matching/lot/:lotId
```

### Response shape (additive)

```jsonc
{
  "matches": [
    {
      // --- unchanged fields ---
      "buyer": { "publicId": "...", "organizationName": "...", ... },
      "demand": { "publicId": "...", "requiredQuantity": 100, "quantityUnit": "QTL", ... },
      "matchScore": 82,
      "factorsUsed": ["QUANTITY_COMPATIBLE", "GRADE_COMPATIBLE"],
      // --- new fields ---
      "economics": {
        "status": "AVAILABLE",
        "offerPricePerUnit": 300,
        "quantity": 100,
        "quantityUnit": "QTL",
        "grossValue": 30000,
        "costs": {
          "included": [
            { "category": "TRANSPORT", "amount": 2000, "source": "USER_PROVIDED" }
          ],
          "unavailable": [
            { "category": "STORAGE", "reason": "STORAGE_COST_UNAVAILABLE" }
          ]
        },
        "totalCosts": 2000,
        "expectedNetRealization": 28000,
        "netRealizationPerUnit": 280,
        "netRealizationCompleteness": "PARTIAL",
        "hasOmittedCosts": true,
        "netRealizationCalculationId": "nr-pub-xxxx",
        "transportEstimate": {
          "status": "AVAILABLE",
          "distanceKm": 118.4,
          "amount": 2000,
          "currency": "INR",
          "isEstimated": true,
          "sourceModule": "LOGISTICS"
        },
        "detail": { /* full Module 14 NetRealizationDTO, for audit/drill-down */ }
      },
      "marketComparison": {
        "status": "AVAILABLE",
        "marketModalPricePerQuintal": 285,
        "offerVsMarketAbsolute": 15,
        "offerVsMarketPercentage": 5.26,
        "trendDirection": "INCREASING",
        "dataFreshness": "FRESH"
      }
    }
  ],
  "lotContext": {
    "market": { "status": "AVAILABLE", "marketModalPricePerQuintal": 285, "trendDirection": "INCREASING", ... },
    "forecast": { "status": "AVAILABLE", "forecastedPricePerQuintal": 330, "horizonDays": 60, "scope": "REGIONAL" },
    "sellVsStore": { "status": "AVAILABLE", "decision": "STORE", "confidenceScore": 70, "factorsUsed": [...], "omittedFactors": [...] },
    "disclaimer": "Market prices, forecasts, and storage economics are informational ... You decide whether and to whom to sell."
  }
}
```

When a buyer demand has no `targetPrice`, `economics.status` is
`"UNAVAILABLE"` with a `reason` — Module 12 never invents a gross value or
net realization for an offer the buyer hasn't actually made.

## Cost provenance (build spec requirement: never fabricate costs)

- **Storage** costs are resolved entirely inside Module 14 (which already
  auto-resolves them from Warehouse Intelligence). Module 12 does not touch
  storage cost resolution.
- **Transport** costs are estimated (not a firm transporter quote) via
  Module 16's existing `RouteDistanceProvider` (Haversine-based road-distance
  estimate) and `LogisticsCostEstimator`, using the lot's farm/FPO
  coordinates and the buyer demand's coordinates. This only runs when both
  endpoints have coordinates; otherwise transport is reported as
  `UNAVAILABLE` and Module 14 reports its own `TRANSPORT_COST_UNAVAILABLE`
  for that buyer, exactly as it would for any other caller.
  - **Known limitation:** Module 14's `costs` override channel labels every
    override as `source: "USER_PROVIDED"` (see
    `net-realization-input-resolver.service.ts`), since it has no other
    concept of a caller supplying a cost on a buyer's behalf. The transport
    figure itself is real (sourced from Module 16), but Module 14's own
    persisted `NetRealizationCalculation` will show it under
    `USER_PROVIDED` rather than `LOGISTICS`. Module 12's own response layer
    additionally carries `economics.transportEstimate.sourceModule:
    "LOGISTICS"` so the true provenance is visible to any consumer of the
    buyer-matching API, but Module 14's calculation record itself does not
    yet distinguish "the buyer matcher supplied this from Module 16" from
    "a human typed this into a form." Fixing this fully would mean adding a
    new cost-override provenance field to Module 14 — out of scope for this
    change per the instruction not to modify Module 14 beyond what's
    necessary.
- **Market price / trend** always comes from Module 6's `snapshot()`. If
  Module 6 has no data for the crop/location, `marketComparison.status` is
  `"UNAVAILABLE"`.
- **Forecast** always comes from Module 7's `findLatestForecast()` (a
  read-only lookup — this call never triggers generation of a new
  forecast). Regional scope (by the lot's state) is tried first, then
  falls back to crop-wide; if neither exists, `forecast.status` is
  `"UNAVAILABLE"`.
- **Sell vs Store** always comes from Module 8's
  `SellStoreOrchestrationService.generateDecision()`, called once per lot
  (not once per buyer, since it's a lot-level question).

## Performance

Market/forecast/sell-store context is fetched **once per `matches()`
call**, not once per buyer, and shared across every buyer in the response.
Only the transport estimate and the Module 14 calculation are genuinely
buyer-specific and are computed per buyer.

## Tests

- `tests/unit/buyer-matching-economics.service.test.ts` — the economics
  orchestration layer in isolation (mocked Modules 6/7/8/14/16
  collaborators): no fabrication when a buyer has no target price, Module
  14 is the only source of the net realization number, missing
  market/forecast/sell-store data degrades to explicit unavailable states
  rather than throwing, transport is only estimated with both endpoints'
  coordinates known.
- `tests/unit/buyer-matching-economics-wiring.test.ts` — `matches()` itself:
  confirms the original response shape is unchanged when no economics
  collaborator is supplied (backward compatibility), confirms the new
  fields are attached correctly when it is supplied, and confirms one
  buyer's underlying failure doesn't corrupt another buyer's entry.

## Disclaimer shown to the farmer

Every `lotContext` response carries a plain-language disclaimer that
market prices, forecasts, and storage economics are informational and do
not guarantee a future price or outcome — the farmer decides whether and
to whom to sell.
