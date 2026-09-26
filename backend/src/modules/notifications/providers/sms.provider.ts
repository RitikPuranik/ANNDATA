import { NotificationChannel } from "@prisma/client";
import { NotificationProvider, NotificationSendInput, NotificationSendResult } from "./notification-provider.interface";

/**
 * Section 7/40 — no generic transactional-SMS vendor is wired into this
 * codebase today. The only existing SMS integration (TwilioSmsOtpProvider,
 * modules/auth/otp) is Twilio *Verify*, a one-time-code product, not a
 * free-text send API — reusing it here would misuse a verification
 * product as a messaging channel. Same "typed, honest unavailable
 * failure, never a fabricated success" convention as
 * UnavailableQualityAIProvider / UnavailableSellStoreAIProvider: SMS stays
 * a real channel in the enum/type system (so a future real provider drops
 * in behind this same interface without touching any call site) but never
 * silently pretends to send. Never marked retryable — retrying against a
 * provider that will never exist wastes the retry budget on channels the
 * user actually has (Section 40: "the notification must remain available
 * through other supported channels").
 */
export class UnavailableSmsNotificationProvider implements NotificationProvider {
  readonly channel: NotificationChannel = "SMS";
  readonly name = "unavailable";

  async send(_input: NotificationSendInput): Promise<NotificationSendResult> {
    return { success: false, error: "SMS provider not configured.", retryable: false };
  }
}
