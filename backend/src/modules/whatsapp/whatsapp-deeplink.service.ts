import type { WebsiteTarget } from "./whatsapp.types";

/**
 * Single place that builds FarmLink website URLs for WhatsApp buttons.
 *
 * Routes here mirror the REAL Next.js App Router pages under
 * frontend/src/app/(app) — a test asserts every path exists on disk. Where the
 * frontend has no dedicated page (payments, transaction history) we link to the
 * closest existing page (the dashboard) instead of inventing a route.
 *
 * Links never contain tokens, credentials or personal data. The website
 * authenticates the farmer itself, and the backend re-authorises every id.
 */
export class FarmLinkUrlService {
  private readonly base: string;

  constructor(frontendUrl: string) {
    this.base = frontendUrl.replace(/\/+$/, "");
  }

  private url(path: string): string {
    return `${this.base}${path}`;
  }

  private seg(id: string): string {
    return encodeURIComponent(id);
  }

  dashboard(): string { return this.url("/dashboard"); }
  lots(): string { return this.url("/lots"); }
  lot(publicId: string): string { return this.url(`/lots/${this.seg(publicId)}`); }
  newLot(): string { return this.url("/lots/new"); }
  offers(): string { return this.url("/trade-offers"); }
  offer(publicId: string): string { return this.url(`/trade-offers/${this.seg(publicId)}`); }
  shipments(): string { return this.url("/shipments"); }
  shipment(publicId: string): string { return this.url(`/shipments/${this.seg(publicId)}`); }
  market(): string { return this.url("/market"); }
  profile(): string { return this.url("/profile"); }
  farms(): string { return this.url("/farms"); }
  newFarm(): string { return this.url("/farms/new"); }
  crops(): string { return this.url("/crops"); }
  register(): string { return this.url("/login"); }
  /** Where a number that is not registered yet is sent ("Continue on FarmLink"). */
  signup(): string { return this.url("/register"); }
  /** No payments page exists in the frontend yet → the dashboard is the closest page. */
  payments(): string { return this.dashboard(); }
  /** No transactions page exists → net realization is the closest earnings view. */
  transactions(): string { return this.url("/net-realization"); }

  forTarget(target: WebsiteTarget): string {
    switch (target) {
      case "warehouses": return this.url("/warehouses");
      case "sellVsStore": return this.url("/sell-vs-store");
      case "forecasts": return this.url("/forecasts");
      case "logistics": return this.url("/logistics");
      case "profile": return this.profile();
      case "transactions": return this.transactions();
      case "register": return this.register();
      case "farms": return this.farms();
      case "crops": return this.crops();
      case "dashboard": return this.dashboard();
    }
  }

  /** Every static path this service can emit (used by the route-existence test). */
  static readonly STATIC_PATHS = [
    "/dashboard", "/lots", "/lots/new", "/trade-offers", "/shipments", "/market", "/profile", "/farms", "/farms/new",
    "/crops", "/login", "/register", "/net-realization", "/warehouses", "/sell-vs-store", "/forecasts", "/logistics",
  ] as const;
  static readonly DYNAMIC_PATHS = ["/lots/[id]", "/trade-offers/[id]", "/shipments/[id]"] as const;
}
