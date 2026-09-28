import { AuthorizationError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { SyncSessionRecord } from "./low-connectivity.types";

export class LowConnectivityAuthorizationService {
  canAccessSession(user: AuthenticatedUserContext, session: SyncSessionRecord): boolean {
    return user.role === "ADMIN" || session.userId === user.id;
  }

  assertCanAccessSession(user: AuthenticatedUserContext, session: SyncSessionRecord): void {
    if (!this.canAccessSession(user, session)) throw new AuthorizationError("You don't have permission to access this sync session.");
  }
}
