import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validateBody } from "../../middleware/validateBody";
import { validateParams } from "../../middleware/validateParams";
import { validateQuery } from "../../middleware/validateQuery";
import { AuditService } from "../audit/audit.service";
import { AuthRepository } from "../auth/auth.repository";
import { createAuthMiddleware } from "../auth/auth.middleware";
import { ShipmentController } from "./shipment.controller";
import { ShipmentService } from "./shipment.service";
import {
  assignDriverBody,
  cancelShipmentBody,
  createShipmentBody,
  listLocationsQuery,
  listShipmentsQuery,
  shipmentPublicIdParams,
  submitLocationBody,
} from "./shipment.schemas";

/**
 * Step 7/35 — Shipment & GPS Tracking API. Mounted at "/api" by app.ts,
 * the same prefix every other module in this backend uses (see app.ts —
 * there is no per-module prefix override). Every route requires
 * authentication; ShipmentService itself enforces exactly who may view or
 * operate on a given shipment (Step 8) — role checks here only narrow
 * *which* roles may even attempt an action, never substitute for the
 * ownership checks inside the service.
 */
export function createShipmentRouter(shipmentService: ShipmentService, authRepo: AuthRepository, auditService: AuditService): Router {
  const router = Router();
  const controller = new ShipmentController(shipmentService);
  const { authenticate: authMw, requireAnyRole } = createAuthMiddleware(authRepo, auditService);

  router.use(authMw);

  const requesterOrAdmin = requireAnyRole("FARMER", "FPO_ADMIN", "ADMIN");
  const providerOrAdmin = requireAnyRole("TRANSPORTER", "ADMIN");
  const cancelAllowed = requireAnyRole("FARMER", "FPO_ADMIN", "TRANSPORTER", "ADMIN");
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
   * /api/shipments:
   *   post:
   *     tags: [Shipments]
   *     summary: Create a shipment from an accepted Module 16 logistics quote
   *     description: |
   *       Step 4 — the only client input is the logistics request's
   *       publicId; provider, vehicle, price, and quantity are all derived
   *       server-side from the request's own accepted quote. Requester
   *       side (FARMER/FPO_ADMIN who owns the request/lot) or ADMIN only.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [logisticsRequestId]
   *             properties:
   *               logisticsRequestId: { type: string, format: uuid }
   *     responses:
   *       201: { description: Shipment created., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not authorized to create a shipment for this request., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Logistics request, vehicle, or provider not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       409: { description: A shipment already exists for this request/quote., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: The request does not have an accepted quote, or the provider/vehicle is not eligible., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *   get:
   *     tags: [Shipments]
   *     summary: List shipments visible to the authenticated account
   *     description: Farmers/FPO admins see shipments on their own lots, transporters see their own assigned shipments, buyers see shipments for lots they hold an accepted trade offer on, and ADMIN sees everything.
   *     parameters:
   *       - name: status
   *         in: query
   *         schema: { type: string, enum: [CREATED, CONFIRMED, ASSIGNED, READY_FOR_PICKUP, PICKED_UP, IN_TRANSIT, ARRIVED, DELIVERED, CANCELLED] }
   *       - name: providerId
   *         in: query
   *         description: ADMIN only — ignored for every other role, which is always scoped to the caller's own data.
   *         schema: { type: string, format: uuid }
   *       - name: vehicleId
   *         in: query
   *         schema: { type: string, format: uuid }
   *       - name: lotId
   *         in: query
   *         schema: { type: string, format: uuid }
   *       - name: page
   *         in: query
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - name: limit
   *         in: query
   *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
   *     responses:
   *       200: { description: Paginated shipment list., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post("/shipments", requesterOrAdmin, validateBody(createShipmentBody), asyncHandler(controller.create));
  router.get("/shipments", anyAuthenticated, validateQuery(listShipmentsQuery), asyncHandler(controller.list));

  /**
   * @openapi
   * /api/shipments/{publicId}:
   *   get:
   *     tags: [Shipments]
   *     summary: Get a shipment, including its latest known GPS location, ETA, and route progress
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Shipment retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get("/shipments/:publicId", anyAuthenticated, validateParams(shipmentPublicIdParams), asyncHandler(controller.get));

  /**
   * @openapi
   * /api/shipments/{publicId}/handoff:
   *   get:
   *     tags: [Shipments]
   *     summary: Everything Module 18 (Delivery & Quality Reconciliation) needs about this shipment
   *     description: Step 33 — Module 17 performs no grading/reconciliation itself; `deliveredQuantity` is always null here until Module 18 exists.
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Handoff payload retrieved., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/shipments/:publicId/handoff",
    anyAuthenticated,
    validateParams(shipmentPublicIdParams),
    asyncHandler(controller.getHandoff),
  );

  /**
   * @openapi
   * /api/shipments/{publicId}/confirm:
   *   post:
   *     tags: [Shipments]
   *     summary: Provider confirms the shipment (CREATED -> CONFIRMED)
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Shipment confirmed., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid transition for the shipment's current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/shipments/:publicId/confirm",
    providerOrAdmin,
    validateParams(shipmentPublicIdParams),
    asyncHandler(controller.confirm),
  );

  /**
   * @openapi
   * /api/shipments/{publicId}/assign-driver:
   *   post:
   *     tags: [Shipments]
   *     summary: Attach the vehicle's own registered driver (Module 15) to this shipment
   *     description: Step 6 — a vehicle has at most one VehicleDriver record; this attaches that record (if any) after re-verifying it belongs to the assigned provider and is active. No body required.
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Driver assigned., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider, or the driver belongs to a different provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment or driver not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: The shipment is delivered/cancelled, or the driver is inactive., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/shipments/:publicId/assign-driver",
    providerOrAdmin,
    validateParams(shipmentPublicIdParams),
    validateBody(assignDriverBody),
    asyncHandler(controller.assignDriver),
  );

  /**
   * @openapi
   * /api/shipments/{publicId}/ready-for-pickup:
   *   post:
   *     tags: [Shipments]
   *     summary: Mark the shipment ready for pickup (CONFIRMED/ASSIGNED -> READY_FOR_PICKUP)
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Shipment marked ready for pickup., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid transition for the shipment's current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/shipments/:publicId/ready-for-pickup",
    providerOrAdmin,
    validateParams(shipmentPublicIdParams),
    asyncHandler(controller.readyForPickup),
  );

  /**
   * @openapi
   * /api/shipments/{publicId}/pickup:
   *   post:
   *     tags: [Shipments]
   *     summary: Record pickup (READY_FOR_PICKUP -> PICKED_UP)
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Shipment picked up., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid transition for the shipment's current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post("/shipments/:publicId/pickup", providerOrAdmin, validateParams(shipmentPublicIdParams), asyncHandler(controller.pickup));

  /**
   * @openapi
   * /api/shipments/{publicId}/start-transit:
   *   post:
   *     tags: [Shipments]
   *     summary: Start transit (PICKED_UP -> IN_TRANSIT)
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Shipment is now in transit., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid transition for the shipment's current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/shipments/:publicId/start-transit",
    providerOrAdmin,
    validateParams(shipmentPublicIdParams),
    asyncHandler(controller.startTransit),
  );

  /**
   * @openapi
   * /api/shipments/{publicId}/arrive:
   *   post:
   *     tags: [Shipments]
   *     summary: Mark arrival at the destination (IN_TRANSIT -> ARRIVED)
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Shipment marked arrived., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid transition for the shipment's current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post("/shipments/:publicId/arrive", providerOrAdmin, validateParams(shipmentPublicIdParams), asyncHandler(controller.arrive));

  /**
   * @openapi
   * /api/shipments/{publicId}/deliver:
   *   post:
   *     tags: [Shipments]
   *     summary: Record delivery (IN_TRANSIT/ARRIVED -> DELIVERED)
   *     description: Step 28 — an atomic conditional transition, so two concurrent delivery attempts on the same shipment can never both succeed.
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200: { description: Shipment delivered., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: Invalid transition for the shipment's current status., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post("/shipments/:publicId/deliver", providerOrAdmin, validateParams(shipmentPublicIdParams), asyncHandler(controller.deliver));

  /**
   * @openapi
   * /api/shipments/{publicId}/cancel:
   *   post:
   *     tags: [Shipments]
   *     summary: Cancel a shipment before pickup
   *     description: Step 27 — only legal from CREATED/CONFIRMED/ASSIGNED/READY_FOR_PICKUP; once picked up a shipment must run its course to DELIVERED.
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reason: { type: string, maxLength: 500 }
   *     responses:
   *       200: { description: Shipment cancelled., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not authorized to cancel this shipment., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: The shipment has already been picked up, delivered, or cancelled., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.post(
    "/shipments/:publicId/cancel",
    cancelAllowed,
    validateParams(shipmentPublicIdParams),
    validateBody(cancelShipmentBody),
    asyncHandler(controller.cancel),
  );

  /**
   * @openapi
   * /api/shipments/{publicId}/location:
   *   post:
   *     tags: [Shipments]
   *     summary: Submit a GPS/location update for an active shipment
   *     description: |
   *       Step 10/14 — only while the shipment is PICKED_UP/IN_TRANSIT/ARRIVED.
   *       Rejects out-of-range coordinates/speed/heading and timestamps too
   *       far in the future rather than silently clamping them.
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [latitude, longitude]
   *             properties:
   *               latitude: { type: number, minimum: -90, maximum: 90 }
   *               longitude: { type: number, minimum: -180, maximum: 180 }
   *               accuracyMeters: { type: number, minimum: 0 }
   *               speedKmh: { type: number, minimum: 0 }
   *               headingDegrees: { type: number, minimum: 0, maximum: 360 }
   *               recordedAt: { type: string, format: date-time }
   *               source: { type: string, enum: [DRIVER_APP, GPS_DEVICE, IOT_DEVICE, ADMIN, SYSTEM], default: DRIVER_APP }
   *     responses:
   *       201: { description: Location recorded., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not the assigned provider., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       422: { description: The shipment is not currently trackable, or the coordinates/timestamp are invalid., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *   get:
   *     tags: [Shipments]
   *     summary: Not implemented — use GET /api/shipments/{publicId}/locations for history.
   */
  router.post(
    "/shipments/:publicId/location",
    providerOrAdmin,
    validateParams(shipmentPublicIdParams),
    validateBody(submitLocationBody),
    asyncHandler(controller.submitLocation),
  );

  /**
   * @openapi
   * /api/shipments/{publicId}/locations:
   *   get:
   *     tags: [Shipments]
   *     summary: Paginated, chronological GPS location history for a shipment
   *     parameters:
   *       - name: publicId
   *         in: path
   *         required: true
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
   *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
   *     responses:
   *       200: { description: Paginated location history., content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
   *       401: { description: Unauthorized., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       403: { description: Not visible to this account., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   *       404: { description: Shipment not found., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
   */
  router.get(
    "/shipments/:publicId/locations",
    anyAuthenticated,
    validateParams(shipmentPublicIdParams),
    validateQuery(listLocationsQuery),
    asyncHandler(controller.listLocations),
  );

  return router;
}
