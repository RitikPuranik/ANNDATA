import { PrismaClient } from "@prisma/client";
import { NotFoundError, ShipmentDomainError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { FpoAuthorizationService } from "../fpo/fpo.authorization";
import { ShipmentRecord } from "./shipment.types";

export interface LotOwnership {
  ownerType: "FARMER" | "FPO";
  farmerId: string | null;
  fpoId: string | null;
}

/**
 * Step 8/27 — who can see/manage a Shipment. Ownership is never re-derived
 * from the request body — every check here resolves the caller's own
 * identity first, same convention as LogisticsAuthorizationService /
 * TransporterAuthorizationService. Never trusts a providerId/farmerId/
 * buyerId supplied by the client.
 */
export class ShipmentAuthorizationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fpoAuthorization: FpoAuthorizationService,
  ) {}

  /** Step 8 — FARMER/FPO_ADMIN: shipments on their own lots. TRANSPORTER:
   * their own assigned shipments. BUYER: shipments for a lot they have an
   * ACCEPTED trade offer against. ADMIN: everything. */
  async canView(
    user: AuthenticatedUserContext,
    shipment: ShipmentRecord,
    lot: LotOwnership,
    callerFarmerProfileId: string | null,
    callerTransporterProfileId: string | null,
  ): Promise<boolean> {
    if (user.role === "ADMIN") return true;

    if (user.role === "TRANSPORTER") {
      return callerTransporterProfileId !== null && callerTransporterProfileId === shipment.transportProviderId;
    }

    if (user.role === "FARMER") {
      return (
        lot.ownerType === "FARMER" && callerFarmerProfileId !== null && lot.farmerId === callerFarmerProfileId
      );
    }

    if (user.role === "FPO_ADMIN") {
      if (lot.ownerType === "FPO" && lot.fpoId) return this.fpoAuthorization.canManageFpo(user, lot.fpoId);
      return false;
    }

    if (user.role === "BUYER") {
      return this.isAcceptedBuyerOfLot(user.id, shipment.lotId);
    }

    return false;
  }

  /** Step 8 — an ACCEPTED trade offer is the only signal that ties a
   * BUYER account to a lot in this codebase (there is no separate Order
   * model — see Module 16's own schema comment). */
  private async isAcceptedBuyerOfLot(userId: string, lotId: string): Promise<boolean> {
    const buyer = await this.prisma.buyerProfile.findUnique({ where: { userId } });
    if (!buyer) return false;
    const offer = await this.prisma.tradeOffer.findFirst({
      where: { lotId, buyerId: buyer.id, status: "ACCEPTED" },
      select: { id: true },
    });
    return offer !== null;
  }

  /** Step 8/27 — only the assigned TRANSPORTER (or ADMIN) may perform an
   * operational transition (confirm, assign vehicle/driver, pickup,
   * transit, arrive, deliver, submit GPS). */
  assertCanOperate(user: AuthenticatedUserContext, shipment: ShipmentRecord, callerTransporterProfileId: string | null): void {
    if (user.role === "ADMIN") return;
    if (user.role === "TRANSPORTER" && callerTransporterProfileId === shipment.transportProviderId) return;
    throw new ShipmentDomainError(
      "You do not have permission to manage this shipment.",
      "UNAUTHORIZED_SHIPMENT_ACCESS",
      403,
    );
  }

  /** Step 8 — the requester side (FARMER/FPO_ADMIN who owns the lot) or
   * the assigned TRANSPORTER or ADMIN may cancel; a BUYER never can. */
  async assertCanCancel(
    user: AuthenticatedUserContext,
    shipment: ShipmentRecord,
    lot: LotOwnership,
    callerFarmerProfileId: string | null,
    callerTransporterProfileId: string | null,
  ): Promise<void> {
    if (user.role === "ADMIN") return;
    if (user.role === "TRANSPORTER" && callerTransporterProfileId === shipment.transportProviderId) return;
    if (user.role === "FARMER" && lot.ownerType === "FARMER" && callerFarmerProfileId === lot.farmerId) return;
    if (user.role === "FPO_ADMIN" && lot.ownerType === "FPO" && lot.fpoId && (await this.fpoAuthorization.canManageFpo(user, lot.fpoId))) {
      return;
    }
    throw new ShipmentDomainError(
      "You do not have permission to cancel this shipment.",
      "UNAUTHORIZED_SHIPMENT_ACCESS",
      403,
    );
  }

  requireFound<T>(value: T | null, message: string): T {
    if (value === null) throw new NotFoundError(message);
    return value;
  }
}
