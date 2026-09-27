"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Archive } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { notificationApi } from "@/services/notificationApi";

const FILTERS = ["ALL", "UNREAD"] as const;

/**
 * Module 22 frontend — the caller's own full notification inbox. The
 * bell dropdown (NotificationBell) shows a recent-8 preview and links
 * here for the rest. Every request is implicitly scoped to the
 * authenticated caller server-side (NotificationAuthorizationService) —
 * there is nothing to select "whose" notifications to view.
 */
function NotificationsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("ALL");

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "inbox", filter],
    queryFn: () => notificationApi.list({ unreadOnly: filter === "UNREAD", limit: 50 }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  async function handleMarkAllRead() {
    await notificationApi.markAllRead();
    invalidate();
  }

  async function handleOpen(id: string, readAt: string | null, relatedEntityType: string | null, relatedEntityId: string | null) {
    if (!readAt) {
      await notificationApi.markRead(id);
      invalidate();
    }
    const map: Record<string, string> = {
      Dispute: "/disputes",
      Shipment: "/shipments",
      PaymentObligation: "/payments",
      TradeOffer: "/trade-offers",
    };
    if (relatedEntityId && relatedEntityType && map[relatedEntityType]) {
      router.push(`${map[relatedEntityType]}/${relatedEntityId}`);
    }
  }

  async function handleArchive(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await notificationApi.archive(id);
    invalidate();
  }

  const items = notificationsQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Updates on your offers, payments, shipments, disputes and market alerts."
        actions={
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-secondary"
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Mark all read
          </button>
        }
      />

      <div className="mb-5 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {f === "ALL" ? "All" : "Unread"}
          </button>
        ))}
      </div>

      {notificationsQuery.isLoading ? (
        <LoadingBlock />
      ) : notificationsQuery.isError ? (
        <ErrorBlock message="Couldn't load your notifications." onRetry={() => notificationsQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState message="Nothing here yet. You'll see updates on your offers, payments, shipments and disputes as they happen." />
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => handleOpen(n.id, n.readAt, n.relatedEntityType, n.relatedEntityId)}
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40",
                !n.readAt && "bg-primary/5",
              )}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(n.priority === "CRITICAL" || n.priority === "HIGH") && <Badge tone="destructive">{n.priority}</Badge>}
                {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />}
                <button
                  type="button"
                  onClick={(e) => handleArchive(n.id, e)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Archive"
                >
                  <Archive className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <NotificationsContent />
    </ProtectedRoute>
  );
}
