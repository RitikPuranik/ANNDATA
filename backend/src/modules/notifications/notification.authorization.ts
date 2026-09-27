import { AuthorizationError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { NotificationRecord } from "./notification.types";

/**
 * Section 31 — IDOR protection. A notification is private to its own
 * recipient; there is no admin override here (Section 31: "Admins should
 * not automatically see everyone's private notifications unless the
 * existing admin architecture explicitly requires it" — it does not, for
 * this module). Kept as its own tiny class (rather than an inline check in
 * the service) purely so it is trivially unit-testable and greppable, same
 * convention as every other *.authorization.ts file in this codebase.
 */
export class NotificationAuthorizationService {
  assertCanAccess(user: AuthenticatedUserContext, notification: NotificationRecord): void {
    if (notification.recipientUserId !== user.id) {
      throw new AuthorizationError("You don't have permission to access this notification.");
    }
  }
}
