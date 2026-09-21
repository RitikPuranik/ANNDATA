import type { PrismaClient } from "@prisma/client";
import type { AuditService } from "../audit/audit.service";
import type { PaymentService } from "../payments/payment.service";
import type { ANNDATAUrlService } from "./whatsapp-deeplink.service";
import { ctaMsg, WHATSAPP_META } from "./whatsapp-flow-helpers";
import { t } from "./whatsapp-i18n";
import { formatDate, inr, maskTail } from "./whatsapp-text";
import type { FlowInput, Lang, OutboundMessage } from "./whatsapp.types";

const SHOW = 3;
const ORDER: Record<string, number> = { OVERDUE: 0, DISPUTED: 1, PARTIALLY_PAID: 2, PENDING: 3, PAID: 4, OVERPAID: 4 };

/**
 * "payment": read-only view over the existing Payment Status Tracking module.
 * ANNDATA records payments made by the buyer OUTSIDE the platform; this
 * assistant never moves money and only shows masked references.
 */
export class WhatsAppPaymentService {
  constructor(
    private readonly payments: PaymentService,
    private readonly prisma: PrismaClient,
    private readonly urls: ANNDATAUrlService,
    private readonly audit: AuditService,
  ) {}

  async show(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    const user = input.farmer.user;
    const { items } = await this.payments.list(user, { page: 1, limit: 20 });
    const live = items.filter((o) => o.status !== "CANCELLED").sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
    conv.state = "IDLE";
    conv.intent = null;
    if (live.length === 0) return [ctaMsg(t("noPayments", lang), t("ctaDashboard", lang), this.urls.payments())];

    const top = live.slice(0, SHOW);
    // Display-only enrichment (crop + buyer name) for rows the service already authorised.
    const offerIds = top.map((o) => o.tradeOfferId).filter((x): x is string => !!x);
    const offers = offerIds.length
      ? await this.prisma.tradeOffer.findMany({ where: { id: { in: offerIds } }, select: { id: true, buyer: { select: { organizationName: true } }, lot: { select: { crop: { select: { name: true } } } } } })
      : [];
    const byId = new Map(offers.map((o) => [o.id, o]));

    const blocks: string[] = [];
    let needsHelp = false;
    for (const o of top) {
      const extra = o.tradeOfferId ? byId.get(o.tradeOfferId) : undefined;
      let last: { amount: number; paidAt: string; externalReference: string | null } | null = null;
      try {
        const recs = await this.payments.listPayments(user, o.publicId, { page: 1, limit: 5 });
        last = recs.items.find((r) => r.status !== "REVERSED") ?? null;
      } catch {
        /* last-payment line is optional */
      }
      blocks.push(this.block(o, extra?.lot.crop.name, extra?.buyer.organizationName, last, lang));
      if (o.status === "OVERDUE" || o.status === "DISPUTED") needsHelp = true;
    }
    await this.audit.record({ actorUserId: user.id, action: "WHATSAPP_PAYMENT_VIEWED", entityType: "PaymentObligation", metadata: { channel: "whatsapp", count: top.length }, ...WHATSAPP_META }).catch(() => undefined);

    const more = live.length > SHOW ? `\n\n+${live.length - SHOW} more on ANNDATA` : "";
    const body = `${t("paymentHeader", lang)}\n\n${blocks.join("\n\n")}${more}\n\n${t("paymentNote", lang)}`;
    return [ctaMsg(body, needsHelp ? t("ctaProblem", lang) : t("ctaDashboard", lang), this.urls.payments())];
  }

  private block(
    o: { status: string; finalPayableAmount: number; amountPaid: number; amountDue: number },
    crop: string | undefined,
    buyer: string | undefined,
    last: { amount: number; paidAt: string; externalReference: string | null } | null,
    lang: Lang,
  ): string {
    const head = `🌾 ${crop ?? "Sale"}${buyer ? `\nBuyer: ${buyer}` : ""}`;
    const lastLine = last ? `\n\nLast payment:\n${inr(last.amount)}\nDate: ${formatDate(last.paidAt)}${last.externalReference ? `\nReference: ${maskTail(last.externalReference, 4, "UTR")}` : ""}` : "";
    switch (o.status) {
      case "PAID":
      case "OVERPAID":
        return `${head}\n\n🟢 ${lang === "hi" ? "भुगतान पूरा हुआ" : "Payment completed"}\n\nAmount: ${inr(o.finalPayableAmount)}${last ? `\nPaid on: ${formatDate(last.paidAt)}` : ""}${last?.externalReference ? `\nReference: ${maskTail(last.externalReference, 4, "UTR")}` : ""}`;
      case "OVERDUE":
        return `${head}\n\n🔴 ${lang === "hi" ? "भुगतान देर से" : "Payment overdue"}\n\nTotal payable: ${inr(o.finalPayableAmount)}\nPaid: ${inr(o.amountPaid)}\nAmount remaining: ${inr(o.amountDue)}${lastLine}`;
      case "DISPUTED":
        return `${head}\n\n⚠️ ${lang === "hi" ? "विवाद में" : "Under dispute"}\n\nTotal payable: ${inr(o.finalPayableAmount)}\nPaid: ${inr(o.amountPaid)}\nRemaining: ${inr(o.amountDue)}${lastLine}`;
      case "PARTIALLY_PAID":
        return `${head}\n\nTotal payable: ${inr(o.finalPayableAmount)}\nPaid: ${inr(o.amountPaid)}\nRemaining: ${inr(o.amountDue)}\n\nStatus: 🟡 PARTIALLY PAID${lastLine}`;
      default:
        return `${head}\n\nTotal payable: ${inr(o.finalPayableAmount)}\nPaid: ${inr(o.amountPaid)}\nRemaining: ${inr(o.amountDue)}\n\nStatus: 🟡 PENDING${lastLine}`;
    }
  }
}
