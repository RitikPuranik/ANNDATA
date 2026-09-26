import { logger } from "../../config/logger";
import { NotificationService } from "./notification.service";
import { TemplateVars } from "./notification-i18n";

/**
 * Section 22/58 — the clean integration boundary other business modules
 * publish their domain events through, so Module 22 never has to reach
 * into Module 13/17/18/19/20/21's own tables to figure out "what just
 * happened" (Section 22: "prefer a clean event publisher/service
 * interface... do NOT modify every module unnecessarily").
 *
 * Wired in today (see each service's own `setNotificationHook` call site):
 *   - Module 21 (DisputeService): DISPUTE_CREATED, DISPUTE_RESOLVED,
 *     DISPUTE_REJECTED, DISPUTE_REOPENED, DISPUTE_CLOSED — all five call
 *     sites are wired (dispute.service.ts's create/resolve/reject/reopen/
 *     close).
 *
 * NOT yet wired (the event type and template exist — Section 3/13 — but no
 * business module calls notify() for it yet): Module 13 offers, Module 16
 * logistics, Module 17 shipments, Module 18 delivery/quality, Module 19
 * payments, Module 20 ledger, Module 6 market, Module 7 forecast, Module 8
 * sell/store, Module 4 lots, Module 1 login/password-change security
 * events. Wiring each of these is the same three-line shape as
 * DisputeService's own `setNotificationHook` + `notify()` call — see that
 * file for the pattern to repeat. This is the same "implemented but not
 * every source auto-wired yet" state Module 20's own ledger hooks started
 * in.
 *
 * `notify()` NEVER throws (Section 20/52: a notification failure must
 * never corrupt the business transaction that triggered it) — every
 * underlying error, including NotificationService.publish() rejecting
 * outright, is caught and logged here, not propagated.
 */
export interface DomainNotificationEvent {
  recipientUserId: string;
  type: Parameters<NotificationService["publish"]>[0]["type"];
  sourceModule: Parameters<NotificationService["publish"]>[0]["sourceModule"];
  sourceEventId: string;
  vars: TemplateVars;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface NotificationHook {
  notify(event: DomainNotificationEvent): Promise<void>;
}

export class NotificationEventPublisher implements NotificationHook {
  constructor(private readonly notifications: NotificationService) {}

  async notify(event: DomainNotificationEvent): Promise<void> {
    try {
      await this.notifications.publish({
        recipientUserId: event.recipientUserId,
        type: event.type,
        sourceModule: event.sourceModule,
        sourceEventId: event.sourceEventId,
        vars: event.vars,
        relatedEntityType: event.relatedEntityType,
        relatedEntityId: event.relatedEntityId,
      });
    } catch (err) {
      logger.error({ err, event }, "Failed to publish notification for domain event");
    }
  }
}
