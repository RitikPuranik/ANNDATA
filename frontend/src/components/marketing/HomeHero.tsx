import * as React from "react";
import Link from "next/link";
import { LineChart, Package, Handshake, Scale, ArrowRight } from "lucide-react";
import { CropVisual } from "@/components/crops/CropVisual";
import { toneFor, type CropIconKey } from "@/components/crops/cropCatalog";

/** Amazon-style row of colorful promo tiles, reframed for Anndata's actual actions. */
const PROMO_TILES: {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  icon: React.ReactNode;
  className: string;
  /** Solid colours for the round icon and the CTA pill so they stay visible on this tile. */
  chip: string;
  pill: string;
}[] = [
  {
    title: "List your produce",
    subtitle: "Get discovered by verified buyers",
    cta: "Create a lot",
    href: "/lots/new",
    icon: <Package className="h-5 w-5" />,
    className: "bg-[#15150f] text-white",
    chip: "bg-white/15 text-white",
    pill: "bg-[#e4c25b] text-[#15150f]",
  },
  {
    title: "Today's mandi prices",
    subtitle: "Live rates across nearby markets",
    cta: "Check prices",
    href: "/market",
    icon: <LineChart className="h-5 w-5" />,
    className: "bg-gradient-to-br from-accent to-[#eec766] text-[#15150f]",
    chip: "bg-[#15150f] text-[#e4c25b]",
    pill: "bg-[#15150f] text-white",
  },
  {
    title: "Sell vs. store",
    subtitle: "Know which pays off before you decide",
    cta: "Compare now",
    href: "/sell-vs-store",
    icon: <Scale className="h-5 w-5" />,
    className: "bg-[#f2ecd9] text-[#15150f] border border-[#e5dcc0]",
    chip: "bg-[#15150f] text-[#e4c25b]",
    pill: "bg-[#15150f] text-white",
  },
  {
    title: "Trade offers",
    subtitle: "Negotiate and close deals with buyers",
    cta: "Review offers",
    href: "/trade-offers",
    icon: <Handshake className="h-5 w-5" />,
    className: "bg-white text-[#15150f] border border-border",
    chip: "bg-[#15150f] text-[#e4c25b]",
    pill: "bg-[#15150f] text-white",
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
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tile.chip}`}>{tile.icon}</span>
            <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-70" />
          </div>
          <div className="mt-5">
            <h3 className="text-base font-extrabold leading-tight">{tile.title}</h3>
            <p className="mt-1 text-xs opacity-80">{tile.subtitle}</p>
          </div>
          <span className={`mt-4 inline-flex w-fit items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide ${tile.pill}`}>
            {tile.cta}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** "Shop by category" grid — clean icon tiles (no emoji, nothing hot-linked, so nothing can break). */
const CATEGORIES: { label: string; icon: CropIconKey; tone: string; href: string }[] = [
  { label: "Grains & Cereals", icon: "Wheat", tone: "wheat", href: "/market" },
  { label: "Vegetables", icon: "Carrot", tone: "vegetable", href: "/market" },
  { label: "Fruits", icon: "Apple", tone: "fruit", href: "/market" },
  { label: "Pulses & Oilseeds", icon: "Bean", tone: "pulse", href: "/market" },
  { label: "Spices & Masala", icon: "chilli", tone: "spice", href: "/market" },
  { label: "Cotton & Fibre", icon: "cotton", tone: "cotton", href: "/market" },
  { label: "Sugarcane", icon: "sugarcane", tone: "sugarcane", href: "/market" },
  { label: "Dairy Inputs", icon: "Milk", tone: "dairy", href: "/market" },
  { label: "My Crops", icon: "Sprout", tone: "default", href: "/crops" },
  { label: "My Lots", icon: "Package", tone: "produce", href: "/lots" },
];

export function CategoryGrid() {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5 lg:grid-cols-5">
      {CATEGORIES.map((c) => (
        <Link key={c.label} href={c.href} className="group flex flex-col items-center gap-2.5 text-center">
          <CropVisual
            name={c.label}
            variant="tile"
            icon={c.icon}
            tone={toneFor(c.tone)}
            className="!h-[72px] !w-[72px] transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-lg sm:!h-24 sm:!w-24 [&_svg]:sm:!h-11 [&_svg]:sm:!w-11"
          />
          <span className="text-xs font-semibold leading-tight text-foreground sm:text-sm">{c.label}</span>
        </Link>
      ))}
    </div>
  );
}
