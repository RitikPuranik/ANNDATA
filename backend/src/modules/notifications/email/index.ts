import { env } from "../../../config/env";
import { EmailProvider } from "./emailProvider.interface";
import { MockEmailProvider } from "./mockEmailProvider";
import { ResendEmailProvider } from "./resendEmailProvider";
import { EmailJSEmailProvider } from "./emailjsEmailProvider";
import { EmailService } from "./email.service";

export { EmailService } from "./email.service";
export { EmailProvider, SendEmailInput, SendEmailResult } from "./emailProvider.interface";

/**
 * Composition-root factory, called once from app.ts — mirrors how
 * WhatsApp/warehouse providers are chosen from env flags there. Disabled
 * by default (EMAIL_ENABLED=false): no provider credentials are
 * required, no outbound call is ever made, and emails are just logged in
 * development.
 */
export function createEmailProvider(): EmailProvider {
  if (!env.EMAIL_ENABLED) {
    return new MockEmailProvider();
  }

  if (env.EMAIL_PROVIDER === "emailjs") {
    return new EmailJSEmailProvider({
      apiBaseUrl: env.EMAILJS_API_BASE_URL,
      serviceId: env.EMAILJS_SERVICE_ID,
      templateId: env.EMAILJS_TEMPLATE_ID,
      publicKey: env.EMAILJS_PUBLIC_KEY,
      privateKey: env.EMAILJS_PRIVATE_KEY,
      fromAddress: env.EMAIL_FROM_ADDRESS,
      fromName: env.EMAIL_FROM_NAME,
      timeoutMs: env.EMAIL_TIMEOUT_MS,
      maxRetries: env.EMAIL_MAX_RETRIES,
    });
  }

  if (env.EMAIL_PROVIDER === "resend") {
    return new ResendEmailProvider({
      apiKey: env.RESEND_API_KEY,
      apiBaseUrl: env.RESEND_API_BASE_URL,
      fromAddress: env.EMAIL_FROM_ADDRESS,
      fromName: env.EMAIL_FROM_NAME,
      timeoutMs: env.EMAIL_TIMEOUT_MS,
      maxRetries: env.EMAIL_MAX_RETRIES,
    });
  }

  // Unreachable while EMAIL_PROVIDER's enum is exhaustively handled above,
  // but keeps this factory correct if a new provider value is ever added
  // to the schema without a matching branch here.
  return new MockEmailProvider();
}

export function createEmailService(provider: EmailProvider = createEmailProvider()): EmailService {
  return new EmailService(provider);
}
