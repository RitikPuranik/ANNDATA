"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Label, FieldError, FieldHint, Alert } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { disputeApi, DisputeCategory, DisputeType } from "@/services/disputeApi";
import { ApiRequestError } from "@/types/api";

const DISPUTE_TYPES: DisputeType[] = [
  "QUALITY_DISPUTE",
  "QUANTITY_DISPUTE",
  "PRICE_DISPUTE",
  "PAYMENT_DISPUTE",
  "DELIVERY_DISPUTE",
  "LOGISTICS_DISPUTE",
  "DAMAGE_DISPUTE",
  "REJECTION_DISPUTE",
  "DELAY_DISPUTE",
  "OFFER_DISPUTE",
  "WEIGHT_DISPUTE",
  "GRIEVANCE",
  "OTHER",
];

/**
 * Module 21 frontend — raise a dispute (or a general grievance). A
 * TRANSACTION-category dispute needs at least one reference id (lot,
 * trade offer, shipment, delivery or payment obligation) — the backend
 * enforces this server-side regardless of what's sent here (Step 8), so
 * this form just narrows the fields shown to keep that easy to satisfy.
 * Reference ids can be pre-filled via query params, e.g.
 * /disputes/new?shipmentId=... from a shipment's own detail page.
 */
function NewDisputeContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [category, setCategory] = React.useState<DisputeCategory>(
    params.get("shipmentId") || params.get("deliveryId") || params.get("tradeOfferId") || params.get("lotId") || params.get("paymentObligationId")
      ? "TRANSACTION"
      : "GRIEVANCE",
  );
  const [type, setType] = React.useState<DisputeType>("OTHER");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [requestedResolution, setRequestedResolution] = React.useState("");
  const [lotId, setLotId] = React.useState(params.get("lotId") ?? "");
  const [tradeOfferId, setTradeOfferId] = React.useState(params.get("tradeOfferId") ?? "");
  const [shipmentId, setShipmentId] = React.useState(params.get("shipmentId") ?? "");
  const [deliveryId, setDeliveryId] = React.useState(params.get("deliveryId") ?? "");
  const [paymentObligationId, setPaymentObligationId] = React.useState(params.get("paymentObligationId") ?? "");
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [attempted, setAttempted] = React.useState(false);

  const hasReference = !!(lotId || tradeOfferId || shipmentId || deliveryId || paymentObligationId);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (title.trim().length < 3) errs.title = "Give it a short, clear title (at least 3 characters).";
    if (description.trim().length < 10) errs.description = "Describe what happened in at least 10 characters.";
    if (category === "TRANSACTION" && !hasReference) {
      errs.reference = "A transaction dispute needs to reference the lot, offer, shipment, delivery or payment it's about.";
    }
    return errs;
  }

  const fieldErrors = attempted ? validate() : {};

  const create = useMutation({
    mutationFn: () =>
      disputeApi.create({
        type,
        category,
        title: title.trim(),
        description: description.trim(),
        requestedResolution: requestedResolution.trim() || undefined,
        lotId: lotId || undefined,
        tradeOfferId: tradeOfferId || undefined,
        shipmentId: shipmentId || undefined,
        deliveryId: deliveryId || undefined,
        paymentObligationId: paymentObligationId || undefined,
      }),
    onSuccess: (d) => router.push(`/disputes/${d.disputeId}`),
    onError: (e) => setServerError(e instanceof ApiRequestError ? e.message : "Couldn't raise this dispute. Please try again."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(validate()).length > 0) return;
    setServerError(null);
    create.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Raise a dispute or grievance"
        breadcrumb={
          <a href="/disputes" className="hover:underline">
            ← Back to disputes
          </a>
        }
      />

      <Card>
        {serverError && <Alert variant="error" className="mb-4">{serverError}</Alert>}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <Label>What is this about?</Label>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                onClick={() => setCategory("TRANSACTION")}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  category === "TRANSACTION" ? "border-primary bg-primary/10 text-primary" : "border-input bg-card text-muted-foreground"
                }`}
              >
                A specific transaction
              </button>
              <button
                type="button"
                onClick={() => setCategory("GRIEVANCE")}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  category === "GRIEVANCE" ? "border-primary bg-primary/10 text-primary" : "border-input bg-card text-muted-foreground"
                }`}
              >
                A general grievance
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" value={type} onChange={(e) => setType(e.target.value as DisputeType)}>
              {DISPUTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>

          {category === "TRANSACTION" && (
            <div>
              <Label>Which transaction is this about?</Label>
              <FieldHint>Fill in whichever one applies — a lot, trade offer, shipment, delivery or payment.</FieldHint>
              <div className="mt-1.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Input placeholder="Lot ID" value={lotId} onChange={(e) => setLotId(e.target.value)} />
                <Input placeholder="Trade offer ID" value={tradeOfferId} onChange={(e) => setTradeOfferId(e.target.value)} />
                <Input placeholder="Shipment ID" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} />
                <Input placeholder="Delivery ID" value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} />
                <Input placeholder="Payment ID" value={paymentObligationId} onChange={(e) => setPaymentObligationId(e.target.value)} />
              </div>
              <FieldError>{fieldErrors.reference}</FieldError>
            </div>
          )}

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder='A short summary, e.g. "Delivered quantity short by 40kg"' value={title} onChange={(e) => setTitle(e.target.value)} hasError={!!fieldErrors.title} />
            <FieldError>{fieldErrors.title}</FieldError>
          </div>

          <div>
            <Label htmlFor="description">What happened?</Label>
            <textarea
              id="description"
              rows={5}
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[15px] outline-none ring-ring focus:ring-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <FieldError>{fieldErrors.description}</FieldError>
          </div>

          <div>
            <Label htmlFor="requestedResolution">What outcome are you hoping for? (optional)</Label>
            <textarea
              id="requestedResolution"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[15px] outline-none ring-ring focus:ring-2"
              value={requestedResolution}
              onChange={(e) => setRequestedResolution(e.target.value)}
            />
          </div>

          <Button type="submit" isLoading={create.isPending}>
            Submit
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function NewDisputePage() {
  return (
    <ProtectedRoute>
      <React.Suspense fallback={null}>
        <NewDisputeContent />
      </React.Suspense>
    </ProtectedRoute>
  );
}
