"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AddBookingButton } from "./add-booking-button";
import { UserDeleteButton } from "../user-delete-button";
type Member = {
    id: string;
    email: string;
    name: string | null;
    surname: string | null;
    phone: string | null;
    trips: number;
    createdAt: string;
    lastSeenAt: string | null;
    marketingOptIn: number;
};
type Data = {
    items: unknown[];
    total: number;
    page: number;
    stats: Record<string, unknown> | null;
};
export function MembersWorkspace({ initial, canDelete, canExport }: {
    initial: Data;
    canDelete: boolean;
    canExport: boolean;
}) {
    const [data, setData] = useState(initial), [q, setQ] = useState(''), [filter, setFilter] = useState('all'), [sort, setSort] = useState('newest'), [page, setPage] = useState(1), [error, setError] = useState(''), [loading, setLoading] = useState(false);
    const query = new URLSearchParams({ q, filter, sort, page: String(page) }).toString();
    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setLoading(true);
            void fetch('/api/admin/users?' + query, { signal: controller.signal }).then(async (r) => {
                if (!r.ok)
                    throw new Error('Could not load members.');
                return r.json() as Promise<Data>;
            }).then(d => { setData(d); setError(''); }).catch(e => {
                if (e.name !== 'AbortError')
                    setError(e.message);
            }).finally(() => {
                if (!controller.signal.aborted)
                    setLoading(false);
            });
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query]);
    return <div className="p-4 sm:p-8 space-y-5"><div className="flex gap-3 justify-between"><Link href="/admin/crm" className="font-semibold text-orange-600">Open customer CRM →</Link>{canExport && <a href={'/api/admin/users?' + query + '&export=1'} className="rounded-xl border bg-white px-4 py-2">Export all matching members</a>}</div>
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[['total', 'Total members'], ['newThisMonth', 'New this month'], ['booked', 'Members who booked'], ['active30', 'Active in last 30 days']].map(([key, label]) => <div key={key} className="rounded-2xl border bg-white p-5"><p>{label}</p><p className="text-3xl mt-3 font-semibold">{Number(data.stats?.[key] ?? 0).toLocaleString()}</p></div>)}</div>
 <div className="flex flex-wrap gap-3"><input aria-label="Search all members" placeholder="Name, email or phone" className="rounded-xl border p-3" value={q} onChange={e => { setQ(e.target.value); setPage(1); }}/><select aria-label="Member filter" className="rounded-xl border p-3" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>{[['all', 'All'], ['booked', 'With trips'], ['none', 'No trips'], ['new', 'New this month']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select aria-label="Sort members" className="rounded-xl border p-3" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{[['newest', 'Newest'], ['oldest', 'Oldest'], ['name', 'Name'], ['trips', 'Most trips']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
 {error && <p role="alert" className="text-red-600">{error}</p>}<div className="overflow-x-auto rounded-2xl border bg-white" aria-busy={loading}><table className="w-full text-left"><thead><tr>{['Member', 'Phone', 'Trips', 'Joined', 'Offers', 'Actions'].map(h => <th className="p-4" key={h}>{h}</th>)}</tr></thead><tbody>{(data.items as Member[]).map(m => <tr className="border-t" key={m.id}><td className="p-4"><p>{m.name} {m.surname}</p><p className="text-sm text-slate-500">{m.email}</p></td><td className="p-4">{m.phone || '—'}</td><td className="p-4">{m.trips}</td><td className="p-4">{m.createdAt.slice(0, 10)}</td><td className="p-4">{m.marketingOptIn ? 'Yes' : 'No'}</td><td className="p-4">{canDelete && <AddBookingButton id={m.id} email={m.email}/>}{canDelete && <UserDeleteButton id={m.id} email={m.email}/>}</td></tr>)}</tbody></table>{!data.items.length && <p className="p-8">No matching members.</p>}</div>
 <div className="flex justify-between items-center"><p>{data.total.toLocaleString()} matches · Page {data.page} of {Math.max(1, Math.ceil(data.total / 50))}</p><div className="flex gap-3"><button disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)} className="border rounded-xl p-2 disabled:opacity-40">Previous</button><button disabled={loading || page * 50 >= data.total} onClick={() => setPage(p => p + 1)} className="border rounded-xl p-2 disabled:opacity-40">Next</button></div></div></div>;
}
