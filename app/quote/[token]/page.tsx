import { publicQuote } from "@/lib/crm";
import { QuoteAccept } from "@/components/crm/quote-accept";
import { WaydidiLogo } from "@/components/waydidi-logo";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your Waydidi quote", robots: { index: false, follow: false } };
export default async function Page({ params }: {
    params: Promise<{
        token: string;
    }>;
}) {
    const { token } = await params, q = await publicQuote(token);
    if (!q)
        return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Quote unavailable</h1><p className="mt-4">This quote has expired or been replaced. Please ask Waydidi for an updated quote.</p></main>;
    return <main className="mx-auto max-w-xl p-6"><WaydidiLogo /><div className="mt-8 rounded-3xl border bg-white p-6"><p className="text-sm text-slate-500">Quote · Revision {q.version}</p><h1 className="text-2xl font-semibold mt-2">{q.title}</h1><dl className="my-6 space-y-3">{[['Pickup', q.pickup], ['Destination', q.dropoff], ['Date & time', `${q.trip_date} ${q.trip_time} (Thailand time)`], ['Vehicle', q.vehicle.replaceAll('_', ' ')], ['Total', `THB ${(q.amount_minor / 100).toLocaleString()}`], ['Valid until', new Date(q.expires_at).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })]].map(([k, v]) => <div key={k}><dt className="text-sm text-slate-500">{k}</dt><dd>{v}</dd></div>)}</dl><p className="text-sm text-slate-600 mb-5">Acceptance lets you complete your passenger details. Your ride is confirmed only after the booking process is completed.</p><QuoteAccept token={token} accepted={q.status === 'accepted'}/></div></main>;
}
