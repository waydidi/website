"use client";
import { useEffect, useState } from 'react';
export function CustomerPicker({ initialId, initialName, onSelect }: {
    initialId: string;
    initialName: string;
    onSelect: (id: string) => void;
}) {
    const [query, setQuery] = useState(initialName), [id, setId] = useState(initialId), [items, setItems] = useState<{
        id: string;
        name: string;
        email: string | null;
    }[]>([]), [error, setError] = useState('');
    useEffect(() => {
        if (id)
            return;
        const ac = new AbortController(), timer = setTimeout(() => {
            void fetch('/api/admin/crm?view=customers&q=' + encodeURIComponent(query), { signal: ac.signal }).then(async (r) => {
                if (!r.ok)
                    throw new Error('Customer search unavailable.');
                return r.json();
            }).then(d => { setItems(d.items); setError(''); }).catch(e => {
                if (e.name !== 'AbortError')
                    setError(e.message);
            });
        }, 200);
        return () => { clearTimeout(timer); ac.abort(); };
    }, [query, id]);
    useEffect(() => {
        if (initialId)
            onSelect(initialId);
    }, [initialId, onSelect]);
    return <div><label className="block text-sm">Customer<input aria-label="Find customer" value={query} required onChange={e => { setQuery(e.target.value); setId(''); onSelect(''); }} className="w-full rounded-xl border border-slate-300 p-3" placeholder="Search name, email or phone"/></label><input type="hidden" name="contactId" value={id}/>{!id && <div className="max-h-40 overflow-y-auto rounded-xl border">{items.map(c => <button type="button" className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-orange-50" key={c.id} onClick={() => { setId(c.id); setQuery(c.name); onSelect(c.id); }}>{c.name}<span className="block text-xs text-slate-500">{c.email || 'Guest'}</span></button>)}{!items.length && <p className="p-3 text-sm">No matching customers. Create a customer from the Customers tab.</p>}</div>}{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
