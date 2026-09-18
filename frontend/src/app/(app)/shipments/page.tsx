"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, ArrowRight, MapPin } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { EmptyState } from "@/components/EmptyState";
import { shipmentApi } from "@/services/shipmentApi";

const STATUS_FILTERS = [
  "ALL",
  "CREATED",
  "CONFIRMED",
  "ASSIGNED",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
  "CANCELLED",
] as const;

function ShipmentsContent() {
  const [filter, setFilter] = React.useState<(typeof STATUS_FILTERS)[number]>("ALL");

  const shipmentsQuery = useQuery({
    queryKey: ["shipments", "mine", filter],
    queryFn: () => shipmentApi.list(filter === "ALL" ? undefined : { status: filter }),
  });

  return (
    <div>
      <PageHeader title="Shipments" description="Track produce on the move, from pickup to delivery." />

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

      {shipmentsQuery.isLoading ? (
        <LoadingBlock />
      ) : shipmentsQuery.isError ? (
        <ErrorBlock message="Couldn't load shipments." onRetry={() => shipmentsQuery.refetch()} />
      ) : (shipmentsQuery.data ?? []).length === 0 ? (
        <EmptyState message="No shipments here yet. Once a logistics quote is accepted, its shipment will show up here." />
      ) : (
        <div className="space-y-3">
          {shipmentsQuery.data!.map((s: any) => (
            <Link
              key={s.shipmentId}
              href={`/shipments/${s.shipmentId}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <PackageCheck className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {s.commodity} · {s.quantity} {s.quantityUnit}
                  </p>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {s.pickup?.district} → {s.destination?.district}, {s.destination?.state}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={toneForStatus(s.status)}>{s.status.replace(/_/g, " ")}</Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShipmentsPage() {
  return (
    <ProtectedRoute>
      <ShipmentsContent />
    </ProtectedRoute>
  );
}
