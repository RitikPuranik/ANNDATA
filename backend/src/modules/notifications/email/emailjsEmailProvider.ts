import { logger } from "../../../config/logger";
import { EmailProvider, SendEmailInput, SendEmailResult } from "./emailProvider.interface";

export interface EmailJSEmailProviderConfig {
  apiBaseUrl: string;
  serviceId: string;
  templateId: string;
  publicKey: string;
  /** EmailJS "Private Key" — required when Strict Mode is on for the account (recommended for server use). */
  privateKey: string;
  fromName: string;
  fromAddress: string;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * Real implementation backed by the EmailJS REST API
 * (https://www.emailjs.com/docs/rest-api/send/). Uses the platform
 * `fetch` directly, mirroring ResendEmailProvider — same retry/timeout
 * shape, same "never throw" contract.
 *
 * EmailJS renders emails from a single dashboard template rather than
 * accepting raw HTML per-request, so every call here sends the SAME
 * template (EMAILJS_TEMPLATE_ID) and passes the already-rendered HTML
 * produced by email.templates.ts as a template variable. For this to
 * actually produce a nice-looking email, the EmailJS template on the
 * dashboard must contain a single content block using TRIPLE braces
 * (unescaped HTML), e.g.:
 *
 *   Subject:  {{subject}}
 *   Content:  {{{html_content}}}
 *
 * Double braces ({{html_content}}) would HTML-escape the markup and
 * render raw tags as visible text — the triple-brace form is required.
 * template_params below also includes `message` (the plain-text
 * fallback) in case the dashboard template wants to reference it.
 *
 * Retries transient failures (network errors, 429, 5xx) with a short
 * backoff, matching ResendEmailProvider's pattern. Never throws: a send
 * failure is logged and returned as { success: false }.
 */
export class EmailJSEmailProvider implements EmailProvider {
  constructor(private readonly config: EmailJSEmailProviderConfig) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const payload = {
      service_id: this.config.serviceId,
      template_id: this.config.templateId,
      user_id: this.config.publicKey,
      // Only present when Strict Mode is enabled on the EmailJS account;
      // harmless to send even when it isn't.
      accessToken: this.config.privateKey || undefined,
      template_params: {
        to_email: input.to,
        subject: input.subject,
        html_content: input.html,
        message: input.text,
        from_name: this.config.fromName,
        from_email: this.config.fromAddress,
        reply_to: input.replyTo ?? this.config.fromAddress,
      },
    };

    let lastError = "Unknown error";

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(`${this.config.apiBaseUrl}/api/v1.0/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          // EmailJS's send endpoint replies with the plain text body "OK"
          // and no JSON/id on success.
          return { success: true };
        }

        const errorBody = await response.text().catch(() => "");
        lastError = `EmailJS API responded ${response.status}: ${errorBody.slice(0, 300)}`;

        // Only 429/5xx are worth retrying; a 4xx (bad template/service id,
        // invalid recipient, auth failure) will fail identically on retry.
        if (response.status !== 429 && response.status < 500) {
          break;
        }
      } catch (err) {
        clearTimeout(timeout);
        lastError = err instanceof Error ? err.message : "Network error calling EmailJS";
      }

      if (attempt < this.config.maxRetries) {
        const backoffMs = 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    logger.error({ to: input.to, subject: input.subject, error: lastError }, "[EmailJSEmailProvider] Send failed");
    return { success: false, error: lastError };
  }
}
