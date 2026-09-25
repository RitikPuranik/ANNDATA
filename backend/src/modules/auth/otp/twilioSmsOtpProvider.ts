import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { env } from "../../../config/env";
import { logger } from "../../../config/logger";
import { hashToken } from "../auth.utils";
import { OtpProvider, SendOtpResult, VerifyOtpResult } from "./otpProvider.interface";

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function toE164(indianMobile: string): string {
  return indianMobile.startsWith("+") ? indianMobile : `+91${indianMobile}`;
}

async function twilioRequest(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const credentials = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`${env.TWILIO_VERIFY_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(env.TWILIO_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : "Twilio Verify request failed.");
  }
  return body;
}

export class TwilioSmsOtpProvider implements OtpProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async sendOtp(destination: string, purpose: string, userId?: string): Promise<SendOtpResult> {
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        destination,
        purpose,
        userId,
        codeHash: hashToken(`twilio:${randomUUID()}`),
        expiresAt,
      },
    });

    try {
      await twilioRequest(
        `/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
        new URLSearchParams({ To: toE164(destination), Channel: "sms" }),
      );
    } catch (error) {
      await this.prisma.otpChallenge.delete({ where: { id: challenge.id } });
      logger.error({ destination, purpose, error }, "[TwilioSmsOtpProvider] Failed to send OTP");
      throw new Error("Unable to send the OTP right now.");
    }

    return { challengeId: challenge.id, expiresAt };
  }

  async verifyOtp(challengeId: string, code: string, expectedPurpose?: string): Promise<VerifyOtpResult> {
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) return { success: false, reason: "INVALID" };
    if (expectedPurpose && challenge.purpose !== expectedPurpose) return { success: false, reason: "INVALID" };
    if (challenge.consumedAt) return { success: false, reason: "ALREADY_USED" };
    if (challenge.expiresAt < new Date()) return { success: false, reason: "EXPIRED" };
    if (challenge.attempts >= MAX_ATTEMPTS) return { success: false, reason: "TOO_MANY_ATTEMPTS" };

    await this.prisma.otpChallenge.update({ where: { id: challengeId }, data: { attempts: { increment: 1 } } });

    try {
      const result = await twilioRequest(
        `/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
        new URLSearchParams({ To: toE164(challenge.destination), Code: code }),
      );
      if (result.status !== "approved") return { success: false, reason: "INVALID" };
      await this.prisma.otpChallenge.update({ where: { id: challengeId }, data: { consumedAt: new Date() } });
      return { success: true };
    } catch {
      return { success: false, reason: "INVALID" };
    }
  }
}
