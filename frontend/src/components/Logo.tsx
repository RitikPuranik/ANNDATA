import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The Anndata mark — the gold fruit-and-furrow emblem (public/logo.png, transparent background).
 *
 * It is a full-colour image rather than a one-colour icon, so it does NOT follow `currentColor`:
 * size it with `className` (e.g. "h-8 w-8") and place it directly on any dark or light surface —
 * no tile behind it is needed. A larger master lives at public/logo-large.png for print/social use.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      width={256}
      height={256}
      decoding="async"
      draggable={false}
      aria-hidden
      className={cn("h-5 w-5 shrink-0 select-none object-contain", className)}
    />
  );
}

export function Logo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className={cn("font-display text-lg font-bold tracking-tight", textClassName)}>Anndata</span>
    </span>
  );
}
