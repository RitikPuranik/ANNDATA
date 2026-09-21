import { logger } from "../../config/logger";
import { captureException } from "../../config/sentry";
import { AppError } from "../../common/errors";
import type { RequestMeta } from "../auth/auth.types";
import { t, type MsgKey } from "./whatsapp-i18n";
import type { ConversationRecord, Lang, OutboundMessage } from "./whatsapp.types";

/** Audit metadata for actions taken over WhatsApp. */
export const WHATSAPP_META: RequestMeta = { userAgent: "whatsapp-assistant" };

export interface OptionSpec {
  action: string;
  ref?: string;
  title: string;
  description?: string;
}

/**
 * Builds an interactive message AND records, server-side, what each option
 * means. Button/list ids sent to WhatsApp are just "opt:<n>" — no database ids
 * ever leave the server, and a forged id can only select an option that this
 * conversation actually offered.
 */
export function optionsMessage(
  conv: ConversationRecord,
  body: string,
  specs: OptionSpec[],
  opts: { layout?: "auto" | "buttons" | "list"; listButton?: string; sectionTitle?: string } = {},
): OutboundMessage {
  const limited = specs.slice(0, 10);
  conv.context.options = limited.map((s, i) => ({ n: i + 1, action: s.action, ...(s.ref !== undefined ? { ref: s.ref } : {}) }));
  const layout = opts.layout === "auto" || !opts.layout ? (limited.length <= 3 ? "buttons" : "list") : opts.layout;
  if (layout === "buttons" && limited.length <= 3) {
    return { kind: "buttons", body, buttons: limited.map((s, i) => ({ id: `opt:${i + 1}`, title: s.title })) };
  }
  return {
    kind: "list",
    body,
    buttonText: opts.listButton ?? "Choose",
    ...(opts.sectionTitle ? { sectionTitle: opts.sectionTitle } : {}),
    rows: limited.map((s, i) => ({ id: `opt:${i + 1}`, title: s.title, ...(s.description ? { description: s.description } : {}) })),
  };
}

export const textMsg = (text: string): OutboundMessage => ({ kind: "text", text });

export function ctaMsg(body: string, displayText: string, url: string): OutboundMessage {
  return { kind: "cta_url", body, displayText, url };
}

export type GateReason = "lots" | "offers" | "payments" | "shipments" | "sendOffer" | "farms" | "generic";

const GATE_WHAT: Record<GateReason, MsgKey> = {
  lots: "gateLots",
  offers: "gateOffers",
  payments: "gatePayments",
  shipments: "gateShipments",
  sendOffer: "gateSendOffer",
  farms: "gateFarms",
  generic: "gateGeneric",
};

/**
 * The single "this needs a ANNDATA account" reply for numbers that aren't
 * linked to one. Everything that creates, publishes or reads account-owned data
 * ends up here → "🌐 Continue on ANNDATA". (The button label is capped at 20
 * characters by WhatsApp, so the globe lives in the body, not on the button.)
 */
export function guestGate(lang: Lang, signupUrl: string, reason: GateReason): OutboundMessage {
  return ctaMsg(t("guestGate", lang, { what: t(GATE_WHAT[reason], lang) }), t("ctaContinue", lang), signupUrl);
}

export function clearOptions(conv: ConversationRecord): void {
  delete conv.context.options;
}

/** Numbered plain-text rendering, used when interactive delivery isn't possible. */
export function renderPlain(msg: OutboundMessage): string {
  switch (msg.kind) {
    case "text":
      return msg.text;
    case "cta_url":
      return `${msg.body}\n\n${msg.displayText}: ${msg.url}`;
    case "buttons":
      return `${msg.body}\n\n${msg.buttons.map((b, i) => `${i + 1}️⃣ ${b.title}`).join("\n")}`;
    case "list":
      return `${msg.body}\n\n${msg.rows.map((r, i) => `${i + 1}️⃣ ${r.title}${r.description ? ` — ${r.description}` : ""}`).join("\n")}`;
  }
}

const codeOf = (err: unknown): string => {
  const c = (err as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : "";
};

/**
 * Turns any service failure into a short farmer-facing message. Specific,
 * safe business outcomes (expired offer, not enough quantity…) get their own
 * wording; everything else becomes the generic "try again" text. Technical
 * detail goes to logs/Sentry only — never to the farmer.
 */
export function errorMessage(err: unknown, lang: Lang, context: string): OutboundMessage {
  const code = codeOf(err);
  let key: MsgKey = "genericError";
  let unexpected = true;

  if (/OFFER_EXPIRED|^EXPIRED$/.test(code)) { key = "offerExpired"; unexpected = false; }
  else if (/INVALID_OFFER_TRANSITION/.test(code)) { key = "offerNotActionable"; unexpected = false; }
  else if (/INSUFFICIENT_AVAILABLE_QUANTITY/.test(code)) { key = "quantityUnavailable"; unexpected = false; }
  else if (/LOT_NOT_AVAILABLE|DEMAND_NOT_ACTIVE/.test(code)) { key = "lotNotReady"; unexpected = false; }
  else if (err instanceof AppError && err.statusCode < 500) { unexpected = false; }

  if (unexpected) {
    captureException(err, { context: `whatsapp.${context}` });
  } else {
    logger.info({ event: "service_rejected", context, code }, "[WhatsApp] service rejected request");
  }
  return textMsg(t(key, lang));
}
