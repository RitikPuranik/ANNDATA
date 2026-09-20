import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "accent";

// Default badges are OPAQUE (a solid light tint + fine ring) so they stay readable on any
// surface — white cards, tinted banners or hover rows. Translucent backgrounds
// (e.g. bg-success/10) turn see-through on coloured areas and hide the text.
const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[#ece9e0] text-[#3c3832] ring-1 ring-inset ring-[#d9d5c8]",
  success: "bg-[#dcf3e2] text-[#146c2e] ring-1 ring-inset ring-[#b3e0bf]",
  warning: "bg-[#fdefc7] text-[#7a5a0a] ring-1 ring-inset ring-[#f0d98a]",
  destructive: "bg-[#fde0dc] text-[#a3241a] ring-1 ring-inset ring-[#f4b9b2]",
  info: "bg-[#dbeafe] text-[#1d4ed8] ring-1 ring-inset ring-[#b6d0fb]",
  accent: "bg-[#f6ebc2] text-[#6b5210] ring-1 ring-inset ring-[#e6d48f]",
};

// `solid` = for sitting on top of photos / coloured covers. A frosted white pill with dark
// text reads on any background and stays understated; the status is carried by a small
// coloured dot (and red text for problems), so it is clear without being loud.
const solidToneClasses: Record<BadgeTone, { text: string; dot: string }> = {
  neutral: { text: "text-[#2b2925]", dot: "bg-[#9a958a]" },
  success: { text: "text-[#2b2925]", dot: "bg-[#22a55b]" },
  warning: { text: "text-[#2b2925]", dot: "bg-[#f0a30a]" },
  destructive: { text: "text-[#b42318]", dot: "bg-[#dc2626]" },
  info: { text: "text-[#2b2925]", dot: "bg-[#3b82f6]" },
  accent: { text: "text-[#2b2925]", dot: "bg-[#c9a227]" },
};

export function Badge({
  tone = "neutral",
  solid = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** Use on top of images / coloured backgrounds. */
  solid?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (solid) {
    const t = solidToneClasses[tone];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold uppercase leading-none tracking-wide shadow-[0_2px_10px_rgba(0,0,0,.18)] ring-1 ring-black/5 backdrop-blur-sm",
          t.text,
          className,
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} aria-hidden />
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Best-effort status -> tone mapping shared across lots/offers/assessments/etc. */
export function toneForStatus(status: string): BadgeTone {
  const positive = ["AVAILABLE", "ACTIVE", "VERIFIED", "ACCEPTED", "COMPLETED", "APPROVED", "SUITABLE", "ELIGIBLE", "FRESH", "A"];
  const negative = ["CANCELLED", "REJECTED", "SUSPENDED", "WITHDRAWN", "EXPIRED", "UNSUITABLE", "UNAVAILABLE", "FULL", "OUTDATED", "REMOVED", "D", "INSUFFICIENT_DATA"];
  const warning = ["PENDING", "DRAFT", "PARTIALLY_COMMITTED", "UNDER_REVIEW", "LIMITED", "STALE", "CONDITIONALLY_SUITABLE", "RECENT", "B", "C", "COUNTERED", "UNKNOWN"];
  if (positive.includes(status)) return "success";
  if (negative.includes(status)) return "destructive";
  if (warning.includes(status)) return "warning";
  return "neutral";
}
