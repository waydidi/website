"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CustomerPicker } from "./customer-picker";
import { useSearchParams } from "next/navigation";
import { STAGES } from "@/lib/crm-rules";
import { VEHICLES } from "@/lib/vehicles";
type Row = Record<string, string | number | null>;
type Data = {
    items?: Row[];
    total?: number;
    page?: number;
    team?: {
        id: string;
        name: string;
    }[];
    contact?: Row;
    bookings?: Row[];
    chats?: Row[];
    leads?: Row[];
    tasks?: Row[];
    quotes?: Row[];
    events?: Row[];
    matches?: Row[];
    contacts?: Row;
    stages?: Row[];
    sources?: Row[];
    retention?: Row[];
    members?: Row[];
    stats?: Row;
    service?: Row;
};
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm';
const btn = 'rounded-xl bg-[#FE8B05] px-4 py-2.5 font-semibold text-white disabled:opacity-40';
const secondary = 'rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40';
const fmt = (v: unknown) => String(v ?? '—'), money = (n: unknown) => `THB ${(Number(n ?? 0) / 100).toLocaleString()}`;
const label = (s: string) => s.replaceAll('_', ' ').replace(/^./, v => v.toUpperCase());
const time = (v: unknown) => v ? new Date(String(v)).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : '—';
export function CrmWorkspace({ me }: {
    me: {
        id: string;
        role: string;
    };
}) {
    const searchParams = useSearchParams();
    const [view, setView] = useState(searchParams.get('view') ?? 'dashboard'), [q, setQ] = useState(''), [page, setPage] = useState(1), [filter, setFilter] = useState(''), [data, setData] = useState<Data>({}), [profile, setProfile] = useState<Data | null>(null), [team, setTeam] = useState<{
        id: string;
        name: string;
    }[]>([]), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [dialog, setDialog] = useState<{
        kind: string;
        row?: Row;
    } | null>(null), [partner, setPartner] = useState<Data | null>(null);
    const tabs = ['dashboard', 'customers', 'pipeline', 'tasks', 'quotes', ...(me.role === 'support' ? [] : ['partners', 'retention', 'emails'])];
    useEffect(() => {
        const ac = new AbortController(), t = setTimeout(() => {
            setLoading(true);
            void fetch('/api/admin/crm?' + new URLSearchParams({ view, q, page: String(page), filter }), { signal: ac.signal }).then(async (r) => {
                const d = await r.json();
                if (!r.ok)
                    throw new Error(d.error);
                return d as Data;
            }).then(d => {
                setData(d);
                if (d.team)
                    setTeam(d.team);
                setError('');
            }).catch(e => {
                if (e.name !== 'AbortError')
                    setError(e.message);
            }).finally(() => {
                if (!ac.signal.aborted)
                    setLoading(false);
            });
        }, 180);
        return () => { clearTimeout(t); ac.abort(); };
    }, [view, q, page, filter, refresh]);
    async function openProfile(id: unknown) {
        setError('');
        try {
            const r = await fetch('/api/admin/crm?id=' + encodeURIComponent(String(id))), d = await r.json();
            if (!r.ok)
                throw new Error(d.error);
            setProfile(d);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load customer.');
        }
    }
    const initialProfileId = searchParams.get('id');
    useEffect(() => {
        if (!initialProfileId)
            return;
        const controller = new AbortController();
        void fetch('/api/admin/crm?id=' + encodeURIComponent(initialProfileId), { signal: controller.signal }).then(async (r) => {
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.error);
            setProfile(d);
        }).catch(e => {
            if (e.name !== 'AbortError')
                setError(e.message);
        });
        return () => controller.abort();
    }, [initialProfileId]);
    async function act(action: string, input: Record<string, unknown>) {
        setBusy(true);
        setError('');
        try {
            const r = await fetch('/api/admin/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...input }) }), d = await r.json();
            if (!r.ok)
                throw new Error(d.error);
            setRefresh(n => n + 1);
            if (profile?.contact)
                await openProfile(action === 'merge' ? d.id : profile.contact.id);
            setNotice(d.url ? `Quote link: ${d.url}` : 'Saved');
            return d;
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save.');
            return null;
        }
        finally {
            setBusy(false);
        }
    }
    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!dialog)
            return;
        const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, unknown>, kind = dialog.kind;
        if (kind === 'quote')
            values.amountMinor = Math.round(Number(values.amount) * 100);
        if (kind === 'lead')
            values.valueMinor = Math.round(Number(values.amount) * 100);
        if (kind === 'retention') {
            values.days = Number(values.days);
            values.enabled = values.enabled === 'on';
        }
        if (kind === 'consent')
            values.optIn = values.optIn === 'on';
        if (kind === 'partner')
            values.active = values.active === 'on';
        if (values.dueAt)
            values.dueAt = new Date(String(values.dueAt) + '+07:00').toISOString();
        if (values.expiresAt)
            values.expiresAt = new Date(String(values.expiresAt) + '+07:00').toISOString();
        if (values.leadId === '')
            values.leadId = null;
        if (!values.ownerId)
            values.ownerId = null;
        const out = await act(kind, { ...values, ...(dialog.row?.id ? { id: dialog.row.id } : {}) });
        if (out)
            setDialog(null);
    }
    const c = profile?.contact;
    const [formCustomer, setFormCustomer] = useState(''), [formLeads, setFormLeads] = useState<Record<string, Row[]>>({}), [formLead, setFormLead] = useState(''), [leadsLoading, setLeadsLoading] = useState(false), [leadsError, setLeadsError] = useState('');
    useEffect(() => {
        setFormCustomer(String(dialog?.row?.contact_id ?? c?.id ?? ''));
        setFormLead(String(dialog?.row?.lead_id ?? ''));
        setLeadsError('');
    }, [dialog, c?.id]);
    useEffect(() => {
        if (!dialog || !['task','quote'].includes(dialog.kind) || !formCustomer) return;
        const ac = new AbortController();
        setLeadsLoading(true); setLeadsError('');
        void fetch('/api/admin/crm?id=' + encodeURIComponent(formCustomer), { signal: ac.signal }).then(async r => {
            const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Could not load enquiries.'); return d;
        }).then(d => setFormLeads(prev => ({ ...prev, [formCustomer]: d.leads ?? [] }))).catch(e => {
            if (e.name !== 'AbortError') setLeadsError(e.message);
        }).finally(() => { if (!ac.signal.aborted) setLeadsLoading(false); });
        return () => ac.abort();
    }, [dialog, formCustomer]);
    function owner(defaultId?: unknown) { return <label className="block text-sm">Assigned staff<select name="ownerId" className={field} defaultValue={String(defaultId ?? me.id)}>{team.length ? team.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : <option value={me.id}>Me</option>}</select></label>; }
    function customer(defaultId?: unknown) { const cid = String(defaultId ?? c?.id ?? ''); return <CustomerPicker initialId={cid} initialName={String(dialog?.row?.name ?? c?.name ?? '')} onSelect={id => { if (id !== formCustomer) { setFormLead(''); setFormCustomer(id); } }}/>; }
    function leadPicker() {
        const list = formCustomer ? formLeads[formCustomer] ?? [] : [];
        return <label className="block text-sm">Linked enquiry (optional)<select name="leadId" className={field} value={formLead} onChange={e => setFormLead(e.target.value)} disabled={leadsLoading || !!leadsError}>
            <option value="">No linked enquiry</option>
            {formLead && !list.some(l => String(l.id) === formLead) && <option value={formLead}>Current enquiry</option>}
            {list.filter(l => String(l.id) === formLead || !['won', 'lost', 'cancelled'].includes(String(l.stage))).map(l => <option key={fmt(l.id)} value={fmt(l.id)}>{fmt(l.title)} · {label(fmt(l.stage))}</option>)}
        </select>{leadsLoading && <span role="status">Loading enquiries…</span>}{leadsError && <span role="alert">{leadsError}</span>}</label>;
    }
    const input = (name: string, title: string, type = 'text', required = true, value?: unknown) => <label className="block text-sm">{title}<input name={name} type={type} required={required} defaultValue={value == null ? '' : String(value)} className={field}/></label>;
    return <div className="p-4 sm:p-8 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Customer management</h1><Link href="/admin/users" className={secondary}>Registered members</Link></div>
 <nav className="flex flex-wrap gap-2" aria-label="CRM views">{tabs.map(t => <button key={t} onClick={() => { setView(t); setPage(1); setFilter(''); setProfile(null); }} className={view === t ? btn : secondary}>{label(t)}</button>)}</nav>
 <p className="text-xs text-slate-500">All schedule times use Thailand time (UTC+7).</p>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}{notice && <div className="break-all rounded-xl bg-green-50 p-3 text-sm">{notice}<button onClick={() => setNotice('')} className="ml-3 underline">Dismiss</button></div>}
 {view === 'dashboard' ? <><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[['Customer records', data.contacts?.total], ['Registered contacts', data.contacts?.members], ['Guest records', data.contacts?.guests], ['Overdue tasks', (data.tasks as unknown as Row)?.overdue], ['Repeat customer records', data.service?.repeat_customers], ['Avg. staff response (minutes)', data.service?.response_minutes == null ? '—' : Math.round(Number(data.service.response_minutes))]].map(([k, v]) => <div key={String(k)} className="rounded-2xl border bg-white p-5"><p>{k}</p><p className="text-3xl mt-3 font-semibold">{fmt(v ?? 0)}</p></div>)}</div><div className="grid lg:grid-cols-2 gap-5"><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold mb-4">Sales pipeline</h2>{(data.stages ?? []).map(s => <div key={fmt(s.stage)} className="flex justify-between border-t py-3"><span>{label(fmt(s.stage))}</span><span>{fmt(s.count)} · {money(s.value_minor)}</span></div>)}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold mb-4">Enquiry conversion by source</h2>{(data.sources ?? []).map(s => <div key={fmt(s.source)} className="border-t py-3 flex justify-between"><span>{fmt(s.source)}</span><span>{fmt(s.won)}/{fmt(s.leads)} booked · {money(s.revenue_minor)}</span></div>)}<p className="text-xs mt-3 text-slate-500">Booking totals, before refunds. Imported historical bookings are included.</p></section><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Quote outcomes</h2>{(data.quotes ?? []).map(s => <p key={fmt(s.status)}>{label(fmt(s.status))}: {fmt(s.count)}</p>)}<h2 className="font-semibold mt-4">Email delivery</h2>{(data.retention ?? []).map(s => <p key={fmt(s.status)}>{label(fmt(s.status))}: {fmt(s.count)}</p>)}<p className="text-xs mt-3">Failed emails retry up to five attempts; stale processing recovers after 15 minutes.</p></section></div></> : <>
 <div className="flex flex-wrap gap-3"><input aria-label="Search CRM" className={field + ' max-w-xs'} placeholder="Search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }}/>{['customers', 'pipeline', 'tasks', 'emails'].includes(view) && <select aria-label="Filter" className={field + ' max-w-xs'} value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="">All</option>{(view === 'pipeline' ? STAGES : view === 'tasks' ? ['open', 'overdue', 'completed', 'cancelled'] : view === 'emails' ? ['pending', 'failed', 'needs_review', 'sent', 'cancelled', 'processing'] : ['members', 'guests']).map(s => <option key={s} value={s}>{label(s)}</option>)}</select>}
 {['customers', 'pipeline', 'tasks', 'quotes'].includes(view) && <button className={btn} onClick={() => setDialog({ kind: view === 'customers' ? 'contact' : view === 'pipeline' ? 'lead' : view === 'tasks' ? 'task' : 'quote' })}>Create {view === 'customers' ? 'customer' : view === 'pipeline' ? 'enquiry' : view === 'tasks' ? 'task' : 'quote'}</button>}{view === 'retention' && me.role === 'owner' && <button className={btn} onClick={() => setDialog({ kind: 'retention' })}>Create automation</button>}{view === 'customers' && me.role !== 'support' && <a className={secondary} href={'/api/admin/crm?view=export&q=' + encodeURIComponent(q) + '&filter=' + encodeURIComponent(filter)}>Export customers</a>}</div>
 <div className="rounded-2xl border bg-white overflow-x-auto" aria-busy={loading}><table className="w-full text-left text-sm"><thead><tr>{(view === 'customers' ? ['Customer', 'Contact', 'Trips / spend', 'Owner', 'Actions'] : view === 'pipeline' ? ['Enquiry', 'Customer', 'Stage', 'Value', 'Actions'] : view === 'tasks' ? ['Task', 'Customer', 'Due', 'Status / owner', 'Actions'] : view === 'quotes' ? ['Quote', 'Customer', 'Status', 'Amount', 'Actions'] : view === 'partners' ? ['Agency', 'Contact', 'Status', 'Portal staff', 'Actions'] : view === 'emails' ? ['Recipient', 'Attempts', 'Last attempt', 'Status', 'Actions'] : ['Automation', 'Type', 'Delay', 'Channel / status', 'Actions']).map(s => <th key={s} className="p-4 whitespace-nowrap">{s}</th>)}</tr></thead><tbody>{(data.items ?? []).map(r => <tr key={fmt(r.id)} className="border-t">
 {view === 'customers' ? <><td className="p-4"><button onClick={() => void openProfile(r.id)} className="font-semibold text-orange-600">{fmt(r.name)}</button><p className="text-xs text-slate-500">{r.member_id ? 'Member' : 'Guest'} </p></td><td className="p-4">{fmt(r.email)}<br />{fmt(r.phone)}</td><td className="p-4">{fmt(r.trips)} · THB {Number(r.spend ?? 0).toLocaleString()}</td><td className="p-4">{team.find(s => s.id === r.owner_id)?.name ?? 'Unassigned'}</td><td className="p-4"><button className={secondary} onClick={() => void openProfile(r.id)}>Open profile</button></td></> :
                    view === 'pipeline' ? <><td className="p-4">{fmt(r.title)}<p className="text-xs text-slate-500">{fmt(r.source)}</p></td><td className="p-4"><button className="text-orange-600" onClick={() => void openProfile(r.contact_id)}>{fmt(r.name)}</button></td><td className="p-4">{label(fmt(r.stage))}{r.loss_reason && <p className="text-xs">{fmt(r.loss_reason)}</p>}</td><td className="p-4">{money(r.value_minor)}</td><td className="p-4">{!r.booking_reference ? <select className={field} aria-label="Change sales stage" value={fmt(r.stage)} disabled={busy} onChange={async (e) => {
                                const stage = e.target.value, lossReason = stage === 'lost' ? window.prompt('Why was this enquiry lost?') : undefined;
                                if (stage === 'lost' && !lossReason)
                                    return;
                                await act('stage', { id: r.id, stage, version: r.version, lossReason });
                            }}>{STAGES.filter(s => s !== 'won').map(s => <option key={s} value={s}>{label(s)}</option>)}</select> : <Link href={'/admin/bookings?reference=' + r.booking_reference}>View booking</Link>}</td></> :
                        view === 'tasks' ? <><td className="p-4">{fmt(r.title)}{r.reminded_at && <p className="text-xs text-orange-600">Reminder due</p>}</td><td className="p-4"><button onClick={() => void openProfile(r.contact_id)}>{fmt(r.name)}</button></td><td className="p-4">{time(r.due_at)}</td><td className="p-4">{label(fmt(r.status))}<br />{fmt(r.owner_name)}</td><td className="p-4"><button className={secondary} disabled={busy} onClick={() => void act('task_status', { id: r.id, status: r.status === 'open' ? 'completed' : 'open' })}>{r.status === 'open' ? 'Complete' : 'Reopen'}</button><button className={secondary + ' ml-2'} onClick={() => setDialog({ kind: 'task', row: r })}>Reschedule</button></td></> :
                            view === 'quotes' ? <><td className="p-4">{fmt(r.title)}<p>Revision {fmt(r.version)}</p></td><td className="p-4"><button onClick={() => void openProfile(r.contact_id)}>{fmt(r.name)}</button></td><td className="p-4">{label(fmt(r.status))}</td><td className="p-4">{money(r.amount_minor)}</td><td className="p-4"><div className="flex flex-wrap gap-2">{['draft', 'sent'].includes(fmt(r.status)) && <><button className={secondary} onClick={() => setDialog({ kind: 'quote', row: r })}>Revise</button><button disabled={busy} className={secondary} onClick={() => void act('quote_share', { id: r.id })}>Share link</button></>}{['sent', 'accepted'].includes(fmt(r.status)) && <button className={secondary} onClick={() => setDialog({ kind: 'convert', row: r })}>Link booking</button>}{r.form_token && <Link className={secondary} href={'/f/' + r.form_token}>Booking form</Link>}</div></td></> :
                                view === 'partners' ? <><td className="p-4">{fmt(r.agency_name)}</td><td className="p-4">{fmt(r.email)}<br />{fmt(r.phone)}</td><td className="p-4">{label(fmt(r.status))}</td><td className="p-4">{fmt(r.staff_count)}</td><td className="p-4">{r.status === 'approved' && <button className={secondary} onClick={async () => {
                                            setDialog({ kind: 'partner', row: r });
                                            const response = await fetch('/api/admin/crm?view=partner_detail&agencyId=' + encodeURIComponent(fmt(r.id)));
                                            if (response.ok)
                                                setPartner(await response.json());
                                        }}>Manage account</button>}</td></> :
                                    view === 'emails' ? <><td className="p-4">{fmt(r.email)}</td><td className="p-4">{fmt(r.attempts)}</td><td className="p-4">{time(r.attempted_at)}</td><td className="p-4">{label(fmt(r.status))}</td><td className="p-4">{me.role === 'owner' && ['pending', 'failed', 'needs_review'].includes(fmt(r.status)) && <button className={secondary} onClick={() => setDialog({ kind: 'email_review', row: r })}>Review delivery</button>}</td></> : <><td className="p-4">{fmt(r.title)}</td><td className="p-4">{label(fmt(r.kind))}</td><td className="p-4">{fmt(r.days)} days</td><td className="p-4">{fmt(r.channel)} · {r.enabled ? 'Enabled' : 'Disabled'}</td><td className="p-4">{me.role === 'owner' && <button className={secondary} onClick={() => setDialog({ kind: 'retention', row: r })}>Edit</button>}</td></>}
 </tr>)}</tbody></table>{!loading && !data.items?.length && <p className="p-8 text-slate-500">No records in this view.</p>}</div><div className="flex justify-between"><p>{fmt(data.total ?? 0)} records · Page {page}</p><div className="flex gap-3"><button className={secondary} disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</button><button className={secondary} disabled={page * 25 >= Number(data.total ?? 0) || loading} onClick={() => setPage(p => p + 1)}>Next</button></div></div></>}
 {c && <section className="rounded-2xl border bg-white p-5 space-y-5"><div className="flex justify-between"><div><h2 className="text-xl font-semibold">{fmt(c.name)}</h2><p>{fmt(c.email)} · {fmt(c.phone)}</p><p className="text-xs text-slate-500">Offers: {c.marketing_opt_in ? 'Accepted' : 'Not accepted'}</p></div><button className={secondary} onClick={() => setProfile(null)}>Close profile</button></div><div className="flex flex-wrap gap-2">{['contact', 'lead', 'task', 'quote', ...(c.member_id ? [] : ['consent'])].map(k => <button key={k} className={secondary} onClick={() => setDialog({ kind: k, row: k === 'contact' || k === 'consent' ? c : undefined })}>{k === 'contact' ? 'Edit profile' : k === 'consent' ? 'Record consent' : 'Create ' + k}</button>)}</div><p className="whitespace-pre-wrap text-sm">{fmt(c.notes)}</p>
 <div className="grid lg:grid-cols-2 gap-5"><section><h3 className="font-semibold mb-2">Bookings & payment status</h3>{profile?.bookings?.map(b => <p className="border-t py-2" key={fmt(b.reference)}><Link className="text-orange-600" href={'/admin/bookings?reference=' + b.reference}>{fmt(b.reference)}</Link> · {fmt(b.pickup_date)} · {fmt(b.status)} · {fmt(b.payment_status)}{b.refund_status ? ' · Refund: ' + fmt(b.refund_status) : ''} · THB {fmt(b.total)}<br />{fmt(b.pickup)} → {fmt(b.dropoff)}</p>)}</section><section><h3 className="font-semibold mb-2">Conversations</h3>{profile?.chats?.map(b => <p className="border-t py-2" key={fmt(b.id)}><Link className="text-orange-600" href={'/admin/chat?id=' + b.id}>{fmt(b.public_id)}</Link> · {fmt(b.channel)} · {fmt(b.status)}</p>)}</section><section><h3 className="font-semibold mb-2">Follow-up history</h3>{profile?.tasks?.map(t => <p className="border-t py-2" key={fmt(t.id)}>{fmt(t.title)} · {time(t.due_at)} · {fmt(t.status)}</p>)}</section><section><h3 className="font-semibold mb-2">Activity timeline</h3>{profile?.events?.map(t => <p className="border-t py-2" key={fmt(t.id)}>{fmt(t.body)}<br /><span className="text-xs text-slate-500">{time(t.created_at)} · {fmt(t.staff_name)}</span></p>)}</section><section><h3 className="font-semibold mb-2">Enquiries and quotes</h3>{profile?.leads?.map(t => <p key={fmt(t.id)}>{fmt(t.title)} · {fmt(t.stage)} </p>)}{profile?.quotes?.map(t => <p key={fmt(t.id)}>{fmt(t.title)} · {fmt(t.status)} · {money(t.amount_minor)}</p>)}</section><section><h3 className="font-semibold mb-2">Possible matching records</h3><p className="text-xs text-slate-500 mb-2">Review identity before merging. This does not combine sign-ins or grant booking access.</p>{profile?.matches?.map(m => <div key={fmt(m.id)} className="border-t py-2 flex justify-between"><p>{fmt(m.name)}<br />{fmt(m.email)} · {fmt(m.phone)}</p>{me.role === 'owner' && <button disabled={busy} className={secondary} onClick={() => {
                        if (confirm(`Merge ${m.name} into ${c.name}? CRM records move; booking access remains unchanged.`))
                            void act('merge', { id: m.id, targetId: c.id });
                    }}>Merge here</button>}</div>)}</section></div></section>}
 {dialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={label(dialog.kind)}><form onSubmit={submit} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 space-y-4"><div className="flex justify-between"><h2 className="text-xl font-semibold">{label(dialog.kind)}</h2><button type="button" onClick={() => { setDialog(null); setPartner(null); }} className={secondary}>Close</button></div>
 {dialog.kind === 'contact' && <>{input('name', 'Name', 'text', true, dialog.row?.name)}{input('email', 'Email', 'email', false, dialog.row?.email)}{input('phone', 'Phone', 'tel', false, dialog.row?.phone)}{owner(dialog.row?.owner_id)}{input('language', 'Preferred language', 'text', false, dialog.row?.language ?? 'en')}<label className="block text-sm">Internal notes<textarea name="notes" className={field} maxLength={4000} defaultValue={fmt(dialog.row?.notes ?? '')}/></label></>}
 {dialog.kind === 'lead' && <>{customer()}{input('title', 'Enquiry title')}{input('amount', 'Estimated value (THB)', 'number', true, 0)}{owner()}</>}
 {dialog.kind === 'task' && <>{customer(dialog.row?.contact_id)}{leadPicker()}{input('title', 'Task title', 'text', true, dialog.row?.title)}{input('dueAt', 'Due date & time (Thailand)', 'datetime-local', true, dialog.row?.due_at ? new Date(Date.parse(String(dialog.row.due_at)) + 7 * 3600000).toISOString().slice(0, 16) : undefined)}{owner(dialog.row?.owner_id)}</>}
 {dialog.kind === 'quote' && <>{customer(dialog.row?.contact_id)}{leadPicker()}{input('title', 'Quote title', 'text', true, dialog.row?.title)}{input('pickup', 'Pickup', 'text', true, dialog.row?.pickup)}{input('dropoff', 'Destination', 'text', true, dialog.row?.dropoff)}<div className="grid grid-cols-2 gap-3">{input('tripDate', 'Trip date', 'date', true, dialog.row?.trip_date)}{input('tripTime', 'Pickup time', 'time', true, dialog.row?.trip_time)}</div><label className="block text-sm">Vehicle<select name="vehicle" className={field} defaultValue={fmt(dialog.row?.vehicle ?? Object.keys(VEHICLES)[0])}>{Object.entries(VEHICLES).map(([id, v]) => <option key={id} value={id}>{v.name}</option>)}</select></label>{input('amount', 'Total THB (whole baht)', 'number', true, dialog.row ? Number(dialog.row.amount_minor) / 100 : '')}{input('expiresAt', 'Expiry (Thailand)', 'datetime-local')}<p className="text-xs text-slate-500">Sharing a revised quote replaces its previous link.</p></>}
 {dialog.kind === 'convert' && <>{input('reference', 'Confirmed booking reference')}<p className="text-xs">This connects CRM history only. Customer booking permissions remain unchanged.</p></>}
 {dialog.kind === 'email_review' && <><label className="block text-sm">Resolution<select className={field} name="resolution"><option value="cancel">Cancel this email</option><option value="verified_sent">I verified delivery with the email provider</option></select></label>{input('reason', 'Review evidence / reason')}<p className="text-xs">Review does not send another email. Confirm provider delivery before marking it sent.</p></>}
 {dialog.kind === 'consent' && <><label><input type="checkbox" name="optIn" defaultChecked={!!dialog.row?.marketing_opt_in}/> Customer explicitly agreed to marketing emails</label>{input('source', 'Evidence / source of consent')}<p className="text-xs">Record the customer’s choice; do not infer it from an enquiry.</p></>}
 {dialog.kind === 'partner' && <><input type="hidden" name="agencyId" value={fmt(dialog.row?.id)}/>{owner(dialog.row?.owner_id)}<label className="block text-sm">Agreed rates and account notes<textarea name="rateNotes" className={field} defaultValue={fmt(dialog.row?.rate_notes ?? '')}/></label>{input('email', 'Portal staff email (optional)', 'email', false)}<label className="block text-sm">Portal role<select className={field} name="memberRole"><option value="booker">Booker</option><option value="manager">Manager</option></select></label><label><input name="active" type="checkbox" defaultChecked/> Enable access for this email</label><p className="text-xs">Staff must verify this email through customer sign-in. Rates here are notes; fare pricing remains in Fare management.</p>{partner?.members?.map(m => <p key={fmt(m.email)}>{fmt(m.email)} · {fmt(m.role)} · {m.active ? 'Active' : 'Disabled'}</p>)}<p>Confirmed bookings: {fmt(partner?.stats?.bookings ?? 0)} · Revenue: THB {fmt(partner?.stats?.revenue ?? 0)}</p></>}
 {dialog.kind === 'retention' && <>{input('title', 'Rule name', 'text', true, dialog.row?.title)}<label className="block text-sm">Trigger<select className={field} name="kind" defaultValue={fmt(dialog.row?.kind ?? 'inactive')}><option value="inactive">No repeat booking after completed trip</option><option value="return_transfer">Upcoming transfer without a return</option></select></label>{input('days', 'Days after trip / before upcoming trip', 'number', true, dialog.row?.days ?? 30)}{owner(dialog.row?.owner_id)}<label className="block text-sm">Action<select className={field} name="channel" defaultValue={fmt(dialog.row?.channel ?? 'task')}><option value="task">Create staff follow-up task</option><option value="email">Send opt-in email</option></select></label><label className="block text-sm">Email message (supports {'{name}'})<textarea name="message" className={field} maxLength={1000} defaultValue={fmt(dialog.row?.message ?? '')}/></label><label><input name="enabled" type="checkbox" defaultChecked={!!dialog.row?.enabled}/> Enable rule</label><p className="text-xs">Disabled by default. Emails require current consent and stop after a newer booking.</p></>}
 {error && <p role="alert" className="text-red-600">{error}</p>}<button disabled={busy || (['task','quote'].includes(dialog.kind) && (leadsLoading || !!leadsError))} className={btn + ' w-full'}>{busy ? 'Saving…' : 'Save'}</button></form></div>}
 </div>;
}
