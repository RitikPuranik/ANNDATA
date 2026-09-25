"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}
const Barn = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 21V10l9-6 9 6v11" />
    <path d="M3 10h18" />
    <path d="M9 21v-7h6v7" />
  </Icon>
);
const CheckCircle = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
const XCircle = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6M9 9l6 6" />
  </Icon>
);
const MapPinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);

/** Matches backend NearbyWarehouseResultDTO (warehouse-intelligence module). */
export interface NearbyWarehouseResult {
  warehouse: {
    publicId: string;
    name: string;
    warehouseType: string;
    location: { state: string; district: string; address: string | null };
    verificationStatus: string;
  };
  capacity: {
    totalKg: number | null;
    availableKg: number | null;
    utilizationPercent: number | null;
    status: "AVAILABLE" | "LIMITED" | "FULL" | "UNAVAILABLE";
  };
  compatibility: "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN" | null;
  canAccommodate: boolean | null;
  distanceKm: number;
}

const ROOM_COPY: Record<string, { label: string; tone: "success" | "warning" | "destructive" | "neutral" }> = {
  AVAILABLE: { label: "Plenty of room", tone: "success" },
  LIMITED: { label: "Filling up", tone: "warning" },
  FULL: { label: "Full right now", tone: "destructive" },
  UNAVAILABLE: { label: "Room unknown", tone: "neutral" },
};

const STORAGE_TYPE_COPY: Record<string, string> = {
  COLD_STORAGE: "Cold storage",
  WAREHOUSE: "Regular warehouse",
  SILO: "Silo (for grain)",
  GODOWN: "Godown",
};

function WarehouseRow({ item }: { item: NearbyWarehouseResult }) {
  const room = ROOM_COPY[item.capacity.status] ?? ROOM_COPY.UNAVAILABLE;
  const fits = item.canAccommodate;
  return (
    <div className="friendly-pick-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{item.warehouse.name}</span>
          {item.warehouse.verificationStatus === "VERIFIED" && <Badge tone="success">Verified</Badge>}
        </div>
        <Badge tone={room.tone}>{room.label}</Badge>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPinIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {item.distanceKm} km away · {item.warehouse.location.district}, {item.warehouse.location.state}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {STORAGE_TYPE_COPY[item.warehouse.warehouseType] ?? item.warehouse.warehouseType}
        {item.capacity.availableKg !== null ? ` · ${item.capacity.availableKg.toLocaleString("en-IN")} kg free` : ""}
      </p>
      {fits !== null && (
        <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${fits ? "text-[#146c2e]" : "text-[#a3241a]"}`}>
          {fits ? <CheckCircle className="h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0" aria-hidden />}
          {fits ? "Good fit for your crop" : "Not set up for your crop"}
        </p>
      )}
    </div>
  );
}

/** Matches backend WarehouseRecommendationResult (warehouse-recommendation engine). */
export interface WarehouseRecommendation {
  warehouse: { publicId: string; name: string; location: { state: string; district: string } };
  rank: number;
  suitability: "SUITABLE" | "CONDITIONALLY_SUITABLE" | "UNSUITABLE" | "UNKNOWN";
  distanceKm: number | null;
  availableCapacityKg: number | null;
  estimatedStorageCost: {
    amount: number;
    currency: string;
    quantityUsedKg: number;
    durationUsedDays: number;
    assumptions: string[];
  } | null;
  explanation: string;
}

export interface WarehouseRecommendationResponse {
  recommendations: WarehouseRecommendation[];
  suitableCandidateCount: number;
}

const SUITABILITY_COPY: Record<string, { label: string; tone: "success" | "warning" | "destructive" | "neutral" }> = {
  SUITABLE: { label: "Good match for your crop", tone: "success" },
  CONDITIONALLY_SUITABLE: { label: "Can work, with some limits", tone: "warning" },
  UNSUITABLE: { label: "Not a good match", tone: "destructive" },
  UNKNOWN: { label: "Not enough info to say", tone: "neutral" },
};

function RecommendationRow({ item }: { item: WarehouseRecommendation }) {
  const s = SUITABILITY_COPY[item.suitability] ?? SUITABILITY_COPY.UNKNOWN;
  return (
    <div className="friendly-pick-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="friendly-pick-rank">{item.rank}</span>
          <span className="text-sm font-semibold">{item.warehouse.name}</span>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {item.warehouse.location.district}, {item.warehouse.location.state}
        {item.distanceKm !== null ? ` · ${item.distanceKm} km away` : ""}
        {item.availableCapacityKg !== null ? ` · ${item.availableCapacityKg.toLocaleString("en-IN")} kg free` : ""}
      </p>
      {item.estimatedStorageCost && (
        <p className="mt-1.5 text-sm font-semibold text-foreground">
          Cost: ₹{item.estimatedStorageCost.amount.toLocaleString("en-IN")} for {item.estimatedStorageCost.durationUsedDays}{" "}
          days ({item.estimatedStorageCost.quantityUsedKg.toLocaleString("en-IN")} kg)
        </p>
      )}
      {item.explanation && <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>}
    </div>
  );
}

/**
 * Plain-language version of /warehouses/recommend — the one endpoint that
 * actually returns a storage PRICE estimate, not just space/suitability.
 * Previously shown as a raw field dump; a farmer's real question here is
 * "which place, and what will it cost me" so that's what leads.
 */
export function StorageRecommendationFriendlyCard({ data }: { data: WarehouseRecommendationResponse }) {
  const list = data?.recommendations ?? [];
  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground">No storage recommendations for this crop right now.</p>;
  }
  const top = list[0];
  const rest = list.slice(1, 5);
  const s = SUITABILITY_COPY[top.suitability] ?? SUITABILITY_COPY.UNKNOWN;

  return (
    <div>
      <div className={`friendly-banner tone-${s.tone === "destructive" ? "warning" : s.tone}`}>
        <div className="friendly-banner-icon">
          <Barn aria-hidden />
        </div>
        <div>
          <p className="friendly-banner-title">Best pick: {top.warehouse.name}</p>
          <p className="friendly-banner-subtitle">
            {top.warehouse.location.district}, {top.warehouse.location.state}
            {top.distanceKm !== null ? ` · ${top.distanceKm} km away` : ""} · {s.label}
          </p>
          {top.estimatedStorageCost && (
            <p className="friendly-banner-subtitle" style={{ fontWeight: 700, marginTop: 4 }}>
              Estimated cost: ₹{top.estimatedStorageCost.amount.toLocaleString("en-IN")} for{" "}
              {top.estimatedStorageCost.durationUsedDays} days
            </p>
          )}
        </div>
      </div>

      {top.explanation && (
        <ul className="friendly-reasons">
          <li>
            <CheckCircle aria-hidden /> {top.explanation}
          </li>
        </ul>
      )}

      {rest.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className="friendly-stat-label" style={{ marginBottom: 8 }}>
            Other options
          </p>
          <div className="space-y-3">
            {rest.map((item) => (
              <RecommendationRow key={item.warehouse.publicId} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Plain-language version of /warehouses/nearby — for farmers who just want
 * to know: is there room, is it close, and will it take my crop. Full
 * technical fields (capacity %, raw compatibility codes, etc.) stay
 * available underneath via <TechnicalDetails> on the page itself.
 */
export function WarehouseFriendlyCard({ data }: { data: NearbyWarehouseResult[] }) {
  const list = data ?? [];
  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground">No storage places found near you yet.</p>;
  }

  const good = list.filter((w) => w.canAccommodate !== false).sort((a, b) => a.distanceKm - b.distanceKm);
  const top = good[0] ?? list[0];
  const rest = list.filter((w) => w.warehouse.publicId !== top.warehouse.publicId).slice(0, 5);
  const room = ROOM_COPY[top.capacity.status] ?? ROOM_COPY.UNAVAILABLE;

  return (
    <div>
      <div className={`friendly-banner tone-${room.tone === "destructive" ? "warning" : room.tone}`}>
        <div className="friendly-banner-icon">
          <Barn aria-hidden />
        </div>
        <div>
          <p className="friendly-banner-title">Closest option: {top.warehouse.name}</p>
          <p className="friendly-banner-subtitle">
            {top.distanceKm} km away · {top.warehouse.location.district}, {top.warehouse.location.state} · {room.label}
          </p>
          {top.canAccommodate !== null && (
            <p className="mt-1.5 text-sm font-medium" style={{ color: top.canAccommodate ? "#146c2e" : "#a3241a" }}>
              {top.canAccommodate ? "✓ Good fit for your crop" : "✗ Not set up for your crop — check others below"}
            </p>
          )}
        </div>
      </div>

      {rest.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className="friendly-stat-label" style={{ marginBottom: 8 }}>
            Other places nearby
          </p>
          <div className="space-y-3">
            {rest.map((item) => (
              <WarehouseRow key={item.warehouse.publicId} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
