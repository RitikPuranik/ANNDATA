import type { AuditService } from "../audit/audit.service";
import type { ShipmentService } from "../shipments/shipment.service";
import type { ANNDATAUrlService } from "./whatsapp-deeplink.service";
import { ctaMsg, WHATSAPP_META } from "./whatsapp-flow-helpers";
import { t } from "./whatsapp-i18n";
import { formatDateTime, num, unitShort } from "./whatsapp-text";
import type { FlowInput, OutboundMessage } from "./whatsapp.types";

const SHOW = 3;
const DONE = new Set(["DELIVERED", "CANCELLED"]);
const STATUS: Record<string, string> = {
  CREATED: "📝 CREATED", CONFIRMED: "✅ CONFIRMED", ASSIGNED: "🚛 ASSIGNED", READY_FOR_PICKUP: "📦 READY FOR PICKUP",
  PICKED_UP: "📦 PICKED UP", IN_TRANSIT: "🚛 IN TRANSIT", ARRIVED: "📍 ARRIVED", DELIVERED: "🟢 DELIVERED", CANCELLED: "🔴 CANCELLED",
};

/**
 * "shipment": read-only view over the existing Shipment & GPS Tracking module.
 * Only the farmer's own shipments come back (the service scopes by role).
 * Driver/vehicle identifiers are never included in the message.
 */
export class WhatsAppShipmentService {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly urls: ANNDATAUrlService,
    private readonly audit: AuditService,
  ) {}

  async show(input: FlowInput): Promise<OutboundMessage[]> {
    const { conv } = input;
    const lang = conv.language;
    conv.state = "IDLE";
    conv.intent = null;
    const res = await this.shipments.listShipments(input.farmer.user, { page: 1, limit: 20 });
    const active = res.items.filter((s) => !DONE.has(s.status));
    const list = (active.length ? active : res.items).slice(0, SHOW);
    if (list.length === 0) return [ctaMsg(t("noShipments", lang), t("ctaOpen", lang), this.urls.shipments())];

    const blocks = list.map((s) => {
      const lines = [
        `Lot: ${s.commodity}`,
        `Quantity: ${num(s.quantity)} ${unitShort(s.quantityUnit)}`,
        "",
        `From:\n${s.pickup.district}`,
        `To:\n${s.destination.district}`,
        "",
        `Status:\n${STATUS[s.status] ?? s.status}`,
      ];
      if (s.eta.estimatedDeliveryAt && !DONE.has(s.status)) lines.push("", `ETA: ${formatDateTime(s.eta.estimatedDeliveryAt)}`);
      // Never fabricate a position: only show what GPS tracking actually recorded.
      lines.push("", s.latestLocation ? `📍 Last updated:\n${formatDateTime(s.latestLocation.recordedAt)}` : t("noLiveLocation", lang));
      return lines.join("\n");
    });
    await this.audit.record({ actorUserId: input.farmer.user.id, action: "WHATSAPP_SHIPMENT_VIEWED", entityType: "Shipment", metadata: { channel: "whatsapp", count: list.length }, ...WHATSAPP_META }).catch(() => undefined);

    const body = `${t("shipmentHeader", lang)}\n\n${blocks.join("\n\n———\n\n")}`;
    // Deep-link to the specific shipment when exactly one is shown.
    const url = list.length === 1 ? this.urls.shipment(list[0]!.shipmentId) : this.urls.shipments();
    return [ctaMsg(body, t("ctaShipment", lang), url)];
  }
}
