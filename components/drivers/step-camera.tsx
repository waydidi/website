"use client";

import { Camera, LoaderCircle, MapPin, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { driverHeaders } from "@/lib/driver-token";
import type { EvidencePolicy, EvidenceType } from "@/lib/evidence-rules";

// Waydidi's GPS camera, used to confirm Stand by, Pick up and Drop: it opens straight into the phone's
// rear camera (no photo library), the driver takes the photo, checks it, and it is uploaded as the
// step's evidence with where it was taken (the server stamps the photo with the place and time).
// Location must be allowed to take the photo. If the browser can't show a live camera, the phone's
// own camera app is opened.

type Gps = { latitude: number; longitude: number; accuracy: number };

async function toJpeg(source: HTMLVideoElement | HTMLImageElement, width: number, height: number) {
  if (!width || !height) throw new Error("กล้องยังไม่พร้อม ลองอีกครั้ง");
  const ratio = Math.min(1, 1280 / Math.max(width, height)), canvas = document.createElement("canvas");
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("เตรียมรูปไม่สำเร็จ"))), "image/jpeg", 0.82));
}

// Mounted only while open, so each opening starts with the live camera and no old photo.
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
  const [live, setLive] = useState(false);
  const [noLive, setNoLive] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; at: string; gps: Gps | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Location for the photo: followed while the camera is open; the shutter waits for it.
  const [gps, setGps] = useState<Gps | null>(null);
  const [gpsState, setGpsState] = useState<"asking" | "ok" | "denied" | "unavailable">("asking");
  const [gpsTry, setGpsTry] = useState(0);
  useEffect(() => {
    if (!navigator.geolocation) { queueMicrotask(() => setGpsState("unavailable")); return; }
    const watch = navigator.geolocation.watchPosition(
      (p) => { setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }); setGpsState("ok"); },
      (e) => setGpsState(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: policy.gps_timeout_ms });
    return () => navigator.geolocation.clearWatch(watch);
  }, [gpsTry, policy.gps_timeout_ms]);

  // Live camera while no photo is being checked; released when a photo is taken or the sheet closes.
  useEffect(() => {
    if (photo) return;
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
  }, [photo]);
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
      const form = new FormData();
      form.set("id", crypto.randomUUID()); form.set("eventType", type); form.set("deviceCapturedAt", photo.at);
      form.set("photo", photo.blob, "capture.jpg");
      const where = photo.gps ?? gps;
      if (!where) throw new Error("ยังไม่ได้ตำแหน่ง GPS รอสักครู่แล้วลองอีกครั้ง");
      form.set("latitude", String(where.latitude)); form.set("longitude", String(where.longitude)); form.set("accuracy", String(Math.round(where.accuracy)));
      const response = await fetch("/api/driver/trips/session/evidence", { method: "POST", headers: driverHeaders(), body: form });
      const result = await response.json().catch(() => ({})) as { evidence?: { id: string }; error?: string };
      if (!response.ok || !result.evidence) throw new Error(result.error ?? "อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง");
      onSaved(result.evidence.id);
    } catch (e) { setError(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  return <Modal open onClose={onCancel} locked={busy} overlayClassName="bg-black p-0" className="flex h-dvh max-w-none flex-col bg-black text-white">
    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <ModalTitle className="text-lg font-black">{title}</ModalTitle>
      <button type="button" onClick={onCancel} disabled={busy} aria-label="ปิดกล้อง" className="grid size-10 place-items-center rounded-full bg-white/15"><X size={22} /></button>
    </div>
    <div className="relative flex-1 overflow-hidden">
      {photo
        // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken
        ? <img src={photo.url} alt="รูปที่ถ่าย" className="size-full object-contain" />
        : live ? <video ref={video} autoPlay playsInline muted className="size-full object-cover" />
        : <div className="grid size-full place-items-center p-8 text-center">
            {noLive ? <div><p className="text-white/85">เปิดกล้องในหน้านี้ไม่ได้ ใช้กล้องของโทรศัพท์แทน</p>
              <button type="button" disabled={!gps} onClick={() => input.current?.click()} className="mt-5 disabled:opacity-50 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-black text-plum"><Camera size={20} />เปิดกล้อง</button></div>
              : <LoaderCircle className="animate-spin" size={36} aria-label="กำลังเปิดกล้อง" />}
          </div>}
      {/* The phone's own camera app (capture=environment opens the camera, not the photo library). */}
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void fromCameraApp(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
    {/* GPS camera line: where and when, as stamped on the saved photo */}
    <p className="flex items-center justify-center gap-2 bg-black/80 px-4 py-2 text-center text-[12.5px] font-semibold text-white/90" aria-live="polite">
      <MapPin size={14} aria-hidden="true" />
      {(photo?.gps ?? gps) ? `Waydidi GPS · ${(photo?.gps ?? gps)!.latitude.toFixed(5)}, ${(photo?.gps ?? gps)!.longitude.toFixed(5)} · ±${Math.round((photo?.gps ?? gps)!.accuracy)} ม.` : gpsState === "asking" ? "กำลังหาตำแหน่ง GPS…" : "ยังไม่ได้ตำแหน่ง GPS"}
    </p>
    {(gpsState === "denied" || gpsState === "unavailable") && !gps && <div role="alert" className="bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-black">
      {gpsState === "denied" ? "ต้องอนุญาตตำแหน่งเพื่อใช้กล้อง GPS ของ Waydidi เปิดสิทธิ์ตำแหน่งให้ waydidi.com ในการตั้งค่าโทรศัพท์ แล้วกดลองอีกครั้ง" : "หาตำแหน่ง GPS ไม่ได้ ออกไปที่โล่งแล้วกดลองอีกครั้ง"}
      <button type="button" onClick={() => { setGpsState("asking"); setGpsTry((n) => n + 1); }} className="ml-2 rounded-full bg-black px-3 py-1 text-white">ลองอีกครั้ง</button>
    </div>}
    {error && <p role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-semibold">{error}</p>}
    <div className="flex items-center justify-center gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
      {photo ? <>
        <button type="button" onClick={retake} disabled={busy} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-white/40 font-black disabled:opacity-50"><RotateCcw size={18} />ถ่ายใหม่</button>
        <button type="button" onClick={() => void use()} disabled={busy} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-brand font-black text-white disabled:opacity-60">{busy && <LoaderCircle className="animate-spin" size={18} />}{busy ? "กำลังบันทึก…" : "ใช้รูปนี้"}</button>
      </> : <button type="button" onClick={() => void shoot()} disabled={!live || !gps} aria-label="ถ่ายรูป" className="grid size-[74px] place-items-center rounded-full border-4 border-white disabled:opacity-40"><span className="size-[58px] rounded-full bg-white" /></button>}
    </div>
  </Modal>;
}
