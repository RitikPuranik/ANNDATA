import { logger } from "../../../config/logger";
import { EmailProvider, SendEmailInput, SendEmailResult } from "./emailProvider.interface";

export interface ResendEmailProviderConfig {
  apiKey: string;
  apiBaseUrl: string;
  fromName: string;
  fromAddress: string;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * Real implementation backed by the Resend REST API
 * (https://resend.com/docs/api-reference/emails/send-email). Uses the
 * platform `fetch` directly. Same retry/timeout shape and "never throw"
 * contract as EmailJSEmailProvider, so callers can treat both identically.
 *
 * Retries transient failures (network errors, 429, 5xx) with a short
 * backoff. Never throws: a send failure is logged and returned as
 * { success: false }.
 */
export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly config: ResendEmailProviderConfig) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const payload = {
      from: `${this.config.fromName} <${this.config.fromAddress}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo ?? this.config.fromAddress,
    };

    let lastError = "Unknown error";

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(`${this.config.apiBaseUrl}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          return { success: true };
        }

        const errorBody = await response.text().catch(() => "");
        lastError = `Resend API responded ${response.status}: ${errorBody.slice(0, 300)}`;

        // Only 429/5xx are worth retrying; a 4xx (bad key, invalid
        // recipient/domain) will fail identically on retry.
        if (response.status !== 429 && response.status < 500) {
          break;
        }
      } catch (err) {
        clearTimeout(timeout);
        lastError = err instanceof Error ? err.message : "Network error calling Resend";
      }

      if (attempt < this.config.maxRetries) {
        const backoffMs = 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    logger.error({ to: input.to, subject: input.subject, error: lastError }, "[ResendEmailProvider] Send failed");
    return { success: false, error: lastError };
  }
}
