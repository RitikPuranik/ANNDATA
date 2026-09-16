import {
  CANCELLABLE_FROM_STATUSES,
  LOCATION_UPDATABLE_STATUSES,
  TERMINAL_SHIPMENT_STATUSES,
  canTransitionShipment,
  isTerminalShipmentStatus,
} from "../../src/modules/shipments/shipment-state-machine";

describe("shipment state machine", () => {
  it("allows the full happy-path lifecycle", () => {
    expect(canTransitionShipment("CREATED", "CONFIRMED")).toBe(true);
    expect(canTransitionShipment("CONFIRMED", "ASSIGNED")).toBe(true);
    expect(canTransitionShipment("ASSIGNED", "READY_FOR_PICKUP")).toBe(true);
    expect(canTransitionShipment("READY_FOR_PICKUP", "PICKED_UP")).toBe(true);
    expect(canTransitionShipment("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransitionShipment("IN_TRANSIT", "ARRIVED")).toBe(true);
    expect(canTransitionShipment("ARRIVED", "DELIVERED")).toBe(true);
  });

  it("allows skipping ASSIGNED when no driver was ever attached", () => {
    expect(canTransitionShipment("CONFIRMED", "READY_FOR_PICKUP")).toBe(true);
  });

  it("allows delivering directly from IN_TRANSIT without a separate ARRIVED step", () => {
    expect(canTransitionShipment("IN_TRANSIT", "DELIVERED")).toBe(true);
  });

  it("allows cancellation only before pickup", () => {
    expect(canTransitionShipment("CREATED", "CANCELLED")).toBe(true);
    expect(canTransitionShipment("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransitionShipment("ASSIGNED", "CANCELLED")).toBe(true);
    expect(canTransitionShipment("READY_FOR_PICKUP", "CANCELLED")).toBe(true);
    expect(canTransitionShipment("PICKED_UP", "CANCELLED")).toBe(false);
    expect(canTransitionShipment("IN_TRANSIT", "CANCELLED")).toBe(false);
    expect(canTransitionShipment("ARRIVED", "CANCELLED")).toBe(false);
  });

  it("never allows a transition out of a terminal state (e.g. DELIVERED -> IN_TRANSIT must fail)", () => {
    for (const terminal of TERMINAL_SHIPMENT_STATUSES) {
      expect(isTerminalShipmentStatus(terminal)).toBe(true);
      expect(canTransitionShipment(terminal, "IN_TRANSIT")).toBe(false);
      expect(canTransitionShipment(terminal, "CONFIRMED")).toBe(false);
      expect(canTransitionShipment(terminal, "DELIVERED")).toBe(false);
      expect(canTransitionShipment(terminal, "CANCELLED")).toBe(false);
    }
  });

  it("PICKED_UP can only ever move forward to IN_TRANSIT, never back or sideways", () => {
    expect(canTransitionShipment("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransitionShipment("PICKED_UP", "READY_FOR_PICKUP")).toBe(false);
    expect(canTransitionShipment("PICKED_UP", "DELIVERED")).toBe(false);
  });

  it("CANCELLABLE_FROM_STATUSES matches exactly the pre-pickup statuses", () => {
    expect([...CANCELLABLE_FROM_STATUSES].sort()).toEqual(
      ["ASSIGNED", "CONFIRMED", "CREATED", "READY_FOR_PICKUP"].sort(),
    );
  });

  it("LOCATION_UPDATABLE_STATUSES matches exactly the active-trip statuses", () => {
    expect([...LOCATION_UPDATABLE_STATUSES].sort()).toEqual(["ARRIVED", "IN_TRANSIT", "PICKED_UP"].sort());
  });
});
