import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { evidenceDb,evidencePolicy,safeEvidence,type EvidenceRow } from "@/lib/trip-evidence";
import { sameOrigin } from "@/lib/security";
import { z } from "zod";
const policySchema=z.object({pickup_required:z.number().int().min(0).max(1),dropoff_required:z.number().int().min(0).max(1),gps_required:z.number().int().min(0).max(1),gps_timeout_ms:z.number().int().min(5000).max(60000),max_accuracy_m:z.number().int().min(10).max(2000),retention_days:z.number().int().min(1).max(90)});
export async function GET(request:Request) {
 const admin=await getWaydidiAdmin(); if(!admin||!["owner","operations"].includes(admin.role)) return NextResponse.json({error:"Unauthorized"},{status:403});
 const reference=new URL(request.url).searchParams.get("reference")??"";
 const db=evidenceDb();
 const {results}=await db.prepare("SELECT e.*, d.full_name AS driver_name, s.status AS step FROM driver_trip_evidence e JOIN drivers d ON d.id=e.driver_id LEFT JOIN driver_status_events s ON s.id=e.status_event_id WHERE e.booking_reference=? ORDER BY e.received_at DESC LIMIT 120").bind(reference).all<EvidenceRow>();
 const assignments=await db.prepare("SELECT id,leg,current_status FROM booking_assignments WHERE booking_reference=? AND revoked_at IS NULL").bind(reference).all();
 const overrides=await db.prepare("SELECT o.* FROM driver_evidence_overrides o JOIN booking_assignments a ON a.id=o.assignment_id WHERE a.booking_reference=?").bind(reference).all();
 return NextResponse.json({evidence:results.map(safeEvidence),policy:await evidencePolicy(),assignments:assignments.results,overrides:overrides.results,canSetPolicy:admin.role==="owner"},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request) {
 if(!sameOrigin(request)) return NextResponse.json({error:"Blocked"},{status:403});
 const admin=await getWaydidiAdmin();if(!admin||!["owner","operations"].includes(admin.role)) return NextResponse.json({error:"Unauthorized"},{status:403});
 const body=await request.json().catch(()=>null), db=evidenceDb(), now=new Date().toISOString();
 if(body?.action==="policy") {
  if(admin.role!=="owner")return NextResponse.json({error:"Owner role required"},{status:403});
  const parsed=policySchema.safeParse(body.policy); if(!parsed.success)return NextResponse.json({error:"Invalid policy"},{status:400});
  const p=parsed.data;
  await db.prepare("UPDATE driver_evidence_policy SET pickup_required=?,dropoff_required=?,gps_required=?,gps_timeout_ms=?,max_accuracy_m=?,retention_days=?,updated_by=?,updated_at=? WHERE id=1").bind(p.pickup_required,p.dropoff_required,p.gps_required,p.gps_timeout_ms,p.max_accuracy_m,p.retention_days,admin.id,now).run();
 } else {
  const parsed=z.object({assignmentId:z.string().max(100),eventType:z.enum(["pickup","dropoff"]),reason:z.string().trim().min(10).max(500)}).safeParse(body);
  if(!parsed.success)return NextResponse.json({error:"Choose a leg and enter a reason (10–500 characters)."},{status:400});
  const p=parsed.data;
  const result=await db.prepare("INSERT OR IGNORE INTO driver_evidence_overrides SELECT id,?,?,?,? FROM booking_assignments WHERE id=? AND revoked_at IS NULL AND current_status NOT IN ('completed','no_show')").bind(p.eventType,p.reason,admin.id,now,p.assignmentId).run();
  if(!result.meta.changes)return NextResponse.json({error:"Override already exists or assignment is inactive."},{status:409});
 }
 return NextResponse.json({ok:true});
}
