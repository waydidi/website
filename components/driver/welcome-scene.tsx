"use client";

import { FlyingBird } from "@/components/maintenance/flying-bird";

// The driver's welcome screen: the maintenance page's orange sky and silhouettes, with a car
// driving across Thailand. The camera follows the car, so the car stays in the middle while the
// landmarks and the road roll past; one journey takes 30 seconds and then starts again.
// Inside the car: the driver at the wheel and two travellers in the second row.

const NEAR = "#A84F0E";
const MID = "#C9671A";
const FAR = "#E79A55";
const DARK = "#55250A";
const LIGHT = "#FFE7C7";

function Palm({ x, s = 1 }: { x: number; s?: number }) {
  return <g transform={`translate(${x} 330) scale(${s})`} fill={NEAR}>
    <path d="M-3 0 C-1 -40 2 -80 6 -112 L10 -112 C7 -80 4 -40 3 0Z" />
    <path d="M8 -112 C-20 -128 -46 -120 -60 -100 C-38 -112 -18 -112 8 -110Z M8 -112 C34 -130 62 -124 76 -104 C54 -114 32 -114 8 -110Z M8 -112 C0 -140 -18 -150 -36 -148 C-16 -140 -4 -128 6 -110Z M8 -112 C20 -142 40 -150 58 -146 C38 -138 24 -126 10 -110Z" />
  </g>;
}

/** Far layer: northern mountains, rice-field hills and the southern limestone islands. */
function FarCountry() {
  return <svg viewBox="0 0 2400 420" className="h-full w-auto shrink-0" preserveAspectRatio="xMinYMax meet" aria-hidden>
    <path fill={FAR} d="M0 330 V250 C120 200 220 150 330 170 C430 190 470 120 580 110 C700 100 760 190 880 200 C980 208 1040 150 1140 160 C1240 170 1280 230 1380 236 L1400 330Z" />
    {/* Limestone karsts: steep sides, rounded tops */}
    <path fill={FAR} d="M1440 330 C1446 260 1452 200 1480 176 C1508 168 1520 210 1524 330Z M1560 330 C1564 250 1574 180 1606 150 C1640 140 1654 200 1660 330Z M1700 330 C1706 280 1716 240 1736 228 C1756 224 1764 270 1768 330Z" />
    <path fill={FAR} d="M1820 330 C1900 270 1980 250 2060 262 C2140 274 2200 240 2280 230 C2340 226 2380 250 2400 260 V330Z" />
  </svg>;
}

/** Near layer: landmarks along the road, from Bangkok to the Andaman coast, and the road itself. */
function NearCountry() {
  return <svg viewBox="0 0 2400 420" className="h-full w-auto shrink-0" preserveAspectRatio="xMinYMax meet" aria-hidden>
    {/* Grand Palace, Bangkok: tiered roofs and tall spire */}
    <g fill={NEAR}>
      <path d="M40 330 V286 H240 V330Z" />
      <path d="M20 290 L140 226 L260 290Z" />
      <path d="M50 262 L140 200 L230 262Z" />
      <path d="M80 232 L140 176 L200 232Z" />
      <path d="M118 182 L122 150 L128 120 L136 70 L140 40 L144 70 L152 120 L158 150 L162 182Z" />
    </g>
    <Palm x={320} s={0.95} />
    {/* Ayutthaya, Wat Chaiwatthanaram: the great prang with four smaller ones, worn by time */}
    <g fill={MID}>
      <path d="M470 330 V312 H730 V330Z" />
      <path d="M560 312 L566 280 L576 280 L582 230 L590 230 L596 170 L600 128 L604 170 L610 230 L618 230 L624 280 L634 280 L640 312Z" />
      {[490, 530, 670, 710].map((x) => <path key={x} d={`M${x - 16} 312 L${x - 12} 292 L${x - 6} 292 L${x - 3} 262 L${x} 240 L${x + 3} 262 L${x + 6} 292 L${x + 12} 292 L${x + 16} 312Z`} />)}
    </g>
    {/* Doi Suthep, Chiang Mai: the golden chedi on its mountain */}
    <g fill={NEAR}>
      <path d="M770 330 C820 270 870 230 930 222 C990 230 1040 270 1090 330Z" />
      <path d="M902 222 V210 H958 V222Z M910 210 C910 184 922 170 930 166 C938 170 950 184 950 210Z M926 166 L929 124 L930 104 L931 124 L934 166Z" />
    </g>
    <Palm x={1130} s={1.05} />
    {/* Sanctuary of Truth, Pattaya: the carved wooden hall with its many spires */}
    <g fill={NEAR}>
      <path d="M1190 330 V270 H1430 V330Z" />
      <path d="M1180 274 L1310 222 L1440 274Z" />
      {[1215, 1260, 1360, 1405].map((x, i) => <path key={x} d={`M${x - 10} 272 L${x} ${i % 3 ? 196 : 210} L${x + 10} 272Z`} />)}
      <path d="M1296 228 L1302 170 L1310 112 L1318 170 L1324 228Z" />
    </g>
    {/* Big Buddha, Phuket: the seated Buddha on the hilltop */}
    <g fill={MID}>
      <path d="M1470 330 C1510 300 1550 284 1600 280 C1650 284 1690 300 1730 330Z" />
      <path d="M1556 282 C1556 262 1572 252 1600 250 C1628 252 1644 262 1644 282Z" />
      <path d="M1572 254 C1570 222 1580 196 1600 190 C1620 196 1630 222 1628 254Z" />
      <circle cx="1600" cy="178" r="15" />
      <path d="M1594 166 L1600 140 L1606 166Z" />
    </g>
    {/* Elephant walking by the road */}
    <g fill={NEAR}>
      <path d="M1800 330 V300 C1784 300 1780 286 1782 270 C1786 244 1808 230 1840 230 C1876 230 1896 246 1898 270 C1900 284 1898 296 1892 300 V330 H1878 V304 H1862 V330 H1848 V304 H1826 V330 H1812 V304Z" />
      <path d="M1782 262 C1770 270 1766 290 1770 312 C1772 318 1778 318 1778 312 C1776 296 1778 284 1786 278Z" />
      <path d="M1794 250 C1784 252 1782 266 1792 272 C1802 268 1802 256 1794 250Z" opacity=".85" />
    </g>
    <Palm x={1960} s={0.9} />
    {/* Phang Nga Bay: limestone islands, the narrow-based "James Bond" rock among them */}
    <g fill={MID}>
      <path d="M2050 330 C2054 280 2062 236 2086 220 C2108 214 2118 260 2120 330Z" />
      <path d="M2160 330 C2166 318 2170 300 2168 280 C2164 252 2176 214 2198 206 C2224 202 2234 236 2226 262 C2220 284 2214 306 2218 330Z" />
      <path d="M2260 330 C2266 270 2280 236 2306 228 C2334 226 2342 270 2346 330Z" />
    </g>
    <Palm x={2385} s={0.8} />
    {/* Ground and road, with lane markings */}
    <path fill={NEAR} d="M0 326 H2400 V346 H0Z" />
    <path fill="#6F3207" d="M0 346 H2400 V420 H0Z" />
    <g fill={LIGHT} opacity=".75">{Array.from({ length: 20 }, (_, i) => <rect key={i} x={i * 120 + 30} y={380} width={56} height={6} rx={3} />)}</g>
  </svg>;
}

/** The car, side view facing right: driver in front, two travellers in the second row. */
function Car() {
  return <svg viewBox="0 0 240 96" className="h-full w-auto overflow-visible" aria-hidden>
    {/* Body */}
    <path fill={DARK} d="M10 72 V54 C10 48 14 44 22 42 L54 38 L84 16 C88 13 92 12 98 12 H160 C168 12 174 15 180 20 L204 40 L222 44 C230 46 234 52 234 60 V72Z" />
    {/* Windows: rear (second row) and front */}
    <path fill={LIGHT} opacity=".8" d="M64 40 L88 21 C90 20 92 19 96 19 H128 V40Z" />
    <path fill={LIGHT} opacity=".8" d="M134 40 V19 H158 C164 19 168 21 172 25 L194 40Z" />
    {/* Travellers in the second row: two heads and shoulders, one a little behind the other */}
    <g fill={DARK}>
      <circle cx="92" cy="28" r="7" opacity=".75" />
      <path d="M80 40 C80 34 86 33 92 33 C98 33 104 34 104 40Z" opacity=".75" />
      <circle cx="112" cy="27" r="7.5" />
      <path d="M99 40 C99 33 105 32 112 32 C119 32 125 33 125 40Z" />
    </g>
    {/* Driver at the wheel */}
    <g fill={DARK}>
      <circle cx="152" cy="27" r="7.5" />
      <path d="M139 40 C139 33 145 32 152 32 C159 32 165 33 165 40Z" />
      <path d="M166 38 L176 28" stroke={DARK} strokeWidth="3.5" strokeLinecap="round" />
    </g>
    {/* Door line, handle, lights */}
    <path d="M131 42 V66" stroke="#341503" strokeWidth="2" />
    <path d="M114 50 H124 M146 50 H156" stroke={LIGHT} strokeWidth="2.5" strokeLinecap="round" opacity=".6" />
    <path fill="#FFF3E2" d="M224 50 H233 V57 H226Z" />
    <path fill="#FFB25C" d="M10 52 H16 V60 H10Z" />
    {/* Wheels, turning */}
    {[62, 188].map((cx) => <g key={cx}>
      <circle cx={cx} cy={74} r={17} fill="#341503" />
      <g className="wheel" style={{ transformOrigin: `${cx}px 74px` }}>
        <circle cx={cx} cy={74} r={8} fill={LIGHT} opacity=".85" />
        <path d={`M${cx - 8} 74 H${cx + 8} M${cx} 66 V82`} stroke="#341503" strokeWidth="2.5" />
      </g>
    </g>)}
  </svg>;
}

export function DriverWelcome({ onStart }: { onStart: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="driver-welcome-title" className="font-home wd-dw fixed inset-0 z-[90] overflow-hidden bg-[linear-gradient(180deg,#FE8B05_0%,#FFA94D_38%,#FFD9A8_64%,#FFF3E2_100%)] text-white">
    <style>{`
      .wd-dw .sun { animation: dw-rise 2.4s ease-out both; }
      .wd-dw .cloud { animation: dw-drift linear infinite; }
      .wd-dw .scroll-far { animation: dw-scroll 60s linear infinite; }
      .wd-dw .scroll-near { animation: dw-scroll 30s linear infinite; }
      .wd-dw .bird-x { animation: dw-across 16s linear infinite; }
      .wd-dw .bird-y { animation: dw-wave 4s ease-in-out infinite; }
      .wd-dw .car { animation: dw-bump .5s ease-in-out infinite; }
      .wd-dw .wheel { animation: dw-spin .45s linear infinite; }
      .wd-dw .fade { animation: dw-fade 1s ease-out both; }
      @keyframes dw-rise { from { transform: translate(-50%, 60px); opacity: 0 } to { transform: translate(-50%, 0); opacity: 1 } }
      @keyframes dw-drift { from { transform: translateX(-30vw) } to { transform: translateX(130vw) } }
      @keyframes dw-scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
      @keyframes dw-across { from { transform: translateX(-160px) } to { transform: translateX(calc(100vw + 40px)) } }
      @keyframes dw-wave { 0%, 100% { transform: translateY(0) rotate(4deg) } 50% { transform: translateY(-34px) rotate(-6deg) } }
      @keyframes dw-bump { 0%, 100% { transform: translate(-50%, 0) } 50% { transform: translate(-50%, -2px) } }
      @keyframes dw-spin { to { transform: rotate(360deg) } }
      @keyframes dw-fade { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
      @media (prefers-reduced-motion: reduce) { .wd-dw * { animation: none !important } }
    `}</style>

    {/* Sun and clouds */}
    <div className="sun absolute left-1/2 top-[44%] size-[220px] rounded-full bg-[radial-gradient(circle,#FFF7E8_0%,#FFE2B8_55%,rgba(255,226,184,0)_72%)] sm:size-[300px]" aria-hidden />
    {[{ t: "12%", d: "48s", w: 180, o: 0 }, { t: "22%", d: "64s", w: 120, o: -20 }, { t: "6%", d: "80s", w: 240, o: -45 }].map((c, i) =>
      <svg key={i} className="cloud absolute left-0 opacity-70" style={{ top: c.t, width: c.w, animationDuration: c.d, animationDelay: `${c.o}s` }} viewBox="0 0 200 70" aria-hidden><path fill="#FFF8EE" d="M20 60h160a22 22 0 0 0-8-42 30 30 0 0 0-56-8 26 26 0 0 0-46 10A24 24 0 0 0 20 60z" /></svg>)}
    <div className="pointer-events-none absolute left-0 top-[7%] z-10" aria-hidden>
      <div className="bird-x"><div className="bird-y"><FlyingBird className="h-16 w-auto text-white drop-shadow-[0_6px_14px_rgba(150,70,0,.35)] sm:h-20" /></div></div>
    </div>

    {/* Headline and start button */}
    <div className="relative z-20 mx-auto flex max-w-xl flex-col items-center px-6 pt-[18vh] text-center">
      <h1 id="driver-welcome-title" className="fade text-[34px] font-bold leading-tight sm:text-[42px]">Welcome, driver</h1>
      <p className="fade mt-2 text-[17px] leading-7 text-white/95 [animation-delay:.3s]">ยินดีต้อนรับ พร้อมแล้วกดเริ่มงานได้เลย</p>
      <button type="button" autoFocus onClick={onStart} className="fade mt-7 inline-flex h-14 items-center rounded-full bg-white px-10 text-[18px] font-black text-brand-darker shadow-lg [animation-delay:.6s] hover:bg-brand-wash focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60">เริ่มงาน</button>
    </div>

    {/* Thailand rolling past, following the car */}
    <div className="absolute inset-x-0 bottom-0 h-[46vh] min-h-[280px]" aria-hidden>
      <div className="scroll-far absolute inset-y-0 left-0 flex h-full w-max"><FarCountry /><FarCountry /></div>
      <div className="scroll-near absolute inset-y-0 left-0 flex h-full w-max"><NearCountry /><NearCountry /></div>
      <div className="car absolute bottom-[5%] left-1/2 h-[27%]"><Car /></div>
    </div>
  </div>;
}
