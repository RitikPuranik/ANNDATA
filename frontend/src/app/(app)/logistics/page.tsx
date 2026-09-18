"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Truck, ArrowRight, MapPin } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useCropsQuery } from "@/hooks/useReferenceData";
import { logisticsRequestApi } from "@/services/logisticsApi";

const STATUS_FILTERS = ["ALL", "OPEN", "QUOTE_ACCEPTED", "CANCELLED"] as const;

function LogisticsContent() {
  const { user } = useAuth();
  const isTransporter = user?.role === "TRANSPORTER";
  const canCreate = user?.role === "FARMER" || user?.role === "FPO_ADMIN" || user?.role === "ADMIN";
  const [filter, setFilter] = React.useState<(typeof STATUS_FILTERS)[number]>("ALL");

  const requestsQuery = useQuery({
    queryKey: ["logistics", "requests", filter],
    queryFn: () => logisticsRequestApi.list(filter === "ALL" ? undefined : { status: filter }),
  });
  const cropsQuery = useCropsQuery();
  const cropNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (cropsQuery.data ?? []).forEach((c: any) => map.set(c.id, c.name));
    return map;
  }, [cropsQuery.data]);

  return (
    <div>
      <PageHeader
        title={isTransporter ? "Available Loads" : "Logistics Requests"}
        description={
          isTransporter
            ? "Open transport requirements you can submit a quote against."
            : "Raise transport requirements for your lots and pick the best quote."
        }
        actions={
          canCreate ? (
            <Link href="/logistics/new">
              <Button className="w-auto px-4 py-2.5 text-sm">
                <Plus className="h-4 w-4" aria-hidden />
                New request
              </Button>
            </Link>
          ) : undefined
        }
      />

      {!isTransporter && (
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
      )}

      {requestsQuery.isLoading ? (
        <LoadingBlock />
      ) : requestsQuery.isError ? (
        <ErrorBlock message="Couldn't load logistics requests." onRetry={() => requestsQuery.refetch()} />
      ) : (requestsQuery.data ?? []).length === 0 ? (
        <EmptyState
          message={isTransporter ? "No open loads right now. Check back soon." : "No logistics requests yet."}
          actionLabel={canCreate ? "Raise a request" : undefined}
          onAction={canCreate ? () => (window.location.href = "/logistics/new") : undefined}
        />
      ) : (
        <div className="space-y-3">
          {requestsQuery.data!.map((req: any) => (
            <Link
              key={req.requestId}
              href={`/logistics/${req.requestId}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Truck className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {cropNameById.get(req.crop?.cropId) ?? "Produce"} · {req.requiredQuantity?.value} {req.requiredQuantity?.unit}
                  </p>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {req.pickup?.district ?? "—"} → {req.destination?.district}, {req.destination?.state}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={toneForStatus(req.status)}>{req.status.replace(/_/g, " ")}</Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LogisticsPage() {
  return (
    <ProtectedRoute>
      <LogisticsContent />
    </ProtectedRoute>
  );
}
