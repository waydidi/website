"use client";

import {
  Camera,
  Check,
  Clock3,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Route,
  Upload,
  UserX,
  WifiOff,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { THAI_BANKS } from "@/lib/thai-banks";
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
  assignment: {
    id: string;
    currentStatus: DriverStatus;
    tokenExpiresAt: string;
    passengerVerifiedAt: string | null;
    passengerVerificationMethod: string | null;
    passengerVerificationAttemptsRemaining: number;
  };
  driver: { fullName: string; phone: string; bankCode: string; bankAccountNumber: string; bankAccountName: string };
  booking: {
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
  }>;
  activeStop: { reason: string; note: string | null; declaredAt: string } | null;
  payoutDetails: { submittedAt: string } | null;
  noShow: { eligibleAt: string | null; airport: boolean; freeWaitMinutes: number; maxDistanceMetres: number };
};

type LocationPing = {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  clientTimestamp: string;
  sequenceNumber: number;
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
    help: "แชร์ตำแหน่งปัจจุบัน แล้วกดเมื่อคุณเริ่มเดินทางไปยังจุดรับลูกค้า",
  },
  {
    status: "standby",
    thai: "รอที่จุดรับ",
    english: "Waiting at pickup",
    action: "ยืนยันว่าถึงจุดรับแล้ว",
    help: "แชร์ตำแหน่งปัจจุบันและถ่ายรูปบริเวณจุดรับ",
  },
  {
    status: "passenger_verified",
    thai: "ยืนยัน PIN ผู้โดยสาร",
    english: "PIN verified",
    action: "ยืนยันผู้โดยสาร",
    help: "ขอรหัส Trip PIN จากผู้โดยสารเมื่อพบกันที่จุดรับ",
  },
  {
    status: "trip_started",
    thai: "เริ่มการเดินทาง",
    english: "On trip",
    action: "เริ่มการเดินทาง",
    help: "อนุญาตตำแหน่งแบบสดก่อนเริ่มเดินทาง ระบบจะแชร์ GPS จนกว่าจะส่งลูกค้าเสร็จ",
  },
  {
    status: "completed",
    thai: "ส่งลูกค้าเรียบร้อย",
    english: "Arrived",
    action: "ยืนยันว่าส่งลูกค้าแล้ว",
    help: "แนบรูปหลักฐานก่อนจบงาน ระบบจะบันทึกเวลาส่งลูกค้า",
  },
];

export default function DriverTripClient({ token }: { token: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [tripPin, setTripPin] = useState("");
  const [trackingState, setTrackingState] = useState<"off" | "active" | "sending" | "queued" | "error">("off");
  const [lastTrackedAt, setLastTrackedAt] = useState<string | null>(null);
  const [trackingRetry, setTrackingRetry] = useState(0);
  const [stopReason, setStopReason] = useState("");
  const [stopNote, setStopNote] = useState("");
  const [stopBusy, setStopBusy] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankBusy, setBankBusy] = useState(false);
  const [pending, setPending] = useState<QueuedDriverStep | null>(null);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowNote, setNoShowNote] = useState("");
  const [noShowPhoto, setNoShowPhoto] = useState<File | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const sending = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(
        `/api/driver/trips/${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as Trip & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Trip unavailable.");
    setTrip(result);
      if (result.driver) {
        setBankCode((value) => value || result.driver.bankCode || "");
        setAccountNumber((value) => value || result.driver.bankAccountNumber || "");
        setAccountName((value) => value || result.driver.bankAccountName || "");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trip unavailable.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
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
      const response = await fetch(`/api/driver/trips/${encodeURIComponent(token)}`, { method: "POST", body: queuedStepForm(step) });
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

  useEffect(() => {
    if (!trip || !["trip_started", "passenger_picked_up"].includes(trip.assignment.currentStatus)) {
      setTrackingState("off");
      return;
    }
    const queueKey = `waydidi-location-queue:${trip.assignment.id}`;
    const sequenceKey = `waydidi-location-sequence:${trip.assignment.id}`;
    let cancelled = false;
    const readQueue = (): LocationPing[] => {
      try { return JSON.parse(localStorage.getItem(queueKey) ?? "[]") as LocationPing[]; } catch { return []; }
    };
    const writeQueue = (items: LocationPing[]) => localStorage.setItem(queueKey, JSON.stringify(items.slice(-30)));
    const flush = async () => {
      if (cancelled || !navigator.onLine) { setTrackingState("queued"); return; }
      const queued = readQueue();
      if (!queued.length) { setTrackingState("active"); return; }
      setTrackingState("sending");
      const remaining: LocationPing[] = [];
      for (let index = 0; index < queued.length; index += 1) {
        const ping = queued[index];
        try {
          const response = await fetch("/api/driver/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...ping }) });
          if (response.ok) setLastTrackedAt(new Date().toISOString());
          else if (response.status >= 500 || response.status === 429) { remaining.push(...queued.slice(index)); break; }
        } catch { remaining.push(...queued.slice(index)); break; }
      }
      writeQueue(remaining);
      if (!cancelled) setTrackingState(remaining.length ? "queued" : "active");
    };
    const capture = () => {
      if (cancelled || !navigator.geolocation) { setTrackingState("error"); return; }
      navigator.geolocation.getCurrentPosition((result) => {
        const sequenceNumber = Number(localStorage.getItem(sequenceKey) ?? "0") + 1;
        localStorage.setItem(sequenceKey, String(sequenceNumber));
        const ping: LocationPing = { latitude: result.coords.latitude, longitude: result.coords.longitude, accuracyMetres: Math.round(result.coords.accuracy), clientTimestamp: new Date().toISOString(), sequenceNumber };
        writeQueue([...readQueue(), ping]);
        void flush();
      }, () => setTrackingState("error"), { enableHighAccuracy: true, timeout: 20_000, maximumAge: 15_000 });
    };
    const resume = () => { if (document.visibilityState === "visible") { void flush().then(capture); } };
    setTrackingState("active");
    void flush().then(capture);
    const timer = window.setInterval(capture, 45_000);
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", resume);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("online", flush); document.removeEventListener("visibilitychange", resume); };
  }, [trip?.assignment.currentStatus, trip?.assignment.id, token, trackingRetry]);

  const progressStatuses = ["assigned", ...steps.map((step) => step.status)];
  const currentIndex = trip
    ? trip.assignment.currentStatus === "no_show"
      ? progressStatuses.indexOf("passenger_verified")
      : progressStatuses.indexOf(trip.assignment.currentStatus)
    : 0;
  const next = trip && trip.assignment.currentStatus !== "no_show"
    ? trip.assignment.currentStatus === "passenger_picked_up"
      ? steps.find((step) => step.status === "completed") ?? null
      : steps[currentIndex] ?? null
    : null;
  const needsEvidence = Boolean(next && ["standby", "completed"].includes(next.status));
  const needsLocation = Boolean(next && ["going_to_standby", "standby", "trip_started", "completed"].includes(next.status));
  const noShowEligibleAt = trip?.noShow.eligibleAt ? new Date(trip.noShow.eligibleAt).getTime() : null;
  const noShowMinutesLeft = noShowEligibleAt === null ? null : Math.max(0, Math.ceil((noShowEligibleAt - clock) / 60_000));
  const canReportNoShow = Boolean(trip && trip.assignment.currentStatus === "standby" && !trip.assignment.passengerVerifiedAt && !pending);
  const preview = useMemo(
    () => (photo ? URL.createObjectURL(photo) : ""),
    [photo],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function captureLocation() {
    setLocationBusy(true);
    setError("");
    if (!navigator.geolocation) {
      setError("อุปกรณ์นี้ไม่รองรับตำแหน่ง GPS");
      setLocationBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
        });
        setLocationBusy(false);
      },
      () => {
        setError("กรุณาอนุญาตให้ Waydidi เข้าถึงตำแหน่ง แล้วลองอีกครั้ง");
        setLocationBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

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
    if (needsEvidence && !photo) {
      setError("ต้องแนบรูปก่อนดำเนินการ");
      return;
    }
    if (needsLocation && !position) {
      setError(next.status === "trip_started" ? "ต้องกดอนุญาตตำแหน่งสดก่อนเริ่มเดินทาง" : "ต้องแชร์ตำแหน่งปัจจุบันก่อนดำเนินการ");
      return;
    }
    if (!window.confirm(`ยืนยันสถานะ “${next.thai}”?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    let submissionPosition = position;
    if (next.status === "trip_started" || next.status === "completed") {
      try {
        submissionPosition = await readCurrentLocation();
        setPosition(submissionPosition);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "ไม่สามารถอ่านตำแหน่งได้",
        );
        setBusy(false);
        return;
      }
    }
    const step: QueuedDriverStep = {
      id: crypto.randomUUID(),
      assignmentId: trip.assignment.id,
      status: next.status,
      note,
      occurredAt: new Date().toISOString(),
      latitude: submissionPosition?.latitude ?? null,
      longitude: submissionPosition?.longitude ?? null,
      accuracy: submissionPosition ? Math.round(submissionPosition.accuracy) : null,
      photo,
      photoName: photo?.name ?? null,
    };
    if (await queueAndSend(step)) {
      setNote("");
      setPhoto(null);
      setPosition(null);
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

  async function verifyPassenger(event: FormEvent) {
    event.preventDefault();
    if (!trip || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const currentPosition = await readCurrentLocation();
      const response = await fetch("/api/driver/passenger/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin: tripPin, ...currentPosition }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ตรวจสอบ PIN ไม่สำเร็จ");
      setTripPin(""); setMessage("ยืนยันผู้โดยสารสำเร็จ สามารถเริ่มการเดินทางได้");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ตรวจสอบ PIN ไม่สำเร็จ");
      await load();
    } finally { setBusy(false); }
  }

  async function updateStop(action: "declare" | "clear") {
    if (stopBusy) return;
    setStopBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/driver/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action, reason: stopReason, note: stopNote }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "บันทึกการหยุดไม่สำเร็จ");
      setStopReason(""); setStopNote("");
      setMessage(action === "clear" ? "สิ้นสุดการหยุดแล้ว" : "บันทึกเหตุผลการหยุดแล้ว");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกการหยุดไม่สำเร็จ");
    } finally { setStopBusy(false); }
  }

  async function saveBankDetails() {
    if (bankBusy) return;
    setBankBusy(true); setError("");
    try {
      const response = await fetch("/api/driver/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, bankCode, accountNumber, accountName }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "บันทึกข้อมูลบัญชีไม่สำเร็จ");
      setMessage("บันทึกข้อมูลบัญชีสำหรับงานนี้แล้ว");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกข้อมูลบัญชีไม่สำเร็จ"); }
    finally { setBankBusy(false); }
  }

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#FF8A05] text-white">
        <LoaderCircle className="animate-spin" size={42} />
      </main>
    );
  if (!trip)
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-5 text-[#211726]">
        <div className="max-w-md rounded-[28px] bg-white p-8 text-center shadow-xl">
          <CircleAlert className="mx-auto text-[#D96F00]" size={44} />
          <h1 className="mt-5 text-2xl font-black">Driver link unavailable</h1>
          <p className="mt-3 text-slate-600">
            {error || "Ask Waydidi operations for a new driver link."}
          </p>
          <button
            onClick={load}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#FF8A05] px-6 font-bold text-white"
          >
            <RefreshCw size={18} /> Try again
          </button>
        </div>
      </main>
    );

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(["trip_started", "passenger_picked_up"].includes(trip.assignment.currentStatus) ? trip.booking.dropoff : trip.booking.pickup)}`;
  const completionEvent = trip.events.find(
    (event) => event.status === "completed",
  );
  const completionVerified = completionEvent?.verificationStatus === "verified";
  return (
    <main className="min-h-screen bg-[#f3f5f8] pb-32 text-[#211726]">
      <header className="bg-[#FF8A05] px-5 pb-8 pt-5 text-white">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-between">
            <a
              href="/"
              aria-label="Waydidi home"
              className="inline-flex text-white"
            >
              <WaydidiLogo className="h-12 w-auto" />
            </a>
            {!online && (
              <span className="inline-flex items-center gap-2 rounded-full bg-red-700 px-3 py-2 text-xs font-bold">
                <WifiOff size={15} /> Offline
              </span>
            )}
          </div>
          <div className="mt-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-white/75">
              Reference ID
            </p>
            <p className="mt-1 text-base font-black tracking-[.08em]">
              {trip.booking.reference}
            </p>
            <h1 className="mt-5 text-3xl font-black">
              สวัสดี {trip.driver.fullName}
            </h1>
            <p className="mt-2 text-white/85">
              ทำตามขั้นตอนด้านล่างและกดยืนยันทุกครั้ง
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
        <section className="rounded-[26px] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-[#D96F00]">
                {trip.booking.pickupDate} · {trip.booking.pickupTime}
              </span>
              <h2 className="mt-3 text-xl font-black">
                {trip.booking.customerName}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {trip.booking.vehicle} · {trip.booking.passengers} passengers ·{" "}
                {trip.booking.luggage} bags
              </p>
            </div>
            <a
              href={`tel:${trip.booking.customerPhone}`}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-[#211726] text-white"
              aria-label="Call passenger"
            >
              <Phone size={20} />
            </a>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 shrink-0 text-[#FF8A05]" size={19} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Pickup
                </p>
                <p className="mt-1 font-bold leading-5">
                  {trip.booking.pickup}
                </p>
              </div>
            </div>
            <div className="my-3 ml-[9px] h-5 border-l-2 border-dotted border-slate-300" />
            <div className="flex gap-3">
              <Route className="mt-0.5 shrink-0 text-[#FF8A05]" size={19} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Drop-off
                </p>
                <p className="mt-1 font-bold leading-5">
                  {trip.booking.dropoff}
                </p>
              </div>
            </div>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-orange-200 font-bold text-[#D96F00]"
          >
            <Navigation size={18} /> เปิด Google Maps <ExternalLink size={15} />
          </a>
          {["trip_started", "passenger_picked_up"].includes(trip.assignment.currentStatus) && (
            <div className={`mt-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${trackingState === "error" ? "bg-red-50 text-red-700" : trackingState === "queued" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
              <span className="flex items-center gap-2"><LocateFixed size={18}/>{trackingState === "error" ? "ต้องอนุญาตตำแหน่งสดตลอดการเดินทาง" : trackingState === "queued" ? "บันทึก GPS ไว้แล้ว รอส่งเมื่อออนไลน์" : trackingState === "sending" ? "กำลังส่งตำแหน่ง…" : "กำลังแชร์ตำแหน่งสดระหว่างเดินทาง"}</span>
              {trackingState === "error" && <button type="button" onClick={() => setTrackingRetry((value) => value + 1)} className="shrink-0 rounded-full bg-red-700 px-3 py-2 text-xs font-black text-white">อนุญาตตำแหน่ง</button>}
              {lastTrackedAt && <span className="text-xs opacity-70">{new Date(lastTrackedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          )}
          {["trip_started", "passenger_picked_up"].includes(trip.assignment.currentStatus) && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              {trip.activeStop ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-black">รายงานการหยุดแล้ว</p><p className="mt-1 text-sm text-slate-500">{({ rest_stop: "พักรถ", fuel: "เติมน้ำมัน", passenger_request: "ผู้โดยสารขอหยุด", traffic_police: "การจราจร / ตำรวจ", other: "อื่น ๆ" } as Record<string,string>)[trip.activeStop.reason] ?? trip.activeStop.reason}{trip.activeStop.note ? ` · ${trip.activeStop.note}` : ""}</p></div>
                  <button type="button" disabled={stopBusy} onClick={() => updateStop("clear")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black">เดินทางต่อ</button>
                </div>
              ) : (
                <div>
                  <p className="font-black">หยุดรถนานกว่าปกติ?</p>
                  <p className="mt-1 text-sm text-slate-500">แจ้งเหตุผลเพื่อให้ฝ่ายปฏิบัติการทราบว่าเป็นการหยุดที่ตั้งใจ</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select value={stopReason} onChange={(event) => setStopReason(event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 font-bold"><option value="">เลือกเหตุผล</option><option value="rest_stop">พักรถ</option><option value="fuel">เติมน้ำมัน</option><option value="passenger_request">ผู้โดยสารขอหยุด</option><option value="traffic_police">การจราจร / ตำรวจ</option><option value="other">อื่น ๆ</option></select>
                    <input value={stopNote} onChange={(event) => setStopNote(event.target.value)} maxLength={300} placeholder="หมายเหตุ (ถ้ามี)" className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3" />
                    <button type="button" disabled={stopBusy || !stopReason || (stopReason === "other" && stopNote.trim().length < 3)} onClick={() => updateStop("declare")} className="h-12 rounded-full bg-[#211726] px-5 font-black text-white disabled:opacity-40">แจ้งหยุด</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <section className="rounded-[26px] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Trip progress</h2>
          <div className="mt-5 space-y-0">
            {steps.map((step, index) => {
              const done = currentIndex > index;
              const active = currentIndex === index;
              const event = trip.events.find(
                (item) => item.status === step.status,
              );
              return (
                <div
                  key={step.status}
                  className="grid grid-cols-[38px_1fr] gap-3"
                >
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid size-9 place-items-center rounded-full border-2 ${done ? "border-[#FF8A05] bg-[#FF8A05] text-white" : active ? "border-[#FF8A05] bg-orange-50 text-[#D96F00]" : "border-slate-200 text-slate-300"}`}
                    >
                      {done ? <Check size={18} strokeWidth={3} /> : index + 1}
                    </span>
                    {index < steps.length - 1 && (
                      <span
                        className={`min-h-10 w-0.5 flex-1 ${done ? "bg-[#FF8A05]" : "bg-slate-200"}`}
                      />
                    )}
                  </div>
                  <div className="pb-7">
                    <p
                      className={`font-black ${active || done ? "text-[#211726]" : "text-slate-400"}`}
                    >
                      {step.thai}
                    </p>
                    <p className="text-sm text-slate-500">{step.english}</p>
                    {pending?.status === step.status && (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                        <WifiOff size={13} /> รอส่ง · Waiting to send
                      </span>
                    )}
                    {event && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">
                          {new Date(event.createdAt).toLocaleTimeString(
                            "th-TH",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Bangkok",
                            },
                          )}
                        </span>
                        {event.verificationStatus === "verified" && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                            Admin verified
                          </span>
                        )}
                        {event.verificationStatus === "rejected" && (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">
                            Needs review
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
        ) : next?.status === "passenger_verified" && !trip.assignment.passengerVerifiedAt ? (
          <form onSubmit={verifyPassenger} className="rounded-[26px] bg-white p-5 shadow-sm">
            <span className="inline-flex rounded-full bg-[#FFF0DE] px-3 py-1 text-xs font-black text-[#D96F00]">Passenger verification</span>
            <h2 className="mt-3 text-2xl font-black">ยืนยัน Trip PIN</h2>
            <p className="mt-2 leading-6 text-slate-600">ขอรหัส 4 หลักจากผู้โดยสารเมื่อพบกันที่จุดรับ ระบบจะบันทึกเวลาและตำแหน่งนี้</p>
            <input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={tripPin} onChange={(event) => setTripPin(event.target.value.replace(/\D/g, ""))} placeholder="0000" aria-label="4-digit Trip PIN" className="mt-5 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center text-3xl font-black tracking-[.35em] outline-none focus:border-[#FF8A05]" />
            <p className="mt-3 text-sm font-semibold text-slate-500">เหลือ {trip.assignment.passengerVerificationAttemptsRemaining} ครั้ง</p>
            {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
            {message && <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a href={`tel:${trip.booking.customerPhone}`} className="flex h-13 items-center justify-center gap-2 rounded-full border border-slate-200 font-bold"><Phone size={18}/> โทรหาผู้โดยสาร</a>
              <button disabled={busy || tripPin.length !== 4 || !online} className="flex h-13 items-center justify-center gap-2 rounded-full bg-[#FF8A05] font-black text-white disabled:opacity-45">{busy ? <LoaderCircle className="animate-spin" size={19}/> : <Check size={19}/>} ยืนยันผู้โดยสาร</button>
            </div>
          </form>
        ) : next ? (
          <form
            onSubmit={submit}
            className="rounded-[26px] bg-white p-5 shadow-sm"
          >
            <span className="inline-flex rounded-full bg-[#FFF0DE] px-3 py-1 text-xs font-black text-[#D96F00]">
              Next step
            </span>
            <h2 className="mt-3 text-2xl font-black">{next.thai}</h2>
            <p className="mt-2 leading-6 text-slate-600">{next.help}</p>
            {needsLocation && (
              <button
                type="button"
                onClick={captureLocation}
                disabled={locationBusy}
                className={`mt-5 flex min-h-14 w-full items-center justify-between rounded-2xl border px-4 text-left font-bold ${position ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50"}`}
              >
                <span className="flex items-center gap-3">
                  {locationBusy ? (
                    <LoaderCircle className="animate-spin" size={20} />
                  ) : position ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <LocateFixed className="text-[#D96F00]" size={20} />
                  )}
                  <span>
                    {locationBusy
                      ? "กำลังค้นหาตำแหน่ง…"
                      : position
                        ? `ตำแหน่งพร้อม · ±${Math.round(position.accuracy)} ม.`
                        : next?.status === "trip_started"
                          ? "อนุญาตตำแหน่งสดตลอดการเดินทาง"
                          : "แชร์ตำแหน่งปัจจุบัน"}
                  </span>
                </span>
                <ChevronRight size={19} />
              </button>
            )}
            {needsEvidence && (
              <label
                className={`mt-3 flex min-h-24 cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border border-dashed p-3 ${photo ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt="Evidence preview"
                    className="size-20 rounded-xl object-cover"
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-[#D96F00]">
                    <Camera size={24} />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block font-bold">
                    {photo ? photo.name : "ถ่ายรูปหรือเลือกรูป"}
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    JPG, PNG หรือ WebP · ไม่เกิน 8 MB
                  </span>
                </span>
                <Upload className="ml-auto shrink-0 text-slate-400" size={20} />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) =>
                    setPhoto(event.target.files?.[0] ?? null)
                  }
                />
              </label>
            )}
            <label className="mt-4 block text-sm font-bold">
              หมายเหตุ{" "}
              <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="รายละเอียดจุดรับหรือเหตุการณ์เพิ่มเติม"
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base outline-none focus:border-[#FF8A05]"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="mt-4 flex gap-2 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
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
                  busy ||
                  Boolean(needsEvidence && !photo) ||
                  Boolean(needsLocation && !position)
                }
                className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-6 text-base font-black text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={20} />
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
                <Clock3 size={18} className="shrink-0 text-[#D96F00]" />
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
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-[#D96F00]"><Camera size={22} /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{noShowPhoto ? noShowPhoto.name : "ถ่ายรูปจุดรับ / ป้ายชื่อ"}</span>
                    <span className="mt-1 block text-sm text-slate-500">JPG, PNG หรือ WebP · ไม่เกิน 8 MB</span>
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => setNoShowPhoto(event.target.files?.[0] ?? null)} />
                </label>
                <label className="block text-sm font-bold">
                  หมายเหตุ <span className="font-normal text-slate-400">(บังคับ)</span>
                  <textarea value={noShowNote} onChange={(event) => setNoShowNote(event.target.value)} maxLength={500} rows={3} required placeholder="เช่น โทร 3 ครั้งไม่รับสาย รอที่ประตู 3 พร้อมป้ายชื่อ" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base outline-none focus:border-[#FF8A05]" />
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
      {(trip.assignment.currentStatus === "completed" || trip.assignment.currentStatus === "no_show") && !trip.payoutDetails && (
        <div className="fixed inset-0 z-50 flex items-end bg-[#211726]/50" role="dialog" aria-modal="true" aria-labelledby="bank-details-title">
          <div className="bank-details-sheet max-h-[96vh] w-full overflow-y-auto rounded-t-[30px] bg-white px-5 pb-8 pt-6 shadow-2xl sm:mx-auto sm:max-w-xl sm:px-8">
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-200" />
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#D96F00]">Payment details</p>
            <h2 id="bank-details-title" className="mt-2 text-2xl font-black">กรอกบัญชีรับเงิน</h2>
            <p className="mt-2 leading-6 text-slate-600">กรุณากรอกข้อมูลบัญชีธนาคารสำหรับงาน {trip.booking.reference} ก่อนปิดงาน</p>
            <label className="mt-6 block text-sm font-black">ธนาคารไทย</label>
            <div className="mt-2 grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {THAI_BANKS.map((bank) => (
                <button key={bank.code} type="button" onClick={() => setBankCode(bank.code)} className={`flex items-center gap-2 rounded-xl border p-3 text-left transition ${bankCode === bank.code ? "border-[#FF8A05] bg-orange-50 ring-2 ring-orange-100" : "border-slate-200 bg-white"}`}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white" style={{ backgroundColor: bank.color }}>{bank.code.slice(0, 3)}</span>
                  <span className="min-w-0"><span className="block truncate text-xs font-black">{bank.thai}</span><span className="block truncate text-[11px] text-slate-500">{bank.name}</span></span>
                </button>
              ))}
            </div>
            <label className="mt-5 block text-sm font-black">เลขที่บัญชี<input required inputMode="numeric" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} placeholder="กรอกเลขที่บัญชี" className="mt-2 h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-[#FF8A05]" /></label>
            <label className="mt-4 block text-sm font-black">ชื่อบัญชี<input required value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="ชื่อเจ้าของบัญชี" className="mt-2 h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-[#FF8A05]" /></label>
            {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
            <button type="button" disabled={bankBusy || !bankCode || accountNumber.length < 8 || accountName.trim().length < 2 || !online} onClick={saveBankDetails} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] text-base font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-45">{bankBusy ? <LoaderCircle className="animate-spin" size={20} /> : <Check size={20} />} {bankBusy ? "กำลังบันทึก…" : "บันทึกข้อมูลและปิดงาน"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
