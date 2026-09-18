"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Label, FieldError, Alert } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/StateBlocks";
import { FpoPicker } from "@/components/fpo/FpoPicker";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedFpo } from "@/hooks/useSelectedFpo";
import { lotApi } from "@/services/lotApi";
import { logisticsRequestApi } from "@/services/logisticsApi";
import { ApiRequestError } from "@/types/api";

function NewLogisticsRequestContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { fpoId, setFpoId, ready } = useSelectedFpo();

  const myLotsQuery = useQuery({
    queryKey: ["lots", "mine", "ALL"],
    queryFn: () => lotApi.listMine(),
    enabled: user?.role === "FARMER",
  });
  const fpoLotsQuery = useQuery({
    queryKey: ["fpo", "lots", fpoId],
    queryFn: () => lotApi.listForFpo(fpoId!),
    enabled: user?.role === "FPO_ADMIN" && !!fpoId,
  });

  const lots = user?.role === "FARMER" ? myLotsQuery.data ?? [] : fpoLotsQuery.data ?? [];

  const [lotId, setLotId] = React.useState("");
  const [manualLotId, setManualLotId] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [unit, setUnit] = React.useState<"KG" | "QTL" | "TONNE">("QTL");
  const [destDistrict, setDestDistrict] = React.useState("");
  const [destState, setDestState] = React.useState("");
  const [destPincode, setDestPincode] = React.useState("");
  const [pickupAt, setPickupAt] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [refrigerated, setRefrigerated] = React.useState(false);
  const [instructions, setInstructions] = React.useState("");
  const [serverError, setServerError] = React.useState<string | null>(null);

  const effectiveLotId = user?.role === "ADMIN" ? manualLotId : lotId;

  const create = useMutation({
    mutationFn: () =>
      logisticsRequestApi.create({
        lotId: effectiveLotId,
        requiredQuantityValue: Number(quantity),
        requiredQuantityUnit: unit,
        destination: { district: destDistrict, state: destState, pincode: destPincode || undefined },
        requestedPickupAt: pickupAt || undefined,
        deliveryDeadline: deadline || undefined,
        requiresRefrigeration: refrigerated || undefined,
        specialInstructions: instructions || undefined,
      }),
    onSuccess: (req) => router.push(`/logistics/${req.requestId}`),
    onError: (e) => setServerError(e instanceof ApiRequestError ? e.message : "Something went wrong."),
  });

  const canSubmit = !!effectiveLotId && !!quantity && !!destDistrict && !!destState;

  if (user?.role === "FPO_ADMIN" && !ready) return null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Raise a transport request" description="Ask transporters to quote on moving a lot to its destination." />

      {user?.role === "FPO_ADMIN" && !fpoId && (
        <div className="mb-4">
          <FpoPicker onSelect={(id) => setFpoId(id)} />
        </div>
      )}
      {user?.role === "FPO_ADMIN" && fpoId && (
        <Alert variant="info" className="mb-4">
          Raising this request for your selected FPO.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setFpoId(null)}>
            Change FPO
          </button>
        </Alert>
      )}

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          noValidate
        >
          {serverError && <Alert variant="error">{serverError}</Alert>}

          {user?.role === "ADMIN" ? (
            <div>
              <Label htmlFor="lotId">Lot ID</Label>
              <Input id="lotId" placeholder="Lot public ID" value={manualLotId} onChange={(e) => setManualLotId(e.target.value)} />
            </div>
          ) : (
            <div>
              <Label htmlFor="lotId">Lot</Label>
              {(user?.role === "FARMER" && myLotsQuery.isLoading) || (user?.role === "FPO_ADMIN" && fpoId && fpoLotsQuery.isLoading) ? (
                <LoadingBlock />
              ) : (
                <Select id="lotId" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                  <option value="">Select a lot</option>
                  {lots.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.crop?.name}
                      {l.variety ? ` · ${l.variety}` : ""} — {l.quantity} {l.unit}
                    </option>
                  ))}
                </Select>
              )}
              {user?.role === "FPO_ADMIN" && !fpoId && <p className="mt-1 text-xs text-muted-foreground">Pick an FPO above first.</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity to move</Label>
              <Input id="quantity" type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Select id="unit" value={unit} onChange={(e) => setUnit(e.target.value as any)}>
                <option value="KG">Kilograms (KG)</option>
                <option value="QTL">Quintal (QTL)</option>
                <option value="TONNE">Tonne</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="destDistrict">Destination district</Label>
              <Input id="destDistrict" value={destDistrict} onChange={(e) => setDestDistrict(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="destState">Destination state</Label>
              <Input id="destState" value={destState} onChange={(e) => setDestState(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="destPincode">Destination pincode (optional)</Label>
            <Input id="destPincode" value={destPincode} onChange={(e) => setDestPincode(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pickupAt">Requested pickup (optional)</Label>
              <Input id="pickupAt" type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="deadline">Delivery deadline (optional)</Label>
              <Input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={refrigerated} onChange={(e) => setRefrigerated(e.target.checked)} />
            Requires refrigerated transport
          </label>

          <div>
            <Label htmlFor="instructions">Special instructions (optional)</Label>
            <Input id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>

          <Button type="submit" disabled={!canSubmit} isLoading={create.isPending}>
            Raise request
          </Button>
          <FieldError>{!canSubmit && quantity ? "Fill in the lot, quantity and destination to continue." : undefined}</FieldError>
        </form>
      </Card>
    </div>
  );
}

export default function NewLogisticsRequestPage() {
  return (
    <ProtectedRoute>
      <NewLogisticsRequestContent />
    </ProtectedRoute>
  );
}
