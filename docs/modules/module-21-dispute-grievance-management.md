# Module 21 — Dispute & Grievance Management

## 1. Purpose

Lets farmers, FPO admins, buyers, transporters and administrators raise
disputes against ANNDATA transactions (or a general platform grievance),
investigate them, and resolve/close/reopen them with a complete, auditable,
append-only history. This is not a generic ticket/contact-us system — a
dispute is connected to the actual ANNDATA business entity it concerns
wherever applicable.

## 2. Scope

In scope: dispute/grievance creation, evidence, public comments and
internal notes, assignment, investigation-status tracking, resolution,
rejection, reopening, closure, cancellation, append-only history, RBAC/
IDOR protection, and references (never duplication) into Module 19
(payment status) and Module 20 (ledger) for financial consequences.

Out of scope (Step 40): payment gateway/UPI/bank transfer/escrow/wallet
logic, fabricated transaction amounts, a second ledger or notification
system, AI-decided legal outcomes, automatic fraud accusations. Fraud
detection is Module 24; notifications are Module 22; AI/ML platform is
Module 29.

## 3. Dispute types

`DisputeType`: `QUALITY_DISPUTE`, `QUANTITY_DISPUTE`, `PRICE_DISPUTE`,
`PAYMENT_DISPUTE`, `DELIVERY_DISPUTE`, `LOGISTICS_DISPUTE`,
`DAMAGE_DISPUTE`, `REJECTION_DISPUTE`, `DELAY_DISPUTE`, `OFFER_DISPUTE`,
`WEIGHT_DISPUTE`, `GRIEVANCE`, `OTHER`.

## 4. Grievance vs transaction dispute

A single `Dispute` model carries both concepts, distinguished by
`category` (`TRANSACTION` | `GRIEVANCE`) rather than two separate tables —
kept unified per the build spec's own preference. A `TRANSACTION`-category
dispute must reference at least one of `lotId` / `tradeOfferId` /
`shipmentId` / `deliveryId` / `paymentObligationId` (enforced server-side
in `dispute.service.ts`, independent of what the client sends); a
`GRIEVANCE`-category dispute may have none of them set.

## 5. Data model

`Dispute` (see `prisma/schema.prisma`) carries: `disputeNumber` (server-
generated, e.g. `DSP-2026-000123`), `type`, `category`, `title`,
`description`, `status`, `priority`, `raisedByUserId`/`raisedByRole`,
optional `farmerId`/`buyerId`/`transporterId` party references, optional
`lotId`/`tradeOfferId`/`shipmentId`/`deliveryId`/`paymentObligationId`
transaction references (nullable FKs with `onDelete: SetNull`, mirroring
`Delivery.tradeOfferId`'s own convention, so a dispute's history survives
even if a referenced entity is later removed), assignment fields,
resolution fields, and `financialAdjustmentPaymentObligationId`/
`financialAdjustmentLedgerEntryId` — references only, never invented
amounts.

Related models: `DisputeEvidence` (metadata/reference only — never binary
storage in Postgres, same convention as `DeliveryEvidence`),
`DisputeComment` (append-only; `visibility` is `PUBLIC_COMMENT` or
`INTERNAL_NOTE`), `DisputeHistoryEvent` (append-only event log, same
convention as `LotStatusHistory`/`ShipmentEvent`).

## 6. State machine

`dispute-state-machine.ts` implements the transition matrix:

```
OPEN                     -> UNDER_REVIEW, CANCELLED
UNDER_REVIEW             -> INVESTIGATION, AWAITING_PARTY_RESPONSE, RESOLUTION_PROPOSED, REJECTED, CANCELLED
INVESTIGATION            -> AWAITING_PARTY_RESPONSE, RESOLUTION_PROPOSED, REJECTED, CANCELLED
AWAITING_PARTY_RESPONSE  -> INVESTIGATION, RESOLUTION_PROPOSED, REJECTED, CANCELLED
RESOLUTION_PROPOSED      -> RESOLVED, REJECTED, INVESTIGATION
RESOLVED                 -> CLOSED
REJECTED                 -> CLOSED
CLOSED                   -> (terminal)
CANCELLED                -> (terminal)
```

Reopening (Step 18) is a distinct transition — `CLOSED`/`RESOLVED`/
`REJECTED` -> `INVESTIGATION` — that always writes its own `REOPENED`
history event rather than silently overwriting the prior status. All
transitions are enforced through an atomic conditional `updateMany`
(`DisputeRepository.transition`), so two concurrent admin actions on the
same dispute can never both succeed (Step 29).

## 7. Roles and permissions

- **FARMER / FPO_ADMIN** — create disputes involving their own
  farmer profile; view/comment/attach evidence on disputes where they are
  the raiser or the referenced farmer party; cannot assign, resolve,
  reject, close, reopen, or see internal notes.
- **BUYER** — same, scoped to their own buyer profile.
- **TRANSPORTER** — same, scoped to their own transporter profile.
- **ADMIN** — full access: assign, change status, resolve, reject,
  reopen, close, add internal notes, create on behalf of any party.

`DisputeAuthorizationService` resolves the caller's own farmer/buyer/
transporter profile id server-side on every call — a client-supplied
`farmerId`/`buyerId` is never trusted for authorization (Step 8/22).

## 8. Evidence handling

`POST /api/disputes/:publicId/evidence` stores metadata/reference only
(`storageProvider`, `externalId`, `secureUrl`, `fileName`, `mimeType`,
`sizeBytes`, optional `checksum`) — reusing whatever object-storage
provider the rest of ANNDATA already uses, never binary bytes in
Postgres. Evidence is never hard-deleted; `DELETE .../evidence/:evidenceId`
soft-marks `removedAt`/`removedByUserId` and writes an `EVIDENCE_REMOVED`
history event, so the row and the fact of its removal both remain part of
the permanent record. Only the original uploader or ADMIN may remove a
given evidence item.

## 9. Investigation workflow

ADMIN assigns a dispute to an investigator (`POST .../assign`), moves it
through `UNDER_REVIEW` -> `INVESTIGATION` -> (`AWAITING_PARTY_RESPONSE` as
needed) -> `RESOLUTION_PROPOSED` via `POST .../status`. The investigator is
expected to inspect the authoritative Module 4/5/13/14/16/17/18/19/20
records directly (through those modules' own read endpoints) using the
dispute's reference ids — Module 21 never duplicates that data locally.

## 10. Resolution workflow

`POST /api/disputes/:publicId/resolve` requires `resolutionCode`,
`resolutionSummary`, and `finalResolution` — never just "Resolved."
(Step 17). `POST .../reject` requires a `resolutionSummary`. Both write a
`RESOLVED`/`REJECTED` history event and are only reachable via the
explicit state-transition matrix above.

## 11. Financial integration

The dispute module never invents or manipulates a financial balance
(Step 16/39). A resolution may optionally carry
`financialAdjustmentPaymentObligationId` and/or
`financialAdjustmentLedgerEntryId` — publicIds of a **PaymentObligation**
(Module 19) and/or a **DigitalTransactionLedger** entry (Module 20) that
were already created through those modules' own services as a result of
the investigation's findings. `dispute.service.ts` validates both
references exist and records a `FINANCIAL_ADJUSTMENT_COMPLETED` history
event and a `DISPUTE_FINANCIAL_ADJUSTMENT_REQUESTED` audit event when
either is set; it creates neither record itself.

## 12. Module 19 integration

Module 19 (`PaymentObligation`/`PaymentRecord`) remains the sole source of
truth for payment status. A `PAYMENT_DISPUTE` references a
`paymentObligationId`; the investigator checks Module 19's own status;
any required payment-state consequence is carried out through Module 19's
own endpoints, then linked back via `financialAdjustmentPaymentObligationId`.

## 13. Module 20 integration

Module 20 (`DigitalTransactionLedger`) remains the sole authoritative,
append-only financial history. A resolution that requires a financial
correction is recorded there first (through Module 20's own service), and
the resulting entry's publicId is linked back via
`financialAdjustmentLedgerEntryId`. Module 21 never writes ledger rows.

## 14. API endpoints

All mounted under `/api`, authenticated, role-gated per §7:

```
POST   /disputes
GET    /disputes
GET    /disputes/:publicId
POST   /disputes/:publicId/comments
GET    /disputes/:publicId/comments
POST   /disputes/:publicId/evidence
GET    /disputes/:publicId/evidence
DELETE /disputes/:publicId/evidence/:evidenceId
GET    /disputes/:publicId/history
POST   /disputes/:publicId/assign        (ADMIN)
POST   /disputes/:publicId/unassign      (ADMIN)
POST   /disputes/:publicId/status        (ADMIN)
POST   /disputes/:publicId/resolve       (ADMIN)
POST   /disputes/:publicId/reject        (ADMIN)
POST   /disputes/:publicId/reopen        (ADMIN)
POST   /disputes/:publicId/close         (ADMIN)
POST   /disputes/:publicId/cancel        (raiser or ADMIN)
```

## 15. Security / IDOR protection

Every read/write resolves the caller's own farmer/buyer/transporter
profile id from their authenticated session, never from the request body
(Step 8/22). `DisputeAuthorizationService` is unit-tested against the
exact IDOR scenarios the build spec calls out (Farmer A vs Farmer B,
farmer vs unrelated buyer dispute, transporter vs unrelated shipment
dispute) in `tests/unit/dispute.authorization.test.ts`. Internal notes are
filtered out of every non-ADMIN response at the repository query level
(`listComments(disputeId, includeInternal)`), not just in the DTO mapper.

## 16. Audit trail

Every sensitive action (creation, status change, assignment, evidence add/
remove, internal note, resolution, rejection, reopening, closure,
financial-adjustment linkage) is recorded through the existing
`AuditService` under a dedicated `DISPUTE_*` `AuditAction`. No secrets or
unnecessary PII are logged.

## 17. Notification integration boundary

Module 22 does not yet exist. `dispute.service.ts` deliberately calls
`AuditService.record()` at every lifecycle transition and nothing else —
a future Module 22 can hook into those same transition points (assigned,
resolved, rejected, reopened, closed, response requested) without any
change to this module's own logic.

## 18. Testing

`tests/unit/dispute-state-machine.test.ts` — every legal/illegal
transition, terminal statuses, reopen eligibility.
`tests/unit/dispute.schemas.test.ts` — Zod validation boundaries (title/
description length, strict-object rejection, evidence cap, resolution
completeness, URL validation, date-range/pagination defaults).
`tests/unit/dispute.authorization.test.ts` — the mandatory IDOR scenarios
plus operate/comment/create-for authorization gates.

**Not yet added in this pass** (see the implementation report): repository/
service-level integration tests against a real Postgres instance,
controller/route-level Supertest coverage, and duplicate-dispute/
financial-integration integration tests — this sandbox has no database or
package-manager network access (see §19), so nothing beyond static/unit
-level TypeScript logic could be executed here.

## 19. Future extensions

Clean integration points are left for Module 22 (Notifications — see §17),
Module 24 (Fraud & Risk Detection — could consume `DisputeHistoryEvent`),
Module 25 (Analytics), Module 26 (Admin/Government Dashboard — could list
disputes by region/type), Module 28 (Audit/Security/Monitoring — already
consumed via `AuditService`), and Module 29 (AI/ML Platform — could
suggest a `resolutionCode`, never decide one).

## Environment note

This sandbox cannot reach `binaries.prisma.sh`, so `npx prisma generate`/
`validate`/`format` could not be run here (the same limitation the Module
16–20 migrations already documented in their own SQL headers). The Module
21 migration (`prisma/migrations/20260925000000_add_dispute_grievance_management/migration.sql`)
was hand-authored and cross-checked field-by-field against the Prisma
schema instead. Run `npx prisma generate` in an environment with normal
network access before running the backend or its test suite.
