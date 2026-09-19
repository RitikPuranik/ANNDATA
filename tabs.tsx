"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "scrollbar-none -mx-1 flex gap-2 overflow-x-auto border-b-2 border-border px-1",
        className,
      )}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-5 py-4 text-lg font-bold transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
            {active && <span className="absolute inset-x-2 -bottom-[2px] h-1 rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
