"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationApi, NotificationDTO } from "@/services/notificationApi";

const UNREAD_COUNT_KEY = ["notifications", "unread-count"];
const RECENT_KEY = ["notifications", "recent"];

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** A single notification row — reads open it and route to whatever it's
 * about, mirroring how disputes/shipments/payments are each opened by
 * publicId elsewhere in the app. Module 22 (Notifications) never
 * duplicates that navigation logic itself; it only carries
 * relatedEntityType/relatedEntityId as a hint. */
function targetHref(n: NotificationDTO): string | null {
  if (!n.relatedEntityId) return null;
  switch (n.relatedEntityType) {
    case "Dispute":
      return `/disputes/${n.relatedEntityId}`;
    case "Shipment":
      return `/shipments/${n.relatedEntityId}`;
    case "PaymentObligation":
      return `/payments/${n.relatedEntityId}`;
    case "TradeOffer":
      return `/trade-offers/${n.relatedEntityId}`;
    default:
      return null;
  }
}

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const unreadQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => notificationApi.unreadCount(),
    refetchInterval: 60_000,
  });

  const recentQuery = useQuery({
    queryKey: RECENT_KEY,
    queryFn: () => notificationApi.list({ limit: 8 }),
    enabled: open,
  });

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    queryClient.invalidateQueries({ queryKey: RECENT_KEY });
  };

  async function handleOpenNotification(n: NotificationDTO) {
    setOpen(false);
    if (!n.readAt) {
      try {
        await notificationApi.markRead(n.id);
        invalidate();
      } catch {
        // A failed read-receipt shouldn't block navigation.
      }
    }
    const href = targetHref(n);
    if (href) router.push(href);
  }

  async function handleMarkAllRead() {
    try {
      await notificationApi.markAllRead();
      invalidate();
    } catch {
      // Best-effort; the badge will settle on the next poll either way.
    }
  }

  const unread = unreadQuery.data ?? 0;
  const items = recentQuery.data?.items ?? [];

  return (
    <div className="anndata-account" ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={cn("icon-btn notification-btn", unread === 0 && "no-unread")}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell />
      </button>

      {open && (
        <div className="anndata-account-panel" role="menu" style={{ width: 340, padding: 0 }}>
          <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
            <b className="text-sm">Notifications</b>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {recentQuery.isLoading ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">You&rsquo;re all caught up.</p>
            ) : (
              items.map((n) => {
                const href = targetHref(n);
                const body = (
                  <div className={cn("px-3.5 py-3 text-left", !n.readAt && "bg-primary/5")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      {!n.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                );
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleOpenNotification(n)}
                    className="block w-full border-b border-border/60 last:border-0 hover:bg-secondary/60"
                    disabled={!href && !!n.readAt}
                  >
                    {body}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-3.5 py-2.5 text-center">
            <Link href="/notifications" className="text-xs font-semibold text-primary hover:underline" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
