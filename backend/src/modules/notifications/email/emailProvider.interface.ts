/**
 * Provider-agnostic email contract. Every concrete provider
 * (EmailJSEmailProvider, ResendEmailProvider, MockEmailProvider) implements
 * this so callers (EmailService, contactSupport.routes.ts, auth.service.ts)
 * never need to know which one is actually wired up.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Defaults to the configured from-address when omitted. */
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  /** Present only when success is false. Never throw — always resolve. */
  error?: string;
}

/**
 * Contract: implementations must NEVER throw. A failed send resolves to
 * { success: false, error } so callers can decide how to react (retry,
 * log, surface a 502, etc.) without needing a try/catch at every call site.
 */
export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
