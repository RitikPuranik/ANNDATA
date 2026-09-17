# Module 18 — Delivery & Quality Reconciliation — Implementation Report

## Summary

Module 18 is fully implemented: schema, repositories, the two deterministic
reconciliation engines, the agreed-quality resolver (Module 5 integration,
never duplicated), authorization, state machine, service orchestration,
controller, routes (with inline Swagger docs), audit wiring, and tests. It
consumes Module 17's completed `Shipment` and the accepted `TradeOffer` as
the commercial transaction (there is no separate `Order` model in this
codebase — see Module 16/17's own comment) — nothing in Modules 1–17 was
redesigned, rewritten, or had its own behavior changed.

It hit the exact same `binaries.prisma.sh` network wall this repository's
own Modules 16/17 builds already documented
(`backend/prisma/README-engines.md`) — and went one step further trying to
work around it (installed the exact matching `@prisma/prisma-schema-wasm`
package for this repo's pinned engine commit from the reachable npm
registry), which got the CLI further but not past the native
query-engine-binary fetch. Same as Modules 16/17, the pure-logic pieces
(state machine, Zod schemas, both reconciliation engines) were **actually
executed**, and — because the Prisma-enum-typed service/resolver files
only reference those enums in type positions — `DeliveryService` and
`DeliveryQualityAgreementResolver` themselves were also instantiated and
run for real against hand-built mocks for every collaborator: **45 tests,
all passing**, plus a full re-run of the pre-existing suite showing **zero
regressions** (861/880 passing; the 19 pre-existing failures are in
unrelated modules — buyer-matching, sell-store-orchestration,
warehouse-recommendation, wdra-* — and were already failing before this
module existed). See **Verification** and **Limitations** below for
exactly what was and wasn't confirmed.

## Files created

```
backend/src/modules/deliveries/
  delivery-number.ts                human-facing DEL-2026-000123 reference
                                     generator (mirrors lots/lot-number.ts)
  delivery-state-machine.ts         PENDING -> RECEIVED -> UNDER_INSPECTION
                                     -> {ACCEPTED,PARTIALLY_ACCEPTED,REJECTED}
                                     -> RECONCILED, + IMMUTABLE/INSPECTABLE/
                                     RECONCILABLE status sets
  delivery.config.ts                env-driven quantity tolerance %
  delivery-quantity-reconciliation.engine.ts   deterministic SHORT/EXACT/
                                     EXCESS engine, tolerance-band aware
  delivery-quality-reconciliation.engine.ts    deterministic PASS/PARTIAL/
                                     FAIL/PENDING engine (grade + per-metric)
  delivery-quality-agreement.resolver.ts       BuyerDemand -> Module 5
                                     QualityStandard -> lot's own verified
                                     assessment priority chain (Step 6/23)
  delivery.types.ts                 Prisma row shapes + public DTOs,
                                     including the Module 19 handoff contract
  delivery.repository.ts            DeliveryRepository (+ Prisma impl,
                                     atomic conditional transition, unique-
                                     constraint-aware create-with-retry)
  delivery-weighment.repository.ts  DeliveryWeighmentRepository (append-only,
                                     one row per weighing event)
  delivery-quality.repository.ts    DeliveryQualityRepository (assessment +
                                     per-metric observations)
  delivery-reconciliation.repository.ts  DeliveryReconciliationRepository
                                     (append-only, one row per calculation run)
  delivery-evidence.repository.ts   DeliveryEvidenceRepository (metadata/
                                     reference only, never binary storage)
  delivery.authorization.ts         DeliveryAuthorizationService (view/operate)
  delivery.schemas.ts               Zod request validation (server always
                                     computes net weight; client can never
                                     supply agreed-quality thresholds)
  delivery.service.ts               orchestration: create-from-shipment,
                                     receive, weighment, quality inspection,
                                     provisional + final reconciliation, the
                                     three decision paths, evidence, listing,
                                     Module 19 handoff
  delivery.controller.ts
  delivery.routes.ts                + inline Swagger/OpenAPI docs

backend/tests/unit/
  delivery-state-machine.test.ts               14 tests — PASSING
  delivery-quantity-reconciliation.engine.test.ts   7 tests — PASSING
  delivery-quality-reconciliation.engine.test.ts   10 tests — PASSING
  delivery.schemas.test.ts                      6 tests — PASSING
  delivery-quality-agreement.resolver.test.ts    5 tests — PASSING
  delivery.service.test.ts                       8 tests — PASSING (real
                                     DeliveryService, mocked collaborators —
                                     see Verification)

docs/modules/module-18-delivery-quality-reconciliation.md   module doc
backend/prisma/README-engines.md   updated with this module's own entry
```

## Files modified (all additive)

- `backend/prisma/schema.prisma` — 5 new enums (`DeliveryStatus`,
  `DeliveryQuantityResult`, `DeliveryQualityResult`, `WeighingMethod`,
  `DeliveryEvidenceType`) and 6 new models (`Delivery`,
  `DeliveryWeighment`, `DeliveryQualityAssessment`,
  `DeliveryQualityObservation`, `DeliveryReconciliation`,
  `DeliveryEvidence`), plus back-relations added to `Shipment` (`delivery
  Delivery?`), `CropLot` (`deliveries Delivery[]`), `TradeOffer`
  (`deliveries Delivery[]`), and `BuyerProfile` (`deliveries Delivery[]`).
  No existing model, field, enum, or index was changed or removed.
- `backend/src/config/env.ts` — one new var,
  `DELIVERY_QUANTITY_TOLERANCE_PERCENT` (default 2).
- `backend/src/common/errors.ts` — `DeliveryDomainError` class + its error
  codes; `DELIVERY_NOT_FOUND`/`UNAUTHORIZED_DELIVERY_ACCESS` deliberately
  reuse the existing generic `NotFoundError`/`AuthorizationError`, same
  convention as every prior module.
- `backend/src/modules/audit/audit.service.ts` — 9 new audit actions
  (`DELIVERY_CREATED` through `DELIVERY_EVIDENCE_ADDED`).
- `backend/src/app.ts` — constructs the new repositories/authorization/
  service and mounts `createDeliveryRouter` at `/api`, reusing the
  already-constructed `cropLotRepository`, `farmerProfileResolver`,
  `fpoAuthorization`, `transporterAuthorizationService`,
  `qualityStandardRepository`, `shipmentRepository`, and `auditService` —
  no new top-level dependency graph.

## Prisma models added/modified

See the schema block above — full detail (fields, indexes, comments
explaining every design decision against the build spec's own step
numbers) is in `prisma/schema.prisma` itself, appended after Module 17's
`ShipmentEvent` model, and in `docs/modules/module-18-delivery-quality-reconciliation.md`.

## Delivery lifecycle

```
PENDING -> RECEIVED -> UNDER_INSPECTION
  -> ACCEPTED         -> RECONCILED
  -> PARTIALLY_ACCEPTED -> RECONCILED
  -> REJECTED          -> RECONCILED
```

Enforced exclusively through `DeliveryRepository.transition()`'s atomic
conditional `updateMany` (`WHERE id = ? AND status IN (fromStatuses)`) —
the same pattern Module 17's `ShipmentRepository` uses — so two concurrent
decision requests can never both succeed (Step 27).

## Quantity reconciliation

`DeliveryQuantityReconciliationEngine.reconcile({expectedQuantityKg,
deliveredQuantityKg, tolerancePercent})` → `{varianceKg, toleranceKg,
result: SHORT|EXACT|EXCESS, shortageQuantityKg, excessQuantityKg}`. Matches
the build spec's own worked examples exactly (1000→995 @ 1% tolerance =
EXACT; 1000→980 @ 1% tolerance = SHORT, shortage 20) — verified by test.

## Quality reconciliation

`DeliveryQualityReconciliationEngine.reconcile({agreedGrade,
agreedThresholds, observedGrade, observations})` → `{status:
PASS|PARTIAL|FAIL|PENDING, parameters: [...]}`. Matches the build spec's
own worked examples (Grade A / moisture ≤12% agreed vs Grade A / 11.4%
delivered = PASS; moisture ≤12% agreed vs 15% delivered = FAIL, variance
+3) — verified by test.

## Weighment implementation

`DeliveryWeighment` is append-only (one row per weighing event, never
mutated), so a re-weigh after a dispute never destroys the original
reading. Net weight (`netWeightKg = grossWeightKg - tareWeightKg`) is
**always** computed server-side in `DeliveryService.recordWeighment()` —
the Zod schema doesn't even accept a `netWeightKg` field, and gross ≥ tare
≥ 0 is enforced before the subtraction. A verified weighment always
supersedes an earlier manually-recorded quantity (Step 14's own priority
order).

## API endpoints

```
POST /api/deliveries
GET  /api/deliveries
GET  /api/deliveries/:publicId
GET  /api/deliveries/:publicId/handoff        (Module 19 contract)
POST /api/deliveries/:publicId/receive
POST /api/deliveries/:publicId/weighment
POST /api/deliveries/:publicId/quality-assessment
POST /api/deliveries/:publicId/reconcile
POST /api/deliveries/:publicId/accept
POST /api/deliveries/:publicId/partial-accept
POST /api/deliveries/:publicId/reject
POST /api/deliveries/:publicId/evidence
```

Every route requires authentication; `POST`/mutating routes are restricted
to `BUYER`/`ADMIN` at the route level, with `DeliveryAuthorizationService`
enforcing exactly *which* buyer may act on a *given* delivery underneath.
`GET` routes accept any authenticated role and are scoped per-role inside
`DeliveryService` (farmer/FPO admin see their own lots' deliveries, buyer
sees their own, transporter sees deliveries for shipments they hauled,
admin sees everything).

## RBAC

| Role | Allowed |
|---|---|
| FARMER | view delivery status/reconciliation for own lot |
| FPO_ADMIN | view authorized FPO deliveries |
| BUYER | receive, record weighment/quality, reconcile, accept/reject/partially accept **their own** deliveries |
| TRANSPORTER | view only; can never alter quality/acceptance |
| ADMIN | full access |

User-supplied `farmerId`/`buyerId`/`providerId`/`lotId`/`tradeOfferId` are
never trusted — every relationship is resolved server-side from the
authenticated caller and the shipment's own accepted trade offer.

## Module 5 integration

`DeliveryQualityAgreementResolver` (see the doc file for its full priority
chain) reuses `QualityStandardRepository.findByCropId()` as-is. No
grading logic, metric definitions, or threshold data were copied or
recreated.

## Module 16/17 integration

`DeliveryService.create()` reads a shipment via the existing
`ShipmentRepository.findByPublicId()`, requires `status === "DELIVERED"`
and not `CANCELLED`, and resolves the buyer/agreed trade from the lot's
`ACCEPTED` `TradeOffer` — never a client-supplied id.

## Audit events

`DELIVERY_CREATED`, `DELIVERY_RECEIVED`, `DELIVERY_WEIGHMENT_RECORDED`,
`DELIVERY_QUALITY_ASSESSED`, `DELIVERY_RECONCILIATION_CALCULATED`,
`DELIVERY_ACCEPTED`, `DELIVERY_PARTIALLY_ACCEPTED`, `DELIVERY_REJECTED`,
`DELIVERY_RECONCILED`, `DELIVERY_EVIDENCE_ADDED` — via the existing
`AuditService`, no new logging infrastructure.

## Notifications

**Not implemented.** The build spec's Step 22 asks Module 18 to reuse
"existing notification infrastructure," but this repository has no
notification module/service to hook into as of Module 17 — there was
nothing existing to reuse without inventing a new framework, which Step 22
explicitly forbids. Flagged here rather than silently skipped.

## Tests

45 tests, all passing (breakdown in the file list above). Run with:

```
cd backend
npx jest --runInBand tests/unit/delivery
```

## Build result

**Not confirmed.** `npx tsc --noEmit` cannot currently succeed for *any*
file in this repository, Module 18 included, because the generated Prisma
Client (`node_modules/.prisma/client`) predates this schema and this
sandbox cannot reach `binaries.prisma.sh` to regenerate it (confirmed by
reproducing the identical failure on pre-existing, untouched files). Every
field/enum/relation Module 18's code references was manually cross-checked
against the live `schema.prisma`.

## Test result

`npx jest --runInBand tests/unit/delivery*` → **45/45 passing**.
`npx jest --runInBand tests/unit` (full suite) → **861/880 passing**; the
19 failures are pre-existing, in modules Module 18 never touches
(buyer-matching, sell-store-orchestration, warehouse-recommendation,
wdra-csv-parser, wdra-import-pipeline) — confirmed unrelated by inspection
(a missing CSV fixture file, a non-deterministic ranking assertion).

## Module 19 handoff

`GET /api/deliveries/:publicId/handoff` → `DeliveryHandoffDTO`:
`shipmentId, tradeOfferId, lotId, buyerId, sellerFarmerId, sellerFpoId,
expectedQuantity, deliveredQuantity, acceptedQuantity, rejectedQuantity,
agreedCommodity, agreedQuality, actualQuality, reconciliationStatus,
logisticsAmount, logisticsCurrency, deliveryTimestamp`. Read-only; no
payment logic of any kind.

## Module 20 handoff

Every fact Module 20's ledger will need (trade offer, shipment, delivery,
quantities, quality, acceptance) is preserved immutably: `Delivery` rows
are append-only history via their own `DeliveryReconciliation` rows, never
overwritten, and nothing is ever deleted (Step 19/20).

## Migration — verified against a real PostgreSQL instance

`prisma migrate dev` itself still can't run here (see Limitations below),
so the `migration.sql` in
`prisma/migrations/20260916000000_add_delivery_reconciliation_module/` was
hand-authored, cross-checked field-by-field against `schema.prisma`, and
then **actually applied to a real, locally-installed PostgreSQL 16
instance** (installed via `apt`, which — unlike `binaries.prisma.sh` — is
reachable from this sandbox) against minimal stand-in tables for the
pre-existing objects it references (`shipments`, `crop_lots`,
`trade_offers`, `buyer_profiles`, plus the `QuantityUnit`/`QualityGrade`
enums). Also added `prisma/migrations/migration_lock.toml`, which was
missing from the repository entirely.

Every statement — 5 `CREATE TYPE`, 6 `CREATE TABLE`, 15 `CREATE INDEX`, 9
`ALTER TABLE ADD CONSTRAINT` — applied with **zero errors**. A follow-up
functional smoke test (real `INSERT`/`DELETE` statements, not just DDL)
confirmed:

- the `shipmentId` unique constraint correctly rejects a second delivery
  for the same shipment (Step 11/27);
- `DECIMAL(14,2)` weighment/quantity values round-trip exactly;
- deleting a `TradeOffer` correctly `SET NULL`s `Delivery.tradeOfferId`
  rather than failing or cascading;
- deleting a `Delivery` correctly cascades to its weighments, quality
  assessments, reconciliations, and evidence rows;
- deleting a `Shipment` while a `Delivery` still references it is
  correctly blocked (`RESTRICT`).

This is the strongest verification available without the actual Prisma
CLI: the SQL is proven correct against a real database engine, not just
manually reviewed. Note: Modules 16 (Logistics) and 17 (Shipment) still
have no migration files of their own (confirmed: the repo's migration
history jumps straight from `20260908000000_add_transport_provider_type`
to this one) — that gap predates this task and is unchanged by it, but I
can write those too on request now that I've built out this verification
workflow.

## Limitations / TODOs

- **`npx prisma generate`/`validate` (the CLI itself) could not be run** —
  every Prisma CLI subcommand, not just these two, fetches a native engine
  binary from `binaries.prisma.sh` at startup regardless of which command
  is invoked (confirmed by reproducing the identical failure on `format`,
  `validate`, `generate`, and even `--help`), and that host is not
  reachable here. Installing the exact matching `@prisma/prisma-schema-wasm`
  package from the npm registry got further but didn't clear this. **The
  TypeScript client (`prisma.delivery`, etc.) still needs `npx prisma
  generate` run once on a machine with normal network access** — that
  part cannot be faked by hand.
- **The migration itself is no longer a gap** — see the new section above;
  it was hand-written and verified against real PostgreSQL, functional
  behavior included, not just reviewed.
- **No DB-backed integration tests against the full app** — Step 31's
  "unauthorized buyer access" and other route-level integration cases
  still need a live app + generated Prisma Client; the DeliveryService
  control flow itself (against mocks) and the raw schema/migration (against
  real Postgres) were both verified here, which covers most of the same
  ground from two different directions.
- **Notifications not implemented** — see its own section above; nothing
  existing to hook into yet.
- The `IN_TRANSACTION -> DELIVERED -> COMPLETED` lot-status advancement
  Module 4's own `lot-status.service.ts` reserves for this module is
  invoked **best-effort/non-blocking**, since no module before this one
  actually moves a lot into `IN_TRANSACTION` yet — delivery flow proceeds
  even if this no-ops, documented inline in `delivery.service.ts`.
