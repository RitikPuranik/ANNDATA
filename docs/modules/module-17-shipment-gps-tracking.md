# Module 17 — Shipment & GPS Tracking

## Purpose

Module 17 turns an **accepted** Module 16 logistics quote into a trackable
shipment: an explicit pickup-to-delivery lifecycle, GPS/location ingestion
and history, a best-effort ETA, and a straight-line route-progress
estimate. It owns none of transport pricing, quote optimization, payment
processing, or delivery/quality reconciliation — those stay with Module 16
and the not-yet-built Module 18.

## Architecture

```
LogisticsRequest (Module 16, status = QUOTE_ACCEPTED)
      |
      v
POST /api/shipments  { logisticsRequestId }
      |
      +-- re-derives provider/vehicle/price/quantity from the accepted
      |   quote server-side (never trusts the request body for any of it)
      |
      v
Shipment (status machine)
  CREATED -> CONFIRMED -> [ASSIGNED] -> READY_FOR_PICKUP -> PICKED_UP
    -> IN_TRANSIT -> [ARRIVED] -> DELIVERED
  (CREATED/CONFIRMED/ASSIGNED/READY_FOR_PICKUP -> CANCELLED)
      |
      +-- ShipmentEvent (append-only lifecycle audit trail)
      +-- ShipmentLocation (GPS pings, PICKED_UP/IN_TRANSIT/ARRIVED only)
      +-- Redis latest-location cache (best-effort; Postgres is the
      |   source of truth — a cache miss/outage always falls back to a
      |   live DB read, and every GPS update is persisted to Postgres
      |   first regardless of whether the cache write succeeds)
      |
      v
Module 18 (Delivery & Quality Reconciliation) — not yet built.
GET /api/shipments/:publicId/handoff exposes everything it will need.
```

ASSIGNED is reachable but not mandatory: Module 15's `VehicleDriver` is a
schema-only, at-most-one-per-vehicle record (see its own comment in
`schema.prisma`), so a shipment with no driver record simply proceeds
`CONFIRMED -> READY_FOR_PICKUP` directly; assigning a driver while
`CONFIRMED` advances the shipment to `ASSIGNED` as a side effect instead of
gating every shipment on a driver record that may not exist.

## Files

- `shipment-state-machine.ts` — the transition table above, plus the
  `CANCELLABLE_FROM_STATUSES` / `LOCATION_UPDATABLE_STATUSES` sets. Pure,
  dependency-free, unit tested (`tests/unit/shipment-state-machine.test.ts`).
- `shipment.repository.ts` / `shipment-location.repository.ts` /
  `shipment-event.repository.ts` / `shipment-driver.repository.ts` — thin
  Prisma wrappers, same "atomic conditional `updateMany`, `null` on 0 rows"
  transition convention as `LogisticsQuoteRepository.transition()`.
- `shipment-location-cache.ts` — the Redis latest-location cache described
  above.
- `shipment.config.ts` — env-driven `GPS_LOCATION_CACHE_TTL_SECONDS`,
  `GPS_FUTURE_TIMESTAMP_TOLERANCE_SECONDS`, `SHIPMENT_LOCATION_MAX_BATCH_SIZE`.
- `shipment.authorization.ts` — who may view/operate/cancel a shipment.
  Farmer/FPO admin (own lot), transporter (own shipment), buyer (accepted
  trade offer on the lot — there is no separate `Order` model in this
  codebase), or ADMIN. Never trusts a client-supplied owner/provider id.
- `shipment.schemas.ts` — Zod request validation, including the GPS
  coordinate/speed/heading/timestamp bounds from Step 14 of the build spec
  (reject, never silently clamp).
- `shipment.service.ts` — creation from an accepted quote, every lifecycle
  transition, GPS ingestion/history, ETA (reusing Module 16's own
  `RouteDistanceProvider` for recalculation — never a duplicate routing
  implementation), route progress, and the Module 18 handoff payload.
- `shipment.controller.ts` / `shipment.routes.ts` — HTTP layer, Swagger
  JSDoc on every route (picked up by the existing `swagger.ts` glob).

## Module 16 contract consumed

`acceptedQuoteId`, `logisticsRequestId`, `transportProviderId`, `vehicleId`,
the quote's own agreed amount/currency, pickup/destination
address/district/state/lat/lng, quantity/commodity, and the estimated
distance/duration — all read from the existing `LogisticsRequest` /
`LogisticsQuote` rows, never recomputed.

## Module 18 contract exposed

`GET /api/shipments/:publicId/handoff` returns shipment/lot ids, expected
quantity (delivered quantity is always `null` — Module 17 does no
reconciliation), pickup/delivery timestamps, provider/vehicle/quote ids,
the agreed amount/currency, and the delivery status.

## Known limitations

- This sandbox could not reach `binaries.prisma.sh` (outside the allowed
  network list), so `prisma generate` / `migrate dev` / a full `tsc` build
  could not be run here. Every model field and repository/service
  signature this module touches was cross-checked by hand against the
  current `schema.prisma` and source tree instead — run
  `npx prisma format && npx prisma validate && npx prisma generate` and
  `npm run build` locally before merging.
- Vehicle availability transitions (`RESERVED -> IN_TRANSIT -> AVAILABLE`)
  are best-effort, same convention as Module 16's own reservation-on-accept
  — a failure there never blocks a shipment transition, but nothing yet
  reconciles availability against active shipments if it drifts.
- Test coverage here is state-machine + schema-validation unit tests only;
  the integration/concurrency tests in Step 31 of the build spec (real-DB
  duplicate-creation and concurrent-delivery races) are not included.
