"use client";

import * as React from "react";
import Script from "next/script";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

// Minimal shape of the bits of the Google Identity Services global we
// actually use — the real type comes from Google's own script, which we
// don't bundle a package for.
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

/**
 * Renders Google's own "Sign in with Google" button via Google Identity
 * Services (loaded from accounts.google.com — see publish rules elsewhere
 * in this codebase's docs: this is the one allowed cdnjs-equivalent
 * exception, google-hosted and required for GIS to work at all). The
 * button itself handles the popup/One Tap flow; we only get a callback
 * with a signed ID token, which we hand straight to the backend for
 * verification (never trusted client-side).
 */
export function GoogleSignInButton({ text = "signin_with", onCredential, onError }: GoogleSignInButtonProps) {
  const buttonRef = React.useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = React.useState(false);

  const handleCredential = React.useCallback(
    async (response: GoogleCredentialResponse) => {
      try {
        await onCredential(response.credential);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      }
    },
    [onCredential, onError],
  );

  React.useEffect(() => {
    if (!scriptLoaded || !buttonRef.current || !window.google) return;

    if (!GOOGLE_CLIENT_ID) {
      // Not configured for this environment — silently omit the button
      // rather than rendering something broken.
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text,
      width: 320,
    });
  }, [scriptLoaded, text, handleCredential]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div className="flex justify-center" ref={buttonRef} />
    </>
  );
}
