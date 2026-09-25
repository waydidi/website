import Link from "next/link";

const TABS = [["Areas", "/admin/pricing"], ["Hourly", "/admin/hourly"], ["Routes", "/admin/routes"]] as const;

// Phone-only sub-tabs of "Fare management" (desktop uses the sidebar dropdown): area fares, hourly pricing and route inclusions.
export function FareTabs({ current }: { current: (typeof TABS)[number][1] }) {
  return <nav aria-label="Fare management" className="px-4 pt-4 sm:px-8 md:hidden">
    <div className="inline-flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
      {TABS.map(([label, href]) => <Link key={href} href={href} aria-current={current === href ? "page" : undefined} className={`rounded-full px-5 py-2 text-sm font-bold ${current === href ? "bg-[#FF8A05] text-white" : "text-slate-600 hover:text-[#C96100]"}`}>{label}</Link>)}
    </div>
  </nav>;
}
