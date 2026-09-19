import { AuthorizationError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { FpoAuthorizationService } from "../fpo/fpo.authorization";
import { PaymentObligationRecord } from "./payment.types";

/**
 * Step 14 — who can see/manage a PaymentObligation. Ownership is never
 * re-derived from the request body — every check resolves the caller's
 * own identity first, same convention as DeliveryAuthorizationService.
 *
 *  FARMER / FPO_ADMIN (the seller) — view their own payment obligations
 *  and payment history; confirm a buyer-reported payment (Step 15); may
 *  never record/report a payment or mark it disputed unilaterally beyond
 *  what confirmation covers.
 *  BUYER — the obligation's own buyer: view, record/report a payment.
 *  Never confirms their own reported payment (Step 15: a payment claim
 *  never becomes an unquestioned fact from the same party that made it).
 *  ADMIN — full access, including cancelling an obligation.
 */
export class PaymentAuthorizationService {
  constructor(private readonly fpoAuthorization: FpoAuthorizationService) {}

  isBuyer(user: AuthenticatedUserContext, obligation: PaymentObligationRecord, callerBuyerProfileId: string | null): boolean {
    return user.role === "BUYER" && callerBuyerProfileId !== null && callerBuyerProfileId === obligation.buyerId;
  }

  isSellerFarmer(user: AuthenticatedUserContext, obligation: PaymentObligationRecord, callerFarmerProfileId: string | null): boolean {
    return user.role === "FARMER" && callerFarmerProfileId !== null && callerFarmerProfileId === obligation.sellerFarmerId;
  }

  async isSellerFpoAdmin(user: AuthenticatedUserContext, obligation: PaymentObligationRecord): Promise<boolean> {
    if (user.role !== "FPO_ADMIN" || !obligation.sellerFpoId) return false;
    return this.fpoAuthorization.canManageFpo(user, obligation.sellerFpoId);
  }

  async canView(
    user: AuthenticatedUserContext,
    obligation: PaymentObligationRecord,
    callerFarmerProfileId: string | null,
    callerBuyerProfileId: string | null,
  ): Promise<boolean> {
    if (user.role === "ADMIN") return true;
    if (this.isBuyer(user, obligation, callerBuyerProfileId)) return true;
    if (this.isSellerFarmer(user, obligation, callerFarmerProfileId)) return true;
    return this.isSellerFpoAdmin(user, obligation);
  }

  /** Step 14 — only the obligation's own BUYER (or ADMIN) may report/
   * record a payment against it. */
  assertCanRecordPayment(user: AuthenticatedUserContext, obligation: PaymentObligationRecord, callerBuyerProfileId: string | null): void {
    if (user.role === "ADMIN") return;
    if (this.isBuyer(user, obligation, callerBuyerProfileId)) return;
    throw new AuthorizationError("Only the buyer of this obligation may record a payment.");
  }

  /** Step 15 — only the obligation's own seller (or ADMIN) may confirm a
   * payment the buyer reported; a buyer can never confirm their own claim. */
  async assertCanConfirmPayment(
    user: AuthenticatedUserContext,
    obligation: PaymentObligationRecord,
    callerFarmerProfileId: string | null,
  ): Promise<void> {
    if (user.role === "ADMIN") return;
    if (this.isSellerFarmer(user, obligation, callerFarmerProfileId)) return;
    if (await this.isSellerFpoAdmin(user, obligation)) return;
    throw new AuthorizationError("Only the seller of this obligation may confirm a payment.");
  }

  /** Step 14 — either party (buyer or seller) may raise a dispute; ADMIN
   * may always do so on their behalf. */
  async assertCanMarkDisputed(
    user: AuthenticatedUserContext,
    obligation: PaymentObligationRecord,
    callerFarmerProfileId: string | null,
    callerBuyerProfileId: string | null,
  ): Promise<void> {
    if (user.role === "ADMIN") return;
    if (this.isBuyer(user, obligation, callerBuyerProfileId)) return;
    if (this.isSellerFarmer(user, obligation, callerFarmerProfileId)) return;
    if (await this.isSellerFpoAdmin(user, obligation)) return;
    throw new AuthorizationError("You do not have permission to dispute this obligation.");
  }

  /** Cancellation is never given to either commercial party — an
   * obligation is only cancelled by an administrative decision. */
  assertAdminOnly(user: AuthenticatedUserContext): void {
    if (user.role === "ADMIN") return;
    throw new AuthorizationError("Only an administrator may cancel a payment obligation.");
  }
}
