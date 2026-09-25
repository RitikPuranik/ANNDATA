import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validateBody } from "../../middleware/validateBody";
import { validateParams } from "../../middleware/validateParams";
import { validateQuery } from "../../middleware/validateQuery";
import { AuditService } from "../audit/audit.service";
import { AuthRepository } from "../auth/auth.repository";
import { createAuthMiddleware } from "../auth/auth.middleware";
import { DigitalTransactionLedgerController } from "./digital-transaction-ledger.controller";
import { DigitalTransactionLedgerService } from "./digital-transaction-ledger.service";
import {
  createManualAdjustmentBody,
  createReversalBody,
  ledgerBuyerIdParams,
  ledgerEntryPublicIdParams,
  ledgerFarmerIdParams,
  ledgerTransactionIdParams,
  listLedgerQuery,
} from "./digital-transaction-ledger.schemas";

/**
 * Module 20 — Digital Transaction Ledger API. Mounted at "/api" by
 * app.ts, same prefix as every other module. Never a payment gateway —
 * no route here moves money; POST routes here only ever create an
 * append-only reversal or admin-authored manual adjustment, never a
 * normal financial event (those are created internally by
 * PaymentService/NetRealizationOrchestrationService calling this
 * module's service directly — Step: "Do NOT blindly expose POST
 * /entries to arbitrary clients").
 *
 * Every route requires authentication; role checks here only narrow
 * *which* roles may even attempt an action — LedgerAuthorizationService
 * enforces exactly who may view a *given* entry, never substituted for
 * here.
 */
export function createDigitalTransactionLedgerRouter(
  ledgerService: DigitalTransactionLedgerService,
  authRepo: AuthRepository,
  auditService: AuditService,
): Router {
  const router = Router();
  const controller = new DigitalTransactionLedgerController(ledgerService);
  const { authenticate: authMw, requireAnyRole } = createAuthMiddleware(authRepo, auditService);

  router.use(authMw);

  const anyParty = requireAnyRole("FARMER", "FPO_ADMIN", "BUYER", "ADMIN");
  const adminOnly = requireAnyRole("ADMIN");

  /**
   * @openapi
   * /api/ledger/{publicId}:
   *   get:
   *     tags: [Ledger]
   *     summary: Get a single ledger entry (Module 20)
   *     description: Append-only financial history entry. Visible only to the entry's own farmer/buyer (via LedgerAuthorizationService) or ADMIN.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Ledger entry retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not authorized to view this entry., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Ledger entry not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get("/api/ledger/:publicId", anyParty, validateParams(ledgerEntryPublicIdParams), asyncHandler(controller.getEntry));

  /**
   * @openapi
   * /api/ledger/{publicId}/reverse:
   *   post:
   *     tags: [Ledger]
   *     summary: Create a compensating reversal for a ledger entry (ADMIN only, Step "Reversals")
   *     description: |
   *       Never mutates the original entry — creates a new REVERSAL row
   *       referencing it via reversalOfEntryId. Rejects reversing an
   *       already-reversed entry or a reversal itself.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [reason], properties: { reason: { type: string, minLength: 3, maxLength: 500 } } }
   *     responses:
   *       201: { description: Reversal entry created., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       403: { description: Only ADMIN may reverse a ledger entry., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Ledger entry not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Entry already reversed, or is itself a reversal., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/api/ledger/:publicId/reverse",
    adminOnly,
    validateParams(ledgerEntryPublicIdParams),
    validateBody(createReversalBody),
    asyncHandler(controller.createReversal),
  );

  /**
   * @openapi
   * /api/ledger/adjustments:
   *   post:
   *     tags: [Ledger]
   *     summary: Create a manual ledger adjustment (ADMIN only, Step "Manual Adjustments")
   *     description: Requires an explicit reason and reference. Always append-only — never edits a historical entry.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [transactionId, amount, reason], properties: { transactionId: { type: string }, tradeId: { type: string, format: uuid }, lotId: { type: string, format: uuid }, farmerId: { type: string, format: uuid }, buyerId: { type: string, format: uuid }, amount: { type: number }, currency: { type: string }, reason: { type: string }, reference: { type: string } } }
   *     responses:
   *       201: { description: Manual adjustment recorded., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       403: { description: Only ADMIN may create a manual adjustment., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Missing reason, or amount is zero., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/api/ledger/adjustments",
    adminOnly,
    validateBody(createManualAdjustmentBody),
    asyncHandler(controller.createManualAdjustment),
  );

  /**
   * @openapi
   * /api/ledger/transaction/{transactionId}:
   *   get:
   *     tags: [Ledger]
   *     summary: Get the full append-only ledger for one transaction (Module 18 delivery id)
   *     parameters:
   *       - { name: transactionId, in: path, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Transaction ledger retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       403: { description: Not authorized to view this transaction., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/api/ledger/transaction/:transactionId",
    anyParty,
    validateParams(ledgerTransactionIdParams),
    asyncHandler(controller.getTransactionLedger),
  );

  /**
   * @openapi
   * /api/ledger/transaction/{transactionId}/summary:
   *   get:
   *     tags: [Ledger]
   *     summary: Deterministic financial summary for one transaction (Step "Transaction Summary")
   *     description: grossValue/amountPaid/amountOutstanding/status are read from Module 19's authoritative PaymentObligation; deductions/netRealization come from the ledger's own recorded entries.
   *     parameters:
   *       - { name: transactionId, in: path, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Transaction summary retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       404: { description: No ledger entries found for this transaction., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/api/ledger/transaction/:transactionId/summary",
    anyParty,
    validateParams(ledgerTransactionIdParams),
    asyncHandler(controller.getTransactionSummary),
  );

  /**
   * @openapi
   * /api/ledger/farmer/{farmerId}:
   *   get:
   *     tags: [Ledger]
   *     summary: Paginated ledger history for one farmer
   *     description: The farmer may only view their own history; ADMIN may view any.
   *     parameters:
   *       - { name: farmerId, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: page, in: query, schema: { type: integer, minimum: 1 } }
   *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100 } }
   *     responses:
   *       200: { description: Farmer ledger retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       403: { description: Not authorized to view this farmer's ledger., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/api/ledger/farmer/:farmerId",
    anyParty,
    validateParams(ledgerFarmerIdParams),
    validateQuery(listLedgerQuery),
    asyncHandler(controller.listByFarmer),
  );

  /**
   * @openapi
   * /api/ledger/buyer/{buyerId}:
   *   get:
   *     tags: [Ledger]
   *     summary: Paginated ledger history for one buyer
   *     description: The buyer may only view their own history; ADMIN may view any.
   *     parameters:
   *       - { name: buyerId, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: page, in: query, schema: { type: integer, minimum: 1 } }
   *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100 } }
   *     responses:
   *       200: { description: Buyer ledger retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       403: { description: Not authorized to view this buyer's ledger., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/api/ledger/buyer/:buyerId",
    anyParty,
    validateParams(ledgerBuyerIdParams),
    validateQuery(listLedgerQuery),
    asyncHandler(controller.listByBuyer),
  );

  return router;
}
