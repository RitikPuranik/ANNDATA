import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validateBody } from "../../middleware/validateBody";
import { validateParams } from "../../middleware/validateParams";
import { validateQuery } from "../../middleware/validateQuery";
import { AuditService } from "../audit/audit.service";
import { createAuthMiddleware } from "../auth/auth.middleware";
import { AuthRepository } from "../auth/auth.repository";
import { NotificationAnnouncementService } from "./notification-announcement.service";
import { NotificationController } from "./notification.controller";
import { NotificationPreferenceService } from "./notification-preference.service";
import {
  createAnnouncementSchema,
  notificationListQuerySchema,
  notificationParamsSchema,
  updateNotificationPreferenceSchema,
} from "./notification.schemas";
import { NotificationService } from "./notification.service";

/**
 * Module 22 — Notifications & Alerts API. Mounted at "/api" by app.ts, same
 * prefix/convention as every other module. Every route requires
 * authentication. Section 30/31: there is deliberately no endpoint that
 * lets a user send a notification to another user, and no endpoint that
 * lists another user's notifications — every list/get/read/archive route
 * is implicitly scoped to `req.user` by the service layer
 * (NotificationAuthorizationService), never by a client-supplied recipient
 * id.
 *
 * @openapi
 * tags:
 *   - name: Notifications
 *     description: Module 22 — notifications & alerts
 */
export function createNotificationRouter(
  notificationService: NotificationService,
  preferenceService: NotificationPreferenceService,
  announcementService: NotificationAnnouncementService,
  authRepo: AuthRepository,
  auditService: AuditService,
): Router {
  const router = Router();
  const controller = new NotificationController(notificationService, preferenceService, announcementService);
  const { authenticate: authMw, requireAnyRole } = createAuthMiddleware(authRepo, auditService);

  router.use(authMw);

  const adminOnly = requireAnyRole("ADMIN");

  /**
   * @openapi
   * /api/notifications:
   *   get:
   *     tags: [Notifications]
   *     summary: List the caller's own notifications
   *     description: Section 32 — paginated; supports unreadOnly/category/priority/date-range filters. Never accepts a recipient id — always scoped to the authenticated caller.
   *     responses:
   *       200: { description: Paginated notifications. }
   *       401: { description: Unauthorized. }
   */
  router.get("/notifications", validateQuery(notificationListQuerySchema), asyncHandler(controller.list));

  /**
   * @openapi
   * /api/notifications/unread-count:
   *   get:
   *     tags: [Notifications]
   *     summary: Unread notification count for the caller
   *     responses:
   *       200: { description: Unread count. }
   *       401: { description: Unauthorized. }
   */
  router.get("/notifications/unread-count", asyncHandler(controller.unreadCount));

  /**
   * @openapi
   * /api/notifications/read-all:
   *   post:
   *     tags: [Notifications]
   *     summary: Mark every one of the caller's unread notifications as read
   *     responses:
   *       200: { description: Notifications marked read. }
   *       401: { description: Unauthorized. }
   */
  router.post("/notifications/read-all", asyncHandler(controller.markAllRead));

  /**
   * @openapi
   * /api/notifications/preferences:
   *   get:
   *     tags: [Notifications]
   *     summary: Get the caller's notification preferences
   *     responses:
   *       200: { description: Preferences, materialized with defaults on first read. }
   *       401: { description: Unauthorized. }
   *   patch:
   *     tags: [Notifications]
   *     summary: Update the caller's notification preferences
   *     description: Section 10/29 — mandatory security-category channels cannot be disabled here; the write is silently ineffective for that category (enforced server-side, in NotificationPreferenceService.isChannelEnabled, not by rejecting the request).
   *     responses:
   *       200: { description: Preferences updated. }
   *       400: { description: Validation error. }
   *       401: { description: Unauthorized. }
   */
  router.get("/notifications/preferences", asyncHandler(controller.getPreferences));
  router.patch("/notifications/preferences", validateBody(updateNotificationPreferenceSchema), asyncHandler(controller.updatePreferences));

  /**
   * @openapi
   * /api/notifications/announcements:
   *   post:
   *     tags: [Notifications]
   *     summary: Author a system announcement (ADMIN only)
   *     description: Section 44 — fans out through the ordinary notification pipeline; not a marketing platform. ADMIN role required.
   *     responses:
   *       201: { description: Announcement created (and published immediately unless scheduledFor is in the future). }
   *       401: { description: Unauthorized. }
   *       403: { description: Forbidden — ADMIN role required. }
   */
  router.post(
    "/notifications/announcements",
    adminOnly,
    validateBody(createAnnouncementSchema),
    asyncHandler(controller.createAnnouncement),
  );

  /**
   * @openapi
   * /api/notifications/{publicId}:
   *   get:
   *     tags: [Notifications]
   *     summary: Get a single notification the caller owns
   *     responses:
   *       200: { description: Notification. }
   *       401: { description: Unauthorized. }
   *       403: { description: Forbidden — not the recipient. }
   *       404: { description: Not found. }
   */
  router.get("/notifications/:publicId", validateParams(notificationParamsSchema), asyncHandler(controller.get));

  /**
   * @openapi
   * /api/notifications/{publicId}/read:
   *   post:
   *     tags: [Notifications]
   *     summary: Mark one notification as read
   *     description: Section 33 — reading never deletes; history is preserved.
   *     responses:
   *       200: { description: Notification marked read. }
   *       401: { description: Unauthorized. }
   *       403: { description: Forbidden — not the recipient. }
   *       404: { description: Not found. }
   */
  router.post("/notifications/:publicId/read", validateParams(notificationParamsSchema), asyncHandler(controller.markRead));

  /**
   * @openapi
   * /api/notifications/{publicId}/archive:
   *   post:
   *     tags: [Notifications]
   *     summary: Archive a notification (hidden from default inbox, never deleted)
   *     responses:
   *       200: { description: Notification archived. }
   *       401: { description: Unauthorized. }
   *       403: { description: Forbidden — not the recipient. }
   *       404: { description: Not found. }
   */
  router.post("/notifications/:publicId/archive", validateParams(notificationParamsSchema), asyncHandler(controller.archive));

  return router;
}
