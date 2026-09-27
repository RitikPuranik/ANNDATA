import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validateBody } from "../../middleware/validateBody";
import { validateParams } from "../../middleware/validateParams";
import { validateQuery } from "../../middleware/validateQuery";
import { AuditService } from "../audit/audit.service";
import { createAuthMiddleware } from "../auth/auth.middleware";
import { AuthRepository } from "../auth/auth.repository";
import { DisputeController } from "./dispute.controller";
import { DisputeService } from "./dispute.service";
import {
  addCommentBody,
  addEvidenceBody,
  assignDisputeBody,
  cancelDisputeBody,
  changeStatusBody,
  closeDisputeBody,
  createDisputeBody,
  disputeEvidenceParams,
  disputePublicIdParams,
  listDisputesQuery,
  reopenDisputeBody,
  rejectDisputeBody,
  resolveDisputeBody,
} from "./dispute.schemas";

/**
 * Module 21 — Dispute & Grievance Management API. Mounted at "/api" by
 * app.ts, same prefix/convention as every other module. Every route
 * requires authentication; role checks here only narrow *which* roles may
 * even attempt an action (Step 21/23) — DisputeService/
 * DisputeAuthorizationService enforce exactly who may operate on a *given*
 * dispute, never substituted for here.
 *
 * @openapi
 * tags:
 *   - name: Disputes
 *     description: Module 21 — dispute & grievance management
 */
export function createDisputeRouter(disputeService: DisputeService, authRepo: AuthRepository, auditService: AuditService): Router {
  const router = Router();
  const controller = new DisputeController(disputeService);
  const { authenticate: authMw, requireAnyRole } = createAuthMiddleware(authRepo, auditService);

  router.use(authMw);

  const anyAuthenticated = requireAnyRole("FARMER", "FPO_ADMIN", "BUYER", "TRANSPORTER", "ADMIN", "WAREHOUSE_OPERATOR", "GOVERNMENT_VIEWER");
  const raiserRoles = requireAnyRole("FARMER", "FPO_ADMIN", "BUYER", "TRANSPORTER", "ADMIN");
  const adminOnly = requireAnyRole("ADMIN");

  /**
   * @openapi
   * /api/disputes:
   *   post:
   *     tags: [Disputes]
   *     summary: Raise a dispute or grievance
   *     description: Step 8 — the backend validates the caller's relationship to any referenced transaction entity server-side; a client-supplied ownership claim is never trusted.
   *     responses:
   *       201: { description: Dispute created. }
   *       401: { description: Unauthorized. }
   *       403: { description: Not a party to the referenced transaction. }
   *       404: { description: Referenced transaction entity not found. }
   *       409: { description: A duplicate open dispute already exists for this reference. }
   *       422: { description: A transaction dispute requires at least one reference. }
   *   get:
   *     tags: [Disputes]
   *     summary: List disputes visible to the authenticated account
   *     description: Farmers/FPO admins/buyers/transporters see disputes where they are a party; ADMIN sees everything and may filter by any field.
   *     responses:
   *       200: { description: Paginated dispute list. }
   *       401: { description: Unauthorized. }
   */
  router.post("/disputes", raiserRoles, validateBody(createDisputeBody), asyncHandler(controller.create));
  router.get("/disputes", anyAuthenticated, validateQuery(listDisputesQuery), asyncHandler(controller.list));

  /**
   * @openapi
   * /api/disputes/{publicId}:
   *   get:
   *     tags: [Disputes]
   *     summary: Get a single dispute
   *     responses:
   *       200: { description: Dispute retrieved. }
   *       403: { description: Not visible to this account. }
   *       404: { description: Dispute not found. }
   */
  router.get("/disputes/:publicId", anyAuthenticated, validateParams(disputePublicIdParams), asyncHandler(controller.get));

  /**
   * @openapi
   * /api/disputes/{publicId}/comments:
   *   post:
   *     tags: [Disputes]
   *     summary: Add a comment (or, ADMIN only, an internal note)
   *   get:
   *     tags: [Disputes]
   *     summary: List comments (internal notes only visible to ADMIN)
   */
  router.post(
    "/disputes/:publicId/comments",
    anyAuthenticated,
    validateParams(disputePublicIdParams),
    validateBody(addCommentBody),
    asyncHandler(controller.addComment),
  );
  router.get("/disputes/:publicId/comments", anyAuthenticated, validateParams(disputePublicIdParams), asyncHandler(controller.listComments));

  /**
   * @openapi
   * /api/disputes/{publicId}/evidence:
   *   post:
   *     tags: [Disputes]
   *     summary: Attach evidence (Step 10 — metadata/reference only, never binary storage)
   *   get:
   *     tags: [Disputes]
   *     summary: List active (non-removed) evidence
   */
  router.post(
    "/disputes/:publicId/evidence",
    anyAuthenticated,
    validateParams(disputePublicIdParams),
    validateBody(addEvidenceBody),
    asyncHandler(controller.addEvidence),
  );
  router.get("/disputes/:publicId/evidence", anyAuthenticated, validateParams(disputePublicIdParams), asyncHandler(controller.listEvidence));
  router.delete(
    "/disputes/:publicId/evidence/:evidenceId",
    anyAuthenticated,
    validateParams(disputeEvidenceParams),
    asyncHandler(controller.removeEvidence),
  );

  /**
   * @openapi
   * /api/disputes/{publicId}/history:
   *   get:
   *     tags: [Disputes]
   *     summary: Append-only dispute event history
   */
  router.get("/disputes/:publicId/history", anyAuthenticated, validateParams(disputePublicIdParams), asyncHandler(controller.listHistory));

  /**
   * @openapi
   * /api/disputes/{publicId}/assign:
   *   post:
   *     tags: [Disputes]
   *     summary: Assign a dispute to an investigator (ADMIN only)
   */
  router.post(
    "/disputes/:publicId/assign",
    adminOnly,
    validateParams(disputePublicIdParams),
    validateBody(assignDisputeBody),
    asyncHandler(controller.assign),
  );
  router.post("/disputes/:publicId/unassign", adminOnly, validateParams(disputePublicIdParams), asyncHandler(controller.unassign));

  /**
   * @openapi
   * /api/disputes/{publicId}/status:
   *   post:
   *     tags: [Disputes]
   *     summary: Move a dispute through its controlled lifecycle (ADMIN only)
   *     description: Step 6 — an explicit state-transition matrix (dispute-state-machine.ts) governs which moves are legal; RESOLVED/REJECTED/CLOSED must go through their own dedicated endpoints.
   */
  router.post(
    "/disputes/:publicId/status",
    adminOnly,
    validateParams(disputePublicIdParams),
    validateBody(changeStatusBody),
    asyncHandler(controller.changeStatus),
  );

  /**
   * @openapi
   * /api/disputes/{publicId}/resolve:
   *   post:
   *     tags: [Disputes]
   *     summary: Resolve a dispute (ADMIN only)
   *     description: Step 16/17 — a financial consequence is only ever referenced here (an existing Module 19 PaymentObligation / Module 20 ledger entry publicId), never created or amounts invented by this module.
   */
  router.post(
    "/disputes/:publicId/resolve",
    adminOnly,
    validateParams(disputePublicIdParams),
    validateBody(resolveDisputeBody),
    asyncHandler(controller.resolve),
  );

  /**
   * @openapi
   * /api/disputes/{publicId}/reject:
   *   post:
   *     tags: [Disputes]
   *     summary: Reject a dispute's claim (ADMIN only)
   */
  router.post(
    "/disputes/:publicId/reject",
    adminOnly,
    validateParams(disputePublicIdParams),
    validateBody(rejectDisputeBody),
    asyncHandler(controller.reject),
  );

  /**
   * @openapi
   * /api/disputes/{publicId}/reopen:
   *   post:
   *     tags: [Disputes]
   *     summary: Reopen a CLOSED/RESOLVED/REJECTED dispute (ADMIN only)
   *     description: Step 18 — always a distinct, reasoned, audited event; never a silent status overwrite.
   */
  router.post(
    "/disputes/:publicId/reopen",
    adminOnly,
    validateParams(disputePublicIdParams),
    validateBody(reopenDisputeBody),
    asyncHandler(controller.reopen),
  );

  /**
   * @openapi
   * /api/disputes/{publicId}/close:
   *   post:
   *     tags: [Disputes]
   *     summary: Close a RESOLVED/REJECTED dispute (ADMIN only)
   */
  router.post(
    "/disputes/:publicId/close",
    adminOnly,
    validateParams(disputePublicIdParams),
    validateBody(closeDisputeBody),
    asyncHandler(controller.close),
  );

  /**
   * @openapi
   * /api/disputes/{publicId}/cancel:
   *   post:
   *     tags: [Disputes]
   *     summary: Cancel an OPEN/UNDER_REVIEW dispute (the raiser, or ADMIN)
   */
  router.post(
    "/disputes/:publicId/cancel",
    anyAuthenticated,
    validateParams(disputePublicIdParams),
    validateBody(cancelDisputeBody),
    asyncHandler(controller.cancel),
  );

  return router;
}
