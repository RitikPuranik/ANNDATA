"use client";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Warehouse as WarehouseIcon, Save } from "lucide-react";
import { RoleProtectedPage } from "@/components/RoleProtectedPage";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert, Label, FieldError, FieldHint } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { warehouseApi } from "@/services/warehouseApi";
import { ApiRequestError } from "@/types/api";

function Content() {
  const [warehouseId, setWarehouseId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [available, setAvailable] = React.useState("");
  const [attempted, setAttempted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const detail = useQuery({ queryKey: ["warehouse", "operator", warehouseId], queryFn: () => warehouseApi.detail(warehouseId), enabled: !!warehouseId, retry: false });

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!warehouseId.trim()) errs.warehouseId = "Enter the warehouse's public ID.";
    if (!unitId.trim()) errs.unitId = "Enter the storage unit's public ID.";
    if (!available.trim()) errs.available = "Enter the available capacity.";
    else if (Number.isNaN(Number(available)) || Number(available) < 0) errs.available = "Enter a capacity of 0 or more.";
    return errs;
  }
  const fieldErrors = attempted ? validate() : {};

  const save = useMutation({
    mutationFn: () => warehouseApi.updateCapacity(warehouseId, unitId, { availableCapacity: Number(available) }),
    onSuccess: () => detail.refetch(),
    onError: (e) =>
      setServerError(e instanceof ApiRequestError ? e.message : "Capacity update failed. Verify the IDs and your warehouse authorization."),
  });

  return (
    <div>
      <PageHeader title="Storage Operations" description="Update factual storage-unit capacity and conditions. Recommendations remain driven by the warehouse intelligence engine." />
      <Card className="mb-6">
        {serverError && <Alert variant="error" className="mb-3">{serverError}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Warehouse public ID</Label>
            <Input hasError={!!fieldErrors.warehouseId} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="Warehouse public ID" />
            <FieldError>{fieldErrors.warehouseId}</FieldError>
          </div>
          <div>
            <Label>Storage unit public ID</Label>
            <Input hasError={!!fieldErrors.unitId} value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Storage unit public ID" />
            <FieldError>{fieldErrors.unitId}</FieldError>
          </div>
          <div>
            <Label>Available capacity</Label>
            <Input type="number" min="0" hasError={!!fieldErrors.available} value={available} onChange={(e) => setAvailable(e.target.value)} placeholder="e.g. 500" />
            {fieldErrors.available ? <FieldError>{fieldErrors.available}</FieldError> : <FieldHint>A number of 0 or more.</FieldHint>}
          </div>
        </div>
        <Button
          className="mt-3 w-auto"
          isLoading={save.isPending}
          onClick={() => {
            setAttempted(true);
            setServerError(null);
            if (Object.keys(validate()).length > 0) return;
            save.mutate();
          }}
        >
          <Save className="h-4 w-4" /> Update capacity
        </Button>
      </Card>
      <Card>
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
            <WarehouseIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="section-title">Warehouse detail</h2>
            <p className="text-sm text-muted-foreground">Enter a warehouse public ID to inspect its current state.</p>
          </div>
        </div>
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : detail.isError ? (
          <p className="text-sm text-muted-foreground">No warehouse could be loaded for that ID.</p>
        ) : (
          <pre className="max-h-[520px] overflow-auto rounded-2xl bg-[#242424] p-5 text-xs leading-5 text-[#f8f4e9]">{JSON.stringify(detail.data, null, 2)}</pre>
        )}
      </Card>
    </div>
  );
}

export default function WarehousePage() {
  return (
    <RoleProtectedPage role="WAREHOUSE_OPERATOR">
      <Content />
    </RoleProtectedPage>
  );
}
