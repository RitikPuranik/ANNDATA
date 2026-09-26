import { NotificationChannel, PrismaClient } from "@prisma/client";
import type { WhatsAppProvider } from "../../whatsapp/providers/whatsapp-provider.interface";
import { WhatsAppProviderError } from "../../whatsapp/providers/whatsapp-provider.interface";
import { NotificationProvider, NotificationSendInput, NotificationSendResult } from "./notification-provider.interface";

/**
 * Section 39 — reuses the existing ANNDATA WhatsApp Business Cloud API
 * integration (modules/whatsapp) rather than a second WhatsApp client.
 * Recipient resolution (userId -> linked WhatsApp number) goes through
 * WhatsAppLink, the same table modules/whatsapp itself uses — this
 * provider is a thin adapter, never a second source of truth for who is
 * linked to what number.
 *
 * A user with no linked WhatsApp number is not a failure worth retrying —
 * it is simply a channel this user has never enabled (Section 40's "the
 * notification must remain available through other supported channels").
 */
export class WhatsAppNotificationProvider implements NotificationProvider {
  readonly channel: NotificationChannel = "WHATSAPP";
  readonly name = "whatsapp";

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: WhatsAppProvider,
  ) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const link = await this.prisma.whatsAppLink.findUnique({ where: { userId: input.recipientUserId } });
    if (!link) {
      return { success: false, error: "No linked WhatsApp number for this account.", retryable: false };
    }

    const text = `*${input.title}*\n\n${input.body}`;
    try {
      const result = await this.provider.sendTextMessage(link.phoneNumber, text);
      return { success: true, providerMessageId: result.providerMessageId };
    } catch (err) {
      if (err instanceof WhatsAppProviderError) {
        return { success: false, error: err.message, retryable: err.retryable };
      }
      return { success: false, error: "WhatsApp send failed.", retryable: true };
    }
  }
}
