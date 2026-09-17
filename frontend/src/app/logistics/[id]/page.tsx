"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Sparkles, XCircle, Truck, CheckCircle2, Undo2, PackagePlus } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { useAuth } from "@/hooks/useAuth";
import { logisticsRequestApi, logisticsQuoteApi } from "@/services/logisticsApi";
import { shipmentApi } from "@/services/shipmentApi";
import { vehicleApi } from "@/services/transporterApi";
import { ApiRequestError } from "@/types/api";

function QuoteForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const vehiclesQuery = useQuery({ queryKey: ["transporter", "vehicles"], queryFn: () => vehicleApi.list() });
  const [vehicleId, setVehicleId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const vehicles = vehiclesQuery.data?.items ?? vehiclesQuery.data ?? [];

  const submit = useMutation({
    mutationFn: () => logisticsQuoteApi.submit(requestId, { vehicleId, quotedAmount: Number(amount), notes: notes || undefined }),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : "Couldn't submit quote."),
  });

  return (
    <Card className="mt-4">
      <h3 className="mb-3 font-semibold">Submit a quote</h3>
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Vehicle</Label>
          {vehiclesQuery.isLoading ? (
            <LoadingBlock />
          ) : (
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Select a vehicle</option>
              {vehicles.map((v: any) => (
                <option key={v.vehicleId} value={v.vehicleId}>
                  {v.registrationNumber} ({v.vehicleType})
                </option>
              ))}
            </Select>
          )}
        </div>
        <div>
          <Label>Quoted amount (₹)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="mt-3">
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button className="mt-3 w-auto px-4" disabled={!vehicleId || !amount} isLoading={submit.isPending} onClick={() => submit.mutate()}>
        Submit quote
      </Button>
    </Card>
  );
}

function LogisticsDetailContent({ id }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [showQuoteForm, setShowQuoteForm] = React.useState(false);

  const requestQuery = useQuery({ queryKey: ["logistics", "requests", id], queryFn: () => logisticsRequestApi.get(id) });
  const quotesQuery = useQuery({
    queryKey: ["logistics", "requests", id, "quotes"],
    queryFn: () => logisticsQuoteApi.listForRequest(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["logistics"] });
  };

  const calculate = useMutation({
    mutationFn: () => logisticsRequestApi.calculate(id),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't calculate an estimate."),
  });
  const optimize = useMutation({
    mutationFn: () => logisticsRequestApi.optimize(id),
    onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't rank the quotes yet."),
  });
  const cancelRequest = useMutation({
    mutationFn: () => logisticsRequestApi.cancel(id),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't cancel this request."),
  });
  const acceptQuote = useMutation({
    mutationFn: (quoteId: string) => logisticsQuoteApi.accept(quoteId),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't accept this quote."),
  });
  const rejectQuote = useMutation({
    mutationFn: (quoteId: string) => logisticsQuoteApi.reject(quoteId),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't reject this quote."),
  });
  const withdrawQuote = useMutation({
    mutationFn: (quoteId: string) => logisticsQuoteApi.withdraw(quoteId),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't withdraw this quote."),
  });
  const createShipment = useMutation({
    mutationFn: () => shipmentApi.create(id),
    onSuccess: (shipment) => router.push(`/shipments/${shipment.shipmentId}`),
    onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't create the shipment."),
  });

  if (requestQuery.isLoading) return <LoadingBlock />;
  if (requestQuery.isError || !requestQuery.data) return <ErrorBlock message="Couldn't load this request." onRetry={() => requestQuery.refetch()} />;

  const req = requestQuery.data;
  const isRequesterSide = user?.role === "FARMER" || user?.role === "FPO_ADMIN" || user?.role === "ADMIN";
  const isTransporter = user?.role === "TRANSPORTER";
  const quotes = quotesQuery.data ?? [];
  const myQuote = isTransporter ? quotes.find((q: any) => q.status === "SUBMITTED" || q.status === "ACCEPTED") : undefined;

  return (
    <div>
      <PageHeader
        title="Logistics request"
        breadcrumb={
          <a href="/logistics" className="hover:underline">
            ← Back to logistics
          </a>
        }
      />

      {actionError && <Alert variant="error" className="mb-4">{actionError}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">
              {req.requiredQuantity?.value} {req.requiredQuantity?.unit}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {req.pickup?.district ?? "Farm origin"}, {req.pickup?.state ?? ""} → {req.destination?.district}, {req.destination?.state}
            </p>
            {req.requiresRefrigeration && <Badge tone="info" className="mt-2">Requires refrigeration</Badge>}
            {req.specialInstructions && <p className="mt-2 text-sm text-muted-foreground">“{req.specialInstructions}”</p>}
          </div>
          <Badge tone={toneForStatus(req.status)} className="text-sm">
            {req.status.replace(/_/g, " ")}
          </Badge>
        </div>

        {req.estimate?.calculatedAt && (
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-secondary/40 p-3 text-center text-sm">
            <div>
              <p className="font-semibold">{req.estimate.distanceKm ?? "—"} km</p>
              <p className="text-xs text-muted-foreground">Est. distance</p>
            </div>
            <div>
              <p className="font-semibold">{req.estimate.durationMinutes ?? "—"} min</p>
              <p className="text-xs text-muted-foreground">Est. duration</p>
            </div>
            <div>
              <p className="font-semibold">
                {req.estimate.currency} {req.estimate.cost ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Est. cost</p>
            </div>
          </div>
        )}

        {isRequesterSide && req.status === "OPEN" && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
            <Button variant="outline" className="w-auto px-4 py-2.5 text-sm" isLoading={calculate.isPending} onClick={() => calculate.mutate()}>
              <Calculator className="h-4 w-4" aria-hidden /> Calculate estimate
            </Button>
            <Button variant="outline" className="w-auto px-4 py-2.5 text-sm" isLoading={optimize.isPending} onClick={() => optimize.mutate()}>
              <Sparkles className="h-4 w-4" aria-hidden /> Rank quotes
            </Button>
            <Button variant="destructive" className="w-auto px-4 py-2.5 text-sm" isLoading={cancelRequest.isPending} onClick={() => cancelRequest.mutate()}>
              <XCircle className="h-4 w-4" aria-hidden /> Cancel request
            </Button>
          </div>
        )}

        {isRequesterSide && req.status === "QUOTE_ACCEPTED" && (
          <div className="mt-5 border-t border-border pt-5">
            <Button className="w-auto px-4 py-2.5 text-sm" isLoading={createShipment.isPending} onClick={() => createShipment.mutate()}>
              <PackagePlus className="h-4 w-4" aria-hidden /> Create shipment
            </Button>
          </div>
        )}

        {optimize.data && (
          <div className="mt-4 rounded-xl border border-border p-3 text-sm">
            <p className="mb-1 font-semibold">Recommended quote</p>
            <pre className="max-h-52 overflow-auto rounded-lg bg-secondary p-3 text-xs">{JSON.stringify(optimize.data, null, 2)}</pre>
          </div>
        )}
      </Card>

      {isTransporter && req.status === "OPEN" && !myQuote && !showQuoteForm && (
        <Button className="mt-4 w-auto px-4 py-2.5 text-sm" onClick={() => setShowQuoteForm(true)}>
          <Truck className="h-4 w-4" aria-hidden /> Quote on this load
        </Button>
      )}
      {isTransporter && showQuoteForm && (
        <QuoteForm
          requestId={id}
          onDone={() => {
            setShowQuoteForm(false);
            invalidate();
            quotesQuery.refetch();
          }}
        />
      )}

      <Card className="mt-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Truck className="h-[18px] w-[18px]" aria-hidden /> Quotes
        </h3>
        {quotesQuery.isLoading ? (
          <LoadingBlock />
        ) : quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quotes submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {quotes.map((q: any) => (
              <div key={q.quoteId} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {q.currency} {q.quotedAmount}
                  </p>
                  <Badge tone={toneForStatus(q.status)}>{q.status}</Badge>
                </div>
                {q.notes && <p className="mt-1 text-sm text-muted-foreground">{q.notes}</p>}
                {isRequesterSide && q.status === "SUBMITTED" && req.status === "OPEN" && (
                  <div className="mt-3 flex gap-2">
                    <Button className="w-auto px-3 py-2 text-sm" isLoading={acceptQuote.isPending} onClick={() => acceptQuote.mutate(q.quoteId)}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> Accept
                    </Button>
                    <Button variant="destructive" className="w-auto px-3 py-2 text-sm" isLoading={rejectQuote.isPending} onClick={() => rejectQuote.mutate(q.quoteId)}>
                      Reject
                    </Button>
                  </div>
                )}
                {isTransporter && q.status === "SUBMITTED" && (
                  <div className="mt-3">
                    <Button variant="ghost" className="w-auto px-3 py-2 text-sm" isLoading={withdrawQuote.isPending} onClick={() => withdrawQuote.mutate(q.quoteId)}>
                      <Undo2 className="h-4 w-4" aria-hidden /> Withdraw
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function LogisticsDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute>
      <AppShell>
        <LogisticsDetailContent id={params.id} />
      </AppShell>
    </ProtectedRoute>
  );
}
