export const metadata = {
  title: "Privacy Policy — Anndata",
  description: "Privacy policy for the Anndata platform.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">Anndata</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective date: September 1, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
          <section><h2 className="text-xl font-bold text-foreground">1. Scope</h2><p className="mt-3">This Privacy Policy explains how Anndata/FarmLink may collect, use, store and protect information when you use the website, application, APIs and WhatsApp assistant.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">2. Information we may collect</h2><p className="mt-3">Depending on the features you use, information may include account and profile details, contact information, farm and crop information, lot and quality information, buyer or FPO information, transaction workflow information, logistics and shipment information, support messages, device/technical information and usage events.</p><p className="mt-3">WhatsApp conversations may include the sender&apos;s WhatsApp identifier, message content, timestamps, media metadata and conversation state required to provide the assistant.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">3. Public WhatsApp conversations</h2><p className="mt-3">The public WhatsApp assistant can be used without registering a FarmLink account. Guest conversations are kept separate from private farmer account data. Public buyer previews are intentionally limited and do not expose private contact information or protected buyer pricing.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">4. How we use information</h2><ul className="mt-3 list-disc space-y-2 pl-5"><li>Provide and secure the platform.</li><li>Maintain accounts, farms, lots and trade workflows.</li><li>Provide market intelligence, matching and logistics features.</li><li>Respond to WhatsApp and support requests.</li><li>Prevent abuse, fraud and unauthorized access.</li><li>Monitor reliability, errors and product usage.</li><li>Improve platform features and service quality.</li></ul></section>
          <section><h2 className="text-xl font-bold text-foreground">5. Data sharing</h2><p className="mt-3">Information may be processed by service providers that help operate the platform, such as hosting, database, messaging, analytics, error-monitoring, AI or other infrastructure providers. We aim to share only the information needed for the relevant service.</p><p className="mt-3">We do not treat private account information as public merely because a user interacts through WhatsApp.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">6. Analytics and monitoring</h2><p className="mt-3">Technical monitoring and product analytics may be used to understand errors, performance and feature usage. Passwords, access tokens, OTPs and API secrets should not be sent to analytics or monitoring systems.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">7. Data retention</h2><p className="mt-3">Information is retained for as long as reasonably necessary for the purpose for which it was collected, including account operation, security, transaction records, support and legal obligations. Retention periods may differ by data type.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">8. Security</h2><p className="mt-3">The platform uses controls such as authentication, authorization, validation, rate limiting, audit logging, encrypted transport and protected server-side credentials. No online service can guarantee absolute security.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">9. Your choices</h2><p className="mt-3">Depending on the applicable law and the feature involved, you may request access to, correction of, or deletion of personal information, or ask questions about its processing. Requests should be made through the contact channels provided by Anndata.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">10. Children</h2><p className="mt-3">The service is intended for users who can lawfully use it under applicable law. We do not knowingly design the platform to collect children&apos;s personal information for unrelated purposes.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">11. Third-party platforms</h2><p className="mt-3">When you use WhatsApp, Meta processes information under its own terms and privacy policies. Similar rules apply to other third-party services integrated into the platform.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">12. Policy changes</h2><p className="mt-3">This policy may be updated as the platform, integrations or applicable requirements change. The effective date above will be updated when material changes are published.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">13. Legal review notice</h2><p className="mt-3">This page is a privacy-policy draft for the Anndata project. It should be reviewed and finalized by a qualified privacy/legal professional before commercial launch, especially for applicable Indian data-protection obligations and any cross-border processing.</p></section>
        </div>
      </article>
    </main>
  );
}
