import Link from "next/link";

export const metadata = {
  title: "404 — Page Not Found | Anndata",
  description: "The page you're looking for could not be found.",
};

function Floral404() {
  const flower = (cx: number, cy: number, r = 7) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy - r} r={r * 0.72} fill="#fff" />
      <circle cx={cx + r} cy={cy - r * 0.25} r={r * 0.72} fill="#fff" />
      <circle cx={cx + r * 0.55} cy={cy + r * 0.85} r={r * 0.72} fill="#fff" />
      <circle cx={cx - r * 0.55} cy={cy + r * 0.85} r={r * 0.72} fill="#fff" />
      <circle cx={cx - r} cy={cy - r * 0.25} r={r * 0.72} fill="#fff" />
      <circle cx={cx} cy={cy} r={r * 0.58} fill="#f2c83b" />
      <circle cx={cx} cy={cy} r={r * 0.23} fill="#e78a35" />
    </g>
  );

  const vine = (x: number, y: number, flip = false) => (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M0 105 C18 80 5 47 28 0" fill="none" stroke="#26933b" strokeWidth="5" strokeLinecap="round" />
      {[18, 34, 50, 67, 84].map((n, i) => (
        <g key={n}>
          <path d={`M18 ${n} C4 ${n - 9} -3 ${n - 4} -8 ${n + 5} C5 ${n + 8} 13 ${n + 4} 18 ${n}`} fill="#49ad43" />
          <path d={`M18 ${n} C32 ${n - 10} 40 ${n - 6} 44 ${n + 2} C34 ${n + 7} 25 ${n + 4} 18 ${n}`} fill="#2e9a3e" />
        </g>
      ))}
    </g>
  );

  return (
    <svg viewBox="0 0 900 360" role="img" aria-label="Floral 404 illustration" className="h-auto w-full">
      <defs>
        <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#185e29" floodOpacity=".12" />
        </filter>
      </defs>

      <g filter="url(#soft-shadow)">
        {/* 4 */}
        <path d="M105 250 L210 250 L210 295 L263 295 L263 250 L285 250 L285 213 L263 213 L263 74 L211 74 L105 213 Z M150 213 L211 128 L211 213 Z" fill="#168232" />
        <path d="M132 212 L211 212" stroke="#0e6826" strokeWidth="7" opacity=".55" />
        {/* 0 */}
        <path d="M346 69 C274 69 254 121 254 185 C254 251 279 296 346 296 C414 296 440 250 440 184 C440 120 414 69 346 69 Z M346 113 C371 113 380 139 380 184 C380 228 371 252 346 252 C321 252 313 227 313 184 C313 139 321 113 346 113 Z" fill="#168232" />
        {/* 4 */}
        <path d="M497 250 L601 250 L601 295 L654 295 L654 250 L676 250 L676 213 L654 213 L654 74 L602 74 L497 213 Z M542 213 L602 128 L602 213 Z" fill="#168232" />
      </g>

      {/* vines, leaves and flowers */}
      {vine(122, 60)}
      {vine(208, 62, true)}
      {vine(286, 55)}
      {vine(382, 57, true)}
      {vine(505, 61)}
      {vine(612, 62, true)}
      {vine(678, 63)}

      {[
        [141, 202], [183, 166], [216, 112], [234, 235], [291, 241],
        [306, 103], [338, 91], [366, 143], [399, 226], [475, 205],
        [529, 145], [567, 93], [618, 190], [646, 135], [688, 222],
        [742, 192],
      ].map(([x, y], i) => (
        <g key={i} transform={`rotate(${i % 2 ? -12 : 10} ${x} ${y})`}>
          {flower(x, y, i % 3 === 0 ? 8 : 6)}
        </g>
      ))}

      {/* red/orange accent flowers */}
      {[[126, 178], [268, 230], [362, 265], [520, 218], [666, 235]].map(([x, y], i) => (
        <g key={`accent-${i}`} transform={`translate(${x} ${y})`}>
          <circle cx="0" cy="-8" r="6" fill="#f45143" />
          <circle cx="7" cy="2" r="6" fill="#f45143" />
          <circle cx="-7" cy="2" r="6" fill="#f45143" />
          <circle cx="0" cy="0" r="4" fill="#f5c53c" />
        </g>
      ))}
    </svg>
  );
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white px-5 py-8 text-center">
      <div className="w-full max-w-[900px]">
        <Floral404 />
      </div>

      <div className="-mt-1 sm:-mt-3">
        <p className="font-display text-[82px] font-black leading-none tracking-tight text-[#168232] sm:text-[105px]">
          404
        </p>
        <p className="mx-auto mt-3 max-w-[290px] font-sans text-[12px] italic leading-[1.45] text-[#26933b] sm:text-[14px]">
          Sorry, page is not found.<br />
          Please go back.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-[7px] bg-[#35a940] px-5 py-2 text-[11px] font-extrabold lowercase text-white shadow-sm transition hover:bg-[#258d31] hover:-translate-y-0.5"
        >
          back home
        </Link>
      </div>

      <Link
        href="/"
        className="mt-12 text-[10px] font-semibold lowercase tracking-wide text-[#35a940] transition hover:text-[#168232]"
      >
        designed for Anndata · made with care
      </Link>
    </main>
  );
}
