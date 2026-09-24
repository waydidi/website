import type { Metadata } from "next";
import { Search } from "lucide-react";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { UserDeleteButton } from "@/components/user-delete-button";
import { requireWaydidiAdmin } from "@/lib/admin";
import { listCustomers } from "@/lib/customer-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Users · Waydidi operations", robots: { index: false, follow: false } };

const PROVIDER_LABELS: Record<string, string> = { google: "Google", apple: "Apple", line: "LINE", facebook: "Facebook" };
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");

export default async function UsersAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/users");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const query = ((await searchParams).q ?? "").slice(0, 100);
  const users = await listCustomers(query);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const newThisMonth = users.filter((u) => new Date(u.createdAt) >= monthStart).length;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-[#1f1726] sm:px-8">
    <div className="mx-auto max-w-[1500px]">
      {/* The admin layout shows the page title in its own header bar. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-slate-500">Members who registered on the website{query ? ` · matching “${query}”` : ""}. Only admins can delete an account.</p>
        <div className="flex gap-2 text-sm font-bold">
          <span className="rounded-full bg-slate-200 px-4 py-2">{users.length}{users.length === 500 ? "+" : ""} {query ? "found" : users.length === 1 ? "member" : "members"}</span>
          {!query && <span className="rounded-full bg-emerald-100 px-4 py-2 text-emerald-800">{newThisMonth} new this month</span>}
        </div>
      </div>

      <form className="mt-5 flex max-w-xl gap-2" role="search">
        <label className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 focus-within:border-[#FF8A05]">
          <Search size={17} className="text-slate-400" aria-hidden="true" />
          <span className="sr-only">Search users</span>
          <input name="q" defaultValue={query} placeholder="Search name, email or phone" className="w-full bg-transparent py-2.5 outline-none" />
        </label>
        <button className="rounded-full bg-[#211726] px-5 text-sm font-bold text-white">Search</button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-[.08em] text-slate-500">
            <tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Signs in with</th><th className="px-4 py-3 text-right">Trips</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Last active</th><th className="px-4 py-3">Offers</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length ? users.map((user) => {
              const methods = ["Email", ...(user.providers ?? "").split(",").filter(Boolean).map((p) => PROVIDER_LABELS[p] ?? p)];
              return <tr key={user.id} className="align-top">
                <td className="px-4 py-3"><p className="font-bold">{[user.name, user.surname].filter(Boolean).join(" ") || "—"}</p><p className="text-slate-500">{user.email}</p></td>
                <td className="px-4 py-3 text-slate-600">{user.phone || "—"}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{methods.map((m) => <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{m}</span>)}</div></td>
                <td className="px-4 py-3 text-right font-bold">{user.trips}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(user.lastSeenAt)}</td>
                <td className="px-4 py-3 text-slate-600">{user.marketingOptIn ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-right"><UserDeleteButton id={user.id} email={user.email} /></td>
              </tr>;
            }) : <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">{query ? "No users match your search." : "No one has registered yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </main>;
}
