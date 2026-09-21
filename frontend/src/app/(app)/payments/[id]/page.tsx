"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IndianRupee, CheckCircle2, AlertTriangle, Ban, History, LucideIcon } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert, Label, FieldError } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { useAuth } from "@/hooks/useAuth";
import { paymentsApi, PaymentMethod } from "@/services/paymentsApi";
import { ApiRequestError } from "@/types/api";

const PAYMENT_METHODS: PaymentMethod[] = ["BANK_TRANSFER", "UPI", "NEFT", "RTGS", "IMPS", "CASH", "CHEQUE", "OTHER"];

/**
 * A small "click to reveal a reason field, then confirm" control — used for
 * mark-disputed and cancel, both of which the backend requires a reason
 * for. Keeps the primary view uncluttered until the person actually means
 * to take the action.
 */
function ReasonAction({
  label,
  icon: Icon,
  variant,
  isLoading,
  onSubmit,
}: {
  label: string;
  icon: LucideIcon;
  variant: "outline" | "ghost";
  isLoading: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  if (!open) {
    return (
      <Button variant={variant} className="w-auto px-4 py-2 text-sm" onClick={() => setOpen(true)}>
        <Icon className="h-4 w-4" aria-hidden /> {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Input
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="max-w-xs"
      />
      <Button
        variant={variant}
        className="w-auto px-4 py-2 text-sm"
        isLoading={isLoading}
        disabled={!reason.trim()}
        onClick={() => onSubmit(reason.trim())}
      >
        Confirm {label.toLowerCase()}
      </Button>
      <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setOpen(false)}>
        Never mind
      </button>
    </div>
  );
}

function PaymentDetailContent({ id }: { id: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const obligationQuery = useQuery({ queryKey: ["payments", "obligation", id], queryFn: () => paymentsApi.getObligation(id) });
  const paymentsQuery = useQuery({ queryKey: ["payments", "obligation", id, "records"], queryFn: () => paymentsApi.listPayments(id) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["payments"] });
  };
  const onErr = (fallback: string) => (e: unknown) => setActionError(e instanceof ApiRequestError ? e.message : fallback);

  const record = useMutation({
    mutationFn: () =>
      paymentsApi.recordPayment(id, {
        amount: Number(amount),
        paymentMethod: method,
        idempotencyKey: crypto.randomUUID(),
        externalReference: reference || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setAmount("");
      setReference("");
      setNotes("");
    },
    onError: onErr("Couldn't record this payment."),
  });

  const confirmPayment = useMutation({
    mutationFn: (recordPublicId: string) => paymentsApi.confirmPayment(recordPublicId),
    onSuccess: invalidate,
    onError: onErr("Couldn't confirm this payment."),
  });

  const dispute = useMutation({
    mutationFn: (reason: string) => paymentsApi.markDisputed(id, reason),
    onSuccess: invalidate,
    onError: onErr("Couldn't raise a dispute."),
  });

  const cancelObligation = useMutation({
    mutationFn: (reason: string) => paymentsApi.cancel(id, reason),
    onSuccess: invalidate,
    onError: onErr("Couldn't cancel this obligation."),
  });

  if (obligationQuery.isLoading) return <LoadingBlock />;
  if (obligationQuery.isError || !obligationQuery.data)
    return <ErrorBlock message="Couldn't load this payment." onRetry={() => obligationQuery.refetch()} />;

  const o = obligationQuery.data;
  const isBuyerSide = user?.role === "BUYER" || user?.role === "ADMIN";
  const isSellerSide = user?.role === "FARMER" || user?.role === "FPO_ADMIN" || user?.role === "ADMIN";
  const isAdmin = user?.role === "ADMIN";
  const canRecordPayment = isBuyerSide && !["CANCELLED", "PAID", "OVERPAID"].includes(o.status);
  const canDispute = !!user && o.status !== "CANCELLED";
  const canCancel = isAdmin && !["PAID", "OVERPAID", "CANCELLED"].includes(o.status);

  return (
    <div>
      <PageHeader
        title="Payment"
        breadcrumb={
          <a href="/payments" className="hover:underline">
            ← Back to payments
          </a>
        }
      />

      {actionError && (
        <Alert variant="error" className="mb-4">
          {actionError}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">
              {o.currency} {o.finalPayableAmount.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {o.amountDue > 0 ? `${o.currency} ${o.amountDue.toLocaleString("en-IN")} still due` : "Fully settled"}
              {o.dueAt ? ` · due ${new Date(o.dueAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <Badge tone={toneForStatus(o.status)} className="text-sm">
            {o.status.replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total</p>
            <p className="mt-1 font-semibold">
              {o.currency} {o.finalPayableAmount.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Paid</p>
            <p className="mt-1 font-semibold">
              {o.currency} {o.amountPaid.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Due</p>
            <p className="mt-1 font-semibold">
              {o.currency} {o.amountDue.toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        {(canDispute || canCancel) && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-5">
            {canDispute && (
              <ReasonAction
                label="Mark disputed"
                icon={AlertTriangle}
                variant="outline"
                isLoading={dispute.isPending}
                onSubmit={(reason) => dispute.mutate(reason)}
              />
            )}
            {canCancel && (
              <ReasonAction
                label="Cancel obligation"
                icon={Ban}
                variant="ghost"
                isLoading={cancelObligation.isPending}
                onSubmit={(reason) => cancelObligation.mutate(reason)}
              />
            )}
          </div>
        )}
      </Card>

      {canRecordPayment && (
        <Card className="mt-6">
          <h3 className="mb-2 section-title">Record a payment</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Report a payment you&rsquo;ve already made outside FarmLink — bank transfer, UPI, cash. This never moves
            money itself; it keeps both sides in sync on what&rsquo;s been paid.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Amount ({o.currency})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={o.amountDue.toString()}
              />
            </div>
            <div>
              <Label>Payment method</Label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Reference (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque number" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {record.isError && <FieldError>Check the amount and try again.</FieldError>}
          <Button
            className="mt-4 w-auto px-4"
            isLoading={record.isPending}
            disabled={!amount || Number(amount) <= 0}
            onClick={() => record.mutate()}
          >
            <IndianRupee className="h-4 w-4" aria-hidden /> Record payment
          </Button>
        </Card>
      )}

      <Card className="mt-6">
        <h3 className="mb-4 flex items-center gap-2 section-title">
          <History className="h-[18px] w-[18px]" aria-hidden /> Payment history
        </h3>
        {paymentsQuery.isLoading ? (
          <LoadingBlock />
        ) : !paymentsQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {paymentsQuery.data.map((p) => (
              <div key={p.publicId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div>
                  <p className="font-semibold">
                    {p.currency} {p.amount.toLocaleString("en-IN")} · {p.paymentMethod.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(p.paidAt).toLocaleString()}
                    {p.externalReference ? ` · Ref: ${p.externalReference}` : ""}
                  </p>
                  {p.notes && <p className="mt-1 text-sm text-muted-foreground">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={toneForStatus(p.status)}>{p.status}</Badge>
                  {isSellerSide && p.status === "RECORDED" && (
                    <Button
                      className="w-auto px-3 py-1.5 text-xs"
                      isLoading={confirmPayment.isPending}
                      onClick={() => confirmPayment.mutate(p.publicId)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Confirm
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute>
      <PaymentDetailContent id={params.id} />
    </ProtectedRoute>
  );
}
