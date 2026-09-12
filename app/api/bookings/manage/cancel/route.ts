import { and, eq, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingChanges, bookingEvents, bookingNotifications, bookings, operationsAlerts } from "@/db/schema";
import { canManageStatus, HOUR, managedBooking, pickupInstant } from "@/lib/booking-management";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { refundPayment } from "@/lib/stripe";
import { sendBookingManagementEmail } from "@/lib/email";

export async function POST(request:Request){
  if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked"},{status:403});
  const booking=await managedBooking(request);if(!booking)return NextResponse.json({error:"Your management session expired."},{status:401});
  const input=await request.json() as {reason?:unknown;confirmed?:unknown;bookingVersion?:unknown};const reason=typeof input.reason==="string"?input.reason.trim():"";
  if(input.confirmed!==true||reason.length<3||reason.length>300||!Number.isInteger(input.bookingVersion))return NextResponse.json({error:"Confirm cancellation and provide a short reason."},{status:400});
  if(!canManageStatus(booking.status)||pickupInstant(booking.pickupDate,booking.pickupTime)-Date.now()<24*HOUR)return NextResponse.json({error:"Online cancellation closes 24 hours before pickup."},{status:409});
  if(booking.bookingVersion!==input.bookingVersion)return NextResponse.json({error:"This booking changed in another session. Refresh and try again."},{status:409});
  const active=await getDb().select().from(bookingAssignments).where(and(eq(bookingAssignments.bookingReference,booking.reference),isNull(bookingAssignments.revokedAt)));
  if(active.some(a=>["going_to_standby","standby","passenger_picked_up","completed"].includes(a.currentStatus)))return NextResponse.json({error:"This journey has started. Contact Waydidi support."},{status:409});
  let refundId:string|null=null,refundStatus=booking.paymentMethod==="cash"?"not_required":"pending";
  if(booking.paymentMethod!=="cash"){if(!booking.paymentIntentId)return NextResponse.json({error:"Payment details are not ready. Contact Waydidi support."},{status:409});const refund=await refundPayment(booking.paymentIntentId,booking.reference);refundId=refund.id!;refundStatus=refund.status??"pending";}
  const now=new Date().toISOString();
  await getDb().update(bookings).set({status:"cancelled",refundId,cancelledAt:now,cancellationReason:reason,cancelledBy:"customer",refundStatus,refundAmount:booking.paymentMethod==="cash"?0:booking.total,refundRequestedAt:booking.paymentMethod==="cash"?null:now,refundCompletedAt:refundStatus==="succeeded"?now:null,bookingVersion:booking.bookingVersion+1,updatedAt:now}).where(and(eq(bookings.reference,booking.reference),eq(bookings.bookingVersion,booking.bookingVersion)));
  for(const assignment of active)await getDb().update(bookingAssignments).set({revokedAt:now,updatedAt:now}).where(eq(bookingAssignments.id,assignment.id));
  await getDb().update(bookingNotifications).set({status:"cancelled",updatedAt:now}).where(and(eq(bookingNotifications.bookingReference,booking.reference),ne(bookingNotifications.status,"sent")));
  await getDb().update(operationsAlerts).set({status:"resolved",resolvedAt:now,resolutionNote:"Booking cancelled by customer",updatedAt:now}).where(and(eq(operationsAlerts.bookingReference,booking.reference),eq(operationsAlerts.status,"open")));
  await getDb().insert(bookingChanges).values({id:crypto.randomUUID(),bookingReference:booking.reference,changeType:"cancelled",previousJson:JSON.stringify({status:booking.status}),nextJson:JSON.stringify({status:"cancelled",refundStatus}),reason,actor:"customer",createdAt:now});
  await getDb().insert(bookingEvents).values({bookingReference:booking.reference,eventType:"customer_cancelled",providerEventId:refundId?`refund:${refundId}`:undefined,createdAt:now});
  await sendBookingManagementEmail({to:booking.customerEmail,name:booking.customerName,reference:booking.reference,pickup:booking.pickup,dropoff:booking.dropoff,pickupDate:booking.pickupDate,pickupTime:booking.pickupTime,vehicle:booking.vehicle,action:"cancelled",refundStatus});
  return NextResponse.json({ok:true,refundStatus});
}
