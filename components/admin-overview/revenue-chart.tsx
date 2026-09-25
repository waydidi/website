"use client";

import { useState } from "react";

type Day = { day: string; bookings: number; revenue: number };

const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Single-series bar chart: revenue per day, last 30 days. Hover (or tap) a bar for the
// day's revenue and bookings; a hidden table carries the same numbers for screen readers.
export function RevenueChart({ data }: { data: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const W = 600, H = 160, gap = 2, bw = W / data.length - gap;
  const active = hover == null ? null : data[hover];
  return <figure className="relative">
    <div className="flex items-baseline justify-between text-[12px] text-slate-500">
      <span>{thb(max)}</span>
      {active && <span className="font-semibold text-slate-800">{label(active.day)} · {thb(active.revenue)} · {active.bookings} booking{active.bookings === 1 ? "" : "s"}</span>}
    </div>
    <svg viewBox={`0 0 ${W} ${H + 1}`} className="mt-1 block h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Revenue per day, last 30 days" onMouseLeave={() => setHover(null)}>
      <line x1="0" x2={W} y1={H} y2={H} stroke="#E2E8F0" strokeWidth="1" />
      {data.map((d, i) => {
        const h = d.revenue ? Math.max(3, (d.revenue / max) * (H - 6)) : 0;
        const x = i * (bw + gap);
        const r = Math.min(4, bw / 2, h);
        return <g key={d.day} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
          {/* Hit target: the full column, bigger than the bar. */}
          <rect x={x} y="0" width={bw + gap} height={H} fill="transparent" />
          {h > 0 && <path d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + bw - r} Q${x + bw},${H - h} ${x + bw},${H - h + r} V${H} Z`} fill={hover === i ? "#C96100" : "#FF8A05"} />}
        </g>;
      })}
    </svg>
    <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>{label(data[0].day)}</span><span>{label(data[data.length - 1].day)}</span></div>
    <table className="sr-only"><caption>Revenue per day</caption><thead><tr><th>Day</th><th>Revenue (THB)</th><th>Bookings</th></tr></thead>
      <tbody>{data.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.revenue}</td><td>{d.bookings}</td></tr>)}</tbody></table>
  </figure>;
}
