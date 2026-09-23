"use client";

import * as React from "react";
import Script from "next/script";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

// Minimal shape of the bits of the Google Identity Services global we
// actually use. The real implementation is loaded from Google's script.
interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              width?: number;
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "rectangular" | "pill" | "circle" | "square";
            },
          ) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  /** "signin_with" for the login page, "signup_with" for register. */
  text?: "signin_with" | "signup_with" | "continue_with";
  onCredential: (idToken: string) => Promise<void> | void;
  onError?: (message: string) => void;
}

// GIS is loaded once for the whole SPA. Next.js client-side navigation can
// unmount /login and mount /register without reloading the Google script.
// Keeping initialization state outside the component prevents the new page
// from waiting for an onLoad event that already happened, while the callback
// ref below always points at the currently mounted page.
let gisInitialized = false;

export function GoogleSignInButton({
  text = "signin_with",
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const buttonRef = React.useRef<HTMLDivElement>(null);
  const callbackRef = React.useRef(onCredential);
  const errorRef = React.useRef(onError);

  React.useEffect(() => {
    callbackRef.current = onCredential;
    errorRef.current = onError;
  }, [onCredential, onError]);

  const renderGoogleButton = React.useCallback(() => {
    if (!buttonRef.current || !window.google || !GOOGLE_CLIENT_ID) return;

    if (!gisInitialized) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          Promise.resolve(callbackRef.current(response.credential)).catch((err) => {
            errorRef.current?.(
              err instanceof Error ? err.message : "Google sign-in failed. Please try again.",
            );
          });
        },
      });
      gisInitialized = true;
    }

    // A newly mounted login/register page gets a fresh container. Clear it
    // defensively before rendering so SPA navigation can never leave a stale
    // Google button behind.
    buttonRef.current.replaceChildren();

    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text,
      width: 320,
    });
  }, [text]);

  React.useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    // Important for Next.js client-side navigation: the Google script may
    // already be loaded before this component mounts, so onLoad will not fire
    // again. Check the global immediately and also retry briefly while the
    // script is loading.
    if (window.google) {
      renderGoogleButton();
      return;
    }

    const interval = window.setInterval(() => {
      if (window.google) {
        window.clearInterval(interval);
        renderGoogleButton();
      }
    }, 50);

    return () => window.clearInterval(interval);
  }, [renderGoogleButton]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
      <div className="flex justify-center" ref={buttonRef} />
    </>
  );
}
