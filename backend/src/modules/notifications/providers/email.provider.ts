import { NotificationChannel, PrismaClient } from "@prisma/client";
import { EmailService } from "../email/email.service";
import { NotificationProvider, NotificationSendInput, NotificationSendResult } from "./notification-provider.interface";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Section 38 — reuses the existing EmailService/EmailProvider (Module 1's
 * own email infrastructure — emailjsEmailProvider.ts / mockEmailProvider.ts)
 * rather than a second email client. A user with no email on file is not a
 * failure worth retrying, same reasoning as WhatsAppNotificationProvider's
 * "no linked number" case.
 */
export class EmailNotificationProvider implements NotificationProvider {
  readonly channel: NotificationChannel = "EMAIL";
  readonly name = "email";

  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
  ) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const user = await this.prisma.user.findUnique({ where: { id: input.recipientUserId }, select: { email: true } });
    if (!user?.email) {
      return { success: false, error: "No email address on file for this account.", retryable: false };
    }

    const result = await this.emailService.sendEmail({
      to: user.email,
      subject: input.title,
      text: input.body,
      html: `<p>${escapeHtml(input.body)}</p>`,
    });

    if (!result.success) {
      return { success: false, error: result.error ?? "Email send failed.", retryable: true };
    }
    return { success: true };
  }
}
