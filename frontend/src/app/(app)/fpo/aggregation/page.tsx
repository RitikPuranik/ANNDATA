"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Plus } from "lucide-react";
import { RoleProtectedPage } from "@/components/RoleProtectedPage";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert, Label, FieldError, FieldHint } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/StateBlocks";
import { useSelectedFpo } from "@/hooks/useSelectedFpo";
import { FpoPicker } from "@/components/fpo/FpoPicker";
import { useCropsQuery } from "@/hooks/useReferenceData";
import { ApiRequestError } from "@/types/api";
import { fpoApi } from "@/services/fpoAdminApi";

function Content({ fpoId }: { fpoId: string }) {
  const crops = useCropsQuery();
  const qc = useQueryClient();
  const agg = useQuery({ queryKey: ["fpo", "aggregation", fpoId], queryFn: () => fpoApi.cropAggregation(fpoId) });
  const analytics = useQuery({ queryKey: ["fpo", "analytics", fpoId], queryFn: () => fpoApi.analyticsOverview(fpoId) });
  const groups = useQuery({ queryKey: ["fpo", "groups", fpoId], queryFn: () => fpoApi.listAggregationGroups(fpoId) });

  const [cropId, setCropId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [date, setDate] = React.useState("");
  const [attempted, setAttempted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!cropId) errs.cropId = "Please select which crop this target is for.";
    if (!qty.trim()) errs.qty = "Enter the target quantity you're aiming to collect.";
    else if (Number.isNaN(Number(qty)) || Number(qty) <= 0) errs.qty = "Enter a quantity greater than 0.";
    if (date && new Date(date) < new Date(new Date().toDateString())) {
      errs.date = "Pick a target date that's today or in the future.";
    }
    return errs;
  }
  const fieldErrors = attempted ? validate() : {};

  const create = useMutation({
    mutationFn: () =>
      fpoApi.createAggregationGroup(fpoId, {
        cropId,
        targetQuantity: qty ? Number(qty) : undefined,
        unit: "QTL",
        targetDate: date || undefined,
      }),
    onSuccess: () => {
      setQty("");
      setDate("");
      setAttempted(false);
      qc.invalidateQueries({ queryKey: ["fpo", "groups", fpoId] });
    },
    onError: (e) =>
      setServerError(e instanceof ApiRequestError ? e.message : "We couldn't reach the server. Please check your connection and try again."),
  });

  React.useEffect(() => {
    if (crops.data?.length && !cropId) setCropId(crops.data[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crops.data, cropId]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <h2 className="font-semibold">Crop aggregation</h2>
          </div>
          {agg.isLoading ? (
            <LoadingBlock />
          ) : (
            <pre className="max-h-72 overflow-auto rounded-2xl bg-[#242424] p-4 text-xs text-[#f8f4e9]">{JSON.stringify(agg.data, null, 2)}</pre>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Analytics overview</h2>
          {analytics.isLoading ? (
            <LoadingBlock />
          ) : (
            <pre className="max-h-72 overflow-auto rounded-2xl bg-secondary p-4 text-xs">{JSON.stringify(analytics.data, null, 2)}</pre>
          )}
        </Card>
      </div>
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5" />
          <h2 className="font-semibold">Create aggregation target</h2>
        </div>
        {serverError && <Alert variant="error" className="mb-3">{serverError}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Crop</Label>
            <Select hasError={!!fieldErrors.cropId} value={cropId} onChange={(e) => setCropId(e.target.value)}>
              {(crops.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <FieldError>{fieldErrors.cropId}</FieldError>
          </div>
          <div>
            <Label>Target quantity (QTL)</Label>
            <Input type="number" min="0" placeholder="e.g. 500" hasError={!!fieldErrors.qty} value={qty} onChange={(e) => setQty(e.target.value)} />
            {fieldErrors.qty ? <FieldError>{fieldErrors.qty}</FieldError> : <FieldHint>A number greater than 0.</FieldHint>}
          </div>
          <div>
            <Label>Target date (optional)</Label>
            <Input type="date" hasError={!!fieldErrors.date} value={date} onChange={(e) => setDate(e.target.value)} />
            <FieldError>{fieldErrors.date}</FieldError>
          </div>
        </div>
        <Button
          className="mt-3 w-auto"
          isLoading={create.isPending}
          onClick={() => {
            setAttempted(true);
            setServerError(null);
            if (Object.keys(validate()).length > 0) return;
            create.mutate();
          }}
        >
          Create target
        </Button>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Aggregation targets</h2>
        {groups.isLoading ? (
          <LoadingBlock />
        ) : (
          <pre className="max-h-80 overflow-auto rounded-2xl bg-secondary p-4 text-xs">{JSON.stringify(groups.data, null, 2)}</pre>
        )}
      </Card>
    </div>
  );
}

function Page() {
  const { fpoId, setFpoId, ready } = useSelectedFpo();
  if (!ready) return null;
  return (
    <div>
      <PageHeader title="Crop Aggregation" description="Combine member supply estimates into visible targets and operational analytics." />
      {fpoId ? <Content fpoId={fpoId} /> : <FpoPicker onSelect={setFpoId} />}
    </div>
  );
}

export default function FpoAggregationPage() {
  return (
    <RoleProtectedPage role="FPO_ADMIN">
      <Page />
    </RoleProtectedPage>
  );
}
