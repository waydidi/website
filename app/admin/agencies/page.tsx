import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { getDb } from "@/db";
import { agencyApplications } from "@/db/schema";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agency applications · Waydidi operations", robots: { index: false, follow: false } };

// Partner applications sent from /agencies, newest first.
export default async function AgencyApplicationsPage() {
  const access = await requireWaydidiAdmin("/admin/agencies");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const rows = await getDb().select().from(agencyApplications).orderBy(desc(agencyApplications.createdAt)).limit(300).catch(() => null);
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-[#1f1726] sm:px-8">
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-2xl font-black">Agency applications</h1>
      <p className="mt-1 text-sm text-slate-600">From the <a href="/agencies" className="underline">Travel agencies</a> page. Reply by email; the page promises an answer within 2 working days.</p>
      {!rows ? <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">The agency_applications table isn&apos;t in the database yet.</p>
        : rows.length === 0 ? <p className="mt-6 rounded-2xl bg-white p-8 text-center text-slate-500">No applications yet.</p>
        : <ul className="mt-5 grid gap-3">{rows.map((r) => <li key={r.id} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-lg font-bold">{r.agencyName} <span className="text-sm font-normal text-slate-500">· {r.country}</span></p><p className="text-sm text-slate-500">{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p></div>
          <p className="mt-1 text-sm">{r.contactName} · <a href={`mailto:${r.email}`} className="font-semibold text-[#C96100] underline">{r.email}</a> · {r.phone}{r.website && <> · <a href={r.website} target="_blank" rel="noopener noreferrer nofollow" className="underline">{r.website}</a></>}</p>
          <p className="mt-1 text-sm text-slate-600">Transfers per month: <strong>{r.monthlyTransfers}</strong></p>
          {r.message && <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{r.message}</p>}
        </li>)}</ul>}
    </div>
  </main>;
}
