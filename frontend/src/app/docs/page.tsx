import Link from "next/link";

export const metadata = {
  title: "Documentation — Anndata",
  description: "Learn how Anndata connects farmers, buyers, FPOs and agricultural trade workflows.",
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="mb-10">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">Anndata</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">Documentation</h1>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Anndata is an agricultural intelligence and marketplace platform designed to help farmers,
            FPOs, buyers and logistics participants move from market information to transparent trade workflows.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">How Anndata works</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The platform combines farmer and farm profiles, crop lots, quality information, mandi prices,
              price forecasting, sell-vs-store intelligence, buyer demand, matching, offers, logistics,
              shipment tracking, delivery reconciliation and payment status.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">Market intelligence</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Market information is presented with its source and freshness context where available.
              Reference mandi prices are not the same thing as a buyer&apos;s target price or a negotiated offer.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">Buyer matching</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Matching uses Anndata&apos;s domain services and considers factors such as crop compatibility,
              quality, quantity and location. Buyer demand shown to visitors is not a guarantee of a sale.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">WhatsApp assistant</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The public WhatsApp assistant can answer supported market questions, help users describe
              produce they want to sell and show safe buyer-demand previews. Private account data requires
              an explicitly linked Anndata account.
            </p>
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold">Data and decision transparency</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Unknown information is kept unavailable rather than silently fabricated.</p>
            <p>AI-assisted features are subject to provider availability and confidence/data-sufficiency rules.</p>
            <p>Deterministic business engines preserve the inputs used for important historical decisions.</p>
            <p>Payment Status Tracking records payment obligations and statuses. It is not a payment gateway and does not itself move money.</p>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link href="/terms" className="font-semibold text-primary hover:underline">Terms & Conditions</Link>
          <Link href="/privacy" className="font-semibold text-primary hover:underline">Privacy Policy</Link>
          <Link href="/" className="font-semibold text-primary hover:underline">Back to Anndata</Link>
        </div>
      </div>
    </main>
  );
}
