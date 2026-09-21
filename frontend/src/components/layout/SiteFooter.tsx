import Link from "next/link";
import { ArrowUpRight, BookOpen, FileText, Leaf, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";

const links = [
  { href: "/docs", label: "Documentation", icon: BookOpen },
  { href: "/terms", label: "Terms & Conditions", icon: FileText },
  { href: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-[#29281f] bg-[#15150f] text-[#f8f4e9]">
      <div className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-[#d6b841]/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-[#6f8b45]/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 pb-6 pt-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr] md:gap-16">
          <div>
            <Link href="/" className="group inline-flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[#d6b841]/20 bg-[#211f16] shadow-lg shadow-black/20 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
                <LogoMark className="h-10 w-10" />
              </span>
              <span>
                <span className="block text-xl font-black tracking-tight">Anndata</span>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#d6b841]">
                  Every meal begins with a farmer
                </span>
              </span>
            </Link>

            <p className="mt-6 max-w-xl text-sm leading-7 text-[#a8a59a]">
              Connecting farmers, buyers and agricultural communities with market intelligence,
              transparent trade workflows and technology built around the people who grow our food.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#3a382d] bg-[#1c1b15] px-3.5 py-2 text-[11px] font-semibold text-[#b9b5a8]">
              <Leaf className="h-3.5 w-3.5 text-[#d6b841]" />
              Agriculture · Technology · Opportunity
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6b841]">
              Explore Anndata
            </p>

            <nav aria-label="Footer" className="mt-4 grid gap-2">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-3 text-sm font-semibold text-[#d2cfc4] transition-all duration-200 hover:border-[#3a382d] hover:bg-[#211f17] hover:text-white"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#211f17] text-[#d6b841] transition-colors group-hover:bg-[#d6b841] group-hover:text-[#171714]">
                      <Icon className="h-4 w-4" />
                    </span>
                    {label}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-[#625f53] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#d6b841]" />
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="my-9 h-px bg-gradient-to-r from-transparent via-[#3a382d] to-transparent" />

        <div className="flex flex-col gap-4 text-xs text-[#77746a] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Anndata. Built for the agricultural community.</p>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d6b841]" />
            <span>Transparent data. Practical intelligence. Human decisions.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
