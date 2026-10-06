"use client";

import { CheckCircle2, CircleAlert, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Member = { id: string; telegram_user_id: string; telegram_username: string | null; display_name: string; enabled: number; staff_name: string | null };
type Data = { canEdit: boolean; secrets: Record<string, boolean>; webhook: { url: string; pending: number; lastError: string | null } | null; team: Member[] };

// Approved Telegram admins (only these can reply, assign or close) and the bot connection.
export function TelegramTeam() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ telegramUserId: "", displayName: "", username: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; displayName: string; username: string } | null>(null);
  const load = useCallback(() => fetch("/api/admin/chat/telegram", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => setMsg({ ok: false, text: "Couldn't load the Telegram settings." })), []);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/chat/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "That didn't work.");
      setMsg({ ok: true, text: done }); await load(); return true;
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't work." }); return false; }
    finally { setBusy(false); }
  }
  async function add(e: FormEvent) { e.preventDefault(); if (await post({ action: "add", ...form }, "Added to the Telegram team.")) setForm({ telegramUserId: "", displayName: "", username: "" }); }

  if (!data) return <p className="text-slate-500">Loading…</p>;
  const ready = Object.values(data.secrets).every(Boolean);
  const connected = Boolean(data.webhook?.url?.endsWith("/api/integrations/telegram/webhook"));
  return <section className="grid max-w-3xl gap-4">
    {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl p-3 text-[14px] ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[16px] font-bold">Connection</h2>
      <ul className="mt-3 grid gap-1.5 text-[14px]">{Object.entries(data.secrets).map(([k, v]) => <li key={k} className="flex items-center gap-2">{v ? <CheckCircle2 size={16} className="text-emerald-600" /> : <CircleAlert size={16} className="text-amber-600" />}<code>{k}</code><span className="text-slate-500">{v ? "set" : "missing in Cloudflare"}</span></li>)}
        <li className="flex items-center gap-2">{connected ? <CheckCircle2 size={16} className="text-emerald-600" /> : <CircleAlert size={16} className="text-amber-600" />}Webhook<span className="text-slate-500">{connected ? `connected${data.webhook?.pending ? ` · ${data.webhook.pending} waiting` : ""}` : "not connected"}</span></li>
        {data.webhook?.lastError && <li className="text-[13px] text-red-600">Last Telegram error: {data.webhook.lastError}</li>}
      </ul>
      {data.canEdit && <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !(data.secrets.TELEGRAM_BOT_TOKEN && data.secrets.TELEGRAM_WEBHOOK_SECRET)} onClick={() => void post({ action: "connect" }, "Webhook connected. Telegram will now send replies here.")} className="h-10 rounded-full bg-[#FE8B05] px-4 text-[14px] font-semibold text-white disabled:opacity-50">{connected ? "Reconnect webhook" : "Connect webhook"}</button>
        <button type="button" disabled={busy || !ready} onClick={() => void post({ action: "test" }, "Test message sent to the Telegram group.")} className="h-10 rounded-full border border-slate-200 px-4 text-[14px] font-semibold disabled:opacity-50">Send test message</button>
      </div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[16px] font-bold">Telegram team</h2>
      <p className="mt-1 text-[13.5px] text-slate-600">Only these people can answer customers, assign or close chats from Telegram. Customers see the name you set here, never the Telegram account. Anyone can send <code>/id</code> in the group to see their Telegram ID.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {!data.team.length && <li className="py-4 text-[14px] text-slate-500">Nobody yet.</li>}
        {data.team.map((m) => <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
          <span className="min-w-0 flex-1"><span className="font-semibold">{m.display_name}</span><span className="block text-[12.5px] text-slate-500">ID {m.telegram_user_id}{m.telegram_username ? ` · @${m.telegram_username}` : ""}{m.staff_name ? ` · admin login: ${m.staff_name}` : ""}</span></span>
          {data.canEdit ? <>
            <button type="button" role="switch" aria-checked={Boolean(m.enabled)} aria-label={`${m.display_name}: ${m.enabled ? "active" : "disabled"}`} disabled={busy} onClick={() => void post({ action: "toggle", id: m.id }, m.enabled ? "Disabled." : "Active again.")}
              className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
              <span className={`relative h-6 w-11 rounded-full transition ${m.enabled ? "bg-[#06C755]" : "bg-slate-300"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${m.enabled ? "left-[22px]" : "left-0.5"}`} /></span>
              {m.enabled ? "Active" : "Disabled"}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing({ id: m.id, displayName: m.display_name, username: m.telegram_username ?? "" })} className="text-[13px] font-semibold text-[#C96100]">Edit</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.display_name} from the Telegram team?`)) void post({ action: "remove", id: m.id }, "Removed."); }} aria-label={`Remove ${m.display_name}`} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
          </> : <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${m.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{m.enabled ? "Active" : "Disabled"}</span>}
        </li>)}
      </ul>
      {editing && <div role="dialog" aria-modal="true" aria-label="Edit team member" className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
        <form onSubmit={(e) => { e.preventDefault(); void post({ action: "edit", ...editing }, "Saved.").then((ok) => { if (ok) setEditing(null); }); }} className="grid w-full max-w-sm gap-3 rounded-2xl bg-white p-5 text-[14px] shadow-xl">
          <h3 className="text-[17px] font-bold">Edit team member</h3>
          <label className="grid gap-1 font-semibold">Name customers see<input required autoFocus maxLength={60} value={editing.displayName} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-[#FE8B05]" /></label>
          <label className="grid gap-1 font-semibold">Telegram username<input maxLength={61} value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} placeholder="@username (optional)" className="h-10 rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-[#FE8B05]" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="h-10 rounded-full border border-slate-200 px-4 font-semibold">Cancel</button><button disabled={busy} className="h-10 rounded-full bg-[#FE8B05] px-5 font-bold text-white">Save</button></div>
        </form>
      </div>}
      {data.canEdit && <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input required inputMode="numeric" placeholder="Telegram ID" aria-label="Telegram ID" value={form.telegramUserId} onChange={(e) => setForm({ ...form, telegramUserId: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#FE8B05]" />
        <input required placeholder="Name customers see" aria-label="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#FE8B05]" />
        <input placeholder="@username (optional)" aria-label="Telegram username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#FE8B05]" />
        <button disabled={busy} className="h-10 rounded-full bg-[#15161C] px-4 text-[14px] font-semibold text-white">Add</button>
      </form>}
    </section>
  </section>;
}
