import { NextResponse } from "next/server";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { evidenceDb, evidencePolicy, safeEvidence, type EvidenceRow } from "@/lib/trip-evidence";
import { captureAllowed, validEvidenceGps } from "@/lib/evidence-rules";
import { sameOrigin } from "@/lib/security";
import { putFile, deleteFile } from "@/lib/file-store";
import { sanitizeEvidence, stampEvidence, MAX_EVIDENCE_BYTES } from "@/lib/evidence-image";
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });
type Context = {params:Promise<{token:string}>};
export async function GET(_request: Request, context: Context) {
  const assignment = await activeAssignmentForToken((await context.params).token);
  if (!assignment) return fail("Driver link expired or revoked.",401);
  const {results} = await evidenceDb().prepare("SELECT * FROM driver_trip_evidence WHERE assignment_id=? AND deleted_at IS NULL AND expires_at>? ORDER BY received_at DESC LIMIT 30").bind(assignment.id,new Date().toISOString()).all<EvidenceRow>();
  return NextResponse.json({ evidence: results.map(safeEvidence), policy: await evidencePolicy() },{headers});
}
export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return fail("Request blocked.",403);
  const assignment = await activeAssignmentForToken((await context.params).token);
  if (!assignment) return fail("Driver link expired or revoked.",401);
  // Count attempted uploads atomically, including invalid files. Per-assignment lifetime cap below.
  const db = evidenceDb(), now = new Date().toISOString();
  const windowStart = new Date(Math.floor(Date.now()/600000)*600000).toISOString();
  const limit = await db.prepare(`INSERT INTO driver_evidence_upload_limits VALUES(?,?,1) ON CONFLICT(assignment_id) DO UPDATE SET window_start=excluded.window_start, attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END WHERE window_start<>excluded.window_start OR attempts<12`).bind(assignment.id,windowStart).run();
  if (!limit.meta.changes) return fail("Too many uploads. Wait ten minutes.",429);
  // Bound the stream before multipart parsing, even when Content-Length is absent.
  const reader = request.body?.getReader();
  if (!reader) return fail("Missing photo.");
  const chunks: Uint8Array[] = []; let length=0;
  while (true) { const part=await reader.read(); if(part.done) break; length+=part.value.length; if(length>MAX_EVIDENCE_BYTES+20000) {await reader.cancel();return fail("Photo too large.",413);} chunks.push(part.value); }
  const raw=new Uint8Array(length); let offset=0; for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  const form = await new Response(raw,{headers:{"Content-Type":request.headers.get("content-type")??""}}).formData().catch(()=>null);
  if (!form) return fail("Invalid upload.");
  const id=String(form.get("id")??""), type=String(form.get("eventType")??"");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) || !["pickup","dropoff"].includes(type)) return fail("Invalid evidence request.");
  const previous=await db.prepare("SELECT * FROM driver_trip_evidence WHERE id=? AND assignment_id=?").bind(id,assignment.id).first<EvidenceRow>();
  if(previous) return previous.event_type===type && !previous.deleted_at && previous.expires_at>now ? NextResponse.json({evidence:safeEvidence(previous)},{headers}) : fail("Evidence expired or request changed.",409);
  if (!captureAllowed(type as "pickup"|"dropoff",assignment.currentStatus)) return fail("Refresh the trip; this photo is not available at the current step.",409);
  const total=await db.prepare("SELECT COUNT(*) AS n FROM driver_trip_evidence WHERE assignment_id=?").bind(assignment.id).first<{n:number}>();
  if ((total?.n??0)>=30) return fail("Photo limit reached. Contact operations.",429);
  const deviceTime=String(form.get("deviceCapturedAt")??"");
  if(!Number.isFinite(Date.parse(deviceTime)) || Math.abs(Date.now()-Date.parse(deviceTime))>6*3600000) return fail("Capture a new photo; device time is outside the six-hour limit.");
  const numeric=(name:string)=>{const value=form.get(name);return value===null?null:typeof value==="string"&&value.trim()!==""?Number(value):NaN;};
  const lat=numeric("latitude"), lng=numeric("longitude"), accuracy=numeric("accuracy");
  if ((lat!==null||lng!==null||accuracy!==null)&&!validEvidenceGps(lat,lng,accuracy)) return fail("Invalid GPS data. Retry location or continue without location.");
  const file=form.get("photo");
  if(!(file instanceof File)||file.type!=="image/jpeg") return fail("Capture a JPEG photo.");
  let image;
  try { image=sanitizeEvidence(new Uint8Array(await file.arrayBuffer())); } catch {return fail("Photo could not be decoded. Retake it (maximum 1600 pixels / 2 MB).");}
  const policy=await evidencePolicy();
  // Random keys per attempt prevent a losing concurrent retry from deleting the winner's objects.
  const prefix=`driver-private-evidence/${assignment.id}/${crypto.randomUUID()}`;
  const originalKey=prefix+".jpg", stampedKey=prefix+".svg";
  const stamped=stampEvidence(image,{reference:assignment.bookingReference,leg:assignment.leg,type,receivedAt:now,deviceCapturedAt:deviceTime,latitude:lat,longitude:lng,accuracy});
  try {
    await putFile(originalKey,image.original,"image/jpeg"); await putFile(stampedKey,stamped,"image/svg+xml");
    const saved=await db.prepare(`INSERT OR IGNORE INTO driver_trip_evidence (id,assignment_id,booking_reference,leg,driver_id,event_type,device_captured_at,received_at,latitude,longitude,accuracy_metres,original_key,stamped_key,file_bytes,expires_at)
      SELECT ?,id,booking_reference,leg,driver_id,?,?,?,?,?,?,?,?,?,? FROM booking_assignments a WHERE id=? AND revoked_at IS NULL AND token_expires_at>? AND current_status=? AND EXISTS(SELECT 1 FROM bookings b WHERE b.reference=a.booking_reference AND b.status='confirmed') AND (SELECT COUNT(*) FROM driver_trip_evidence WHERE assignment_id=a.id)<30`).bind(id,type,deviceTime,now,lat,lng,accuracy,originalKey,stampedKey,image.original.length,new Date(Date.now()+policy.retention_days*86400000).toISOString(),assignment.id,now,assignment.currentStatus).run();
    if(!saved.meta.changes){await deleteFile(originalKey);await deleteFile(stampedKey);}
    const row=await db.prepare("SELECT * FROM driver_trip_evidence WHERE id=? AND assignment_id=?").bind(id,assignment.id).first<EvidenceRow>();
    if(!row) return fail("The assignment changed. Refresh and retry.",409);
    return NextResponse.json({evidence:safeEvidence(row)},{headers});
  } catch {
    await Promise.allSettled([deleteFile(originalKey),deleteFile(stampedKey)]);
    return fail("Upload could not be saved. Retry the same photo.",503);
  }
}
