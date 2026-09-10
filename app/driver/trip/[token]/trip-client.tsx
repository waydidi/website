"use client";

import { Camera, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, ExternalLink, LoaderCircle, LocateFixed, MapPin, Navigation, Phone, RefreshCw, Route, ShieldCheck, Upload, UsersRound, WifiOff } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";

type DriverStatus = "assigned" | "going_to_standby" | "standby" | "passenger_picked_up" | "completed";
type Trip = {
  assignment: { id: string; currentStatus: DriverStatus; tokenExpiresAt: string };
  driver: { fullName: string; phone: string };
  booking: { reference: string; customerName: string; customerPhone: string; pickup: string; dropoff: string; pickupDate: string; pickupTime: string; passengers: number; luggage: number; vehicle: string; flightNumber: string | null; status: string };
  events: Array<{ id: string; status: DriverStatus; verificationStatus: string; rejectionReason: string | null; expectedDistanceMetres: number | null; createdAt: string; hasEvidence: boolean }>;
};

const steps: Array<{ status: Exclude<DriverStatus, "assigned">; thai: string; english: string; action: string; help: string }> = [
  { status: "going_to_standby", thai: "กำลังไปสแตนบาย", english: "Going to standby", action: "เริ่มเดินทางไปจุดรับ", help: "กดเมื่อคุณเริ่มเดินทางไปยังจุดรับลูกค้า" },
  { status: "standby", thai: "สแตนบาย", english: "Standing by", action: "ยืนยันว่าถึงจุดรับแล้ว", help: "แชร์ตำแหน่งปัจจุบันและถ่ายรูปบริเวณจุดรับ" },
  { status: "passenger_picked_up", thai: "รับลูกค้า", english: "Passenger picked up", action: "ยืนยันว่ารับลูกค้าแล้ว", help: "แชร์ตำแหน่งและแนบรูปหลักฐานโดยไม่ถ่ายใบหน้าลูกค้า" },
  { status: "completed", thai: "ส่งลูกค้าเรียบร้อย", english: "Drop-off completed", action: "ยืนยันว่าส่งลูกค้าแล้ว", help: "แชร์ตำแหน่งปลายทางและแนบรูปก่อนจบงาน" },
];

export default function DriverTripClient({ token }: { token: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [online, setOnline] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/driver/trips/${encodeURIComponent(token)}`, { cache: "no-store" });
      const result = await response.json() as Trip & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Trip unavailable.");
      setTrip(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Trip unavailable."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); const timer = window.setInterval(load, 20_000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const currentIndex = trip ? ["assigned", ...steps.map((step) => step.status)].indexOf(trip.assignment.currentStatus) : 0;
  const next = trip ? steps[currentIndex] : null;
  const needsEvidence = next && next.status !== "going_to_standby";
  const preview = useMemo(() => photo ? URL.createObjectURL(photo) : "", [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function captureLocation() {
    setLocationBusy(true); setError("");
    if (!navigator.geolocation) { setError("อุปกรณ์นี้ไม่รองรับตำแหน่ง GPS"); setLocationBusy(false); return; }
    navigator.geolocation.getCurrentPosition(
      (result) => { setPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy }); setLocationBusy(false); },
      () => { setError("กรุณาอนุญาตให้ Waydidi เข้าถึงตำแหน่ง แล้วลองอีกครั้ง"); setLocationBusy(false); },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trip || !next || busy) return;
    if (needsEvidence && (!position || !photo)) { setError("ต้องแชร์ตำแหน่งและแนบรูปก่อนดำเนินการ"); return; }
    if (!window.confirm(`ยืนยันสถานะ “${next.thai}”?`)) return;
    setBusy(true); setError(""); setMessage("");
    const data = new FormData(); data.set("status", next.status); data.set("note", note);
    if (position) { data.set("latitude", String(position.latitude)); data.set("longitude", String(position.longitude)); data.set("accuracy", String(position.accuracy)); }
    if (photo) data.set("evidence", photo);
    try {
      const response = await fetch(`/api/driver/trips/${encodeURIComponent(token)}`, { method: "POST", body: data });
      const result = await response.json() as { error?: string; expectedDistanceMetres?: number | null };
      if (!response.ok) throw new Error(result.error ?? "บันทึกสถานะไม่สำเร็จ");
      setMessage("Waydidi ได้รับสถานะ ตำแหน่ง และหลักฐานแล้ว"); setNote(""); setPhoto(null); setPosition(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกสถานะไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#FF8A05] text-white"><LoaderCircle className="animate-spin" size={42}/></main>;
  if (!trip) return <main className="grid min-h-screen place-items-center bg-slate-100 p-5 text-[#211726]"><div className="max-w-md rounded-[28px] bg-white p-8 text-center shadow-xl"><CircleAlert className="mx-auto text-[#D96F00]" size={44}/><h1 className="mt-5 text-2xl font-black">Driver link unavailable</h1><p className="mt-3 text-slate-600">{error || "Ask Waydidi operations for a new driver link."}</p><button onClick={load} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#FF8A05] px-6 font-bold text-white"><RefreshCw size={18}/> Try again</button></div></main>;

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trip.assignment.currentStatus === "passenger_picked_up" ? trip.booking.dropoff : trip.booking.pickup)}`;
  return <main className="min-h-screen bg-[#f3f5f8] pb-32 text-[#211726]">
    <header className="bg-[#FF8A05] px-5 pb-8 pt-5 text-white"><div className="mx-auto max-w-xl"><div className="flex items-center justify-between"><a href="/" aria-label="Waydidi home" className="inline-flex text-white"><WaydidiLogo className="h-12 w-auto"/></a><span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${online ? "bg-white/20" : "bg-red-700"}`}>{online ? <ShieldCheck size={15}/> : <WifiOff size={15}/>} {online ? "Connected" : "Offline"}</span></div><p className="mt-8 text-xs font-bold uppercase tracking-[.15em] text-white/75">Driver trip · {trip.booking.reference}</p><h1 className="mt-2 text-3xl font-black">สวัสดี {trip.driver.fullName}</h1><p className="mt-2 text-white/80">ทำตามขั้นตอนด้านล่างและกดยืนยันทุกครั้ง</p></div></header>
    <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
      <section className="rounded-[26px] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-[#D96F00]">{trip.booking.pickupDate} · {trip.booking.pickupTime}</span><h2 className="mt-3 text-xl font-black">{trip.booking.customerName}</h2><p className="mt-1 text-sm text-slate-500">{trip.booking.vehicle} · {trip.booking.passengers} passengers · {trip.booking.luggage} bags</p></div><a href={`tel:${trip.booking.customerPhone}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-[#211726] text-white" aria-label="Call passenger"><Phone size={20}/></a></div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="flex gap-3"><MapPin className="mt-0.5 shrink-0 text-[#FF8A05]" size={19}/><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pickup</p><p className="mt-1 font-bold leading-5">{trip.booking.pickup}</p></div></div><div className="my-3 ml-[9px] h-5 border-l-2 border-dotted border-slate-300"/><div className="flex gap-3"><Route className="mt-0.5 shrink-0 text-[#FF8A05]" size={19}/><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Drop-off</p><p className="mt-1 font-bold leading-5">{trip.booking.dropoff}</p></div></div></div>
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-orange-200 font-bold text-[#D96F00]"><Navigation size={18}/> เปิด Google Maps <ExternalLink size={15}/></a>
      </section>
      <section className="rounded-[26px] bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Trip progress</h2><div className="mt-5 space-y-0">{steps.map((step, index) => { const done = currentIndex > index; const active = currentIndex === index; const event = trip.events.find((item) => item.status === step.status); return <div key={step.status} className="grid grid-cols-[38px_1fr] gap-3"><div className="flex flex-col items-center"><span className={`grid size-9 place-items-center rounded-full border-2 ${done ? "border-[#FF8A05] bg-[#FF8A05] text-white" : active ? "border-[#FF8A05] bg-orange-50 text-[#D96F00]" : "border-slate-200 text-slate-300"}`}>{done ? <Check size={18} strokeWidth={3}/> : index + 1}</span>{index < steps.length - 1 && <span className={`min-h-10 w-0.5 flex-1 ${done ? "bg-[#FF8A05]" : "bg-slate-200"}`}/>}</div><div className="pb-7"><p className={`font-black ${active || done ? "text-[#211726]" : "text-slate-400"}`}>{step.thai}</p><p className="text-sm text-slate-500">{step.english}</p>{event && <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-2.5 py-1">{new Date(event.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</span>{event.verificationStatus === "verified" && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">Admin verified</span>}{event.verificationStatus === "rejected" && <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">Needs review</span>}</div>}</div></div>; })}</div></section>
      {next ? <form onSubmit={submit} className="rounded-[26px] bg-white p-5 shadow-sm"><span className="inline-flex rounded-full bg-[#FFF0DE] px-3 py-1 text-xs font-black text-[#D96F00]">Next step</span><h2 className="mt-3 text-2xl font-black">{next.thai}</h2><p className="mt-2 leading-6 text-slate-600">{next.help}</p>{needsEvidence && <><button type="button" onClick={captureLocation} disabled={locationBusy} className={`mt-5 flex min-h-14 w-full items-center justify-between rounded-2xl border px-4 text-left font-bold ${position ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50"}`}><span className="flex items-center gap-3">{locationBusy ? <LoaderCircle className="animate-spin" size={20}/> : position ? <CheckCircle2 size={20}/> : <LocateFixed className="text-[#D96F00]" size={20}/>}<span>{locationBusy ? "กำลังค้นหาตำแหน่ง…" : position ? `ตำแหน่งพร้อม · ±${Math.round(position.accuracy)} ม.` : "แชร์ตำแหน่งปัจจุบัน"}</span></span><ChevronRight size={19}/></button><label className={`mt-3 flex min-h-24 cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border border-dashed p-3 ${photo ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>{preview ? <img src={preview} alt="Evidence preview" className="size-20 rounded-xl object-cover"/> : <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-[#D96F00]"><Camera size={24}/></span>}<span className="min-w-0"><span className="block font-bold">{photo ? photo.name : "ถ่ายรูปหรือเลือกรูป"}</span><span className="mt-1 block text-sm text-slate-500">JPG, PNG หรือ WebP · ไม่เกิน 8 MB</span></span><Upload className="ml-auto shrink-0 text-slate-400" size={20}/><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}/></label></>}<label className="mt-4 block text-sm font-bold">หมายเหตุ <span className="font-normal text-slate-400">(ไม่บังคับ)</span><textarea value={note} onChange={(event)=>setNote(event.target.value)} maxLength={500} rows={3} placeholder="รายละเอียดจุดรับหรือเหตุการณ์เพิ่มเติม" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base outline-none focus:border-[#FF8A05]"/></label>{error && <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"><CircleAlert className="shrink-0" size={19}/>{error}</p>}{message && <p className="mt-4 flex gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="shrink-0" size={19}/>{message}</p>}<div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur"><button disabled={busy || !online || Boolean(needsEvidence && (!position || !photo))} className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-6 text-base font-black text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-45">{busy ? <LoaderCircle className="animate-spin" size={20}/> : <Check size={20}/>} {busy ? "กำลังบันทึก…" : next.action}</button></div></form> : <section className="rounded-[26px] bg-emerald-50 p-7 text-center text-emerald-900"><CheckCircle2 className="mx-auto" size={46}/><h2 className="mt-4 text-2xl font-black">งานนี้เสร็จเรียบร้อย</h2><p className="mt-2">Waydidi ได้รับสถานะและหลักฐานทั้งหมดแล้ว</p></section>}
    </div>
  </main>;
}
