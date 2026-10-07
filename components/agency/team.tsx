"use client";
import { useEffect, useState } from 'react';
export function AgencyTeam() {
    const [data, setData] = useState<{
        members: {
            email: string;
            role: string;
            active: number;
        }[];
        primaryEmail: string;
    } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [version, setVersion] = useState(0);
    useEffect(() => {
        const ac = new AbortController();
        void fetch('/api/agency/team', { signal: ac.signal }).then(async (r) => {
            if (r.ok)
                setData(await r.json());
        }).catch(() => undefined);
        return () => ac.abort();
    }, [version]);
    if (!data)
        return null;
    return <section className="rounded-3xl bg-white p-5"><h2 className="text-xl font-semibold">Agency team</h2><p className="text-sm text-slate-500 mt-2">Primary manager: {data.primaryEmail}. Each colleague signs in with their verified email.</p><div className="my-4 space-y-2">{data.members.map(m => <p key={m.email}>{m.email} · {m.role} · {m.active ? 'Active' : 'Disabled'}</p>)}</div><form className="flex flex-wrap gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget, values = new FormData(form);
            setBusy(true);
            setError('');
            try {
                const r = await fetch('/api/agency/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: values.get('email'), role: values.get('role'), active: values.get('active') === 'on' }) }), d = await r.json();
                if (!r.ok)
                    throw new Error(d.error);
                setVersion(v => v + 1);
                form.reset();
            }
            catch (e) {
                setError(e instanceof Error ? e.message : 'Could not save.');
            }
            finally {
                setBusy(false);
            }
        }}><input className="rounded-xl border p-3" aria-label="Colleague email" name="email" type="email" required placeholder="Colleague email"/><select className="rounded-xl border p-3" name="role" aria-label="Agency role"><option value="booker">Booker</option><option value="manager">Manager</option></select><label className="flex items-center gap-2"><input name="active" type="checkbox" defaultChecked/>Active</label><button className="rounded-xl bg-brand text-white p-3 font-semibold" disabled={busy}>Save access</button></form>{error && <p role="alert" className="mt-3 text-red-600">{error}</p>}</section>;
}
