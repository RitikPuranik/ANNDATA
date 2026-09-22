import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validateBody } from "../../middleware/validateBody";
import { validateParams } from "../../middleware/validateParams";
import { validateQuery } from "../../middleware/validateQuery";
import { AuditService } from "../audit/audit.service";
import { AuthRepository } from "../auth/auth.repository";
import { createAuthMiddleware } from "../auth/auth.middleware";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import {
  cancelObligationBody,
  createPaymentObligationBody,
  listPaymentObligationsQuery,
  listPaymentRecordsQuery,
  markDisputedBody,
  paymentObligationPublicIdParams,
  recordPaymentBody,
} from "./payment.schemas";
import { z } from "zod";

const paymentRecordPublicIdParams = z.object({ recordPublicId: z.string().uuid("This value is not valid.") }).strict();

/**
 * Module 19 — Payment Status Tracking API. Mounted at "/api" by app.ts,
 * same prefix as every other module. A PAYMENT STATUS system, never a
 * payment gateway (Step 36) — no route here ever moves money.
 *
 * Every route requires authentication; role checks here only narrow
 * *which* roles may even attempt an action (Step 14) —
 * PaymentAuthorizationService enforces exactly who may operate on a
 * *given* obligation, never substituted for here.
 */
export function createPaymentRouter(paymentService: PaymentService, authRepo: AuthRepository, auditService: AuditService): Router {
  const router = Router();
  const controller = new PaymentController(paymentService);
  const { authenticate: authMw, requireAnyRole } = createAuthMiddleware(authRepo, auditService);

  router.use(authMw);

  const buyerOrAdmin = requireAnyRole("BUYER", "ADMIN");
  const sellerOrAdmin = requireAnyRole("FARMER", "FPO_ADMIN", "ADMIN");
  const anyParty = requireAnyRole("FARMER", "FPO_ADMIN", "BUYER", "ADMIN");
  const adminOnly = requireAnyRole("ADMIN");

  /**
   * @openapi
   * /api/payments/obligations:
   *   post:
   *     tags: [Payments]
   *     summary: Create a payment obligation from a reconciled delivery (Step 7/8/11)
   *     description: |
   *       The only client input is the delivery's publicId; buyer, seller,
   *       accepted quantity and price are all resolved server-side from
   *       Module 18's own reconciliation handoff and the delivery's
   *       accepted trade offer — never accepted from the request body
   *       (Step 2). The delivery must be RECONCILED and must not already
   *       have an obligation. Buyer of the delivery (or ADMIN) only.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [deliveryId], properties: { deliveryId: { type: string, format: uuid }, dueAt: { type: string, format: date-time, description: "ADMIN only; ignored for any other caller." } } }
   *     responses:
   *       201: { description: Payment obligation created., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: A payment obligation already exists for this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Delivery is not reconciled, or has no accepted trade offer/quantity., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *   get:
   *     tags: [Payments]
   *     summary: List payment obligations visible to the authenticated account
   *     description: Buyers see their own payable obligations; farmers/FPO admins see obligations where they are the seller; ADMIN sees everything.
   *     parameters:
   *       - { name: status, in: query, schema: { type: string, enum: [PENDING, PARTIALLY_PAID, PAID, OVERPAID, OVERDUE, CANCELLED, DISPUTED] } }
   *       - { name: buyerId, in: query, schema: { type: string, format: uuid } }
   *       - { name: sellerFarmerId, in: query, schema: { type: string, format: uuid } }
   *       - { name: sellerFpoId, in: query, schema: { type: string, format: uuid } }
   *       - { name: deliveryId, in: query, schema: { type: string, format: uuid } }
   *       - { name: overdueOnly, in: query, schema: { type: boolean } }
   *       - { name: from, in: query, schema: { type: string, format: date-time } }
   *       - { name: to, in: query, schema: { type: string, format: date-time } }
   *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
   *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
   *     responses:
   *       200: { description: Paginated obligation list., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/payments/obligations",
    buyerOrAdmin,
    validateBody(createPaymentObligationBody),
    asyncHandler(controller.createObligation),
  );
  router.get(
    "/payments/obligations",
    anyParty,
    validateQuery(listPaymentObligationsQuery),
    asyncHandler(controller.list),
  );

  /**
   * @openapi
   * /api/payments/obligations/{publicId}:
   *   get:
   *     tags: [Payments]
   *     summary: Get a single payment obligation, with its payment history
   *     description: OVERDUE is derived and advanced on read (Step 18) when dueAt has passed and amountDue > 0.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Payment obligation retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Payment obligation not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/payments/obligations/:publicId",
    anyParty,
    validateParams(paymentObligationPublicIdParams),
    asyncHandler(controller.get),
  );

  /**
   * @openapi
   * /api/payments/obligations/{publicId}/record-payment:
   *   post:
   *     tags: [Payments]
   *     summary: Report an externally made payment against this obligation (Step 5/13/21/22)
   *     description: |
   *       Never initiates a payment (Step 36) — records a payment already
   *       made outside Anndata. amountPaid/amountDue/status are always
   *       recalculated server-side from the full payment history, never
   *       trusted from the client (Step 13). idempotencyKey is required —
   *       a retried request with the same key is a no-op, never a
   *       duplicate record (Step 21). Buyer of this obligation (or ADMIN)
   *       only.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [amount, paymentMethod, idempotencyKey]
   *             properties:
   *               amount: { type: number, exclusiveMinimum: 0 }
   *               currency: { type: string, default: INR }
   *               paymentMethod: { type: string, enum: [BANK_TRANSFER, UPI, NEFT, RTGS, IMPS, CASH, CHEQUE, OTHER] }
   *               idempotencyKey: { type: string }
   *               externalReference: { type: string, description: "UTR/cheque/bank reference only — never a card number, CVV, PIN, or login credential." }
   *               paidAt: { type: string, format: date-time }
   *               notes: { type: string }
   *     responses:
   *       201: { description: Payment recorded (or the existing record returned unchanged for a repeated idempotencyKey)., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this obligation., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Payment obligation not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid amount, currency mismatch, or obligation is cancelled/disputed., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/payments/obligations/:publicId/record-payment",
    buyerOrAdmin,
    validateParams(paymentObligationPublicIdParams),
    validateBody(recordPaymentBody),
    asyncHandler(controller.recordPayment),
  );

  /**
   * @openapi
   * /api/payments/obligations/{publicId}/payments:
   *   get:
   *     tags: [Payments]
   *     summary: List every payment recorded against this obligation (Step 23 — append-only history)
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
   *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
   *     responses:
   *       200: { description: Paginated payment history., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Payment obligation not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/payments/obligations/:publicId/payments",
    anyParty,
    validateParams(paymentObligationPublicIdParams),
    validateQuery(listPaymentRecordsQuery),
    asyncHandler(controller.listPayments),
  );

  /**
   * @openapi
   * /api/payments/obligations/{publicId}/mark-disputed:
   *   post:
   *     tags: [Payments]
   *     summary: Raise a payment dispute (Step 4/14)
   *     description: Either party to the obligation (or ADMIN) may raise a dispute; not available once the obligation is CANCELLED.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
   *     responses:
   *       200: { description: Payment obligation marked as disputed., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not a party to this obligation., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Payment obligation not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: Obligation already updated by a concurrent request., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: A CANCELLED obligation cannot be disputed., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/payments/obligations/:publicId/mark-disputed",
    anyParty,
    validateParams(paymentObligationPublicIdParams),
    validateBody(markDisputedBody),
    asyncHandler(controller.markDisputed),
  );

  /**
   * @openapi
   * /api/payments/obligations/{publicId}/cancel:
   *   post:
   *     tags: [Payments]
   *     summary: Cancel a payment obligation (ADMIN only)
   *     description: Never available once PAID/OVERPAID/CANCELLED, and never given to either commercial party — an administrative decision only.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
   *     responses:
   *       200: { description: Payment obligation cancelled., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Only an administrator may cancel a payment obligation., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Payment obligation not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: Obligation already updated by a concurrent request., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Obligation cannot be cancelled from its current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/payments/obligations/:publicId/cancel",
    adminOnly,
    validateParams(paymentObligationPublicIdParams),
    validateBody(cancelObligationBody),
    asyncHandler(controller.cancel),
  );

  /**
   * @openapi
   * /api/payments/records/{recordPublicId}/confirm:
   *   post:
   *     tags: [Payments]
   *     summary: Confirm a buyer-reported payment (Step 15 — RECORDED -> CONFIRMED)
   *     description: Only the obligation's own seller (or ADMIN) may confirm; a buyer can never confirm their own reported payment.
   *     parameters:
   *       - { name: recordPublicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Payment confirmed., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the seller of this obligation., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Payment record not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Only a RECORDED payment may be confirmed., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/payments/records/:recordPublicId/confirm",
    sellerOrAdmin,
    validateParams(paymentRecordPublicIdParams),
    asyncHandler(controller.confirmPayment),
  );

  /**
   * @openapi
   * /api/payments/records/{recordPublicId}/handoff:
   *   get:
   *     tags: [Payments]
   *     summary: Step 28 — the finalized contract Module 20 (Digital Transaction Ledger) consumes
   *     description: Never implements ledger functionality itself (Step 37) — a read-only projection of one completed payment.
   *     parameters:
   *       - { name: recordPublicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Handoff payload retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Payment record not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/payments/records/:recordPublicId/handoff",
    anyParty,
    validateParams(paymentRecordPublicIdParams),
    asyncHandler(controller.getRecordHandoff),
  );

  return router;
}
