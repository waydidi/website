// Soft 3D-style illustration (clay look, like the app-tile icons): a calendar
// with a red "cancel" badge. Pure SVG, so it stays sharp at any size.
export function CancelCalendar3D({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="cc-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#F1F8FF" />
          <stop offset="1" stopColor="#D9EBFF" />
        </radialGradient>
        <linearGradient id="cc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E3E8EF" />
        </linearGradient>
        <linearGradient id="cc-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9D2DE" />
          <stop offset="1" stopColor="#AEB9C8" />
        </linearGradient>
        <linearGradient id="cc-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4F8BFF" />
          <stop offset="1" stopColor="#2F63D6" />
        </linearGradient>
        <linearGradient id="cc-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9AA6B6" />
          <stop offset=".5" stopColor="#F4F6F9" />
          <stop offset="1" stopColor="#8995A6" />
        </linearGradient>
        <radialGradient id="cc-red" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#FF7A6E" />
          <stop offset=".6" stopColor="#E8382B" />
          <stop offset="1" stopColor="#B81F16" />
        </radialGradient>
        <filter id="cc-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#1F3B66" floodOpacity=".22" />
        </filter>
      </defs>
      <circle cx="48" cy="48" r="46" fill="url(#cc-bg)" />
      <g filter="url(#cc-shadow)">
        {/* body thickness, then face */}
        <rect x="21" y="27" width="50" height="46" rx="9" fill="url(#cc-side)" />
        <rect x="21" y="24" width="50" height="45" rx="9" fill="url(#cc-body)" />
        {/* blue header */}
        <path d="M30 24h32a9 9 0 0 1 9 9v5H21v-5a9 9 0 0 1 9-9Z" fill="url(#cc-top)" />
        <rect x="21" y="36" width="50" height="2.5" fill="#2A56BD" opacity=".35" />
        {/* date dots */}
        {[0, 1, 2].map((row) => [0, 1, 2, 3].map((col) => (
          <rect key={`${row}-${col}`} x={28 + col * 10} y={44 + row * 8} width="6" height="5" rx="1.6" fill={row === 1 && col === 1 ? "#FFB4AD" : "#CBD5E2"} />
        )))}
        {/* rings */}
        <rect x="32" y="18" width="5" height="12" rx="2.5" fill="url(#cc-ring)" />
        <rect x="55" y="18" width="5" height="12" rx="2.5" fill="url(#cc-ring)" />
      </g>
      {/* red cancel badge */}
      <g filter="url(#cc-shadow)">
        <circle cx="68" cy="66" r="14" fill="url(#cc-red)" />
        <ellipse cx="63.5" cy="60.5" rx="5" ry="3" fill="#FFFFFF" opacity=".28" />
        <path d="m62.5 60.5 11 11m0-11-11 11" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}
