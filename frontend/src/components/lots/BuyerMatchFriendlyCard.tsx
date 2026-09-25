"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Small inline icon set for this file, matching the other *FriendlyCard
 * components — kept local so this doesn't depend on lucide-react resolving.
 */
type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}
const Handshake = (props: IconProps) => (
  <Icon {...props}>
    <path d="m11 17 2 2a1 1 0 1 0 3-3" />
    <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
    <path d="m21 3 1 11h-2" />
    <path d="M3 4h8" />
    <path d="M9 18a1 1 0 1 0-3-3" />
    <path d="M2 15h2l3 3" />
  </Icon>
);
const ShieldCheck = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3 8 3z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
const MapPin = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);
const AlertTriangle = (props: IconProps) => (
  <Icon {...props}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
);

const BUSINESS_TYPE_COPY: Record<string, string> = {
  PROCESSOR: "Food processor",
  WHOLESALER: "Wholesaler",
  RETAILER: "Retailer",
  EXPORTER: "Exporter",
  INSTITUTIONAL_BUYER: "Institutional buyer",
  TRADER: "Trader",
  OTHER: "Buyer",
};

const MATCH_QUALITY_COPY: { min: number; label: string; tone: "success" | "warning" }[] = [
  { min: 75, label: "Strong match", tone: "success" },
  { min: 50, label: "Good match", tone: "success" },
  { min: 0, label: "Possible match", tone: "warning" },
];

function matchQuality(score: number | undefined) {
  const s = score ?? 0;
  return MATCH_QUALITY_COPY.find((m) => s >= m.min) ?? MATCH_QUALITY_COPY[MATCH_QUALITY_COPY.length - 1];
}

/** Matches the shape returned by buyer-matching.service.ts#matches() per item. */
export interface BuyerMatchData {
  buyer?: {
    organizationName?: string;
    businessType?: string;
    state?: string;
    district?: string;
    verificationStatus?: string;
  };
  demand?: {
    title?: string;
    requiredQuantity?: number;
    quantityUnit?: string;
    state?: string;
    district?: string;
  };
  matchScore?: number;
  distanceKm?: number | null;
  reasons?: string[];
  warnings?: string[];
}

/**
 * Plain-language version of a single buyer match. Previously shown as a raw
 * field dump (matchScore, factorsUsed, omittedFactors as humanized labels) —
 * a farmer's real questions here are "how good a fit is this buyer, how much
 * do they need, and how far away are they." Full technical fields stay
 * available underneath via <TechnicalDetails> on the page itself.
 */
export function BuyerMatchFriendlyCard({ match }: { match: BuyerMatchData }) {
  const quality = matchQuality(match.matchScore);
  const buyer = match.buyer;
  const demand = match.demand;
  const location = [buyer?.district, buyer?.state].filter(Boolean).join(", ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={quality.tone}>{quality.label}</Badge>
        {buyer?.businessType && <Badge tone="neutral">{BUSINESS_TYPE_COPY[buyer.businessType] ?? "Buyer"}</Badge>}
        {buyer?.verificationStatus === "VERIFIED" && (
          <span className="flex items-center gap-1 text-xs font-medium text-[#0c831f]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified buyer
          </span>
        )}
      </div>

      <div className="friendly-stat-row" style={{ marginTop: 14 }}>
        {typeof demand?.requiredQuantity === "number" && (
          <div className="friendly-stat">
            <p className="friendly-stat-label">Quantity needed</p>
            <p className="friendly-stat-value" style={{ fontSize: 20 }}>
              {demand.requiredQuantity.toLocaleString("en-IN")} {demand.quantityUnit ?? ""}
            </p>
          </div>
        )}
        <div className="friendly-stat">
          <p className="friendly-stat-label">Location</p>
          <p className="friendly-stat-value" style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin className="h-4 w-4" aria-hidden />
            {typeof match.distanceKm === "number" ? `${match.distanceKm} km away` : location || "Not shared"}
          </p>
        </div>
      </div>

      {demand?.title && <p className="mt-3 text-sm text-muted-foreground">Looking for: {demand.title}</p>}

      {match.reasons && match.reasons.length > 0 && (
        <ul className="friendly-reasons">
          {match.reasons.map((r, i) => (
            <li key={i}>
              <Handshake aria-hidden /> {r}
            </li>
          ))}
        </ul>
      )}

      {match.warnings && match.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {match.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-sm text-[#8a6d1f]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
