"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export interface PasswordRule {
  key: string;
  test: (value: string) => boolean;
}

// Kept in one place so the register form, the reset-password form, and the
// zod schema in auth.schemas.ts can never drift apart on what "a valid
// password" actually means.
export const PASSWORD_RULES: PasswordRule[] = [
  { key: "password.rule.length", test: (v) => v.length >= 8 && v.length <= 128 },
  { key: "password.rule.upper", test: (v) => /[A-Z]/.test(v) },
  { key: "password.rule.lower", test: (v) => /[a-z]/.test(v) },
  { key: "password.rule.number", test: (v) => /\d/.test(v) },
];

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

/**
 * Shows every password requirement at once, each ticked off live as the
 * person types, instead of a single pass/fail message after they submit.
 * That answers all three things the user asked for in one place: what's
 * wrong (the ones still unchecked), in simple language (one short rule per
 * line), and what to do about it (fix just that one thing).
 */
export function PasswordChecklist({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <div className="password-checklist" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const met = value.length > 0 && rule.test(value);
        return (
          <div key={rule.key} className={`password-checklist-item ${met ? "met" : "unmet"}`}>
            {met ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
            <span>{t(rule.key)}</span>
          </div>
        );
      })}
    </div>
  );
}
