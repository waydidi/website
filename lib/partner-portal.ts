import { env } from "cloudflare:workers";
import { z } from "zod";
import type { Agency } from "./agency";
import { toSatang } from "./money";
import type { SecurityDatabase } from "./worker-db";
import { readPartnerApplication } from "./transfer-partners";
import { VEHICLES } from "./vehicles";

export const partnerDb = () => env.DB as SecurityDatabase;
import { thaiToday, type PartnerRole } from "./partner-display";
export { canBook, canFinance, thb, thaiToday, type PartnerRole } from "./partner-display";
export type PartnerAccess = Agency & { portalRole: PartnerRole };
export type PartnerProfile = { agency_id:string;partner_kind:"hotel"|"agency";billing_name:string;billing_address:string;tax_id:string;commission_bps:number };
export type PartnerRate = { id:string;agency_id:string;label:string;pickup:string;dropoff:string;vehicle:string;service_type:"transfer"|"hourly"|"tour";booked_hours:number|null;price_minor:number;valid_from:string;valid_until:string;active:number };
export type PartnerInvoice = {id:string;agency_id:string;booking_reference:string;amount_minor:number;snapshot:string;created_at:string};
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Enter a real date.");
export const rateSchema=z.object({label:z.string().trim().min(2).max(120),pickup:z.string().trim().min(2).max(300),dropoff:z.string().trim().min(2).max(300),vehicle:z.enum(Object.keys(VEHICLES) as [string,...string[]]),serviceType:z.enum(["transfer","hourly","tour"]),bookedHours:z.number().int().min(3).max(24).optional(),priceMinor:z.number().int().min(1).max(100000000),validFrom:date,validUntil:date}).refine(v=>v.validUntil>=v.validFrom,"The end date must follow the start date.").refine(v=>v.serviceType!=="hourly"||(Boolean(v.bookedHours)&&v.vehicle!=="comfort_bmw"),"Hourly rates require a duration and exclude BMW.");
export async function partnerProfile(agency:Agency) {
 return await partnerDb().prepare("SELECT * FROM partner_profiles WHERE agency_id=?").bind(agency.id).first<PartnerProfile>() ?? {agency_id:agency.id,partner_kind:readPartnerApplication(agency.message).type==="hotel"?"hotel":"agency",billing_name:agency.agencyName,billing_address:"",tax_id:"",commission_bps:0};
}
export async function partnerRates(id:string,includeInactive=false) {
 const {results}=await partnerDb().prepare(`SELECT * FROM partner_rates WHERE agency_id=? ${includeInactive?"":"AND active=1 AND valid_until>=?"} ORDER BY valid_until,label`).bind(...(includeInactive?[id]:[id,thaiToday()])).all<PartnerRate>();return results;
}
export async function partnerRate(id:string,agencyId:string) {return partnerDb().prepare("SELECT * FROM partner_rates WHERE id=? AND agency_id=?").bind(id,agencyId).first<PartnerRate>();}
export function rateProblem(rate:PartnerRate,input:{serviceType:string;pickup:string;dropoff:string;vehicle:string;pickupDate:string;bookedHours?:number;returnDate?:string}) {
 if(!rate.active||input.pickupDate<rate.valid_from||input.pickupDate>rate.valid_until)return "This partner rate is unavailable for the pickup date. Request a fresh quote.";
 if(input.returnDate)return "Rate cards cover one journey. Request a separate quote for a return journey.";
 if(input.serviceType!==rate.service_type||input.pickup.trim()!==rate.pickup||input.dropoff.trim()!==rate.dropoff||input.vehicle!==rate.vehicle||(rate.service_type==="hourly"&&input.bookedHours!==rate.booked_hours))return "The itinerary does not match the agreed partner rate.";
 return null;
}
// Commission is earned only after a completed, paid trip. Issued and reserved refunds reduce the
// snapshotted base proportionally; cash requires recorded receipts.
export function earnedCommission(input:{status:string;payment_status:string;payment_method:string;total:number;paid_minor:number;refunded_minor:number;commission_base_minor:number;commission_bps:number}) {
 const total=toSatang(input.total);
 if(input.status!=="completed"||!total||input.paid_minor<total||!["paid","partially_refunded","refunded"].includes(input.payment_status))return 0;
 const retained=Math.max(0,total-Math.max(0,input.refunded_minor));
 // BigInt keeps proportional commission calculations exact before rounding.
 return Number(BigInt(input.commission_base_minor)*BigInt(retained)*BigInt(input.commission_bps)/(BigInt(total)*BigInt(10000)));
}
export async function commissionStatement(agencyId:string,period:string) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error("Choose a valid month.");
 const {results}=await partnerDb().prepare(`SELECT b.reference,b.pickup_date,b.status,b.payment_status,b.payment_method,b.total,t.commission_base_minor,t.commission_bps,
 CASE WHEN b.payment_method='cash' THEN COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=b.reference),0)
 ELSE COALESCE((SELECT MAX(COALESCE(amount_paid_minor,ROUND(amount_paid*100))) FROM booking_payments WHERE booking_reference=b.reference),CASE WHEN b.payment_method='manual' AND b.payment_status IN ('paid','partially_refunded','refunded') THEN ROUND(b.total*100) ELSE 0 END) END paid_minor,
 MAX(COALESCE((SELECT MAX(refunded_minor) FROM booking_payments WHERE booking_reference=b.reference),0),COALESCE((SELECT SUM(customer_refund_minor) FROM booking_refunds WHERE booking_reference=b.reference AND status IN ('refunded','partially_refunded')),0),COALESCE(ROUND(b.refund_amount*100),0)) + COALESCE((SELECT SUM(customer_refund_minor) FROM booking_refunds WHERE booking_reference=b.reference AND status IN ('requested','approved','processing')),0) refunded_minor
 FROM partner_booking_terms t JOIN bookings b ON b.reference=t.booking_reference WHERE t.agency_id=? AND substr(b.pickup_date,1,7)=? ORDER BY b.pickup_date,b.reference`).bind(agencyId,period).all<{reference:string;pickup_date:string;status:string;payment_status:string;payment_method:string;total:number;commission_base_minor:number;commission_bps:number;paid_minor:number;refunded_minor:number}>();
 const rows=results.map(r=>({...r,commissionMinor:earnedCommission(r)}));
 const payout=await partnerDb().prepare("SELECT amount_minor,payment_reference,created_at FROM partner_payouts WHERE agency_id=? AND period=?").bind(agencyId,period).first<{amount_minor:number;payment_reference:string;created_at:string}>();
 const earnedMinor=rows.reduce((n,r)=>n+r.commissionMinor,0),paidMinor=payout?.amount_minor??0;
 return {period,rows,earnedMinor,paidMinor,balanceMinor:earnedMinor-paidMinor,payout};
}
export async function partnerInvoices(id:string) {return (await partnerDb().prepare("SELECT * FROM partner_invoices WHERE agency_id=? ORDER BY created_at DESC LIMIT 200").bind(id).all<PartnerInvoice>()).results;}
export async function snapshotPartnerBooking(reference:string,agencyId:string,baseMinor:number,rate:PartnerRate|null=null,commissionBps?:number) {
 const profile=await partnerDb().prepare("SELECT commission_bps FROM partner_profiles WHERE agency_id=?").bind(agencyId).first<{commission_bps:number}>();
 await partnerDb().prepare("INSERT INTO partner_booking_terms(booking_reference,agency_id,commission_base_minor,commission_bps,rate_snapshot,created_at) VALUES(?,?,?,?,?,?)").bind(reference,agencyId,baseMinor,commissionBps??profile?.commission_bps??0,rate?JSON.stringify(rate):null,new Date().toISOString()).run();
}
export type InvoiceSnapshot={issuer:{name:string;address:string;taxId:string};buyer:{name:string;address:string;taxId:string};reference:string;pickup:string;dropoff:string;pickupDate:string;pickupTime:string;vehicle:string;amountMinor:number;currency:"THB"};
export function toInvoiceSnapshot(booking:{reference:string;pickup:string;dropoff:string;pickupDate:string;pickupTime:string;vehicle:string;total:number},profile:PartnerProfile):InvoiceSnapshot|null {
 const name=String(env.WAYDIDI_INVOICE_LEGAL_NAME??"").trim(),address=String(env.WAYDIDI_INVOICE_ADDRESS??"").trim();
 if(!name||!address||!profile.billing_name||!profile.billing_address)return null;
 return {issuer:{name,address,taxId:String(env.WAYDIDI_INVOICE_TAX_ID??"")},buyer:{name:profile.billing_name,address:profile.billing_address,taxId:profile.tax_id},reference:booking.reference,pickup:booking.pickup,dropoff:booking.dropoff,pickupDate:booking.pickupDate,pickupTime:booking.pickupTime,vehicle:booking.vehicle,amountMinor:toSatang(booking.total),currency:"THB"};
}
