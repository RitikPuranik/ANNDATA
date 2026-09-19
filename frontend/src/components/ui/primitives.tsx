import * as React from "react";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) { return <label className={cn("field-label", className)} {...props} />; }

// A plain-language error message shown directly under the field it
// belongs to, with a small icon so it reads as "something's wrong here"
// at a glance rather than blending in with the rest of the copy on the
// page. `role="alert"` means screen readers announce it as soon as it
// appears, without the person needing to go looking for it.
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="field-error">
      <AlertCircle aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// Quiet helper text shown under a field *before* there's anything wrong
// with it — a format example ("e.g. 98765 43210"), a valid range, etc.
// The goal is to head off the mistake in the first place instead of only
// explaining it after the person has already submitted.
export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="field-hint">
      <Info aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("surface-card", className)} {...props} />; }

const alertClasses = { error: "alert-error", success: "alert-success", info: "alert-info" };
const alertIcons = { error: XCircle, success: CheckCircle2, info: Info };

export function Alert({
  variant = "info",
  title,
  className,
  children,
}: {
  variant?: "error" | "success" | "info";
  /** Optional short heading shown above the message, e.g. "Couldn't create your account". */
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = alertIcons[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("alert-box", alertClasses[variant], className)}>
      {title ? (
        <>
          <p className="alert-box-title">
            <Icon aria-hidden="true" />
            <span>{title}</span>
          </p>
          <div className="mt-1">{children}</div>
        </>
      ) : (
        <div className="flex items-start gap-2">
          <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />
          <div>{children}</div>
        </div>
      )}
    </div>
  );
}

// A single "here's what to fix" list shown at the top of a form once the
// person has tried to submit with multiple invalid fields, so they don't
// have to hunt through the whole form to find every problem — it's all in
// one place, in plain language, right away.
export function ErrorSummary({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="alert-box alert-error">
      <p className="alert-box-title">
        <XCircle aria-hidden="true" />
        <span>{title}</span>
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
