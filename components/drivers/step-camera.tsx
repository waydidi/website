"use client";

import { Camera, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { driverHeaders } from "@/lib/driver-token";
import { freshEvidenceGps, type EvidencePolicy, type EvidenceType } from "@/lib/evidence-rules";

// The camera a driver uses to confirm Stand by, Pick up and Drop: it opens straight into the phone's
// rear camera (no photo library), the driver takes the photo, checks it, and it is uploaded as the
// step's evidence. If the browser can't show a live camera, the phone's own camera app is opened.

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
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  function keep(blob: Blob) { setPhoto({ blob, url: URL.createObjectURL(blob), at: new Date().toISOString() }); }
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
      // Location is only attached when the photo policy asks for it.
      let gps: Gps | null = null;
      if (policy.gps_required && navigator.geolocation) {
        gps = await new Promise<Gps | null>((resolve) => navigator.geolocation.getCurrentPosition(
          (p) => resolve(freshEvidenceGps(p.timestamp) ? { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy } : null),
          () => resolve(null), { enableHighAccuracy: true, maximumAge: 0, timeout: policy.gps_timeout_ms }));
      }
      const form = new FormData();
      form.set("id", crypto.randomUUID()); form.set("eventType", type); form.set("deviceCapturedAt", photo.at);
      form.set("photo", photo.blob, "capture.jpg");
      if (gps) { form.set("latitude", String(gps.latitude)); form.set("longitude", String(gps.longitude)); form.set("accuracy", String(gps.accuracy)); }
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
              <button type="button" onClick={() => input.current?.click()} className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-black text-plum"><Camera size={20} />เปิดกล้อง</button></div>
              : <LoaderCircle className="animate-spin" size={36} aria-label="กำลังเปิดกล้อง" />}
          </div>}
      {/* The phone's own camera app (capture=environment opens the camera, not the photo library). */}
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void fromCameraApp(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
    {error && <p role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-semibold">{error}</p>}
    <div className="flex items-center justify-center gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
      {photo ? <>
        <button type="button" onClick={retake} disabled={busy} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-white/40 font-black disabled:opacity-50"><RotateCcw size={18} />ถ่ายใหม่</button>
        <button type="button" onClick={() => void use()} disabled={busy} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-brand font-black text-white disabled:opacity-60">{busy && <LoaderCircle className="animate-spin" size={18} />}{busy ? "กำลังบันทึก…" : "ใช้รูปนี้"}</button>
      </> : <button type="button" onClick={() => void shoot()} disabled={!live} aria-label="ถ่ายรูป" className="grid size-[74px] place-items-center rounded-full border-4 border-white disabled:opacity-40"><span className="size-[58px] rounded-full bg-white" /></button>}
    </div>
  </Modal>;
}
