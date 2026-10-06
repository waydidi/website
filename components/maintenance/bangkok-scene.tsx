// Silhouettes of well-known Bangkok places, drawn as one 2400×420 strip. The maintenance page shows
// each strip twice side by side and slides them left, so the skyline scrolls past without a seam.
// Shapes are simplified from the real landmarks (left to right in the near strip):
// Wat Arun's prang, Rama VIII Bridge's single pylon, the Grand Palace's tiered roofs and spire,
// the Giant Swing, the Golden Mount with its chedi, the Democracy Monument's four wings, Wat Pho's chedis.

const NEAR = "#A84F0E";
const MID = "#C9671A";
const FAR = "#E79A55";

function Palm({ x, s = 1 }: { x: number; s?: number }) {
  return <g transform={`translate(${x} 330) scale(${s})`} fill={NEAR}>
    <path d="M-3 0 C-1 -40 2 -80 6 -112 L10 -112 C7 -80 4 -40 3 0Z" />
    <path d="M8 -112 C-20 -128 -46 -120 -60 -100 C-38 -112 -18 -112 8 -110Z M8 -112 C34 -130 62 -124 76 -104 C54 -114 32 -114 8 -110Z M8 -112 C0 -140 -18 -150 -36 -148 C-16 -140 -4 -128 6 -110Z M8 -112 C20 -142 40 -150 58 -146 C38 -138 24 -126 10 -110Z" />
  </g>;
}

/** Far layer: the modern skyline (MahaNakhon's "pixel" tower, Baiyoke Tower II, State Tower's dome). */
export function FarSkyline() {
  return <svg viewBox="0 0 2400 420" className="h-full w-auto shrink-0" preserveAspectRatio="xMinYMax meet" aria-hidden>
    <g fill={FAR}>
      {/* low blocks */}
      <path d="M0 330 V292 H70 V270 H130 V300 H190 V260 H250 V296 H320 V330Z M1300 330 V286 H1360 V262 H1420 V296 H1480 V276 H1540 V330Z M2100 330 V290 H2170 V268 H2230 V300 H2290 V280 H2400 V330Z" />
      {/* MahaNakhon: tall tower with the stepped "pixel" spiral cut out of one side */}
      <path d="M420 330 V70 H470 V100 H462 V128 H470 V156 H458 V184 H470 V212 H456 V240 H470 V268 H460 V296 H470 V330Z" />
      <path d="M470 70 H500 V330 H470Z" />
      {/* Baiyoke Tower II: slim tower, crown and antenna */}
      <path d="M760 330 V110 H770 V96 H810 V110 H820 V330Z M786 96 V48 H794 V96Z" />
      <path d="M700 330 V230 H740 V330Z M840 330 V250 H880 V330Z" />
      {/* State Tower: wide tower with the golden dome on top */}
      <path d="M1080 330 V150 H1170 V330Z M1090 150 V138 H1160 V150Z M1100 138 C1100 104 1150 104 1150 138Z M1123 104 V80 H1127 V104Z" />
      <path d="M1600 330 V180 H1650 V330Z M1660 330 V220 H1700 V330Z M1900 330 V160 H1960 V140 H1990 V330Z" />
    </g>
  </svg>;
}

/** Near layer: the temples and monuments by the river. */
export function NearLandmarks() {
  return <svg viewBox="0 0 2400 420" className="h-full w-auto shrink-0" preserveAspectRatio="xMinYMax meet" aria-hidden>
    {/* Wat Arun: the central prang with two small prangs */}
    <g fill={MID}>
      <path d="M130 330 L130 300 L145 300 L152 250 L162 250 L170 180 L178 180 L184 110 L189 60 L192 30 L195 60 L200 110 L206 180 L214 180 L222 250 L232 250 L239 300 L254 300 L254 330Z" />
      <path d="M80 330 L84 300 L92 300 L98 268 L104 240 L108 268 L114 300 L122 300 L126 330Z" />
      <path d="M262 330 L266 300 L274 300 L280 268 L286 240 L290 268 L296 300 L304 300 L308 330Z" />
    </g>
    <Palm x={360} s={0.95} />
    {/* Rama VIII Bridge: single inverted-Y pylon, fan of cables, deck over the river */}
    <g stroke={NEAR} fill="none" strokeLinecap="round">
      <path d="M430 300 H700" strokeWidth="7" />
      <path d="M555 330 L570 90 L585 330" strokeWidth="9" fill="none" />
      <g strokeWidth="2">
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={`l${i}`} d={`M570 ${110 + i * 26} L${450 + i * 18} 300`} />)}
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={`r${i}`} d={`M570 ${110 + i * 26} L${690 - i * 18} 300`} />)}
      </g>
    </g>
    {/* Grand Palace: Chakri Maha Prasat style, tiered roofs and tall spire */}
    <g fill={NEAR}>
      <path d="M760 330 V286 H960 V330Z" />
      <path d="M740 290 L860 226 L980 290Z" />
      <path d="M770 262 L860 200 L950 262Z" />
      <path d="M800 232 L860 176 L920 232Z" />
      <path d="M838 182 L842 150 L848 120 L856 70 L860 40 L864 70 L872 120 L878 150 L882 182Z" />
      <path d="M740 290 L728 276 M980 290 L992 276" stroke={NEAR} strokeWidth="5" strokeLinecap="round" />
    </g>
    <Palm x={1030} s={1.05} />
    {/* Giant Swing (Sao Chingcha): two tall red pillars and a carved crossbar */}
    <g fill={MID}>
      <path d="M1110 330 L1118 120 L1128 120 L1124 330Z M1186 330 L1182 120 L1192 120 L1200 330Z" />
      <path d="M1100 122 H1210 L1204 108 H1106Z" />
      <path d="M1112 150 H1198 V158 H1112Z" />
    </g>
    {/* Golden Mount (Wat Saket): the hill with the chedi on top */}
    <g fill={NEAR}>
      <path d="M1260 330 C1290 290 1320 250 1360 236 L1460 236 C1500 250 1530 290 1560 330Z" />
      <path d="M1376 236 V222 H1444 V236Z M1386 222 C1386 196 1400 182 1410 178 C1420 182 1434 196 1434 222Z M1404 178 L1408 140 L1410 112 L1412 140 L1416 178Z" />
    </g>
    <Palm x={1610} s={0.9} />
    {/* Democracy Monument: four tall wings around the central turret */}
    <g fill={MID}>
      <path d="M1680 330 V318 H1880 V330Z" />
      <path d="M1694 318 L1700 180 L1716 176 L1712 318Z M1848 318 L1844 176 L1860 180 L1866 318Z" />
      <path d="M1736 318 L1740 210 L1752 206 L1752 318Z M1808 318 L1808 206 L1820 210 L1824 318Z" />
      <path d="M1758 318 V258 H1802 V318Z M1764 258 C1764 236 1796 236 1796 258Z M1778 236 V224 H1782 V236Z" />
    </g>
    {/* Wat Pho: a row of slender chedis */}
    <g fill={NEAR}>
      {[1970, 2030, 2090, 2150].map((x, i) => <path key={x} d={`M${x - 20} 330 V316 H${x + 20} V330Z M${x - 14} 316 C${x - 14} 296 ${x - 6} 286 ${x} 282 C${x + 6} 286 ${x + 14} 296 ${x + 14} 316Z M${x - 4} 282 L${x} ${i % 2 ? 210 : 190} L${x + 4} 282Z`} />)}
    </g>
    <Palm x={2240} s={1} />
    <Palm x={2330} s={0.85} />
    {/* Riverbank */}
    <path fill={NEAR} d="M0 326 H2400 V344 H0Z" />
  </svg>;
}

/** A tuk-tuk, small enough to drive along the riverbank. */
export function TukTuk() {
  return <svg viewBox="0 0 70 44" className="h-full w-auto" aria-hidden>
    <g fill="#8A3F0A">
      <path d="M6 30 V14 C6 8 10 4 18 4 H50 C56 4 58 8 58 12 V30Z" />
      <path d="M58 18 H64 L68 30 H58Z" />
      <circle cx="16" cy="34" r="7" /><circle cx="50" cy="34" r="7" /><circle cx="62" cy="34" r="5" />
    </g>
    <path fill="#FFE7C7" opacity=".55" d="M12 12 H30 V22 H12Z M34 12 H50 V22 H34Z" />
  </svg>;
}
