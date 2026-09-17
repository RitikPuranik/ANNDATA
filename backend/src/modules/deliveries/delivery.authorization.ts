import { PrismaClient } from "@prisma/client";
import { AuthorizationError, NotFoundError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { FpoAuthorizationService } from "../fpo/fpo.authorization";
import { DeliveryRecord } from "./delivery.types";

export interface LotOwnership {
  ownerType: "FARMER" | "FPO";
  farmerId: string | null;
  fpoId: string | null;
}

/**
 * Step 13 — who can see/manage a Delivery. Ownership is never re-derived
 * from the request body — every check resolves the caller's own identity
 * first, same convention as ShipmentAuthorizationService.
 *
 *  FARMER / FPO_ADMIN — view delivery status/reconciliation for their own
 *  lot; never mutate a buyer's acceptance decision.
 *  BUYER — the delivery's own buyer: receive, record weighment/quality,
 *  reconcile, accept/reject/partially accept.
 *  TRANSPORTER — read-only view of a delivery for a shipment they hauled;
 *  can never alter quality/acceptance (Step 13: "cannot alter buyer's
 *  quality acceptance").
 *  ADMIN — full access, including performing the buyer's own operational
 *  steps on their behalf.
 */
export class DeliveryAuthorizationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fpoAuthorization: FpoAuthorizationService,
  ) {}

  async canView(
    user: AuthenticatedUserContext,
    delivery: DeliveryRecord,
    lot: LotOwnership,
    callerFarmerProfileId: string | null,
    callerBuyerProfileId: string | null,
    callerTransportProviderId: string | null,
  ): Promise<boolean> {
    if (user.role === "ADMIN") return true;

    if (user.role === "BUYER") {
      return callerBuyerProfileId !== null && callerBuyerProfileId === delivery.buyerId;
    }

    if (user.role === "FARMER") {
      return lot.ownerType === "FARMER" && callerFarmerProfileId !== null && lot.farmerId === callerFarmerProfileId;
    }

    if (user.role === "FPO_ADMIN") {
      if (lot.ownerType === "FPO" && lot.fpoId) return this.fpoAuthorization.canManageFpo(user, lot.fpoId);
      return false;
    }

    if (user.role === "TRANSPORTER") {
      if (callerTransportProviderId === null) return false;
      const shipment = await this.prisma.shipment.findUnique({
        where: { id: delivery.shipmentId },
        select: { transportProviderId: true },
      });
      return shipment?.transportProviderId === callerTransportProviderId;
    }

    return false;
  }

  /** Step 13 — only the delivery's own BUYER (or ADMIN) may perform an
   * operational step: receive, record weighment/quality, reconcile,
   * accept/reject/partially accept. */
  assertCanOperate(user: AuthenticatedUserContext, delivery: DeliveryRecord, callerBuyerProfileId: string | null): void {
    if (user.role === "ADMIN") return;
    if (user.role === "BUYER" && callerBuyerProfileId === delivery.buyerId) return;
    throw new AuthorizationError("You do not have permission to manage this delivery.");
  }

  requireFound<T>(value: T | null, message: string): T {
    if (value === null) throw new NotFoundError(message);
    return value;
  }
}
