// "Authorized payment partner" mark for Payso (Pay Solutions Thailand).
// Text mark until the official Payso logo file is supplied; swap the <span> for the image then.
export function PaysoBadge({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  const dark = tone === "dark";
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${dark ? "border-slate-200 bg-white text-slate-700" : "border-white/40 text-white"} ${className}`}>
    <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${dark ? "text-slate-500" : "text-white/80"}`}>Authorized payment partner</span>
    <span aria-label="Payso" className={`text-[16px] font-black italic leading-none tracking-[-.02em] ${dark ? "text-[#0B5FA5]" : "text-white"}`}>Payso</span>
  </span>;
}
