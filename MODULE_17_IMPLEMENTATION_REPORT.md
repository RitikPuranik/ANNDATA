# Module 17 — Shipment & GPS Tracking — Implementation Report

## Summary

Module 17 is fully implemented: schema, repositories, authorization,
state machine, GPS ingestion/caching, ETA/route-progress estimation,
services, controllers, routes (with inline Swagger docs), audit/analytics
wiring, and tests. It consumes Module 16's accepted-quote contract and
Module 15's provider/vehicle/driver registry as-is — nothing in either
module was redesigned, rewritten, or had its own behavior changed. It hits
the exact same `binaries.prisma.sh` network wall this repository's own
Module 16 build already documented (`backend/prisma/README-engines.md`),
so — same as that module — the pure-logic pieces (state machine, Zod
validation) and the full `ShipmentService` control flow (against hand-built
mocks for every collaborator) were **actually executed** in this sandbox:
**36 tests, all passing.** The Prisma-typed repository layer itself could
not be run against a live database here. See **Verification** and
**Limitations** below for exactly what was and wasn't confirmed.

## Files created

```
backend/src/modules/shipments/
  shipment-state-machine.ts      status transitions (+ CANCELLABLE_FROM_STATUSES /
                                  LOCATION_UPDATABLE_STATUSES)
  shipment.types.ts              Prisma row shapes + public DTOs (ETA, route
                                  progress, Module 18 handoff)
  shipment.config.ts             env-driven GPS cache TTL / future-timestamp
                                  tolerance / location page-size cap
  shipment-location-cache.ts     Redis latest-location cache (best-effort,
                                  Postgres remains source of truth)
  shipment.repository.ts         ShipmentRepository (+ Prisma impl, atomic
                                  conditional transition, unique-constraint
                                  detection for the race-condition duplicate case)
  shipment-location.repository.ts   ShipmentLocationRepository (+ Prisma impl,
                                  paginated/filterable history)
  shipment-event.repository.ts   ShipmentEventRepository (+ Prisma impl,
                                  append-only lifecycle audit trail)
  shipment-driver.repository.ts  ShipmentDriverRepository (+ Prisma impl —
                                  reads Module 15's VehicleDriver, one-per-vehicle)
  shipment.authorization.ts      ShipmentAuthorizationService (view/operate/cancel)
  shipment.schemas.ts            Zod request validation, incl. GPS bounds
  shipment.service.ts            orchestration: create-from-quote, every
                                  lifecycle transition, GPS ingestion/history,
                                  ETA, route progress, Module 18 handoff, listing
  shipment.controller.ts
  shipment.routes.ts              + inline Swagger/OpenAPI docs

backend/tests/unit/
  shipment-state-machine.test.ts  13 tests — PASSING
  shipment.schemas.test.ts        11 tests — PASSING
  shipment.service.test.ts        12 tests — PASSING (real ShipmentService,
                                   mocked collaborators — see Verification)

docs/modules/module-17-shipment-gps-tracking.md   module doc
```

## Files modified (all additive)

- `backend/prisma/schema.prisma` — 3 new enums (`ShipmentStatus`,
  `LocationUpdateSource`, `ShipmentEventType`), 3 new models (`Shipment`,
  `ShipmentLocation`, `ShipmentEvent`), additive back-relations on
  `LogisticsRequest`, `LogisticsQuote`, `CropLot`, `TransporterProfile`,
  `Vehicle`, `VehicleDriver` (Prisma requires both sides of a relation
  declared — nothing about those models' own behavior changed).
  `Shipment.logisticsRequestId` and `Shipment.acceptedQuoteId` are both
  `@unique`, so "only one shipment per accepted quote" is enforced at the
  database level, not just in application code.
- `backend/src/common/errors.ts` — new `ShipmentDomainError` class + its
  error codes, following the exact pattern of `LogisticsDomainError`.
- `backend/src/modules/audit/audit.service.ts` — 11 new `AuditAction`
  values (`SHIPMENT_CREATED` … `SHIPMENT_CANCELLED`).
- `backend/src/config/env.ts` — 3 new env vars
  (`GPS_LOCATION_CACHE_TTL_SECONDS`, `GPS_FUTURE_TIMESTAMP_TOLERANCE_SECONDS`,
  `SHIPMENT_LOCATION_MAX_BATCH_SIZE`), all with documented defaults.
- `backend/src/config/posthog.ts` — 2 new events (`shipment_created`,
  `shipment_delivered`) added to the existing `ALLOWED_EVENTS` allow-list.
- `backend/src/config/swagger.ts` — updated the API description, which
  still claimed (even after Module 16 shipped) that "shipment/GPS tracking
  ... [is] not yet part of this API".
- `backend/src/app.ts` — Module 17 wired in immediately after Module 16,
  reusing the already-constructed `transporterRepository`,
  `vehicleRepository`, `transporterAuthorizationService`,
  `logisticsRequestRepository`, `logisticsQuoteRepository`,
  `routeDistanceProvider`, `cropLotRepository`, `farmerProfileResolver`,
  `fpoAuthorization` instances rather than duplicating any of them.
- `backend/prisma/README-engines.md` — noted that Module 17 hit the same
  wall and follows the same resolution path.

**Nothing in Modules 1–16 was redesigned, rewritten, or had its own
behavior changed.**

## Prisma models added

`ShipmentStatus` (`CREATED`, `CONFIRMED`, `ASSIGNED`, `READY_FOR_PICKUP`,
`PICKED_UP`, `IN_TRANSIT`, `ARRIVED`, `DELIVERED`, `CANCELLED`),
`LocationUpdateSource` (`DRIVER_APP`, `GPS_DEVICE`, `IOT_DEVICE`, `ADMIN`,
`SYSTEM`), `ShipmentEventType` (10 lifecycle event values), `Shipment`,
`ShipmentLocation`, `ShipmentEvent`. Full field lists and design rationale
are inline in `schema.prisma`'s own comments and in the module doc.

## Shipment lifecycle

```
CREATED -> CONFIRMED -> [ASSIGNED] -> READY_FOR_PICKUP -> PICKED_UP
  -> IN_TRANSIT -> [ARRIVED] -> DELIVERED
(CREATED/CONFIRMED/ASSIGNED/READY_FOR_PICKUP -> CANCELLED, never after PICKED_UP)
```

`ASSIGNED` is reachable but not mandatory: Module 15's `VehicleDriver` is a
schema-only, at-most-one-per-vehicle record, so a shipment with no driver
record proceeds `CONFIRMED -> READY_FOR_PICKUP` directly; assigning a
driver while `CONFIRMED` advances the shipment to `ASSIGNED` as a side
effect instead. Every transition is an atomic conditional `UPDATE`
(`transition()` returns `null` on a status that no longer matches, same
convention as `LogisticsQuoteRepository.transition()`), so two concurrent
delivery/pickup attempts on the same shipment can never both succeed —
verified in `shipment.service.test.ts` ("two concurrent delivery attempts:
the loser sees `transition()` return `null` and gets a domain error").

## GPS implementation

- `ShipmentLocation` rows only while `PICKED_UP`/`IN_TRANSIT`/`ARRIVED`
  (Step 10) — rejected outright (never silently clamped, Step 14) for
  out-of-range latitude/longitude/speed/heading/accuracy and for
  timestamps beyond `GPS_FUTURE_TIMESTAMP_TOLERANCE_SECONDS` in the future.
- Latest location cached in Redis (`shipment:{publicId}:latest-location`,
  TTL `GPS_LOCATION_CACHE_TTL_SECONDS`), read-through with a DB fallback on
  a cache miss or Redis outage; every location is persisted to PostgreSQL
  first regardless of whether the cache write succeeds — PostgreSQL is
  always the source of truth.
- Paginated, chronological history (`GET /shipments/:publicId/locations`,
  `from`/`to` filters), indexed on `shipmentId`, `recordedAt`, and the
  composite of both — no unbounded history load.
- ETA: `INITIAL_ESTIMATE` from Module 16's own quote/request estimate by
  default; recalculated (`RECALCULATED_ESTIMATE`) from the latest GPS fix
  to the destination using Module 16's own `RouteDistanceProvider` (no
  duplicate routing logic) whenever the shipment is an active trip with a
  known latest location and destination — never presented as guaranteed.
- Route progress: pickup/destination/latest location, Module 16's own
  route-estimate distance (`ROUTE_ESTIMATE`) alongside a straight-line
  elapsed distance from pickup to the latest fix (`HAVERSINE`, explicitly
  typed as such, never presented as road distance), and a 0–100% progress
  figure that is `null` whenever either distance is unavailable.

## API endpoints

`POST /shipments`, `GET /shipments`, `GET /shipments/:publicId`,
`GET /shipments/:publicId/handoff`, `POST /shipments/:publicId/confirm`,
`POST /shipments/:publicId/assign-driver`,
`POST /shipments/:publicId/ready-for-pickup`,
`POST /shipments/:publicId/pickup`, `POST /shipments/:publicId/start-transit`,
`POST /shipments/:publicId/arrive`, `POST /shipments/:publicId/deliver`,
`POST /shipments/:publicId/cancel`, `POST /shipments/:publicId/location`,
`GET /shipments/:publicId/locations` — 14 routes, all under the existing
`/api` prefix, all with inline Swagger docs picked up by the existing
`swagger.ts` glob.

## RBAC rules

- **FARMER / FPO_ADMIN**: create a shipment for / view / cancel (pre-pickup
  only) shipments on their own lots — resolved from the lot's own
  `farmerId`/`fpoId`, never a client-supplied id.
- **TRANSPORTER**: view and operate (confirm, assign driver, pickup,
  transit, arrive, deliver, cancel, submit GPS) only their own assigned
  shipments — resolved from their own profile, never a client-supplied
  `providerId`.
- **BUYER**: view-only, for a lot they hold an *ACCEPTED* trade offer
  against (there is no separate `Order` model in this codebase — this
  mirrors how Module 16 itself has no buyer-side concept either).
- **ADMIN**: full access.
- Every list/detail/handoff endpoint enforces this at the query level
  (farmer/FPO/buyer list filters are resolved server-side to the caller's
  own lot ids), not just by hiding fields in the response.

## Module 15 integration

Vehicle/provider/driver eligibility re-verified server-side at creation
(`vehicle.transporterId === provider.id`, both active) rather than trusted
from the accepted quote blindly; vehicle availability flipped
`RESERVED -> IN_TRANSIT` on start-transit and `-> AVAILABLE` on
deliver/cancel, best-effort (never blocks a shipment transition, same
convention as Module 16's own reservation-on-accept). Driver assignment
reads Module 15's `VehicleDriver` (at most one per vehicle) directly — no
second driver table.

## Module 16 integration

Consumes `acceptedQuoteId`, `logisticsRequestId`, `transportProviderId`,
`vehicleId`, the quote's own agreed amount/currency, pickup/destination
address/district/state/lat/lng, quantity/commodity, and estimated
distance/duration — all read from the existing `LogisticsRequest` /
`LogisticsQuote` rows, never recomputed. Reuses Module 16's own
`RouteDistanceProvider` instance for ETA recalculation.

## Module 18 handoff

`GET /shipments/:publicId/handoff` returns shipment/lot ids, expected
quantity (delivered quantity is always `null` — Module 17 performs no
grading/reconciliation), pickup/delivery timestamps, provider/vehicle/quote
ids, the agreed amount/currency, and the delivery status.

## Redis/cache usage

Latest-location cache only (see GPS implementation above) — same
best-effort, never-load-bearing convention as `logistics-cache.ts`.

## Audit events

`SHIPMENT_CREATED`, `SHIPMENT_CONFIRMED`, `SHIPMENT_VEHICLE_ASSIGNED`*,
`SHIPMENT_DRIVER_ASSIGNED`, `SHIPMENT_READY_FOR_PICKUP`,
`SHIPMENT_PICKED_UP`, `SHIPMENT_TRANSIT_STARTED`,
`SHIPMENT_LOCATION_UPDATED`, `SHIPMENT_ARRIVED`, `SHIPMENT_DELIVERED`,
`SHIPMENT_CANCELLED`. (*`SHIPMENT_VEHICLE_ASSIGNED` is registered as an
`AuditAction` value per the build spec's own list, but vehicle assignment
happens automatically at creation from the accepted quote rather than as
its own step, so nothing currently records it — it's available for a
future explicit re-assignment flow if one is ever added.)

## Configuration variables added

`GPS_LOCATION_CACHE_TTL_SECONDS`, `GPS_FUTURE_TIMESTAMP_TOLERANCE_SECONDS`,
`SHIPMENT_LOCATION_MAX_BATCH_SIZE`.

## Verification — what was actually run, and what it found

**1. Confirmed the network blocker precisely:** `npx prisma format` /
`validate` / `generate` all fail with `403 Forbidden` fetching
`https://binaries.prisma.sh/...` — the exact same wall Module 16's own
build documented in `backend/prisma/README-engines.md`. `npm install` for
the backend itself succeeded.

**2. State machine — 13 real unit tests, all passing.**
`shipment-state-machine.ts` imports nothing from `@prisma/client` and was
directly unit tested: full happy-path lifecycle, `DELIVERED -> IN_TRANSIT`
(and every other terminal-state exit) correctly fails, cancellation only
before pickup, `ASSIGNED` correctly skippable.

**3. Zod schema validation — 11 real unit tests, all passing.** GPS
bounds (latitude/longitude/speed/heading/accuracy, including the exact
`heading < 360` boundary — this caught a genuine off-by-one in my first
draft, `.max(360)` instead of `.lt(360)`, before I fixed it), the
create-shipment body's rejection of client-supplied provider/price/quantity
fields, and the `from <= to` location-query constraint.

**4. `ShipmentService` itself — 12 real unit tests, all passing, against
the actual service code.** Files under `shipment.types.ts` /
`shipment.repository.ts` / `shipment.service.ts` reference `@prisma/client`
symbols (`ShipmentStatus`, `LocationUpdateSource`, etc.) only in type
positions, which `ts-jest`'s `isolatedModules` transpilation elides at the
single-file syntactic level — so the actual `ShipmentService` class could
be instantiated and run against hand-built mocks for every one of its 15
constructor dependencies, with no live database or generated Prisma
client needed. This is **not** the same as full TypeScript type-checking
(`isolatedModules` skips cross-file type verification — see Limitations),
but it is real execution of the real control-flow code, and it caught one
genuine test-fixture bug (a missing mock) along the way. Covered:
create-from-quote (happy path, duplicate-shipment rejection at both the
request and quote level, quote-not-accepted rejection, transporter
blocked from self-creating), `assignDriver` (happy path incl. the
`CONFIRMED -> ASSIGNED` side effect, cross-provider driver rejected,
blocked once terminal), the full `pickup -> start-transit -> deliver`
chain incl. vehicle-availability flips and their best-effort failure
tolerance, delivery legal from both `IN_TRANSIT` and `ARRIVED`, the
concurrent-delivery race producing a clean domain error instead of a
crash, and GPS rejection before pickup / after delivery.

**5. Every model field and repository/service method signature this
module touches was cross-checked by hand** against the current
`schema.prisma` and the actual source of every collaborator file
(`LogisticsRequestRecord`, `LogisticsQuoteRecord`, `VehicleRecord`,
`TransporterProfileRecord`, `CropLotWithRelations`, `FpoAdmin`,
`BuyerProfile`, `TradeOffer`, `VehicleDriver`, `RouteDistanceProvider`,
`AuditEvent`, `RequestMeta`, `AuthenticatedUserContext`, the auth
middleware's `requireAnyRole`/`createAuthMiddleware`, and the
`validateBody`/`validateQuery`/`validateParams`/`sendSuccess` helpers) —
not assumed from memory of similar-looking modules.

**6. Ran the full existing `tests/unit` suite (840 tests, 67 suites)** to
confirm nothing here broke anything else: 62 suites / 821 tests passed,
including every Module 15/16 test file unchanged. The 5 failing suites
(19 tests, in `buyer-matching`, `sell-store-orchestration`,
`warehouse-recommendation`, `wdra-csv-parser`, `wdra-import-pipeline`) are
pre-existing and unrelated — e.g. `wdra-csv-parser.test.ts` fails on a
missing `data/wdra/wdra-warehouses.csv` fixture file, and none of these
five modules were touched by this change.

## Limitations

- **No live-database or `tsc` verification.** `binaries.prisma.sh` is
  outside this sandbox's allowed network list, so `prisma generate` /
  `migrate dev` and a full `npm run build` could not be run. Run:
  ```
  npm install
  npx prisma generate
  npx prisma migrate dev --name add_shipment_module
  npm run build
  npm test
  ```
  on a machine with normal internet access to close this gap. Given item
  4 above, I'm reasonably confident in the service-layer control flow, but
  cross-file type correctness (e.g. an exact Prisma field name typo that
  `isolatedModules` wouldn't catch) is only as solid as the by-hand
  cross-checking in item 5 — `npm run build` is the one command I'd most
  want run before merging.
- **No real-DB concurrency/integration tests.** The Step 28 concurrency
  guarantees (duplicate-shipment creation, concurrent delivery) are backed
  by a DB-level `@unique` constraint and an atomic conditional `UPDATE`
  respectively — the *mechanism* is real and exercised in the service-test
  race-condition case above, but a genuine two-connections-against-Postgres
  test (mirroring Module 16's own `*.db.test.ts` pattern) was not written.
- **Vehicle-availability drift.** Availability flips are best-effort and
  never reconciled against actually-active shipments if a flip silently
  fails (same limitation Module 16 already has for its own
  reservation-on-accept).
- **`SHIPMENT_VEHICLE_ASSIGNED` is unused** — see the Audit events note
  above.
- Assign-driver assumes at most one `VehicleDriver` per vehicle (true today
  per Module 15's own schema comment); if Module 15 ever grows real
  multi-driver support, `assignDriver` will need a driver-selection input
  instead of implicitly attaching "the" driver.
