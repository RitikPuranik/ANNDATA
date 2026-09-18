"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/Logo";

/** Persistent route cover. Because AppShell is mounted inside individual
 * pages, this loader stays mounted during the actual Next.js page swap. */
export function NavigationLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = React.useState(false);
  const hideTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    const start = () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      setLoading(true);
    };

    window.addEventListener("anndata:navigate-start", start);
    return () => {
      window.removeEventListener("anndata:navigate-start", start);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!loading) return;

    // Keep the cover for two paint frames after the pathname changes. This
    // prevents the previous page or an intermediate fallback from flashing.
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        hideTimer.current = window.setTimeout(() => {
          setLoading(false);
          hideTimer.current = null;
        }, 60);
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [pathname, loading]);

  if (!loading) return null;

  return (
    <div
      className="anndata-global-route-loader"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="anndata-global-loader-card">
        <div className="anndata-global-loader-mark">
          <LogoMark className="h-5 w-5" />
        </div>
        <div className="anndata-global-loader-line" />
      </div>
    </div>
  );
}
