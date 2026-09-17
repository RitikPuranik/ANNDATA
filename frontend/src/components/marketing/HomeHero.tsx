import * as React from "react";
import Link from "next/link";
import { LineChart, Package, Handshake, Scale, ArrowRight } from "lucide-react";

/** Amazon-style row of colorful promo tiles, reframed for FarmLink's actual actions. */
const PROMO_TILES: {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  icon: React.ReactNode;
  className: string;
}[] = [
  {
    title: "List your produce",
    subtitle: "Get discovered by verified buyers",
    cta: "Create a lot",
    href: "/lots/new",
    icon: <Package className="h-5 w-5" />,
    className: "bg-[#15150f] text-white",
  },
  {
    title: "Today's mandi prices",
    subtitle: "Live rates across nearby markets",
    cta: "Check prices",
    href: "/market",
    icon: <LineChart className="h-5 w-5" />,
    className: "bg-gradient-to-br from-accent to-[#eec766] text-[#15150f]",
  },
  {
    title: "Sell vs. store",
    subtitle: "Know which pays off before you decide",
    cta: "Compare now",
    href: "/sell-vs-store",
    icon: <Scale className="h-5 w-5" />,
    className: "bg-[#f2ecd9] text-[#15150f] border border-[#e5dcc0]",
  },
  {
    title: "Trade offers",
    subtitle: "Negotiate and close deals with buyers",
    cta: "Review offers",
    href: "/trade-offers",
    icon: <Handshake className="h-5 w-5" />,
    className: "bg-white text-[#15150f] border border-border",
  },
];

export function PromoTileStrip() {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
      {PROMO_TILES.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          className={`group flex w-[220px] shrink-0 flex-col justify-between rounded-2xl p-5 shadow-sm transition-transform hover:-translate-y-0.5 sm:w-auto ${tile.className}`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10">{tile.icon}</span>
            <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-70" />
          </div>
          <div className="mt-5">
            <h3 className="text-base font-extrabold leading-tight">{tile.title}</h3>
            <p className="mt-1 text-xs opacity-80">{tile.subtitle}</p>
          </div>
          <span className="mt-4 inline-flex w-fit items-center gap-1 rounded-full bg-black/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
            {tile.cta}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Blinkit-style "shop by category" grid — illustrated tiles instead of hot-linked stock photos, so nothing ever breaks. */
const CATEGORIES: { label: string; emoji: string; href: string; from: string; to: string }[] = [
  { label: "Grains & Cereals", emoji: "🌾", href: "/market", from: "#f6e7b0", to: "#eecf6f" },
  { label: "Vegetables", emoji: "🥕", href: "/market", from: "#d9f2cf", to: "#a9e29a" },
  { label: "Fruits", emoji: "🍎", href: "/market", from: "#ffd7d0", to: "#ff9f8f" },
  { label: "Pulses & Oilseeds", emoji: "🫘", href: "/market", from: "#e3d7f7", to: "#c3aaf0" },
  { label: "Spices & Masala", emoji: "🌶️", href: "/market", from: "#ffe0c2", to: "#ffb266" },
  { label: "Cotton & Fibre", emoji: "☁️", href: "/market", from: "#e6eef7", to: "#c4d8ee" },
  { label: "Sugarcane", emoji: "🎋", href: "/market", from: "#dff4e5", to: "#a8dfb6" },
  { label: "Dairy Inputs", emoji: "🥛", href: "/market", from: "#f2f2f2", to: "#dcdcdc" },
  { label: "My Crops", emoji: "🌱", href: "/crops", from: "#faf3dc", to: "#eddba6" },
  { label: "My Lots", emoji: "📦", href: "/lots", from: "#f0e6d6", to: "#dcc79c" },
];

export function CategoryGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-5">
      {CATEGORIES.map((c) => (
        <Link key={c.label} href={c.href} className="group flex flex-col items-center gap-2 text-center">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-sm ring-1 ring-black/5 transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md sm:h-20 sm:w-20 sm:text-4xl"
            style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
            role="img"
            aria-label={c.label}
          >
            {c.emoji}
          </span>
          <span className="text-[11px] font-semibold leading-tight text-foreground sm:text-xs">{c.label}</span>
        </Link>
      ))}
    </div>
  );
}
