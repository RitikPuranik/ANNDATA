import Link from "next/link";
import { ArrowLeft, Home, Search } from "lucide-react";

export const metadata = {
  title: "404 — Page Not Found | Anndata",
  description: "The page you're looking for could not be found.",
};

function TractorIllustration() {
  return (
    <svg
      viewBox="0 0 760 360"
      role="img"
      aria-label="Illustration of a tractor on a farm road"
      className="h-auto w-full max-w-[760px]"
    >
      <path d="M95 300H665" stroke="#E7A34F" strokeWidth="18" strokeLinecap="round" />
      <g stroke="#363936" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M300 198l72-42 88 26v85H276z" fill="#A92E42" />
        <path d="M372 156l9-81h36l10 101" fill="#A92E42" />
        <path d="M407 75l81 0 52 82-16 14-60-66-54 8z" fill="#DCE6E5" />
        <path d="M451 91l45 69M493 92l42 65" stroke="#536267" strokeWidth="5" />
        <path d="M344 200h100" />
        <path d="M264 205l-67-42-36 35 81 50" fill="none" />
        <path d="M439 266h83" strokeWidth="20" />
        <path d="M526 159c42 0 74 29 86 61" fill="none" />
        <path d="M536 219c14-29 40-43 69-42" fill="none" />
        <path d="M344 135l-33-25" />
      </g>

      <g stroke="#363936" strokeWidth="8">
        <circle cx="226" cy="272" r="57" fill="#303231" />
        <circle cx="226" cy="272" r="25" fill="#F5EAE0" />
        <circle cx="226" cy="272" r="8" fill="#303231" />
        <circle cx="545" cy="249" r="88" fill="#303231" />
        <circle cx="545" cy="249" r="38" fill="#F5EAE0" />
        <circle cx="545" cy="249" r="12" fill="#303231" />
      </g>

      <g fill="#F5EAE0" stroke="#363936" strokeWidth="5">
        <path d="M84 123h40c11 0 11 14 0 14H84c-12 0-12-14 0-14z" />
        <path d="M100 105h26c10 0 10 13 0 13h-26c-10 0-10-13 0-13z" />
        <path d="M618 128h35c11 0 11 14 0 14h-35c-11 0-11-14 0-14z" />
        <path d="M642 108h28c10 0 10 13 0 13h-28c-10 0-10-13 0-13z" />
        <path d="M172 65h39c11 0 11 14 0 14h-39c-11 0-11-14 0-14z" />
        <path d="M199 44h30c10 0 10 13 0 13h-30c-10 0-10-13 0-13z" />
        <path d="M458 34h33c10 0 10 13 0 13h-33c-10 0-10-13 0-13z" />
      </g>

      <g fill="none" stroke="#363936" strokeWidth="5" strokeLinecap="round">
        <path d="M112 133h19M109 113h12M639 137h18M651 115h12M185 72h17M210 51h12M467 41h15" />
      </g>
    </svg>
  );
}

export default function NotFound() {
  return (
    <main className="min-h-[calc(100vh-1px)] bg-[#f5eae0] px-5 py-10 text-[#8f2538] sm:px-8 sm:py-14">
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl flex-col items-center justify-center text-center">
        <div className="mb-4 w-full">
          <TractorIllustration />
        </div>

        <div className="-mt-1">
          <p className="font-display text-7xl font-black leading-none tracking-tight sm:text-8xl md:text-9xl">
            404
          </p>
          <h1 className="mt-2 font-display text-2xl font-black tracking-tight sm:text-4xl md:text-5xl">
            Looks like something broke.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm font-semibold leading-6 text-[#665b55] sm:text-base">
            This page wandered off the farm. Let&apos;s get you back to Anndata.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-[#8f2538] px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#8f2538]/20 transition-transform hover:-translate-y-0.5"
          >
            <Home className="h-4 w-4" />
            Back Home
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[#8f2538]/20 bg-white/60 px-6 py-3 text-sm font-extrabold text-[#8f2538] transition-colors hover:bg-white"
          >
            <Search className="h-4 w-4" />
            Explore Anndata
          </Link>
        </div>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#665b55] transition-colors hover:text-[#8f2538]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Return to the farm
        </Link>
      </div>
    </main>
  );
}
