"use client";
import { useState } from "react";
export function QuoteAccept({ token, accepted }: {
    token: string;
    accepted: boolean;
}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <><button disabled={busy} onClick={async () => {
            setBusy(true);
            try {
                const r = await fetch('/api/quotes/' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), d = await r.json();
                if (!r.ok)
                    throw new Error(d.error);
                window.location.assign(d.path);
            }
            catch (e) {
                setError(e instanceof Error ? e.message : 'Please try again.');
                setBusy(false);
            }
        }} className="w-full rounded-full bg-[#FE8B05] p-4 font-semibold text-white">{busy ? 'Opening booking…' : accepted ? 'Continue booking' : 'Accept quote & continue'}</button>{error && <p role="alert" className="mt-4 text-red-600">{error}</p>}</>;
}
