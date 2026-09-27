"use client";

import * as React from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Card, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { whatsappApi, WhatsAppLinkStatus, WhatsAppLinkCode } from "@/services/whatsappApi";
import { ApiRequestError } from "@/types/api";

function formatTimeLeft(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Lets a farmer link their WhatsApp number to their Anndata account so the
 * WhatsApp assistant can act on their behalf (find buyers, view/manage lots,
 * offers, payments, shipments) instead of only answering with public data
 * as a guest.
 *
 * One-time process per number: request a code here, then send
 * "LINK <code>" from that WhatsApp number to Anndata's WhatsApp number.
 * The code is single-use, expires in 10 minutes, and is shown only once —
 * this screen never re-displays it after a reload.
 */
export function WhatsAppLinkCard() {
  const [status, setStatus] = React.useState<WhatsAppLinkStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState(true);
  const [issuedCode, setIssuedCode] = React.useState<WhatsAppLinkCode | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  const loadStatus = React.useCallback(async () => {
    setLoadingStatus(true);
    try {
      setStatus(await whatsappApi.getLinkStatus());
    } catch {
      setError("Couldn't load your WhatsApp link status. Please refresh the page.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Tick once a second only while a freshly issued code is on screen, so
  // the "expires in mm:ss" countdown stays accurate without polling the
  // server.
  React.useEffect(() => {
    if (!issuedCode) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [issuedCode]);

  const msLeft = issuedCode ? new Date(issuedCode.expiresAt).getTime() - now : 0;
  const expired = !!issuedCode && msLeft <= 0;

  async function handleGetCode() {
    setError(null);
    setBusy(true);
    try {
      const code = await whatsappApi.issueLinkCode();
      setIssuedCode(code);
      setCopied(false);
      setNow(Date.now());
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Couldn't create a link code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(`LINK ${issuedCode.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the code is still
      // visible on screen to copy by hand.
    }
  }

  async function handleUnlink() {
    setError(null);
    setBusy(true);
    try {
      await whatsappApi.unlink();
      setIssuedCode(null);
      await loadStatus();
    } catch {
      setError("Couldn't unlink your WhatsApp number. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 section-title">
        <MessageCircle className="h-5 w-5" aria-hidden />
        WhatsApp assistant
      </h2>

      {loadingStatus ? (
        <p className="text-sm text-muted-foreground">Checking your WhatsApp link status…</p>
      ) : (
        <>
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          {status?.linked ? (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Your WhatsApp number ending in{" "}
                <span className="font-semibold text-foreground">{status.phoneMasked}</span> is
                linked to your account. Messages from this number can view and manage your lots,
                offers, payments and shipments.
              </p>
              <Button variant="destructive" isLoading={busy} onClick={handleUnlink}>
                Unlink this number
              </Button>
            </>
          ) : issuedCode ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                From the WhatsApp number you want to link, send this message to Anndata:
              </p>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-input bg-secondary/50 px-4 py-3">
                <code className="text-base font-bold tracking-wide">LINK {issuedCode.code}</code>
                <Button
                  type="button"
                  variant="outline"
                  className="w-auto px-3 py-2"
                  onClick={handleCopy}
                  aria-label="Copy code"
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{issuedCode.instruction}</p>
              {expired ? (
                <Alert variant="error">
                  This code has expired. Request a new one below.
                </Alert>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Expires in {formatTimeLeft(msLeft)} · single use
                </p>
              )}
              <Button isLoading={busy} onClick={handleGetCode}>
                {expired ? "Get a new code" : "Get a new code instead"}
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Link your WhatsApp number to talk to the Anndata assistant about your own lots,
                offers, payments and shipments — not just public mandi prices. This is a one-time
                step; the code is single-use and expires in 10 minutes.
              </p>
              <Button isLoading={busy} onClick={handleGetCode}>
                Get a link code
              </Button>
            </>
          )}
        </>
      )}
    </Card>
  );
}
