import { randomInt } from "crypto";
import type { AuditService } from "../audit/audit.service";
import { hashToken } from "../auth/auth.utils";
import type { RequestMeta } from "../auth/auth.types";
import { logger } from "../../config/logger";
import type { WhatsAppConfig } from "./whatsapp.config";
import type { WhatsAppRepository } from "./whatsapp.repository";
import type { WhatsAppRateLimiter } from "./whatsapp-rate-limiter";
import type { LinkedFarmer } from "./whatsapp.types";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const CODE_LENGTH = 8;
export const LINK_CODE_TTL_MINUTES = 10;

export type FarmerResolution =
  | { status: "linked"; farmer: LinkedFarmer }
  | { status: "unlinked" };

export type LinkOutcome = "linked" | "invalid" | "rate_limited";

export function generateLinkCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return out;
}

/** wa_id (91XXXXXXXXXX) → the 10-digit form Anndata stores in User.mobile. */
export function toAnndataMobile(waId: string): string {
  return waId.length === 12 && waId.startsWith("91") ? waId.slice(2) : waId;
}

/**
 * Identity for the WhatsApp channel.
 *
 * The WhatsApp sender number is authenticated by Meta (the webhook is
 * signature-verified), but Anndata's `User.mobile` is NOT OTP-verified, so
 * "same phone number" is not enough to expose a farmer's data. A number is
 * trusted only after an explicit link: the farmer, logged in on the website,
 * requests a one-time code and sends it from WhatsApp. The user id used for
 * every downstream call always comes from this link — never from message
 * content.
 */
export class WhatsAppFarmerService {
  constructor(
    private readonly repo: WhatsAppRepository,
    private readonly audit: AuditService,
    private readonly config: Pick<WhatsAppConfig, "devAutoLinkByMobile">,
    private readonly limiter: WhatsAppRateLimiter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolve(phone: string, meta: RequestMeta): Promise<FarmerResolution> {
    const linked = await this.repo.findLinkedUserByPhone(phone);
    if (linked) {
      // Suspended/deactivated or non-farmer accounts are treated as not linked.
      if (linked.role !== "FARMER" || linked.accountStatus !== "ACTIVE") return { status: "unlinked" };
      await this.repo.touchLink(phone).catch(() => undefined);
      return { status: "linked", farmer: this.toFarmer(linked.userId, linked.publicId, linked.fullName, phone) };
    }

    if (this.config.devAutoLinkByMobile) {
      const candidate = await this.repo.findFarmerByMobile(toAnndataMobile(phone));
      if (candidate && candidate.role === "FARMER" && candidate.accountStatus === "ACTIVE") {
        await this.repo.upsertLink(candidate.id, phone);
        logger.warn({ event: "dev_auto_link" }, "[WhatsApp] DEV auto-link by mobile used (disabled in production)");
        await this.audit.record({ actorUserId: candidate.id, action: "WHATSAPP_ACCOUNT_LINKED", entityType: "WhatsAppLink", entityId: candidate.id, metadata: { method: "dev_auto_link" }, ...meta });
        return { status: "linked", farmer: this.toFarmer(candidate.id, candidate.publicId, candidate.fullName, phone) };
      }
    }
    return { status: "unlinked" };
  }

  private toFarmer(id: string, publicId: string, fullName: string, phone: string): LinkedFarmer {
    return { user: { id, publicId, role: "FARMER" } as LinkedFarmer["user"], fullName, phoneNumber: phone };
  }

  /** Website side: an authenticated farmer asks for a one-time code. */
  async issueLinkCode(userId: string, meta: RequestMeta): Promise<{ code: string; expiresAt: Date }> {
    const code = generateLinkCode();
    const expiresAt = new Date(this.now().getTime() + LINK_CODE_TTL_MINUTES * 60_000);
    await this.repo.createLinkCode(userId, "whatsapp", hashToken(code), expiresAt);
    await this.audit.record({ actorUserId: userId, action: "WHATSAPP_LINK_CODE_ISSUED", entityType: "WhatsAppLink", entityId: userId, ...meta });
    return { code, expiresAt };
  }

  /** WhatsApp side: "LINK ABCD2345". Wrong guesses are rate-limited per number. */
  async linkWithCode(phone: string, rawCode: string, meta: RequestMeta): Promise<LinkOutcome> {
    const code = rawCode.replace(/[\s-]/g, "").toUpperCase();
    if (!(await this.limiter.allow(`link-attempt:${phone}`, 5, 3600))) return "rate_limited";
    if (!new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code)) return "invalid";

    const userId = await this.repo.consumeLinkCode(hashToken(code), this.now());
    if (!userId) return "invalid";
    await this.repo.upsertLink(userId, phone);
    await this.audit.record({ actorUserId: userId, action: "WHATSAPP_ACCOUNT_LINKED", entityType: "WhatsAppLink", entityId: userId, metadata: { method: "one_time_code" }, ...meta });
    return "linked";
  }

  async status(userId: string): Promise<{ linked: boolean; phoneMasked?: string; linkedAt?: Date }> {
    const l = await this.repo.getLinkByUser(userId);
    if (!l) return { linked: false };
    return { linked: true, phoneMasked: `••••${l.phoneNumber.slice(-4)}`, linkedAt: l.linkedAt };
  }

  async unlink(userId: string, meta: RequestMeta): Promise<boolean> {
    const removed = await this.repo.deleteLinkByUser(userId);
    if (removed) await this.audit.record({ actorUserId: userId, action: "WHATSAPP_ACCOUNT_UNLINKED", entityType: "WhatsAppLink", entityId: userId, ...meta });
    return removed;
  }
}
