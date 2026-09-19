"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wraps a raw/technical block (an <InsightPanel> dump, internal IDs, scoring
 * breakdowns, etc.) and hides it behind a "Show technical details" toggle,
 * collapsed by default. The friendly, curated summary a person actually
 * needs sits outside this component, always visible — this is only for the
 * extra depth that's there for the curious, not for everyday use.
 */
export function TechnicalDetails({ children, label = "Show technical details" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="technical-details">
      <button type="button" className="technical-details-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        {open ? label.replace("Show", "Hide") : label}
      </button>
      {open && <div className="technical-details-body">{children}</div>}
    </div>
  );
}
