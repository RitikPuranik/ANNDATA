"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Small inline icon set for this file, so it doesn't depend on lucide-react
 * resolving correctly in every environment. Typed against real SVG props
 * (not `any`) so callers still get proper prop checking.
 */
type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

const MapPin = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);
const TrendingUp = (props: IconProps) => (
  <Icon {...props}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </Icon>
);
const TrendingDown = (props: IconProps) => (
  <Icon {...props}>
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
    <polyline points="16 17 22 17 22 11" />
  </Icon>
);
const Minus = (props: IconProps) => (
  <Icon {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);
const Trophy = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4" />
  </Icon>
);

interface MandiPublic {
  publicId: string;
  name: string;
  district: string;
  state: string;
}

interface MarketRecommendation {
  rank: number;
  mandi: MandiPublic;
  price: number;
  distanceKm: number;
  reasons: string[];
  trend: "UP" | "DOWN" | "STABLE" | "STRONGLY_UP" | "STRONGLY_DOWN" | null;
  recommendationConfidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
}

/** Matches the market-intelligence service's `recommend()` return shape. */
export interface LotMarketRecommendations {
  recommendations: MarketRecommendation[];
}

const CONFIDENCE_COPY: Record<string, { label: string; tone: "success" | "warning" | "destructive" }> = {
  HIGH: { label: "High confidence", tone: "success" },
  MEDIUM: { label: "Medium confidence", tone: "warning" },
  LOW: { label: "Low confidence", tone: "warning" },
  INSUFFICIENT_DATA: { label: "Not enough data to be sure", tone: "destructive" },
};

function TrendIcon({ trend }: { trend: MarketRecommendation["trend"] }) {
  if (trend === "UP" || trend === "STRONGLY_UP") return <TrendingUp className="h-5 w-5" aria-hidden />;
  if (trend === "DOWN" || trend === "STRONGLY_DOWN") return <TrendingDown className="h-5 w-5" aria-hidden />;
  return <Minus className="h-5 w-5" aria-hidden />;
}

function trendLabel(trend: MarketRecommendation["trend"]) {
  if (trend === "UP") return "Rising";
  if (trend === "STRONGLY_UP") return "Rising fast";
  if (trend === "DOWN") return "Falling";
  if (trend === "STRONGLY_DOWN") return "Falling fast";
  if (trend === "STABLE") return "Steady";
  return "No recent trend";
}

export function MarketFriendlyCard({ data }: { data: LotMarketRecommendations }) {
  const list = data.recommendations ?? [];
  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground">No nearby markets found for this crop right now.</p>;
  }

  const top = list[0];
  const confidence = CONFIDENCE_COPY[top.recommendationConfidence] ?? CONFIDENCE_COPY.MEDIUM;
  const rest = list.slice(1, 4); // keep it to a glance — top pick plus a few alternatives, not the full technical list

  return (
    <div>
      <div className="friendly-banner tone-success">
        <div className="friendly-banner-icon">
          <Trophy aria-hidden />
        </div>
        <div>
          <p className="friendly-banner-title">Best pick: {top.mandi.name}</p>
          <p className="friendly-banner-subtitle">
            ₹{top.price.toLocaleString("en-IN")} per quintal · {top.distanceKm} km away · {top.mandi.district}, {top.mandi.state}
          </p>
        </div>
      </div>

      <div className="friendly-stat-row">
        <div className="friendly-stat">
          <p className="friendly-stat-label">Price trend</p>
          <p className="friendly-stat-value" style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendIcon trend={top.trend} /> {trendLabel(top.trend)}
          </p>
        </div>
        <div className="friendly-stat">
          <p className="friendly-stat-label">How sure we are</p>
          <p className="friendly-stat-value" style={{ fontSize: 17 }}>
            <Badge tone={confidence.tone}>{confidence.label}</Badge>
          </p>
        </div>
      </div>

      {top.reasons?.length > 0 && (
        <ul className="friendly-reasons">
          {top.reasons.map((r, i) => (
            <li key={i}>
              <MapPin aria-hidden /> {r}
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className="friendly-stat-label" style={{ marginBottom: 8 }}>
            Other nearby options
          </p>
          {rest.map((m) => (
            <div key={m.mandi.publicId} className="friendly-pick-card">
              <div className="flex items-center gap-2">
                <span className="friendly-pick-rank">{m.rank}</span>
                <span className="text-sm font-semibold">{m.mandi.name}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                ₹{m.price.toLocaleString("en-IN")}/quintal · {m.distanceKm} km away
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PriceSnapshot {
  price: { unit: string; nationalAverage: number; minimum: number; maximum: number };
  trend: { direction: "UP" | "DOWN" | "STABLE" | "STRONGLY_UP" | "STRONGLY_DOWN"; changePercentage: number | null; period: string };
  dataQuality: { lastUpdated: string; freshness: "FRESH" | "RECENT" | "STALE" | "OUTDATED" };
}

/** Turns backend period codes like "7D" / "30D" into plain words. */
export function periodLabel(period: string) {
  const match = /^(\d+)D$/.exec(period);
  if (!match) return period;
  const days = match[1];
  return days === "1" ? "yesterday" : `the last ${days} days`;
}

export const FRESHNESS_COPY: Record<string, string> = {
  FRESH: "Up to date",
  RECENT: "Fairly recent",
  STALE: "A bit old — treat as a rough guide",
  OUTDATED: "Out of date — treat as a rough guide",
};

export function PriceSnapshotFriendlyCard({ data }: { data: PriceSnapshot }) {
  return (
    <div>
      <div className="friendly-stat-row">
        <div className="friendly-stat">
          <p className="friendly-stat-label">Average price nearby</p>
          <p className="friendly-stat-value">₹{data.price.nationalAverage.toLocaleString("en-IN")}/quintal</p>
        </div>
        <div className="friendly-stat">
          <p className="friendly-stat-label">Typical range</p>
          <p className="friendly-stat-value" style={{ fontSize: 19 }}>
            ₹{data.price.minimum.toLocaleString("en-IN")} – ₹{data.price.maximum.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="friendly-stat">
          <p className="friendly-stat-label">Compared to {periodLabel(data.trend.period)}</p>
          <p className="friendly-stat-value" style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendIcon trend={data.trend.direction} /> {trendLabel(data.trend.direction)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{FRESHNESS_COPY[data.dataQuality.freshness] ?? "We\u2019re not sure how fresh this is."}</p>
    </div>
  );
}

interface PriceTrendsData {
  crop: { name: string };
  period: string; // e.g. "30D"
  series: Array<{ date: string; modalPrice: number; minPrice: number; maxPrice: number }>;
  summary: {
    latest: number | null;
    minimum: number | null;
    maximum: number | null;
    change7d: number | null;
    changes: Record<string, number | null>;
    trend: "UP" | "DOWN" | "STABLE" | "STRONGLY_UP" | "STRONGLY_DOWN";
    volatility: { level: "LOW" | "MEDIUM" | "HIGH" | "UNAVAILABLE" };
    freshness: "FRESH" | "RECENT" | "STALE" | "OUTDATED" | null;
  };
}

const VOLATILITY_COPY: Record<string, string> = {
  LOW: "Prices have been fairly steady recently.",
  MEDIUM: "Prices have moved around a bit — worth checking again close to selling.",
  HIGH: "Prices have swung a lot recently — treat any single day's rate as a rough guide.",
  UNAVAILABLE: "Not enough recent data to judge how steady prices are.",
};

/** A plain SVG sparkline — no charting library, just a light line + area fill. */
function Sparkline({ values, trend }: { values: number[]; trend: PriceTrendsData["summary"]["trend"] }) {
  if (values.length < 2) return null;
  const w = 320;
  const h = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = trend === "UP" || trend === "STRONGLY_UP" ? "#0c831f" : trend === "DOWN" || trend === "STRONGLY_DOWN" ? "#c23b2e" : "#8a8f98";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full" style={{ maxWidth: 360, height: 64 }} aria-hidden>
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PriceTrendsFriendlyCard({ data }: { data: PriceTrendsData }) {
  const { summary } = data;
  const change = summary.changes?.[data.period] ?? summary.change7d;
  const values = data.series.map((s) => s.modalPrice);

  return (
    <div>
      <div className="friendly-stat-row">
        <div className="friendly-stat">
          <p className="friendly-stat-label">Latest price</p>
          <p className="friendly-stat-value">
            {summary.latest !== null ? `₹${summary.latest.toLocaleString("en-IN")}/quintal` : "—"}
          </p>
        </div>
        <div className="friendly-stat">
          <p className="friendly-stat-label">Change over {periodLabel(data.period)}</p>
          <p className="friendly-stat-value" style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendIcon trend={summary.trend} /> {trendLabel(summary.trend)}
            {change !== null && change !== undefined && (
              <span className="text-sm font-semibold text-muted-foreground">
                ({change > 0 ? "+" : ""}
                {change}%)
              </span>
            )}
          </p>
        </div>
        <div className="friendly-stat">
          <p className="friendly-stat-label">Typical range</p>
          <p className="friendly-stat-value" style={{ fontSize: 19 }}>
            {summary.minimum !== null && summary.maximum !== null
              ? `₹${summary.minimum.toLocaleString("en-IN")} – ₹${summary.maximum.toLocaleString("en-IN")}`
              : "—"}
          </p>
        </div>
      </div>

      {values.length > 1 && <Sparkline values={values} trend={summary.trend} />}

      <p className="mt-3 text-xs text-muted-foreground">
        {VOLATILITY_COPY[summary.volatility.level] ?? ""}{" "}
        {summary.freshness && FRESHNESS_COPY[summary.freshness] ? `· ${FRESHNESS_COPY[summary.freshness]}` : ""}
      </p>
    </div>
  );
}

interface NearbyMarketsData {
  crop: { name: string };
  markets: Array<{
    mandi: MandiPublic;
    distanceKm: number;
    modalPrice: number;
    lastUpdated: string;
    freshness: "FRESH" | "RECENT" | "STALE" | "OUTDATED";
  }>;
}

export function NearbyMarketsFriendlyCard({ data }: { data: NearbyMarketsData }) {
  const list = [...(data.markets ?? [])].sort((a, b) => b.modalPrice - a.modalPrice);
  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground">No nearby mandis found for this crop.</p>;
  }

  const best = list[0];
  const rest = list.slice(1);

  return (
    <div>
      <div className="friendly-banner tone-success">
        <div className="friendly-banner-icon">
          <Trophy aria-hidden />
        </div>
        <div>
          <p className="friendly-banner-title">Best price nearby: {best.mandi.name}</p>
          <p className="friendly-banner-subtitle">
            ₹{best.modalPrice.toLocaleString("en-IN")} per quintal · {best.distanceKm} km away · {best.mandi.district}, {best.mandi.state}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{FRESHNESS_COPY[best.freshness] ?? "Freshness unknown"}</p>
        </div>
      </div>

      {rest.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className="friendly-stat-label" style={{ marginBottom: 8 }}>
            Other nearby mandis
          </p>
          {rest.map((m) => (
            <div key={m.mandi.publicId} className="friendly-pick-card">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{m.mandi.name}</span>
                <span className="text-sm font-semibold">₹{m.modalPrice.toLocaleString("en-IN")}/quintal</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.distanceKm} km away · {m.mandi.district}, {m.mandi.state} · {FRESHNESS_COPY[m.freshness] ?? "Freshness unknown"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
