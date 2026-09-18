"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/Logo";

const MIN_VISIBLE_MS = 260; // floor, so fast pages don't flicker
const MAX_VISIBLE_MS = 6000; // ceiling, so a stuck/slow fetch can't hang the cover forever
const POLL_MS = 120;

/** Persistent route cover shown while the page content underneath loads.
 * AppShell itself is mounted once in app/(app)/layout.tsx and survives
 * navigation, so this only covers the inner page content swap.
 *
 * It stays mounted at all times and is shown/hidden purely by fading its
 * opacity (see .anndata-global-route-loader in globals.css) — never by
 * mounting/unmounting the element, which is what used to cause a hard
 * "blink". On top of that, it no longer hides on a fixed short timer: once
 * the URL changes it keeps polling for any element carrying
 * data-nav-loading-indicator (every LoadingBlock in the app renders one)
 * and only fades out once none are left — i.e. once the new page's own
 * data has actually finished loading, not just once its shell mounted. */
export function NavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(false);
  const shownAt = React.useRef<number>(0);
  const hideTimer = React.useRef<number | null>(null);
  const pollTimer = React.useRef<number | null>(null);
  // The pathname we were on when the loader was triggered. Kept in sync on
  // every render (cheap — just a ref write) so the "start" handler below
  // always reads the up-to-date value, not a stale closure from mount.
  const latestPathname = React.useRef(pathname);
  latestPathname.current = pathname;
  // The pathname captured at the moment navigation started. Until the
  // pathname actually changes away from this, we are still looking at the
  // OLD page, so "no [data-nav-loading-indicator] found" doesn't mean
  // anything — the old page was already fully loaded and never had one.
  // Hiding the loader before the route has actually changed is what used
  // to make it disappear while the page hadn't swapped yet.
  const startPathname = React.useRef<string | null>(null);

  const clearTimers = React.useCallback(() => {
    if (hideTimer.current !== null) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (pollTimer.current !== null) { window.clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  React.useEffect(() => {
    const start = () => {
      clearTimers();
      shownAt.current = Date.now();
      startPathname.current = latestPathname.current;
      setVisible(true);
    };

    window.addEventListener("anndata:navigate-start", start);
    return () => {
      window.removeEventListener("anndata:navigate-start", start);
      clearTimers();
    };
  }, [clearTimers]);

  React.useEffect(() => {
    if (!visible) return;
    clearTimers();

    const tryHide = () => {
      const elapsed = Date.now() - shownAt.current;
      // Ceiling always applies, route-changed or not, so a genuinely stuck
      // navigation can't hang the cover forever.
      if (elapsed >= MAX_VISIBLE_MS) {
        setVisible(false);
        clearTimers();
        return;
      }
      const routeChanged = startPathname.current === null || pathname !== startPathname.current;
      if (!routeChanged) return; // still on the old page — never mind what's on it, keep waiting
      const stillLoading = document.querySelector("[data-nav-loading-indicator]") !== null;
      if (!stillLoading && elapsed >= MIN_VISIBLE_MS) {
        setVisible(false);
        clearTimers();
      }
    };

    // Wait a couple of paint frames for the new route's content (and any
    // LoadingBlock it renders) to actually be in the DOM before the first
    // check, then poll until it's done.
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        tryHide();
        pollTimer.current = window.setInterval(tryHide, POLL_MS);
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [pathname, visible, clearTimers]);

  return (
    <div
      className={`anndata-global-route-loader${visible ? " is-visible" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      aria-hidden={!visible}
    >
      <div className="anndata-global-loader-card">
        <div className="anndata-global-loader-mark">
          <LogoMark className="h-5 w-5" />
        </div>
        <div className="anndata-global-loader-line" />
        <p className="anndata-global-loader-text">Loading…</p>
      </div>
    </div>
  );
}
