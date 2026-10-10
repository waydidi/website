"use client";

import { Camera, LoaderCircle, MapPin, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { driverHeaders } from "@/lib/driver-token";
import type { EvidencePolicy, EvidenceType } from "@/lib/evidence-rules";

// Waydidi's GPS camera, used to confirm Stand by, Pick up and Drop. Before the camera opens the driver
// allows two things, one after the other, each from its own card and button (like Google's "use your
// location" prompt): 1) location, 2) the camera. A permission already given is skipped. Then the
// rear camera opens (no photo library), the driver takes the photo, checks it, and it is uploaded as
// the step's evidence with where it was taken (the server stamps the photo with the place and time).
// If the browser can't show a live camera, the phone's own camera app is opened.

type Gps = { latitude: number; longitude: number; accuracy: number };
type Stage = "checking" | "location" | "camera" | "ready";

async function toJpeg(source: HTMLVideoElement | HTMLImageElement, width: number, height: number) {
  if (!width || !height) throw new Error("กล้องยังไม่พร้อม ลองอีกครั้ง");
  const ratio = Math.min(1, 1280 / Math.max(width, height)), canvas = document.createElement("canvas");
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("เตรียมรูปไม่สำเร็จ"))), "image/jpeg", 0.82));
}

/** Whether a permission was already given (browsers that can't say are treated as "ask"). */
async function alreadyGranted(name: "geolocation" | "camera") {
  try { return (await navigator.permissions.query({ name: name as PermissionName })).state === "granted"; } catch { return false; }
}

const fix = (p: GeolocationPosition): Gps => ({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy });

/** One permission card: icon, step, what is asked and why, and the button that asks the phone. */
function PermissionCard({ icon, step, title, text, action, busy, denied, onAllow, onCancel }: {
  icon: React.ReactNode; step: string; title: string; text: string; action: string; busy: boolean; denied: string; onAllow: () => void; onCancel: () => void;
}) {
  return <div className="grid size-full place-items-center p-6">
    <div className="w-full max-w-sm rounded-[24px] bg-white p-6 text-center text-plum shadow-2xl">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-orange-50 text-brand-text">{icon}</span>
      <p className="mt-4 text-[12px] font-bold uppercase tracking-[.14em] text-slate-400">{step}</p>
      <h3 className="mt-1 text-[19px] font-black leading-snug">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-6 text-slate-600">{text}</p>
      {denied && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-left text-[13.5px] font-semibold leading-5 text-amber-900">{denied}</p>}
      <button type="button" onClick={onAllow} disabled={busy} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-black text-white disabled:opacity-60">{busy && <LoaderCircle className="animate-spin" size={18} />}{denied ? "ลองอีกครั้ง" : action}</button>
      <button type="button" onClick={onCancel} className="mt-2 h-11 w-full rounded-full font-bold text-slate-500">ไม่ใช่ตอนนี้</button>
    </div>
  </div>;
}

// Mounted only while open, so each opening starts fresh.
export function StepCamera({ title, type, policy, onCancel, onSaved }: {
  title: string;
  type: EvidenceType;
  policy: EvidencePolicy;
  onCancel: () => void;
  /** Called with the saved photo's id once it is uploaded. */
  onSaved: (evidenceId: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("checking");
  const [asking, setAsking] = useState(false);
  const [denied, setDenied] = useState("");
  const [live, setLive] = useState(false);
  const [noLive, setNoLive] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; at: string; gps: Gps | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gps, setGps] = useState<Gps | null>(null);

  // Skip the cards for permissions the driver has already given.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [location, camera] = await Promise.all([alreadyGranted("geolocation"), alreadyGranted("camera")]);
      if (!cancelled) setStage(!location ? "location" : !camera ? "camera" : "ready");
    })();
    return () => { cancelled = true; };
  }, []);

  // After location is allowed: follow the position while the camera is open.
  useEffect(() => {
    if (stage === "checking" || stage === "location" || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition((p) => setGps(fix(p)), () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: policy.gps_timeout_ms });
    return () => navigator.geolocation.clearWatch(watch);
  }, [stage, policy.gps_timeout_ms]);

  // Step 1: location (the phone shows its own "allow location" question).
  function allowLocation() {
    if (!navigator.geolocation) { setDenied("โทรศัพท์นี้ไม่รองรับตำแหน่ง GPS"); return; }
    setAsking(true); setDenied("");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps(fix(p)); setAsking(false); void alreadyGranted("camera").then((ok) => setStage(ok ? "ready" : "camera")); },
      (e) => { setAsking(false); setDenied(e.code === e.PERMISSION_DENIED
        ? "ตำแหน่งถูกปิดไว้ เปิดสิทธิ์ตำแหน่งให้ waydidi.com ในการตั้งค่าโทรศัพท์ (การตั้งค่า › เบราว์เซอร์ › ตำแหน่ง) แล้วกดลองอีกครั้ง"
        : "หาตำแหน่ง GPS ไม่ได้ ออกไปที่โล่งแล้วกดลองอีกครั้ง"); },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: policy.gps_timeout_ms });
  }

  // Step 2: the camera (the phone shows its own "allow camera" question).
  async function allowCamera() {
    setDenied("");
    if (!navigator.mediaDevices?.getUserMedia) { setNoLive(true); setStage("ready"); return; }
    setAsking(true);
    try {
      const test = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      test.getTracks().forEach((t) => t.stop());
      setStage("ready");
    } catch {
      setDenied("กล้องถูกปิดไว้ เปิดสิทธิ์กล้องให้ waydidi.com ในการตั้งค่าโทรศัพท์ (การตั้งค่า › เบราว์เซอร์ › กล้อง) แล้วกดลองอีกครั้ง");
    } finally { setAsking(false); }
  }

  // Live camera once both are allowed and no photo is being checked.
  useEffect(() => {
    if (stage !== "ready" || photo) return;
    let cancelled = false;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setNoLive(true); return; }
      try {
        const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) { next.getTracks().forEach((t) => t.stop()); return; }
        stream.current = next; setNoLive(false); setLive(true);
      } catch { if (!cancelled) setNoLive(true); }
    })();
    return () => { cancelled = true; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setLive(false); };
  }, [stage, photo]);
  useEffect(() => { if (live && video.current) video.current.srcObject = stream.current; }, [live]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  function keep(blob: Blob) { setPhoto({ blob, url: URL.createObjectURL(blob), at: new Date().toISOString(), gps }); }
  async function shoot() {
    if (!video.current) return;
    try { keep(await toJpeg(video.current, video.current.videoWidth, video.current.videoHeight)); } catch (e) { setError((e as Error).message); }
  }
  async function fromCameraApp(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); keep(await toJpeg(img, img.naturalWidth, img.naturalHeight)); }
    catch { setError("เปิดรูปนี้ไม่ได้ ลองถ่ายใหม่"); }
    finally { URL.revokeObjectURL(url); }
  }
  function retake() { setPhoto(null); setError(""); }

  async function use() {
    if (!photo || busy) return;
    setBusy(true); setError("");
    try {
      const where = photo.gps ?? gps;
      if (!where) throw new Error("ยังไม่ได้ตำแหน่ง GPS รอสักครู่แล้วลองอีกครั้ง");
      const form = new FormData();
      form.set("id", crypto.randomUUID()); form.set("eventType", type); form.set("deviceCapturedAt", photo.at);
      form.set("photo", photo.blob, "capture.jpg");
      form.set("latitude", String(where.latitude)); form.set("longitude", String(where.longitude)); form.set("accuracy", String(Math.round(where.accuracy)));
      const response = await fetch("/api/driver/trips/session/evidence", { method: "POST", headers: driverHeaders(), body: form });
      const result = await response.json().catch(() => ({})) as { evidence?: { id: string }; error?: string };
      if (!response.ok || !result.evidence) throw new Error(result.error ?? "อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง");
      onSaved(result.evidence.id);
    } catch (e) { setError(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  const shown = photo?.gps ?? gps;
  return <Modal open onClose={onCancel} locked={busy} overlayClassName="bg-black p-0" className="flex h-dvh max-w-none flex-col bg-black text-white">
    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <ModalTitle className="text-lg font-black">{title}</ModalTitle>
      <button type="button" onClick={onCancel} disabled={busy} aria-label="ปิดกล้อง" className="grid size-10 place-items-center rounded-full bg-white/15"><X size={22} /></button>
    </div>
    {stage === "checking" ? <div className="grid flex-1 place-items-center"><LoaderCircle className="animate-spin" size={32} aria-label="กำลังเตรียมกล้อง" /></div>
    : stage === "location" ? <div className="flex-1"><PermissionCard icon={<MapPin size={26} />} step="ขั้นตอน 1 จาก 2" title="อนุญาตให้ Waydidi ใช้ตำแหน่งของคุณ"
        text="กล้อง GPS ของ Waydidi บันทึกตำแหน่งและเวลาที่ถ่ายรูป เพื่อยืนยันว่าคุณอยู่ที่จุดรับส่งจริง" action="อนุญาตตำแหน่ง"
        busy={asking} denied={denied} onAllow={allowLocation} onCancel={onCancel} /></div>
    : stage === "camera" ? <div className="flex-1"><PermissionCard icon={<Camera size={26} />} step="ขั้นตอน 2 จาก 2" title="อนุญาตให้ Waydidi ใช้กล้อง"
        text="ใช้กล้องหลังเพื่อถ่ายรูปยืนยันงาน รูปจะส่งให้ฝ่ายปฏิบัติการของ Waydidi เท่านั้น" action="อนุญาตกล้อง"
        busy={asking} denied={denied} onAllow={() => void allowCamera()} onCancel={onCancel} /></div>
    : <>
      <div className="relative flex-1 overflow-hidden">
        {photo
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken
          ? <img src={photo.url} alt="รูปที่ถ่าย" className="size-full object-contain" />
          : live ? <video ref={video} autoPlay playsInline muted className="size-full object-cover" />
          : <div className="grid size-full place-items-center p-8 text-center">
              {noLive ? <div><p className="text-white/85">เปิดกล้องในหน้านี้ไม่ได้ ใช้กล้องของโทรศัพท์แทน</p>
                <button type="button" disabled={!gps} onClick={() => input.current?.click()} className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-black text-plum disabled:opacity-50"><Camera size={20} />เปิดกล้อง</button></div>
                : <LoaderCircle className="animate-spin" size={36} aria-label="กำลังเปิดกล้อง" />}
            </div>}
        {/* The phone's own camera app (capture=environment opens the camera, not the photo library). */}
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void fromCameraApp(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {/* GPS camera line: where, as stamped on the saved photo */}
      <p className="flex items-center justify-center gap-2 bg-black/80 px-4 py-2 text-center text-[12.5px] font-semibold text-white/90" aria-live="polite">
        <MapPin size={14} aria-hidden="true" />
        {shown ? `Waydidi GPS · ${shown.latitude.toFixed(5)}, ${shown.longitude.toFixed(5)} · ±${Math.round(shown.accuracy)} ม.` : "กำลังหาตำแหน่ง GPS…"}
      </p>
      {error && <p role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-semibold">{error}</p>}
      <div className="flex items-center justify-center gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {photo ? <>
          <button type="button" onClick={retake} disabled={busy} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-white/40 font-black disabled:opacity-50"><RotateCcw size={18} />ถ่ายใหม่</button>
          <button type="button" onClick={() => void use()} disabled={busy} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-brand font-black text-white disabled:opacity-60">{busy && <LoaderCircle className="animate-spin" size={18} />}{busy ? "กำลังบันทึก…" : "ใช้รูปนี้"}</button>
        </> : <button type="button" onClick={() => void shoot()} disabled={!live || !gps} aria-label="ถ่ายรูป" className="grid size-[74px] place-items-center rounded-full border-4 border-white disabled:opacity-40"><span className="size-[58px] rounded-full bg-white" /></button>}
      </div>
    </>}
  </Modal>;
}
