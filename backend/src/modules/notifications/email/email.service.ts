import { EmailProvider, SendEmailInput, SendEmailResult } from "./emailProvider.interface";

/**
 * Thin wrapper around whichever EmailProvider the composition root picked
 * (see index.ts's createEmailProvider()). Kept as its own class — rather
 * than callers holding an EmailProvider directly — so cross-cutting
 * concerns (metrics, additional logging, a future queue) have a single
 * place to live without touching every call site.
 */
export class EmailService {
  constructor(private readonly provider: EmailProvider) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    return this.provider.sendEmail(input);
  }
}
