import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingChanges, bookingEvents, bookings, operationsAlerts } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { sendRefundDecisionEmail } from "@/lib/email";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { refundPayment } from "@/lib/stripe";

export async function POST(request:Request){
  const admin=await getWaydidiAdmin();
  if(!admin)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked"},{status:403});
  const input=await request.json() as {reference?:unknown;action?:unknown;reason?:unknown};
  const reference=typeof input.reference==="string"?input.reference.trim().toUpperCase():"";
  const action=input.action==="approve"||input.action==="decline"?input.action:null;
  const reason=typeof input.reason==="string"?input.reason.trim():"";
  if(!/^WD-[A-F0-9]{12}$/.test(reference)||!action||(action==="decline"&&(reason.length<3||reason.length>300)))return NextResponse.json({error:"Check the refund decision details."},{status:400});
  const [booking]=await getDb().select().from(bookings).where(eq(bookings.reference,reference)).limit(1);
  if(!booking||booking.status!=="cancelled"||booking.refundStatus!=="awaiting_approval")return NextResponse.json({error:"This refund request is no longer awaiting approval."},{status:409});
  const now=new Date().toISOString();
  if(action==="decline"){
    await getDb().update(bookings).set({refundStatus:"declined",bookingVersion:booking.bookingVersion+1,updatedAt:now}).where(and(eq(bookings.reference,reference),eq(bookings.refundStatus,"awaiting_approval")));
    await getDb().insert(bookingChanges).values({id:crypto.randomUUID(),bookingReference:reference,changeType:"refund_declined",previousJson:JSON.stringify({refundStatus:"awaiting_approval"}),nextJson:JSON.stringify({refundStatus:"declined"}),reason,actor:admin.email,createdAt:now});
    await getDb().insert(bookingEvents).values({bookingReference:reference,eventType:"refund_declined",providerEventId:`refund-declined:${crypto.randomUUID()}`,createdAt:now});
    await resolveAlert(reference,now,`Declined by ${admin.email}: ${reason}`);
    await sendRefundDecisionEmail({to:booking.customerEmail,name:booking.customerName,reference,amount:booking.refundAmount??booking.total,decision:"declined",reason});
    return NextResponse.json({ok:true,status:"declined"});
  }
  if(!booking.paymentIntentId)return NextResponse.json({error:"This booking has no card payment to refund."},{status:409});
  const refund=await refundPayment(booking.paymentIntentId,reference);
  const refundStatus=refund.status==="succeeded"?"succeeded":"processing";
  await getDb().update(bookings).set({refundId:refund.id,refundStatus,refundCompletedAt:refundStatus==="succeeded"?now:null,bookingVersion:booking.bookingVersion+1,updatedAt:now}).where(and(eq(bookings.reference,reference),eq(bookings.refundStatus,"awaiting_approval")));
  await getDb().insert(bookingChanges).values({id:crypto.randomUUID(),bookingReference:reference,changeType:"refund_approved",previousJson:JSON.stringify({refundStatus:"awaiting_approval"}),nextJson:JSON.stringify({refundStatus,refundId:refund.id}),actor:admin.email,createdAt:now});
  await getDb().insert(bookingEvents).values({bookingReference:reference,eventType:"refund_approved",providerEventId:`refund:${refund.id}`,createdAt:now});
  await resolveAlert(reference,now,`Approved by ${admin.email}`);
  await sendRefundDecisionEmail({to:booking.customerEmail,name:booking.customerName,reference,amount:booking.refundAmount??booking.total,decision:"approved"});
  return NextResponse.json({ok:true,status:refundStatus});
}

async function resolveAlert(reference:string,now:string,note:string){
  await getDb().update(operationsAlerts).set({status:"resolved",resolvedAt:now,resolutionNote:note,updatedAt:now}).where(and(eq(operationsAlerts.bookingReference,reference),eq(operationsAlerts.alertType,"refund_approval"),eq(operationsAlerts.status,"open")));
}
