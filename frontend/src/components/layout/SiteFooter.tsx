import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-7 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground">© 2026 Anndata. All rights reserved.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/docs" className="text-muted-foreground transition-colors hover:text-foreground">Documentation</Link>
          <Link href="/terms" className="text-muted-foreground transition-colors hover:text-foreground">Terms & Conditions</Link>
          <Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">Privacy Policy</Link>
        </nav>
      </div>
    </footer>
  );
}
