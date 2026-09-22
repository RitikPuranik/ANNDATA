import type { AuditService } from "../audit/audit.service";
import type { LotsService } from "../lots/lots.service";
import { listLotsQuerySchema } from "../lots/lots.schemas";
import type { QualityService } from "../quality/quality.service";
import type { AnndataUrlService } from "./whatsapp-deeplink.service";
import { ctaMsg, optionsMessage, type OptionSpec } from "./whatsapp-flow-helpers";
import { t } from "./whatsapp-i18n";
import { num, unitLong } from "./whatsapp-text";
import type { FlowInput, Lang, OutboundMessage } from "./whatsapp.types";

const PAGE_SIZE = 4;
const INACTIVE = new Set(["CANCELLED", "COMPLETED", "DELIVERED"]);

export function lotStatusLabel(status: string, lang: Lang): string {
  const L: Record<string, [string, string, string]> = {
    DRAFT: ["⚪ Draft (not listed yet)", "⚪ ड्राफ्ट (अभी लिस्ट नहीं)", "⚪ Draft (abhi list nahi)"],
    AVAILABLE: ["🟢 Available", "🟢 उपलब्ध", "🟢 Available"],
    PARTIALLY_COMMITTED: ["🟡 Partly committed", "🟡 आंशिक रूप से बुक", "🟡 Partly committed"],
    COMMITTED: ["🟡 Buyer negotiation", "🟡 खरीदार से बातचीत", "🟡 Buyer negotiation"],
    IN_TRANSACTION: ["🟡 Sale in progress", "🟡 सौदा जारी", "🟡 Sale in progress"],
    STORED: ["🔵 Stored", "🔵 भंडारित", "🔵 Stored"],
  };
  const e = L[status];
  if (!e) return status;
  return lang === "en" ? e[0] : lang === "hi" ? e[1] : e[2];
}

export class WhatsAppLotService {
  constructor(
    private readonly lots: LotsService,
    private readonly quality: QualityService,
    private readonly urls: AnndataUrlService,
    private readonly audit: AuditService,
  ) {}

  /** All of THIS farmer's non-terminal lots (service enforces ownership). */
  async activeLots(input: FlowInput) {
    const res = await this.lots.listMyLots(input.farmer.user, listLotsQuerySchema.parse({ page: 1, limit: 50 }));
    return res.items.filter((l) => !INACTIVE.has(l.status));
  }

  async show(input: FlowInput, page = 1): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const all = await this.activeLots(input);
    if (all.length === 0) {
      conv.state = "IDLE";
      return [ctaMsg(t("noLots", lang), t("ctaOpen", lang), this.urls.lots())];
    }
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);
    const slice = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

    const blocks: string[] = [];
    const specs: OptionSpec[] = [];
    for (let i = 0; i < slice.length; i++) {
      const lot = slice[i]!;
      let grade = "";
      try {
        const q = await this.quality.getLotQualitySummary(input.farmer.user, lot.publicId);
        const a = q.currentAssessment;
        if (a?.grade) grade = `\n⭐ Grade ${a.grade}${a.verificationStatus === "VERIFIED" || a.verificationStatus === "LAB_VERIFIED" ? "" : " (self-reported)"}`;
      } catch {
        /* grade line is optional */
      }
      const place = [lot.origin.village, lot.origin.district].filter(Boolean).join(", ");
      blocks.push(
        `${i + 1}️⃣ ${lot.crop.name}\n📦 ${num(lot.availableQuantity.value)} ${unitLong(lot.availableQuantity.unit)}\n📍 ${place}${grade}\n${lotStatusLabel(lot.status, lang)}`,
      );
      specs.push({ action: "lot:open", ref: lot.publicId, title: `${lot.crop.name} · ${num(lot.availableQuantity.value)}`, description: place });
    }
    if (p < pages) specs.push({ action: "lots:more", title: t("btnMoreItems", lang) });

    conv.state = "SHOWING_LOTS";
    conv.intent = "VIEW_LOTS";
    conv.context.lotsPage = p;
    const header = `${t("lotsHeader", lang)}${pages > 1 ? ` (${p}/${pages})` : ""}\n\n${blocks.join("\n\n")}`;
    return [optionsMessage(conv, header, specs, { layout: "list", listButton: t("btnChoose", lang) })];
  }

  /** Actions for one lot the farmer picked. */
  async open(input: FlowInput, lotPublicId: string): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const lot = await this.lots.getLot(input.farmer.user, lotPublicId); // ownership enforced by the service
    conv.entities.lotPublicId = lot.publicId;
    conv.state = "SHOWING_LOTS";
    const listed = lot.status === "AVAILABLE" || lot.status === "PARTIALLY_COMMITTED";
    const specs: OptionSpec[] = [];
    if (listed) specs.push({ action: "lot:buyers", ref: lot.publicId, title: t("btnViewBuyers", lang) });
    specs.push({ action: "offers:show", title: t("btnViewOffers", lang) });
    specs.push({ action: "menu:help", title: t("btnBackMenu", lang) });
    const place = [lot.origin.village, lot.origin.district].filter(Boolean).join(", ");
    const body = `🌾 ${lot.crop.name}\n📦 ${num(lot.availableQuantity.value)} ${unitLong(lot.availableQuantity.unit)}\n📍 ${place}\n${lotStatusLabel(lot.status, lang)}`;
    return [optionsMessage(conv, body, specs), ctaMsg(t("moreOnWebsite", lang), t("ctaLot", lang), this.urls.lot(lot.publicId))];
  }
}

