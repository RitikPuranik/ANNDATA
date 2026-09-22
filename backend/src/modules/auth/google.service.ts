import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { AuthenticationError } from "../../common/errors";

/** Minimal shape we actually use off a verified Google ID token. */
export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
}

// A single client is fine to share across requests — verifyIdToken() is
// stateless per call (it just checks the token's signature/claims against
// Google's published keys, cached internally by the library).
const client = new OAuth2Client(env.GOOGLE_CLIENT_ID || undefined);

/**
 * Verifies a Google Identity Services ID token (sent from the frontend
 * after `google.accounts.id` sign-in) and returns the profile embedded in
 * it. Throws AuthenticationError on anything invalid — expired token,
 * wrong audience, tampered signature, etc. Never trust an ID token that
 * hasn't gone through this.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) {
    // Misconfiguration, not a client error — surfaced as 401 rather than a
    // 500 stack trace, but logged distinctly by the caller if needed.
    throw new AuthenticationError("Sign in with Google is not configured.");
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AuthenticationError("Your Google sign-in could not be verified. Please try again.");
  }

  if (!payload || !payload.sub || !payload.email) {
    throw new AuthenticationError("Your Google sign-in could not be verified. Please try again.");
  }

  if (!payload.email_verified) {
    throw new AuthenticationError("Your Google account's email address is not verified.");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified,
    fullName: payload.name?.trim() || payload.email.split("@")[0],
  };
}
