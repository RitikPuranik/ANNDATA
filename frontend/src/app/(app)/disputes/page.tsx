"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Scale, ArrowRight, Plus } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { EmptyState } from "@/components/EmptyState";
import { disputeApi, DisputeStatus } from "@/services/disputeApi";

const STATUS_FILTERS: (DisputeStatus | "ALL")[] = [
  "ALL",
  "OPEN",
  "UNDER_REVIEW",
  "INVESTIGATION",
  "AWAITING_PARTY_RESPONSE",
  "RESOLUTION_PROPOSED",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
  "CANCELLED",
];

/**
 * Module 21 frontend — a farmer/buyer/transporter's own disputes and
 * grievances. ADMIN sees everything they're visible to per the backend's
 * own role rules (DisputeAuthorizationService); this page never filters
 * by user itself, it just shows whatever /api/disputes returns.
 */
function DisputesContent() {
  const [filter, setFilter] = React.useState<(typeof STATUS_FILTERS)[number]>("ALL");

  const disputesQuery = useQuery({
    queryKey: ["disputes", "mine", filter],
    queryFn: () => disputeApi.list(filter === "ALL" ? undefined : { status: filter }),
  });

  const items = disputesQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Disputes & Grievances"
        description="Raise an issue with a transaction, or a general platform grievance, and track it through to resolution."
        actions={
          <Link
            href="/disputes/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden /> Raise a dispute
          </Link>
        }
      />

      <div className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            {f === "ALL" ? "All" : f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {disputesQuery.isLoading ? (
        <LoadingBlock />
      ) : disputesQuery.isError ? (
        <ErrorBlock message="Couldn't load disputes." onRetry={() => disputesQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState message="No disputes here yet. If something's gone wrong with an order, delivery or payment — or you have a general grievance — you can raise it here." />
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <Link
              key={d.disputeId}
              href={`/disputes/${d.disputeId}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Scale className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {d.disputeNumber} · {d.type.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.priority === "CRITICAL" || d.priority === "HIGH" ? (
                  <Badge tone="destructive">{d.priority}</Badge>
                ) : null}
                <Badge tone={toneForStatus(d.status)}>{d.status.replace(/_/g, " ")}</Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DisputesPage() {
  return (
    <ProtectedRoute>
      <DisputesContent />
    </ProtectedRoute>
  );
}
