import { apiRequest, setAccessToken } from "@/lib/apiClient";
import { AuthUser } from "@/types/api";

export interface RegisterPayload {
  fullName: string;
  mobile: string;
  email?: string;
  password: string;
  preferredLanguage: "en" | "hi" | "mr";
}

export interface LoginPayload {
  mobile: string;
  password: string;
}

export const authApi = {
  async register(payload: RegisterPayload) {
    return apiRequest<{ user: AuthUser }>("/api/auth/register", { method: "POST", body: payload });
  },

  async login(payload: LoginPayload) {
    const data = await apiRequest<{ user: AuthUser; accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: payload,
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    return data.user;
  },

  async loginWithGoogle(idToken: string) {
    const data = await apiRequest<{ user: AuthUser; accessToken: string }>("/api/auth/google", {
      method: "POST",
      body: { idToken },
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    return data.user;
  },

  async me() {
    return apiRequest<AuthUser>("/api/auth/me");
  },

  async logout() {
    await apiRequest<null>("/api/auth/logout", { method: "POST", skipAuthRetry: true });
    setAccessToken(null);
  },

  async logoutAll() {
    await apiRequest<null>("/api/auth/logout-all", { method: "POST" });
    setAccessToken(null);
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return apiRequest<null>("/api/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  },

  async forgotPassword(payload: { channel: "email"; email: string } | { channel: "sms"; mobile: string }) {
    return apiRequest<{ challengeId: string; expiresAt: string } | null>("/api/auth/forgot-password", {
      method: "POST",
      body: payload,
      skipAuthRetry: true,
    });
  },

  async verifyPasswordResetOtp(payload: { channel: "email" | "sms"; challengeId: string; otp: string }) {
    return apiRequest<{ resetToken: string }>("/api/auth/verify-password-reset-otp", {
      method: "POST",
      body: payload,
      skipAuthRetry: true,
    });
  },

  async resetPassword(token: string, newPassword: string) {
    return apiRequest<null>("/api/auth/reset-password", {
      method: "POST",
      body: { token, newPassword },
      skipAuthRetry: true,
    });
  },
};
