import argon2 from "argon2";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { CookieOptions, Response } from "express";
import { env, isProduction } from "../../config/env";
import { AuthenticatedUserContext } from "./auth.types";

// ---------------------------------------------------------------------------
// Password hashing (Argon2id)
// ---------------------------------------------------------------------------

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP-recommended minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Opaque secure tokens
// ---------------------------------------------------------------------------

export function generateSecureToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateNumericOtp(length = 6): string {
  const max = 10 ** length;
  const value = crypto.randomInt(0, max);
  return value.toString().padStart(length, "0");
}

// ---------------------------------------------------------------------------
// JWT access tokens
// ---------------------------------------------------------------------------

interface AccessTokenPayload {
  sub: string;
  publicId: string;
  role: AuthenticatedUserContext["role"];
}

export function signAccessToken(user: AuthenticatedUserContext): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    publicId: user.publicId,
    role: user.role,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// ---------------------------------------------------------------------------
// Refresh cookie
//
// In production the frontend proxies /api/* through the Vercel origin.
// Keeping this cookie host-only (no Domain attribute) means the browser
// stores it for whichever host actually returned the response. This avoids
// third-party-cookie dependence between Vercel and Render.
// ---------------------------------------------------------------------------

export const REFRESH_COOKIE_NAME = "anndata_refresh";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    // SameSite=None remains compatible with both the direct Render API and
    // the same-origin Vercel proxy. Secure is enabled in production.
    sameSite: isProduction ? "none" : "lax",
    path: "/api/auth",
  };
}

export function setRefreshCookie(res: Response, rawRefreshToken: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE_NAME, rawRefreshToken, {
    ...baseCookieOptions(),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
}

export function refreshTokenExpiryDate(): Date {
  const days = env.JWT_REFRESH_EXPIRES_IN_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
