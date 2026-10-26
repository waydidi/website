"use client";
import { useCloseOutside } from "@/lib/use-close-outside";
import { directionsTo } from "@/lib/maps-link";
import { includesKohChangFerry } from "@/lib/booking-form";
import { DriverWelcome } from "@/components/driver/welcome-scene";
import { driverHeaders, rememberDriverToken } from "@/lib/driver-token";
import { StepCamera } from "@/components/drivers/step-camera";
import { PayoutPage, type SavedPayout } from "@/components/drivers/payout-page";
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
import { acknowledgeQueuedStep, claimQueuedStepAttempt, clearQueuedStep, queuedStepForm, readDriverSync, readQueuedStep, recordDriverSync, saveQueuedStep, updateQueuedStepSync, type QueuedDriverStep } from "@/lib/driver-step-queue";
import { driverResponseKind, driverRetryAt, initialDriverSync, mayRetryDriverStep, type DriverStepSync } from "@/lib/driver-sync-rules";
import { distanceMetres, isDriverStatus, NO_SHOW_MIN_NOTE_LENGTH } from "@/lib/trip-rules";

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
    pickupMapUrl?: string | null;
    dropoffMapUrl?: string | null;
    /** Set by staff in Telegram ("Set cost"); null until then. */
    price?: number | null;
    paymentStatus?: string | null;
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
  payoutNeeded?: boolean;
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
/** The Price row, as on the admin ride card: a "!" on the left opens what the price includes. */
function PriceRow({ booking }: { booking: Trip["booking"] }) {
  const [open, setOpen] = useState(false);
  const box = useCloseOutside<HTMLDivElement>(open, () => setOpen(false));
  const items = ["รถส่วนตัวพร้อมคนขับ", "ค่าน้ำมันและค่าคนขับ", ...(includesKohChangFerry(booking.pickup, booking.dropoff) ? [`ตั๋วเรือเฟอร์รี่เกาะช้างสำหรับผู้โดยสารทั้ง ${booking.passengers} คน`] : [])];
  return <div ref={box} className="relative flex justify-between gap-3">
    <dt className="shrink-0 text-slate-500">ราคา</dt>
    <dd className="flex items-center justify-end gap-1.5 text-right font-semibold"><button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="ราคานี้รวมอะไรบ้าง" className="grid size-[19px] place-items-center rounded-full bg-brand text-[12px] font-black leading-none text-white">!</button>{booking.price != null ? `${booking.price.toLocaleString("en-US")} บาท` : "รอแจ้งราคา"}</dd>
    {open && <div role="dialog" aria-label="ราคานี้รวมอะไรบ้าง" className="absolute right-0 top-[calc(100%+6px)] z-20 w-[260px] rounded-xl border border-slate-200 bg-white p-3 text-[14px] shadow-lg">
      <p className="mb-1.5 font-bold">ราคานี้รวม</p>
      <ul className="grid gap-1">{items.map((i) => <li key={i} className={`flex gap-1.5 ${i.startsWith("ตั๋วเรือ") ? "font-semibold text-[#2F7A6B]" : "text-slate-700"}`}><span aria-hidden>✓</span>{i}</li>)}</ul>
    </div>}
  </div>;
}

function TripStepper({ status }: { status: string }) {
  const reached = STEPPER.reduce((count, step, index) => (STEPPER.slice(index).some((later) => later.reachedBy.includes(status)) ? index + 1 : count), 0);
  return <ol className="grid grid-cols-3" aria-label="ขั้นตอนการเดินทาง">
    {STEPPER.map((step, index) => {
      const done = index < reached, current = index === reached;
      return <li key={step.label} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center">
        <span className={`text-[14px] font-black uppercase leading-5 tracking-[.12em] ${done || current ? "text-white" : "text-white/55"}`}>{step.label}</span>
        {/* Line to the next step: solid once this step is done. */}
        {index < STEPPER.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-[51px] h-[5px] w-full -translate-y-1/2 ${done ? "bg-white" : "bg-[#FFAD50]"}`} />}
        <span className={`relative mt-3 grid size-[38px] place-items-center rounded-full ${done ? "bg-white text-brand" : current ? "border-[3px] border-white bg-brand" : "bg-[#FFAD50]"}`}>
          {done && <Check size={20} strokeWidth={3.5} aria-hidden="true" />}
          <span className="sr-only">{done ? "เสร็จแล้ว" : current ? "ขั้นตอนปัจจุบัน" : "ถัดไป"}</span>
        </span>
      </li>;
    })}
  </ol>;
}

// "11/10/2026 — 09:00 น." (24-hour, as Thai drivers read it).
const tripDateTime = (date: string, time: string) => { const [y, m, d] = date.split("-"); const [h = 0, min = 0] = time.split(":").map(Number); return `${d}/${m}/${y} — ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")} น.`; };

/** Payment status as a Thai pill (the driver link is Thai). */
const paymentThai = (status?: string | null): [string, string] => status === "paid" || status === "partially_refunded" ? ["ชำระแล้ว", "bg-emerald-50 text-emerald-700"] : status === "cash_due" ? ["เก็บเงินสด", "bg-red-50 text-red-700"] : ["ยังไม่ชำระ", "bg-amber-50 text-amber-800"];

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
  const [pendingDurable, setPendingDurable] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowNote, setNoShowNote] = useState("");
  const [noShowPhoto, setNoShowPhoto] = useState<File | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const sending = useRef(false);
  const volatileStep = useRef<QueuedDriverStep | null>(null);
  // After the Drop the link goes to "กรอกข้อมูลบัญชี" until the bank details are in: auto → form; done → the tick
  // after "ส่งข้อมูล"; edit → the form again from the tick; closed → back to the trip page.
  const [payoutStage, setPayoutStage] = useState<"auto" | "done" | "edit" | "closed">("auto");
  const [payoutSaved, setPayoutSaved] = useState<SavedPayout | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      if(initialToken!=="session") {
        exchange.current??=fetch("/api/driver/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:initialToken})});
        const session=await exchange.current;
        // Let "Try again" make a fresh attempt.
        if(!session.ok) { exchange.current=null; throw new Error("ลิงก์คนขับหมดอายุหรือถูกยกเลิก"); }
        // The address keeps the real link, so "Open in browser" (Telegram, LINE) or a refresh still opens this trip.
        rememberDriverToken(initialToken);
      }
      const response = await fetch(
        `/api/driver/trips/${encodeURIComponent(token)}`,
        { cache: "no-store", headers: driverHeaders() },
      );
      // A server error page isn't JSON (Safari then says "The string did not match the expected pattern").
      const result = (await response.json().catch(() => ({ error: "โหลดข้อมูลงานไม่สำเร็จในขณะนี้ กรุณาลองอีกครั้งในอีกสักครู่ หรือติดต่อฝ่ายปฏิบัติการ Waydidi" }))) as Trip & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ไม่พบข้อมูลงาน");
      if (!result.assignment || typeof result.assignment.id !== "string" || !isDriverStatus(result.assignment.currentStatus)
        || !result.booking || typeof result.booking.reference !== "string" || !result.driver || typeof result.driver.fullName !== "string"
        || !result.noShow || !result.evidencePolicy || !Array.isArray(result.events)) throw new Error("ยังไม่ได้รับข้อมูลงานที่ถูกต้อง กรุณาลองอีกครั้ง");
    setTrip(result);
    const syncedAt = new Date().toISOString();
    setLastSync(previous => previous && previous > syncedAt ? previous : syncedAt);
    void recordDriverSync(result.assignment.id, syncedAt).catch(() => setStorageWarning("โทรศัพท์บันทึกข้อมูลออฟไลน์ไม่ได้ ข้อมูลรอส่งอาจไม่อยู่หลังปิดหน้านี้ กรุณาตรวจสอบพื้นที่จัดเก็บ"));
    if (result.assignment?.currentStatus === "assigned") {
      let seen = false;
      try { seen = Boolean(localStorage.getItem(welcomeKey(result.assignment.id))); } catch { /* storage blocked: show it */ }
      if (!seen) setWelcome(true);
    }

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ไม่พบข้อมูลงาน");
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

  // Keep the original event until a matching server acknowledgment. Rejections
  // remain on the device for review, rather than silently losing the driver's work.
  const sendStep = useCallback(async (input: QueuedDriverStep, manual = false, persisted = true): Promise<"sent" | "queued" | "rejected"> => {
    if (sending.current || !navigator.onLine || !mayRetryDriverStep(input.sync, Date.now(), manual)) return "queued";
    sending.current = true;
    setSyncBusy(true);
    let step = input;
    let acknowledged = false;
    let claimedAttempt = !persisted;
    const retain = async (sync: DriverStepSync) => {
      const next = { ...step, sync };
      if (persisted) {
        try {
          const updated = await updateQueuedStepSync(step.assignmentId, step.id, () => sync, step.sync?.leaseId);
          setPending(updated ?? await readQueuedStep(step.assignmentId));
        } catch {
          setPending(next);
          setStorageWarning("ยังตรวจสอบข้อมูลที่บันทึกในโทรศัพท์ไม่ได้ กรุณาอย่าปิดหน้านี้และลองอีกครั้ง");
        }
      } else {
        volatileStep.current = next;
        setPending(next);
        setStorageWarning("ข้อมูลนี้ยังไม่ได้บันทึกในโทรศัพท์ กรุณาอย่าปิดหน้านี้จนกว่าเซิร์ฟเวอร์จะยืนยันสำเร็จ");
      }
      setPendingDurable(persisted);
    };
    try {
      if (persisted) {
        const claimed = await claimQueuedStepAttempt(step.assignmentId, step.id, manual);
        if (!claimed) { setPending(await readQueuedStep(step.assignmentId)); return "queued"; }
        step = claimed;
        claimedAttempt = true;
      } else {
        const previous = step.sync ?? initialDriverSync();
        step = { ...step, sync: { ...previous, attempts: previous.attempts + 1, lastAttemptAt: new Date().toISOString() } };
        volatileStep.current = step;
      }
      setPending(step);
      const response = await fetch(`/api/driver/trips/${encodeURIComponent(token)}`, { method: "POST", headers: driverHeaders(), body: queuedStepForm(step), signal: AbortSignal.timeout(60000) });
      const result: unknown = await response.json().catch(() => null);
      const kind = driverResponseKind(response.status, result, step);
      if (kind === "accepted") {
        acknowledged = true;
        if (volatileStep.current?.id === step.id) volatileStep.current = null;
        const at = new Date().toISOString();
        if (persisted) setPending(await acknowledgeQueuedStep(step.assignmentId, step.id, at));
        else {
          setPending(await readQueuedStep(step.assignmentId).catch(() => null));
          await recordDriverSync(step.assignmentId, at).catch(() => undefined);
        }
        setPendingDurable(true); setStorageWarning("");
        setLastSync(previous => previous && previous > at ? previous : at);
        setMessage(step.status === "no_show" ? "แจ้งไม่พบผู้โดยสารแล้ว ฝ่ายปฏิบัติการจะติดต่อกลับ" : "บันทึกสถานะ เวลา ตำแหน่ง และหลักฐานแล้ว");
        await load();
        return "sent";
      }
      const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error.slice(0, 300) : null;
      const sync = step.sync ?? initialDriverSync();
      await retain({ ...sync, leaseId: null, leaseUntil: null, blocked: kind === "blocked", httpStatus: response.status,
        error: kind === "blocked" ? "rejected" : response.status === 429 ? "rate_limited" : response.ok ? "unverified" : "server",
        message, retryAt: kind === "retry" ? driverRetryAt(sync.attempts, Date.now(), response.headers.get("retry-after")) : null });
      return kind === "blocked" ? "rejected" : "queued";
    } catch {
      if (!claimedAttempt) {
        setStorageWarning("ยังตรวจสอบคิวในโทรศัพท์ไม่ได้ ข้อมูลเดิมยังรอส่งอยู่ กรุณาลองอีกครั้ง");
        return "queued";
      }
      const sync = step.sync ?? initialDriverSync();
      await retain({ ...sync, leaseId: null, leaseUntil: null, blocked: false, error: "network", httpStatus: null, message: null, retryAt: driverRetryAt(sync.attempts, Date.now()) });
      if (acknowledged) setStorageWarning("เซิร์ฟเวอร์ยืนยันแล้ว แต่โทรศัพท์ยังล้างคิวไม่ได้ ระบบจะตรวจสอบคำขอเดิมอีกครั้งโดยไม่บันทึกซ้ำ");
      return "queued";
    } finally {
      sending.current = false;
      setSyncBusy(false); setClock(Date.now());
    }
  }, [token, load]);

  const assignmentId = trip?.assignment.id;
  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    const flush = async () => {
      if (sending.current) return;
      try {
        const inMemory = volatileStep.current;
        if (inMemory?.assignmentId === assignmentId) {
          try {
            const saved = await saveQueuedStep(inMemory);
            volatileStep.current = null;
            if (cancelled) return;
            setPending(saved); setPendingDurable(true); setStorageWarning("");
            if (mayRetryDriverStep(saved.sync, Date.now())) await sendStep(saved);
          } catch (cause) {
            if (cancelled) return;
            let retained = inMemory;
            if (cause instanceof Error && cause.message === "QUEUED_STEP_CONFLICT") {
              retained = { ...inMemory, sync: { ...(inMemory.sync ?? initialDriverSync()), blocked: true, error: "rejected", message: "อีกหน้าต่างมีข้อมูลขั้นตอนเดิมอยู่ กรุณาตรวจสอบกับฝ่ายปฏิบัติการก่อนลบข้อมูลที่ยังไม่ถูกยืนยัน", leaseId: null, leaseUntil: null } };
              volatileStep.current = retained;
            }
            setPending(retained); setPendingDurable(false);
            setStorageWarning("ข้อมูลนี้ยังไม่ได้บันทึกในโทรศัพท์ กรุณาอย่าปิดหน้านี้จนกว่าเซิร์ฟเวอร์จะยืนยันสำเร็จ");
            if (mayRetryDriverStep(retained.sync, Date.now())) await sendStep(retained, false, false);
          }
          return;
        }
        const [step, sync] = await Promise.all([readQueuedStep(assignmentId), readDriverSync(assignmentId)]);
        if (cancelled) return;
        setPending(step); setPendingDurable(true); setStorageWarning("");
        if (sync) setLastSync(previous => previous && previous > sync.lastSuccessAt ? previous : sync.lastSuccessAt);
        if (step && mayRetryDriverStep(step.sync, Date.now())) await sendStep(step);
      } catch { if (!cancelled) setStorageWarning("อ่านข้อมูลรอส่งในโทรศัพท์ไม่ได้ กรุณาอย่าปิดหน้านี้และตรวจสอบพื้นที่จัดเก็บ"); }
    };
    void flush();
    const timer = window.setInterval(flush, 20_000);
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel("waydidi-driver-queue"); channel.addEventListener("message", flush); } catch { /* polling remains available */ }
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("online", flush); window.removeEventListener("focus", flush); channel?.close(); };
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
    try { step = await saveQueuedStep(step); }
    catch (cause) {
      if (cause instanceof Error && cause.message === "QUEUED_STEP_CONFLICT") {
        setError("มีข้อมูลขั้นตอนเดิมรอส่งอยู่ กรุณาจัดการข้อมูลเดิมก่อน");
        setPending(await readQueuedStep(step.assignmentId).catch(() => null));
        return false;
      }
      stored = false;
    }
    if (!stored && !navigator.onLine) {
      setError("อุปกรณ์นี้บันทึกแบบออฟไลน์ไม่ได้ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง");
      return false;
    }
    if (!stored) volatileStep.current = step;
    setPending(step); setPendingDurable(stored);
    const outcome = await sendStep(step, false, stored);
    if (outcome !== "sent" && !stored) {
      setError("ข้อมูลยังไม่ถูกยืนยันและบันทึกในโทรศัพท์ไม่ได้ กรุณาอย่าปิดหน้านี้และลองส่งอีกครั้ง");
      return false;
    }
    return outcome !== "rejected";
  }

  async function discardBlockedStep() {
    if (!pending || sending.current || !pending.sync?.blocked || !window.confirm("เซิร์ฟเวอร์ยังไม่ยอมรับข้อมูลนี้ ต้องการลบข้อมูลรอส่งจากโทรศัพท์หรือไม่? การลบนี้ไม่เปลี่ยนสถานะงานบนเซิร์ฟเวอร์")) return;
    setSyncBusy(true);
    try {
      if (pendingDurable && !await clearQueuedStep(pending.assignmentId, pending.id)) {
        setPending(await readQueuedStep(pending.assignmentId)); setError("ข้อมูลคิวเปลี่ยนไปแล้ว กรุณาตรวจสอบอีกครั้ง"); return;
      }
      if (volatileStep.current?.id === pending.id) volatileStep.current = null;
      setPending(null); setStorageWarning(""); await load();
    } catch { setStorageWarning("ลบข้อมูลรอส่งไม่สำเร็จ ข้อมูลยังอยู่ในโทรศัพท์ กรุณาลองอีกครั้ง"); }
    finally { setSyncBusy(false); }
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
          <h1 className="mt-5 text-2xl font-black">ลิงก์คนขับใช้ไม่ได้</h1>
          <p className="mt-3 text-slate-600">
            {error || "ติดต่อฝ่ายปฏิบัติการ Waydidi เพื่อขอลิงก์คนขับใหม่"}
          </p>
          <button
            onClick={load}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-bold text-white"
          >
            <RefreshCw size={18} /> ลองอีกครั้ง
          </button>
        </div>
      </main>
    );

  if (trip.assignment.currentStatus === "completed" && trip.payoutNeeded !== false && !pending && payoutStage !== "closed" && (!trip.payoutDetails || payoutStage === "done" || payoutStage === "edit"))
    return <PayoutPage driverName={trip.driver.fullName} reference={trip.booking.reference} mode={payoutStage === "done" ? "done" : "form"} saved={payoutSaved}
      onSubmitted={(saved) => { setPayoutSaved(saved); setPayoutStage("done"); void load(); }} onEdit={() => setPayoutStage("edit")} onFinish={() => setPayoutStage("closed")} />;

  const completionEvent = trip.events.find(
    (event) => event.status === "completed",
  );
  const completionVerified = completionEvent?.verificationStatus === "verified";
  return (
    <main className="min-h-screen bg-[#f3f5f8] pb-32 text-plum">
      {welcome && <DriverWelcome onStart={() => { try { localStorage.setItem(welcomeKey(trip.assignment.id), "1"); } catch { /* storage blocked */ } setWelcome(false); }} />}
      <header className="bg-brand px-5 pb-7 pt-6 text-white">
        <div className="mx-auto max-w-xl">
          <h1 className="sr-only">งาน {trip.booking.reference}</h1>
          {!online && (
            <p className="mb-4 flex justify-center"><span className="inline-flex items-center gap-2 rounded-full bg-red-700 px-3 py-2 text-xs font-bold">
              <WifiOff size={15} /> ออฟไลน์
            </span></p>
          )}
          <TripStepper status={trip.assignment.currentStatus} />
          {lastSync && <p className="mt-3 text-center text-xs" data-testid="driver-last-sync">ซิงก์ข้อมูลงานสำเร็จล่าสุด {new Date(lastSync).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" })}</p>}
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
        {storageWarning && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{storageWarning}</p>}
        <section className="rounded-[26px] bg-white p-5 shadow-sm">
          <p className="text-[13px] font-bold uppercase tracking-[.12em] text-slate-500">ชื่อลูกค้า</p>
          <h2 className="mt-1 text-[21px] font-black leading-tight">
            {trip.booking.customerName}
          </h2>
          {/* Trip details laid out like the admin booking card. */}
          <dl className="mt-5 grid gap-2 rounded-2xl bg-slate-50 p-4 text-[14.5px]">
            {([
              ["ผู้โดยสาร / กระเป๋า", <span key="pl" className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1" aria-label={`ผู้โดยสาร ${trip.booking.passengers} คน`}><Users size={15} aria-hidden="true" />{trip.booking.passengers}</span><span className="inline-flex items-center gap-1" aria-label={`กระเป๋า ${trip.booking.luggage} ใบ`}><Luggage size={15} aria-hidden="true" />{trip.booking.luggage}</span></span>],
              ["รถ", trip.booking.vehicle],
              ["วันที่และเวลา", tripDateTime(trip.booking.pickupDate, trip.booking.pickupTime)],
              ["จุดรับ", trip.booking.pickup],
              ["จุดส่ง", trip.booking.dropoff],
              ["ราคา", null],
              ["การชำระเงิน", <span key="pay" className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold ${paymentThai(trip.booking.paymentStatus)[1]}`}>{paymentThai(trip.booking.paymentStatus)[0]}</span>],
            ] as [string, React.ReactNode][]).map(([label, value]) => label === "ราคา" ? <PriceRow key={label} booking={trip.booking} /> : <div key={label} className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
          </dl>
        </section>
        {/* Pick up / Drop: the Google Maps link an admin set in Telegram, or directions to the address */}
        <div className="grid grid-cols-2 gap-3">
          {([["Pick up", trip.booking.pickup, trip.booking.pickupMapUrl], ["Drop", trip.booking.dropoff, trip.booking.dropoffMapUrl]] as const).map(([label, place, link]) => (
            <a key={label} href={link || directionsTo(place)} target="_blank" rel="noreferrer"
              aria-label={`${label}: ${place} (Google Maps)`}
              className="flex h-16 items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white text-[18px] font-black text-brand-text shadow-sm active:bg-orange-50">
              <MapPin size={22} aria-hidden="true" />{label}
            </a>
          ))}
        </div>
        {pending ? (
          <section className="rounded-[26px] border border-amber-200 bg-amber-50 p-6 text-amber-900" aria-live="polite">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em]"><WifiOff size={15} /> {pending.sync?.blocked ? "ข้อมูลยังไม่ถูกยอมรับ ต้องตรวจสอบ" : syncBusy ? "กำลังส่งข้อมูล" : "รอส่งข้อมูล"}</p>
            <h2 className="mt-2 text-2xl font-black">
              {pending.status === "no_show" ? "แจ้งไม่พบผู้โดยสาร" : steps.find((step) => step.status === pending.status)?.thai ?? pending.status}
            </h2>
            <p className="mt-2 leading-6">
              {pendingDurable ? "บันทึกไว้ในโทรศัพท์แล้ว" : "ยังไม่ได้บันทึกในโทรศัพท์ กรุณาอย่าปิดหน้านี้"} เวลา {new Date(pending.occurredAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}
              {pending.sync?.blocked ? " · เซิร์ฟเวอร์ยังไม่ยอมรับข้อมูลนี้ กรุณาตรวจสอบสถานะงานหรือติดต่อฝ่ายปฏิบัติการก่อนลองอีกครั้ง" : " · ระบบจะส่งให้อัตโนมัติเมื่อมีสัญญาณอินเทอร์เน็ต โดยใช้คำขอเดิม"}
            </p>
            <p className="mt-2 text-xs">ลองส่งแล้ว {pending.sync?.attempts ?? 0} ครั้ง{pending.sync?.lastAttemptAt ? ` · ล่าสุด ${new Date(pending.sync.lastAttemptAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}` : ""}</p>
            {pending.sync?.retryAt && !pending.sync.blocked && <p className="mt-2 text-xs">ลองอัตโนมัติอีกครั้งหลัง {new Date(pending.sync.retryAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}</p>}
            {pending.sync?.error === "unverified" && <p className="mt-3 text-sm font-semibold">ยังไม่ได้รับการยืนยันที่ตรงกับข้อมูลนี้ ระบบจะตรวจสอบคำขอเดิมอีกครั้ง</p>}
            {pending.sync?.blocked && <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-800">{pending.sync.message ?? "บันทึกสถานะไม่สำเร็จ กรุณาติดต่อฝ่ายปฏิบัติการ"}</p>}
            {online && (
              <button type="button" disabled={syncBusy || !mayRetryDriverStep(pending.sync, clock, true)} onClick={() => void sendStep(pending, true, pendingDurable)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-amber-800 px-5 text-sm font-black text-white disabled:opacity-50">
                <RefreshCw size={16} /> {syncBusy ? "กำลังส่งข้อมูล" : "ส่งตอนนี้"}
              </button>
            )}
            {pending.sync?.blocked && <button type="button" disabled={syncBusy} onClick={() => void discardBlockedStep()} className="ml-2 mt-4 rounded-full border border-amber-800 px-4 py-3 text-sm font-bold disabled:opacity-50">ตรวจสอบแล้ว ลบข้อมูลรอส่ง</button>}
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
        ) : null /* Drop sent, waiting for an admin: nothing extra to show */}
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
