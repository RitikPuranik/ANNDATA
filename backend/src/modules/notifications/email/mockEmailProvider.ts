import { logger } from "../../../config/logger";
import { EmailProvider, SendEmailInput, SendEmailResult } from "./emailProvider.interface";

/**
 * Default provider when EMAIL_ENABLED=false. Never makes a network call —
 * just logs what WOULD have been sent, so the rest of the app (and its
 * callers' error handling) behaves identically to a real provider without
 * requiring any credentials in dev/test.
 *
 * Always "succeeds": a mocked send should never cause a 502 downstream.
 */
export class MockEmailProvider implements EmailProvider {
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    logger.info(
      { to: input.to, subject: input.subject, replyTo: input.replyTo },
      "[MockEmailProvider] EMAIL_ENABLED=false — email logged, not sent",
    );
    // Log the plain-text body too so a dev/test token or link is actually
    // visible without turning on a real provider.
    logger.debug({ text: input.text }, "[MockEmailProvider] body");
    return { success: true };
  }
}
