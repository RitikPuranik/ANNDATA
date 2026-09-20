import express, { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { whatsappLinkCodeRateLimiter } from "../../middleware/rateLimiters";
import type { AuditService } from "../audit/audit.service";
import type { AuthRepository } from "../auth/auth.repository";
import { createAuthMiddleware } from "../auth/auth.middleware";
import type { WhatsAppAccountController, WhatsAppWebhookController } from "./whatsapp-webhook.controller";

/**
 * Webhook router. Must be mounted BEFORE the global express.json(): the
 * signature is computed over the exact raw bytes, so this router parses its
 * own body with express.raw().
 */
export function createWhatsAppWebhookRouter(controller: WhatsAppWebhookController): Router {
  const router = Router();
  router.get("/api/whatsapp/webhook", controller.verify);
  router.post("/api/whatsapp/webhook", express.raw({ type: "*/*", limit: "1mb" }), asyncHandler(controller.receive));
  return router;
}

/** Authenticated farmer endpoints for linking a WhatsApp number (mounted after express.json()). */
export function createWhatsAppAccountRouter(controller: WhatsAppAccountController, authRepo: AuthRepository, audit: AuditService): Router {
  const router = Router();
  const { authenticate, requireAnyRole } = createAuthMiddleware(authRepo, audit);
  router.use("/api/whatsapp/link", authenticate, requireAnyRole("FARMER"));
  router.get("/api/whatsapp/link", asyncHandler(controller.status));
  router.post("/api/whatsapp/link/code", whatsappLinkCodeRateLimiter(), asyncHandler(controller.issueCode));
  router.delete("/api/whatsapp/link", asyncHandler(controller.unlink));
  return router;
}

/**
 * @openapi
 * /api/whatsapp/webhook:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Meta webhook verification handshake
 *     description: |
 *       Called by Meta when you subscribe the webhook in the Meta App dashboard.
 *       Echoes `hub.challenge` (as plain text) only when `hub.mode=subscribe` and
 *       `hub.verify_token` equals the server's `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
 *       The token is never returned. Returns 503 when `WHATSAPP_ENABLED=false`.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema: { type: string, example: subscribe }
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema: { type: string }
 *         description: Must match the configured verify token.
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema: { type: string, example: "1158201444" }
 *     responses:
 *       200:
 *         description: The challenge string, unchanged.
 *         content:
 *           text/plain:
 *             schema: { type: string, example: "1158201444" }
 *       400: { description: "Missing or invalid query parameters" }
 *       403: { description: "Verify token mismatch" }
 *       503: { description: "WhatsApp integration is disabled" }
 *   post:
 *     tags: [WhatsApp]
 *     summary: Receive WhatsApp Cloud API events
 *     description: |
 *       Receives message and status events from the WhatsApp Business Platform.
 *
 *       **Authentication:** none of FarmLink's JWT auth applies. Every request must carry
 *       `X-Hub-Signature-256: sha256=<hex>` — an HMAC-SHA256 of the *raw request body* keyed with the
 *       Meta **App Secret** (`WHATSAPP_APP_SECRET`). Requests with a missing/invalid signature are rejected (401).
 *
 *       **Processing:** the event is validated and persisted (idempotent on the WhatsApp message id —
 *       Meta retries are acknowledged and ignored), the endpoint replies `200` immediately, and the
 *       message is processed asynchronously. Reply messages are sent through the WhatsApp Cloud API.
 *
 *       Supported inbound message types: `text`, `interactive` (button/list replies), `location`.
 *       `audio`/`image` receive a "text only" hint (voice transcription is a pluggable provider).
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Hub-Signature-256
 *         required: true
 *         schema: { type: string, example: "sha256=<64 hex chars>" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [object, entry]
 *             properties:
 *               object: { type: string, enum: [whatsapp_business_account] }
 *               entry:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     changes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           field: { type: string, example: messages }
 *                           value:
 *                             type: object
 *                             properties:
 *                               messaging_product: { type: string, example: whatsapp }
 *                               metadata:
 *                                 type: object
 *                                 properties:
 *                                   phone_number_id: { type: string }
 *                               contacts:
 *                                 type: array
 *                                 items: { type: object }
 *                               messages:
 *                                 type: array
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     id: { type: string, example: "wamid.HBgM..." }
 *                                     from: { type: string, example: "919800000000" }
 *                                     timestamp: { type: string, example: "1789890000" }
 *                                     type: { type: string, enum: [text, interactive, location, audio, image] }
 *                                     text:
 *                                       type: object
 *                                       properties:
 *                                         body: { type: string, example: buyer }
 *                               statuses:
 *                                 type: array
 *                                 items: { type: object }
 *     responses:
 *       200:
 *         description: Event accepted (or recognised as a duplicate delivery).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accepted: { type: integer, example: 1 }
 *                     duplicates: { type: integer, example: 0 }
 *                 message: { type: string, example: Event received }
 *       400: { description: "Malformed JSON or payload that fails validation" }
 *       401: { description: "Missing or invalid X-Hub-Signature-256" }
 *       500: { description: "Event could not be recorded — Meta will retry (safe: idempotent)" }
 *       503: { description: "WhatsApp integration is disabled" }
 * /api/whatsapp/link:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Is the logged-in farmer's WhatsApp linked?
 *     description: Returns whether a WhatsApp number is linked, with the number masked (last 4 digits only).
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Link status" }
 *       401: { description: "Not authenticated" }
 *       403: { description: "Farmers only" }
 *   delete:
 *     tags: [WhatsApp]
 *     summary: Unlink the farmer's WhatsApp number
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Unlinked (idempotent)" }
 *       401: { description: "Not authenticated" }
 *       403: { description: "Farmers only" }
 * /api/whatsapp/link/code:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Create a one-time WhatsApp link code
 *     description: |
 *       The logged-in farmer receives a single-use code (valid 10 minutes, shown once, stored only as a
 *       hash). Sending `LINK <code>` to FarmLink's WhatsApp number from the farmer's phone binds that
 *       WhatsApp number to this account. Limited to 5 codes per hour per user.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Code created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     code: { type: string, example: "K7QM4XWD" }
 *                     expiresAt: { type: string, format: date-time }
 *                     instruction: { type: string }
 *       401: { description: "Not authenticated" }
 *       403: { description: "Farmers only" }
 *       429: { description: "Too many codes requested" }
 */
