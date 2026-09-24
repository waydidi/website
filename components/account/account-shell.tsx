import type { ReactNode } from "react";
import { AccountNav } from "@/components/account/account-nav";
import { PublicFooter } from "@/components/public-footer";

export function AccountShell({ name, email, children }: { name: string | null; email: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[#F5F6F8] text-[#211726]">
    <div className="mx-auto grid max-w-[1180px] gap-6 px-5 pb-28 pt-8 lg:grid-cols-[250px_1fr] lg:pb-16 lg:pt-10">
      <aside className="hidden lg:block">
        <div className="sticky top-[121px] rounded-[24px] bg-white p-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-lg font-black text-[#D96F00]">{(name || email).charAt(0).toUpperCase()}</span>
            <div className="min-w-0"><p className="truncate font-black">{name || "Your account"}</p><p className="truncate text-sm text-slate-500">{email}</p></div>
          </div>
          <AccountNav variant="sidebar" />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
    <AccountNav variant="tabs" />
    <PublicFooter />
  </main>;
}

export function formatTripDate(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(parsed.getTime())) return `${date} ${time}`;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(parsed);
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="mb-6"><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">{title}</h1>{subtitle ? <p className="mt-2 text-slate-600">{subtitle}</p> : null}</div>;
}
