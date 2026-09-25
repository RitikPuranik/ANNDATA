# ANNDATA / Anndata Intelligence Platform

**SIH26132** — Strengthening market linkages, price discovery, storage intelligence, and transparent agricultural trade workflows.

Anndata is the backend intelligence and transaction platform behind **ANNDATA**, designed to connect farmers, FPOs, buyers, warehouses, transporters, and downstream trade workflows through a modular architecture.

The repository contains:

- **Backend:** Express + TypeScript + Prisma + PostgreSQL
- **Frontend:** Next.js + TypeScript + Tailwind CSS
- **WhatsApp:** Meta WhatsApp Business Cloud API
- **Caching / rate limiting:** Redis with an in-memory fallback
- **Observability:** Sentry + PostHog integration points
- **Testing:** Jest + Supertest, with Playwright/E2E support

The system is being developed module-by-module. Later modules consume earlier domain services instead of recreating their data or authorization logic.

---

## Current Implementation Status

| # | Module | Status |
|---|---|---|
| 1 | Authentication & RBAC | ✅ Complete |
| 2 | Farmer & Farm Profile | ✅ Complete |
| 3 | FPO Management & Aggregation | ✅ Complete |
| 4 | Crop / Lot Management | ✅ Complete |
| 5 | Quality Grading & Produce Assessment | ✅ Complete |
| 6 | Market Intelligence & Mandi Prices | ✅ Complete |
| 7 | Price Forecasting | ✅ Complete |
| 8 | Sell vs Store Decision Engine | ✅ Complete |
| 9 | Warehouse Intelligence | ✅ Complete |
| 10 | Buyer Management & Verification | ✅ Complete |
| 11 | Buyer Demand | ✅ Complete |
| 12 | Farmer-Buyer Matching | ✅ Complete |
| 13 | RFQ / Offers / Negotiation | ✅ Complete |
| 14 | Net Realization Calculator | ✅ Complete |
| 15 | Transporter & Vehicle Network | ✅ Complete |
| 16 | Logistics Quote & Optimization | ✅ Complete |
| 17 | Shipment & GPS Tracking | ✅ Complete |
| 18 | Delivery & Quality Reconciliation | ✅ Complete |
| 19 | Payment Status Tracking | ✅ Complete |
| 20 | Digital Transaction Ledger | ✅ Complete |
| 21 | Dispute & Grievance Management | ✅ Complete |
| 22 | Notifications & Alerts | 🟡 Shared infrastructure/hooks exist; full module pending |
| 23 | Multilingual / Voice / Low-Connectivity | ❌ Planned |
| 24 | Fraud & Risk Detection | ❌ Planned |
| 25 | Analytics & Impact Dashboard | ❌ Planned |
| 26 | Admin & Government Dashboard | 🟡 Partial functionality exists |
| 27 | External API / Integration Layer | 🟡 Provider/integration boundaries exist |
| 28 | Audit, Security & Monitoring | 🟡 Shared infrastructure implemented across modules |
| 29 | AI/ML Platform | 🟡 Provider boundaries exist; standalone platform pending |
| 30 | WhatsApp API Integration | ✅ Complete |

### Important status note

Module 19 is implemented as a **payment status system**, not a payment gateway. It records obligations and payment records/statuses but does not itself move money through UPI, cards, banks, or escrow.

Module 20 is implemented as an **append-only, auditable financial history** built on Module 19's handoff contract — it is also not a payment gateway and never moves money. `TRADE_VALUE_RECORDED`/`LOGISTICS_COST_RECORDED`/`STORAGE_COST_RECORDED`/`OTHER_DEDUCTION_RECORDED`/`DELIVERY_ADJUSTMENT`/`REFUND` event types exist but are not yet auto-wired from Module 13/14/18, since no existing business rule in those modules currently produces those figures independently — see `docs/modules/module-20-digital-transaction-ledger.md` for the full breakdown of what is and isn't wired.

Module 21 is implemented as a **dispute/grievance record and lifecycle
system**, not a payment system — a resolution's financial consequence is
only ever a reference to an already-existing Module 19 `PaymentObligation`
/ Module 20 ledger entry, never an amount this module invents or moves
itself. See `docs/modules/module-21-dispute-grievance-management.md`.

Module 30 is the completed **Meta WhatsApp Business Cloud API integration**, including webhook handling, signature verification, inbound/outbound messaging, public guest conversations, linked-farmer workflows, idempotency, rate limiting, conversation persistence, and Meta provider integration.

---

# Platform Architecture

At a high level:

```text
                         ┌──────────────────────┐
                         │      ANNDATA         │
                         │ Farmer / Buyer UI    │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              Next.js Web                     WhatsApp
                    │                       Meta Cloud API
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                              Express API
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
      Auth / RBAC              Domain Services          WhatsApp Channel
          │                         │                         │
          │       ┌─────────────────┼─────────────────┐       │
          │       │                 │                 │       │
          │    Market          Buyer / Trade       Logistics   │
          │    Intelligence    Workflow            / Delivery │
          │       │                 │                 │       │
          └───────┴─────────────────┴─────────────────┴───────┘
                                    │
                           Repository / Prisma
                                    │
                              PostgreSQL
                                    │
                                  Redis
```

The core backend pattern is:

```text
Route
  ↓
Controller
  ↓
Service / Domain Engine
  ↓
Repository
  ↓
Prisma
  ↓
PostgreSQL
```

Cross-cutting infrastructure includes:

- Authentication and RBAC
- Ownership and authorization services
- Zod validation
- Structured error handling
- Audit logging
- Swagger / OpenAPI
- Redis-backed rate limiting and locks
- Sentry integration
- PostHog event integration
- Deterministic state machines
- Decimal-safe financial and quantity calculations

---

# Repository Structure

```text
ANNDATA/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── jobs/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── farmers/
│   │   │   ├── farms/
│   │   │   ├── crops/
│   │   │   ├── fpo/
│   │   │   ├── lots/
│   │   │   ├── quality/
│   │   │   ├── market-intelligence/
│   │   │   ├── price-forecasting/
│   │   │   ├── sell-vs-store/
│   │   │   ├── warehouse-intelligence/
│   │   │   ├── buyer-matching/
│   │   │   ├── net-realization/
│   │   │   ├── transporters/
│   │   │   ├── logistics/
│   │   │   ├── shipments/
│   │   │   ├── deliveries/
│   │   │   ├── payments/
│   │   │   └── whatsapp/
│   │   └── server.ts
│   └── tests/
├── frontend/
├── docs/
│   └── modules/
├── e2e/
├── PROJECT_CONTEXT.md
└── README.md
```

---

# Core Business Flow

The platform currently covers the following end-to-end domain flow:

```text
Farmer / FPO
     │
     ▼
Farm & Crop Profile
     │
     ▼
Crop Lot
     │
     ▼
Quality Assessment
     │
     ├──────────────► Market Intelligence
     │                       │
     │                       ▼
     │                 Price Forecast
     │                       │
     │                       ▼
     │                 Sell vs Store
     │                       │
     │              ┌────────┴────────┐
     │              ▼                 ▼
     │          Sell Now            Store
     │              │                 │
     │              ▼                 ▼
     │        Buyer Demand       Warehouse
     │              │
     │              ▼
     │       Buyer Matching
     │              │
     │              ▼
     │       RFQ / Offers
     │              │
     │              ▼
     │      Net Realization
     │              │
     │              ▼
     │     Logistics Optimization
     │              │
     │              ▼
     │       Shipment / GPS
     │              │
     │              ▼
     │ Delivery & Reconciliation
     │              │
     │              ▼
     │     Payment Status
     │              │
     │              ▼
     │    Transaction Ledger
     │              │
     │              ▼
     │      Dispute / Grievance
```

---

# Module Details

## Module 1 — Authentication & RBAC

Foundation for all authenticated workflows.

- Registration and login
- JWT access tokens
- Rotating HttpOnly refresh sessions
- Logout / logout-all-sessions
- Password change/reset flows
- Role-based access control
- Account status handling
- Rate limiting
- Security middleware
- Audit logging
- Swagger/OpenAPI

All later modules reuse this identity and authorization layer.

---

## Module 2 — Farmer & Farm Profile

Provides the agricultural identity used throughout the platform.

- Farmer profiles
- Multiple farms per farmer
- Structured location hierarchy
- Farmer crop records
- Irrigation metadata
- Farm metadata
- Selling preferences
- Crop and reference data
- Profile completion

---

## Module 3 — FPO Management & Aggregation

Handles Farmer Producer Organizations and their members.

- FPO registration and verification
- FPO administrators
- Membership requests and approval
- Member lifecycle
- Crop-wise supply aggregation
- Aggregation targets
- FPO analytics
- Government read-only summaries
- FPO authorization

---

## Module 4 — Crop / Lot Management

Introduces the actual transactional produce object: `CropLot`.

- Farmer-owned lots
- FPO-owned lots
- Draft / publish / cancel lifecycle
- Append-only status history
- KG / QTL / TONNE normalization
- Decimal quantity storage
- Quantity reservation foundations
- Lot ownership and authorization
- Farmer lot summaries
- FPO lot management

Lot quantities use precise Decimal storage because later trade, logistics, delivery, and payment calculations depend on them.

---

## Module 5 — Quality Grading & Produce Assessment

Quality is treated as evidence with explicit trust levels.

- Self-reported quality
- AI-estimated quality
- Human/lab verification
- Crop-specific quality standards
- Flexible metrics
- Defect records
- Quality images/metadata
- Quality scoring
- AI confidence scoring
- Human review for low-confidence results
- Assessment history and supersession

AI output is never automatically treated as certified truth.

---

## Module 6 — Market Intelligence & Mandi Prices

Provides the market-price foundation.

- Mandi data
- Historical MandiPrice time series
- Crop aliases
- Mandi resolution
- INR/quintal normalization
- Price summaries
- Trends
- Volatility
- Anomaly analysis
- Freshness/confidence
- Nearby mandi discovery
- Regional benchmarks
- data.gov.in provider adapter
- Incremental synchronization
- Redis-locked scheduled sync

Market data is explicitly distinguished from real-time exchange-style pricing.

---

## Module 7 — Price Forecasting

Forecasting infrastructure built on historical market data.

- Forecast persistence
- Mandi / regional / crop-wide scopes
- Deterministic scope keys
- Idempotency
- Data sufficiency checks
- Historical preparation
- Daily aggregation
- Regional aggregation
- Coverage/gap analysis
- Outlier handling
- Forecast configuration
- Forecast repository/service boundaries

Sparse data does not silently become a confident forecast.

---

## Module 8 — Sell vs Store Decision Engine

Produces an explainable deterministic decision.

Possible outcomes:

```text
SELL_NOW
STORE
INSUFFICIENT_DATA
```

Inputs include:

- Market modal price
- Trend
- Volatility
- Freshness
- Confidence
- Lot quantity
- Crop
- Quality
- Storage availability
- Storage cost
- Storage duration
- Spoilage risk

The engine stores the input snapshot and decision metadata so historical decisions remain explainable.

An optional AI advisory layer exists as a provider boundary. AI does not replace the deterministic decision.

---

## Module 9 — Warehouse Intelligence

Storage discovery and suitability layer.

- Warehouses
- Storage units
- Storage capabilities
- Storage rates
- Capacity/availability
- Crop storage requirements
- Suitability analysis
- Storage risk
- Recommendation ranking
- Storage intelligence provider boundary
- Warehouse ingestion architecture

External warehouse availability is never presented as live unless an actual provider is configured.

---

## Module 10 — Buyer Management & Verification

Buyer identity and verification foundation.

- Buyer profiles
- Organization information
- Location
- Verification state
- Buyer account context

---

## Module 11 — Buyer Demand

Represents what buyers are looking to purchase.

- Crop demand
- Required/minimum quantities
- Quality requirements
- Price-range fields
- Delivery preferences
- Demand lifecycle
- Expiration handling
- Committed quantity protection

---

## Module 12 — Farmer-Buyer Matching

Deterministic matching between supply and demand.

Matching considers:

- Crop compatibility
- Quality compatibility
- Quantity fit
- Location proximity
- Match score

The same inputs produce reproducible rankings.

---

## Module 13 — RFQ / Offers / Negotiation

Trade negotiation lifecycle.

- Offers
- Counter-offers
- Accept
- Reject
- Withdraw
- Expiration
- Offer history
- Quantity reservation guards
- Double-booking protection
- Trade state transitions

---

## Module 14 — Net Realization Calculator

Calculates expected farmer realization after known costs and deductions.

The calculator is deterministic and does not fabricate unknown costs.

Unknown or unavailable values remain explicitly unavailable.

---

## Module 15 — Transporter & Vehicle Network

Registry layer for transport capacity.

- Transporter profiles
- Vehicle registry
- Service areas
- Availability
- Verification
- Discovery

This module does not itself perform logistics pricing, GPS tracking, or quote optimization.

---

## Module 16 — Logistics Quote & Optimization

Consumes transporter/vehicle information and creates logistics estimates and quotes.

- Logistics requests
- Route-distance estimation
- Cost estimation
- Vehicle eligibility
- Quote creation
- Quote lifecycle
- Quote acceptance
- Optimization engine
- Reliability-aware optimization
- Provider boundaries

The module hands off accepted logistics information to Module 17.

---

## Module 17 — Shipment & GPS Tracking

Turns accepted logistics into shipment execution.

- Shipment lifecycle
- Pickup/delivery states
- Driver assignment
- Vehicle association
- GPS/location ingestion
- Location history
- Cached latest location
- ETA estimation
- Route-progress estimation
- Shipment handoff contract

GPS tracking does not own transport pricing or payment processing.

---

## Module 18 — Delivery & Quality Reconciliation

Compares expected shipment quantities/quality against actual receipt.

- Delivery creation
- Receiving
- Weighment
- Delivery quality inspection
- Quantity reconciliation
- Quality reconciliation
- Delivery evidence
- Reconciliation outcomes
- Shipment handoff consumption

Module 18 reuses Module 5 quality standards rather than creating a second quality system.

---

## Module 19 — Payment Status Tracking

Tracks payment obligations and payment records after delivery/reconciliation.

This is intentionally **not a payment gateway**.

It supports:

- Payment obligations
- Payment records
- Payment status transitions
- Partial payments
- Paid / partially paid / overdue states
- Disputed/cancelled states
- Payment history
- Authorization
- Payment handoff for Module 20

It does **not** execute:

- UPI transfers
- Card payments
- Bank transfers
- Escrow
- Payment gateway settlement

The distinction is important: Anndata records the financial state of a trade without pretending to move money that it does not control.

---

## Module 20 — Digital Transaction Ledger

An append-only, auditable financial history built on top of Module 19's own payment handoff. This is also intentionally **not a payment gateway** — it never moves money, initiates a transfer, or fabricates a payment outcome; it only records what Module 13/14/18/19 have already established.

It supports:

- Immutable, append-only ledger entries (never updated or deleted — corrections are new compensating `REVERSAL` entries)
- Idempotent recording via a database uniqueness constraint on `(sourceModule, sourceEntityId, sourceEventId, eventType)` — a payment webhook retry or replay can never create a duplicate entry
- Transaction grouping (keyed on the Module 18 delivery id), farmer/buyer/source-module filtering
- `PAYMENT_OBLIGATION_CREATED` / `PAYMENT_RECORDED` / `PARTIAL_PAYMENT` / `FINAL_PAYMENT` recorded automatically from Module 19 via an optional `PaymentLedgerHook`
- A Module 14 net-realization snapshot recorder (available, not yet auto-triggered — see the module doc)
- Admin-only reversals and manual adjustments, both requiring an explicit reason and both fully audited
- Deterministic transaction summaries sourced from Module 19's own authoritative `PaymentObligation` balance, never a second payment-state machine

Full architecture, direction/balance semantics, and what is intentionally not yet wired: `docs/modules/module-20-digital-transaction-ledger.md`.

---

# WhatsApp Assistant

ANNDATA includes a public WhatsApp assistant built on the **Meta WhatsApp Business Cloud API**.

Documentation:

```text
docs/modules/module-whatsapp-farmer-assistant.md
```

## Architecture

```text
WhatsApp User
     │
     ▼
Meta WhatsApp Cloud API
     │
     ▼
POST /api/whatsapp/webhook
     │
     ├── Signature verification
     ├── Payload validation
     ├── Idempotency
     ├── Conversation persistence
     └── Per-number processing
              │
              ▼
       Identity Resolution
          /         \
     Linked Farmer  Guest
          │           │
          └─────┬─────┘
                ▼
        WhatsApp Command Router
                │
       ┌────────┼─────────┐
       ▼        ▼         ▼
     Market   Buyers    Farmer-only
     Data     Preview   workflows
       │        │         │
       └────────┴─────────┘
                │
                ▼
          Anndata services
                │
                ▼
           Meta WhatsApp
                │
                ▼
              User
```

## Public Guest Mode

A person does **not** need a Anndata account to start a WhatsApp conversation.

Guests can:

- Ask for help/menu
- Ask mandi prices
- Provide crop + quantity + location
- Search public buyer demand
- See safe buyer-preview information
- Learn how Anndata works
- Receive links to the Anndata website
- Start a selling-intent conversation

Example:

```text
User:
Mere paas 20 quintal gehu hai, mujhe bechna hai

Assistant:
Crop: Wheat
Quantity: 20 QTL

Please provide your district/location.
```

The public assistant does not create private Anndata records for an anonymous user.

Private operations such as viewing personal lots, offers, payments, shipments, or publishing a lot require a linked Anndata account.

## WhatsApp Identity

WhatsApp identity and Anndata account identity are deliberately separate.

```text
WhatsApp sender
     │
     ├── linked → Anndata User ID
     │
     └── unlinked → guest / userId = null
```

The system does not automatically trust phone-number equality as proof of account ownership.

`LINK <code>` is the explicit account-linking mechanism.

The development-only `WHATSAPP_DEV_AUTO_LINK_BY_MOBILE` setting is ignored in production.

## WhatsApp Security

- Meta webhook signature validation
- Idempotent inbound message processing
- Server-side interactive-action validation
- Private-data authorization
- Guest/public-data boundary
- Per-number rate limiting
- AI rate limiting
- Buyer-matching rate limiting
- Masked payment references
- No access tokens in outbound messages
- No internal database IDs exposed to users
- Conversation TTL
- Recovery job for interrupted processing

## WhatsApp Environment Variables

Required when `WHATSAPP_ENABLED=true`:

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=meta
WHATSAPP_API_BASE_URL=https://graph.facebook.com
WHATSAPP_API_VERSION=v21.0

WHATSAPP_ACCESS_TOKEN=<Meta access token>
WHATSAPP_PHONE_NUMBER_ID=<Meta phone number ID>
WHATSAPP_BUSINESS_ACCOUNT_ID=<Meta WABA ID>

WHATSAPP_WEBHOOK_VERIFY_TOKEN=<random webhook verify token>
WHATSAPP_APP_SECRET=<Meta app secret>

WHATSAPP_AI_PROVIDER=none
```

AI is optional. The deterministic WhatsApp assistant can operate with:

```env
WHATSAPP_AI_PROVIDER=none
```

Gemini is only required when:

```env
WHATSAPP_AI_PROVIDER=gemini
GEMINI_API_KEY=<key>
```

Never commit access tokens, App Secrets, database credentials, JWT secrets, or other production secrets.

---

# Meta WhatsApp Setup

The application expects a Meta WhatsApp Business Cloud API configuration.

Required values:

1. Meta WhatsApp Business Account ID
2. WhatsApp Phone Number ID
3. Access token
4. Meta App Secret
5. Webhook verification token

Webhook:

```text
GET  /api/whatsapp/webhook
POST /api/whatsapp/webhook
```

Production callback:

```text
https://<your-backend-domain>/api/whatsapp/webhook
```

The webhook must be publicly reachable over HTTPS.

For long-lived production credentials, use a Meta System User token with the required WhatsApp permissions rather than relying on a short-lived development token.

---

# Render Deployment

The backend is suitable for deployment as a Render Web Service.

Typical start command:

```bash
npx prisma generate && npx prisma migrate deploy && npm start
```

The backend starts from:

```text
backend/src/server.ts
```

and the package script is:

```json
"start": "tsx src/server.ts"
```

## Port

The application reads:

```env
PORT
```

from the environment.

Locally it defaults to:

```text
4000
```

On Render, use the `PORT` supplied by Render. Do not hard-code a production port.

The server should bind to the Render-provided port and an externally reachable interface.

## Health Check

```http
GET /health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

Use `/health` as the Render health-check path.

## Render troubleshooting

When Render reports:

```text
No open ports detected
Exited with status 1
```

do not assume the port is the root cause.

Check the logs immediately above that message for failures from:

```text
1. prisma generate
2. prisma migrate deploy
3. npm start
4. environment validation
5. database connection
```

The application calls:

```ts
await prisma.$connect();
```

before opening the HTTP server, so a database connection failure can prevent the port from ever opening.

---

# Environment Configuration

Core production variables include:

```env
NODE_ENV=production
PORT=<provided by platform>

DATABASE_URL=<PostgreSQL connection string>

JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
SESSION_SECRET=<secret>

FRONTEND_URL=https://<frontend-domain>
BACKEND_URL=https://<backend-domain>

REDIS_URL=<optional Redis URL>

SENTRY_DSN=<optional>
POSTHOG_API_KEY=<optional>
POSTHOG_HOST=https://app.posthog.com
```

Market synchronization:

```env
MARKET_SYNC_ENABLED=false
MARKET_DATA_GOV_API_KEY=
MARKET_DATA_GOV_RESOURCE_ID=
MARKET_DATA_GOV_BASE_URL=https://api.data.gov.in/resource
```

WhatsApp:

```env
WHATSAPP_ENABLED=false
WHATSAPP_PROVIDER=meta
WHATSAPP_API_BASE_URL=https://graph.facebook.com
WHATSAPP_API_VERSION=v21.0
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_AI_PROVIDER=none
```

Keep `WHATSAPP_ENABLED=false` when WhatsApp is not configured.

---

# Quick Start

## Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in the required environment variables, then:

```bash
npx prisma generate
npx prisma migrate dev
npm run dev
```

Backend:

```text
http://localhost:4000
```

Health:

```text
http://localhost:4000/health
```

Swagger:

```text
http://localhost:4000/api/docs
```

## Production database migration

```bash
npx prisma migrate deploy
```

Do not use `prisma migrate dev` against the production database.

---

# Useful Backend Scripts

From `backend/`:

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with watch mode |
| `npm start` | Production-style server startup |
| `npm run build` | TypeScript build |
| `npm run typecheck` | TypeScript validation |
| `npm run lint` | ESLint |
| `npm test` | Full Jest suite |
| `npm run test:unit` | Unit tests |
| `npm run test:integration` | Integration tests |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Development migration |
| `npm run prisma:migrate:deploy` | Apply existing migrations |
| `npm run prisma:seed` | Seed development data |
| `npm run sync:all` | Run configured synchronization jobs |

---

# Testing

The project uses Jest and Supertest for backend tests.

Important test areas include:

- Authentication
- RBAC
- Ownership
- FPO authorization
- Lot lifecycle
- Quantity reservation
- Quality grading
- Market intelligence
- Forecast sufficiency
- Sell/store decisions
- Warehouse intelligence
- Buyer matching
- Logistics
- Shipment state transitions
- Delivery reconciliation
- Payment status
- WhatsApp parsing and provider payloads
- WhatsApp guest/private authorization boundaries

WhatsApp tests can be run without a live Meta API:

```bash
cd backend
npm test -- tests/whatsapp tests/integration/whatsapp.app.test.ts
```

---

# Data Integrity Principles

Anndata follows strict domain-boundary rules.

### Authorization is server-side

The client never decides whether a farmer owns a lot or whether a buyer can access a demand.

### Existing domain services are reused

For example:

```text
WhatsApp
   ↓
BuyerMatchingService
   ↓
same matching rules used by web APIs
```

The WhatsApp channel does not implement a second matching algorithm.

### Unknown data is not invented

When a value is unavailable:

```text
UNKNOWN / UNAVAILABLE
```

is preferable to a fabricated estimate.

### Financial and quantity calculations are precise

Quantities and financial values that require arithmetic use Decimal-safe persistence and calculation boundaries.

### State transitions are explicit

Important business objects use server-enforced state machines and history records.

### Historical decisions remain explainable

Decision inputs are snapshotted so later changes to market or profile data do not rewrite what the system knew at the time.

---

# AI Principles

AI is used where it provides a measurable capability.

Current provider boundaries include:

- Price forecasting
- Quality analysis
- Sell/store advisory
- Optional WhatsApp intent/entity extraction

AI must not:

- bypass authorization
- invent market data
- expose private buyer information
- fabricate payment state
- fabricate GPS state
- silently replace deterministic business rules
- present predictions as guarantees

For WhatsApp, the default is:

```text
WHATSAPP_AI_PROVIDER=none
```

The deterministic parser is the baseline behavior.

---

# Data Trust & Provenance

External data should preserve:

- Source
- Source type
- Retrieved/updated timestamp
- Freshness
- Estimate/prediction/simulation status
- Confidence where applicable

The UI and APIs should distinguish:

```text
Market reference price
        ≠
Buyer target price
        ≠
Negotiated offer
        ≠
Accepted offer
        ≠
Payment status
```

Similarly:

```text
Estimated logistics cost
        ≠
Actual transporter quote
        ≠
Actual payment
```

---

# Observability

## Sentry

Used for technical error/performance monitoring.

Do not send:

- Passwords
- OTPs
- Access tokens
- Refresh tokens
- API keys
- Unnecessary sensitive personal data

## PostHog

Used for product/user analytics.

Analytics events should describe product behavior without leaking authentication secrets or unnecessary sensitive information.

---

# Documentation

Module specifications and supporting project documentation live under:

```text
docs/
```

Before modifying a module, read:

1. `PROJECT_CONTEXT.md`
2. The relevant module specification, when one exists
3. Direct dependencies
4. Existing tests
5. Existing routes, services, and repositories

# Engineering Rules for Future Modules

1. Reuse existing domain models.
2. Reuse existing authorization services.
3. Do not create duplicate user/farmer/buyer/FPO entities.
4. Do not duplicate quantity conversion logic.
5. Do not bypass server-side authorization.
6. Keep public IDs separate from internal database IDs.
7. Use Decimal for financial/quantity calculations where required.
8. Preserve state history for important lifecycle transitions.
9. Add provider interfaces for external integrations.
10. Keep deterministic business logic deterministic.
11. Represent unavailable information explicitly.
12. Add tests before declaring a module complete.
13. Update Swagger/OpenAPI when APIs change.
14. Update module documentation when architecture changes.
15. Never reset or destructively replace the production database to make a migration work.

---

# Roadmap

## Immediate

```text
Module 21
Dispute & Grievance Management
```

Module 20 (Digital Transaction Ledger) is complete — it consumed the finalized payment handoff from Module 19 and provides the immutable transaction history required for the platform's financial traceability. See `docs/modules/module-20-digital-transaction-ledger.md`.

## Following Modules

```text
21  Dispute & Grievance Management
22  Notifications & Alerts
23  Multilingual / Voice / Low-Connectivity
24  Fraud & Risk Detection
25  Analytics & Impact Dashboard
26  Admin & Government Dashboard
27  External API / Integration Layer
28  Audit, Security & Monitoring expansion
29  AI/ML Platform
```

---

# Project Direction

ANNDATA/Anndata is moving through a deliberate progression:

```text
Agricultural Identity
        ↓
Production & Quality
        ↓
Market Intelligence
        ↓
Decision Intelligence
        ↓
Buyer Discovery
        ↓
Trade Negotiation
        ↓
Economic Realization
        ↓
Logistics
        ↓
Shipment
        ↓
Delivery Reconciliation
        ↓
Payment Status
        ↓
Transaction Ledger
        ↓
Dispute / Trust / Analytics
```

The architecture is intentionally designed so each layer adds a new business capability without duplicating the foundations underneath it.

🌾 **ANNDATA / Anndata — from crop information to an explainable agricultural trade workflow.**
