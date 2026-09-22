"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Alert } from "@/components/ui/primitives";

/**
 * A small, self-contained "Need help? Contact support" widget. Posts to
 * the backend's /api/contact-support endpoint, which renders the message
 * and sends it via whichever EmailProvider is configured server-side
 * (see backend/src/modules/notifications/contactSupport.routes.ts).
 *
 * EmailJS credentials no longer need to be shipped to the browser at
 * all — this replaces the previous direct browser -> EmailJS call
 * (formerly frontend/src/lib/emailjs.ts, now removed).
 *
 * Collapsed by default; expands into a 2-field form when opened.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function ContactSupportForm({ context }: { context?: string }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/contact-support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: email,
          message,
          context: context ?? "General",
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage("Couldn't send your message. Please try again in a moment.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Need help? Contact support
      </button>
    );
  }

  if (status === "sent") {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        Thanks — we've got your message and will get back to you soon.
      </div>
    );
  }

  return (
    <form className="space-y-4 rounded-lg border border-border p-4" onSubmit={handleSubmit}>
      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      <div>
        <Label htmlFor="support-email">Your email</Label>
        <Input
          id="support-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="support-message">How can we help?</Label>
        <textarea
          id="support-message"
          required
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" isLoading={status === "sending"}>
          Send message
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
