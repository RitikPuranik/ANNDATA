import { NotificationChannel } from "@prisma/client";

/**
 * Section 8 — provider abstraction. Every concrete channel provider
 * (InAppNotificationProvider, WhatsAppNotificationProvider,
 * EmailNotificationProvider, SmsNotificationProvider) implements this so
 * NotificationDeliveryService never branches on which channel it is
 * talking to beyond picking the right provider instance (Section 8: "do
 * not hardcode provider-specific logic throughout the notification
 * service").
 *
 * Contract: implementations must NEVER throw — same convention as
 * EmailProvider (see email/emailProvider.interface.ts's own comment). A
 * failed send resolves to { success: false, ... } so the delivery layer
 * can classify it as transient/permanent and decide whether to retry
 * (Section 17) without a try/catch at every call site.
 */
export interface NotificationSendInput {
  recipientUserId: string;
  title: string;
  body: string;
}

export interface NotificationSendResult {
  success: boolean;
  /** The provider's own message id, when it has one (Section 4: providerMessageId). */
  providerMessageId?: string;
  /** Present only when success is false. Sanitized — never a raw provider
   * payload, never a secret/token (Section 42/53). */
  error?: string;
  /** Section 17 — distinguishes a transient failure (worth retrying: rate
   * limit, timeout, temporary provider outage) from a permanent one (an
   * invalid/unregistered destination) so the delivery layer never retries
   * a permanent error indefinitely. Defaults to true (retryable) when
   * omitted on failure — the safer default, since a provider that cannot
   * classify its own failure should not silently give up after one try. */
  retryable?: boolean;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly name: string;
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
}
