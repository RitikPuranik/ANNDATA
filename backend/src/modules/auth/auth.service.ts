import { User } from "@prisma/client";
import {
  AuthenticationError,
  ConflictError,
  InvalidCredentialsError,
  ValidationError,
} from "../../common/errors";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { trackEvent } from "../../config/posthog";
import { AuditService } from "../audit/audit.service";
import { createEmailService, EmailService } from "../notifications/email";
import {
  passwordResetConfirmationEmailTemplate,
  passwordResetEmailTemplate,
  welcomeEmailTemplate,
} from "../notifications/email/email.templates";
import { AuthRepository } from "./auth.repository";
import {
  AuthTokens,
  AuthenticatedUserContext,
  GoogleLoginInput,
  LoginInput,
  PublicUserDTO,
  RegisterInput,
  RequestMeta,
} from "./auth.types";
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  refreshTokenExpiryDate,
  signAccessToken,
  verifyPassword,
} from "./auth.utils";
import { verifyGoogleIdToken } from "./google.service";
import { OtpProvider } from "./otp/otpProvider.interface";

const BLOCKED_LOGIN_STATUSES = new Set(["SUSPENDED", "DEACTIVATED"]);

function toPublicUserDTO(user: User): PublicUserDTO {
  return {
    id: user.publicId,
    fullName: user.fullName,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    hasGoogleLinked: !!user.googleId,
    hasPassword: !!user.passwordHash,
    preferredLanguage: user.preferredLanguage,
    verification: {
      phone: user.phoneVerificationStatus,
      email: user.emailVerificationStatus,
      identity: user.identityVerificationStatus,
    },
  };
}

function toAuthContext(user: User): AuthenticatedUserContext {
  return { id: user.id, publicId: user.publicId, role: user.role };
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly audit: AuditService,
    private readonly emailService: EmailService = createEmailService(),
    private readonly otpProviders?: { email: OtpProvider; sms: OtpProvider },
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<{ user: PublicUserDTO }> {
    const existingByMobile = await this.repo.findUserByMobile(input.mobile);
    if (existingByMobile) {
      throw new ConflictError("This mobile number is already registered.", {
        mobile: "This mobile number is already registered.",
      });
    }

    if (input.email) {
      const existingByEmail = await this.repo.findUserByEmail(input.email);
      if (existingByEmail) {
        throw new ConflictError("This email is already registered.", {
          email: "This email is already registered.",
        });
      }
    }

    const passwordHash = await hashPassword(input.password);

    // role is deliberately hard-coded here — never taken from the caller.
    // See auth.schemas.ts (registerRequestSchema.strict()) for the first
    // line of defense against a client-supplied role.
    const user = await this.repo.createUser({
      fullName: input.fullName,
      mobile: input.mobile,
      email: input.email,
      passwordHash,
      role: "FARMER",
      preferredLanguage: input.preferredLanguage,
    });

    await this.audit.record({
      actorUserId: user.id,
      action: "USER_REGISTERED",
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    trackEvent("signup_completed", user.publicId, { role: user.role });

    if (user.email) {
      const rendered = welcomeEmailTemplate(user.fullName);
      const result = await this.emailService.sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!result.success) {
        logger.error(
          { userId: user.id, error: result.error },
          "[AuthService] Failed to send welcome email",
        );
      }
    }

    return { user: toPublicUserDTO(user) };
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<{ user: PublicUserDTO; tokens: AuthTokens }> {
    const user = await this.repo.findUserByMobile(input.mobile);

    if (!user) {
      trackEvent("login_failed", "anonymous", { reason: "no_account" });
      throw new InvalidCredentialsError();
    }

    const passwordValid = user.passwordHash ? await verifyPassword(user.passwordHash, input.password) : false;
    if (!passwordValid) {
      await this.audit.record({
        actorUserId: user.id,
        action: "USER_LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        metadata: { reason: "bad_password" },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      trackEvent("login_failed", user.publicId, { reason: "bad_password" });
      throw new InvalidCredentialsError();
    }

    if (BLOCKED_LOGIN_STATUSES.has(user.accountStatus)) {
      await this.audit.record({
        actorUserId: user.id,
        action: "USER_LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        metadata: { reason: "account_status", accountStatus: user.accountStatus },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      trackEvent("login_failed", user.publicId, { reason: "account_status" });
      throw new AuthenticationError(
        user.accountStatus === "DEACTIVATED"
          ? "This account has been deactivated."
          : "This account is suspended. Please contact support.",
      );
    }

    const tokens = await this.issueSession(user, meta);

    await this.repo.updateLastLogin(user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: "USER_LOGIN",
      entityType: "User",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    trackEvent("login_success", user.publicId, { role: user.role });

    return { user: toPublicUserDTO(user), tokens };
  }

  /**
   * Sign-in-or-signup with Google. The client sends the ID token it got
   * from Google Identity Services; we verify it server-side (never trust
   * the client's own claims about who signed in) and then:
   *   1. an existing googleId match logs straight in;
   *   2. otherwise an existing account with the same, Google-verified
   *      email gets this Google identity linked and logs in;
   *   3. otherwise a brand-new FARMER account is created.
   * Mirrors login()'s blocked-status check and session issuance so
   * Google-authenticated sessions behave identically to password ones
   * everywhere else in the app.
   */
  async loginWithGoogle(
    input: GoogleLoginInput,
    meta: RequestMeta,
  ): Promise<{ user: PublicUserDTO; tokens: AuthTokens }> {
    const profile = await verifyGoogleIdToken(input.idToken);

    let user = await this.repo.findUserByGoogleId(profile.googleId);
    let isNewUser = false;

    if (!user) {
      const existingByEmail = await this.repo.findUserByEmail(profile.email);
      if (existingByEmail) {
        user = await this.repo.linkGoogleAccount(existingByEmail.id, profile.googleId);
      } else {
        user = await this.repo.createUserFromGoogle({
          fullName: profile.fullName,
          email: profile.email,
          googleId: profile.googleId,
          role: "FARMER",
          preferredLanguage: "en",
        });
        isNewUser = true;
      }
    }

    if (BLOCKED_LOGIN_STATUSES.has(user.accountStatus)) {
      await this.audit.record({
        actorUserId: user.id,
        action: "USER_LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        metadata: { reason: "account_status", accountStatus: user.accountStatus, method: "google" },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new AuthenticationError(
        user.accountStatus === "DEACTIVATED"
          ? "This account has been deactivated."
          : "This account is suspended. Please contact support.",
      );
    }

    const tokens = await this.issueSession(user, meta);
    await this.repo.updateLastLogin(user.id);

    await this.audit.record({
      actorUserId: user.id,
      action: isNewUser ? "USER_REGISTERED" : "USER_LOGIN",
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role, method: "google" },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    trackEvent(isNewUser ? "signup_completed" : "login_success", user.publicId, {
      role: user.role,
      method: "google",
    });

    if (isNewUser && user.email) {
      const rendered = welcomeEmailTemplate(user.fullName);
      const result = await this.emailService.sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      if (!result.success) {
        logger.error({ userId: user.id, error: result.error }, "[AuthService] Failed to send welcome email");
      }
    }

    return { user: toPublicUserDTO(user), tokens };
  }

  private async issueSession(user: User, meta: RequestMeta): Promise<AuthTokens> {
    const rawRefreshToken = generateSecureToken();
    const refreshTokenExpiresAt = refreshTokenExpiryDate();

    await this.repo.createSession({
      userId: user.id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: refreshTokenExpiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    const accessToken = signAccessToken(toAuthContext(user));
    return { accessToken, refreshToken: rawRefreshToken, refreshTokenExpiresAt };
  }

  async refreshSession(
    rawRefreshToken: string,
    meta: RequestMeta,
  ): Promise<{ user: PublicUserDTO; tokens: AuthTokens }> {
    const tokenHash = hashToken(rawRefreshToken);
    const session = await this.repo.findSessionByTokenHash(tokenHash);

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AuthenticationError("Your session has expired. Please log in again.");
    }

    const user = await this.repo.findUserById(session.userId);
    if (!user || BLOCKED_LOGIN_STATUSES.has(user.accountStatus)) {
      await this.repo.revokeSession(session.id);
      throw new AuthenticationError("Your session is no longer valid. Please log in again.");
    }

    // Rotate: invalidate the used refresh token and issue a fresh one. This
    // limits the blast radius if a refresh token is ever stolen.
    await this.repo.revokeSession(session.id);
    const tokens = await this.issueSession(user, meta);

    return { user: toPublicUserDTO(user), tokens };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return; // idempotent — nothing to revoke
    await this.repo.revokeSessionByTokenHash(hashToken(rawRefreshToken));
  }

  async logoutAll(userId: string, meta: RequestMeta): Promise<void> {
    await this.repo.revokeAllSessions(userId);
    await this.audit.record({
      actorUserId: userId,
      action: "USER_LOGOUT_ALL",
      entityType: "User",
      entityId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async getCurrentUser(userId: string): Promise<PublicUserDTO> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new AuthenticationError("Your session is no longer valid. Please log in again.");
    }
    return toPublicUserDTO(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionTokenHash: string | undefined,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new AuthenticationError("Your session is no longer valid. Please log in again.");
    }

    if (!user.passwordHash) {
      throw new ValidationError("Please correct the highlighted fields", {
        currentPassword: "This account signed up with Google and has no password set yet.",
      });
    }

    const currentValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!currentValid) {
      throw new ValidationError("Please correct the highlighted fields", {
        currentPassword: "Current password is incorrect.",
      });
    }

    const newHash = await hashPassword(newPassword);
    await this.repo.updateUserPassword(userId, newHash);

    // Keep the session the request came in on; revoke every other session.
    const currentSession = currentSessionTokenHash
      ? await this.repo.findSessionByTokenHash(currentSessionTokenHash)
      : null;
    await this.repo.revokeAllSessions(userId, currentSession?.id);

    await this.audit.record({
      actorUserId: userId,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    if (user.email) {
      const rendered = passwordResetConfirmationEmailTemplate(user.fullName);
      const result = await this.emailService.sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!result.success) {
        logger.error(
          { userId: user.id, error: result.error },
          "[AuthService] Failed to send password change confirmation email",
        );
      }
    }
  }

  async requestPasswordReset(
    channel: "email" | "sms",
    identifier: string,
    meta: RequestMeta,
  ): Promise<{ challengeId: string; expiresAt: Date } | null> {
    const user = channel === "email"
      ? await this.repo.findUserByEmail(identifier.toLowerCase())
      : await this.repo.findUserByMobile(identifier);

    // Keep the public response generic so account existence is not disclosed.
    if (!user) return null;

    const destination = channel === "email" ? user.email : user.mobile;
    if (!destination) return null;

    if (!this.otpProviders) {
      throw new AuthenticationError("OTP delivery is not configured.");
    }

    const provider = channel === "email" ? this.otpProviders.email : this.otpProviders.sms;
    const purpose = channel === "email" ? "PASSWORD_RESET_EMAIL" : "PASSWORD_RESET_SMS";
    const result = await provider.sendOtp(destination, purpose, user.id);

    await this.audit.record({
      actorUserId: user.id,
      action: "PASSWORD_RESET_OTP_REQUESTED",
      entityType: "User",
      entityId: user.id,
      metadata: { channel },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    trackEvent("password_reset_started", user.publicId, { channel });

    return result;
  }

  async verifyPasswordResetOtp(
    channel: "email" | "sms",
    challengeId: string,
    code: string,
    meta: RequestMeta,
  ): Promise<{ resetToken: string }> {
    if (!this.otpProviders) {
      throw new AuthenticationError("OTP delivery is not configured.");
    }

    const provider = channel === "email" ? this.otpProviders.email : this.otpProviders.sms;
    const purpose = channel === "email" ? "PASSWORD_RESET_EMAIL" : "PASSWORD_RESET_SMS";
    const verification = await provider.verifyOtp(challengeId, code, purpose);

    if (!verification.success) {
      const message =
        verification.reason === "EXPIRED"
          ? "This OTP has expired. Please request a new one."
          : verification.reason === "TOO_MANY_ATTEMPTS"
            ? "Too many incorrect attempts. Please request a new OTP."
            : verification.reason === "ALREADY_USED"
              ? "This OTP has already been used."
              : "The OTP is incorrect.";

      throw new ValidationError("Please correct the highlighted fields", { otp: message });
    }

    const challenge = await this.repo.findOtpChallengeById(challengeId);
    if (!challenge) {
      throw new ValidationError("Please correct the highlighted fields", { otp: "This OTP is invalid." });
    }

    if (!challenge.userId) {
      throw new ValidationError("Please correct the highlighted fields", { otp: "This OTP is invalid." });
    }

    const user = await this.repo.findUserById(challenge.userId);
    if (!user) {
      throw new ValidationError("Please correct the highlighted fields", { otp: "This OTP is invalid." });
    }

    const rawToken = generateSecureToken();
    await this.repo.createPasswordResetToken({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    await this.audit.record({
      actorUserId: user.id,
      action: "PASSWORD_RESET_OTP_VERIFIED",
      entityType: "User",
      entityId: user.id,
      metadata: { channel },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { resetToken: rawToken };
  }

  async resetPassword(rawToken: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const tokenRecord = await this.repo.findValidPasswordResetTokenByHash(tokenHash);

    if (!tokenRecord) {
      throw new ValidationError("Please correct the highlighted fields", {
        token: "This reset link is invalid or has expired.",
      });
    }

    const newHash = await hashPassword(newPassword);
    await this.repo.updateUserPassword(tokenRecord.userId, newHash);
    await this.repo.consumePasswordResetToken(tokenRecord.id);
    await this.repo.revokeAllSessions(tokenRecord.userId);

    await this.audit.record({
      actorUserId: tokenRecord.userId,
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "User",
      entityId: tokenRecord.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    trackEvent("password_reset_completed", tokenRecord.userId);

    const user = await this.repo.findUserById(tokenRecord.userId);
    if (user?.email) {
      const rendered = passwordResetConfirmationEmailTemplate(user.fullName);
      const result = await this.emailService.sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!result.success) {
        logger.error(
          { userId: user.id, error: result.error },
          "[AuthService] Failed to send password reset confirmation email",
        );
      }
    }
  }
}
