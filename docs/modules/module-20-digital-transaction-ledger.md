# Module 20 — Digital Transaction Ledger

## Purpose

Module 20 creates an append-only, auditable financial history for
ANNDATA. It is **not a payment gateway** — it never moves money,
initiates a UPI/bank transfer, processes a card, operates escrow, or
fabricates a payment outcome. It records the financial events Module
13 (accepted trade), Module 14 (net realization), Module 18 (delivery
reconciliation) and Module 19 (payment status) have already
established, and the resulting financial state, in a history that can
never be silently edited.

It owns none of: payment status decisions (Module 19), net realization
calculation (Module 14), delivery/quality reconciliation (Module 18),
offer/trade negotiation (Module 13), or party/user identity (Auth /
FarmerProfile / BuyerProfile). Module 20 only ever *records* what those
modules have already decided.

## Architecture

```
Module 13 accepted TradeOffer
      |
      v
Module 18 Delivery (RECONCILED) --------------------+
      |                                              |
      v                                              |
Module 19 PaymentObligation (created)                |
      |         \                                     |
      |          \--> DigitalTransactionLedgerService.recordPaymentEvent()
      |                     PAYMENT_OBLIGATION_CREATED  (CREDIT)
      v
Module 19 PaymentRecord(s) recorded / confirmed
      |
      +--> DigitalTransactionLedgerService.recordPaymentEvent()
                 PARTIAL_PAYMENT / FINAL_PAYMENT          (DEBIT)

Module 14 NetRealizationCalculation (independently, when available)
      |
      +--> DigitalTransactionLedgerService.recordNetRealizationSnapshot()
                 NET_REALIZATION_RECORDED                 (CREDIT, informational)

Admin only:
  POST /api/ledger/:publicId/reverse   -> REVERSAL   (opposite direction of the entry it reverses)
  POST /api/ledger/adjustments         -> MANUAL_ADJUSTMENT (sign of amount decides direction)
```

`PaymentService` (Module 19) holds an **optional** `PaymentLedgerHook`
(`setLedgerHook()`, wired once in `app.ts`). Module 19 has zero
compile-time dependency on Module 20's implementation — only on the
narrow `PaymentLedgerHook` interface it already declares itself — and a
ledger-recording failure never blocks or rolls back a payment Module 19
has already authoritatively recorded (the ledger records what
happened; it never gates it).

## Data model

`DigitalTransactionLedger` (see `prisma/schema.prisma`):

| Field | Notes |
|---|---|
| `id` / `publicId` | Internal id never exposed; `publicId` is the only id the API returns. |
| `transactionId` | **Not** this row's own id — see "Transaction ID" below. |
| `tradeId` / `lotId` / `farmerId` / `buyerId` | Plain indexed `String` columns, **no** Prisma relation — see "Design decisions" below. |
| `eventType` | `LedgerEventType` enum. |
| `direction` | `LedgerDirection` (`CREDIT`/`DEBIT`) — see "Direction semantics". |
| `amount` / `currency` | `Decimal(16,2)`; **never** a JS float. |
| `sourceModule` / `sourceEntityId` / `sourceEventId` | Provenance + idempotency key (with `eventType`). |
| `description` / `metadata` | Immutable snapshot captured at write time. |
| `reversalOfEntryId` | Self-referencing FK, `onDelete: Restrict`. |
| `createdByUserId` | Set for admin-authored reversals/adjustments; null for system-recorded events. |
| `createdAt` | Ordering key for reconstruction. |

### Design decisions

- **Transaction ID.** `transactionId` is always the Module 18 `Delivery.id`
  (its `publicId` is not used here — matching Module 19's own choice of
  internal ids for its foreign keys), *never* the ledger row's own id.
  It is the one durable anchor Module 13/14/18/19 all already key a
  sale off — one delivery, one obligation
  (`PaymentObligation.deliveryId` is itself `@unique`), one financial
  flow.
- **No cross-module relations.** `tradeId`/`lotId`/`farmerId`/`buyerId`/
  `sourceEntityId` are plain indexed columns, not Prisma relations. This
  keeps the migration additive and isolated — Module 20 never required
  touching `TradeOffer`, `CropLot`, `FarmerProfile`, `BuyerProfile` or
  `User` with a new back-relation field. Module 20 reads other
  modules' data through their own services/repositories, never by
  re-querying it independently to reconstruct history.
- **No persisted `balanceAfter`.** A stored running balance would need
  every concurrent write serialized under a row lock to stay correct —
  the same problem `PaymentObligationRepository.lockForUpdate()` exists
  to solve for a single obligation — but ledger entries fan in from
  several independent sources (Module 14/18/19) and are never limited to
  one lock target. Balance is instead **reconstructed at read time**:
  `getTransactionSummary()` reads `amountPaid`/`amountDue`/`status` from
  Module 19's own `PaymentObligation` (already the concurrency-safe
  authoritative balance) as the primary source, and only falls back to
  summing the ledger's own balance-affecting entries in
  `(transactionId, createdAt, id)` order when no `PaymentObligation`
  exists yet for that transaction.

## Event types & direction semantics

`LedgerDirection`: **CREDIT** increases the farmer/seller's receivable
balance for the transaction; **DEBIT** reduces it. Only the following
event types affect the *reconstructed running balance* (see
`ledger-direction.ts`'s `isBalanceAffecting()`); the rest are
informational breakdown/context entries that document how Module 14/18
arrived at a figure, and are excluded from balance reconstruction so
nothing is double-counted against the obligation itself:

| Event type | Direction | Balance-affecting | Source |
|---|---|---|---|
| `TRADE_VALUE_RECORDED` | CREDIT | no | Module 13 |
| `NET_REALIZATION_RECORDED` | CREDIT | no | Module 14 |
| `LOGISTICS_COST_RECORDED` | DEBIT | no | Module 16 (via Module 14) |
| `STORAGE_COST_RECORDED` | DEBIT | no | Module 14 |
| `OTHER_DEDUCTION_RECORDED` | DEBIT | no | Module 14 |
| `DELIVERY_ADJUSTMENT` | DEBIT | no | Module 18 |
| `PAYMENT_OBLIGATION_CREATED` | CREDIT | **yes** | Module 19 |
| `PAYMENT_RECORDED` / `PARTIAL_PAYMENT` / `FINAL_PAYMENT` | DEBIT | **yes** | Module 19 |
| `REFUND` | CREDIT | **yes** | Module 19 |
| `REVERSAL` | opposite of the entry it reverses | **yes** | this module |
| `MANUAL_ADJUSTMENT` | sign of the supplied amount | **yes** | admin |

**Not yet wired automatically in this version:** `TRADE_VALUE_RECORDED`,
`LOGISTICS_COST_RECORDED`, `STORAGE_COST_RECORDED`,
`OTHER_DEDUCTION_RECORDED`, `DELIVERY_ADJUSTMENT`, and `REFUND`. No
existing business rule in Module 13/14/18/19 currently produces a
standalone "logistics cost", "storage cost", "other deduction",
"delivery adjustment" or "refund" figure independent of the net
realization snapshot itself or a reversal — inventing one would violate
the module's own "No Fabricated Values" rule. `recordNetRealizationSnapshot()`
is implemented and available for `NetRealizationOrchestrationService`
(or an admin flow) to call once Module 14 resolves a net realization for
a lot; it is not yet auto-triggered from Module 14's own write path, to
avoid modifying that module's contract without an explicit request to
do so. Wiring these five in is additive, not a breaking change, when
Module 13/14/18/19 gain the corresponding data.

## Idempotency

Enforced by a **database uniqueness constraint** on
`(sourceModule, sourceEntityId, sourceEventId, eventType)` — never only
an application-level check. `DigitalTransactionLedgerRepository.create()`
catches the resulting `P2002` conflict and returns the *existing* row
instead of throwing, so a payment webhook retry, a duplicate delivery
event, or two concurrent requests racing on the same upstream event can
never create a second ledger row — even under real concurrency, since
the guarantee comes from Postgres, not from a prior `SELECT`.

A `PAYMENT_RECORDED`/`PARTIAL_PAYMENT`/`FINAL_PAYMENT` entry's idempotency
key is the `PaymentRecord.id` itself (Module 19 payments are already
idempotent per obligation via `PaymentRecord.idempotencyKey`, so
replaying the same record can only ever resolve to the same
`sourceEventId` here). A `REVERSAL`'s key is scoped to the entry it
reverses (`sourceEntityId = sourceEventId = <original entry id>`), so
retrying a reversal request is also a no-op — on top of the explicit
"already reversed" check in the service. A `MANUAL_ADJUSTMENT` has no
upstream event to replay (it is a one-off admin action, never a webhook
target), so its `sourceEventId` is a fresh identifier generated per call.

## Atomicity

Every entry write goes through
`DigitalTransactionLedgerRepository.create()`, which is safe to call
inside an existing `Prisma.TransactionClient` (pass it as the second
argument) so a caller that must create several related ledger rows
atomically — e.g. a future `recordNetRealizationBreakdown()` writing
`LOGISTICS_COST_RECORDED` + `STORAGE_COST_RECORDED` +
`OTHER_DEDUCTION_RECORDED` + `NET_REALIZATION_RECORDED` together — can
wrap them in one `prisma.$transaction`. `createMany()` is provided for
exactly this case. The current Module 19 integration only ever writes
one row per call (one event, one entry), so it does not itself open a
transaction, but the primitive is in place for when the deduction
breakdown is wired in.

## Reversals

Never mutates a historical row. `createReversal()`:

1. Loads the original entry by `publicId`.
2. Rejects if the original is itself a `REVERSAL` (`LEDGER_REVERSAL_OF_REVERSAL`).
3. Rejects if the original already has a reversal (`LEDGER_ENTRY_ALREADY_REVERSED`).
4. Creates a new `REVERSAL` row with `direction` opposite the original,
   the same `amount`, and `reversalOfEntryId` pointing at the original.

Admin-only (`LedgerAuthorizationService.assertAdminOnly`). A reason is
required (`createReversalBody`, min 3 characters) — a reversal is
useless as an audit trail without one.

## Manual adjustments

Admin-only, via `POST /api/ledger/adjustments`. Requires
`transactionId`, a non-zero `amount`, `currency`, and a `reason`
(min 3 characters) — `LEDGER_MANUAL_ADJUSTMENT_REQUIRES_REASON` /
`INVALID_LEDGER_AMOUNT` otherwise. `createdBy` and the timestamp are
always resolved server-side from the authenticated session, never
accepted from the request body. The sign of the supplied `amount`
decides `direction` (positive → CREDIT, negative → DEBIT); the stored
`amount` column is always the positive magnitude.

## Authorization

`LedgerAuthorizationService.canView()`:

- **ADMIN** — full access to every entry.
- **FARMER** — only entries where `entry.farmerId` equals their own
  resolved `FarmerProfile.id` (resolved server-side from the
  authenticated session, never trusted from the request — same
  convention as `PaymentAuthorizationService`).
- **BUYER** — only entries where `entry.buyerId` equals their own
  resolved `BuyerProfile.id`.
- **FPO_ADMIN** — not yet granted visibility in this version.
  `entry.farmerId` always mirrors `PaymentObligation.sellerFarmerId`,
  which today is farmer-owned only (an FPO-managed sale has no
  representation on `PaymentObligation`/Module 20 yet); granting
  FPO-admin access here without a real underlying FPO-owned sale to
  check against would be a fabricated authorization path, so it is left
  as an explicit `false` rather than silently reusing an unrelated
  check.

`GET /api/ledger/farmer/:farmerId` and `GET /api/ledger/buyer/:buyerId`
additionally 403 (`AuthorizationError`) if a non-admin caller's own
resolved profile id does not match the path parameter — the same "never
trust an id from the client" rule Module 19 applies to
`farmerId`/`buyerId`/`transactionId`.

## Financial status

`LedgerObligationStatus` (`UNPAID` / `PARTIALLY_PAID` / `PAID` /
`REFUNDED` / `DISPUTED`) is derived **read-only** from Module 19's own
`PaymentObligationStatus` (`mapObligationStatusToLedgerStatus()`) —
never a second state machine. `PENDING`/`OVERDUE`/`CANCELLED` all map to
`UNPAID`, `PARTIALLY_PAID` to itself, `PAID`/`OVERPAID` to `PAID`,
`DISPUTED` to `DISPUTED`. `REFUNDED` exists in the ledger's own status
type for when `REFUND` entries are wired in (see "Not yet wired
automatically" above) but no obligation status maps to it today.

## API

All routes require authentication (`/api/ledger/*`, mounted from
`app.ts`). `POST /entries` is deliberately **not exposed** — normal
financial events are only ever created internally by
`PaymentService`/a future Module 14 orchestrator calling this module's
service directly, never accepted from an arbitrary client.

| Method | Path | Access |
|---|---|---|
| GET | `/api/ledger/:publicId` | entry's own farmer/buyer, or ADMIN |
| GET | `/api/ledger/transaction/:transactionId` | transaction's own farmer/buyer, or ADMIN |
| GET | `/api/ledger/transaction/:transactionId/summary` | transaction's own farmer/buyer, or ADMIN |
| GET | `/api/ledger/farmer/:farmerId` | that farmer, or ADMIN |
| GET | `/api/ledger/buyer/:buyerId` | that buyer, or ADMIN |
| POST | `/api/ledger/:publicId/reverse` | ADMIN only |
| POST | `/api/ledger/adjustments` | ADMIN only |

Full request/response schemas are documented inline as `@openapi`
JSDoc on each route in `digital-transaction-ledger.routes.ts` and are
picked up by the existing Swagger generation automatically (no
`src/config/swagger.ts` change was needed — tags are derived from route
annotations in this codebase).

## Decimal / JSON handling

`amount` is `Decimal(16,2)` at the database level. The repository never
passes a `Prisma.Decimal` through arithmetic — `decimalToNumber()` in
`digital-transaction-ledger.types.ts` converts via `.toString()` +
`Number(...)` at the DTO boundary only, matching Module 19's own
`decimalToNumber` helper. `NaN`/`Infinity` can never reach a response
because every amount either comes from a validated finite `number`
(manual adjustment) or from another module's own already-validated
Decimal (payment/net-realization handoff).

## Audit

Every ledger-affecting action is recorded via the existing
`AuditService` (`LEDGER_ENTRY_CREATED`, `LEDGER_REVERSAL_CREATED`,
`LEDGER_MANUAL_ADJUSTMENT_CREATED`) — actor, action, entity, and
relevant metadata (transaction id, event type, amount, reason where
applicable). A deduped (idempotent replay) write does **not** emit a
second audit event, since no new financial fact was recorded. No
password, token, or payment credential is ever included — the same
`sanitizeMetadata()` already applied to every other module's audit
events applies here too.

## Failure behavior

- **Ledger recording never blocks Module 19.** `PaymentService`'s
  `PaymentLedgerHook` calls are `await`ed but their failure is not
  caught inside `PaymentService` in this version — a genuine ledger
  write failure (e.g. a transient DB error) will currently surface as a
  failure of the *payment* request too, even though the payment itself
  was already durably recorded before the hook ran. This is a known,
  intentional trade-off for this version (fail loudly rather than
  silently drop a ledger entry); wrapping the hook call in an
  error-swallowing `try/catch` plus a retry/reconciliation job is the
  natural next step if silent ledger gaps become an operational
  concern.
- **Unresolved Module 14 values are never fabricated.** `recordNetRealizationSnapshot()`
  throws `LEDGER_UNKNOWN_SOURCE_EVENT` rather than recording a zero or
  guessed figure when `netRealization` is `null`.
- **Prisma engine binary.** This build sandbox cannot reach
  `binaries.prisma.sh` (403 Forbidden on both the checksum and the
  engine file itself, even with `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`),
  so `npx prisma generate` / `format` / `validate` / `migrate dev` could
  not be run here — the same limitation already documented for Modules
  16–19's own hand-authored migrations (see
  `prisma/migrations/20260924000000_add_digital_transaction_ledger/migration.sql`'s
  own header comment). The migration SQL was instead hand-authored and
  cross-checked field-by-field against the Prisma schema. Once real
  network access to `binaries.prisma.sh` is available, run
  `npx prisma generate` (required before any of this module's TypeScript
  will actually compile against a real `@prisma/client` — see
  "Verification" in the final report) and `npx prisma migrate resolve
  --applied 20260924000000_add_digital_transaction_ledger` if the SQL
  above was already applied by hand.

## Examples

**Recording a payment obligation (internal, from Module 19):**

```
PaymentService.createObligation() succeeds
  -> ledgerHook.recordPaymentEvent(handoff, "PAYMENT_OBLIGATION_CREATED", adminId)
  -> DigitalTransactionLedger row: transactionId=<deliveryId>, eventType=PAYMENT_OBLIGATION_CREATED,
     direction=CREDIT, amount=12500.00, sourceModule=MODULE_19_PAYMENT, sourceEntityId=sourceEventId=<obligationId>
```

**A farmer viewing their transaction ledger:**

```
GET /api/ledger/transaction/<deliveryId>
-> [ { eventType: "PAYMENT_OBLIGATION_CREATED", direction: "CREDIT", amount: 12500 },
     { eventType: "PARTIAL_PAYMENT", direction: "DEBIT", amount: 5000 } ]
```

**An admin reversing a mistaken payment, then recording the correct one:**

```
POST /api/ledger/<entryPublicId>/reverse { "reason": "Duplicate submission" }
-> new REVERSAL row, direction=CREDIT (opposite of the DEBIT it reverses), reversalOfEntryId=<entryId>
-- the original PARTIAL_PAYMENT row is untouched --
PaymentService.recordPayment(...) with the corrected amount
-> a fresh PARTIAL_PAYMENT/FINAL_PAYMENT row, its own sourceEventId (the new PaymentRecord.id)
```
