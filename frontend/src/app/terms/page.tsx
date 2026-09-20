export const metadata = {
  title: "Terms & Conditions — Anndata",
  description: "Terms and conditions for using the Anndata platform.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">Anndata</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Terms & Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective date: September 1, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
          <section><h2 className="text-xl font-bold text-foreground">1. About these terms</h2><p className="mt-3">These Terms & Conditions govern your use of the Anndata/FarmLink website, application, APIs and related services. By using the service, you agree to these terms. If you do not agree, do not use the service.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">2. The service</h2><p className="mt-3">Anndata provides agricultural information, market intelligence, buyer discovery, matching, trade workflow and related coordination features. Features may change as the platform develops.</p><p className="mt-3">Some information is sourced from external providers or public datasets. Availability, freshness and accuracy can vary.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">3. Accounts</h2><p className="mt-3">You are responsible for information supplied for your account and for protecting your login credentials. Do not impersonate another person, create fraudulent records, or use another person's account without authorization.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">4. Agricultural and market information</h2><p className="mt-3">Market prices, forecasts, quality assessments, matching results, storage information, logistics estimates and other analytical outputs are informational or operational aids. They are not guarantees of price, sale, crop quality, warehouse availability, transport availability, delivery time or financial outcome.</p><p className="mt-3">Forecasts and AI-assisted outputs may be wrong or unavailable. You remain responsible for decisions made using the service.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">5. Buyer and seller transactions</h2><p className="mt-3">Anndata may facilitate discovery, offers and workflow coordination, but a buyer-demand listing or match does not by itself create a binding sale. Users are responsible for reviewing counterparties, quantities, quality, prices, delivery terms and other transaction terms before accepting an arrangement.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">6. Payments</h2><p className="mt-3">The current payment-status functionality records payment obligations and reported payment states. It does not itself execute UPI, card, bank-transfer or escrow transactions unless a separately identified payment integration is provided.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">7. WhatsApp</h2><p className="mt-3">The WhatsApp assistant is an additional interface to supported Anndata features. Public conversations may be available without a FarmLink account, while private account information requires account linking and authorization. WhatsApp use is also subject to Meta's applicable terms and policies.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">8. Acceptable use</h2><p className="mt-3">You must not misuse the service, attempt unauthorized access, interfere with infrastructure, submit malicious content, abuse messaging or matching features, scrape protected data, or use the platform for unlawful activity.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">9. Third-party services</h2><p className="mt-3">The platform may depend on third-party services for hosting, maps, market data, messaging, analytics, error monitoring, AI and other infrastructure. Their availability and terms may differ from Anndata's.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">10. Availability and changes</h2><p className="mt-3">We may modify, suspend or discontinue features, including during development, maintenance or third-party outages. We may update these terms when the service or applicable requirements change.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">11. Limitation of responsibility</h2><p className="mt-3">To the extent permitted by applicable law, Anndata is not responsible for losses caused by inaccurate external data, third-party outages, user-provided information, counterparties, market movements, logistics events or decisions made solely from platform estimates.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">12. Contact and governing law</h2><p className="mt-3">Questions about these terms can be raised through the contact channels made available on the Anndata website. These terms are intended to operate subject to applicable laws of India and the jurisdiction applicable to the service operator.</p></section>

          <section><h2 className="text-xl font-bold text-foreground">13. Legal notice</h2><p className="mt-3">This page is a product terms draft for the Anndata project and should be reviewed by a qualified legal professional before being relied upon as the final contractual terms for a commercial launch.</p></section>
        </div>
      </article>
    </main>
  );
}
