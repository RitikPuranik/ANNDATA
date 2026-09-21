import { freshness, haversineKm } from "../market-intelligence/analytics";
import type { MarketIntelligenceRepository } from "../market-intelligence/market-intelligence.repository";
import type { CropDTO } from "../reference-data/reference-data.service";
import type { WhatsAppCatalogService } from "./whatsapp-catalog.service";
import type { ANNDATAUrlService } from "./whatsapp-deeplink.service";
import { ctaMsg, textMsg } from "./whatsapp-flow-helpers";
import { t } from "./whatsapp-i18n";
import { formatDate, inr } from "./whatsapp-text";
import { isLinked, type AnyFlowInput, type OutboundMessage } from "./whatsapp.types";

const MAX_MANDIS = 3;

/**
 * "bhav": reads ANNDATA's EXISTING mandi price data via
 * MarketIntelligenceRepository (the same repository MarketIntelligenceService
 * uses). No second price implementation, and no number is ever invented —
 * empty or stale data is reported as such.
 */
export class WhatsAppMarketService {
  constructor(
    private readonly market: MarketIntelligenceRepository,
    private readonly catalog: WhatsAppCatalogService,
    private readonly urls: ANNDATAUrlService,
  ) {}

  async prices(input: AnyFlowInput, crop: CropDTO, opts: { locationText?: string; coords?: { latitude: number; longitude: number } } = {}): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    conv.entities.crop = { id: crop.id, name: crop.name };

    let state: string | undefined;
    let district: string | undefined;
    const coords = opts.coords ?? conv.entities.coords;

    if (!coords) {
      let loc = opts.locationText ? await this.catalog.resolveLocation(opts.locationText) : null;
      if (!loc && !opts.locationText && isLinked(input)) {
        // Prefer the farmer's own farm location when they didn't say where.
        // (A guest has no farms — they are simply asked for a district.)
        const farms = await this.catalog.farmsOf(input.farmer.user.id).catch(() => []);
        if (farms[0]) loc = await this.catalog.resolveLocation(`${farms[0].district.name}, ${farms[0].state.name}`);
      }
      if (!loc) {
        conv.state = "COLLECTING_LOCATION";
        conv.intent = "CHECK_MANDI_PRICE";
        return [textMsg(opts.locationText ? t("locationNotFound", lang, { text: opts.locationText }) : t("askLocationPrice", lang))];
      }
      state = loc.state ?? undefined;
      district = loc.district ?? undefined;
    }

    const markets = await this.market.latestMarkets(crop.id, coords ? {} : state ? { state } : {});
    let chosen: typeof markets = [];
    if (coords) {
      chosen = markets
        .filter((m) => m.mandi.latitude !== null && m.mandi.longitude !== null)
        .map((m) => ({ m, d: haversineKm(coords.latitude, coords.longitude, m.mandi.latitude as number, m.mandi.longitude as number) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_MANDIS)
        .map((x) => x.m);
    } else {
      const inDistrict = markets.filter((m) => district && m.mandi.district === district);
      const rest = markets.filter((m) => !inDistrict.includes(m));
      chosen = [...inDistrict, ...rest].slice(0, MAX_MANDIS);
    }

    conv.state = "IDLE";
    conv.intent = null;
    conv.entities = {};

    // Prices are public data, but the full market page needs a login: a guest's
    // button leads to sign-up ("Continue on ANNDATA"), a farmer's to the page.
    const cta = isLinked(input) ? { text: t("ctaOpen", lang), url: this.urls.market() } : { text: t("ctaContinue", lang), url: this.urls.signup() };

    if (chosen.length === 0) return [ctaMsg(t("mandiUnavailable", lang), cta.text, cta.url)];

    const cropName = this.catalog.displayName(crop, lang);
    const blocks = chosen.map(
      (m) => `📍 ${m.mandi.name}${m.mandi.district ? `, ${m.mandi.district}` : ""}\nModal: ${inr(m.latest.modalPrice)}/Q\nMin: ${inr(m.latest.minPrice)}/Q\nMax: ${inr(m.latest.maxPrice)}/Q`,
    );
    const newest = new Date(Math.max(...chosen.map((m) => m.latest.date.getTime())));
    const isStale = freshness(newest) === "STALE" || freshness(newest) === "OUTDATED";
    const lines = [t("mandiHeader", lang, { crop: cropName }), "", blocks.join("\n\n"), "", t("mandiTimestamp", lang, { date: formatDate(newest) })];
    if (isStale) lines.push("", t("mandiStale", lang, { date: formatDate(newest) }));
    return [ctaMsg(lines.join("\n"), cta.text, cta.url)];
  }

  /**
   * Mandi modal price used as a labelled *reference* next to buyer results. The
   * buyer's own target price is intentionally never shown to farmers by
   * ANNDATA's matching API, so we don't surface it here either.
   */
  async referencePrice(cropId: string, state?: string): Promise<number | null> {
    try {
      const rows = await this.market.latestMarkets(cropId, state ? { state } : {});
      const fresh = rows.filter((r) => freshness(r.latest.date) !== "OUTDATED");
      if (fresh.length === 0) return null;
      const avg = fresh.reduce((s, r) => s + r.latest.modalPrice, 0) / fresh.length;
      return Math.round(avg);
    } catch {
      return null;
    }
  }
}
