# Module 18 — Delivery & Quality Reconciliation

## Purpose

Module 18 records and reconciles what was **expected** versus **actually
delivered** versus **actually accepted**, for both quantity and quality,
once a Module 17 `Shipment` reaches `DELIVERED`. It owns delivery
recording, weighment, delivery-time quality inspection, the agreed-vs-
actual quality comparison, quantity reconciliation, and the
accept/reject/partial-accept decision. It owns none of lot grading (Module
5), buyer matching (Module 12), transport optimization (Module 16), GPS
tracking (Module 17), payment execution (Module 19), ledger settlement
(Module 20), or dispute resolution.

## Architecture

```
Shipment (Module 17, status = DELIVERED)
      |
      v
POST /api/deliveries  { shipmentId }
      |
      +-- resolves lot, buyer and agreed trade offer server-side from the
      |   shipment's own accepted TradeOffer (never trusts the request body)
      |
      v
Delivery (status machine)
  PENDING -> RECEIVED -> UNDER_INSPECTION
    -> ACCEPTED / PARTIALLY_ACCEPTED / REJECTED -> RECONCILED
      |
      +-- DeliveryWeighment (one row per weighing event; net weight is
      |   always grossWeightKg - tareWeightKg, computed server-side)
      +-- DeliveryQualityAssessment + DeliveryQualityObservation (delivery-
      |   time inspection, compared against the resolved agreed quality —
      |   see DeliveryQualityAgreementResolver below)
      +-- DeliveryReconciliation (one immutable row per calculation run —
      |   a provisional run while UNDER_INSPECTION, then a final run the
      |   moment a decision is made)
      +-- DeliveryEvidence (metadata/reference only — weighment slips,
      |   receipts, certificates, photos; never binary storage)
      |
      v
GET /api/deliveries/:publicId/handoff exposes everything Module 19
(Payment Status) needs — quantities, agreed vs actual quality, and the
final reconciliation status. Module 18 never touches payment itself.
```

There is no separate `Order` model in this codebase (see Module 16/17's
own comment); an accepted `TradeOffer` **is** the commercial transaction
Module 18 reconciles a delivery against. A shipment can have at most one
`Delivery` (this codebase's shipments are single-drop only — see
`Delivery`'s own schema comment); *partial acceptance* of that one
delivery is fully supported without needing multiple delivery rows.

## The two reconciliation engines

Both are pure, deterministic, side-effect-free classes — no LLM anywhere
in this module, per the build spec's own Step 34.

- **`DeliveryQuantityReconciliationEngine`** — compares expected vs
  delivered quantity against a configurable tolerance band
  (`DELIVERY_QUANTITY_TOLERANCE_PERCENT`, default 2%). A variance inside
  tolerance is `EXACT` even if the raw numbers differ; outside tolerance
  it's `SHORT` or `EXCESS` — the two are never conflated.
- **`DeliveryQualityReconciliationEngine`** — compares agreed vs observed
  quality (grade + per-metric thresholds). `PASS` when every compared
  parameter passes, `FAIL` when every one fails, `PARTIAL` otherwise,
  `PENDING` only when there's genuinely nothing to compare yet. An
  observed metric with no agreed threshold is recorded but doesn't count
  against the parcel — nothing to have violated.

## Where "agreed quality" comes from — `DeliveryQualityAgreementResolver`

Module 5's own grading system is never recreated or copied. The resolver
walks a priority chain:

1. The accepted `TradeOffer`'s own `BuyerDemand.qualityRequirements`/`grade`
   — the buyer's explicit, negotiated ask, when the offer came from a demand.
2. Module 5's existing `QualityStandard` rows for the lot's crop at the
   resolved grade, filling in any metric the demand didn't specify.
3. The lot's own latest `VERIFIED` `QualityAssessment.overallGrade`, as an
   implicit baseline, when no commercial agreement carries a grade at all.
4. `NONE` — reconciliation reports `PENDING` quality rather than
   fabricating a result.

## Files

- `delivery-state-machine.ts` — the transition table above, plus
  `IMMUTABLE_DELIVERY_STATUSES` (ACCEPTED/REJECTED/RECONCILED — no
  historical fact may be silently edited once reached),
  `INSPECTABLE_STATUSES`, `RECONCILABLE_STATUSES`.
- `delivery.config.ts` — env-driven quantity tolerance.
- `delivery-quantity-reconciliation.engine.ts` / `delivery-quality-reconciliation.engine.ts`
  — the two engines above.
- `delivery-quality-agreement.resolver.ts` — the priority chain above.
- `delivery.types.ts` — Prisma row shapes + public DTOs, including the
  Module 19 handoff contract.
- `delivery.repository.ts` (+ weighment/quality/reconciliation/evidence
  repositories) — Prisma implementations, atomic conditional `transition`
  for every state change (Step 27 concurrency safety).
- `delivery.authorization.ts` — who may view vs operate on a delivery
  (Step 13's RBAC table).
- `delivery.schemas.ts` — Zod request validation; a client can never
  supply a net weight, an agreed quality threshold, or any ownership field.
- `delivery.service.ts` — orchestration: creation from a shipment, receive,
  weighment, quality inspection, provisional reconciliation, the three
  decision paths (each of which immediately performs a final reconciliation
  and advances to `RECONCILED` in the same call), evidence, listing, and
  the Module 19 handoff.
- `delivery.controller.ts`, `delivery.routes.ts` — thin HTTP layer with
  inline Swagger/OpenAPI docs.

## Tests

`tests/unit/delivery-state-machine.test.ts` (14),
`delivery-quantity-reconciliation.engine.test.ts` (7),
`delivery-quality-reconciliation.engine.test.ts` (10),
`delivery.schemas.test.ts` (6),
`delivery-quality-agreement.resolver.test.ts` (5),
`delivery.service.test.ts` (8) — **45 tests, all passing**. See
`backend/prisma/README-engines.md` and
`MODULE_18_IMPLEMENTATION_REPORT.md` for exactly what this does and
doesn't verify in a sandbox with no route to `binaries.prisma.sh`.
