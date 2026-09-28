import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validateBody } from "../../middleware/validateBody";
import { validateParams } from "../../middleware/validateParams";
import { validateQuery } from "../../middleware/validateQuery";
import { AuditService } from "../audit/audit.service";
import { createAuthMiddleware } from "../auth/auth.middleware";
import { AuthRepository } from "../auth/auth.repository";
import { LowConnectivityController } from "./low-connectivity.controller";
import { preloadBundleQuery, packetPublicIdParams, sessionPublicIdParams, startSyncSessionBody, submitPacketBody } from "./low-connectivity.schemas";
import { PreloadBundleService } from "./preload-bundle.service";
import { SyncSessionService } from "./sync-session.service";

export function createLowConnectivityRouter(sync: SyncSessionService, preload: PreloadBundleService, authRepo: AuthRepository, auditService: AuditService): Router {
  const router = Router();
  const controller = new LowConnectivityController(sync, preload);
  const { authenticate, requireAnyRole } = createAuthMiddleware(authRepo, auditService);
  router.use(authenticate);
  router.use(requireAnyRole("ADMIN", "FARMER", "FPO_ADMIN", "BUYER", "TRANSPORTER", "WAREHOUSE_OPERATOR", "GOVERNMENT_VIEWER"));

  /** @openapi
   * /api/sync/sessions:
   *   post:
   *     tags: [Low Connectivity]
   *     summary: Start or resume a device sync session
   */
  router.post("/sync/sessions", validateBody(startSyncSessionBody), asyncHandler(controller.startSession));
  /** @openapi
   * /api/sync/sessions:
   *   get:
   *     tags: [Low Connectivity]
   *     summary: List the caller's sync sessions
   */
  router.get("/sync/sessions", asyncHandler(controller.listSessions));
  /** @openapi
   * /api/sync/sessions/{publicId}:
   *   get:
   *     tags: [Low Connectivity]
   *     summary: Get sync session status and packet counts
   */
  router.get("/sync/sessions/:publicId", validateParams(sessionPublicIdParams), asyncHandler(controller.getSession));
  /** @openapi
   * /api/sync/sessions/{publicId}/packets:
   *   post:
   *     tags: [Low Connectivity]
   *     summary: Submit one ordered offline packet
   */
  router.post("/sync/sessions/:publicId/packets", validateParams(sessionPublicIdParams), validateBody(submitPacketBody), asyncHandler(controller.submitPacket));
  /** @openapi
   * /api/sync/sessions/{publicId}/packets/{packetId}/retry:
   *   post:
   *     tags: [Low Connectivity]
   *     summary: Retry a failed packet as the next sequence
   */
  router.post("/sync/sessions/:publicId/packets/:packetId/retry", validateParams(packetPublicIdParams), asyncHandler(controller.retryPacket));
  router.post("/sync/sessions/:publicId/complete", validateParams(sessionPublicIdParams), asyncHandler(controller.completeSession));
  router.post("/sync/sessions/:publicId/abandon", validateParams(sessionPublicIdParams), asyncHandler(controller.abandonSession));
  /** @openapi
   * /api/preload/bundle:
   *   get:
   *     tags: [Low Connectivity]
   *     summary: Fetch chunkable offline preload data
   */
  router.get("/preload/bundle", validateQuery(preloadBundleQuery), asyncHandler(controller.getPreloadBundle));
  return router;
}
