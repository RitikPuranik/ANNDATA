"use client";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { RoleProtectedPage } from "@/components/RoleProtectedPage";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert, Label, FieldError, FieldHint } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/StateBlocks";
import { lotApi } from "@/services/lotApi";
import { netRealizationApi } from "@/services/netRealizationApi";
import { ApiRequestError } from "@/types/api";

function Content() {
  const lots = useQuery({ queryKey: ["lots", "realization"], queryFn: () => lotApi.listMine() });
  const [id, setId] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [attempted, setAttempted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!id) errs.id = "Please select which lot to calculate for.";
    if (price.trim() && (Number.isNaN(Number(price)) || Number(price) <= 0)) {
      errs.price = "Enter a sale price greater than 0, or leave this blank.";
    }
    if (qty.trim() && (Number.isNaN(Number(qty)) || Number(qty) <= 0)) {
      errs.qty = "Enter a sale quantity greater than 0, or leave this blank.";
    }
    return errs;
  }
  const fieldErrors = attempted ? validate() : {};

  const calc = useMutation({
    mutationFn: () =>
      netRealizationApi.calculate(id, {
        salePricePerUnit: price ? Number(price) : undefined,
        salePriceUnit: "KG",
        saleQuantity: qty ? Number(qty) : undefined,
        saleQuantityUnit: "KG",
      }),
    onError: (e) =>
      setServerError(e instanceof ApiRequestError ? e.message : "The calculation couldn't be completed. Please check your connection and try again."),
  });
  const hist = useQuery({ queryKey: ["realization", "history", id], queryFn: () => netRealizationApi.listForLot(id), enabled: !!id });

  return (
    <div>
      <PageHeader title="Net Realization" description="See what remains after known costs and deductions. Missing inputs remain explicitly unavailable." />
      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label>Lot</Label>
            <Select hasError={!!fieldErrors.id} value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Select a lot</option>
              {(lots.data ?? []).map((l) => (
                <option key={l.publicId ?? l.id} value={l.publicId ?? l.id}>
                  {l.crop.name} · {l.quantity.value} {l.quantity.unit}
                </option>
              ))}
            </Select>
            <FieldError>{fieldErrors.id}</FieldError>
          </div>
          <div>
            <Label>What-if sale price / KG</Label>
            <Input type="number" min="0" hasError={!!fieldErrors.price} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" />
            {fieldErrors.price ? <FieldError>{fieldErrors.price}</FieldError> : <FieldHint>Leave blank to use the lot&apos;s actual sale price.</FieldHint>}
          </div>
          <div>
            <Label>Sale quantity / KG</Label>
            <Input type="number" min="0" hasError={!!fieldErrors.qty} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Optional" />
            {fieldErrors.qty ? <FieldError>{fieldErrors.qty}</FieldError> : <FieldHint>Leave blank to use the lot&apos;s full quantity.</FieldHint>}
          </div>
        </div>
        <Button
          className="mt-4 w-auto"
          isLoading={calc.isPending}
          onClick={() => {
            setAttempted(true);
            setServerError(null);
            if (Object.keys(validate()).length > 0) return;
            calc.mutate();
          }}
        >
          <ReceiptText className="h-4 w-4" /> Calculate
        </Button>
        {serverError && <Alert variant="error" className="mt-4">{serverError}</Alert>}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 section-title">Calculation</h2>
          {calc.isPending ? (
            <LoadingBlock />
          ) : calc.data ? (
            <pre className="max-h-[520px] overflow-auto rounded-2xl bg-[#242424] p-5 text-xs leading-5 text-[#f8f4e9]">{JSON.stringify(calc.data, null, 2)}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">Enter a lot and optional what-if values.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 section-title">Saved calculations</h2>
          {hist.isLoading ? (
            <LoadingBlock />
          ) : hist.isError ? (
            <p className="text-sm text-muted-foreground">No saved calculations.</p>
          ) : (
            <pre className="max-h-[520px] overflow-auto rounded-2xl bg-secondary p-4 text-xs">{JSON.stringify(hist.data, null, 2)}</pre>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function NetRealizationPage() {
  return (
    <RoleProtectedPage role="FARMER">
      <Content />
    </RoleProtectedPage>
  );
}
