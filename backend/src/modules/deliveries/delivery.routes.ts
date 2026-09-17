import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validateBody } from "../../middleware/validateBody";
import { validateParams } from "../../middleware/validateParams";
import { validateQuery } from "../../middleware/validateQuery";
import { AuditService } from "../audit/audit.service";
import { AuthRepository } from "../auth/auth.repository";
import { createAuthMiddleware } from "../auth/auth.middleware";
import { DeliveryController } from "./delivery.controller";
import { DeliveryService } from "./delivery.service";
import {
  acceptDeliveryBody,
  addEvidenceBody,
  createDeliveryBody,
  deliveryPublicIdParams,
  listDeliveriesQuery,
  partialAcceptDeliveryBody,
  receiveDeliveryBody,
  reconcileDeliveryBody,
  recordQualityAssessmentBody,
  recordWeighmentBody,
  rejectDeliveryBody,
} from "./delivery.schemas";

/**
 * Module 18 — Delivery & Quality Reconciliation API. Mounted at "/api" by
 * app.ts, same prefix as every other module. Every route requires
 * authentication; role checks here only narrow *which* roles may even
 * attempt an action (Step 13) — DeliveryService/DeliveryAuthorizationService
 * enforce exactly who may operate on a *given* delivery, never substituted
 * for here.
 */
export function createDeliveryRouter(deliveryService: DeliveryService, authRepo: AuthRepository, auditService: AuditService): Router {
  const router = Router();
  const controller = new DeliveryController(deliveryService);
  const { authenticate: authMw, requireAnyRole } = createAuthMiddleware(authRepo, auditService);

  router.use(authMw);

  const buyerOrAdmin = requireAnyRole("BUYER", "ADMIN");
  const anyAuthenticated = requireAnyRole(
    "FARMER",
    "FPO_ADMIN",
    "BUYER",
    "TRANSPORTER",
    "ADMIN",
    "WAREHOUSE_OPERATOR",
    "GOVERNMENT_VIEWER",
  );

  /**
   * @openapi
   * /api/deliveries:
   *   post:
   *     tags: [Deliveries]
   *     summary: Record a delivery from a completed Module 17 shipment
   *     description: |
   *       Step 11 — the only client input is the shipment's publicId; lot,
   *       buyer, expected quantity, and agreed quality are all resolved
   *       server-side from the shipment's own accepted trade offer. The
   *       shipment must be Module 17 DELIVERED, not cancelled, and must not
   *       already have a delivery recorded. Buyer of the resolved trade (or
   *       ADMIN) only.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [shipmentId], properties: { shipmentId: { type: string, format: uuid } } }
   *     responses:
   *       201: { description: Delivery created., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this trade., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: A delivery already exists for this shipment., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Shipment not eligible for delivery yet, or no accepted trade offer exists., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *   get:
   *     tags: [Deliveries]
   *     summary: List deliveries visible to the authenticated account
   *     description: Farmers/FPO admins see deliveries on their own lots, buyers see their own deliveries, transporters see deliveries for shipments they hauled, and ADMIN sees everything.
   *     parameters:
   *       - name: status
   *         in: query
   *         schema: { type: string, enum: [PENDING, RECEIVED, UNDER_INSPECTION, PARTIALLY_ACCEPTED, ACCEPTED, REJECTED, RECONCILED, CANCELLED] }
   *       - name: buyerId
   *         in: query
   *         schema: { type: string, format: uuid }
   *       - name: lotId
   *         in: query
   *         schema: { type: string, format: uuid }
   *       - name: shipmentId
   *         in: query
   *         schema: { type: string, format: uuid }
   *       - name: from
   *         in: query
   *         schema: { type: string, format: date-time }
   *       - name: to
   *         in: query
   *         schema: { type: string, format: date-time }
   *       - name: page
   *         in: query
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - name: limit
   *         in: query
   *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
   *     responses:
   *       200: { description: Paginated delivery list., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post("/deliveries", buyerOrAdmin, validateBody(createDeliveryBody), asyncHandler(controller.create));
  router.get("/deliveries", anyAuthenticated, validateQuery(listDeliveriesQuery), asyncHandler(controller.list));

  /**
   * @openapi
   * /api/deliveries/{publicId}:
   *   get:
   *     tags: [Deliveries]
   *     summary: Get a single delivery, with its latest weighment/quality assessment/reconciliation
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Delivery retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get("/deliveries/:publicId", anyAuthenticated, validateParams(deliveryPublicIdParams), asyncHandler(controller.get));

  /**
   * @openapi
   * /api/deliveries/{publicId}/handoff:
   *   get:
   *     tags: [Deliveries]
   *     summary: Step 25 — the finalized contract Module 19 (Payment Status) consumes
   *     description: Never initiates or changes payment (Step 35) — a read-only projection of quantity/quality/reconciliation facts.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Handoff payload retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/deliveries/:publicId/handoff",
    anyAuthenticated,
    validateParams(deliveryPublicIdParams),
    asyncHandler(controller.getHandoff),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/receive:
   *   post:
   *     tags: [Deliveries]
   *     summary: Mark a delivery received (PENDING -> RECEIVED)
   *     description: Step 14 — an optional manually recorded quantity is used only until a verified weighment is recorded, which always then takes precedence. Buyer of this delivery (or ADMIN) only.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema: { type: object, properties: { manuallyRecordedQuantityKg: { type: number }, receivedAt: { type: string, format: date-time } } }
   *     responses:
   *       200: { description: Delivery received., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: Delivery already updated by someone else., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid transition for the delivery's current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/receive",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(receiveDeliveryBody),
    asyncHandler(controller.receive),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/weighment:
   *   post:
   *     tags: [Deliveries]
   *     summary: Record a weighment (Step 3 — net weight is always computed server-side)
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [grossWeightKg, tareWeightKg]
   *             properties:
   *               grossWeightKg: { type: number }
   *               tareWeightKg: { type: number }
   *               weightUnit: { type: string, enum: [KG, QTL, TONNE] }
   *               weighingMethod: { type: string, enum: [WEIGHBRIDGE, ELECTRONIC_SCALE, MANUAL, OTHER] }
   *               weighingTimestamp: { type: string, format: date-time }
   *               scaleReference: { type: string }
   *               notes: { type: string }
   *     responses:
   *       201: { description: Weighment recorded., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid weighment, or delivery no longer open for inspection., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/weighment",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(recordWeighmentBody),
    asyncHandler(controller.recordWeighment),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/quality-assessment:
   *   post:
   *     tags: [Deliveries]
   *     summary: Record the delivery-time quality inspection (Step 4/5/6)
   *     description: Observed values only — the agreed thresholds they are judged against are always resolved server-side from the transaction's own agreed quality or Module 5's QualityStandard rows, never from the request.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               overallGrade: { type: string, enum: [A, B, C, D, REJECTED] }
   *               observations:
   *                 type: array
   *                 items:
   *                   type: object
   *                   required: [metricCode, metricName, value]
   *                   properties: { metricCode: { type: string }, metricName: { type: string }, value: { type: number }, unit: { type: string } }
   *               notes: { type: string }
   *     responses:
   *       201: { description: Quality assessment recorded., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Delivery no longer open for inspection., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/quality-assessment",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(recordQualityAssessmentBody),
    asyncHandler(controller.recordQualityAssessment),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/reconcile:
   *   post:
   *     tags: [Deliveries]
   *     summary: Calculate the provisional quantity + quality reconciliation (Step 7/8/16)
   *     description: Deterministic, no LLM (Step 34). Can be recalculated any number of times while UNDER_INSPECTION; each run is stored as its own immutable row.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Reconciliation calculated., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Delivery not yet received/weighed, or not under inspection., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/reconcile",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(reconcileDeliveryBody),
    asyncHandler(controller.reconcile),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/accept:
   *   post:
   *     tags: [Deliveries]
   *     summary: Fully accept a delivery (UNDER_INSPECTION -> ACCEPTED -> RECONCILED)
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Delivery accepted and reconciled., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: Delivery already decided by a concurrent request., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: No recorded delivered quantity yet., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/accept",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(acceptDeliveryBody),
    asyncHandler(controller.accept),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/partial-accept:
   *   post:
   *     tags: [Deliveries]
   *     summary: Partially accept a delivery (UNDER_INSPECTION -> PARTIALLY_ACCEPTED -> RECONCILED)
   *     description: Step 17/18 — accepted quantity must not exceed delivered quantity; the remainder is recorded as rejected without ever overwriting the original delivered figure.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [acceptedQuantityKg], properties: { acceptedQuantityKg: { type: number }, rejectionReason: { type: string } } }
   *     responses:
   *       200: { description: Delivery partially accepted and reconciled., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: Delivery already decided by a concurrent request., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Accepted quantity exceeds delivered quantity, or no recorded delivered quantity yet., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/partial-accept",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(partialAcceptDeliveryBody),
    asyncHandler(controller.partialAccept),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/reject:
   *   post:
   *     tags: [Deliveries]
   *     summary: Reject a delivery in full (UNDER_INSPECTION -> REJECTED -> RECONCILED)
   *     description: Step 19 — the original delivered quantity, quality assessment, weighment, shipment, buyer, lot and trade offer are all retained; nothing is deleted.
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
   *     responses:
   *       200: { description: Delivery rejected and reconciled., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: Delivery already decided by a concurrent request., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: No recorded delivered quantity yet., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/reject",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(rejectDeliveryBody),
    asyncHandler(controller.reject),
  );

  /**
   * @openapi
   * /api/deliveries/{publicId}/evidence:
   *   post:
   *     tags: [Deliveries]
   *     summary: Attach delivery evidence (Step 15 — metadata/reference only, never binary storage)
   *     parameters:
   *       - { name: publicId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [evidenceType, storageProvider, externalId, secureUrl]
   *             properties:
   *               evidenceType: { type: string, enum: [WEIGHMENT_SLIP, DELIVERY_RECEIPT, QUALITY_CERTIFICATE, INSPECTION_DOCUMENT, PHOTOGRAPH, OTHER] }
   *               storageProvider: { type: string }
   *               externalId: { type: string }
   *               secureUrl: { type: string, format: uri }
   *     responses:
   *       201: { description: Evidence attached., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the buyer of this delivery., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Delivery not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/deliveries/:publicId/evidence",
    buyerOrAdmin,
    validateParams(deliveryPublicIdParams),
    validateBody(addEvidenceBody),
    asyncHandler(controller.addEvidence),
  );

  return router;
}
