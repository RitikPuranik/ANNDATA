"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldHint, Alert } from "@/components/ui/primitives";
import { authApi } from "@/services/authApi";
import { ApiRequestError } from "@/types/api";
import { mobileSchema } from "@/features/auth/auth.schemas";

type Channel = "email" | "sms";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [channel, setChannel] = React.useState<Channel>("email");
  const [email, setEmail] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [challengeId, setChallengeId] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);

  function switchChannel(next: Channel) {
    setChannel(next);
    setServerError(null);
    setSubmitted(false);
    setChallengeId(null);
    setOtp("");
  }

  async function requestOtp(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);

    if (channel === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setServerError("Enter a valid email address.");
        return;
      }
    } else {
      const result = mobileSchema.safeParse(mobile);
      if (!result.success) {
        setServerError("Enter a valid Indian mobile number.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = channel === "email"
        ? { channel: "email" as const, email: email.trim().toLowerCase() }
        : { channel: "sms" as const, mobile: mobile.trim() };

      const result = await authApi.forgotPassword(payload);
      setChallengeId(result?.challengeId ?? null);
      setSubmitted(true);
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : t("common.networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);

    if (!challengeId) {
      setServerError("If an account exists, request a new OTP.");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setServerError("Enter the 6-digit OTP.");
      return;
    }

    setIsVerifying(true);
    try {
      const result = await authApi.verifyPasswordResetOtp({
        channel,
        challengeId,
        otp,
      });
      router.push(`/reset-password?token=${encodeURIComponent(result.resetToken)}`);
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : t("common.networkError"));
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={submitted ? "Enter the OTP we sent you." : "Choose where you want to receive your OTP."}
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("forgotPassword.backToLogin")}
        </Link>
      }
    >
      {!submitted ? (
        <form className="space-y-5" onSubmit={requestOtp} noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => switchChannel("email")}
              className={`rounded-md px-4 py-3 text-sm font-medium transition ${channel === "email" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Email OTP
            </button>
            <button
              type="button"
              onClick={() => switchChannel("sms")}
              className={`rounded-md px-4 py-3 text-sm font-medium transition ${channel === "sms" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Phone OTP
            </button>
          </div>

          {channel === "email" ? (
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your registered email"
              />
              <FieldHint>We'll send a 6-digit OTP to this email.</FieldHint>
            </div>
          ) : (
            <div>
              <Label htmlFor="mobile">Mobile number</Label>
              <Input
                id="mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                placeholder="10-digit mobile number"
              />
              <FieldHint>We'll send the OTP by SMS through Twilio.</FieldHint>
            </div>
          )}

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Send OTP
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={verifyOtp} noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}

          <Alert variant="success">
            OTP sent to {channel === "email" ? "your registered email address." : "your registered mobile number."}
          </Alert>

          <div>
            <Label htmlFor="otp">6-digit OTP</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter OTP"
            />
            <FieldHint>OTP expires in 10 minutes.</FieldHint>
          </div>

          <Button type="submit" isLoading={isVerifying} className="w-full">
            Verify OTP
          </Button>

          <button
            type="button"
            className="w-full text-sm font-medium text-primary hover:underline"
            onClick={() => setSubmitted(false)}
          >
            Use a different method or resend
          </button>

        </form>
      )}
    </AuthLayout>
  );
}
