"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  UserCheck,
  PackageCheck,
  Truck,
  Navigation,
  Flag,
  PackageX,
  MapPin,
  History,
  IndianRupee,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { useAuth } from "@/hooks/useAuth";
import { shipmentApi } from "@/services/shipmentApi";
import { deliveryApi } from "@/services/deliveryApi";
import { paymentsApi } from "@/services/paymentsApi";
import { ApiRequestError } from "@/types/api";

const STEPS = ["CREATED", "CONFIRMED", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "DELIVERED"];

function StatusTimeline({ status }: { status: string }) {
  if (status === "CANCELLED") return <Badge tone="destructive">CANCELLED</Badge>;
  const currentIndex = STEPS.indexOf(status === "ASSIGNED" ? "CONFIRMED" : status);
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {STEPS.map((step, i) => (
        <div
          key={step}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
            i <= currentIndex ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          {step.replace(/_/g, " ")}
        </div>
      ))}
    </div>
  );
}

/**
 * Bridges Shipment (Module 17) -> Delivery/Reconciliation (Module 18) ->
 * Payments (Module 19). Only shown once the shipment has actually been
 * delivered, since that's the earliest point a delivery record can exist.
 * Money is never moved here — this only opens the payment-status screens.
 */
function PaymentBridgeCard({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const isBuyerSide = user?.role === "BUYER" || user?.role === "ADMIN";

  const deliveryQuery = useQuery({
    queryKey: ["deliveries", "byShipment", shipmentId],
    queryFn: () => deliveryApi.findByShipment(shipmentId),
    retry: false,
  });

  const delivery = deliveryQuery.data;
  const isReconciled = delivery?.status === "RECONCILED";

  const obligationQuery = useQuery({
    queryKey: ["payments", "obligations", "byDelivery", delivery?.deliveryId],
    queryFn: () => paymentsApi.listObligations({ deliveryId: delivery!.deliveryId }),
    enabled: !!delivery && isReconciled,
    retry: false,
  });

  const createObligation = useMutation({
    mutationFn: () => paymentsApi.createObligation(delivery!.deliveryId),
    onSuccess: (o) => router.push(`/payments/${o.publicId}`),
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : "Couldn't set up the payment."),
  });

  if (deliveryQuery.isLoading || !delivery) return null;
  if (!isReconciled) {
    return (
      <Card className="mt-6">
        <h3 className="mb-1 flex items-center gap-2 section-title">
          <IndianRupee className="h-[18px] w-[18px]" aria-hidden /> Payment
        </h3>
        <p className="text-sm text-muted-foreground">
          Payment isn&rsquo;t ready to set up yet — the delivered quantity and quality still need to be checked and agreed
          by both sides first.
        </p>
      </Card>
    );
  }

  const existing = obligationQuery.data?.items?.[0];

  return (
    <Card className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 section-title">
        <IndianRupee className="h-[18px] w-[18px]" aria-hidden /> Payment
      </h3>
      {error && (
        <Alert variant="error" className="mb-3">
          {error}
        </Alert>
      )}
      {obligationQuery.isLoading ? (
        <LoadingBlock />
      ) : existing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              {existing.currency} {existing.finalPayableAmount.toLocaleString("en-IN")}
            </p>
            <p className="text-sm text-muted-foreground">
              {existing.amountDue > 0 ? `${existing.currency} ${existing.amountDue.toLocaleString("en-IN")} still due` : "Fully settled"}
            </p>
          </div>
          <Button variant="outline" className="w-auto px-4 py-2 text-sm" onClick={() => router.push(`/payments/${existing.publicId}`)}>
            View payment
          </Button>
        </div>
      ) : isBuyerSide ? (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            This delivery has been checked and agreed. Set up the payment record so both sides can track what&rsquo;s
            owed and what&rsquo;s been paid.
          </p>
          <Button className="w-auto px-4" isLoading={createObligation.isPending} onClick={() => createObligation.mutate()}>
            <IndianRupee className="h-4 w-4" aria-hidden /> Set up payment
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Waiting for the buyer to set up the payment for this delivery.</p>
      )}
    </Card>
  );
}

function ShipmentDetailContent({ id }: { id: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = React.useState<string | null>(null);

  const shipmentQuery = useQuery({ queryKey: ["shipments", id], queryFn: () => shipmentApi.get(id) });
  const locationsQuery = useQuery({ queryKey: ["shipments", id, "locations"], queryFn: () => shipmentApi.locations(id) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
  };

  const confirm = useMutation({ mutationFn: () => shipmentApi.confirm(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't confirm this shipment.") });
  const assignDriver = useMutation({ mutationFn: () => shipmentApi.assignDriver(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't assign a driver.") });
  const readyForPickup = useMutation({ mutationFn: () => shipmentApi.readyForPickup(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't mark ready for pickup.") });
  const pickup = useMutation({ mutationFn: () => shipmentApi.pickup(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't record pickup.") });
  const startTransit = useMutation({ mutationFn: () => shipmentApi.startTransit(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't start transit.") });
  const arrive = useMutation({ mutationFn: () => shipmentApi.arrive(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't mark arrival.") });
  const deliver = useMutation({ mutationFn: () => shipmentApi.deliver(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't record delivery.") });
  const cancel = useMutation({ mutationFn: () => shipmentApi.cancel(id), onSuccess: invalidate, onError: (e) => setActionError(e instanceof ApiRequestError ? e.message : "Couldn't cancel this shipment.") });

  if (shipmentQuery.isLoading) return <LoadingBlock />;
  if (shipmentQuery.isError || !shipmentQuery.data) return <ErrorBlock message="Couldn't load this shipment." onRetry={() => shipmentQuery.refetch()} />;

  const s = shipmentQuery.data;
  const isProvider = user?.role === "TRANSPORTER" || user?.role === "ADMIN";
  const canCancel =
    (user?.role === "FARMER" || user?.role === "FPO_ADMIN" || isProvider) &&
    ["CREATED", "CONFIRMED", "ASSIGNED", "READY_FOR_PICKUP"].includes(s.status);

  return (
    <div>
      <PageHeader
        title="Shipment"
        breadcrumb={
          <a href="/shipments" className="hover:underline">
            ← Back to shipments
          </a>
        }
      />

      {actionError && <Alert variant="error" className="mb-4">{actionError}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">
              {s.commodity} · {s.quantity} {s.quantityUnit}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {s.pickup?.district}, {s.pickup?.state} → {s.destination?.district}, {s.destination?.state}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Agreed amount: {s.currency} {s.agreedAmount}
            </p>
          </div>
          <Badge tone={toneForStatus(s.status)} className="text-sm">
            {s.status.replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <StatusTimeline status={s.status} />
        </div>

        {s.eta && (
          <div className="mt-4 rounded-xl bg-secondary/40 p-3 text-sm">
            <p className="font-semibold">
              ETA: {s.eta.estimatedDeliveryAt ? new Date(s.eta.estimatedDeliveryAt).toLocaleString() : "Not yet available"}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.eta.type === "INITIAL_ESTIMATE" ? "Initial estimate" : "Recalculated from live tracking"} — not guaranteed.
            </p>
          </div>
        )}

        {isProvider && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
            {s.status === "CREATED" && (
              <Button className="w-auto px-4 py-2.5 text-sm" isLoading={confirm.isPending} onClick={() => confirm.mutate()}>
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Confirm
              </Button>
            )}
            {(s.status === "CONFIRMED" || s.status === "ASSIGNED") && !s.driverId && (
              <Button variant="outline" className="w-auto px-4 py-2.5 text-sm" isLoading={assignDriver.isPending} onClick={() => assignDriver.mutate()}>
                <UserCheck className="h-4 w-4" aria-hidden /> Assign driver
              </Button>
            )}
            {(s.status === "CONFIRMED" || s.status === "ASSIGNED") && (
              <Button className="w-auto px-4 py-2.5 text-sm" isLoading={readyForPickup.isPending} onClick={() => readyForPickup.mutate()}>
                <PackageCheck className="h-4 w-4" aria-hidden /> Ready for pickup
              </Button>
            )}
            {s.status === "READY_FOR_PICKUP" && (
              <Button className="w-auto px-4 py-2.5 text-sm" isLoading={pickup.isPending} onClick={() => pickup.mutate()}>
                <Truck className="h-4 w-4" aria-hidden /> Record pickup
              </Button>
            )}
            {s.status === "PICKED_UP" && (
              <Button className="w-auto px-4 py-2.5 text-sm" isLoading={startTransit.isPending} onClick={() => startTransit.mutate()}>
                <Navigation className="h-4 w-4" aria-hidden /> Start transit
              </Button>
            )}
            {s.status === "IN_TRANSIT" && (
              <Button className="w-auto px-4 py-2.5 text-sm" isLoading={arrive.isPending} onClick={() => arrive.mutate()}>
                <Flag className="h-4 w-4" aria-hidden /> Mark arrived
              </Button>
            )}
            {(s.status === "IN_TRANSIT" || s.status === "ARRIVED") && (
              <Button className="w-auto px-4 py-2.5 text-sm" isLoading={deliver.isPending} onClick={() => deliver.mutate()}>
                <PackageCheck className="h-4 w-4" aria-hidden /> Record delivery
              </Button>
            )}
          </div>
        )}

        {canCancel && (
          <div className="mt-2 flex gap-2 pt-2">
            <Button variant="ghost" className="w-auto px-4 py-2 text-sm" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
              <PackageX className="h-4 w-4" aria-hidden /> Cancel shipment
            </Button>
          </div>
        )}
      </Card>

      {s.status === "DELIVERED" && <PaymentBridgeCard shipmentId={id} />}

      <Card className="mt-6">
        <h3 className="mb-4 flex items-center gap-2 section-title">
          <History className="h-[18px] w-[18px]" aria-hidden /> Location history
        </h3>
        {locationsQuery.isLoading ? (
          <LoadingBlock />
        ) : !locationsQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">No GPS updates recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {locationsQuery.data.map((loc: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <span>
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </span>
                <span className="text-muted-foreground">{new Date(loc.recordedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute>
      <ShipmentDetailContent id={params.id} />
    </ProtectedRoute>
  );
}
