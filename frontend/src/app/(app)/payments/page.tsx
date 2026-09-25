"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { paymentsApi, PaymentObligation, PaymentObligationStatus } from "@/services/paymentsApi";

const FILTERS: { value: "ALL" | "DUE" | "SETTLED"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DUE", label: "Money still owed" },
  { value: "SETTLED", label: "Fully paid" },
];

const STATUS_PLAIN: Record<PaymentObligationStatus, string> = {
  PENDING: "Waiting for payment",
  PARTIALLY_PAID: "Part paid",
  PAID: "Fully paid",
  OVERPAID: "Paid extra",
  OVERDUE: "Late — follow up",
  CANCELLED: "Cancelled",
  DISPUTED: "Under dispute",
};

function PaymentRow({ obligation, iAmOwed }: { obligation: PaymentObligation; iAmOwed: boolean }) {
  const o = obligation;
  return (
    <Link
      href={`/payments/${o.publicId}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
    >
      <div>
        <p className="text-sm font-semibold text-muted-foreground">{iAmOwed ? "You will receive" : "You need to pay"}</p>
        <p className="mt-0.5 text-xl font-bold text-foreground">
          {o.currency} {o.finalPayableAmount.toLocaleString("en-IN")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {o.amountDue > 0 ? `${o.currency} ${o.amountDue.toLocaleString("en-IN")} still due` : "Nothing left to pay"}
          {o.dueAt ? ` · by ${new Date(o.dueAt).toLocaleDateString()}` : ""}
        </p>
      </div>
      <Badge tone={toneForStatus(o.status)}>{STATUS_PLAIN[o.status] ?? o.status}</Badge>
    </Link>
  );
}

function PaymentsContent() {
  const { user } = useAuth();
  const [filter, setFilter] = React.useState<"ALL" | "DUE" | "SETTLED">("ALL");
  const iAmOwed = user?.role === "FARMER" || user?.role === "FPO_ADMIN";

  const query = useQuery({ queryKey: ["payments", "obligations", "mine"], queryFn: () => paymentsApi.listObligations({ limit: 100 }) });

  const items = (query.data?.items ?? []).filter((o) => {
    if (filter === "DUE") return o.amountDue > 0 && !["CANCELLED"].includes(o.status);
    if (filter === "SETTLED") return o.amountDue <= 0 || ["PAID", "OVERPAID"].includes(o.status);
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Payments"
        description={iAmOwed ? "Money buyers owe you for what you've sold, and what's already been paid." : "Money you owe sellers for what you've bought, and what you've already paid."}
      />

      <div className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
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

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock message="Couldn't load your payments." onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState message="No payments to show here yet." />
      ) : (
        <div className="space-y-3">
          {items.map((o) => (
            <PaymentRow key={o.publicId} obligation={o} iAmOwed={iAmOwed} />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Anndata does not move money itself. It only keeps track of what&rsquo;s owed and what&rsquo;s been paid — payments
          themselves happen directly between buyer and seller (bank transfer, UPI, cash, etc.).
        </p>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <ProtectedRoute>
      <PaymentsContent />
    </ProtectedRoute>
  );
}
