"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BOX_TIERS, prizeOdds, type Prize, type PrizeKind } from "@/lib/reward-rules";

type Ticket = { id: string; member: string; tier: string; prizeName: string | null; openedAt: string | null; voucherCode: string | null; fulfilment: string | null; expiresAt: string | null };

const KINDS: [PrizeKind, string][] = [["coupon", "THB off coupon"], ["child_seat", "Free child seat"], ["exchange_stop", "Free exchange stop"], ["airport_transfer", "Free airport transfer"], ["partner_ticket", "Partner ticket (cruise, buffet…)"]];
const TIER_LABEL = { gold: "Gold", diamond: "Diamond", platinum: "Platinum" } as const;
const input = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#FF8A05]";
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
const blank: Prize = { id: "", name: "", description: "", emoji: "🎁", kind: "coupon", value: 200, weights: {}, stock: null, issued: 0, active: true, validDays: 90, terms: "" };

async function post(body: unknown) {
  const res = await fetch("/api/admin/rewards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; added?: number };
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function PrizeForm({ prize, isNew, onDone }: { prize: Prize; isNew: boolean; onDone: () => void }) {
  const [p, setP] = useState(prize);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Prize>(k: K, v: Prize[K]) => setP((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true); setError("");
    try { await post({ action: "savePrize", prize: { id: p.id, name: p.name, description: p.description, emoji: p.emoji, kind: p.kind, value: p.value, weights: p.weights, stock: p.stock, active: p.active, validDays: p.validDays, terms: p.terms } }); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-3 rounded-2xl border border-orange-200 bg-orange-50/40 p-4 sm:grid-cols-2">
    <label className="text-xs font-semibold">ID (permanent)<input className={input} value={p.id} disabled={!isNew} onChange={(e) => set("id", e.target.value)} placeholder="dinner-cruise" /></label>
    <label className="text-xs font-semibold">Name<input className={input} value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="Dinner cruise for 2" /></label>
    <label className="text-xs font-semibold">Type<select className={input} value={p.kind} onChange={(e) => set("kind", e.target.value as PrizeKind)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    {p.kind === "coupon" ? <label className="text-xs font-semibold">THB off<input type="number" className={input} value={p.value} onChange={(e) => set("value", Number(e.target.value))} /></label> : <label className="text-xs font-semibold">Emoji<input className={input} value={p.emoji} onChange={(e) => set("emoji", e.target.value)} /></label>}
    <label className="text-xs font-semibold sm:col-span-2">Description (shown to the member)<input className={input} value={p.description} onChange={(e) => set("description", e.target.value)} /></label>
    <div className="sm:col-span-2"><p className="text-xs font-semibold">Weight in each badge&apos;s box (0 = not in that box)</p><div className="mt-1 grid grid-cols-3 gap-2">
      {BOX_TIERS.map((t) => <label key={t} className="text-xs">{TIER_LABEL[t]}<input type="number" min={0} className={input} value={p.weights[t] ?? 0} onChange={(e) => set("weights", { ...p.weights, [t]: Number(e.target.value) })} /></label>)}
    </div></div>
    <label className="text-xs font-semibold">Stock (empty = unlimited)<input type="number" min={0} className={input} value={p.stock ?? ""} onChange={(e) => set("stock", e.target.value === "" ? null : Number(e.target.value))} /></label>
    <label className="text-xs font-semibold">Valid for (days)<input type="number" min={1} className={input} value={p.validDays} onChange={(e) => set("validDays", Number(e.target.value))} /></label>
    <label className="text-xs font-semibold sm:col-span-2">Terms<input className={input} value={p.terms} onChange={(e) => set("terms", e.target.value)} placeholder="Subject to availability. Book 3 days ahead." /></label>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={p.active} onChange={(e) => set("active", e.target.checked)} />Active</label>
    <div className="flex items-center justify-end gap-2">{error && <span className="text-xs font-semibold text-red-600">{error}</span>}<button type="button" onClick={onDone} className="rounded-full px-3 py-1.5 text-sm font-bold text-slate-600">Cancel</button><button type="button" disabled={busy} onClick={save} className="rounded-full bg-[#FF8A05] px-4 py-1.5 text-sm font-bold text-white">{busy ? "Saving…" : "Save prize"}</button></div>
  </div>;
}

export function RewardsAdmin({ prizes, codeCounts, tickets }: { prizes: Prize[]; codeCounts: Record<string, { total: number; left: number }>; tickets: Ticket[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [codesFor, setCodesFor] = useState<string | null>(null);
  const [codes, setCodes] = useState("");
  const [message, setMessage] = useState("");
  const odds = Object.fromEntries(BOX_TIERS.map((t) => [t, prizeOdds(prizes, t)]));
  const done = (text = "") => { setEditing(null); setCodesFor(null); setCodes(""); setMessage(text); router.refresh(); };
  const run = async (body: unknown, text: string) => { try { const r = await post(body); done(text.replace("{n}", String(r.added ?? ""))); } catch (e) { setMessage(e instanceof Error ? e.message : "Something went wrong."); } };

  return <div className="grid gap-8">
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black">Mystery box prizes</h2><p className="text-sm text-slate-600">Each badge&apos;s box draws one prize using these weights. Sold-out prizes drop out automatically.</p></div>
        <div className="flex gap-2">
          {prizes.length === 0 && <button type="button" onClick={() => run({ action: "loadDefaults" }, "Added {n} suggested prizes.")} className="rounded-full border border-[#FF8A05] px-4 py-2 text-sm font-bold text-[#C96100]">Load suggested prizes</button>}
          <button type="button" onClick={() => setEditing("new")} className="rounded-full bg-[#FF8A05] px-4 py-2 text-sm font-bold text-white">+ Add prize</button>
        </div>
      </div>
      {message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
      {prizes.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No prizes yet. Until you add some, every box gives a THB 200 off coupon.</p>}
      {editing === "new" && <div className="mt-4"><PrizeForm prize={blank} isNew onDone={() => done()} /></div>}
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm"><table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Prize</th>{BOX_TIERS.map((t) => <th key={t} className="p-3">{TIER_LABEL[t]} odds</th>)}<th className="p-3">Given / stock</th><th className="p-3" /></tr></thead>
        <tbody>{prizes.map((p) => <tr key={p.id} className={`border-b align-top last:border-0 ${p.active ? "" : "opacity-50"}`}>
          {editing === p.id ? <td colSpan={6} className="p-3"><PrizeForm prize={p} isNew={false} onDone={() => done()} /></td> : <>
            <td className="p-3"><p className="font-semibold">{p.emoji} {p.name}{!p.active && " (off)"}</p><p className="text-xs text-slate-500">{KINDS.find(([k]) => k === p.kind)?.[1]}{p.kind === "partner_ticket" && ` · codes left: ${codeCounts[p.id]?.left ?? 0}`}</p></td>
            {BOX_TIERS.map((t) => <td key={t} className="p-3">{odds[t].get(p.id) ? `${odds[t].get(p.id)}%` : "—"}</td>)}
            <td className="p-3">{p.issued} / {p.stock ?? "∞"}</td>
            <td className="p-3 text-right"><button type="button" onClick={() => setEditing(p.id)} className="font-bold text-[#C96100]">Edit</button>{p.kind === "partner_ticket" && <button type="button" onClick={() => setCodesFor(p.id)} className="ml-3 font-bold text-[#C96100]">Add codes</button>}</td>
          </>}
        </tr>)}</tbody>
      </table></div>
      {codesFor && <div className="mt-4 rounded-2xl border border-orange-200 bg-white p-4">
        <p className="text-sm font-bold">Voucher codes for {prizes.find((p) => p.id === codesFor)?.name}</p>
        <p className="text-xs text-slate-500">One per line, from the partner. Each winner gets the next unused code; without codes, the ticket shows as &quot;To arrange&quot; below.</p>
        <textarea rows={5} className={`${input} mt-2 font-mono`} value={codes} onChange={(e) => setCodes(e.target.value)} />
        <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setCodesFor(null)} className="rounded-full px-3 py-1.5 text-sm font-bold text-slate-600">Cancel</button><button type="button" onClick={() => run({ action: "addCodes", prizeId: codesFor, codes: codes.split(/\n+/).map((c) => c.trim()).filter(Boolean) }, "Added {n} codes.")} className="rounded-full bg-[#FF8A05] px-4 py-1.5 text-sm font-bold text-white">Add codes</button></div>
      </div>}
    </section>

    <section>
      <h2 className="text-lg font-black">Partner tickets</h2>
      <p className="text-sm text-slate-600">Dinner cruises, buffets and other partner prizes won in boxes. Contact members marked &quot;To arrange&quot; to book their date.</p>
      {tickets.length === 0 ? <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-slate-500">No partner tickets won yet.</p> : <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-sm"><table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Member</th><th className="p-3">Prize</th><th className="p-3">Won</th><th className="p-3">Use by</th><th className="p-3">Code</th><th className="p-3">Status</th></tr></thead>
        <tbody>{tickets.map((t) => <tr key={t.id} className="border-b last:border-0">
          <td className="p-3">{t.member}</td><td className="p-3 font-semibold">{t.prizeName}</td><td className="p-3">{date(t.openedAt)}</td><td className="p-3">{date(t.expiresAt)}</td>
          <td className="p-3 font-mono">{t.voucherCode ?? "—"}</td>
          <td className="p-3"><select className={input} value={t.fulfilment ?? "to_arrange"} onChange={(e) => { const code = e.target.value === "sent" && !t.voucherCode ? window.prompt("Voucher code or booking note to show the member (optional)") ?? undefined : undefined; void run({ action: "ticket", boxId: t.id, fulfilment: e.target.value, voucherCode: code || undefined }, "Ticket updated."); }}>
            <option value="to_arrange">To arrange</option><option value="sent">Sent to member</option><option value="used">Used</option>
          </select></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
