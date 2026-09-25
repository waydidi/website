// A 3D-style catamaran ferry on the sea, drawn in SVG (no photo to download).
export function FerryIllustration({ className }: { className?: string }) {
  return <svg viewBox="0 0 320 190" className={className} role="img" aria-label="Ferry to the island">
    <defs>
      <linearGradient id="fi-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2F7FA0" /><stop offset="1" stopColor="#0E4E6B" /></linearGradient>
      <linearGradient id="fi-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E3E8EE" /></linearGradient>
      <linearGradient id="fi-hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".7" stopColor="#E9EEF3" /><stop offset="1" stopColor="#C9D3DC" /></linearGradient>
      <linearGradient id="fi-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#B9C5D0" /><stop offset="1" stopColor="#DCE3EA" /></linearGradient>
      <linearGradient id="fi-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A2F38" /><stop offset=".5" stopColor="#11141A" /><stop offset="1" stopColor="#1E232B" /></linearGradient>
      <radialGradient id="fi-shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#062B3C" stopOpacity=".55" /><stop offset="1" stopColor="#062B3C" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="320" height="190" rx="18" fill="url(#fi-sea)" />
    {/* Small waves */}
    <g stroke="#FFFFFF" strokeOpacity=".16" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <path d="M18 30q8-4 16 0M60 52q8-4 16 0M250 34q8-4 16 0M282 70q8-4 16 0M30 150q8-4 16 0M120 168q8-4 16 0M262 160q8-4 16 0" />
    </g>
    {/* Wake behind the boat */}
    <path d="M232 104 C262 96 290 92 320 86 L320 118 C292 116 262 118 236 122 Z" fill="#FFFFFF" fillOpacity=".55" />
    <path d="M236 110 C266 104 294 104 320 100" stroke="#FFFFFF" strokeOpacity=".9" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* Shadow on the water */}
    <ellipse cx="150" cy="136" rx="110" ry="16" fill="url(#fi-shadow)" />
    {/* Back hull (side face) */}
    <path d="M84 104 L238 94 L246 110 L96 124 Z" fill="url(#fi-side)" />
    {/* Front hull */}
    <path d="M64 112 L232 100 L240 118 L232 124 L86 138 Q70 134 64 112 Z" fill="url(#fi-hull)" />
    <path d="M86 138 L232 124 L240 118" fill="none" stroke="#9FB0BF" strokeWidth="1.2" />
    {/* Brand stripe */}
    <path d="M104 121 L214 112 L214 116 L104 125 Z" fill="#FF8A05" />
    {/* Deck */}
    <path d="M70 104 L236 92 L242 100 L76 113 Z" fill="#2B3038" />
    {/* Railings at the bow */}
    <path d="M72 102 L72 92 M82 101 L82 91 M92 100 L92 90 M70 92 L100 90" stroke="#C9D2DA" strokeWidth="1.4" strokeLinecap="round" />
    {/* Cabin glass */}
    <path d="M98 98 L222 88 L224 64 L106 74 Z" fill="url(#fi-glass)" />
    <path d="M110 76 L220 67" stroke="#FFFFFF" strokeOpacity=".18" strokeWidth="2" />
    {/* Roof, raised and overhanging */}
    <path d="M94 74 L226 62 L248 70 L116 84 Z" fill="url(#fi-roof)" />
    <path d="M116 84 L248 70 L248 74 L116 88 Z" fill="#C7D0D9" />
    {/* Mast and flag */}
    <path d="M212 64 L212 44" stroke="#8C99A6" strokeWidth="1.6" />
    <g transform="translate(212 44)"><rect width="16" height="10" fill="#A51931" /><rect y="1.7" width="16" height="6.6" fill="#FFFFFF" /><rect y="3.3" width="16" height="3.4" fill="#2D2A4A" /></g>
    {/* Life ring */}
    <circle cx="232" cy="96" r="3.4" fill="none" stroke="#FF5A36" strokeWidth="2" />
  </svg>;
}
