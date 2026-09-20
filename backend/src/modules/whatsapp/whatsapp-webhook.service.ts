import type { Prisma } from "@prisma/client";
import { logger } from "../../config/logger";
import { captureException } from "../../config/sentry";
import { trackEvent } from "../../config/posthog";
import type { RequestMeta } from "../auth/auth.types";
import type { WhatsAppConfig } from "./whatsapp.config";
import type { WhatsAppRepository, StoredInbound } from "./whatsapp.repository";
import type { WhatsAppWebhookPayload } from "./whatsapp.schemas";
import type { WhatsAppConversationService } from "./whatsapp-conversation.service";
import type { WhatsAppFarmerService } from "./whatsapp-farmer.service";
import { renderPlain, WHATSAPP_META } from "./whatsapp-flow-helpers";
import { t } from "./whatsapp-i18n";
import type { WhatsAppCommandRouter } from "./whatsapp-command-router.service";
import type { WhatsAppRateLimiter } from "./whatsapp-rate-limiter";
import { detectLanguage } from "./whatsapp-text";
import { WhatsAppProviderError, type WhatsAppProvider } from "./providers/whatsapp-provider.interface";
import type { SpeechToTextProvider } from "./providers/speech-to-text.provider";
import type { AnyFlowInput, InboundMessage, InboundType, Lang, OutboundMessage } from "./whatsapp.types";

export interface IngestResult {
  accepted: number;
  duplicates: number;
  ignored: number;
  /** ids of newly-persisted inbound rows, ready for processMessage(). */
  ids: string[];
}

export interface WebhookServiceDeps {
  config: WhatsAppConfig;
  provider: WhatsAppProvider;
  repo: WhatsAppRepository;
  farmers: WhatsAppFarmerService;
  conversations: WhatsAppConversationService;
  router: WhatsAppCommandRouter;
  limiter: WhatsAppRateLimiter;
  stt: SpeechToTextProvider;
  now?: () => Date;
}

const STALE_PROCESSING_MS = 2 * 60_000;
const LINK_RE = /^\s*link\s+([A-Za-z0-9-]{6,20})\s*$/i;

/** Minimal shape persisted for an inbound message so it can be (re)processed later. */
interface StoredPayload {
  type: InboundType;
  text?: string;
  actionId?: string;
  location?: { latitude: number; longitude: number; name?: string };
  mediaId?: string;
  timestamp: string;
}

export class WhatsAppWebhookService {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly now: () => Date;

  constructor(private readonly d: WebhookServiceDeps) {
    this.now = d.now ?? (() => new Date());
  }

  // ------------------------------------------------------------------
  // Verification (delegated to the provider)
  // ------------------------------------------------------------------

  verifyWebhook(q: { mode?: string; token?: string; challenge?: string }) {
    return this.d.provider.verifyWebhook(q);
  }

  verifySignature(raw: Buffer, header: string | undefined): boolean {
    return this.d.provider.verifySignature(raw, header);
  }

  // ------------------------------------------------------------------
  // Ingest: validate → persist (idempotent) — fast, no business logic
  // ------------------------------------------------------------------

  async ingest(payload: WhatsAppWebhookPayload): Promise<IngestResult> {
    const result: IngestResult = { accepted: 0, duplicates: 0, ignored: 0, ids: [] };
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;
        const value = change.value;
        // Ignore events addressed to a different WhatsApp number than ours.
        const phoneId = value.metadata?.phone_number_id;
        if (phoneId && this.d.config.phoneNumberId && phoneId !== this.d.config.phoneNumberId) {
          result.ignored++;
          continue;
        }

        for (const s of value.statuses ?? []) {
          const status = s.status === "delivered" ? "DELIVERED" : s.status === "read" ? "READ" : s.status === "failed" ? "FAILED" : null;
          if (status) await this.d.repo.updateOutboundStatusByProviderId(s.id, status).catch(() => undefined);
        }

        const profileName = value.contacts?.[0]?.profile?.name;
        for (const raw of value.messages ?? []) {
          const msg = this.normalize(raw, profileName);
          const stored = await this.d.repo.insertInboundIfNew({
            externalMessageId: msg.externalId,
            phoneNumber: msg.from,
            messageType: msg.type,
            // Inbound text is kept (truncated) for support/debugging; outbound bodies are never stored.
            text: msg.text ? msg.text.slice(0, 1000) : null,
            payload: this.toStoredPayload(msg) as unknown as Prisma.InputJsonValue,
            receivedAt: msg.timestamp,
          });
          if (!stored) {
            result.duplicates++;
            logger.info({ event: "webhook_duplicate" }, "[WhatsApp] webhook_duplicate");
            continue;
          }
          result.accepted++;
          result.ids.push(stored.id);
          logger.info({ event: "incoming_message", type: msg.type }, "[WhatsApp] incoming_message");
          trackEvent("whatsapp_message_received", `wa:${msg.from.slice(-4)}`, { type: msg.type });
        }
      }
    }
    return result;
  }

  private normalize(m: NonNullable<NonNullable<WhatsAppWebhookPayload["entry"][number]["changes"][number]["value"]["messages"]>[number]>, profileName?: string): InboundMessage {
    const base = { externalId: m.id, from: m.from, timestamp: new Date(Number(m.timestamp) * 1000), profileName };
    if (m.type === "text" && m.text) return { ...base, type: "text", text: m.text.body };
    if (m.type === "interactive" && m.interactive) {
      const br = m.interactive.button_reply;
      const lr = m.interactive.list_reply;
      if (br) return { ...base, type: "button", actionId: br.id, text: br.title };
      if (lr) return { ...base, type: "list", actionId: lr.id, text: lr.title };
    }
    if (m.type === "location" && m.location) {
      // ~100 m precision is plenty for "nearest mandi" and keeps stored coordinates coarse.
      const r = (n: number) => Math.round(n * 1000) / 1000;
      return { ...base, type: "location", location: { latitude: r(m.location.latitude), longitude: r(m.location.longitude), name: m.location.name } };
    }
    if ((m.type === "audio" || m.type === "voice") && (m.audio || m.voice)) return { ...base, type: "audio", mediaId: (m.audio ?? m.voice)!.id };
    if (m.type === "image") return { ...base, type: "image", mediaId: m.image?.id };
    return { ...base, type: "unsupported" };
  }

  private toStoredPayload(m: InboundMessage): StoredPayload {
    return { type: m.type, text: m.text?.slice(0, 1000), actionId: m.actionId, location: m.location, mediaId: m.mediaId, timestamp: m.timestamp.toISOString() };
  }

  private fromRow(row: StoredInbound): InboundMessage {
    const p = (row.payload ?? {}) as StoredPayload;
    return {
      externalId: row.externalMessageId,
      from: row.phoneNumber,
      timestamp: p.timestamp ? new Date(p.timestamp) : row.receivedAt,
      type: p.type ?? "unsupported",
      text: p.text,
      actionId: p.actionId,
      location: p.location,
      mediaId: p.mediaId,
    };
  }

  // ------------------------------------------------------------------
  // Processing
  // ------------------------------------------------------------------

  /** Claim + process one persisted inbound message. Safe to call twice: only one caller wins the claim. */
  async processMessage(id: string): Promise<void> {
    const row = await this.d.repo.claimInbound(id, new Date(this.now().getTime() - STALE_PROCESSING_MS));
    if (!row) return;
    // One message at a time per phone number keeps conversation state consistent.
    await this.withLock(row.phoneNumber, () => this.run(row));
  }

  async processMany(ids: string[]): Promise<void> {
    await Promise.allSettled(ids.map((id) => this.processMessage(id)));
  }

  /** Re-drive messages left RECEIVED/PROCESSING by a crash (called from a cron). */
  async recoverStuck(limit = 20): Promise<number> {
    const rows = await this.d.repo.findStuckInbound(new Date(this.now().getTime() - STALE_PROCESSING_MS), limit);
    await this.processMany(rows.map((r) => r.id));
    return rows.length;
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }

  private async run(row: StoredInbound): Promise<void> {
    const { repo, config } = this.d;
    let inbound = this.fromRow(row);
    const meta: RequestMeta = WHATSAPP_META;
    let lang: Lang = detectLanguage(inbound.text ?? "", "en") ?? "en";
    let userId: string | null = null;
    let conversationId: string | null = null;

    try {
      const ageSeconds = (this.now().getTime() - inbound.timestamp.getTime()) / 1000;
      if (ageSeconds > config.maxMessageAgeSeconds) {
        await repo.markInbound(row.id, "IGNORED", { errorCode: "TOO_OLD" });
        return;
      }

      if (!(await this.d.limiter.allow(`msg:${inbound.from}`, config.rateLimitPerMinute, 60))) {
        logger.warn({ event: "rate_limited" }, "[WhatsApp] rate_limited");
        if (await this.d.limiter.allow(`slow-notice:${inbound.from}`, 1, 60)) {
          await this.deliver(row, null, null, inbound.from, [{ kind: "text", text: t("slowDown", lang) }]);
        }
        await repo.markInbound(row.id, "IGNORED", { errorCode: "RATE_LIMITED" });
        return;
      }

      // Voice notes: transcribe if an STT provider is configured, else fall through to the text hint.
      if (inbound.type === "audio" && inbound.mediaId && this.d.stt.available) {
        try {
          const media = await this.d.provider.downloadMedia(inbound.mediaId);
          const tr = await this.d.stt.transcribe(media.data, media.mimeType, ["hi-IN", "en-IN"]);
          if (tr.text.trim()) inbound = { ...inbound, type: "text", text: tr.text.trim() };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, "[WhatsApp] voice transcription failed");
        }
      }

      // "LINK <code>" works from any number: the sender must hold BOTH the
      // phone and a code issued to a logged-in website session. (Linking an
      // already-linked number moves it to the code's account.)
      if (inbound.type === "text" && LINK_RE.test(inbound.text ?? "")) {
        const out = await this.handleLink(inbound, lang, meta);
        await this.deliver(row, null, null, inbound.from, out);
        await repo.markInbound(row.id, "PROCESSED");
        return;
      }

      // Linked farmer → full assistant. Anyone else is a GUEST: not turned away, but
      // limited to public data (mandi prices, open buyer demand, "how it works") —
      // anything that needs an account answers "Continue on FarmLink".
      const identity = await this.d.farmers.resolve(inbound.from, meta);
      const farmer = identity.status === "linked" ? identity.farmer : null;
      userId = farmer ? farmer.user.id : null;
      if (farmer) logger.info({ event: "farmer_identified" }, "[WhatsApp] farmer_identified");
      else logger.info({ event: "guest_session" }, "[WhatsApp] guest_session");

      const { conv } = await this.d.conversations.load(inbound.from, userId, lang);
      conversationId = conv.id;
      const detected = inbound.type === "text" ? detectLanguage(inbound.text ?? "", conv.language) : null;
      if (detected) conv.language = detected;
      lang = conv.language;

      const input: AnyFlowInput = farmer ? { inbound, conv, farmer } : { inbound, conv };
      const messages = await this.d.router.handle(input);
      await this.d.conversations.save(conv);
      await this.deliver(row, conv.id, userId, inbound.from, messages);
      await repo.markInbound(row.id, "PROCESSED", { userId, conversationId });
    } catch (err) {
      captureException(err, { context: "whatsapp.process", messageId: row.id });
      try {
        await this.deliver(row, conversationId, userId, inbound.from, [{ kind: "text", text: t("genericError", lang) }], "err");
      } catch {
        /* nothing more we can do */
      }
      await repo.markInbound(row.id, "FAILED", { errorCode: "PROCESSING_ERROR" }).catch(() => undefined);
    }
  }

  private async handleLink(inbound: InboundMessage, lang: Lang, meta: RequestMeta): Promise<OutboundMessage[]> {
    const m = (inbound.text ?? "").match(LINK_RE)!;
    const outcome = await this.d.farmers.linkWithCode(inbound.from, m[1]!, meta);
    if (outcome === "linked") return [{ kind: "text", text: t("linkOk", lang) }];
    if (outcome === "rate_limited") return [{ kind: "text", text: t("linkTooMany", lang) }];
    return [{ kind: "text", text: t("linkBad", lang) }];
  }

  // ------------------------------------------------------------------
  // Outbound (idempotent per inbound event + position)
  // ------------------------------------------------------------------

  private async deliver(row: StoredInbound, conversationId: string | null, userId: string | null, to: string, messages: OutboundMessage[], tag = ""): Promise<void> {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      const key = `out:${row.externalMessageId}:${tag}${i}`;
      const created = await this.d.repo.createOutboundIfNew({ externalMessageId: key, phoneNumber: to, conversationId, userId, messageType: msg.kind });
      if (!created) continue; // this reply was already sent for this event
      try {
        const sent = await this.send(to, msg);
        await this.d.repo.updateOutbound(key, { status: "SENT", providerMessageId: sent.providerMessageId });
        logger.info({ event: "outgoing_message", kind: msg.kind }, "[WhatsApp] outgoing_message");
      } catch (err) {
        const code = err instanceof WhatsAppProviderError ? err.code : "SEND_FAILED";
        await this.d.repo.updateOutbound(key, { status: "FAILED", errorCode: code }).catch(() => undefined);
        logger.error({ event: "provider_error", code }, "[WhatsApp] provider_error");
        captureException(err, { context: "whatsapp.send", code });
      }
    }
  }

  /** Interactive first; if WhatsApp rejects the interactive form, fall back to numbered plain text. */
  private async send(to: string, msg: OutboundMessage) {
    const p = this.d.provider;
    try {
      switch (msg.kind) {
        case "text":
          return await p.sendTextMessage(to, msg.text);
        case "buttons":
          return await p.sendInteractiveMessage(to, { type: "buttons", body: msg.body, buttons: msg.buttons });
        case "list":
          return await p.sendListMessage(to, { body: msg.body, buttonText: msg.buttonText, rows: msg.rows, sectionTitle: msg.sectionTitle });
        case "cta_url":
          return await p.sendInteractiveMessage(to, { type: "cta_url", body: msg.body, displayText: msg.displayText, url: msg.url });
      }
    } catch (err) {
      if (msg.kind !== "text" && err instanceof WhatsAppProviderError && !err.retryable) {
        return p.sendTextMessage(to, renderPlain(msg));
      }
      throw err;
    }
  }
}
