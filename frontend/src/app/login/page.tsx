
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/I18nProvider";
import { AuthLayout } from "@/components/AuthLayout";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError, FieldHint, Alert } from "@/components/ui/primitives";
import {
  LoginFormValues,
  loginFormSchema,
} from "@/features/auth/auth.schemas";
import { ApiRequestError } from "@/types/api";
import { ROLE_HOME_ROUTE } from "@/lib/roleRouting";
import { isInvalidCredentials, isRateLimited } from "@/lib/formErrors";

export default function LoginPage() {
  const { t } = useI18n();
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [serverError, setServerError] = React.useState<{
    message: string;
    kind: "invalidCredentials" | "rateLimited" | "other";
  } | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      mobile: "",
      password: "",
    },
  });

  async function handleGoogleCredential(idToken: string) {
    setServerError(null);
    try {
      const user = await loginWithGoogle(idToken);
      router.push(ROLE_HOME_ROUTE[user.role]);
    } catch (err) {
      setServerError({
        message: err instanceof ApiRequestError ? err.message : t("common.networkError"),
        kind: "other",
      });
    }
  }

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);

    try {
      const user = await login(values);

      router.push(ROLE_HOME_ROUTE[user.role]);
    } catch (err) {
      if (isInvalidCredentials(err)) {
        setServerError({ message: (err as ApiRequestError).message, kind: "invalidCredentials" });
      } else if (isRateLimited(err)) {
        setServerError({ message: (err as ApiRequestError).message, kind: "rateLimited" });
      } else {
        setServerError({
          message: err instanceof ApiRequestError ? err.message : t("common.networkError"),
          kind: "other",
        });
      }
    }
  }

  return (
    <AuthLayout
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <span className="text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("login.createAccount")}
          </Link>
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        {serverError && (
          <Alert
            variant="error"
            title={
              serverError.kind === "invalidCredentials"
                ? t("login.invalidCredentialsTitle")
                : serverError.kind === "rateLimited"
                  ? t("login.rateLimitedTitle")
                  : undefined
            }
          >
            {serverError.message}
            {serverError.kind === "invalidCredentials" && (
              <span className="alert-suggestion">{t("login.invalidCredentialsSuggestion")}</span>
            )}
            {serverError.kind === "rateLimited" && (
              <span className="alert-suggestion">{t("login.rateLimitedSuggestion")}</span>
            )}
          </Alert>
        )}

        {/* Google authentication first */}
        <div className="space-y-2">
          <GoogleSignInButton text="signin_with" onCredential={handleGoogleCredential} onError={(message) => setServerError({ message, kind: "other" })} />
        </div>

        <div className="relative my-2 flex items-center justify-center">
          <span className="w-full border-t" />
          <span className="absolute bg-background px-2 text-xs text-muted-foreground">
            {t("login.orContinueWith")}
          </span>
        </div>

        {/* Manual sign in */}
        {/* Mobile */}
        <div className="space-y-1.5">
          <Label htmlFor="mobile">{t("login.mobile")}</Label>

          <Input
            id="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="10-digit mobile number"
            hasError={!!errors.mobile}
            {...register("mobile")}
          />

          {errors.mobile ? (
            <FieldError>{t(errors.mobile.message!)}</FieldError>
          ) : (
            <FieldHint>{t("login.mobileHint")}</FieldHint>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("login.password")}</Label>

          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              hasError={!!errors.password}
              className="pr-11"
              {...register("password")}
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          <FieldError>
            {errors.password && t(errors.password.message!)}
          </FieldError>
        </div>

        {/* Forgot password */}
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("login.forgotPassword")}
          </Link>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          isLoading={isSubmitting}
          className="w-full"
        >
          <span>{t("login.submit")}</span>
          {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>


      </form>
    </AuthLayout>
  );
}

