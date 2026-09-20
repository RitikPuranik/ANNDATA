import type { AuditService } from "../audit/audit.service";
import type { BuyerMatchingService } from "../buyer-matching/buyer-matching.service";
import { offerBody } from "../buyer-matching/buyer-matching.schemas";
import { convertQuantityToKg } from "../fpo/unit-conversion";
import type { LotsService } from "../lots/lots.service";
import type { QualityService } from "../quality/quality.service";
import type { CropDTO } from "../reference-data/reference-data.service";
import { extractBareQuantity, extractGrade, isDontKnow, isOther } from "./nlu/whatsapp-command-parser";
import type { WhatsAppCatalogService } from "./whatsapp-catalog.service";
import type { FarmLinkUrlService } from "./whatsapp-deeplink.service";
import { ctaMsg, optionsMessage, textMsg, WHATSAPP_META, type OptionSpec } from "./whatsapp-flow-helpers";
import { t } from "./whatsapp-i18n";
import { lotStatusLabel, type WhatsAppLotService } from "./whatsapp-lot-service";
import type { WhatsAppMarketService } from "./whatsapp-market-service";
import type { WhatsAppRateLimiter } from "./whatsapp-rate-limiter";
import { extractNumber } from "./nlu/whatsapp-command-parser";
import { inr, normalizeText, num, parseBareNumber, unitLong, unitShort } from "./whatsapp-text";
import type { BuyerCard, ConversationRecord, FlowInput, GradeCode, OutboundMessage, QuantityUnitCode, RawEntities } from "./whatsapp.types";

const BUYERS_PER_PAGE = 3;
const usable = new Set(["AVAILABLE", "PARTIALLY_COMMITTED"]);

interface MatchRow {
  buyer: { organizationName: string; district?: string | null; state?: string | null };
  demand: { publicId: string; requiredQuantity: number; quantityUnit: QuantityUnitCode; state: string; district: string };
  matchScore?: number;
}

const gradeLabel = (g: GradeCode | undefined, lang: "en" | "hi" | "hinglish"): string =>
  !g || g === "UNKNOWN" ? (lang === "en" ? "Not specified" : lang === "hi" ? "पता नहीं" : "Pata nahi") : `Grade ${g}`;

/**
 * The "buyer" flow. It only COLLECTS what the farmer says and then delegates:
 *   lots     → LotsService (create/publish, ownership/validation there)
 *   quality  → QualityService (self-reported grade as a MANUAL assessment)
 *   matching → BuyerMatchingService.matches (deterministic scoring; no LLM)
 *   offers   → BuyerMatchingService.createOffer (existing state machine)
 * Nothing here decides who the "best" buyer is beyond presenting the
 * engine's own score order.
 */
export class WhatsAppBuyerAssistantService {
  constructor(
    private readonly catalog: WhatsAppCatalogService,
    private readonly lots: LotsService,
    private readonly lotView: WhatsAppLotService,
    private readonly quality: QualityService,
    private readonly matching: BuyerMatchingService,
    private readonly market: WhatsAppMarketService,
    private readonly urls: FarmLinkUrlService,
    private readonly audit: AuditService,
    private readonly limiter: WhatsAppRateLimiter,
    private readonly matchingLimitPerHour: number,
  ) {}

  // ---------------------------------------------------------------------
  // Progressive collection
  // ---------------------------------------------------------------------

  /** Begin (or resume) the flow with whatever the farmer already told us. */
  async start(input: FlowInput, raw: RawEntities): Promise<OutboundMessage[]> {
    const { conv } = input;
    conv.intent = "FIND_BUYER";
    conv.entities = {};
    conv.context = {};
    const noted = await this.mergeEntities(input, raw);
    return this.advance(input, noted);
  }

  private async mergeEntities(input: FlowInput, raw: RawEntities): Promise<boolean> {
    const e = input.conv.entities;
    let noted = false;
    if (raw.crop) {
      const crop = await this.catalog.resolveCrop(raw.crop);
      if (crop) e.crop = { id: crop.id, name: crop.name };
    }
    if (raw.quantity && raw.unit) {
      e.quantity = raw.quantity;
      e.unit = raw.unit;
      noted = true;
    }
    if (raw.location) e.location = raw.location.slice(0, 80);
    if (raw.qualityGrade) e.qualityGrade = raw.qualityGrade;
    return noted;
  }

  private async advance(input: FlowInput, quantityJustNoted = false): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const e = conv.entities;
    const name = e.crop ? this.displayCrop(e.crop.name, conv) : "";
    const prefix = quantityJustNoted && e.crop && e.quantity ? `${t("quantityNoted", lang, { crop: name, qty: `${num(e.quantity)} ${unitLong(e.unit ?? "QTL")}` })}\n\n` : "";

    if (!e.crop) return this.askCrop(input);
    if (!e.quantity) {
      conv.state = "COLLECTING_QUANTITY";
      return [textMsg(t("askQuantity", lang, { crop: name }))];
    }
    if (!e.location) {
      conv.state = "COLLECTING_LOCATION";
      return [textMsg(prefix + t("askLocation", lang, { crop: name }))];
    }
    if (!e.qualityGrade) {
      conv.state = "COLLECTING_QUALITY";
      const body = t("askQuality", lang).split("\n")[0]!;
      return [
        optionsMessage(conv, prefix + body, [
          { action: "grade:A", title: t("gradeA", lang) },
          { action: "grade:B", title: t("gradeB", lang) },
          { action: "grade:UNKNOWN", title: t("gradeUnknown", lang) },
        ]),
      ];
    }
    return this.resolveLotAndSearch(input);
  }

  private displayCrop(englishName: string, conv: ConversationRecord): string {
    return englishName && conv.language === "hi" ? englishName : englishName;
  }

  async askCrop(input: FlowInput, intent: "FIND_BUYER" | "CHECK_MANDI_PRICE" = "FIND_BUYER"): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const crops = await this.catalog.cropMenu(input.farmer.user.id, 9);
    conv.state = "COLLECTING_CROP";
    conv.intent = intent;
    delete conv.context.awaitingCropName;
    const specs: OptionSpec[] = crops.map((c) => ({ action: "crop:pick", ref: c.id, title: this.catalog.displayName(c, lang) }));
    specs.push({ action: "crop:other", title: t("other", lang) });
    return [optionsMessage(conv, t(intent === "FIND_BUYER" ? "askCrop" : "askCropPrice", lang), specs, { layout: "list", listButton: t("btnChoose", lang) })];
  }

  /** Farmer chose/typed a crop (buyer OR bhav flow). Returns null if the text isn't a crop. */
  async resolveCropAnswer(input: FlowInput, text: string): Promise<CropDTO | "other" | null> {
    if (isOther(text)) return "other";
    return this.catalog.resolveCrop(text);
  }

  async handleCollecting(input: FlowInput, text: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const e = conv.entities;

    switch (conv.state) {
      case "COLLECTING_CROP": {
        const r = await this.resolveCropAnswer(input, text);
        if (r === "other") {
          conv.context.awaitingCropName = true;
          return [textMsg(t("askCropName", lang))];
        }
        if (!r) return [textMsg(t("cropNotFound", lang, { text: text.slice(0, 40) })), ...(await this.askCrop(input))];
        e.crop = { id: r.id, name: r.name };
        return this.advance(input);
      }
      case "COLLECTING_QUANTITY": {
        const q = extractBareQuantity(normalizeText(text));
        if (!q) return [textMsg(t("badQuantity", lang))];
        e.quantity = q.quantity;
        e.unit = q.unit;
        return this.advance(input, true);
      }
      case "COLLECTING_LOCATION": {
        const loc = text.trim().slice(0, 80);
        if (loc.length < 2) return [textMsg(t("askLocation", lang, { crop: e.crop?.name ?? "" }))];
        e.location = loc;
        return this.advance(input);
      }
      case "COLLECTING_QUALITY": {
        const g = isDontKnow(text) ? "UNKNOWN" : extractGrade(normalizeText(text), true);
        if (!g) return [textMsg(t("askQuality", lang))];
        e.qualityGrade = g;
        return this.advance(input);
      }
      default:
        return [textMsg(t("invalidChoice", lang))];
    }
  }

  // ---------------------------------------------------------------------
  // Option/button actions
  // ---------------------------------------------------------------------

  async handleAction(input: FlowInput, action: string, ref?: string): Promise<OutboundMessage[] | null> {
    const { conv } = input;
    const e = conv.entities;
    switch (action) {
      case "crop:pick": {
        const crops = await this.catalog.listCrops();
        const c = crops.find((x) => x.id === ref);
        if (!c) return null;
        e.crop = { id: c.id, name: c.name };
        return this.advance(input);
      }
      case "crop:other":
        conv.context.awaitingCropName = true;
        return [textMsg(t("askCropName", conv.language))];
      case "grade:A":
      case "grade:B":
      case "grade:C":
      case "grade:D":
      case "grade:UNKNOWN":
        e.qualityGrade = action.split(":")[1] as GradeCode;
        return this.advance(input);
      case "farm:pick":
        e.farmId = ref;
        return this.resolveLotAndSearch(input);
      case "lot:reuse":
        e.lotPublicId = ref;
        conv.context.confirm = undefined;
        return this.searchBuyers(input, ref!);
      case "lot:new":
        conv.context.declinedReuse = true;
        return this.resolveLotAndSearch(input);
      case "lot:buyers":
        return this.showBuyersForLot(input, ref!);
      case "buyers:more":
        return this.buyersPage(input, (conv.context.buyerPage ?? 1) + 1);
      case "buyers:details":
      case "buyers:offer":
        return this.chooseBuyer(input, action === "buyers:offer" ? "offer" : "details");
      case "buyer:offer-for":
        return this.startOffer(input, Number(ref));
      case "buyer:pick":
        return conv.context.pendingBuyerAction === "offer" ? this.startOffer(input, Number(ref)) : this.buyerDetails(input, Number(ref));
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------
  // Lot resolution (reuse existing lot, or create through LotsService)
  // ---------------------------------------------------------------------

  private async resolveLotAndSearch(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const e = conv.entities;
    const user = input.farmer.user;

    if (e.lotPublicId) return this.searchBuyers(input, e.lotPublicId);

    const farms = await this.catalog.farmsOf(user.id);
    if (farms.length === 0) {
      this.finish(conv);
      return [ctaMsg(t("noFarm", lang), t("ctaAddFarm", lang), this.urls.newFarm())];
    }

    // Which farm? Prefer the one matching the typed location; ask if unclear.
    let farm = e.farmId ? farms.find((f) => f.id === e.farmId) : undefined;
    if (!farm) {
      const matches = this.catalog.matchFarms(farms, e.location ?? "");
      farm = matches.length === 1 ? matches[0] : farms.length === 1 ? farms[0] : undefined;
    }
    if (!farm) {
      conv.state = "COLLECTING_FARM";
      const list = farms.slice(0, 9);
      return [
        optionsMessage(conv, t("askFarm", lang, { crop: e.crop!.name }), list.map((f) => ({ action: "farm:pick", ref: f.id, title: this.catalog.farmLabel(f).slice(0, 24) })), {
          layout: "list",
          listButton: t("btnChoose", lang),
        }),
      ];
    }
    e.farmId = farm.id;

    if (!(await this.catalog.hasCropOnFarm(user.id, farm.id, e.crop!.id))) {
      this.finish(conv);
      return [ctaMsg(t("cropNotOnFarm", lang, { crop: e.crop!.name }), t("ctaOpen", lang), this.urls.crops())];
    }

    // Existing matching lot? Offer to reuse instead of creating a duplicate.
    if (!conv.context.declinedReuse) {
      const wantKg = convertQuantityToKg(e.quantity!, e.unit!);
      const existing = (await this.lotView.activeLots(input)).find(
        (l) => l.crop.id === e.crop!.id && l.farm?.id === farm!.id && usable.has(l.status) && Math.abs(l.quantity.quantityKg - wantKg) <= Math.max(1, wantKg * 0.01),
      );
      if (existing) {
        conv.state = "AWAITING_CONFIRMATION";
        const place = [existing.origin.village, existing.origin.district].filter(Boolean).join(", ");
        return [
          optionsMessage(conv, t("reuseLot", lang, { crop: existing.crop.name, qty: `${num(existing.availableQuantity.value)} ${unitLong(existing.availableQuantity.unit)}`, place, status: lotStatusLabel(existing.status, lang).replace(/^\S+\s/, "") }), [
            { action: "lot:reuse", ref: existing.publicId, title: t("useLot", lang) },
            { action: "lot:new", title: t("newLot", lang) },
          ]),
        ];
      }
    }

    // Confirm before creating anything.
    conv.state = "AWAITING_CONFIRMATION";
    conv.context.confirm = { kind: "CREATE_LOT" };
    const body = t("confirmLot", lang, {
      crop: e.crop!.name,
      qty: `${num(e.quantity!)} ${unitLong(e.unit!)}`,
      place: this.catalog.farmLabel(farm),
      grade: gradeLabel(e.qualityGrade, lang),
    });
    return [optionsMessage(conv, body, [{ action: "confirm:yes", title: t("yes", lang) }, { action: "confirm:no", title: t("no", lang) }])];
  }

  /** Confirmed "create this lot": create → record grade → publish → search. */
  async confirmCreateLot(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const e = conv.entities;
    const user = input.farmer.user;
    if (e.lotPublicId) return this.searchBuyers(input, e.lotPublicId); // already created in this flow
    if (!e.crop || !e.quantity || !e.unit || !e.farmId) return [textMsg(t("genericError", lang))];

    const lot = await this.lots.createLot(user, { farmId: e.farmId, cropId: e.crop.id, quantity: e.quantity, unit: e.unit, availabilityDate: new Date() } as Parameters<LotsService["createLot"]>[1], WHATSAPP_META);
    e.lotPublicId = lot.publicId;
    conv.context.confirm = undefined;

    if (e.qualityGrade && e.qualityGrade !== "UNKNOWN") {
      try {
        // Recorded as the farmer's own (self-reported) assessment.
        await this.quality.createAssessment(user, lot.publicId, { source: "MANUAL", overallGrade: e.qualityGrade } as Parameters<QualityService["createAssessment"]>[2], WHATSAPP_META);
      } catch {
        /* grade is optional metadata; never block the sale on it */
      }
    }
    if (lot.status === "DRAFT") await this.lots.publishLot(user, lot.publicId, WHATSAPP_META);
    await this.audit.record({ actorUserId: user.id, action: "WHATSAPP_LOT_CREATED", entityType: "CropLot", entityId: lot.publicId, metadata: { channel: "whatsapp" }, ...WHATSAPP_META }).catch(() => undefined);

    return [textMsg(t("lotCreated", lang)), ...(await this.searchBuyers(input, lot.publicId))];
  }

  // ---------------------------------------------------------------------
  // Matching (deterministic engine) and presentation
  // ---------------------------------------------------------------------

  async showBuyersForLot(input: FlowInput, lotPublicId: string): Promise<OutboundMessage[]> {
    const lot = await this.lots.getLot(input.farmer.user, lotPublicId);
    input.conv.entities.crop = { id: lot.crop.id, name: lot.crop.name };
    return this.searchBuyers(input, lotPublicId);
  }

  private async searchBuyers(input: FlowInput, lotPublicId: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const user = input.farmer.user;

    if (!(await this.limiter.allow(`matching:${user.id}`, this.matchingLimitPerHour, 3600))) {
      this.finish(conv);
      return [textMsg(t("limitReached", lang))];
    }
    conv.state = "MATCHING";
    const result = (await this.matching.matches(user, lotPublicId)) as { matches: MatchRow[] };
    const cards: BuyerCard[] = [...result.matches]
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)) // the engine's own score, best first
      .map((m) => ({
        demandPublicId: m.demand.publicId,
        organizationName: m.buyer.organizationName,
        district: m.demand.district,
        state: m.demand.state,
        requiredQuantity: m.demand.requiredQuantity,
        quantityUnit: m.demand.quantityUnit,
        matchScore: m.matchScore ?? 0,
      }));

    conv.entities.lotPublicId = lotPublicId;
    conv.context.buyers = cards;
    await this.audit.record({ actorUserId: user.id, action: "WHATSAPP_BUYER_SEARCH", entityType: "CropLot", entityId: lotPublicId, metadata: { channel: "whatsapp", matches: cards.length }, ...WHATSAPP_META }).catch(() => undefined);

    if (cards.length === 0) {
      const crop = conv.entities.crop?.name ?? "";
      this.finish(conv, { keepLot: true });
      return [ctaMsg(t("noBuyers", lang, { crop }), t("ctaLot", lang), this.urls.lot(lotPublicId))];
    }
    return this.buyersPage(input, 1);
  }

  private async buyersPage(input: FlowInput, page: number): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const cards = conv.context.buyers ?? [];
    const pages = Math.max(1, Math.ceil(cards.length / BUYERS_PER_PAGE));
    if (page > pages) return [textMsg(t("noMoreBuyers", lang))];
    const slice = cards.slice((page - 1) * BUYERS_PER_PAGE, page * BUYERS_PER_PAGE);
    conv.context.buyerPage = page;
    conv.state = "SHOWING_BUYERS";

    const crop = conv.entities.crop?.name ?? "";
    const first = (page - 1) * BUYERS_PER_PAGE;
    const blocks = slice.map(
      (b, i) => `${first + i + 1}️⃣ ${b.organizationName}\n📍 ${b.district}\n📦 Demand: ${num(b.requiredQuantity)} ${unitShort(b.quantityUnit)}\n✅ Verified buyer`,
    );
    const ref = conv.entities.crop ? await this.market.referencePrice(conv.entities.crop.id, slice[0]?.state) : null;
    const lines = [t("buyersFound", lang, { n: cards.length, crop }), "", blocks.join("\n\n")];
    if (ref) lines.push("", t("buyersRefPrice", lang, { price: inr(ref) }));
    lines.push("", t("buyersDisclaimer", lang));

    const specs: OptionSpec[] = [
      { action: "buyers:details", title: t("btnDetails", lang) },
      { action: "buyers:offer", title: t("btnOffer", lang) },
      page < pages ? { action: "buyers:more", title: t("btnMore", lang) } : { action: "menu:help", title: t("btnBackMenu", lang) },
    ];
    return [optionsMessage(conv, lines.join("\n"), specs)];
  }

  private chooseBuyer(input: FlowInput, action: "details" | "offer"): OutboundMessage[] {
    const { conv } = input;
    const lang = conv.language;
    const cards = conv.context.buyers ?? [];
    const page = conv.context.buyerPage ?? 1;
    const start = (page - 1) * BUYERS_PER_PAGE;
    const slice = cards.slice(start, start + BUYERS_PER_PAGE);
    conv.context.pendingBuyerAction = action;
    const specs: OptionSpec[] = slice.map((b, i) => ({ action: "buyer:pick", ref: String(start + i), title: `${start + i + 1}. ${b.organizationName}`.slice(0, 24), description: b.district }));
    return [optionsMessage(conv, t(action === "offer" ? "whichBuyerOffer" : "whichBuyerDetails", lang), specs, { layout: "list", listButton: t("btnChoose", lang) })];
  }

  private buyerDetails(input: FlowInput, idx: number): OutboundMessage[] {
    const { conv } = input;
    const lang = conv.language;
    const b = conv.context.buyers?.[idx];
    if (!b) return [textMsg(t("invalidChoice", lang))];
    const body = t("buyerDetails", lang, { buyer: b.organizationName, place: `${b.district}, ${b.state}`, qty: `${num(b.requiredQuantity)} ${unitLong(b.quantityUnit)}` });
    return [optionsMessage(conv, body, [{ action: "buyer:offer-for", ref: String(idx), title: t("btnOffer", lang) }, { action: "buyers:more", title: t("btnMore", lang) }, { action: "menu:help", title: t("btnBackMenu", lang) }])];
  }

  // ---------------------------------------------------------------------
  // Offer request (asks price → confirms → BuyerMatchingService.createOffer)
  // ---------------------------------------------------------------------

  startOffer(input: FlowInput, idx: number): OutboundMessage[] {
    const { conv } = input;
    const lang = conv.language;
    const b = conv.context.buyers?.[idx];
    if (!b) return [textMsg(t("invalidChoice", lang))];
    conv.state = "COLLECTING_PRICE";
    conv.intent = "FIND_BUYER";
    conv.context.pendingBuyerIndex = idx;
    return [textMsg(t("askOfferPrice", lang, { buyer: b.organizationName, per: `(₹/${unitShort(b.quantityUnit)})` }))];
  }

  async answerOfferPrice(input: FlowInput, text: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const price = extractNumber(text);
    const idx = conv.context.pendingBuyerIndex;
    const lotPublicId = conv.entities.lotPublicId;
    const b = idx !== undefined ? conv.context.buyers?.[idx] : undefined;
    if (!price) return [textMsg(t("badPrice", lang))];
    if (!b || !lotPublicId) return [textMsg(t("genericError", lang))];

    // Offer at most what the lot can supply, and no more than the demand needs.
    const lot = await this.lots.getLot(input.farmer.user, lotPublicId, b.quantityUnit);
    const qty = Math.round(Math.min(lot.availableQuantity.value, b.requiredQuantity) * 100) / 100;
    if (qty <= 0) return [textMsg(t("quantityUnavailable", lang))];

    conv.state = "AWAITING_CONFIRMATION";
    conv.context.confirm = { kind: "SEND_OFFER", price, quantity: qty, unit: b.quantityUnit, buyerIndex: idx! };
    const u = unitShort(b.quantityUnit);
    const body = t("confirmOffer", lang, { buyer: b.organizationName, crop: conv.entities.crop?.name ?? lot.crop.name, qty: `${num(qty)} ${u}`, price: inr(price), per: `/${u}`, total: inr(price * qty) });
    return [optionsMessage(conv, body, [{ action: "confirm:yes", title: t("yes", lang) }, { action: "confirm:no", title: t("no", lang) }])];
  }

  async confirmSendOffer(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const c = conv.context.confirm;
    const lotPublicId = conv.entities.lotPublicId;
    const b = c?.buyerIndex !== undefined ? conv.context.buyers?.[c.buyerIndex] : undefined;
    if (!c || !b || !lotPublicId || !c.price || !c.quantity || !c.unit) return [textMsg(t("genericError", lang))];
    const user = input.farmer.user;

    await this.matching.createOffer(user, offerBody.parse({ lotPublicId, buyerDemandPublicId: b.demandPublicId, quantity: c.quantity, quantityUnit: c.unit, offeredPrice: c.price }));
    await this.audit.record({ actorUserId: user.id, action: "WHATSAPP_OFFER_ACTION", entityType: "TradeOffer", metadata: { channel: "whatsapp", action: "SEND_OFFER" }, ...WHATSAPP_META }).catch(() => undefined);
    this.finish(conv);
    return [ctaMsg(t("offerSent", lang, { buyer: b.organizationName }), t("ctaOffers", lang), this.urls.offers())];
  }

  /** Back to idle; optionally keep the lot so "more buyers" still works. */
  finish(conv: ConversationRecord, opts: { keepLot?: boolean } = {}): void {
    conv.state = "IDLE";
    conv.intent = null;
    conv.context = {};
    conv.entities = opts.keepLot && conv.entities.lotPublicId ? { lotPublicId: conv.entities.lotPublicId } : {};
  }
}

export { parseBareNumber };
