import { env } from "cloudflare:workers";
import { cancellationConfig, cancellationTiers, type CancellationConfig, type CancellationOption } from "./cancellation-options";
import { FULL_REFUND_HOURS, GENERAL_REFUND_TIERS, PARTIAL_REFUND_HOURS, PARTIAL_REFUND_PERCENT, REFUND_POLICY_VERSION, type RefundTier } from "./refund-policy";
export const ACCEPTED_CANCELLATION_POLICY={version:REFUND_POLICY_VERSION,timezone:"Asia/Bangkok",basis:"scheduled pickup minus cancellation request",tiers:GENERAL_REFUND_TIERS.map(t=>({...t,minHours:Number.isFinite(t.minHours)?t.minHours:null})),terms:`More than ${FULL_REFUND_HOURS} hours: full refund. Exactly ${FULL_REFUND_HOURS} hours through ${PARTIAL_REFUND_HOURS} hours: ${PARTIAL_REFUND_PERCENT}% refund. Less than ${PARTIAL_REFUND_HOURS} hours: no refund. Waydidi cancellation: full refund. No-show: no refund.`};
export async function saveAcceptedPolicy(reference:string,acceptedAt:string, option:CancellationOption="standard", config:CancellationConfig=cancellationConfig({})) {
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS booking_policy_snapshots (booking_reference TEXT PRIMARY KEY NOT NULL REFERENCES bookings(reference), version TEXT NOT NULL, policy_json TEXT NOT NULL, accepted_at TEXT NOT NULL)").run();
 const snapshot = option === "standard" ? (config.enabled ? {...ACCEPTED_CANCELLATION_POLICY,option} : ACCEPTED_CANCELLATION_POLICY) : { ...ACCEPTED_CANCELLATION_POLICY, option, terms: option === "flexible" ? `Full refund at least ${config.fullRefundHours} hours before pickup; none after.` : "No refund on customer cancellation.", tiers: cancellationTiers(option,config).map(t=>({...t,minHours:Number.isFinite(t.minHours)?t.minHours:null})) };
 await env.DB.prepare("INSERT INTO booking_policy_snapshots(booking_reference,version,policy_json,accepted_at) VALUES(?,?,?,?)").bind(reference,REFUND_POLICY_VERSION,JSON.stringify(snapshot),acceptedAt).run();
}
export async function acceptedPolicy(reference:string) {
 const row=await env.DB.prepare("SELECT version,policy_json FROM booking_policy_snapshots WHERE booking_reference=?").bind(reference).first() as {version:string;policy_json:string}|null;
 if(!row) return null;
 const data=JSON.parse(row.policy_json) as typeof ACCEPTED_CANCELLATION_POLICY & {option?:CancellationOption};
 if(data.version!==row.version||data.tiers.length!==3) throw new Error("INVALID_POLICY_SNAPSHOT");
 return {version:row.version,option:data.option??"standard",purchased:data.option!==undefined,terms:data.terms,tiers:data.tiers.map(t=>({...t,minHours:t.minHours??-Infinity})) as RefundTier[]};
}
