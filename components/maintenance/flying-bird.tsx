"use client";

// The Waydidi bird, redrawn in parts so its wings can beat like a real bird's (the logo itself is one
// flat image). Each wing hinges at the shoulder and bends at the wrist. The motion follows a peregrine
// falcon's cruising flight: a burst of quick beats, then a glide with the wings held out. The
// downstroke (the power stroke) is quicker than the upstroke; on the upstroke the wing folds at the
// wrist so the tip trails, then flicks open at the top. The body lifts a little on each downstroke,
// and the far wing beats a moment behind the near one. Seen from the side, a wing pointing at the
// viewer looks short, so the beat is drawn as the wing's height shrinking and flipping below the body.

const CSS = `
      .wd-bird .near { transform-box: view-box; transform-origin: 60px 66px; animation: wd-near 2.4s ease-in-out infinite; }
      .wd-bird .far { transform-box: view-box; transform-origin: 66px 62px; animation: wd-far 2.4s ease-in-out infinite; animation-delay: -.03s; }
      .wd-bird .hand { transform-box: view-box; animation: wd-hand 2.4s ease-in-out infinite; }
      .wd-bird .near .hand { transform-origin: 44px 38px; }
      .wd-bird .far .hand { transform-origin: 52px 34px; animation-delay: -.03s; }
      .wd-bird .lift { animation: wd-lift 2.4s ease-in-out infinite; }
      @keyframes wd-near {
        0.0% { transform: scaleY(1) }
        5.7% { transform: scaleY(.2) }
        7.8% { transform: scaleY(-.9) }
        10.8% { transform: scaleY(.15) }
        13.5% { transform: scaleY(1) }
        19.2% { transform: scaleY(.2) }
        21.3% { transform: scaleY(-.9) }
        24.3% { transform: scaleY(.15) }
        27.0% { transform: scaleY(1) }
        32.7% { transform: scaleY(.2) }
        34.8% { transform: scaleY(-.9) }
        37.8% { transform: scaleY(.15) }
        40.5% { transform: scaleY(1) }
        46.2% { transform: scaleY(.2) }
        48.3% { transform: scaleY(-.9) }
        51.3% { transform: scaleY(.15) }
        54.0% { transform: scaleY(1) }
        62.0% { transform: scaleY(.32) }
        92.0% { transform: scaleY(.32) }
        100.0% { transform: scaleY(1) }
      }
      @keyframes wd-far {
        0.0% { transform: scaleY(.92) }
        5.7% { transform: scaleY(.12) }
        7.8% { transform: scaleY(-.78) }
        10.8% { transform: scaleY(.08) }
        13.5% { transform: scaleY(.92) }
        19.2% { transform: scaleY(.12) }
        21.3% { transform: scaleY(-.78) }
        24.3% { transform: scaleY(.08) }
        27.0% { transform: scaleY(.92) }
        32.7% { transform: scaleY(.12) }
        34.8% { transform: scaleY(-.78) }
        37.8% { transform: scaleY(.08) }
        40.5% { transform: scaleY(.92) }
        46.2% { transform: scaleY(.12) }
        48.3% { transform: scaleY(-.78) }
        51.3% { transform: scaleY(.08) }
        54.0% { transform: scaleY(.92) }
        62.0% { transform: scaleY(.26) }
        92.0% { transform: scaleY(.26) }
        100.0% { transform: scaleY(.92) }
      }
      @keyframes wd-hand {
        0.0% { transform: rotate(-6deg) }
        5.7% { transform: rotate(5deg) }
        7.8% { transform: rotate(5deg) }
        10.8% { transform: rotate(-16deg) scale(.9) }
        13.5% { transform: rotate(-6deg) }
        19.2% { transform: rotate(5deg) }
        21.3% { transform: rotate(5deg) }
        24.3% { transform: rotate(-16deg) scale(.9) }
        27.0% { transform: rotate(-6deg) }
        32.7% { transform: rotate(5deg) }
        34.8% { transform: rotate(5deg) }
        37.8% { transform: rotate(-16deg) scale(.9) }
        40.5% { transform: rotate(-6deg) }
        46.2% { transform: rotate(5deg) }
        48.3% { transform: rotate(5deg) }
        51.3% { transform: rotate(-16deg) scale(.9) }
        54.0% { transform: rotate(-6deg) }
        62.0% { transform: rotate(2deg) }
        92.0% { transform: rotate(2deg) }
        100.0% { transform: rotate(-6deg) }
      }
      @keyframes wd-lift {
        0.0% { transform: translateY(1px) }
        5.7% { transform: translateY(-2px) }
        7.8% { transform: translateY(-3px) }
        10.8% { transform: translateY(0) }
        13.5% { transform: translateY(1px) }
        19.2% { transform: translateY(-2px) }
        21.3% { transform: translateY(-3px) }
        24.3% { transform: translateY(0) }
        27.0% { transform: translateY(1px) }
        32.7% { transform: translateY(-2px) }
        34.8% { transform: translateY(-3px) }
        37.8% { transform: translateY(0) }
        40.5% { transform: translateY(1px) }
        46.2% { transform: translateY(-2px) }
        48.3% { transform: translateY(-3px) }
        51.3% { transform: translateY(0) }
        54.0% { transform: translateY(1px) }
        62.0% { transform: translateY(0) }
        92.0% { transform: translateY(0) }
        100.0% { transform: translateY(1px) }
      }
      @media (prefers-reduced-motion: reduce) { .wd-bird * { animation: none !important } }
`;

export function FlyingBird({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 124 100" className={`wd-bird overflow-visible ${className}`} aria-hidden>
    <style>{CSS}</style>
    <g className="lift" fill="currentColor">
      {/* Far wing (behind the body, a little smaller and paler) */}
      <g className="far" opacity=".72">
        <path d="M58 66 C56 54 52 44 46 34 C54 28 66 34 76 50 C79 56 79 62 76 66Z" />
        <g className="hand"><path d="M52 38 C42 26 30 12 16 2 C32 4 46 14 58 26 C61 30 60 36 54 40Z" /></g>
      </g>
      {/* Body: tail at the lower left, head and beak at the right */}
      <path d="M4 82 C24 86 52 80 74 68 C86 61 98 56 108 57 C113 58 118 61 121 64 L114 64 C110 64 106 66 102 70 C88 84 56 94 30 92 C18 91 8 88 4 82Z" />
      {/* Near wing: arm from the shoulder to the wrist, hand from the wrist to the tip */}
      <g className="near">
        <path d="M50 70 C48 58 44 48 36 38 C44 32 58 38 68 54 C72 60 72 66 68 70Z" />
        <g className="hand"><path d="M44 42 C34 30 20 16 4 6 C22 8 38 18 50 30 C53 34 52 40 46 44Z" /></g>
      </g>
    </g>
  </svg>;
}
