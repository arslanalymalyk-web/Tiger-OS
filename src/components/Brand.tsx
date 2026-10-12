import Link from "next/link";

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="2" y="3" width="28" height="5" rx="1" fill="#b08d4a" />
      <rect x="6" y="10" width="4.5" height="19" fill="#b08d4a" />
      <rect x="13.75" y="10" width="4.5" height="19" fill="#c9a965" />
      <rect x="21.5" y="10" width="4.5" height="19" fill="#b08d4a" />
    </svg>
  );
}

export function Wordmark({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="TIGERIS AI OS home">
      <Mark />
      <span className={`font-serif text-lg font-semibold tracking-[0.14em] ${dark ? "text-white" : "text-ink"}`}>TIGERIS <span className={dark ? "text-gd-300" : "text-gd-700"}>AI OS</span></span>
    </Link>
  );
}

/** Decorative stylised skyline (original artwork; not a photograph and not a depiction of any real site). */
export function Skyline({ className = "" }: { className?: string }) {
  const towers: [number, number, number, number][] = [
    [30, 150, 26, 0.5], [62, 120, 22, 0.55], [90, 170, 30, 0.6], [128, 110, 20, 0.5], [210, 140, 28, 0.55], [246, 100, 24, 0.5], [330, 160, 30, 0.6], [372, 125, 22, 0.55], [405, 150, 26, 0.5],
  ];
  return (
    <svg viewBox="0 0 440 260" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6efe0" /><stop offset="0.7" stopColor="#f3dcc0" /><stop offset="1" stopColor="#ecc9a2" /></linearGradient>
        <linearGradient id="tw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8fa8a0" /><stop offset="1" stopColor="#5d7c73" /></linearGradient>
        <linearGradient id="tw2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c8b79b" /><stop offset="1" stopColor="#a69373" /></linearGradient>
        <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d9a6a" /><stop offset="1" stopColor="#4f7054" /></linearGradient>
      </defs>
      <rect width="440" height="260" fill="url(#sky)" />
      <circle cx="330" cy="70" r="46" fill="#f9e7c4" opacity="0.7" />
      {towers.map(([x, h, w, o], i) => <rect key={i} x={x} y={225 - h} width={w} height={h} fill="url(#tw2)" opacity={o + 0.2} />)}
      {/* feature tower with an open crown */}
      <path d="M160 225 V70 Q160 60 170 60 H196 Q206 60 206 70 V225 Z M171 74 Q183 112 195 74 Z" fill="url(#tw)" fillRule="evenodd" />
      <path d="M268 225 V90 L282 70 L296 90 V225 Z" fill="url(#tw)" opacity="0.9" />
      <rect x="0" y="225" width="440" height="35" fill="url(#gr)" />
      {[18, 70, 118, 300, 352, 420].map((x, i) => (
        <g key={x} transform={`translate(${x} ${215 - (i % 2) * 8})`}>
          <rect x="-1.5" y="-30" width="3" height="40" fill="#5a4a32" />
          <path d="M0 -30 q-20 -4 -26 8 M0 -30 q20 -4 26 8 M0 -30 q-14 -14 -24 -8 M0 -30 q14 -14 24 -8 M0 -30 q0 -16 0 -18" stroke="#3d6b46" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
