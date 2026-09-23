import type { PrismaClient } from "@prisma/client";
import type { AuditService } from "../audit/audit.service";
import type { BuyerMatchingService } from "../buyer-matching/buyer-matching.service";
import { counterBody } from "../buyer-matching/buyer-matching.schemas";
import type { AnndataUrlService } from "./whatsapp-deeplink.service";
import { ctaMsg, optionsMessage, textMsg, WHATSAPP_META, type OptionSpec } from "./whatsapp-flow-helpers";
import { t } from "./whatsapp-i18n";
import { extractNumber } from "./nlu/whatsapp-command-parser";
import { inr, num, unitShort } from "./whatsapp-text";
import type { ConfirmKind, FlowInput, Lang, OutboundMessage, QuantityUnitCode } from "./whatsapp.types";

interface OfferView {
  publicId: string;
  status: string;
  quantity: number;
  quantityUnit: QuantityUnitCode;
  offeredPrice: number;
  totalValue: number;
  buyer?: { organizationName?: string };
  lot?: { publicId?: string; crop?: { name?: string } };
}

const PAGE_SIZE = 4;
const ACTIVE = new Set(["SENT", "COUNTERED"]);
const RANK: Record<string, number> = { SENT: 0, COUNTERED: 0, ACCEPTED: 1 };

const STATUS: Record<string, [string, string, string]> = {
  SENT: ["🟡 Pending", "🟡 लंबित", "🟡 Pending"],
  COUNTERED: ["🟡 Counter offer", "🟡 काउंटर ऑफर", "🟡 Counter offer"],
  ACCEPTED: ["🟢 Accepted", "🟢 स्वीकार", "🟢 Accepted"],
  REJECTED: ["🔴 Rejected", "🔴 अस्वीकार", "🔴 Rejected"],
  WITHDRAWN: ["⚪ Withdrawn", "⚪ वापस लिया", "⚪ Withdrawn"],
  EXPIRED: ["⚪ Expired", "⚪ समाप्त", "⚪ Expired"],
};
const statusLabel = (s: string, lang: Lang): string => {
  const e = STATUS[s];
  return e ? (lang === "en" ? e[0] : lang === "hi" ? e[1] : e[2]) : s;
};
const RESULT: Record<string, [string, string, string]> = {
  ACCEPT_OFFER: ["accepted", "स्वीकार किया गया", "accept ho gaya"],
  REJECT_OFFER: ["rejected", "अस्वीकार किया गया", "reject ho gaya"],
  WITHDRAW_OFFER: ["withdrawn", "वापस लिया गया", "withdraw ho gaya"],
  COUNTER_OFFER: ["countered", "काउंटर भेजा गया", "counter bhej diya gaya"],
};
const VERB: Record<string, [string, string, string]> = {
  ACCEPT_OFFER: ["Accept", "स्वीकार करें", "accept karein"],
  REJECT_OFFER: ["Reject", "अस्वीकार करें", "reject karein"],
  WITHDRAW_OFFER: ["Withdraw", "वापस लें", "withdraw karein"],
  COUNTER_OFFER: ["Send counter for", "काउंटर भेजें", "counter bhejein"],
};
const pick = (m: Record<string, [string, string, string]>, k: string, lang: Lang) => (m[k] ? (lang === "en" ? m[k]![0] : lang === "hi" ? m[k]![1] : m[k]![2]) : k);

/**
 * "offers": every action goes through the EXISTING BuyerMatchingService
 * (accept / reject / withdraw / counter). There is no WhatsApp-side offer
 * state machine: authorization, expiry, quantity reservation, race handling
 * and status transitions are all decided by that service, and its errors are
 * mapped to plain-language replies by the router.
 */
export class WhatsAppOfferService {
  constructor(
    private readonly matching: BuyerMatchingService,
    private readonly prisma: PrismaClient,
    private readonly urls: AnndataUrlService,
    private readonly audit: AuditService,
  ) {}

  /** Farmer's offers (service-scoped) + which ones the farmer initiated. */
  private async load(input: FlowInput): Promise<{ offers: OfferView[]; own: Set<string> }> {
    const offers = (await this.matching.offers(input.farmer.user)) as OfferView[];
    if (offers.length === 0) return { offers, own: new Set() };
    const rows = await this.prisma.tradeOffer.findMany({ where: { publicId: { in: offers.map((o) => o.publicId) } }, select: { publicId: true, initiatorId: true } });
    return { offers, own: new Set(rows.filter((r) => r.initiatorId === input.farmer.user.id).map((r) => r.publicId)) };
  }

  async show(input: FlowInput, page = 1): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const { offers, own } = await this.load(input);
    conv.state = "IDLE";
    if (offers.length === 0) return [ctaMsg(t("noOffers", lang), t("ctaOffers", lang), this.urls.offers())];

    const sorted = [...offers].sort((a, b) => (RANK[a.status] ?? 2) - (RANK[b.status] ?? 2));
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);
    const slice = sorted.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

    const blocks: string[] = [];
    const specs: OptionSpec[] = [];
    slice.forEach((o, i) => {
      blocks.push(this.summary(o, lang, i + 1, own.has(o.publicId)));
      specs.push({ action: "offer:open", ref: o.publicId, title: `${o.lot?.crop?.name ?? "Offer"} · ${inr(o.offeredPrice)}`, description: o.buyer?.organizationName });
    });
    if (p < pages) specs.push({ action: "offers:more", title: t("btnMoreItems", lang) });

    conv.state = "SHOWING_OFFERS";
    conv.intent = "VIEW_OFFERS";
    conv.context.offersPage = p;
    await this.audit.record({ actorUserId: input.farmer.user.id, action: "WHATSAPP_OFFER_VIEWED", entityType: "TradeOffer", metadata: { channel: "whatsapp", count: slice.length }, ...WHATSAPP_META }).catch(() => undefined);
    const header = `${t("offersHeader", lang)}${pages > 1 ? ` (${p}/${pages})` : ""}\n\n${blocks.join("\n\n")}`;
    return [optionsMessage(conv, header, specs, { layout: "list", listButton: t("btnChoose", lang) })];
  }

  private summary(o: OfferView, lang: Lang, n: number, own: boolean): string {
    const u = unitShort(o.quantityUnit);
    return `${n}️⃣ ${o.lot?.crop?.name ?? "-"}\nBuyer: ${o.buyer?.organizationName ?? "-"}\nQuantity: ${num(o.quantity)} ${u}\nOffer: ${inr(o.offeredPrice)}/${u}\nTotal: ${inr(o.totalValue)}\nStatus: ${statusLabel(o.status, lang)}${own && ACTIVE.has(o.status) ? `\n${t("ownOfferNote", lang)}` : ""}`;
  }

  async open(input: FlowInput, offerPublicId: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const { offers, own } = await this.load(input);
    const o = offers.find((x) => x.publicId === offerPublicId); // absent ⇒ not this farmer's offer
    if (!o) return [textMsg(t("genericError", lang))];
    conv.state = "SHOWING_OFFERS";
    const mine = own.has(o.publicId);
    const specs: OptionSpec[] = [];
    if (ACTIVE.has(o.status)) {
      if (mine) specs.push({ action: "offer:withdraw", ref: o.publicId, title: t("btnWithdraw", lang) });
      else specs.push(
        { action: "offer:accept", ref: o.publicId, title: t("btnAccept", lang) },
        { action: "offer:reject", ref: o.publicId, title: t("btnReject", lang) },
        { action: "offer:counter", ref: o.publicId, title: t("btnCounter", lang) },
      );
    }
    specs.push({ action: "menu:help", title: t("btnBackMenu", lang) });
    const body = this.summary(o, lang, 1, mine).replace("1️⃣ ", "🌾 ");
    return [optionsMessage(conv, body, specs.slice(0, 3)), ctaMsg(t("moreOnWebsite", lang), t("ctaOffers", lang), this.urls.offer(o.publicId))];
  }

  /** First step of accept/reject/withdraw/counter: always confirm before acting. */
  async askConfirm(input: FlowInput, kind: ConfirmKind, offerPublicId: string, price?: number): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const { offers } = await this.load(input);
    const o = offers.find((x) => x.publicId === offerPublicId);
    if (!o) return [textMsg(t("genericError", lang))];
    const u = unitShort(o.quantityUnit);
    const usePrice = kind === "COUNTER_OFFER" && price ? price : o.offeredPrice;
    conv.state = "AWAITING_CONFIRMATION";
    conv.context.confirm = { kind, ref: offerPublicId, ...(price ? { price } : {}) };
    const body = t("confirmOfferAction", lang, {
      action: pick(VERB, kind, lang),
      buyer: o.buyer?.organizationName ?? "-",
      crop: o.lot?.crop?.name ?? "-",
      qty: `${num(o.quantity)} ${u}`,
      price: inr(usePrice),
      per: `/${u}`,
      total: inr(usePrice * o.quantity),
    });
    return [optionsMessage(conv, body, [{ action: "confirm:yes", title: t("yes", lang) }, { action: "confirm:no", title: t("no", lang) }])];
  }

  async askCounterPrice(input: FlowInput, offerPublicId: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const { offers } = await this.load(input);
    const o = offers.find((x) => x.publicId === offerPublicId);
    if (!o) return [textMsg(t("genericError", lang))];
    conv.state = "COLLECTING_PRICE";
    conv.intent = "VIEW_OFFERS";
    conv.context.pendingOfferPublicId = offerPublicId;
    return [textMsg(t("offerAskCounter", lang, { per: `(₹/${unitShort(o.quantityUnit)})` }))];
  }

  async answerCounterPrice(input: FlowInput, text: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const price = extractNumber(text);
    const ref = conv.context.pendingOfferPublicId;
    if (!price || !ref) return [textMsg(t("badPrice", conv.language))];
    return this.askConfirm(input, "COUNTER_OFFER", ref, price);
  }

  /** Confirmed: perform the action via the existing service. */
  async execute(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const c = conv.context.confirm;
    if (!c?.ref) return [textMsg(t("genericError", lang))];
    const user = input.farmer.user;
    switch (c.kind) {
      case "ACCEPT_OFFER":
        await this.matching.accept(user, c.ref);
        break;
      case "REJECT_OFFER":
        await this.matching.offerAction(user, c.ref, "REJECTED");
        break;
      case "WITHDRAW_OFFER":
        await this.matching.offerAction(user, c.ref, "WITHDRAWN");
        break;
      case "COUNTER_OFFER": {
        const { offers } = await this.load(input);
        const o = offers.find((x) => x.publicId === c.ref);
        if (!o || !c.price) return [textMsg(t("genericError", lang))];
        await this.matching.counter(user, c.ref, counterBody.parse({ quantity: o.quantity, quantityUnit: o.quantityUnit, offeredPrice: c.price }));
        break;
      }
      default:
        return [textMsg(t("genericError", lang))];
    }
    await this.audit.record({ actorUserId: user.id, action: "WHATSAPP_OFFER_ACTION", entityType: "TradeOffer", metadata: { channel: "whatsapp", action: c.kind }, ...WHATSAPP_META }).catch(() => undefined);
    conv.state = "IDLE";
    conv.intent = null;
    conv.context = {};
    return [textMsg(t("offerDone", lang, { result: pick(RESULT, c.kind, lang) })), ctaMsg(t("moreOnWebsite", lang), t("ctaOffers", lang), this.urls.offers())];
  }
}
