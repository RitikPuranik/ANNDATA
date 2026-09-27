import { AuthorizationError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { FpoAuthorizationService } from "../fpo/fpo.authorization";
import { LedgerEntryRow } from "./digital-transaction-ledger.types";

/**
 * Who can see a ledger entry. Same convention as PaymentAuthorizationService:
 * ownership is never re-derived from the request — the caller's own farmer/
 * buyer profile id is resolved first, then compared against the entry's
 * farmerId/buyerId (Step: "Authorization" — "Never trust farmerId/buyerId/
 * transactionId from the client without authorization checks").
 *
 *  FARMER — entries where entry.farmerId is their own farmer profile id.
 *  FPO_ADMIN — entries whose farmerId belongs to a farmer they manage
 *  is out of scope for this version (Module 20's farmerId always mirrors
 *  PaymentObligation.sellerFarmerId, which is farmer-owned only — see the
 *  module doc's own limitations note); an FPO-owned sale therefore has a
 *  null farmerId and buyerId-only visibility, same as PaymentObligation.
 *  BUYER — entries where entry.buyerId is their own buyer profile id.
 *  ADMIN — full access.
 */
export class LedgerAuthorizationService {
  constructor(private readonly fpoAuthorization: FpoAuthorizationService) {}

  async canView(
    user: AuthenticatedUserContext,
    entry: LedgerEntryRow,
    callerFarmerProfileId: string | null,
    callerBuyerProfileId: string | null,
  ): Promise<boolean> {
    if (user.role === "ADMIN") return true;
    if (user.role === "BUYER" && callerBuyerProfileId !== null && callerBuyerProfileId === entry.buyerId) return true;
    if (user.role === "FARMER" && callerFarmerProfileId !== null && callerFarmerProfileId === entry.farmerId) return true;
    if (user.role === "FPO_ADMIN" && entry.tradeId) {
      // FPO-owned sales aren't represented on Module 20 entries today
      // (farmerId is always the farmer-owned seller — see the class
      // comment); left as an explicit false rather than silently
      // granting access via an unrelated check.
      return false;
    }
    return false;
  }

  assertAdminOnly(user: AuthenticatedUserContext, message = "Only an administrator may perform this action."): void {
    if (user.role !== "ADMIN") {
      throw new AuthorizationError(message);
    }
  }
}
