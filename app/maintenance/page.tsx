import type { Metadata } from "next";
import { FarSkyline, NearLandmarks, TukTuk } from "@/components/maintenance/bangkok-scene";
import { MaintenanceSignIn } from "@/components/maintenance/sign-in";
import { WaydidiMark, WaydidiWordmark } from "@/components/waydidi-logo";

export const metadata: Metadata = { title: "Waydidi · Back soon", robots: { index: false, follow: false } };

// Shown to visitors while the site is in maintenance mode (Admin → Settings). The Waydidi bird flies
// across the sky, a longtail boat sails along the river and Bangkok's landmarks scroll past in two
// layers (the far skyline slower than the temples by the river).
export default function MaintenancePage() {
  return <main className="font-home wd-mt relative min-h-dvh overflow-hidden bg-[linear-gradient(180deg,#FE8B05_0%,#FFA94D_38%,#FFD9A8_64%,#FFF3E2_100%)] text-white">
    <style>{`
      .wd-mt .sun { animation: wd-rise 2.4s ease-out both; }
      .wd-mt .cloud { animation: wd-drift linear infinite; }
      .wd-mt .scroll-far { animation: wd-scroll 150s linear infinite; }
      .wd-mt .scroll-near { animation: wd-scroll 70s linear infinite; }
      .wd-mt .bird-x { animation: wd-across 16s linear infinite; }
      .wd-mt .bird-y { animation: wd-wave 4s ease-in-out infinite; }
      .wd-mt .wing { animation: wd-flap .28s ease-in-out infinite alternate; transform-origin: 50% 70%; }
      .wd-mt .boat { animation: wd-sail 26s linear infinite; }
      .wd-mt .rock { animation: wd-rock 2.4s ease-in-out infinite; transform-origin: 50% 80%; }
      .wd-mt .tuk { animation: wd-drive 34s linear infinite; }
      .wd-mt .water { animation: wd-shimmer 4s ease-in-out infinite; }
      .wd-mt .fade { animation: wd-fade 1s ease-out both; }
      @keyframes wd-rise { from { transform: translate(-50%, 60px); opacity: 0 } to { transform: translate(-50%, 0); opacity: 1 } }
      @keyframes wd-drift { from { transform: translateX(-30vw) } to { transform: translateX(130vw) } }
      @keyframes wd-scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
      /* Bird: from off the left edge to off the right edge, rising and dipping as it goes. */
      @keyframes wd-across { from { transform: translateX(-160px) } to { transform: translateX(calc(100vw + 40px)) } }
      @keyframes wd-wave { 0%, 100% { transform: translateY(0) rotate(4deg) } 50% { transform: translateY(-34px) rotate(-6deg) } }
      @keyframes wd-flap { from { transform: perspective(300px) rotateX(0deg) scaleY(1) } to { transform: perspective(300px) rotateX(58deg) scaleY(.7) skewX(-6deg) } }
      @keyframes wd-sail { from { transform: translateX(-220px) } to { transform: translateX(calc(100vw + 20px)) } }
      @keyframes wd-rock { 0%, 100% { transform: rotate(-1.5deg) translateY(0) } 50% { transform: rotate(1.5deg) translateY(2px) } }
      @keyframes wd-drive { from { transform: translateX(calc(100vw + 20px)) } to { transform: translateX(-120px) } }
      @keyframes wd-shimmer { 0%, 100% { opacity: .55 } 50% { opacity: .85 } }
      @keyframes wd-fade { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
      @media (prefers-reduced-motion: reduce) { .wd-mt * { animation: none !important } }
    `}</style>

    {/* Sun and clouds */}
    <div className="sun absolute left-1/2 top-[50%] size-[220px] rounded-full bg-[radial-gradient(circle,#FFF7E8_0%,#FFE2B8_55%,rgba(255,226,184,0)_72%)] sm:size-[300px]" aria-hidden />
    {[{ t: "12%", d: "48s", w: 180, o: 0 }, { t: "22%", d: "64s", w: 120, o: -20 }, { t: "8%", d: "80s", w: 240, o: -45 }].map((c, i) =>
      <svg key={i} className="cloud absolute left-0 opacity-70" style={{ top: c.t, width: c.w, animationDuration: c.d, animationDelay: `${c.o}s` }} viewBox="0 0 200 70" aria-hidden><path fill="#FFF8EE" d="M20 60h160a22 22 0 0 0-8-42 30 30 0 0 0-56-8 26 26 0 0 0-46 10A24 24 0 0 0 20 60z" /></svg>)}

    {/* The Waydidi bird flying left to right across the sky, all the time */}
    <div className="pointer-events-none absolute left-0 top-[9%] z-10" aria-hidden>
      <div className="bird-x"><div className="bird-y"><div className="wing"><WaydidiMark className="size-20 text-white drop-shadow-[0_6px_14px_rgba(150,70,0,.35)] sm:size-24" /></div></div></div>
    </div>

    {/* Message */}
    <div className="relative z-20 mx-auto flex max-w-xl flex-col items-center px-6 pt-[26vh] text-center sm:pt-[24vh]">
      <WaydidiWordmark className="fade h-[44px] w-[174px] text-white" />
      <h1 className="fade mt-5 text-[30px] font-bold leading-tight [animation-delay:.3s] sm:text-[40px]">We&apos;ll be right back</h1>
      <p className="fade mt-3 text-[16px] leading-7 text-white/95 [animation-delay:.6s] sm:text-[18px]">Waydidi is getting a little upgrade. Your bookings and rides are not affected. Need help now? Message us on WhatsApp.</p>
      <a href="https://wa.me/66632064884" className="fade mt-6 inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-[#C96100] shadow-sm [animation-delay:.9s] hover:bg-[#FFF6EC]">WhatsApp +66 63 206 4884</a>
    </div>

    {/* Bangkok passing by: far skyline (slow), landmarks by the river (faster) */}
    <div className="absolute inset-x-0 bottom-0 h-[42vh] min-h-[260px]" aria-hidden>
      <div className="scroll-far absolute inset-y-0 left-0 flex h-full w-max"><FarSkyline /><FarSkyline /></div>
      <div className="scroll-near absolute inset-y-0 left-0 flex h-full w-max"><NearLandmarks /><NearLandmarks /></div>
      {/* Tuk-tuk driving along the bank (right to left) */}
      <div className="tuk absolute left-0 h-[7%] min-h-[18px]" style={{ bottom: "calc(100% * 94 / 420 - 2px)" }}><TukTuk /></div>
      {/* River */}
      <svg className="absolute inset-x-0 bottom-0 h-[18%] w-full" viewBox="0 0 1440 76" preserveAspectRatio="none">
        <rect className="water" width="1440" height="76" fill="#F6B46E" />
        <g className="water" stroke="#FFE7C7" strokeWidth="3" strokeLinecap="round" opacity=".7"><path d="M120 28 h70 M420 48 h110 M760 22 h80 M1040 56 h120 M1260 32 h70" /></g>
      </svg>
      {/* Longtail boat sailing left to right, all the time */}
      <div className="boat absolute bottom-[7%] left-0 h-[12%] min-h-[30px]">
        <svg className="rock h-full w-auto" viewBox="30 326 196 62" aria-hidden>
          <path fill="#8A3F0A" d="M40 366 C70 380 150 382 190 368 L198 352 L176 360 C140 366 80 366 52 358Z" />
          <path fill="#8A3F0A" d="M196 352 L214 330 L218 332 L202 356Z" />
          <path fill="#8A3F0A" d="M96 360 V344 H140 V360Z" opacity=".85" />
          <path fill="#FFE7C7" d="M196 352 L214 330 L210 344Z" opacity=".8" />
        </svg>
      </div>
    </div>

    <MaintenanceSignIn />
  </main>;
}
