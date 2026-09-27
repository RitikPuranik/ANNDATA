/**
 * Branded HTML email templates. Table-based layout with inline styles
 * only (no external CSS/build step, no MJML dependency) so they render
 * consistently across Gmail, Outlook, Apple Mail, etc.
 *
 * These templates are provider-agnostic: whichever EmailProvider is
 * wired up (EmailJSEmailProvider, ...) just takes
 * the finished `html`/`text` strings and sends them as-is. For EmailJS
 * specifically, the dashboard template must render `html_content`
 * UNESCAPED — i.e. `{{{html_content}}}` with triple braces — or this
 * markup will show up as literal text instead of a formatted email. See
 * backend/.env.example for the exact template setup.
 */

const BRAND_COLOR = "#15803d"; // Anndata green
const BRAND_COLOR_DARK = "#0f5c2e";
const TEXT_COLOR = "#1f2937";
const MUTED_COLOR = "#6b7280";
const BORDER_COLOR = "#e5e7eb";
const BG_COLOR = "#f4f6f5";
const CARD_BG = "#ffffff";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Wraps a body block in the shared branded shell: a soft page
 * background, a centered white "card", a gradient header with the
 * Anndata wordmark, and a consistent footer. `preheader` is the hidden
 * inbox-preview snippet shown next to the subject line in most clients.
 */
function shell(preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Anndata</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BG_COLOR}; font-family:${FONT_STACK};">
    <!-- Preheader: hidden, only shows in inbox preview text -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
      ${preheader}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:${CARD_BG}; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(16,24,40,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_DARK} 100%); padding:28px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:22px; font-weight:700; color:#ffffff; letter-spacing:-0.02em;">
                      🌾 Anndata
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:36px 32px 28px 32px; color:${TEXT_COLOR}; font-size:15px; line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px 28px 32px; border-top:1px solid ${BORDER_COLOR};">
                <p style="margin:0; font-size:12px; line-height:1.6; color:${MUTED_COLOR};">
                  You're receiving this email because you have an account on Anndata.
                  If this wasn't you, you can safely ignore this message.
                </p>
                <p style="margin:8px 0 0 0; font-size:12px; color:${MUTED_COLOR};">
                  © ${new Date().getFullYear()} Anndata. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px 0; font-size:20px; font-weight:700; color:${TEXT_COLOR};">${text}</h1>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px 0; color:${TEXT_COLOR};">${text}</p>`;
}

function button(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;">
      <tr>
        <td style="border-radius:8px; background-color:${BRAND_COLOR};">
          <a href="${url}" target="_blank"
             style="display:inline-block; padding:13px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0; font-size:13px; color:${MUTED_COLOR}; word-break:break-all;">
      Or copy and paste this link into your browser:<br />
      <a href="${url}" target="_blank" style="color:${BRAND_COLOR};">${url}</a>
    </p>`;
}

function infoBox(text: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      <tr>
        <td style="background-color:#f0fdf4; border-left:3px solid ${BRAND_COLOR}; border-radius:6px; padding:12px 16px; font-size:13px; color:${TEXT_COLOR};">
          ${text}
        </td>
      </tr>
    </table>`;
}

/** Escapes the handful of characters that matter when dropping user-typed
 * text (email, message, page URL) into an HTML email body. This content
 * is not app-trusted input, unlike the strings the other templates below
 * build from server-known values. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function welcomeEmailTemplate(fullName: string): RenderedEmail {
  const subject = `Welcome to Anndata, ${fullName} — let's get your first lot listed 🌾`;
  const html = shell(
    `Welcome to Anndata, ${fullName} — your account is ready.`,
    `${heading(`Welcome aboard, ${fullName} 👋`)}
     ${paragraph(
       "Your Anndata account is live. In just a few minutes you can list your produce, check today's mandi prices, and connect with verified buyers — all from one dashboard.",
     )}
     ${paragraph("Three quick steps to get started:")}
     <ol style="margin:0 0 20px 0; padding-left:20px; color:${TEXT_COLOR};">
       <li style="margin-bottom:8px;"><strong>Complete your farmer profile</strong> — takes under 2 minutes</li>
       <li style="margin-bottom:8px;"><strong>Add your farm and crop details</strong> so buyers can find you</li>
       <li style="margin-bottom:8px;"><strong>Check today's mandi prices</strong> near you before you list</li>
     </ol>
     ${paragraph("We're glad to have you with us — here's to a good harvest.")}`,
  );
  const text = `Welcome aboard, ${fullName}!\n\nYour Anndata account is live. In a few minutes you can list your produce, check today's mandi prices, and connect with verified buyers.\n\nGet started:\n1. Complete your farmer profile (under 2 minutes)\n2. Add your farm and crop details so buyers can find you\n3. Check today's mandi prices near you before you list\n\nWe're glad to have you with us — here's to a good harvest.`;
  return { subject, html, text };
}

export function passwordResetEmailTemplate(fullName: string, resetUrl: string): RenderedEmail {
  const subject = "Reset your Anndata password (link expires in 30 minutes)";
  const html = shell(
    "Use this link to reset your Anndata password. It expires in 30 minutes.",
    `${heading("Reset your password")}
     ${paragraph(`Hi ${fullName},`)}
     ${paragraph(
       "We received a request to reset the password on your Anndata account. Click the button below to choose a new one — it only takes a moment.",
     )}
     ${button("Reset my password", resetUrl)}
     ${infoBox("⏱ For your security, this link expires in <strong>30 minutes</strong> and can only be used once.")}
     ${paragraph("Didn't request this? No action is needed — your password stays the same, and you can safely ignore this email.")}`,
  );
  const text = `Hi ${fullName},\n\nWe received a request to reset the password on your Anndata account. Use the link below to choose a new one — it only takes a moment.\n\n${resetUrl}\n\nFor your security, this link expires in 30 minutes and can only be used once.\n\nDidn't request this? No action is needed — your password stays the same.`;
  return { subject, html, text };
}

export function passwordResetConfirmationEmailTemplate(fullName: string): RenderedEmail {
  const subject = "Your Anndata password was successfully changed";
  const html = shell(
    "Your Anndata password was just changed.",
    `${heading("Password changed ✅")}
     ${paragraph(`Hi ${fullName},`)}
     ${paragraph("This confirms your Anndata password was just changed successfully. As a precaution, we've signed you out on all other devices — just log back in with your new password.")}
     ${infoBox("🔒 <strong>Wasn't you?</strong> Please contact support right away so we can help secure your account.")}`,
  );
  const text = `Hi ${fullName},\n\nThis confirms your Anndata password was just changed successfully. As a precaution, we've signed you out on all other devices — just log back in with your new password.\n\nWasn't you? Please contact support right away so we can help secure your account.`;
  return { subject, html, text };
}

/**
 * Internal notification sent to the support inbox when a visitor submits
 * the "Contact support" widget (see contactSupport.routes.ts). Unlike the
 * templates above, the dynamic fields here (fromEmail, message, pageUrl)
 * are visitor-typed, not server-known, so they're HTML-escaped before
 * being interpolated.
 */
export function contactSupportEmailTemplate(input: {
  fromEmail: string;
  message: string;
  context?: string;
  pageUrl?: string;
}): RenderedEmail {
  const context = input.context?.trim() || "General";
  const subject = `New support message (${context})`;
  const safeEmail = escapeHtml(input.fromEmail);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br />");
  const safePageUrl = input.pageUrl ? escapeHtml(input.pageUrl) : "";

  const html = shell(
    `New support message from ${safeEmail}`,
    `${heading("New support message")}
     ${paragraph(`<strong>From:</strong> ${safeEmail}`)}
     ${paragraph(`<strong>Context:</strong> ${escapeHtml(context)}`)}
     ${safePageUrl ? paragraph(`<strong>Page:</strong> ${safePageUrl}`) : ""}
     ${infoBox(safeMessage)}`,
  );
  const text = `New support message\n\nFrom: ${input.fromEmail}\nContext: ${context}${
    input.pageUrl ? `\nPage: ${input.pageUrl}` : ""
  }\n\n${input.message}`;
  return { subject, html, text };
}

export function passwordResetOtpEmailTemplate(code: string): RenderedEmail {
  const subject = `${code} is your Anndata password reset code`;
  const html = shell(
    "Your Anndata password reset OTP. It expires in 10 minutes.",
    `${heading("Your password reset code")}
     ${paragraph("We received a request to reset your Anndata password. Enter the verification code below to continue.")}
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
       <tr>
         <td style="background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px 24px; text-align:center;">
           <span style="font-size:32px; line-height:1; font-weight:700; letter-spacing:8px; color:${BRAND_COLOR};">${escapeHtml(code)}</span>
         </td>
       </tr>
     </table>
     ${infoBox("⏱ For your security, this code expires in <strong>10 minutes</strong> and can only be used once. Never share it with anyone — Anndata staff will never ask for it.")}
     ${paragraph("Didn't request a password reset? You can safely ignore this email — your password won't change.")}`,
  );
  const text = `Your Anndata password reset code is: ${code}

For your security, this code expires in 10 minutes and can only be used once. Never share it with anyone — Anndata staff will never ask for it.

Didn't request a password reset? You can safely ignore this email.`;
  return { subject, html, text };
}
