"use client";

import * as React from "react";
import { MapPin, TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

const FRESHNESS_COPY: Record<string, string> = {
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
          <p className="friendly-stat-label">Trend ({data.trend.period})</p>
          <p className="friendly-stat-value" style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendIcon trend={data.trend.direction} /> {trendLabel(data.trend.direction)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{FRESHNESS_COPY[data.dataQuality.freshness] ?? "Freshness unknown"}</p>
    </div>
  );
}
