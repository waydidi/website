import { env } from "cloudflare:workers";
import { GENERAL_REFUND_TIERS, REFUND_POLICY_VERSION, type RefundTier } from "./refund-policy";
export const ACCEPTED_CANCELLATION_POLICY={version:REFUND_POLICY_VERSION,timezone:"Asia/Bangkok",basis:"scheduled pickup minus cancellation request",tiers:GENERAL_REFUND_TIERS.map(t=>({...t,minHours:Number.isFinite(t.minHours)?t.minHours:null})),terms:"More than 48 hours: full refund. Exactly 48 hours through 24 hours: 50% refund. Less than 24 hours: no refund. Waydidi cancellation: full refund. No-show: no refund."};
export async function saveAcceptedPolicy(reference:string,acceptedAt:string) {
 await env.DB.prepare("INSERT INTO booking_policy_snapshots(booking_reference,version,policy_json,accepted_at) VALUES(?,?,?,?)").bind(reference,REFUND_POLICY_VERSION,JSON.stringify(ACCEPTED_CANCELLATION_POLICY),acceptedAt).run();
}
export async function acceptedPolicy(reference:string) {
 const row=await env.DB.prepare("SELECT version,policy_json FROM booking_policy_snapshots WHERE booking_reference=?").bind(reference).first() as {version:string;policy_json:string}|null;
 if(!row) return null;
 const data=JSON.parse(row.policy_json) as typeof ACCEPTED_CANCELLATION_POLICY;
 if(data.version!==row.version||data.tiers.length!==3) throw new Error("INVALID_POLICY_SNAPSHOT");
 return {version:row.version,tiers:data.tiers.map(t=>({...t,minHours:t.minHours??-Infinity})) as RefundTier[]};
}
