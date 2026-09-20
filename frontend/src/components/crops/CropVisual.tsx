"use client";

import * as React from "react";
import {
  Wheat, Bean, Apple, Banana, Grape, Citrus, Cherry, Carrot, LeafyGreen, Nut, Sprout, Milk, Package, Leaf,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CUSTOM_ICON_PATHS, resolveCrop, type CropIconKey, type CropTone } from "./cropCatalog";

const LUCIDE: Record<string, React.ComponentType<LucideProps>> = {
  Wheat, Bean, Apple, Banana, Grape, Citrus, Cherry, Carrot, LeafyGreen, Nut, Sprout, Milk, Package, Leaf,
};

/** Renders any crop icon (lucide or custom) with identical stroke styling. */
export function CropGlyph({ icon, className, strokeWidth = 1.75 }: { icon: CropIconKey; className?: string; strokeWidth?: number }) {
  const custom = CUSTOM_ICON_PATHS[icon];
  if (custom) {
    return (
      <svg
        viewBox="2 2 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth * (20 / 24)}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {custom.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    );
  }
  const Icon = LUCIDE[icon] ?? Sprout;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}

// ---------------------------------------------------------------------------
// Photo loading. Order of preference:
//   1. a photo attached to the record itself (`imageUrl`, e.g. uploaded by the farmer)
//   2. a real photo shipped in /public/crops/<crop-name>.jpg  (drop files in, no code change)
//   3. the designed fallback below
// Missing files are remembered so we never re-request a 404 on every card.
// ---------------------------------------------------------------------------
const failedSrc = new Set<string>();

function usePhoto(candidates: (string | null | undefined)[]) {
  const [, force] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);
  const src = candidates.find((c): c is string => !!c && !failedSrc.has(c));

  React.useEffect(() => setLoaded(false), [src]);

  const onError = React.useCallback(() => {
    if (src) failedSrc.add(src);
    force((n) => n + 1);
  }, [src]);

  return { src, loaded, onLoad: () => setLoaded(true), onError };
}

export type CropVisualVariant = "cover" | "tile" | "thumb";

interface CropVisualProps {
  name?: string | null;
  category?: string | null;
  /** Photo attached to this record (uploaded by the person). */
  imageUrl?: string | null;
  variant?: CropVisualVariant;
  /** Override the auto-picked icon / colour (used for non-crop categories like "My Lots"). */
  icon?: CropIconKey;
  tone?: CropTone;
  className?: string;
}

/**
 * Card visual for a crop / lot. Shows a real photo when one exists, otherwise a
 * designed cover: crop-specific colour, soft light, field-row texture and a
 * glass badge holding a clean line icon (no emoji).
 *
 * - "cover": fills its parent (parent sets the height)
 * - "tile":  64px rounded square
 * - "thumb": 40px rounded square
 */
export function CropVisual({ name, category, imageUrl, variant = "cover", icon, tone, className }: CropVisualProps) {
  const resolved = resolveCrop(name, category);
  const glyph = icon ?? resolved.icon;
  const colors = tone ?? resolved.tone;
  const photo = usePhoto([imageUrl, name ? `/crops/${resolved.slug}.jpg` : null]);

  const bg = { background: `linear-gradient(145deg, ${colors.from} 0%, ${colors.to} 100%)` };

  const photoLayer = photo.src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={photo.src}
      src={photo.src}
      alt={name ?? "Crop"}
      loading="lazy"
      onLoad={photo.onLoad}
      onError={photo.onError}
      className={cn(
        "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
        photo.loaded ? "opacity-100" : "opacity-0",
      )}
    />
  ) : null;

  if (variant === "tile" || variant === "thumb") {
    const size = variant === "tile" ? "h-16 w-16 rounded-2xl" : "h-10 w-10 rounded-xl";
    const iconSize = variant === "tile" ? "h-8 w-8" : "h-5 w-5";
    return (
      <span
        className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden text-white shadow-sm ring-1 ring-black/10", size, className)}
        style={bg}
        role="img"
        aria-label={name ?? "Crop"}
      >
        <span className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,.32), transparent 60%)" }} />
        <CropGlyph icon={glyph} className={cn("relative drop-shadow-sm", iconSize)} strokeWidth={1.9} />
        {photoLayer}
      </span>
    );
  }

  return (
    <div className={cn("crop-cover relative h-full w-full overflow-hidden text-white", className)} style={bg} role="img" aria-label={name ?? "Crop"}>
      {/* soft light from the top-left */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(110% 90% at 12% -10%, rgba(255,255,255,.34), transparent 58%)" }} />
      {/* oversized watermark glyph for depth */}
      <CropGlyph
        icon={glyph}
        strokeWidth={1.1}
        className="absolute -bottom-8 -right-6 h-44 w-44 rotate-[-14deg] opacity-[.16]"
      />
      {/* field-row texture along the bottom edge */}
      <svg className="absolute inset-x-0 bottom-0 h-1/2 w-full opacity-[.2]" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden>
        <g fill="none" stroke="#fff" strokeWidth="1.4">
          <path d="M0 40 C 100 20, 300 60, 400 30" />
          <path d="M0 58 C 110 38, 290 78, 400 50" />
          <path d="M0 76 C 120 56, 280 96, 400 70" />
          <path d="M0 94 C 130 74, 270 114, 400 90" />
        </g>
      </svg>
      {/* glass badge with the crop glyph */}
      <div className="absolute left-3.5 top-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/15 shadow-[0_6px_18px_rgba(0,0,0,.18)] ring-1 ring-white/55 backdrop-blur-sm">
        <CropGlyph icon={glyph} className="h-8 w-8 drop-shadow" strokeWidth={1.75} />
      </div>
      {photoLayer}
      {photo.loaded && <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />}
    </div>
  );
}

/** Backwards-compatible wrapper — the old emoji "sticker" API, now rendering the designed tile. */
export function CropSticker({ name, category, size = "md", className }: { name?: string | null; category?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  return <CropVisual name={name} category={category} variant={size === "sm" ? "thumb" : "tile"} className={className} />;
}

// ---------------------------------------------------------------------------
// Farm cover: a generated landscape (sky, sun, hills, field rows). Each farm
// gets its own palette / sun position from its id, so a list of farms looks
// varied rather than repeated. Uses the farm's photo if it has one.
// ---------------------------------------------------------------------------
const SKIES: { top: string; bottom: string; sun: string; hillA: string; hillB: string; hillC: string; row: string; tree: string }[] = [
  { top: "#f6d98f", bottom: "#fbeec7", sun: "#fff7dc", hillA: "#a7c072", hillB: "#749f4e", hillC: "#4b7a3a", row: "#b1d47f", tree: "#3f6b34" }, // golden morning
  { top: "#a9d3d1", bottom: "#e8f3ea", sun: "#fffdf0", hillA: "#8fbf7a", hillB: "#5f9a5c", hillC: "#3d7647", row: "#9ed08c", tree: "#2f6240" }, // fresh mint
  { top: "#f2b995", bottom: "#fbe3cf", sun: "#fff1dc", hillA: "#b9bd6d", hillB: "#89a44e", hillC: "#597d3a", row: "#c8db84", tree: "#4a6b30" }, // warm sunrise
  { top: "#b9cbe6", bottom: "#eef2f7", sun: "#ffffff", hillA: "#93b97c", hillB: "#67955a", hillC: "#43704a", row: "#a4cd8f", tree: "#34603f" }, // clear blue
  { top: "#e9a6a0", bottom: "#f9dccf", sun: "#fff0e2", hillA: "#c0b26a", hillB: "#93974a", hillC: "#65763a", row: "#cdd47c", tree: "#52622f" }, // rose dusk
  { top: "#9fbdb3", bottom: "#dfe9e2", sun: "#f4f7ef", hillA: "#7fa48a", hillB: "#567f68", hillC: "#3a5f4d", row: "#8fbb9b", tree: "#2c4d3e" }, // misty monsoon
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // murmur3 finaliser so similar strings ("f-101", "f-102") diverge in every bit
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Small deterministic PRNG so one farm id always draws the same landscape. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function FarmVisual({ seed, name, imageUrl, className }: { seed: string; name?: string | null; imageUrl?: string | null; className?: string }) {
  const h = hash(seed || "farm");
  const r = rng(h);
  const sky = SKIES[Math.floor(r() * SKIES.length)];
  const sunX = 60 + r() * 280;
  const sunY = 36 + r() * 34;
  const lift = r() * 20;
  const vanishX = 130 + r() * 140;
  const treeCount = 3 + Math.floor(r() * 4);
  const trees = Array.from({ length: treeCount }, () => ({ x: 20 + r() * 360, s: 0.7 + r() * 0.7 }));
  const photo = usePhoto([imageUrl]);
  const gid = `f${h.toString(36)}`;
  const ridgeY = 128 - lift / 2;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)} role="img" aria-label={name ? `${name} farm` : "Farm"}>
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky.top} />
            <stop offset="1" stopColor={sky.bottom} />
          </linearGradient>
          <radialGradient id={`${gid}-sun`}>
            <stop offset="0" stopColor={sky.sun} stopOpacity="1" />
            <stop offset="1" stopColor={sky.sun} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${gid}-field`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky.hillC} />
            <stop offset="1" stopColor={sky.hillB} />
          </linearGradient>
        </defs>
        <rect width="400" height="200" fill={`url(#${gid}-sky)`} />
        <circle cx={sunX} cy={sunY} r="62" fill={`url(#${gid}-sun)`} opacity=".85" />
        <circle cx={sunX} cy={sunY} r="15" fill={sky.sun} />
        {/* distant hills */}
        <path d={`M0 ${112 - lift} C 70 ${84 - lift}, 130 ${96 - lift}, 200 ${104 - lift} S 340 ${82 - lift}, 400 ${100 - lift} V200 H0 Z`} fill={sky.hillA} opacity=".9" />
        {/* tree line on the ridge */}
        <g fill={sky.tree} opacity=".85">
          {trees.map((t, i) => (
            <g key={i} transform={`translate(${t.x} ${ridgeY - 4}) scale(${t.s})`}>
              <rect x="-1" y="-2" width="2" height="8" />
              <ellipse cx="0" cy="-8" rx="7" ry="9" />
            </g>
          ))}
        </g>
        <path d={`M0 ${132 - lift / 2} C 90 ${110 - lift / 2}, 170 ${140 - lift / 2}, 260 ${122 - lift / 2} S 370 ${118 - lift / 2}, 400 ${126 - lift / 2} V200 H0 Z`} fill={sky.hillB} />
        {/* foreground field with converging crop rows */}
        <path d="M0 152 C 110 136, 290 140, 400 150 V200 H0 Z" fill={`url(#${gid}-field)`} />
        <g stroke={sky.row} strokeWidth="1.6" strokeLinecap="round" opacity=".55">
          {[-220, -140, -70, 0, 70, 140, 220, 300, 380, 460, 540, 620].map((x, i) => (
            <line key={i} x1={vanishX + (x - vanishX) * 0.16} y1="146" x2={x - 60} y2="200" />
          ))}
        </g>
      </svg>
      {photo.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.src}
          src={photo.src}
          alt={name ?? "Farm"}
          loading="lazy"
          onLoad={photo.onLoad}
          onError={photo.onError}
          className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", photo.loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}
