"use client";

import { Check, CheckCircle2, ChevronDown, CircleAlert, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { maskAccount, parseBankDetails, type BankField } from "@/lib/driver-bank-rules";
import { driverHeaders } from "@/lib/driver-token";
import { THAI_BANKS, thaiBank } from "@/lib/thai-banks";

// "กรอกข้อมูลบัญชี": the page the driver link goes to after the Drop. The driver chooses their bank (a
// bottom sheet, like the date and time picker), gives the account number and the account name (which must
// be their own name), taps "ส่งข้อมูล" and sees the same tick as a finished booking on the website.

export type SavedPayout = { bankCode: string; accountNumber: string; accountName: string };

const field = "mt-2 flex h-14 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left text-[17px] font-semibold text-plum outline-none focus:border-brand";

export function PayoutPage({ driverName, reference, mode, saved, onSubmitted, onEdit, onFinish }: {
  driverName: string;
  reference: string;
  mode: "form" | "done";
  /** What was just sent (kept in memory only): shown on the confirmation and reused if the driver edits. */
  saved: SavedPayout | null;
  onSubmitted: (saved: SavedPayout) => void;
  onEdit: () => void;
  onFinish: () => void;
}) {
  const [bankCode, setBankCode] = useState(saved?.bankCode ?? "");
  const [accountNumber, setAccountNumber] = useState(saved?.accountNumber ?? "");
  const [accountName, setAccountName] = useState(saved?.accountName ?? driverName);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: BankField; text: string } | null>(null);
  const bank = thaiBank(bankCode);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    // The same checks as the server, so most mistakes are caught without a round trip.
    const checked = parseBankDetails({ bankCode, accountNumber, accountName }, driverName);
    if (!checked.ok) { setError({ field: checked.field, text: checked.error }); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/driver/bank", { method: "POST", headers: driverHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ token: "session", ...checked.value }) });
      const result = await response.json().catch(() => ({})) as { error?: string; field?: BankField };
      if (!response.ok) { setError({ field: result.field, text: result.error ?? "ส่งข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง" }); return; }
      onSubmitted(checked.value);
    } catch {
      setError({ text: "ส่งข้อมูลไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }

  if (mode === "done" && saved) {
    const savedBank = thaiBank(saved.bankCode);
    return <main className="min-h-screen bg-[#f3f5f8] pb-32 text-plum">
      <header className="bg-brand px-5 pb-10 pt-12 text-white">
        <div className="mx-auto max-w-xl">
          <span className="grid size-14 place-items-center rounded-full bg-white/20 text-white"><Check size={30} strokeWidth={3} aria-hidden="true" /></span>
          <h1 className="mt-6 text-3xl font-black tracking-[-.03em]">ส่งข้อมูลเรียบร้อย</h1>
          <p className="mt-3 text-white/80">Waydidi ได้รับข้อมูลบัญชีของคุณแล้ว · งาน <strong className="text-white">{reference}</strong></p>
        </div>
      </header>
      <div className="mx-auto max-w-xl px-4 py-5">
        <dl className="grid gap-3 rounded-[26px] bg-white p-5 text-[15px] shadow-sm">
          {([["ธนาคาร", savedBank?.thai ?? saved.bankCode], ["เลขที่บัญชี", maskAccount(saved.accountNumber)], ["ชื่อบัญชี", saved.accountName]] as const).map(([label, value]) =>
            <div key={label} className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="text-right font-bold">{value}</dd></div>)}
        </dl>
        <button type="button" onClick={onEdit} className="mt-4 w-full text-center text-[15px] font-bold text-brand-text underline">แก้ไขข้อมูลบัญชี</button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
        <button type="button" onClick={onFinish} className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-black text-white shadow-lg shadow-orange-500/20">เสร็จสิ้น</button>
      </div>
    </main>;
  }

  return <main className="min-h-screen bg-[#f3f5f8] pb-32 text-plum">
    <header className="bg-brand px-5 pb-8 pt-10 text-white">
      <div className="mx-auto max-w-xl">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[13px] font-bold"><CheckCircle2 size={16} aria-hidden="true" /> ส่งลูกค้าเรียบร้อย · {reference}</p>
        <h1 className="mt-5 text-3xl font-black tracking-[-.03em]">กรอกข้อมูลบัญชี</h1>
        <p className="mt-2 text-white/80">เพื่อรับค่างานของคุณ กรอกข้อมูลบัญชีธนาคารที่ต้องการให้โอนเงิน</p>
      </div>
    </header>
    <form onSubmit={submit} noValidate className="mx-auto max-w-xl space-y-5 px-4 py-5">
      <section className="space-y-5 rounded-[26px] bg-white p-5 shadow-sm">
        <div>
          <span className="text-[14px] font-bold text-slate-600">ธนาคาร</span>
          <button type="button" aria-label={`ธนาคาร: ${bank?.thai ?? "เลือกธนาคาร"}`} aria-haspopup="dialog" onClick={() => { setSheetOpen(true); setError(null); }} className={`${field} ${error?.field === "bank" ? "border-red-400" : ""}`}>
            <span className={`flex min-w-0 items-center gap-3 ${bank ? "" : "font-normal text-slate-400"}`}>
              {bank && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: bank.color }} aria-hidden="true" />}
              <span className="truncate">{bank?.thai ?? "เลือกธนาคาร"}</span>
            </span>
            <ChevronDown size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
          </button>
          {error?.field === "bank" && <p className="mt-1.5 text-[13px] font-semibold text-red-700">{error.text}</p>}
        </div>
        <label className="block">
          <span className="text-[14px] font-bold text-slate-600">เลขที่บัญชี</span>
          <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/[^0-9]/gu, "").slice(0, 16))} inputMode="numeric" autoComplete="off" placeholder="เฉพาะตัวเลข" aria-invalid={error?.field === "number"}
            className={`${field} ${error?.field === "number" ? "border-red-400" : ""}`} />
          {error?.field === "number" && <p className="mt-1.5 text-[13px] font-semibold text-red-700">{error.text}</p>}
        </label>
        <label className="block">
          <span className="text-[14px] font-bold text-slate-600">ชื่อบัญชี</span>
          <input value={accountName} onChange={(event) => setAccountName(event.target.value)} autoComplete="off" maxLength={120} aria-invalid={error?.field === "name"}
            className={`${field} ${error?.field === "name" ? "border-red-400" : ""}`} />
          <span className="mt-1.5 block text-[13px] text-slate-500">ต้องตรงกับชื่อคนขับ: <strong className="text-slate-700">{driverName}</strong></span>
          {error?.field === "name" && <p className="mt-1.5 text-[13px] font-semibold text-red-700">{error.text}</p>}
        </label>
      </section>
      {error && !error.field && <p role="alert" className="flex gap-2 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"><CircleAlert className="shrink-0" size={19} aria-hidden="true" />{error.text}</p>}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
        <button disabled={busy} className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-black text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-45">
          {busy ? <LoaderCircle className="animate-spin" size={20} aria-hidden="true" /> : <Check size={20} aria-hidden="true" />} {busy ? "กำลังส่ง…" : "ส่งข้อมูล"}
        </button>
      </div>
    </form>
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent side="bottom" showCloseButton={false}
        className="max-h-[88dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-ink data-[state=open]:duration-500 motion-reduce:duration-0">
        {/* Grab handle: a bottom sheet, like the date and time picker. */}
        <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
        <SheetHeader className="flex-row items-center justify-between px-0 pb-3 pt-5 text-left">
          <SheetTitle className="text-[26px] font-semibold tracking-[-.03em]">เลือกธนาคาร</SheetTitle>
          <button type="button" onClick={() => setSheetOpen(false)} aria-label="ปิด" className="grid size-12 place-items-center rounded-full bg-slate-100 text-brand-deep transition hover:bg-orange-50"><X size={25} /></button>
        </SheetHeader>
        <ul className="grid gap-2 pb-2">
          {THAI_BANKS.map((option) => {
            const selected = option.code === bankCode;
            return <li key={option.code}>
              <button type="button" onClick={() => { setBankCode(option.code); setSheetOpen(false); }} aria-pressed={selected}
                className={`flex min-h-16 w-full items-center gap-4 rounded-2xl border px-4 text-left ${selected ? "border-brand bg-orange-50" : "border-slate-200 bg-white active:bg-slate-50"}`}>
                <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: option.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block truncate text-[17px] font-bold">{option.thai}</span><span className="block truncate text-[13px] text-slate-500">{option.name}</span></span>
                {selected && <Check size={22} strokeWidth={3} className="shrink-0 text-brand" aria-hidden="true" />}
              </button>
            </li>;
          })}
        </ul>
      </SheetContent>
    </Sheet>
  </main>;
}
