"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/I18nProvider";
import { AuthLayout } from "@/components/AuthLayout";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { ROLE_HOME_ROUTE } from "@/lib/roleRouting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError, FieldHint, Alert, ErrorSummary } from "@/components/ui/primitives";
import { PasswordChecklist } from "@/components/ui/PasswordChecklist";
import { RegisterFormValues, registerFormSchema } from "@/features/auth/auth.schemas";
import { ApiRequestError } from "@/types/api";
import { applyServerFieldErrors, isFieldConflict } from "@/lib/formErrors";

const LANGUAGE_OPTIONS: { value: "en" | "hi" | "mr"; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "mr", label: "मराठी (Marathi)" },
];

export default function RegisterPage() {
  const { t } = useI18n();
  const { register: registerUser, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = React.useState<{
    message: string;
    kind: "mobileTaken" | "emailTaken" | "other";
  } | null>(null);
  const [showSummary, setShowSummary] = React.useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { preferredLanguage: "en" },
  });

  const passwordValue = watch("password") ?? "";

  async function handleGoogleCredential(idToken: string) {
    setServerError(null);
    try {
      const user = await loginWithGoogle(idToken);
      router.push(ROLE_HOME_ROUTE[user.role]);
    } catch (err) {
      setServerError({
        message: err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.",
        kind: "other",
      });
    }
  }

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    try {
      await registerUser({
        fullName: values.fullName,
        mobile: values.mobile,
        email: values.email || undefined,
        password: values.password,
        preferredLanguage: values.preferredLanguage,
      });
      router.push("/login?registered=1");
    } catch (err) {
      if (isFieldConflict<RegisterFormValues>(err, "mobile")) {
        setServerError({ message: (err as ApiRequestError).message, kind: "mobileTaken" });
        return;
      }
      if (isFieldConflict<RegisterFormValues>(err, "email")) {
        setServerError({ message: (err as ApiRequestError).message, kind: "emailTaken" });
        return;
      }
      const message = applyServerFieldErrors(err, setError, [
        "fullName",
        "mobile",
        "email",
        "password",
        "confirmPassword",
        "preferredLanguage",
      ] as const);
      setServerError({
        message: message ?? (err instanceof ApiRequestError ? err.message : t("common.networkError")),
        kind: "other",
      });
    }
  }

  const errorSummaryItems = Object.values(errors)
    .map((e) => (e && typeof e.message === "string" ? t(e.message) : null))
    .filter((m): m is string => !!m);

  return (
    <AuthLayout
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      footer={
        <span className="text-muted-foreground">
          {t("register.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("register.login")}
          </Link>
        </span>
      }
    >
      {/* Deliberately no role field anywhere in this form — public
          registration always creates a FARMER account server-side. */}
      <form
        className="space-y-5"
        onSubmit={handleSubmit(onSubmit, () => setShowSummary(true))}
        noValidate
      >
        {showSummary && errorSummaryItems.length > 1 && (
          <ErrorSummary title={t("common.fixErrorsTitle")} items={errorSummaryItems} />
        )}

        {serverError && (
          <Alert
            variant="error"
            title={
              serverError.kind === "mobileTaken"
                ? t("register.mobileTakenTitle")
                : serverError.kind === "emailTaken"
                  ? t("register.emailTakenTitle")
                  : undefined
            }
          >
            {serverError.message}
            {serverError.kind === "mobileTaken" && (
              <span className="alert-suggestion">
                {t("register.mobileTakenSuggestion")}{" "}
                <Link href="/login">{t("register.login")}</Link>
              </span>
            )}
            {serverError.kind === "emailTaken" && (
              <span className="alert-suggestion">{t("register.emailTakenSuggestion")}</span>
            )}
          </Alert>
        )}

        {/* Google authentication first */}
        <div className="space-y-2">
          <GoogleSignInButton
            text="signup_with"
            onCredential={handleGoogleCredential}
            onError={(message) => setServerError({ message, kind: "other" })}
          />
        </div>

        <div className="relative my-2 flex items-center justify-center">
          <span className="w-full border-t" />
          <span className="absolute bg-background px-2 text-xs text-muted-foreground">
            {t("login.orContinueWith")}
          </span>
        </div>

        {/* Manual sign up */}
        <div>
          <Label htmlFor="fullName">{t("register.fullName")}</Label>
          <Input id="fullName" autoComplete="name" hasError={!!errors.fullName} {...register("fullName")} />
          <FieldError>{errors.fullName && t(errors.fullName.message!)}</FieldError>
        </div>

        <div>
          <Label htmlFor="mobile">{t("register.mobile")}</Label>
          <Input
            id="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            hasError={!!errors.mobile}
            {...register("mobile")}
          />
          {errors.mobile ? (
            <FieldError>{t(errors.mobile.message!)}</FieldError>
          ) : (
            <FieldHint>{t("register.mobileHint")}</FieldHint>
          )}
        </div>

        <div>
          <Label htmlFor="email">{t("register.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            hasError={!!errors.email}
            {...register("email")}
          />
          <FieldError>{errors.email && t(errors.email.message!)}</FieldError>
        </div>

        <div>
          <Label htmlFor="password">{t("register.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            hasError={!!errors.password}
            {...register("password")}
          />
          {errors.password && <FieldError>{t(errors.password.message!)}</FieldError>}
          <PasswordChecklist value={passwordValue} />
        </div>

        <div>
          <Label htmlFor="confirmPassword">{t("register.confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            hasError={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          <FieldError>{errors.confirmPassword && t(errors.confirmPassword.message!)}</FieldError>
        </div>

        <div>
          <Label htmlFor="preferredLanguage">{t("register.preferredLanguage")}</Label>
          <select
            id="preferredLanguage"
            className="flex h-14 w-full rounded-lg border border-input bg-card px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...register("preferredLanguage")}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" isLoading={isSubmitting}>
          {t("register.submit")}
        </Button>


      </form>
    </AuthLayout>
  );
}
