import { apiRequest } from "@/lib/apiClient";

export interface WhatsAppLinkStatus {
  linked: boolean;
  phoneMasked?: string;
  linkedAt?: string;
}

export interface WhatsAppLinkCode {
  code: string;
  expiresAt: string;
  instruction: string;
}

/**
 * Frontend client for the WhatsApp farmer assistant's account-linking
 * endpoints (see docs/modules/module-whatsapp-farmer-assistant.md). Mirrors
 * backend modules/whatsapp/whatsapp.routes.ts (createWhatsAppAccountRouter) —
 * farmer-only, JWT-authenticated.
 *
 * This is deliberately just "am I linked" + "issue a one-time code" +
 * "unlink". It never accepts or displays another user's phone number, and
 * the code itself is shown to the farmer exactly once by the backend.
 */
export const whatsappApi = {
  async getLinkStatus() {
    return apiRequest<WhatsAppLinkStatus>("/api/whatsapp/link");
  },

  async issueLinkCode() {
    return apiRequest<WhatsAppLinkCode>("/api/whatsapp/link/code", { method: "POST" });
  },

  async unlink() {
    return apiRequest<{ unlinked: boolean }>("/api/whatsapp/link", { method: "DELETE" });
  },
};
