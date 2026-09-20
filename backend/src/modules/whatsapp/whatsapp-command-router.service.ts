import { logger } from "../../config/logger";
import { trackEvent } from "../../config/posthog";
import { extractNumber, isNo, isYes } from "./nlu/whatsapp-command-parser";
import type { WhatsAppIntentService } from "./nlu/whatsapp-intent.service";
import type { WhatsAppBuyerAssistantService } from "./whatsapp-buyer-assistant.service";
import type { WhatsAppCatalogService } from "./whatsapp-catalog.service";
import type { FarmLinkUrlService } from "./whatsapp-deeplink.service";
import { ctaMsg, errorMessage, textMsg } from "./whatsapp-flow-helpers";
import { t, type MsgKey } from "./whatsapp-i18n";
import type { WhatsAppLotService } from "./whatsapp-lot-service";
import type { WhatsAppMarketService } from "./whatsapp-market-service";
import type { WhatsAppOfferService } from "./whatsapp-offer-service";
import type { WhatsAppPaymentService } from "./whatsapp-payment-service";
import type { WhatsAppShipmentService } from "./whatsapp-shipment-service";
import { parseBareNumber } from "./whatsapp-text";
import type { DetectedIntent, FlowInput, Intent, OutboundMessage, WebsiteTarget } from "./whatsapp.types";

export interface RouterDeps {
  intents: WhatsAppIntentService;
  buyer: WhatsAppBuyerAssistantService;
  market: WhatsAppMarketService;
  lots: WhatsAppLotService;
  offers: WhatsAppOfferService;
  payments: WhatsAppPaymentService;
  shipments: WhatsAppShipmentService;
  catalog: WhatsAppCatalogService;
  urls: FarmLinkUrlService;
}

type IntentHandler = (input: FlowInput, det: DetectedIntent) => Promise<OutboundMessage[]>;

const COLLECTING = new Set(["COLLECTING_CROP", "COLLECTING_QUANTITY", "COLLECTING_LOCATION", "COLLECTING_QUALITY", "COLLECTING_FARM", "COLLECTING_PRICE"]);

/**
 * Routes one inbound message for an identified farmer. Handlers live in an
 * intent → handler registry, so a future command ("warehouse", "forecast",
 * "transport", "complaint", "language", "register"…) is added with one
 * `register()` call (or, for website-only features, one row in the parser's
 * WEBSITE keyword table) — no changes to the pipeline.
 */
export class WhatsAppCommandRouter {
  private readonly handlers = new Map<Intent, IntentHandler>();

  constructor(private readonly d: RouterDeps) {
    this.register("HELP", async (i) => this.help(i));
    this.register("CANCEL", async (i) => this.cancel(i));
    this.register("BACK", async (i) => this.back(i));
    this.register("FIND_BUYER", async (i, det) => {
      this.log("buyer_search", i, det);
      return this.d.buyer.start(i, det.entities);
    });
    this.register("CHECK_MANDI_PRICE", async (i, det) => this.startPrice(i, det));
    this.register("VIEW_LOTS", async (i) => this.d.lots.show(i, 1));
    this.register("VIEW_OFFERS", async (i, det) => {
      this.log("offer_request", i, det);
      return this.d.offers.show(i, 1);
    });
    this.register("VIEW_PAYMENT", async (i, det) => {
      this.log("payment_request", i, det);
      return this.d.payments.show(i);
    });
    this.register("VIEW_SHIPMENT", async (i, det) => {
      this.log("shipment_request", i, det);
      return this.d.shipments.show(i);
    });
    this.register("WEBSITE", async (i, det) => this.website(i, det.websiteTarget ?? "dashboard"));
    this.register("CONFIRM", async (i) => this.fallback(i));
    this.register("UNKNOWN", async (i) => this.fallback(i));
  }

  register(intent: Intent, handler: IntentHandler): void {
    this.handlers.set(intent, handler);
  }

  // ---------------------------------------------------------------------

  async handle(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    try {
      // Options offered by the previous message are consumed by this one.
      const offered = conv.context.options ?? [];
      delete conv.context.options;
      const m = input.inbound;

      if (m.type === "audio" || m.type === "image" || m.type === "unsupported") return [textMsg(t("unsupportedMedia", lang))];

      if (m.type === "location" && m.location) return await this.onLocation(input);

      // Interactive reply ("opt:n") or a typed number that matches an offered option.
      let n: number | null = null;
      if ((m.type === "button" || m.type === "list") && m.actionId) {
        const match = m.actionId.match(/^opt:(\d{1,2})$/);
        n = match ? Number(match[1]) : null;
        if (n === null) return [textMsg(t("invalidChoice", lang))];
      } else if (m.type === "text" && m.text) {
        n = offered.length > 0 ? parseBareNumber(m.text) : null;
      }
      if (n !== null && offered.length > 0) {
        const opt = offered.find((o) => o.n === n);
        if (!opt) return [textMsg(t("invalidChoice", lang))];
        const out = await this.runAction(input, opt.action, opt.ref);
        if (out) return out;
        return [textMsg(t("invalidChoice", lang))];
      }
      if (m.type !== "text" || !m.text) return [textMsg(t("unsupportedMedia", lang))];

      return await this.onText(input, m.text);
    } catch (err) {
      // Keep the farmer unstuck: drop the half-finished flow, answer plainly.
      conv.state = "IDLE";
      conv.intent = null;
      conv.context = {};
      return [errorMessage(err, lang, "router")];
    }
  }

  // ---------------------------------------------------------------------

  private async onText(input: FlowInput, text: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const rules = this.d.intents.parseDeterministic(text);

    // A plain command always wins, even mid-flow ("bhav", "help", "cancel").
    if (rules.intent !== "UNKNOWN" && rules.source === "command") return this.dispatch(input, rules);

    if (COLLECTING.has(conv.state) || conv.state === "AWAITING_CONFIRMATION") {
      const answered = await this.onStateAnswer(input, text);
      if (answered) return answered;
    }

    const det = rules.intent !== "UNKNOWN" ? rules : await this.d.intents.detect(text, { language: conv.language, rateKey: input.farmer.user.id });
    return this.dispatch(input, det);
  }

  private async dispatch(input: FlowInput, det: DetectedIntent): Promise<OutboundMessage[]> {
    logger.info({ event: "intent_detected", intent: det.intent, source: det.source, confidence: det.confidence }, "[WhatsApp] intent_detected");
    trackEvent("whatsapp_command_handled", input.farmer.user.publicId, { intent: det.intent, source: det.source });
    const handler = this.handlers.get(det.intent) ?? this.handlers.get("UNKNOWN")!;
    return handler(input, det);
  }

  private log(event: string, input: FlowInput, det: DetectedIntent): void {
    logger.info({ event, intent: det.intent }, `[WhatsApp] ${event}`);
    void input;
  }

  // ---------------------------------------------------------------------
  // Field answers by conversation state
  // ---------------------------------------------------------------------

  private async onStateAnswer(input: FlowInput, text: string): Promise<OutboundMessage[] | null> {
    const { conv } = input;
    const lang = conv.language;

    if (conv.state === "AWAITING_CONFIRMATION") {
      if (isYes(text)) return this.runAction(input, "confirm:yes");
      if (isNo(text)) return this.runAction(input, "confirm:no");
      return [textMsg(t("invalidChoice", lang))];
    }

    if (conv.intent === "CHECK_MANDI_PRICE") {
      if (conv.state === "COLLECTING_CROP") {
        const r = await this.d.buyer.resolveCropAnswer(input, text);
        if (r === "other") {
          conv.context.awaitingCropName = true;
          return [textMsg(t("askCropName", lang))];
        }
        if (!r) return [textMsg(t("cropNotFound", lang, { text: text.slice(0, 40) })), ...(await this.d.buyer.askCrop(input, "CHECK_MANDI_PRICE"))];
        return this.d.market.prices(input, r);
      }
      if (conv.state === "COLLECTING_LOCATION" && conv.entities.crop) {
        const crop = (await this.d.catalog.listCrops()).find((c) => c.id === conv.entities.crop!.id);
        if (crop) return this.d.market.prices(input, crop, { locationText: text });
      }
      return null;
    }

    if (conv.state === "COLLECTING_PRICE") {
      return conv.context.pendingOfferPublicId ? this.d.offers.answerCounterPrice(input, text) : this.d.buyer.answerOfferPrice(input, text);
    }
    if (conv.state === "COLLECTING_FARM") {
      const farms = await this.d.catalog.farmsOf(input.farmer.user.id);
      const hit = this.d.catalog.matchFarms(farms, text);
      if (hit.length === 1) return (await this.d.buyer.handleAction(input, "farm:pick", hit[0]!.id)) ?? null;
      return [textMsg(t("invalidChoice", lang))];
    }
    if (conv.intent === "FIND_BUYER" || conv.state.startsWith("COLLECTING")) return this.d.buyer.handleCollecting(input, text);
    return null;
  }

  // ---------------------------------------------------------------------
  // Option/button actions
  // ---------------------------------------------------------------------

  private async runAction(input: FlowInput, action: string, ref?: string): Promise<OutboundMessage[] | null> {
    const { conv } = input;
    switch (action) {
      case "menu:help":
        return this.help(input);
      case "confirm:no":
        return this.cancel(input);
      case "confirm:yes": {
        const kind = conv.context.confirm?.kind;
        if (kind === "CREATE_LOT") return this.d.buyer.confirmCreateLot(input);
        if (kind === "SEND_OFFER") return this.d.buyer.confirmSendOffer(input);
        if (kind) return this.d.offers.execute(input);
        return null;
      }
      case "lot:open":
        return ref ? this.d.lots.open(input, ref) : null;
      case "lots:more":
        return this.d.lots.show(input, (conv.context.lotsPage ?? 1) + 1);
      case "offers:show":
        return this.d.offers.show(input, 1);
      case "offers:more":
        return this.d.offers.show(input, (conv.context.offersPage ?? 1) + 1);
      case "offer:open":
        return ref ? this.d.offers.open(input, ref) : null;
      case "offer:accept":
        return ref ? this.d.offers.askConfirm(input, "ACCEPT_OFFER", ref) : null;
      case "offer:reject":
        return ref ? this.d.offers.askConfirm(input, "REJECT_OFFER", ref) : null;
      case "offer:withdraw":
        return ref ? this.d.offers.askConfirm(input, "WITHDRAW_OFFER", ref) : null;
      case "offer:counter":
        return ref ? this.d.offers.askCounterPrice(input, ref) : null;
      case "crop:pick":
        if (conv.intent === "CHECK_MANDI_PRICE") {
          const crop = (await this.d.catalog.listCrops()).find((c) => c.id === ref);
          return crop ? this.d.market.prices(input, crop) : null;
        }
        return this.d.buyer.handleAction(input, action, ref);
      default:
        return this.d.buyer.handleAction(input, action, ref);
    }
  }

  // ---------------------------------------------------------------------
  // Individual intents
  // ---------------------------------------------------------------------

  private async startPrice(input: FlowInput, det: DetectedIntent): Promise<OutboundMessage[]> {
    const { conv } = input;
    this.log("mandi_price_request", input, det);
    conv.entities = {};
    conv.context = {};
    conv.intent = "CHECK_MANDI_PRICE";
    if (det.entities.crop) {
      const crop = await this.d.catalog.resolveCrop(det.entities.crop);
      if (crop) return this.d.market.prices(input, crop, { locationText: det.entities.location });
    }
    return this.d.buyer.askCrop(input, "CHECK_MANDI_PRICE");
  }

  private async onLocation(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv, inbound } = input;
    const loc = inbound.location!;
    if (conv.state === "COLLECTING_LOCATION" && conv.intent === "CHECK_MANDI_PRICE" && conv.entities.crop) {
      const crop = (await this.d.catalog.listCrops()).find((c) => c.id === conv.entities.crop!.id);
      if (crop) return this.d.market.prices(input, crop, { coords: { latitude: loc.latitude, longitude: loc.longitude } });
    }
    if (conv.state === "COLLECTING_LOCATION" && conv.intent === "FIND_BUYER") {
      // Farms are matched by name, so a named place is usable; a bare pin isn't.
      if (loc.name) return this.d.buyer.handleCollecting(input, loc.name);
      return [textMsg(t("askLocation", conv.language, { crop: conv.entities.crop?.name ?? "" }))];
    }
    // Idle + shared location → nearby mandi prices; ask which crop first.
    conv.entities = { coords: { latitude: loc.latitude, longitude: loc.longitude } };
    return this.d.buyer.askCrop(input, "CHECK_MANDI_PRICE");
  }

  private help(input: FlowInput): OutboundMessage[] {
    const { conv } = input;
    conv.state = "IDLE";
    conv.intent = null;
    conv.entities = {};
    conv.context = {};
    return [textMsg(t("help", conv.language))];
  }

  private cancel(input: FlowInput): OutboundMessage[] {
    const { conv } = input;
    conv.state = "IDLE";
    conv.intent = null;
    conv.entities = {};
    conv.context = {};
    return [textMsg(t("cancelled", conv.language))];
  }

  private async back(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    switch (conv.state) {
      case "COLLECTING_QUANTITY":
        delete conv.entities.crop;
        return conv.intent === "CHECK_MANDI_PRICE" ? this.d.buyer.askCrop(input, "CHECK_MANDI_PRICE") : this.d.buyer.askCrop(input);
      case "COLLECTING_LOCATION":
        if (conv.intent === "CHECK_MANDI_PRICE") return this.d.buyer.askCrop(input, "CHECK_MANDI_PRICE");
        delete conv.entities.quantity;
        conv.state = "COLLECTING_QUANTITY";
        return [textMsg(t("askQuantity", lang, { crop: conv.entities.crop?.name ?? "" }))];
      case "COLLECTING_QUALITY":
        delete conv.entities.location;
        conv.state = "COLLECTING_LOCATION";
        return [textMsg(t("askLocation", lang, { crop: conv.entities.crop?.name ?? "" }))];
      case "IDLE":
        return [textMsg(t("nothingToGoBack", lang))];
      default:
        return this.help(input);
    }
  }

  private website(input: FlowInput, target: WebsiteTarget): OutboundMessage[] {
    const lang = input.conv.language;
    const url = this.d.urls.forTarget(target);
    const map: Partial<Record<WebsiteTarget, { key: MsgKey; cta: MsgKey }>> = {
      logistics: { key: "websiteLogistics", cta: "ctaLogistics" },
      farms: { key: "websiteForm", cta: "ctaContinue" },
      crops: { key: "websiteForm", cta: "ctaContinue" },
      profile: { key: "websiteForm", cta: "ctaContinue" },
      register: { key: "websiteForm", cta: "ctaContinue" },
      dashboard: { key: "websiteGeneric", cta: "ctaDashboard" },
    };
    const m = map[target] ?? { key: "websiteGeneric", cta: "ctaOpen" };
    input.conv.state = "IDLE";
    input.conv.intent = null;
    return [ctaMsg(t(m.key, lang), t(m.cta, lang), url)];
  }

  /** Understood-but-unsupported or not understood: never a dead end. */
  private fallback(input: FlowInput): OutboundMessage[] {
    const lang = input.conv.language;
    input.conv.state = "IDLE";
    input.conv.intent = null;
    return [ctaMsg(`${t("lowConfidence", lang)}\n\n${t("moreOnWebsite", lang)}`, t("ctaOpen", lang), this.d.urls.dashboard())];
  }
}

export { extractNumber };
