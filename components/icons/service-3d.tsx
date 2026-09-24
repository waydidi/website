import { useId } from "react";

// Soft 3D "clay" illustrations for the homepage service cards, in the same
// style as CancelCalendar3D: pale round backdrop, glossy rounded shapes.
type Props = { size?: number; className?: string; backdrop?: string };

function Backdrop({ id, color }: { id: string; color: string }) {
  return <>
    <defs>
      <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="62%">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity=".9" />
        <stop offset="1" stopColor={color} />
      </radialGradient>
      <filter id={`${id}-sh`} x="-25%" y="-25%" width="150%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.6" floodColor="#5A2A00" floodOpacity=".22" />
      </filter>
    </defs>
    <circle cx="48" cy="48" r="46" fill={`url(#${id}-bg)`} />
  </>;
}

export function RideCar3D({ size = 96, className = "", backdrop = "#FFE3C4" }: Props) {
  const rc = useId().replace(/:/g, "");
  return <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
    <Backdrop id={rc} color={backdrop} />
    <defs>
      <linearGradient id={`${rc}-body`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB255" /><stop offset=".55" stopColor="#FF8A05" /><stop offset="1" stopColor="#D96A00" /></linearGradient>
      <linearGradient id={`${rc}-glass`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7FA8D6" /><stop offset="1" stopColor="#2E4766" /></linearGradient>
      <radialGradient id={`${rc}-tyre`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#4A4A52" /><stop offset="1" stopColor="#15151A" /></radialGradient>
      <radialGradient id={`${rc}-hub`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#F5F7FA" /><stop offset="1" stopColor="#A9B2BF" /></radialGradient>
    </defs>
    <ellipse cx="48" cy="69" rx="31" ry="4.5" fill="#6B3A00" opacity=".18" />
    <g filter={`url(#${rc}-sh)`}>
      <path d="M17 58c0-6 3-9 8-10l7-9c2-3 5-4 8-4h14c4 0 7 1 9 4l6 8c7 1 11 4 11 11v3c0 2-1 3-3 3H20c-2 0-3-1-3-3v-3Z" fill={`url(#${rc}-body)`} />
      <path d="M34 40c1-2 3-3 6-3h13c3 0 5 1 6 3l5 7H29l5-7Z" fill={`url(#${rc}-glass)`} />
      <rect x="46" y="37" width="2.2" height="10" fill="#FF9B2E" />
      <path d="M26 49h46" stroke="#FFFFFF" strokeOpacity=".35" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M71 53h6" stroke="#FFF4C2" strokeWidth="3" strokeLinecap="round" />
      <path d="M19 54h4" stroke="#FFD2D0" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M31 41c2-2 4-2 6-2" stroke="#FFFFFF" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="31" cy="63" r="7.5" fill={`url(#${rc}-tyre)`} /><circle cx="31" cy="63" r="3.4" fill={`url(#${rc}-hub)`} />
      <circle cx="65" cy="63" r="7.5" fill={`url(#${rc}-tyre)`} /><circle cx="65" cy="63" r="3.4" fill={`url(#${rc}-hub)`} />
    </g>
  </svg>;
}

export function ReserveCalendar3D({ size = 96, className = "", backdrop = "#FFE3C4" }: Props) {
  const rv = useId().replace(/:/g, "");
  return <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
    <Backdrop id={rv} color={backdrop} />
    <defs>
      <linearGradient id={`${rv}-body`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E6E9EE" /></linearGradient>
      <linearGradient id={`${rv}-side`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CDD3DC" /><stop offset="1" stopColor="#B1BAC6" /></linearGradient>
      <linearGradient id={`${rv}-top`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFA947" /><stop offset="1" stopColor="#E76F00" /></linearGradient>
      <linearGradient id={`${rv}-ring`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9AA6B6" /><stop offset=".5" stopColor="#F4F6F9" /><stop offset="1" stopColor="#8995A6" /></linearGradient>
      <radialGradient id={`${rv}-ok`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#5FE08F" /><stop offset=".6" stopColor="#22B45A" /><stop offset="1" stopColor="#148A42" /></radialGradient>
    </defs>
    <g filter={`url(#${rv}-sh)`}>
      <rect x="21" y="27" width="50" height="46" rx="9" fill={`url(#${rv}-side)`} />
      <rect x="21" y="24" width="50" height="45" rx="9" fill={`url(#${rv}-body)`} />
      <path d="M30 24h32a9 9 0 0 1 9 9v5H21v-5a9 9 0 0 1 9-9Z" fill={`url(#${rv}-top)`} />
      <rect x="21" y="36" width="50" height="2.5" fill="#B35600" opacity=".25" />
      {[0, 1, 2].map((row) => [0, 1, 2, 3].map((col) => (
        <rect key={`${row}-${col}`} x={28 + col * 10} y={44 + row * 8} width="6" height="5" rx="1.6" fill={row === 1 && col === 2 ? "#FFC58A" : "#CBD5E2"} />
      )))}
      <rect x="32" y="18" width="5" height="12" rx="2.5" fill={`url(#${rv}-ring)`} />
      <rect x="55" y="18" width="5" height="12" rx="2.5" fill={`url(#${rv}-ring)`} />
    </g>
    <g filter={`url(#${rv}-sh)`}>
      <circle cx="68" cy="66" r="14" fill={`url(#${rv}-ok)`} />
      <ellipse cx="63.5" cy="60.5" rx="5" ry="3" fill="#FFFFFF" opacity=".3" />
      <path d="m61.5 66.5 4.5 4.5 8.5-9" fill="none" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}

function Pin({ x, y, s = 1, id }: { x: number; y: number; s?: number; id: string }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`} filter={`url(#${id}-sh)`}>
    <ellipse cx="0" cy="1" rx="6" ry="2" fill="#6B3A00" opacity=".2" />
    <path d="M0 0c-1 0-1.6-.8-2.3-1.9C-5.8-7-10-11-10-16.5-10-22-5.5-26 0-26s10 4 10 9.5C10-11 5.8-7 2.3-1.9 1.6-.8 1 0 0 0Z" fill={`url(#${id}-pin)`} />
    <circle cx="0" cy="-16.5" r="4.2" fill="#FFFFFF" />
    <ellipse cx="-3.8" cy="-21" rx="2.6" ry="1.6" fill="#FFFFFF" opacity=".45" />
  </g>;
}

export function DayTrip3D({ size = 96, className = "", backdrop = "#FFE3C4" }: Props) {
  const dt = useId().replace(/:/g, "");
  return <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
    <Backdrop id={dt} color={backdrop} />
    <defs>
      <radialGradient id={`${dt}-pin`} cx="38%" cy="30%" r="75%"><stop offset="0" stopColor="#FFBE6B" /><stop offset=".55" stopColor="#FF8A05" /><stop offset="1" stopColor="#C85F00" /></radialGradient>
      <radialGradient id={`${dt}-land`} cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E3E8EF" /></radialGradient>
    </defs>
    <ellipse cx="48" cy="64" rx="34" ry="14" fill={`url(#${dt}-land)`} filter={`url(#${dt}-sh)`} />
    <path d="M27 66c8-2 12-9 21-10s14 5 22-2" fill="none" stroke="#B9C3D0" strokeWidth="2.4" strokeDasharray="1 5" strokeLinecap="round" />
    <Pin id={dt} x={27} y={67} s={0.8} />
    <Pin id={dt} x={70} y={55} s={0.8} />
    <Pin id={dt} x={48} y={58} s={1.05} />
  </svg>;
}

// Airport ride: a private Waydidi car (no taxi sign), a suitcase and an
// airport sign, in the same clay style.
export function AirportRide3D({ size = 96, className = "", backdrop = "#FFE3C4" }: Props) {
  const ar = useId().replace(/:/g, "");
  return <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
    <Backdrop id={ar} color={backdrop} />
    <defs>
      <linearGradient id={`${ar}-body`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB255" /><stop offset=".55" stopColor="#FF8A05" /><stop offset="1" stopColor="#D96A00" /></linearGradient>
      <linearGradient id={`${ar}-roofg`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFC27A" /><stop offset="1" stopColor="#FF9422" /></linearGradient>
      <linearGradient id={`${ar}-hood`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FFB45C" /><stop offset="1" stopColor="#FFCB8A" /></linearGradient>
      <linearGradient id={`${ar}-face`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F28A12" /><stop offset="1" stopColor="#C85E00" /></linearGradient>
      <linearGradient id={`${ar}-glass2`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#B7D3F2" /><stop offset="1" stopColor="#4A6C95" /></linearGradient>
      <linearGradient id={`${ar}-glass`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8FB6E0" /><stop offset="1" stopColor="#2E4766" /></linearGradient>
      <radialGradient id={`${ar}-tyre`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#4A4A52" /><stop offset="1" stopColor="#15151A" /></radialGradient>
      <radialGradient id={`${ar}-hub`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#F5F7FA" /><stop offset="1" stopColor="#A9B2BF" /></radialGradient>
      <linearGradient id={`${ar}-case`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FFD86B" /><stop offset=".6" stopColor="#FFC02E" /><stop offset="1" stopColor="#E5A100" /></linearGradient>
      <radialGradient id={`${ar}-sign`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#6FA4FF" /><stop offset=".6" stopColor="#2F6FE8" /><stop offset="1" stopColor="#1C4DB8" /></radialGradient>
      <linearGradient id={`${ar}-pole`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9AA6B6" /><stop offset=".5" stopColor="#EEF1F5" /><stop offset="1" stopColor="#8995A6" /></linearGradient>
    </defs>
    {/* airport sign behind the car */}
    <g filter={`url(#${ar}-sh)`}>
      <rect x="77.5" y="22" width="3" height="26" rx="1.5" fill={`url(#${ar}-pole)`} />
      <circle cx="79" cy="20" r="10" fill={`url(#${ar}-sign)`} />
      <ellipse cx="75.5" cy="15.8" rx="3.8" ry="2.1" fill="#FFFFFF" opacity=".3" />
      <path d="M72.8 21.4 83.6 16.6c.9-.4 1.9.3 1.6 1.2-.1.4-.4.7-.8.9l-3.4 1.6 1 5.2-1.6.7-2.4-4.4-3.3 1.5-.1 1.9-1.2.5-.9-2.4-1.8-1.7 1.1-.5 1.5 1Z" fill="#FFFFFF" />
    </g>
    <ellipse cx="54" cy="79" rx="35" ry="5.5" fill="#6B3A00" opacity=".18" />
    {/* private car, three-quarter front view (facing right) */}
    <g filter={`url(#${ar}-sh)`}>
      {/* far-side wheel peeking under the nose */}
      <ellipse cx="83" cy="70" rx="4.2" ry="5.6" fill={`url(#${ar}-tyre)`} />
      {/* side body */}
      <path d="M17 64c0-7 3-11 10-12.5L46 48l20-1.5c3 0 5 1 6.5 3L74 58v12c0 2.5-1.8 4.3-4.3 4.3H23c-3.4 0-6-2.6-6-6V64Z" fill={`url(#${ar}-body)`} />
      {/* front face */}
      <path d="M72.5 49.5 84 48.2c3 0 5.2 2.3 5.2 5.4v10.6c0 3.4-2.4 6-5.6 6.4L74 71.6c-1 0-1.6-.7-1.6-1.7L72 58Z" fill={`url(#${ar}-face)`} />
      {/* hood top */}
      <path d="M46 48 65 45.2c4-.5 8-.3 11 .3l8.3 2.2c-1 .3-2 .4-3 .5L72.5 49.5 66 46.5Z" fill={`url(#${ar}-hood)`} />
      {/* cabin */}
      <path d="M27 51.6 34 37.5c1.2-2.4 3.6-4 6.4-4.1l17.2-.7c2.6-.1 5 1.1 6.5 3.2l7.4 9.9L46 48Z" fill={`url(#${ar}-roofg)`} />
      {/* side windows */}
      <path d="M32.2 49.4 37.4 39c.8-1.6 2.4-2.6 4.2-2.7l7.4-.3-.3 11.5Z" fill={`url(#${ar}-glass)`} />
      <path d="M51.3 35.9 57 35.7c1.8 0 3.4.8 4.4 2.2l3.8 5.3-14.4 3Z" fill={`url(#${ar}-glass)`} />
      {/* windscreen */}
      <path d="M64.8 37.6 71.8 46.6 66.4 46.4 62.6 40.4Z" fill={`url(#${ar}-glass2)`} />
      <path d="M38.5 38.6c1-1.3 2.3-1.8 4-1.9" stroke="#FFFFFF" strokeOpacity=".75" strokeWidth="1.4" strokeLinecap="round" />
      {/* door line, handle, trim */}
      <path d="M49.8 48.2 50 70" stroke="#C45F00" strokeOpacity=".5" strokeWidth="1" />
      <path d="M41 55h4M56 55h4" stroke="#FFE2C2" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M22 60.5 71 58.5" stroke="#FFFFFF" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" />
      {/* mirror */}
      <path d="M62.5 47.2c0-1.4 1.1-2.4 2.5-2.4h1.8v3.2h-3.5c-.5 0-.8-.3-.8-.8Z" fill="#E77800" />
      {/* headlights and grille */}
      <path d="M74.2 54.6c2.4-.4 4.6-.6 6.6-.6" stroke="#FFF6D1" strokeWidth="3" strokeLinecap="round" />
      <path d="M85 53.6h3" stroke="#FFF6D1" strokeWidth="3" strokeLinecap="round" />
      <rect x="76" y="59.5" width="10.5" height="4.4" rx="2" fill="#3B2A1E" opacity=".75" />
      <path d="M77.5 61.7h7.5" stroke="#9C8472" strokeWidth=".8" />
      <path d="M17.6 58h3.4" stroke="#FFD2D0" strokeWidth="2.4" strokeLinecap="round" />
      {/* near-side wheels */}
      <ellipse cx="30" cy="72" rx="6.4" ry="7.6" fill={`url(#${ar}-tyre)`} />
      <ellipse cx="30.8" cy="72" rx="3" ry="3.6" fill={`url(#${ar}-hub)`} />
      <ellipse cx="65" cy="72.5" rx="6.4" ry="7.6" fill={`url(#${ar}-tyre)`} />
      <ellipse cx="65.8" cy="72.5" rx="3" ry="3.6" fill={`url(#${ar}-hub)`} />
    </g>
    {/* suitcase in front */}
    <g filter={`url(#${ar}-sh)`}>
      <path d="M15.5 51v-5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v5" fill="none" stroke="#7A5A10" strokeWidth="2" strokeLinecap="round" />
      <rect x="10.5" y="51" width="19" height="25" rx="4" fill={`url(#${ar}-case)`} />
      <path d="M16 55v17M24 55v17" stroke="#C98B00" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
      <ellipse cx="14.5" cy="54.5" rx="2.6" ry="1.3" fill="#FFFFFF" opacity=".45" />
      <circle cx="14.5" cy="77.5" r="2" fill="#3A3A40" /><circle cx="25.5" cy="77.5" r="2" fill="#3A3A40" />
    </g>
  </svg>;
}
