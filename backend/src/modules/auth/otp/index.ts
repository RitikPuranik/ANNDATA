import { PrismaClient } from "@prisma/client";
import { env } from "../../../config/env";
import { createEmailService, EmailService } from "../../notifications/email";
import { EmailOtpProvider } from "./emailOtpProvider";
import { MockOtpProvider } from "./mockOtpProvider";
import { OtpProvider, SendOtpResult, VerifyOtpResult } from "./otpProvider.interface";
import { TwilioSmsOtpProvider } from "./twilioSmsOtpProvider";

export function createOtpProviders(
  prisma: PrismaClient,
  emailService: EmailService = createEmailService(),
): { email: OtpProvider; sms: OtpProvider } {
  return {
    email: new EmailOtpProvider(prisma, emailService),
    sms: env.TWILIO_ENABLED ? new TwilioSmsOtpProvider(prisma) : new MockOtpProvider(prisma),
  };
}

export { OtpProvider, SendOtpResult, VerifyOtpResult };
