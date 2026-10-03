import { NextResponse } from "next/server";
import { z } from "zod";
import { getWaydidiAdmin } from "@/lib/admin";
import { agencyBooking } from "@/lib/agency";
import { getDb } from "@/db";
import { agencyApplications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { partnerDb, partnerProfile, rateSchema, commissionStatement, toInvoiceSnapshot } from "@/lib/partner-portal";
import { isJsonRequest, sameOrigin } from "@/lib/security";
export async function GET(request:Request){
 const staff=await getWaydidiAdmin();if(!staff||!["owner","finance"].includes(staff.role))return NextResponse.json({error:"Unauthorized"},{status:403});
 const {results}=await partnerDb().prepare("SELECT a.id,a.agency_name,a.email,a.status,a.message,p.partner_kind,p.billing_name,p.billing_address,p.tax_id,p.commission_bps FROM agency_applications a LEFT JOIN partner_profiles p ON p.agency_id=a.id ORDER BY a.created_at DESC LIMIT 500").all();
 const id=new URL(request.url).searchParams.get("agencyId");
 const rates=id?(await partnerDb().prepare("SELECT * FROM partner_rates WHERE agency_id=? ORDER BY active DESC,created_at DESC").bind(id).all()).results:[];
 const invoices=id?(await partnerDb().prepare("SELECT id,booking_reference,amount_minor,created_at FROM partner_invoices WHERE agency_id=? ORDER BY created_at DESC").bind(id).all()).results:[];
 const period=new URL(request.url).searchParams.get("period");
 const statement=id&&period&&/^\d{4}-(0[1-9]|1[0-2])$/.test(period)?await commissionStatement(id,period):null;
 return NextResponse.json({partners:results,rates,invoices,statement,canFinance:true},{headers:{"Cache-Control":"no-store"}});
}
const inputSchema=z.object({agencyId:z.string().min(1).max(80),action:z.enum(["profile","rate","disable_rate","invoice","payout"]),data:z.unknown()});
export async function POST(request:Request){
 if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked."},{status:403});
 const staff=await getWaydidiAdmin();if(!staff||!["owner","finance"].includes(staff.role))return NextResponse.json({error:"Finance access required."},{status:403});
 const parsed=inputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid partner action."},{status:400});
 const {agencyId,action,data}=parsed.data;
 const [agency]=await getDb().select().from(agencyApplications).where(eq(agencyApplications.id,agencyId)).limit(1);
 if(!agency||agency.status!=="approved")return NextResponse.json({error:"Approve this partner before configuring its account."},{status:409});
 const now=new Date().toISOString();
 if(action==="profile"){
  const p=z.object({partnerKind:z.enum(["hotel","agency"]),billingName:z.string().trim().min(2).max(200),billingAddress:z.string().trim().max(1000),taxId:z.string().trim().max(80),commissionBps:z.number().int().min(0).max(10000)}).safeParse(data);
  if(!p.success)return NextResponse.json({error:"Check billing details and commission percentage."},{status:400});
  const v=p.data;await partnerDb().prepare("INSERT INTO partner_profiles(agency_id,partner_kind,billing_name,billing_address,tax_id,commission_bps,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(agency_id) DO UPDATE SET partner_kind=excluded.partner_kind,billing_name=excluded.billing_name,billing_address=excluded.billing_address,tax_id=excluded.tax_id,commission_bps=excluded.commission_bps,updated_at=excluded.updated_at").bind(agencyId,v.partnerKind,v.billingName,v.billingAddress,v.taxId,v.commissionBps,now).run();
 }else if(action==="rate"){
  const p=rateSchema.safeParse(data);if(!p.success)return NextResponse.json({error:p.error.issues[0]?.message??"Invalid rate."},{status:400});const v=p.data;
  await partnerDb().prepare("INSERT INTO partner_rates(id,agency_id,label,pickup,dropoff,vehicle,service_type,booked_hours,price_minor,valid_from,valid_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),agencyId,v.label,v.pickup,v.dropoff,v.vehicle,v.serviceType,v.bookedHours??null,v.priceMinor,v.validFrom,v.validUntil,now).run();
 }else if(action==="disable_rate"){
  const p=z.object({id:z.string().max(80)}).safeParse(data);if(!p.success)return NextResponse.json({error:"Choose a rate."},{status:400});
  await partnerDb().prepare("UPDATE partner_rates SET active=0 WHERE id=? AND agency_id=?").bind(p.data.id,agencyId).run();
 }else if(action==="invoice"){
  const p=z.object({reference:z.string().min(1).max(30)}).safeParse(data);if(!p.success)return NextResponse.json({error:"Enter a booking reference."},{status:400});
  const booking=await agencyBooking(agency,p.data.reference.toUpperCase());if(!booking||!["confirmed","completed"].includes(booking.status))return NextResponse.json({error:"Choose a confirmed booking belonging to this partner."},{status:404});
  const snapshot=toInvoiceSnapshot(booking,await partnerProfile(agency));
  if(!snapshot)return NextResponse.json({error:"Configure the invoice issuer name/address and partner billing details first."},{status:409});
  await partnerDb().prepare("INSERT OR IGNORE INTO partner_invoices(id,agency_id,booking_reference,amount_minor,snapshot,issued_by,created_at) VALUES(?,?,?,?,?,?,?)").bind(`WD-${crypto.randomUUID()}`,agencyId,booking.reference,snapshot.amountMinor,JSON.stringify(snapshot),staff.id,now).run();
 }else{
  const p=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),paymentReference:z.string().trim().min(3).max(150)}).safeParse(data);if(!p.success)return NextResponse.json({error:"Enter a month and payment reference."},{status:400});
  const statement=await commissionStatement(agencyId,p.data.period);if(statement.balanceMinor<=0)return NextResponse.json({error:"No commission is currently payable."},{status:409});
  try{await partnerDb().prepare("INSERT INTO partner_payouts(id,agency_id,period,amount_minor,payment_reference,processed_by,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),agencyId,p.data.period,statement.balanceMinor,p.data.paymentReference,staff.id,now).run();}catch{return NextResponse.json({error:"This month already has a recorded payout. Review its statement."},{status:409});}
 }
 await partnerDb().prepare("INSERT INTO partner_audit(id,agency_id,actor,action,details,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),agencyId,staff.id,action,JSON.stringify(data),now).run();
 return NextResponse.json({ok:true});
}
