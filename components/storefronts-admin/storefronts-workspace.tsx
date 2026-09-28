"use client";

import { PlaceInput } from "@/components/booking-form/place-input";
import { Eye, LoaderCircle, Pencil, Plus, Printer, QrCode, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Booking = { reference: string; customerName: string; pickupDate: string; pickupTime: string; pickup: string; dropoff: string; status: string; total: number; discount: number; commission: number; cashAtStore: boolean; settledAt: string | null; state: "pending" | "earned" | "cancelled" };
type Store = {
  id: string; slug: string; name: string; contactName: string | null; phone: string | null; area: string | null;
  discountPercent: number; commissionPercent: number; active: boolean;
  bookings: Booking[]; revenue: number; stats: { earned: number; pendingCommission: number; cashHeld: number; balance: number };
};

const thb = (n: number) => `THB ${Math.round(n).toLocaleString("en-US")}`;
const field = "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]";
const label = "block text-[13px] font-medium text-slate-600";
const STATE: Record<Booking["state"], [string, string]> = { pending: ["Upcoming", "bg-sky-100 text-sky-800"], earned: ["Earned", "bg-emerald-100 text-emerald-800"], cancelled: ["Cancelled", "bg-slate-200 text-slate-600"] };

function StatCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[14px] text-slate-500">{title}</p><p className="mt-1 text-[26px] font-semibold text-[#15161C]">{value}</p><p className="text-[13px] text-slate-500">{sub}</p></div>;
}

function Balance({ value }: { value: number }) {
  if (!value) return <span className="text-slate-400">Settled</span>;
  return value > 0 ? <span className="font-semibold text-[#B45309]">Store owes {thb(value)}</span> : <span className="font-semibold text-[#15803D]">You owe {thb(-value)}</span>;
}

// Printable A4 poster with the store's QR code.
function printPoster(store: Store, url: string, svg: string) {
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><html><head><title>${esc(store.name)} · Waydidi QR poster</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1F1726}
.p{width:210mm;height:297mm;display:flex;flex-direction:column}.top{background:#FF8A05;color:#fff;padding:18mm 16mm 14mm;text-align:center}
.top img{width:62mm}.top h1{font-size:34pt;margin:10mm 0 3mm;line-height:1.05}.top p{font-size:15pt;margin:0;opacity:.95}
.mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6mm;padding:10mm}
.qr{width:120mm;height:120mm;padding:5mm;border:3px solid #FF8A05;border-radius:10mm}.qr svg{width:100%;height:100%}
.deal{font-size:22pt;font-weight:700;color:#15803D}.store{font-size:14pt;color:#6B6170}.url{font-size:11pt;color:#6B6170}
.bot{background:#FFF0DF;padding:7mm;text-align:center;font-size:13pt}</style></head><body><div class="p">
<div class="top"><img src="${location.origin}/waydidi-logo.png" alt="Waydidi"><h1>Scan to book<br>your private ride</h1><p>Airport transfers · City rides · Day trips</p></div>
<div class="mid"><div class="qr">${svg}</div>${store.discountPercent > 0 ? `<div class="deal">${store.discountPercent}% off special price</div>` : ""}<div class="store">at ${esc(store.name)}</div><div class="url">${esc(url)}</div></div>
<div class="bot">Pay by cash at the counter · Confirmation sent to your WhatsApp and email</div></div>
<script>setTimeout(function(){window.print()},600)</script></body></html>`);
  w.document.close();
}

function QrDialog({ store, onClose }: { store: Store | null; onClose: () => void }) {
  const [svg, setSvg] = useState("");
  const url = store ? `${typeof window === "undefined" ? "" : window.location.origin}/s/${store.slug}` : "";
  useEffect(() => {
    if (!store) return;
    void QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1F1726", light: "#ffffff" } }).then(setSvg);
  }, [store, url]);
  return <Dialog open={Boolean(store)} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent showCloseButton={false} className="rounded-[28px] border-0 bg-white p-6 sm:max-w-md">
      <DialogHeader className="flex-row items-center justify-between text-left"><div><DialogTitle className="text-[22px]">{store?.name} QR code</DialogTitle><DialogDescription>Customers scan this to book with the store&apos;s special price.</DialogDescription></div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-slate-100"><X size={20} /></button></DialogHeader>
      <div className="mx-auto mt-2 w-64 rounded-2xl border-4 border-[#FF8A05] p-3" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-3 break-all text-center font-mono text-[13px] text-slate-600">{url}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" disabled={!svg} onClick={() => store && printPoster(store, url, svg)} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#FF8A05] px-5 font-semibold text-white"><Printer size={17} />Print A4 poster</button>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(url)} className="inline-flex h-11 items-center rounded-full border border-slate-200 px-5 font-medium">Copy link</button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-full border border-slate-200 px-5 font-medium">Open form</a>
      </div>
    </DialogContent>
  </Dialog>;
}

function EditDialog({ store, open, onClose }: { store: Store | null; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", slug: "", contactName: "", phone: "", area: "", discountPercent: "10", commissionPercent: "10", active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the store being edited into the form
    setF(store ? { name: store.name, slug: store.slug, contactName: store.contactName ?? "", phone: store.phone ?? "", area: store.area ?? "", discountPercent: String(store.discountPercent), commissionPercent: String(store.commissionPercent), active: store.active }
      : { name: "", slug: "", contactName: "", phone: "", area: "", discountPercent: "10", commissionPercent: "10", active: true });
    setError("");
  }, [store, open]);
  async function save() {
    setBusy(true); setError("");
    const body = { ...(store ? { id: store.id } : {}), name: f.name, slug: store ? undefined : f.slug.trim() || undefined, contactName: f.contactName, phone: f.phone, area: f.area, discountPercent: Number(f.discountPercent) || 0, commissionPercent: Number(f.commissionPercent) || 0, active: f.active };
    const res = await fetch("/api/admin/storefronts", { method: store ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) { setError(out?.error ?? "Could not save."); return; }
    onClose(); router.refresh();
  }
  return <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto rounded-[28px] border-0 bg-white p-6 sm:max-w-lg">
      <DialogHeader className="flex-row items-center justify-between text-left"><div><DialogTitle className="text-[22px]">{store ? "Edit storefront" : "Add storefront"}</DialogTitle><DialogDescription>Rate changes apply to new bookings only.</DialogDescription></div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-slate-100"><X size={20} /></button></DialogHeader>
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>Store name<input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Siam Hotel front desk" /></label>
        {!store && <label className={`${label} sm:col-span-2`}>Link code (optional)<input className={field} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="siam-hotel" /><span className="mt-1 block text-[12px] text-slate-500">The QR opens /s/{f.slug || "store-name"}. Can&apos;t be changed later.</span></label>}
        <label className={label}>Special price (% off)<input type="number" min={0} max={50} className={field} value={f.discountPercent} onChange={(e) => setF({ ...f, discountPercent: e.target.value })} /></label>
        <label className={label}>Commission (% of fare)<input type="number" min={0} max={50} className={field} value={f.commissionPercent} onChange={(e) => setF({ ...f, commissionPercent: e.target.value })} /></label>
        <label className={label}>Contact name<input className={field} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></label>
        <label className={label}>Phone<input className={field} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className={`${label} sm:col-span-2`}>Area<PlaceInput className={field} value={f.area} onChange={(v) => setF((cur) => ({ ...cur, area: v }))} placeholder="Search Google Maps, e.g. Sukhumvit, Bangkok" /></label>
        <label className="flex items-center gap-2 text-[14px] font-medium sm:col-span-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="size-4 accent-[#FF8A05]" />QR code active (customers can book)</label>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-[14px] text-red-700">{error}</p>}
      <button type="button" onClick={() => void save()} disabled={busy || f.name.trim().length < 2} className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-6 font-semibold text-white disabled:opacity-50">{busy && <LoaderCircle size={16} className="animate-spin" />}{store ? "Save" : "Add storefront"}</button>
    </DialogContent>
  </Dialog>;
}

function DetailDialog({ store, onClose }: { store: Store | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function settle() {
    if (!store || !window.confirm(`Mark ${store.name} as settled? This covers every completed ride not settled yet.`)) return;
    setBusy(true);
    await fetch("/api/admin/storefronts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: store.id, settle: true }) }).catch(() => null);
    setBusy(false); onClose(); router.refresh();
  }
  return <Dialog open={Boolean(store)} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto rounded-[28px] border-0 bg-white p-6 sm:max-w-3xl">
      {store && <>
        <DialogHeader className="flex-row items-center justify-between text-left"><div><DialogTitle className="text-[22px]">{store.name}</DialogTitle><DialogDescription>{store.discountPercent}% special price · {store.commissionPercent}% commission{store.area ? ` · ${store.area}` : ""}</DialogDescription></div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-slate-100"><X size={20} /></button></DialogHeader>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[12px] text-slate-500">Commission earned (not settled)</p><p className="text-[18px] font-semibold">{thb(store.stats.earned)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[12px] text-slate-500">Cash held by store</p><p className="text-[18px] font-semibold">{thb(store.stats.cashHeld)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[12px] text-slate-500">Balance</p><p className="text-[16px]"><Balance value={store.stats.balance} /></p></div>
        </div>
        <p className="mt-2 text-[13px] text-slate-500">Commission is earned when the ride is completed. Cash taken at the counter is due to Waydidi minus the store&apos;s commission.</p>
        {(store.stats.earned > 0 || store.stats.balance !== 0) && <button type="button" onClick={() => void settle()} disabled={busy} className="mt-3 inline-flex h-10 w-fit items-center gap-2 rounded-full bg-[#15803D] px-5 font-semibold text-white disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}Mark settled</button>}
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[14px]">
          <thead className="text-slate-500"><tr>{["Booking", "Pickup", "Paid", "Total", "Commission", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{store.bookings.length === 0 ? <tr><td colSpan={6} className="px-2 py-8 text-center text-slate-500">No bookings yet.</td></tr> : store.bookings.map((b) => <tr key={b.reference} className="border-t border-slate-100">
            <td className="px-2 py-2"><Link href={`/admin/journeys/${b.reference}`} className="font-semibold text-[#C96100] hover:underline">{b.reference}</Link><span className="block text-[12px] text-slate-500">{b.customerName}</span></td>
            <td className="px-2">{b.pickupDate} {b.pickupTime}</td>
            <td className="px-2">{b.cashAtStore ? "Cash at store" : "Card"}</td>
            <td className="px-2">{thb(b.total)}</td>
            <td className="px-2">{thb(b.commission)}</td>
            <td className="px-2"><span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${b.settledAt ? "bg-violet-100 text-violet-800" : STATE[b.state][1]}`}>{b.settledAt ? "Settled" : STATE[b.state][0]}</span></td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </DialogContent>
  </Dialog>;
}

export function StorefrontsWorkspace({ stores }: { stores: Store[] }) {
  const [editing, setEditing] = useState<Store | null>(null);
  const [adding, setAdding] = useState(false);
  const [qr, setQr] = useState<Store | null>(null);
  const [viewing, setViewing] = useState<Store | null>(null);
  const bookings = stores.reduce((n, s) => n + s.bookings.length, 0);
  const earned = stores.reduce((n, s) => n + s.stats.earned, 0);
  const pending = stores.reduce((n, s) => n + s.stats.pendingCommission, 0);
  const owed = stores.reduce((n, s) => n + Math.max(0, s.stats.balance), 0);

  return <div className="grid gap-5 px-4 pb-10 pt-4 sm:px-8">
    <div className="-mt-[52px] -mb-1 flex justify-end">
      <button type="button" onClick={() => setAdding(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 text-[15px] font-semibold text-white hover:bg-[#E67900]"><Plus size={17} strokeWidth={2.5} />Add storefront</button>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard title="Storefronts" value={String(stores.length)} sub={`${stores.filter((s) => s.active).length} active`} />
      <StatCard title="QR bookings" value={String(bookings)} sub="All time" />
      <StatCard title="Commission earned" value={thb(earned)} sub={`${thb(pending)} on upcoming rides`} />
      <StatCard title="Cash to collect" value={thb(owed)} sub="From stores, after commission" />
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-[14px]">
        <thead className="bg-slate-50 text-slate-500"><tr>{["Store", "Special price", "Commission", "Bookings", "Revenue", "Balance", "QR", ""].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {stores.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-slate-500">No storefronts yet. Tap “Add storefront” to create your first QR poster.</td></tr>}
          {stores.map((s) => <tr key={s.id} className="border-t border-slate-100">
            <td className="h-[68px] px-5"><p className="font-medium text-[#15161C]">{s.name}</p><p className="text-[13px] text-slate-500">/s/{s.slug}{s.area ? ` · ${s.area}` : ""}</p></td>
            <td className="px-5">{s.discountPercent}% off</td>
            <td className="px-5">{s.commissionPercent}%</td>
            <td className="px-5">{s.bookings.length}</td>
            <td className="px-5">{thb(s.revenue)}</td>
            <td className="px-5"><Balance value={s.stats.balance} /></td>
            <td className="px-5"><span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${s.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{s.active ? "Active" : "Off"}</span></td>
            <td className="px-5"><span className="flex items-center gap-3 text-slate-500">
              <button type="button" onClick={() => setQr(s)} aria-label={`QR code for ${s.name}`} title="QR poster" className="hover:text-[#C96100]"><QrCode size={19} /></button>
              <button type="button" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`} title="Edit" className="hover:text-[#C96100]"><Pencil size={18} /></button>
              <button type="button" onClick={() => setViewing(s)} aria-label={`Bookings for ${s.name}`} title="Bookings and commission" className="hover:text-[#C96100]"><Eye size={19} /></button>
            </span></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <EditDialog store={editing} open={adding || Boolean(editing)} onClose={() => { setAdding(false); setEditing(null); }} />
    <QrDialog store={qr} onClose={() => setQr(null)} />
    <DetailDialog store={viewing} onClose={() => setViewing(null)} />
  </div>;
}
