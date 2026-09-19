"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, MapPin } from "lucide-react";
import { RoleProtectedPage } from "@/components/RoleProtectedPage";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert, Label, FieldError, FieldHint } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/StateBlocks";
import { transporterApi, vehicleApi } from "@/services/transporterApi";
import { ApiRequestError } from "@/types/api";

function Content() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["transporter", "profile"], queryFn: () => transporterApi.me(), retry: false });
  const vehicles = useQuery({ queryKey: ["transporter", "vehicles"], queryFn: () => vehicleApi.list() });
  const areas = useQuery({ queryKey: ["transporter", "areas"], queryFn: () => transporterApi.serviceAreas(), retry: false });

  const [reg, setReg] = React.useState("");
  const [type, setType] = React.useState("PICKUP");
  const [cap, setCap] = React.useState("");
  const [vehicleAttempted, setVehicleAttempted] = React.useState(false);
  const [vehicleError, setVehicleError] = React.useState<string | null>(null);

  const [area, setArea] = React.useState("");
  const [areaAttempted, setAreaAttempted] = React.useState(false);
  const [areaError, setAreaError] = React.useState<string | null>(null);

  function validateVehicle(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!reg.trim()) errs.reg = "Enter the vehicle's registration number.";
    if (!cap.trim()) errs.cap = "Enter the vehicle's carrying capacity.";
    else if (Number.isNaN(Number(cap)) || Number(cap) <= 0) errs.cap = "Enter a capacity greater than 0.";
    return errs;
  }
  const vehicleFieldErrors = vehicleAttempted ? validateVehicle() : {};

  function validateArea(): string | null {
    const parts = area.split(",").map((p) => p.trim());
    if (!area.trim()) return "Enter the state and district you cover.";
    if (parts.length < 2 || !parts[0] || !parts[1]) return "Use the format \"State, District\", e.g. Maharashtra, Pune.";
    return null;
  }
  const areaFieldError = areaAttempted ? validateArea() : null;

  const create = useMutation({
    mutationFn: () => vehicleApi.register({ registrationNumber: reg, vehicleType: type, capacityValue: Number(cap), capacityUnit: "KG" }),
    onSuccess: () => {
      setReg("");
      setCap("");
      setVehicleAttempted(false);
      qc.invalidateQueries({ queryKey: ["transporter", "vehicles"] });
    },
    onError: (e) =>
      setVehicleError(e instanceof ApiRequestError ? e.message : "Vehicle registration failed. Please check your connection and try again."),
  });

  const addArea = useMutation({
    mutationFn: () => transporterApi.addServiceArea({ areaType: "DISTRICT", state: area.split(",")[0]?.trim(), district: area.split(",")[1]?.trim() }),
    onSuccess: () => {
      setArea("");
      setAreaAttempted(false);
      qc.invalidateQueries({ queryKey: ["transporter", "areas"] });
    },
    onError: (e) => setAreaError(e instanceof ApiRequestError ? e.message : "Couldn't add this service area. Please check your connection and try again."),
  });

  return (
    <div>
      <PageHeader title="Transport Network" description="Manage your transporter profile, vehicles, declared service areas and owner-controlled availability." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20">
              <Truck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Transporter profile</h2>
              <p className="text-sm text-muted-foreground">Verification is controlled by the platform admin.</p>
            </div>
          </div>
          {profile.isLoading ? (
            <LoadingBlock />
          ) : profile.isError ? (
            <Alert variant="info" className="mt-4">No transporter profile yet. Create it from the profile form below.</Alert>
          ) : (
            <pre className="mt-4 overflow-auto rounded-2xl bg-secondary p-4 text-xs">{JSON.stringify(profile.data, null, 2)}</pre>
          )}
          <Button className="mt-4 w-auto" onClick={() => profile.refetch()}>
            Refresh profile
          </Button>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Service areas</h2>
          {areas.isLoading ? (
            <LoadingBlock />
          ) : (
            <pre className="max-h-44 overflow-auto rounded-xl bg-secondary p-3 text-xs">{JSON.stringify(areas.data, null, 2)}</pre>
          )}
          {areaError && <Alert variant="error" className="mt-3">{areaError}</Alert>}
          <div className="mt-3">
            <Input hasError={!!areaFieldError} value={area} onChange={(e) => setArea(e.target.value)} placeholder="State, District" />
            {areaFieldError ? <FieldError>{areaFieldError}</FieldError> : <FieldHint>e.g. Maharashtra, Pune.</FieldHint>}
          </div>
          <Button
            className="mt-3"
            isLoading={addArea.isPending}
            onClick={() => {
              setAreaAttempted(true);
              setAreaError(null);
              if (validateArea()) return;
              addArea.mutate();
            }}
          >
            <MapPin className="h-4 w-4" /> Add district
          </Button>
        </Card>
      </div>
      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Vehicle registry</h2>
            <p className="text-sm text-muted-foreground">Register vehicles and keep availability accurate.</p>
          </div>
          <Plus className="h-5 w-5" />
        </div>
        {vehicleError && <Alert variant="error" className="mb-3">{vehicleError}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Registration number</Label>
            <Input hasError={!!vehicleFieldErrors.reg} value={reg} onChange={(e) => setReg(e.target.value)} placeholder="e.g. MH12AB1234" />
            <FieldError>{vehicleFieldErrors.reg}</FieldError>
          </div>
          <div>
            <Label>Vehicle type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option>MINI_TRUCK</option>
              <option>PICKUP</option>
              <option>LIGHT_TRUCK</option>
              <option>MEDIUM_TRUCK</option>
              <option>HEAVY_TRUCK</option>
              <option>TRACTOR_TROLLEY</option>
              <option>REFRIGERATED_TRUCK</option>
              <option>OTHER</option>
            </Select>
          </div>
          <div>
            <Label>Capacity (KG)</Label>
            <Input type="number" min="1" placeholder="e.g. 2000" hasError={!!vehicleFieldErrors.cap} value={cap} onChange={(e) => setCap(e.target.value)} />
            {vehicleFieldErrors.cap ? <FieldError>{vehicleFieldErrors.cap}</FieldError> : <FieldHint>A number greater than 0.</FieldHint>}
          </div>
        </div>
        <Button
          className="mt-3 w-auto"
          isLoading={create.isPending}
          onClick={() => {
            setVehicleAttempted(true);
            setVehicleError(null);
            if (Object.keys(validateVehicle()).length > 0) return;
            create.mutate();
          }}
        >
          Register vehicle
        </Button>
        <div className="mt-5">
          {vehicles.isLoading ? (
            <LoadingBlock />
          ) : (
            <pre className="max-h-80 overflow-auto rounded-2xl bg-[#242424] p-4 text-xs text-[#f8f4e9]">{JSON.stringify(vehicles.data, null, 2)}</pre>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function TransporterPage() {
  return (
    <RoleProtectedPage role="TRANSPORTER">
      <Content />
    </RoleProtectedPage>
  );
}
