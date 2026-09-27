import { AuthorizationError, NotFoundError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { DisputeRecord } from "./dispute.types";

/**
 * Module 21 — who can see/manage a Dispute (Step 21/22). Ownership is never
 * re-derived from the request body — every check resolves the caller's own
 * identity first, same convention as DeliveryAuthorizationService.
 *
 *  FARMER — disputes they raised themselves, or disputes where they are the
 *  farmer party (farmerId matches their own profile).
 *  BUYER — disputes they raised, or where they are the buyer party.
 *  TRANSPORTER — disputes they raised, or where they are the transporter
 *  party.
 *  ADMIN — full access, including internal notes, assignment and
 *  resolution.
 *
 * Internal notes (DisputeCommentVisibility.INTERNAL_NOTE) are never visible
 * to FARMER/BUYER/TRANSPORTER regardless of whether they can view the
 * dispute itself — filtered by the service layer's DTO mapper, never left
 * to the client (Step 12/34).
 */
export class DisputeAuthorizationService {
  canView(
    user: AuthenticatedUserContext,
    dispute: DisputeRecord,
    callerFarmerProfileId: string | null,
    callerBuyerProfileId: string | null,
    callerTransportProviderId: string | null,
  ): boolean {
    if (user.role === "ADMIN") return true;
    if (dispute.raisedByUserId === user.id) return true;

    if (user.role === "FARMER" || user.role === "FPO_ADMIN") {
      return callerFarmerProfileId !== null && dispute.farmerId === callerFarmerProfileId;
    }
    if (user.role === "BUYER") {
      return callerBuyerProfileId !== null && dispute.buyerId === callerBuyerProfileId;
    }
    if (user.role === "TRANSPORTER") {
      return callerTransportProviderId !== null && dispute.transporterId === callerTransportProviderId;
    }
    return false;
  }

  /** Step 8 — who may create a dispute referencing a given party
   * combination. A farmer/buyer/transporter may only raise a dispute where
   * they themselves are one of the referenced parties (or the raiser with
   * no party reference — a general grievance); only ADMIN may raise a
   * dispute on behalf of a party it is not. */
  assertCanCreateFor(
    user: AuthenticatedUserContext,
    callerFarmerProfileId: string | null,
    callerBuyerProfileId: string | null,
    callerTransportProviderId: string | null,
    targetFarmerId: string | null,
    targetBuyerId: string | null,
    targetTransporterId: string | null,
  ): void {
    if (user.role === "ADMIN") return;

    if (targetFarmerId && targetFarmerId !== callerFarmerProfileId) {
      throw new AuthorizationError("You can only raise a dispute involving your own farmer profile.");
    }
    if (targetBuyerId && targetBuyerId !== callerBuyerProfileId) {
      throw new AuthorizationError("You can only raise a dispute involving your own buyer profile.");
    }
    if (targetTransporterId && targetTransporterId !== callerTransportProviderId) {
      throw new AuthorizationError("You can only raise a dispute involving your own transporter profile.");
    }
  }

  /** Step 13/21 — only ADMIN may assign, request evidence, resolve, reject,
   * add internal notes, or otherwise operate on the investigation side of a
   * dispute. */
  assertCanOperate(user: AuthenticatedUserContext): void {
    if (user.role === "ADMIN") return;
    throw new AuthorizationError("You do not have permission to manage this dispute.");
  }

  /** Step 11 — a public comment may be added by any party who can view the
   * dispute (the raiser, the referenced farmer/buyer/transporter, or
   * ADMIN); it is never restricted to ADMIN the way operational actions
   * are. */
  assertCanComment(
    user: AuthenticatedUserContext,
    dispute: DisputeRecord,
    callerFarmerProfileId: string | null,
    callerBuyerProfileId: string | null,
    callerTransportProviderId: string | null,
  ): void {
    if (this.canView(user, dispute, callerFarmerProfileId, callerBuyerProfileId, callerTransportProviderId)) return;
    throw new AuthorizationError("You do not have permission to comment on this dispute.");
  }

  requireFound<T>(value: T | null, message: string): T {
    if (value === null) throw new NotFoundError(message);
    return value;
  }
}
