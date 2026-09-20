import type { WhatsAppRepository } from "./whatsapp.repository";
import type { ConversationRecord, Lang } from "./whatsapp.types";

export class WhatsAppConversationService {
  constructor(
    private readonly repo: WhatsAppRepository,
    private readonly ttlMinutes: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private expiry(): Date {
    return new Date(this.now().getTime() + this.ttlMinutes * 60_000);
  }

  /**
   * Loads the conversation for a phone number. A stale conversation (past
   * expiresAt) is reset to IDLE so a farmer returning after a long gap never
   * lands in the middle of an old flow — but the language preference is kept.
   */
  async load(phone: string, userId: string | null, defaultLanguage: Lang): Promise<{ conv: ConversationRecord; wasReset: boolean }> {
    const existing = await this.repo.getConversation(phone);
    if (!existing) {
      return { conv: await this.repo.createConversation(phone, userId, defaultLanguage, this.expiry()), wasReset: false };
    }
    const expired = existing.expiresAt.getTime() <= this.now().getTime();
    if (expired) {
      return { conv: this.reset({ ...existing, userId }), wasReset: true };
    }
    return { conv: { ...existing, userId }, wasReset: false };
  }

  reset(conv: ConversationRecord): ConversationRecord {
    return { ...conv, state: "IDLE", intent: null, entities: {}, context: {} };
  }

  async save(conv: ConversationRecord): Promise<void> {
    conv.lastInboundAt = this.now();
    conv.expiresAt = this.expiry();
    await this.repo.saveConversation(conv);
  }
}
