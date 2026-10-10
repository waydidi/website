"use client";
import { DriverWelcome } from "@/components/driver/welcome-scene";
import { driverHeaders, rememberDriverToken } from "@/lib/driver-token";
import { StepCamera } from "@/components/drivers/step-camera";
import type { EvidencePolicy } from "@/lib/evidence-rules";

import {
  Camera,
  Check,
  Clock3,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Luggage,
  MapPin,
  RefreshCw,
  Users,
  UserX,
  WifiOff,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { clearQueuedStep, queuedStepForm, readQueuedStep, saveQueuedStep, type QueuedDriverStep } from "@/lib/driver-step-queue";
import { distanceMetres, NO_SHOW_MIN_NOTE_LENGTH } from "@/lib/trip-rules";

type DriverStatus =
  | "assigned"
  | "going_to_standby"
  | "standby"
  | "passenger_verified"
  | "trip_started"
  | "passenger_picked_up"
  | "completed"
  | "no_show";
type Trip = {
  evidencePolicy: EvidencePolicy;
  evidenceOverrides: {pickup:boolean;dropoff:boolean};
  assignment: {
    id: string;
    currentStatus: DriverStatus;
    tokenExpiresAt: string;
    passengerVerifiedAt: string | null;
    passengerVerificationMethod: string | null;
    passengerVerificationAttemptsRemaining: number;
  };
  driver: { fullName: string; phone: string };
  booking: {
    leg: string;
    reference: string;
    customerName: string;
    customerPhone: string;
    pickup: string;
    dropoff: string;
    pickupDate: string;
    pickupTime: string;
    passengers: number;
    luggage: number;
    vehicle: string;
    flightNumber: string | null;
    pickupLatitude: number | null;
    pickupLongitude: number | null;
    status: string;
  };
  events: Array<{
    id: string;
    status: DriverStatus;
    verificationStatus: string;
    rejectionReason: string | null;
    expectedDistanceMetres: number | null;
    createdAt: string;
    hasEvidence: boolean;
    tripEvidenceId: string | null;
    confirmedAt: string | null;
  }>;
  activeStop: { reason: string; note: string | null; declaredAt: string } | null;
  stopAlert?: boolean;
  payoutDetails: { submittedAt: string } | null;
  noShow: { eligibleAt: string | null; airport: boolean; freeWaitMinutes: number; maxDistanceMetres: number };
};


const steps: Array<{
  status: Exclude<DriverStatus, "assigned">;
  thai: string;
  english: string;
  action: string;
  help: string;
}> = [
  {
    status: "going_to_standby",
    thai: "กำลังไปจุดรับ",
    english: "On the way",
    action: "เริ่มเดินทางไปจุดรับ",
    help: "กดเมื่อคุณเริ่มเดินทางไปยังจุดรับลูกค้า",
  },
  {
    status: "standby",
    thai: "รอที่จุดรับ",
    english: "Waiting at pickup",
    action: "ยืนยันว่าถึงจุดรับแล้ว",
    help: "ถ่ายรูปบริเวณจุดรับ แล้วกดยืนยันว่าถึงแล้ว",
  },
  {
    status: "trip_started",
    thai: "เริ่มการเดินทาง",
    english: "On trip",
    action: "เริ่มการเดินทาง",
    help: "กดเมื่อรับลูกค้าขึ้นรถแล้วและเริ่มเดินทาง",
  },
  {
    status: "completed",
    thai: "ส่งลูกค้าเรียบร้อย",
    english: "Arrived",
    action: "ยืนยันว่าส่งลูกค้าแล้ว",
    help: "บันทึกรูปจุดส่ง (ตามนโยบาย) แล้วยืนยันส่งลูกค้า ระบบจะบันทึกเวลายืนยัน",
  },
];

// The header's three steps. A step is done once its status is reached; the next one is current.
const STEPPER: { label: string; reachedBy: string[] }[] = [
  { label: "Stand by", reachedBy: ["standby", "passenger_verified", "no_show"] },
  { label: "Pick up", reachedBy: ["trip_started", "passenger_picked_up"] },
  { label: "Drop", reachedBy: ["completed"] },
];
function TripStepper({ status }: { status: string }) {
  const reached = STEPPER.reduce((count, step, index) => (STEPPER.slice(index).some((later) => later.reachedBy.includes(status)) ? index + 1 : count), 0);
  return <ol className="grid grid-cols-3" aria-label="Trip steps">
    {STEPPER.map((step, index) => {
      const done = index < reached, current = index === reached;
      return <li key={step.label} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center">
        <span className={`text-[13px] font-black uppercase leading-5 tracking-[.12em] ${done || current ? "text-white" : "text-white/55"}`}>{step.label}</span>
        {/* Line to the next step: solid once this step is done. */}
        {index < STEPPER.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-[51px] h-[5px] w-full -translate-y-1/2 ${done ? "bg-white" : "bg-[#FFAD50]"}`} />}
        <span className={`relative mt-3 grid size-[38px] place-items-center rounded-full ${done ? "bg-white text-brand" : current ? "border-[3px] border-white bg-brand" : "bg-[#FFAD50]"}`}>
          {done && <Check size={20} strokeWidth={3.5} aria-hidden="true" />}
          <span className="sr-only">{done ? "done" : current ? "current step" : "next"}</span>
        </span>
      </li>;
    })}
  </ol>;
}

// "11/10/2026 — 09:00 am", as on the admin booking card.
const tripDateTime = (date: string, time: string) => { const [y, m, d] = date.split("-"); const [h = 0, min = 0] = time.split(":").map(Number); return `${d}/${m}/${y} — ${String(h % 12 || 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };

export default function DriverTripClient({ token: initialToken }: { token: string }) {
  const token="session";
  const exchange=useRef<Promise<Response> | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  // Stand by, Pick up and Drop are confirmed with a photo taken in the step camera.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [online, setOnline] = useState(true);
  // Welcome screen before a new job starts: shown once per job on this phone, until "เริ่มงาน".
  const [welcome, setWelcome] = useState(false);
  const welcomeKey = (id: string) => `waydidi-driver-welcome:${id}`;
  const [pending, setPending] = useState<QueuedDriverStep | null>(null);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowNote, setNoShowNote] = useState("");
  const [noShowPhoto, setNoShowPhoto] = useState<File | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const sending = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try {
      if(initialToken!=="session") {
        exchange.current??=fetch("/api/driver/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:initialToken})});
        const session=await exchange.current;
        // Let "Try again" make a fresh attempt.
        if(!session.ok) { exchange.current=null; throw new Error("Driver link expired or revoked."); }
        rememberDriverToken(initialToken);
        window.history.replaceState(null,"","/driver/trip/session");
      }
      const response = await fetch(
        `/api/driver/trips/${encodeURIComponent(token)}`,
        { cache: "no-store", headers: driverHeaders() },
      );
      // A server error page isn't JSON (Safari then says "The string did not match the expected pattern").
      const result = (await response.json().catch(() => ({ error: "The trip could not be loaded right now. Please try again in a minute, or contact Waydidi operations." }))) as Trip & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Trip unavailable.");
    setTrip(result);
    if (result.assignment?.currentStatus === "assigned") {
      let seen = false;
      try { seen = Boolean(localStorage.getItem(welcomeKey(result.assignment.id))); } catch { /* storage blocked: show it */ }
      if (!seen) setWelcome(true);
    }

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trip unavailable.");
    } finally {
      setLoading(false);
    }
  }, [token,initialToken]);

  useEffect(() => {
    const first=window.setTimeout(()=>void load(),0);
    const timer = window.setInterval(load, 20_000);
    return () => {window.clearTimeout(first);window.clearInterval(timer);};
  }, [load]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Sends a step to the server. Network failures and server errors keep the
  // step queued on the phone; a rejected step is dropped and explained.
  const sendStep = useCallback(async (step: QueuedDriverStep): Promise<"sent" | "queued" | "rejected"> => {
    if (sending.current || !navigator.onLine) return "queued";
    sending.current = true;
    try {
      const response = await fetch(`/api/driver/trips/${encodeURIComponent(token)}`, { method: "POST", headers: driverHeaders(), body: queuedStepForm(step) });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok && (response.status >= 500 || response.status === 429)) return "queued";
      await clearQueuedStep(step.assignmentId);
      setPending(null);
      if (response.ok) setMessage(step.status === "no_show" ? "แจ้งไม่พบผู้โดยสารแล้ว ฝ่ายปฏิบัติการจะติดต่อกลับ" : "บันทึกสถานะ เวลา ตำแหน่ง และหลักฐานแล้ว");
      else setError(result.error ?? "บันทึกสถานะไม่สำเร็จ");
      await load();
      return response.ok ? "sent" : "rejected";
    } catch {
      return "queued";
    } finally {
      sending.current = false;
    }
  }, [token, load]);

  const assignmentId = trip?.assignment.id;
  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    const flush = async () => {
      const step = await readQueuedStep(assignmentId);
      if (cancelled) return;
      setPending(step);
      if (step) await sendStep(step);
    };
    void flush();
    const timer = window.setInterval(flush, 20_000);
    window.addEventListener("online", flush);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("online", flush); };
  }, [assignmentId, sendStep]);


  const progressStatuses = ["assigned", ...steps.map((step) => step.status)];
  const currentIndex = trip
    ? trip.assignment.currentStatus === "no_show"
      ? progressStatuses.indexOf("standby") + 1
      : trip.assignment.currentStatus === "passenger_verified"
        ? progressStatuses.indexOf("standby")
        : progressStatuses.indexOf(trip.assignment.currentStatus)
    : 0;
  const next = trip && trip.assignment.currentStatus !== "no_show"
    ? trip.assignment.currentStatus === "passenger_picked_up"
      ? steps.find((step) => step.status === "completed") ?? null
      : steps[currentIndex] ?? null
    : null;
  const photoStep = Boolean(next && ["standby", "trip_started", "completed"].includes(next.status));
  const noShowEligibleAt = trip?.noShow.eligibleAt ? new Date(trip.noShow.eligibleAt).getTime() : null;
  const noShowMinutesLeft = noShowEligibleAt === null ? null : Math.max(0, Math.ceil((noShowEligibleAt - clock) / 60_000));
  const canReportNoShow = Boolean(trip && trip.assignment.currentStatus === "standby" && !trip.assignment.passengerVerifiedAt && !pending);
  function readCurrentLocation() {
    return new Promise<{
      latitude: number;
      longitude: number;
      accuracy: number;
    }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("อุปกรณ์นี้ไม่รองรับตำแหน่ง GPS"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (result) =>
          resolve({
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
            accuracy: result.coords.accuracy,
          }),
        () =>
          reject(
            new Error(
              "ไม่สามารถอ่านตำแหน่งได้ กรุณาตรวจสอบสิทธิ์ตำแหน่งแล้วลองอีกครั้ง",
            ),
          ),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
      );
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trip || !next || busy) return;
    // Photo steps: the camera opens; the step is sent once the photo is saved.
    if (photoStep) { setError(""); setCameraOpen(true); return; }
    if (!window.confirm(`ยืนยันสถานะ “${next.thai}”?`)) return;
    await sendStatus(null);
  }

  async function sendStatus(photoId: string | null) {
    if (!trip || !next) return;
    setBusy(true);
    setError("");
    setMessage("");
    const step: QueuedDriverStep = {
      id: crypto.randomUUID(),
      assignmentId: trip.assignment.id,
      status: next.status,
      note,
      occurredAt: new Date().toISOString(),
      latitude: null,
      longitude: null,
      accuracy: null,
      evidenceId: photoId ?? evidenceId,
      photo: null,
      photoName: null,
    };
    if (await queueAndSend(step)) {
      setNote("");
      setEvidenceId(null);
    }
    setBusy(false);
  }

  /** Returns true when the step was saved on the server or safely queued on the phone. */
  async function queueAndSend(step: QueuedDriverStep) {
    let stored = true;
    try { await saveQueuedStep(step); } catch { stored = false; }
    if (!stored && !navigator.onLine) {
      setError("อุปกรณ์นี้บันทึกแบบออฟไลน์ไม่ได้ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง");
      return false;
    }
    setPending(step);
    const outcome = await sendStep(step);
    if (outcome === "queued" && !stored) {
      setPending(null);
      setError("บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง");
      return false;
    }
    return outcome !== "rejected";
  }

  async function reportNoShow(event: FormEvent) {
    event.preventDefault();
    if (!trip || busy) return;
    if (noShowNote.trim().length < NO_SHOW_MIN_NOTE_LENGTH) { setError("อธิบายสั้น ๆ ว่าคุณติดต่อหรือตามหาผู้โดยสารอย่างไร"); return; }
    if (!noShowPhoto) { setError("ต้องแนบรูปจุดรับก่อนแจ้ง"); return; }
    if (!window.confirm("ยืนยันแจ้งว่าไม่พบผู้โดยสาร? ฝ่ายปฏิบัติการจะตรวจสอบก่อนปิดงาน")) return;
    setBusy(true); setError(""); setMessage("");
    let here: { latitude: number; longitude: number; accuracy: number };
    try { here = await readCurrentLocation(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ไม่สามารถอ่านตำแหน่งได้");
      setBusy(false);
      return;
    }
    const { pickupLatitude, pickupLongitude } = trip.booking;
    if (pickupLatitude != null && pickupLongitude != null) {
      const away = distanceMetres(here, { latitude: pickupLatitude, longitude: pickupLongitude });
      if (away > trip.noShow.maxDistanceMetres) {
        setError(`ต้องอยู่ห่างจากจุดรับไม่เกิน ${trip.noShow.maxDistanceMetres / 1000} กม. ขณะนี้ห่างประมาณ ${(away / 1000).toFixed(1)} กม.`);
        setBusy(false);
        return;
      }
    }
    const accepted = await queueAndSend({
      id: crypto.randomUUID(), assignmentId: trip.assignment.id, status: "no_show", note: noShowNote.trim(),
      occurredAt: new Date().toISOString(), latitude: here.latitude, longitude: here.longitude, accuracy: Math.round(here.accuracy),
      photo: noShowPhoto, photoName: noShowPhoto.name,
    });
    if (accepted) { setNoShowNote(""); setNoShowPhoto(null); setNoShowOpen(false); }
    setBusy(false);
  }

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-brand text-white">
        <LoaderCircle className="animate-spin" size={42} />
      </main>
    );
  if (!trip)
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5 text-plum">
        <div className="max-w-md rounded-[28px] bg-white p-8 text-center shadow-xl">
          <CircleAlert className="mx-auto text-brand-text" size={44} />
          <h1 className="mt-5 text-2xl font-black">Driver link unavailable</h1>
          <p className="mt-3 text-slate-600">
            {error || "Ask Waydidi operations for a new driver link."}
          </p>
          <button
            onClick={load}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-bold text-white"
          >
            <RefreshCw size={18} /> Try again
          </button>
        </div>
      </main>
    );

  const completionEvent = trip.events.find(
    (event) => event.status === "completed",
  );
  const completionVerified = completionEvent?.verificationStatus === "verified";
  return (
    <main className="min-h-screen bg-[#f3f5f8] pb-32 text-plum">
      {welcome && <DriverWelcome onStart={() => { try { localStorage.setItem(welcomeKey(trip.assignment.id), "1"); } catch { /* storage blocked */ } setWelcome(false); }} />}
      <header className="bg-brand px-5 pb-7 pt-6 text-white">
        <div className="mx-auto max-w-xl">
          <h1 className="sr-only">Trip {trip.booking.reference}</h1>
          {!online && (
            <p className="mb-4 flex justify-center"><span className="inline-flex items-center gap-2 rounded-full bg-red-700 px-3 py-2 text-xs font-bold">
              <WifiOff size={15} /> Offline
            </span></p>
          )}
          <TripStepper status={trip.assignment.currentStatus} />
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
        <section className="rounded-[26px] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-black">
              {trip.booking.customerName}
            </h2>
          </div>
          {/* Trip details laid out like the admin booking card. */}
          <dl className="mt-5 grid gap-2 rounded-2xl bg-slate-50 p-4 text-[13.5px]">
            {([
              ["Passengers & luggage", <span key="pl" className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1" aria-label={`${trip.booking.passengers} passengers`}><Users size={15} aria-hidden="true" />{trip.booking.passengers}</span><span className="inline-flex items-center gap-1" aria-label={`${trip.booking.luggage} bags`}><Luggage size={15} aria-hidden="true" />{trip.booking.luggage}</span></span>],
              ["Vehicle", trip.booking.vehicle],
              ["Date & time", tripDateTime(trip.booking.pickupDate, trip.booking.pickupTime)],
              ["From", trip.booking.pickup],
              ["To", trip.booking.dropoff],
            ] as [string, React.ReactNode][]).map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
          </dl>
          {/* Directions in Google Maps to the pickup or the drop-off */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([["Pick up", trip.booking.pickup], ["Drop", trip.booking.dropoff]] as const).map(([label, place]) => (
              <a key={label} href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`} target="_blank" rel="noreferrer"
                aria-label={`${label}: ${place} (Google Maps)`}
                className="flex h-16 items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 text-[17px] font-black text-brand-text active:bg-orange-100">
                <MapPin size={22} aria-hidden="true" />{label}
              </a>
            ))}
          </div>
        </section>
        {pending ? (
          <section className="rounded-[26px] border border-amber-200 bg-amber-50 p-6 text-amber-900" aria-live="polite">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em]"><WifiOff size={15} /> Waiting to send</p>
            <h2 className="mt-2 text-2xl font-black">
              {pending.status === "no_show" ? "แจ้งไม่พบผู้โดยสาร" : steps.find((step) => step.status === pending.status)?.thai ?? pending.status}
            </h2>
            <p className="mt-2 leading-6">
              บันทึกไว้ในโทรศัพท์แล้ว เวลา {new Date(pending.occurredAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} · ระบบจะส่งให้อัตโนมัติเมื่อมีสัญญาณอินเทอร์เน็ต ไม่ต้องกดซ้ำ
            </p>
            {online && (
              <button type="button" onClick={() => void sendStep(pending)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-amber-800 px-5 text-sm font-black text-white">
                <RefreshCw size={16} /> ส่งตอนนี้
              </button>
            )}
            {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
          </section>
        ) : next ? (
          // The next step is confirmed from the fixed button at the bottom.
          <form onSubmit={submit} aria-label={next.thai}>
            {photoStep && cameraOpen && <StepCamera title={next.thai} type={next.status === "completed" ? "dropoff" : "pickup"} policy={trip.evidencePolicy}
              onCancel={() => setCameraOpen(false)} onSaved={(id) => { setCameraOpen(false); void sendStatus(id); }} />}
            {error && (
              <p
                role="alert"
                className="flex gap-2 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
              >
                <CircleAlert className="shrink-0" size={19} />
                {error}
              </p>
            )}
            {message && (
              <p className="mt-4 flex gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="shrink-0" size={19} />
                {message}
              </p>
            )}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
              <button
                disabled={
                  busy
                }
                className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-black text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={20} />
                ) : photoStep ? (
                  <Camera size={20} aria-hidden="true" />
                ) : (
                  <Check size={20} />
                )}{" "}
                {busy ? "กำลังบันทึก…" : next.action}
              </button>
            </div>
          </form>
        ) : trip.assignment.currentStatus === "no_show" ? (
          <section className="rounded-[26px] border border-red-200 bg-red-50 p-7 text-center text-red-900">
            <UserX className="mx-auto" size={44} />
            <h2 className="mt-4 text-2xl font-black">แจ้งไม่พบผู้โดยสารแล้ว</h2>
            <p className="mt-2">ฝ่ายปฏิบัติการกำลังตรวจสอบรูปและตำแหน่ง และจะติดต่อคุณหากต้องการข้อมูลเพิ่ม</p>
          </section>
        ) : completionVerified ? (
          <section className="rounded-[26px] bg-emerald-50 p-7 text-center text-emerald-900">
            <CheckCircle2 className="mx-auto" size={46} />
            <h2 className="mt-4 text-2xl font-black">งานนี้เสร็จเรียบร้อย</h2>
            <p className="mt-2">ผู้ดูแล Waydidi ตรวจสอบการส่งลูกค้าแล้ว</p>
          </section>
        ) : (
          <section className="rounded-[26px] border border-amber-200 bg-amber-50 p-7 text-center text-amber-900">
            <LoaderCircle className="mx-auto" size={44} />
            <h2 className="mt-4 text-2xl font-black">รอผู้ดูแลตรวจสอบ</h2>
            <p className="mt-2">
              ส่งสถานะและหลักฐานการส่งลูกค้าแล้ว งานจะเสร็จสมบูรณ์หลังจากผู้ดูแลยืนยัน
            </p>
          </section>
        )}
        {canReportNoShow && (
          <section className="rounded-[26px] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-700"><UserX size={21} /></span>
              <div>
                <h2 className="text-lg font-black">ไม่พบผู้โดยสาร?</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  รอฟรี {trip.noShow.freeWaitMinutes} นาที{trip.noShow.airport ? " หลังเครื่องลงจอด" : " หลังเวลานัด"} · โทรหาผู้โดยสารก่อนแจ้งทุกครั้ง
                </p>
              </div>
            </div>
            {noShowMinutesLeft === null ? (
              <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">ไม่สามารถคำนวณเวลารอได้ กรุณาติดต่อฝ่ายปฏิบัติการ</p>
            ) : noShowMinutesLeft > 0 ? (
              <p className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
                <Clock3 size={18} className="shrink-0 text-brand-text" />
                แจ้งได้ในอีก {noShowMinutesLeft} นาที · {new Date(noShowEligibleAt!).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} น.
              </p>
            ) : !noShowOpen ? (
              <button type="button" onClick={() => { setNoShowOpen(true); setError(""); }} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-red-200 font-black text-red-700">
                <UserX size={18} /> แจ้งไม่พบผู้โดยสาร
              </button>
            ) : (
              <form onSubmit={reportNoShow} className="mt-4 space-y-3">
                <p className="text-sm text-slate-600">ต้องอยู่ห่างจากจุดรับไม่เกิน {trip.noShow.maxDistanceMetres / 1000} กม. ระบบจะอ่านตำแหน่งตอนกดส่ง</p>
                <label className={`flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl border border-dashed p-3 ${noShowPhoto ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-brand-text"><Camera size={22} /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{noShowPhoto ? noShowPhoto.name : "ถ่ายรูปจุดรับ / ป้ายชื่อ"}</span>
                    <span className="mt-1 block text-sm text-slate-500">JPG, PNG หรือ WebP · ไม่เกิน 8 MB</span>
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => setNoShowPhoto(event.target.files?.[0] ?? null)} />
                </label>
                <label className="block text-sm font-bold">
                  หมายเหตุ <span className="font-normal text-slate-400">(บังคับ)</span>
                  <textarea value={noShowNote} onChange={(event) => setNoShowNote(event.target.value)} maxLength={500} rows={3} required placeholder="เช่น โทร 3 ครั้งไม่รับสาย รอที่ประตู 3 พร้อมป้ายชื่อ" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base outline-none focus:border-brand" />
                </label>
                {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setNoShowOpen(false)} className="h-12 rounded-full border border-slate-200 font-bold">ยกเลิก</button>
                  <button disabled={busy || !noShowPhoto || noShowNote.trim().length < NO_SHOW_MIN_NOTE_LENGTH} className="flex h-12 items-center justify-center gap-2 rounded-full bg-red-700 font-black text-white disabled:opacity-45">
                    {busy ? <LoaderCircle className="animate-spin" size={18} /> : <UserX size={18} />} ส่งแจ้งไม่พบผู้โดยสาร
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>

    </main>
  );
}
