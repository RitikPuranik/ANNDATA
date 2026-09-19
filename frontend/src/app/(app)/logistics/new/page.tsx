"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Label, FieldError, FieldHint, Alert, ErrorSummary } from "@/components/ui/primitives";
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
  // Errors only show once the person has tried to submit at least once —
  // showing "required" on every empty field before they've even started
  // typing is more noise than help.
  const [attempted, setAttempted] = React.useState(false);

  const effectiveLotId = user?.role === "ADMIN" ? manualLotId : lotId;

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!effectiveLotId) {
      errs.lotId = user?.role === "ADMIN" ? "Enter the lot's public ID." : "Please select which lot you want to move.";
    }
    if (!quantity.trim()) {
      errs.quantity = "Enter how much you want to move.";
    } else if (Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
      errs.quantity = "Enter a quantity greater than 0.";
    }
    if (!destDistrict.trim()) errs.destDistrict = "Enter the destination district.";
    if (!destState.trim()) errs.destState = "Enter the destination state.";
    if (destPincode.trim() && !/^\d{6}$/.test(destPincode.trim())) {
      errs.destPincode = "PIN codes are exactly 6 digits, e.g. 400001.";
    }
    if (pickupAt && deadline && new Date(pickupAt) > new Date(deadline)) {
      errs.deadline = "The delivery deadline can't be before the requested pickup time.";
    }
    return errs;
  }

  const fieldErrors = attempted ? validate() : {};

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
    onError: (e) => setServerError(e instanceof ApiRequestError ? e.message : "We couldn't reach the server. Please check your connection and try again."),
  });

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
            setAttempted(true);
            if (Object.keys(validate()).length > 0) return;
            create.mutate();
          }}
          noValidate
        >
          {attempted && Object.keys(fieldErrors).length > 1 && (
            <ErrorSummary title="Please fix the following before continuing:" items={Object.values(fieldErrors)} />
          )}
          {serverError && <Alert variant="error">{serverError}</Alert>}

          {user?.role === "ADMIN" ? (
            <div>
              <Label htmlFor="lotId">Lot ID</Label>
              <Input
                id="lotId"
                placeholder="Lot public ID"
                hasError={!!fieldErrors.lotId}
                value={manualLotId}
                onChange={(e) => setManualLotId(e.target.value)}
              />
              <FieldError>{fieldErrors.lotId}</FieldError>
            </div>
          ) : (
            <div>
              <Label htmlFor="lotId">Lot</Label>
              {(user?.role === "FARMER" && myLotsQuery.isLoading) || (user?.role === "FPO_ADMIN" && fpoId && fpoLotsQuery.isLoading) ? (
                <LoadingBlock />
              ) : (
                <Select id="lotId" hasError={!!fieldErrors.lotId} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                  <option value="">Select a lot</option>
                  {lots.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.crop?.name}
                      {l.variety ? ` · ${l.variety}` : ""} — {l.quantity.value} {l.quantity.unit}
                    </option>
                  ))}
                </Select>
              )}
              {user?.role === "FPO_ADMIN" && !fpoId ? (
                <FieldHint>Pick an FPO above first.</FieldHint>
              ) : (
                <FieldError>{fieldErrors.lotId}</FieldError>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity to move</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                placeholder="e.g. 50"
                hasError={!!fieldErrors.quantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              {fieldErrors.quantity ? (
                <FieldError>{fieldErrors.quantity}</FieldError>
              ) : (
                <FieldHint>A number greater than 0.</FieldHint>
              )}
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
              <Input id="destDistrict" hasError={!!fieldErrors.destDistrict} value={destDistrict} onChange={(e) => setDestDistrict(e.target.value)} />
              <FieldError>{fieldErrors.destDistrict}</FieldError>
            </div>
            <div>
              <Label htmlFor="destState">Destination state</Label>
              <Input id="destState" hasError={!!fieldErrors.destState} value={destState} onChange={(e) => setDestState(e.target.value)} />
              <FieldError>{fieldErrors.destState}</FieldError>
            </div>
          </div>

          <div>
            <Label htmlFor="destPincode">Destination pincode (optional)</Label>
            <Input id="destPincode" inputMode="numeric" maxLength={6} hasError={!!fieldErrors.destPincode} value={destPincode} onChange={(e) => setDestPincode(e.target.value)} />
            {fieldErrors.destPincode ? (
              <FieldError>{fieldErrors.destPincode}</FieldError>
            ) : (
              <FieldHint>6 digits, e.g. 400001.</FieldHint>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pickupAt">Requested pickup (optional)</Label>
              <Input id="pickupAt" type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="deadline">Delivery deadline (optional)</Label>
              <Input id="deadline" type="datetime-local" hasError={!!fieldErrors.deadline} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <FieldError>{fieldErrors.deadline}</FieldError>
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

          <Button type="submit" isLoading={create.isPending}>
            Raise request
          </Button>
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
