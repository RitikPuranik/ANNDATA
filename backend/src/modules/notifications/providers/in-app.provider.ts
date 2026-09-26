import { NotificationChannel } from "@prisma/client";
import { NotificationProvider, NotificationSendInput, NotificationSendResult } from "./notification-provider.interface";

/**
 * Section 9 — in-app notifications are first-class and need no external
 * transport: the Notification row itself (already persisted by
 * NotificationService before any provider is even invoked) IS the
 * delivery. This provider exists only so in-app fits the same
 * NotificationProvider contract as every other channel, keeping
 * NotificationDeliveryService's dispatch loop uniform across channels
 * (Section 8).
 */
export class InAppNotificationProvider implements NotificationProvider {
  readonly channel: NotificationChannel = "IN_APP";
  readonly name = "in-app";

  async send(_input: NotificationSendInput): Promise<NotificationSendResult> {
    return { success: true };
  }
}
