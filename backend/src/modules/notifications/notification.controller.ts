import { Request, Response } from "express";
import { sendSuccess } from "../../common/apiResponse";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { NotificationAnnouncementService } from "./notification-announcement.service";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationService } from "./notification.service";
import { CreateAnnouncementBody, NotificationListQuery, UpdateNotificationPreferenceBody } from "./notification.schemas";

/** Thin-controller convention, same as DisputeController — every business
 * rule lives in the services this delegates to. */
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly preferences: NotificationPreferenceService,
    private readonly announcements: NotificationAnnouncementService,
  ) {}

  list = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const query = req.validatedQuery as unknown as NotificationListQuery;
    const result = await this.notifications.list(user, query);
    sendSuccess(res, result);
  };

  unreadCount = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const count = await this.notifications.unreadCount(user);
    sendSuccess(res, { count });
  };

  get = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.notifications.get(user, req.params.publicId);
    sendSuccess(res, result);
  };

  markRead = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.notifications.markRead(user, req.params.publicId);
    sendSuccess(res, result, "Notification marked as read");
  };

  markAllRead = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const count = await this.notifications.markAllRead(user);
    sendSuccess(res, { count }, "All notifications marked as read");
  };

  archive = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    await this.notifications.archive(user, req.params.publicId);
    sendSuccess(res, null, "Notification archived");
  };

  getPreferences = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.preferences.get(user.id);
    sendSuccess(res, result);
  };

  updatePreferences = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const input = req.body as UpdateNotificationPreferenceBody;
    const result = await this.preferences.update(user.id, input);
    sendSuccess(res, result, "Notification preferences updated");
  };

  createAnnouncement = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const input = req.body as CreateAnnouncementBody;
    const result = await this.announcements.create(user, input);
    sendSuccess(res, result, "Announcement created", 201);
  };
}
