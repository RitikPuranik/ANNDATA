"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { CropVisual } from "@/components/crops/CropVisual";
import { RoleProtectedPage } from "@/components/RoleProtectedPage";
import { PageHeader } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { EmptyState } from "@/components/EmptyState";
import { lotApi } from "@/services/lotApi";
import { LotStatus } from "@/types/domain";

const STATUS_FILTERS: { value: LotStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "AVAILABLE", label: "Available" },
  { value: "PARTIALLY_COMMITTED", label: "Partly committed" },
  { value: "COMMITTED", label: "Committed" },
  { value: "STORED", label: "Stored" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function LotsContent() {
  const [filter, setFilter] = React.useState<LotStatus | "ALL">("ALL");
  const lotsQuery = useQuery({
    queryKey: ["lots", "mine", filter],
    queryFn: () => lotApi.listMine(filter === "ALL" ? undefined : { status: filter }),
  });

  return (
    <div>
      <PageHeader
        title="My Lots"
        description="Produce you've listed for sale, with its status through discovery, quality, and trade."
        actions={
          <Link href="/lots/new">
            <Button className="w-auto px-4 py-2.5 text-sm">
              <Plus className="h-4 w-4" aria-hidden />
              New lot
            </Button>
          </Link>
        }
      />

      <div className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {lotsQuery.isLoading ? (
        <LoadingBlock />
      ) : lotsQuery.isError ? (
        <ErrorBlock message="Couldn't load your lots." onRetry={() => lotsQuery.refetch()} />
      ) : (lotsQuery.data ?? []).length === 0 ? (
        <EmptyState message="No lots match this filter yet." actionLabel="Create a lot" onAction={() => (window.location.href = "/lots/new")} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {lotsQuery.data!.map((lot) => (
            <Link
              key={lot.publicId}
              href={`/lots/${lot.publicId}`}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <div className="relative h-32 overflow-hidden sm:h-36">
                <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                  <CropVisual name={lot.crop?.name} category={lot.crop?.category} imageUrl={lot.imageUrl} variant="cover" />
                </div>
                <span className="absolute right-2.5 top-2.5"><Badge solid tone={toneForStatus(lot.status)}>{lot.status.replace(/_/g, " ")}</Badge></span>
                {lot.crop?.category && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#3c3832] shadow-[0_2px_10px_rgba(0,0,0,.14)] ring-1 ring-black/5 backdrop-blur-sm">
                    {lot.crop.category}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3.5">
                <h3 className="line-clamp-1 text-foreground item-title">
                  {lot.crop?.name}
                  {lot.variety ? ` · ${lot.variety}` : ""}
                </h3>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {lot.quantity.value} <span className="text-xs font-medium text-muted-foreground">{lot.quantity.unit}</span>
                </p>
                <p className="mt-auto pt-2 text-xs text-muted-foreground">Available {new Date(lot.availabilityDate).toLocaleDateString()}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LotsPage() {
  return (
    <RoleProtectedPage role="FARMER">
      <LotsContent />
    </RoleProtectedPage>
  );
}
