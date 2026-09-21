# WhatsApp Farmer Assistant

A thin WhatsApp channel over ANNDATA's **existing** modules, using the official
**WhatsApp Business Platform (Meta Cloud API)**. It contains no business logic of
its own: every answer and every action comes from ANNDATA's deterministic
services. An LLM is optional and only ever extracts intent/entities.

```
Farmer ─ WhatsApp ─▶ Meta ─▶ POST /api/whatsapp/webhook
        signature check → validate → persist (idempotent) → 200 OK
                                        │  (async, one message per phone at a time)
                                        ▼
        identify farmer (link) OR guest → conversation state → command router
             │ deterministic commands / rules (no LLM)
             │ else optional LLM → Zod → confidence gate
             ▼
   LotsService · QualityService · BuyerMatchingService · MarketIntelligenceRepository
   PaymentService · ShipmentService · AuditService            (all reused, none duplicated)
             ▼
        reply (buttons / list / CTA-URL / text) ─▶ Meta ─▶ Farmer
```

## Commands

| Farmer says (examples) | Intent | ANNDATA module used |
|---|---|---|
| `buyer`, `find buyer`, `mujhe buyer chahiye`, `Mere paas 20 quintal gehu hai` | FIND_BUYER | Lots → Quality → Buyer Matching → Offers |
| `bhav`, `gehu ka bhav`, `mandi price` | CHECK_MANDI_PRICE | Market Intelligence (mandi prices) |
| `my lot`, `mera lot`, `meri fasal` | VIEW_LOTS | Lots |
| `offers`, `buyer offers` | VIEW_OFFERS | Buyer Matching / Trade Offers (accept · reject · counter · withdraw) |
| `payment`, `paisa kab milega` | VIEW_PAYMENT | Payment Status Tracking (read-only) |
| `shipment`, `mera maal kaha hai` | VIEW_SHIPMENT | Shipment & GPS Tracking (read-only) |
| `help`, `menu`, `madad`, `hi` | HELP | – |
| `how it works`, `anndata kaise kaam karta hai`, `about` | ABOUT | – (static explanation of the ANNDATA process) |
| `cancel`, `back` | CANCEL / BACK | – |
| anything else understood-but-unsupported (transactions, warehouse, transport, profile…) | WEBSITE | deep link to the ANNDATA website |

English, Hindi (Devanagari) and Hinglish are understood; replies follow the
language the farmer writes in (English until a message shows otherwise).
Everything above works for linked farmers. **Numbers that are not linked to an
account ("guests") get a subset** — see [Guest mode](#guest-mode-no-registration).
Adding a command = one `router.register(intent, handler)` call, or one row in the
parser's `WEBSITE_KEYWORDS` table for website-only features.

## Design decisions worth knowing

* **Identity = an explicit link, not the phone number.** `User.mobile` is not
  OTP-verified in ANNDATA today, so "same number" is not proof. A logged-in
  farmer calls `POST /api/whatsapp/link/code` (one-time, 8 chars, 10 min,
  hash-only storage, 5/hour) and sends `LINK <code>` from WhatsApp. Every
  service call afterwards uses the user id from that link — never anything in
  the message. Unlinked numbers are **guests**: they are never
  told whether an account exists for their number, and they only reach public data (see Guest mode). `WHATSAPP_DEV_AUTO_LINK_BY_MOBILE` exists for demos and is ignored in production.
* **Deep links use the real frontend routes** (`/dashboard`, `/lots/[id]`,
  `/trade-offers`, `/shipments/[id]`, `/market`, `/farms/new`, …). There is no
  payments or transactions page yet, so those link to `/dashboard` and
  `/net-realization`. A test walks `frontend/src/app` to guarantee every emitted route exists. Links never contain tokens.
* **"Indicative price" is the mandi reference price**, labelled as market data.
  ANNDATA's matching API deliberately hides the buyer's target price from
  farmers, so the assistant does not reveal it either. Demand, reference
  price, offer and accepted offer are always distinguished, and no buyer is
  presented as guaranteed.
* **Lots**: created through `LotsService` only after an explicit "Yes", reusing
  an existing identical lot when there is one. Requires an existing farm with that
  crop on ANNDATA (otherwise the farmer is sent to the website). A grade given on
  WhatsApp is stored as a *self-reported* quality assessment; the matching engine
  only weighs verified assessments.
* **Offers**: the assistant never has its own state machine. Accept / reject /
  counter / withdraw call `BuyerMatchingService`, so authorization, expiry,
  reservation and race handling stay in one place. Each action asks for confirmation.
* **Privacy**: payment references are masked (`UTR••••1234`), driver/vehicle ids
  are never shown, no internal ids appear in messages or button ids (buttons
  carry `opt:<n>`, resolved against server-side conversation state), outbound
  message bodies are not stored, stored inbound coordinates are rounded to ~100 m.
* **No queue exists in ANNDATA**, so the webhook persists the event, replies
  200, then processes in-process. A per-minute cron (`whatsapp-recovery.job.ts`)
  re-drives anything left `RECEIVED/PROCESSING` after a crash. A compare-and-set
  claim and deterministic outbound keys (`out:<wamid>:<n>`) guarantee a message is
  processed and answered once even with retries or several instances.
* **Rate limiting** reuses `config/redis.ts` (in-memory fallback) — per phone
  (messages/minute), per farmer (AI calls/hour, matching searches/hour), plus
  link-attempt limits.

## Guest mode (no registration)

A number that is not linked to a ANNDATA farmer account is not turned away. It
becomes a **guest** and can use everything that reads *public* data; anything that
creates or reads *account-owned* data answers with a sign-up card
(**🌐 Continue on ANNDATA** → `/register`).

| Guest can | How |
|---|---|
| Be understood (English / Hindi / Hinglish) | same deterministic parser; optional LLM is rate-limited per phone |
| Describe what they want to sell | crop → quantity → location → grade (same collection flow as farmers) |
| See mandi prices | `MarketIntelligenceRepository` (district is asked, since a guest has no farms) |
| Search buyer demand | `BuyerMatchingService.searchOpenDemand()` — open demand of VERIFIED buyers for the crop, scored by the same `scoreMatch()` |
| See buyer options / details | organisation, district, demand quantity. No contact details, no target price |
| Learn how ANNDATA works | `ABOUT` |
| Get the website link | `register` / `website` |

| Needs an account → "Continue on ANNDATA" | Typical message |
|---|---|
| create or publish a lot | (guests never reach lot creation) |
| send an offer | the "Request offer" button |
| see private offers, payments, shipments | `offers`, `payment`, `shipment` |
| see / manage lots, farms, crops, profile, other website tools | `my lot`, `farm`, `warehouse`… |

How the boundary is enforced (not just by convention):

* **Types.** A guest message is a `GuestFlowInput` (no `farmer`). Every service that
  needs an account takes a `FlowInput`, so passing it a guest is a *compile error*;
  `isLinked()` is the only way to narrow. Handlers for private intents are wrapped
  in `linkedOnly()`.
* **State.** A guest can never answer a farm / price / confirmation step
  (`COLLECTING_FARM`, `COLLECTING_PRICE`, `AWAITING_CONFIRMATION`); such state found
  on a guest is dropped. When the identity behind a number changes (guest → linked
  via `LINK`, linked → guest after unlinking, or the number moves to another
  account) the conversation is reset, so a half-finished flow never carries over.
* **Data.** `searchOpenDemand` takes no user, lot or farmer, reads only demand of
  verified buyers, and never returns the buyer's target price or contact data.
  A guest's self-declared grade is *not* scored (it is unverified — the same rule
  as for farmers).
* **Abuse.** Buyer searches are limited per number
  (`WHATSAPP_MATCHING_RATE_LIMIT_PER_HOUR`), on top of the per-minute message limit.
  This is per WhatsApp number; there is no account to hold accountable.
* **Privacy.** A guest gets a `whatsapp_conversations` row (`userId` is null) and
  their inbound text is stored like any other message — include both in the
  retention policy.

## API

| | |
|---|---|
| `GET /api/whatsapp/webhook` | Meta verification handshake |
| `POST /api/whatsapp/webhook` | Events; `X-Hub-Signature-256` required |
| `POST /api/whatsapp/link/code` | Farmer (JWT): create a one-time link code |
| `GET /api/whatsapp/link` | Farmer (JWT): masked link status |
| `DELETE /api/whatsapp/link` | Farmer (JWT): unlink |

Documented in Swagger (`/api/docs`, tag **WhatsApp**).

## Database

Migration `20260919000000_add_whatsapp_assistant` adds `whatsapp_links`,
`whatsapp_conversations`, `whatsapp_messages` (+3 enums) and nothing else.
`whatsapp_messages.externalMessageId` is `UNIQUE` (webhook idempotency). Link
codes reuse the existing `otp_challenges` table (`purpose = 'WHATSAPP_LINK'`).

> The repository's `schema.prisma` did not validate before this work (ambiguous
> `LogisticsQuote` relations and two missing `Delivery` back-relations). Those
> were fixed minimally — Prisma-only changes, no DDL.

## Local testing

```bash
cd backend
npm ci && npx prisma generate && npx prisma migrate deploy
npm test -- tests/whatsapp tests/integration/whatsapp.app.test.ts   # no network, no DB needed
```

To try it end-to-end without Meta, run the server with `WHATSAPP_ENABLED=true`,
placeholder credentials, and send a signed webhook yourself:

```bash
BODY='{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"<PHONE_NUMBER_ID>"},"messages":[{"id":"wamid.TEST1","from":"919800000001","timestamp":"'$(date +%s)'","type":"text","text":{"body":"help"}}]}}]}]}'
SIG="sha256=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" | sed 's/^.* //')"
curl -i -X POST localhost:4000/api/whatsapp/webhook -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$BODY"
```
(Replies will fail to send with placeholder credentials — that is logged as
`[WhatsApp] provider_error` and recorded on the outbound row; it does not affect the webhook.)
To test against real WhatsApp locally, expose the port with a tunnel (e.g. ngrok) and use its HTTPS URL as the callback.

## Connecting the Meta WhatsApp Business account (manual steps)

1. **Meta Business Manager** → create/verify your business; **developers.facebook.com** → *Create app* → type *Business* → add the **WhatsApp** product.
2. **WhatsApp → API Setup**: add a phone number (a number not already registered on the consumer/Business app) or use Meta's test number while developing. Copy the **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`) and **WhatsApp Business Account ID** (`WHATSAPP_BUSINESS_ACCOUNT_ID`).
3. **Access token**: Business Settings → *System users* → create an admin system user → assign the app + WhatsApp account → generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` (choose *never expires*). → `WHATSAPP_ACCESS_TOKEN`. (The 24-hour token on the API Setup page is only for a quick test.)
4. **App Secret**: App settings → Basic → *App secret* → `WHATSAPP_APP_SECRET`.
5. Choose a random string → `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
6. Set `WHATSAPP_ENABLED=true`, `FRONTEND_URL` (used for links), deploy with a public **HTTPS** URL.
7. **WhatsApp → Configuration → Webhook**: Callback URL `https://<backend>/api/whatsapp/webhook`, Verify token = step 5 → *Verify and save*. Then *Manage* → subscribe to the **`messages`** field.
8. Add farmer test numbers (development mode) or complete business verification / app review for production.
9. Link a farmer: log in as a farmer, `POST /api/whatsapp/link/code`, send `LINK <code>` from that farmer's WhatsApp to your business number.

## Production notes

* Replies are free-form messages, which WhatsApp only allows **within 24 h of the farmer's last message**. Everything here is reply-only, so that holds; proactive notifications (e.g. "new offer") would require pre-approved templates — `sendTemplateMessage` exists in the provider but no template is wired.
* Per-number ordering uses an in-process lock; the DB claim keeps multi-instance deployments correct for exactly-once processing, but two messages from the same farmer landing on different instances at the same instant could interleave conversation-state writes. For strict ordering behind a load balancer, route by phone number or add a Redis/advisory lock.
* Rate-limit counters use Redis when `REDIS_URL` is set (shared across instances), else per-process memory.
* Keep the webhook route outside any CDN/WAF rule that rewrites the body — the HMAC covers the exact bytes. The route is mounted before the JSON parser for that reason.
* Rotate `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_APP_SECRET` like any secret; they are never logged and provider errors are sanitised.
* Retention: inbound message text (≤1000 chars) is stored for support. Add a purge job to your data-retention policy.

## Known limitations

* **Voice notes**: the STT provider interface and download path exist, but no STT implementation is configured (ANNDATA has none). Voice notes currently get the "text only" hint.
* **The guest → registered loop is not closed in the UI.** The sign-up card tells a guest to register and then link the number from Profile, but the frontend has no "Link WhatsApp" screen yet (next item).
* **No "Link WhatsApp" screen** in the frontend yet — the API is ready (`POST /api/whatsapp/link/code`); a button on the profile page needs to call it.
* Location matching uses ANNDATA's mandi districts/states and the farmer's own farms; **pincodes are not resolved** (no pincode dataset) — the farmer is asked for a district.
* Guest buyer results show the buyer's organisation name (as they do for farmers). To hide names until registration, mask `organizationName` in `WhatsAppBuyerAssistantService.toCards()` for guests.
* WhatsApp caps CTA / button labels at 20 characters (Meta truncates longer ones); a test now checks every label in every language.
* Creating a lot needs an existing farm + crop on the website (complex forms are intentionally not reproduced in chat).
* Payment disputes/escalation are not filed from WhatsApp (needs a reason and evidence); overdue/disputed payments link to the website.
* Verified against fakes and Meta's documented payload/limits. **Not yet exercised against live Meta, or a live PostgreSQL** (the sandbox could not download Prisma engines; the migration is hand-written — run `prisma migrate deploy`).
