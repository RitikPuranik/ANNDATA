Prisma engine binaries could not be fetched in this build sandbox (binaries.prisma.sh
is not reachable from here). Run this once on a machine with normal internet access:

    npm install
    npx prisma generate
    npx prisma migrate dev --name init

Everything else (schema, repository/service code, tests against a mocked repository)
was written and verified without needing the live-generated client.

Module 16 (Logistics Quote & Optimization) hit the exact same wall and follows the
same approach: the schema additions, every repository/service/controller/route file,
and the deterministic engines (Haversine distance, cost estimator, vehicle
eligibility, quote state machine, optimization engine) were all written and the
pure-logic pieces were unit-tested for real (they don't import generated Prisma
types). The Prisma-typed repository/service files could not be type-checked or run
against a live DB here — run the three commands above, then:

    npm run build
    npm test
    npx prisma migrate dev --name add_logistics_module

to verify Module 16's own repository/service code and run its full test suite,
including the accept-quote concurrency test in tests/integration (see
tests/integration/logistics.routes.test.ts and any *.db.test.ts files added for it).

Module 17 (Shipment & GPS Tracking) hit the exact same wall. Its state machine and
Zod schemas don't import generated Prisma types either, so they were unit-tested for
real (see tests/unit/shipment-state-machine.test.ts and
tests/unit/shipment.schemas.test.ts). Its repository/service files (shipment.types.ts,
shipment.repository.ts, shipment.service.ts, etc.) reference Prisma-generated enum
names (ShipmentStatus, LocationUpdateSource, ...) only in type positions, which
ts-jest's isolatedModules transpilation elides per-file — so ShipmentService itself
could be instantiated and run against hand-built mocks for every collaborator with no
live client needed (see tests/unit/shipment.service.test.ts, 12 tests). That is real
control-flow execution, not full type-checking — run the commands above, then
`npm run build`, to confirm cross-file type correctness (field-name typos etc.) before
merging. See MODULE_17_IMPLEMENTATION_REPORT.md for the full verification/limitations
breakdown.

Module 18 (Delivery & Quality Reconciliation) hit the exact same wall, and went one
step further trying to work around it: the matching `@prisma/prisma-schema-wasm`
package for this repo's own pinned engine commit
(5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2) was installed from the (reachable)
npm registry, which does get the CLI further, but `prisma format`/`validate`/`generate`
still fall through to fetching the native query-engine binary from
`binaries.prisma.sh`, which has no npm-hosted fallback and is not reachable here. Run
the three commands at the top of this file, then `npm run build`, to confirm.

Same as Module 16/17, the pure-logic pieces (delivery-state-machine.ts,
delivery.schemas.ts, and — this module's own addition — the two deterministic
reconciliation engines, delivery-quantity-reconciliation.engine.ts and
delivery-quality-reconciliation.engine.ts) import no generated Prisma types at all and
were unit-tested for real. Its Prisma-enum-typed files (delivery.service.ts,
delivery-quality-agreement.resolver.ts, etc.) reference those enums only in type
positions, so — same trick as Module 17 — DeliveryService and
DeliveryQualityAgreementResolver were both instantiated and run against hand-built
mocks for every collaborator (repositories, PrismaClient, audit, authorization): see
tests/unit/delivery.service.test.ts (8 tests: full acceptance, partial acceptance,
rejection, the accepted-quantity-exceeds-delivered guard, and the double-acceptance
concurrency race) and tests/unit/delivery-quality-agreement.resolver.test.ts (5 tests:
the BuyerDemand > QualityStandard > lot-assessment > NONE priority order). 45 tests
total, all passing; the full pre-existing suite was also re-run and showed zero
regressions (861/880 passing — the 19 pre-existing failures, in buyer-matching/
sell-store-orchestration/warehouse-recommendation/wdra-*, are unrelated to this module
and were already failing before it existed). See MODULE_18_IMPLEMENTATION_REPORT.md
for the full breakdown.
