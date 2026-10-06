import type { Metadata } from "next";
import Link from "next/link";
import { WaydidiMark, WaydidiWordmark } from "@/components/waydidi-logo";

export const metadata: Metadata = { title: "Waydidi · Back soon", robots: { index: false, follow: false } };

// Shown to visitors while the site is in maintenance mode (Admin → Settings). The Waydidi bird
// flies in over Thai landmarks: Wat Arun's prang, a temple roof, a chedi, palms and a longtail boat.
export default function MaintenancePage() {
  return <main className="font-home wd-mt relative min-h-dvh overflow-hidden bg-[linear-gradient(180deg,#FE8B05_0%,#FFA94D_38%,#FFD9A8_64%,#FFF3E2_100%)] text-white">
    <style>{`
      .wd-mt .sun { animation: wd-rise 2.4s ease-out both; }
      .wd-mt .cloud { animation: wd-drift linear infinite; }
      .wd-mt .bird { animation: wd-fly 3.6s cubic-bezier(.3,.1,.25,1) both, wd-bob 3s ease-in-out 3.6s infinite; }
      .wd-mt .wing { animation: wd-flap .45s ease-in-out 9 alternate both; transform-origin: 50% 60%; }
      .wd-mt .fade { animation: wd-fade 1s ease-out both; }
      .wd-mt .boat { animation: wd-sail 18s linear infinite; }
      .wd-mt .water { animation: wd-shimmer 4s ease-in-out infinite; }
      @keyframes wd-rise { from { transform: translateY(60px); opacity: 0 } to { transform: none; opacity: 1 } }
      @keyframes wd-drift { from { transform: translateX(-30vw) } to { transform: translateX(130vw) } }
      @keyframes wd-fly {
        0% { transform: translate(-70vw, 38vh) scale(.55) rotate(-14deg); opacity: 0 }
        10% { opacity: 1 }
        40% { transform: translate(-22vw, -6vh) scale(.8) rotate(-6deg) }
        70% { transform: translate(14vw, 4vh) scale(1) rotate(6deg) }
        100% { transform: none; opacity: 1 }
      }
      @keyframes wd-bob { 0%, 100% { translate: 0 0 } 50% { translate: 0 -10px } }
      @keyframes wd-flap { from { transform: scaleY(1) } to { transform: scaleY(.82) } }
      @keyframes wd-fade { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
      @keyframes wd-sail { from { transform: translateX(-160px) } to { transform: translateX(110vw) } }
      @keyframes wd-shimmer { 0%, 100% { opacity: .55 } 50% { opacity: .85 } }
      @media (prefers-reduced-motion: reduce) { .wd-mt * { animation: none !important } }
    `}</style>

    {/* Sun and clouds */}
    <div className="sun absolute left-1/2 top-[52%] size-[220px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#FFF7E8_0%,#FFE2B8_55%,rgba(255,226,184,0)_72%)] sm:size-[300px]" aria-hidden />
    {[{ t: "12%", d: "48s", w: 180, o: 0 }, { t: "22%", d: "64s", w: 120, o: -20 }, { t: "8%", d: "80s", w: 240, o: -45 }].map((c, i) =>
      <svg key={i} className="cloud absolute left-0 opacity-70" style={{ top: c.t, width: c.w, animationDuration: c.d, animationDelay: `${c.o}s` }} viewBox="0 0 200 70" aria-hidden><path fill="#FFF8EE" d="M20 60h160a22 22 0 0 0-8-42 30 30 0 0 0-56-8 26 26 0 0 0-46 10A24 24 0 0 0 20 60z" /></svg>)}


    {/* Message */}
    <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center px-6 pt-[16vh] text-center sm:pt-[13vh]">
      {/* The Waydidi bird flies in from the bottom left and lands here, above the name. */}
      <div className="bird" aria-hidden><div className="wing"><WaydidiMark className="size-24 text-white drop-shadow-[0_6px_14px_rgba(150,70,0,.35)] sm:size-28" /></div></div>
      <WaydidiWordmark className="fade mt-3 h-[44px] w-[174px] text-white [animation-delay:3.4s]" />
      <h1 className="fade mt-5 text-[30px] font-bold leading-tight [animation-delay:3.7s] sm:text-[40px]">We&apos;ll be right back</h1>
      <p className="fade mt-3 text-[16px] leading-7 text-white/95 [animation-delay:4s] sm:text-[18px]">Waydidi is getting a little upgrade. Your bookings and rides are not affected. Need help now? Message us on WhatsApp.</p>
      <a href="https://wa.me/66632064884" className="fade mt-6 inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-[#C96100] shadow-sm [animation-delay:4.3s] hover:bg-[#FFF6EC]">WhatsApp +66 63 206 4884</a>
    </div>

    {/* Thai landmarks skyline */}
    <svg className="absolute inset-x-0 bottom-0 h-[42vh] min-h-[260px] w-full" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {/* far hills (Phi Phi / Krabi limestone) */}
      <path fill="#F3A35A" opacity=".55" d="M0 300 C60 240 90 180 130 230 C160 150 200 140 230 220 C270 260 300 240 340 280 L380 300 C900 300 1000 300 1060 300 C1100 210 1140 170 1180 230 C1210 160 1250 150 1290 240 C1330 270 1380 250 1440 280 V420 H0Z" />
      {/* Wat Arun prang (centre-left) */}
      <g fill="#C9671A">
        <path d="M430 330 L430 300 L445 300 L452 250 L462 250 L470 180 L478 180 L484 110 L489 60 L492 30 L495 60 L500 110 L506 180 L514 180 L522 250 L532 250 L539 300 L554 300 L554 330Z" />
        <path d="M380 330 L384 300 L392 300 L398 268 L404 240 L408 268 L414 300 L422 300 L426 330Z" />
        <path d="M562 330 L566 300 L574 300 L580 268 L586 240 L590 268 L596 300 L604 300 L608 330Z" />
      </g>
      {/* Temple roof (Grand Palace style, tiered gables) */}
      <g fill="#B85A12">
        <path d="M720 330 L720 290 L860 290 L860 330Z" />
        <path d="M700 292 L790 232 L880 292Z" />
        <path d="M722 262 L790 206 L858 262Z" />
        <path d="M746 232 L790 186 L834 232Z" />
        <path d="M786 190 L790 140 L794 190Z" />
        <path d="M700 292 L690 280 M880 292 L890 280" stroke="#B85A12" strokeWidth="5" strokeLinecap="round" />
      </g>
      {/* Chedi (bell stupa) */}
      <path fill="#C9671A" d="M960 330 L960 312 L968 312 C968 286 984 268 1000 262 C1016 268 1032 286 1032 312 L1040 312 L1040 330Z M992 262 L996 220 L1000 160 L1004 220 L1008 262Z" />
      {/* Palms */}
      {[[250, 1], [640, .9], [1120, 1.05], [1300, .85]].map(([x, s], i) => <g key={i} transform={`translate(${x} 330) scale(${s})`} fill="#A84F0E">
        <path d="M-3 0 C-1 -40 2 -80 6 -112 L10 -112 C7 -80 4 -40 3 0Z" />
        <path d="M8 -112 C-20 -128 -46 -120 -60 -100 C-38 -112 -18 -112 8 -110Z M8 -112 C34 -130 62 -124 76 -104 C54 -114 32 -114 8 -110Z M8 -112 C0 -140 -18 -150 -36 -148 C-16 -140 -4 -128 6 -110Z M8 -112 C20 -142 40 -150 58 -146 C38 -138 24 -126 10 -110Z" />
      </g>)}
      {/* Ground and river */}
      <path fill="#A84F0E" d="M0 326 H1440 V344 H0Z" />
      <rect className="water" y="344" width="1440" height="76" fill="#F6B46E" />
      <g className="water" stroke="#FFE7C7" strokeWidth="3" strokeLinecap="round" opacity=".7">
        <path d="M120 372 h70 M420 392 h110 M760 366 h80 M1040 400 h120 M1260 376 h70" />
      </g>
      {/* Longtail boat */}
      <g className="boat" transform="translate(0 0)">
        <path fill="#8A3F0A" d="M40 366 C70 380 150 382 190 368 L198 352 L176 360 C140 366 80 366 52 358Z" />
        <path fill="#8A3F0A" d="M196 352 L214 330 L218 332 L202 356Z" />
        <path fill="#FFE7C7" d="M196 352 L214 330 L210 344Z" opacity=".8" />
      </g>
    </svg>

    <Link href="/admin" className="absolute bottom-[calc(16px+env(safe-area-inset-bottom))] right-5 z-20 rounded-full px-3 py-1.5 text-[14px] font-semibold text-[#7A3A06] hover:bg-white/40">Sign in</Link>
  </main>;
}
