import { and, eq, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingChanges, bookingEvents, bookingNotifications, bookings, operationsAlerts } from "@/db/schema";
import { canManageStatus, HOUR, managedBooking, pickupInstant } from "@/lib/booking-management";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { sendBookingManagementEmail } from "@/lib/email";

function validDateTime(date:unknown,time:unknown){if(typeof date!=="string"||typeof time!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return false;const [h,m]=time.split(":").map(Number);return h>=0&&h<24&&m>=0&&m<60&&m%15===0;}
export async function POST(request:Request){
  if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked"},{status:403});
  const booking=await managedBooking(request);if(!booking)return NextResponse.json({error:"Your management session expired."},{status:401});
  const input=await request.json() as {pickupDate?:unknown;pickupTime?:unknown;bookingVersion?:unknown};
  if(!validDateTime(input.pickupDate,input.pickupTime)||!Number.isInteger(input.bookingVersion))return NextResponse.json({error:"Choose a valid date and 15-minute pickup time."},{status:400});
  if(!canManageStatus(booking.status)||pickupInstant(booking.pickupDate,booking.pickupTime)-Date.now()<72*HOUR)return NextResponse.json({error:"Online date changes close 72 hours before pickup."},{status:409});
  if(booking.bookingVersion!==input.bookingVersion)return NextResponse.json({error:"This booking changed in another session. Refresh and try again."},{status:409});
  const newPickup=pickupInstant(input.pickupDate as string,input.pickupTime as string);if(!Number.isFinite(newPickup)||newPickup-Date.now()<72*HOUR)return NextResponse.json({error:"The new pickup must be at least 72 hours from now."},{status:409});
  const active=await getDb().select().from(bookingAssignments).where(and(eq(bookingAssignments.bookingReference,booking.reference),isNull(bookingAssignments.revokedAt)));
  if(active.some(a=>!["assigned"].includes(a.currentStatus)))return NextResponse.json({error:"Your driver has started this journey. Contact Waydidi support."},{status:409});
  const now=new Date().toISOString(),scheduledEndAt=booking.bookedHours?new Date(newPickup+booking.bookedHours*HOUR).toISOString():booking.scheduledEndAt;
  await getDb().update(bookings).set({pickupDate:input.pickupDate as string,pickupTime:input.pickupTime as string,scheduledEndAt,bookingVersion:booking.bookingVersion+1,attentionStatus:active.length?"warning":"normal",attentionReason:active.length?"Customer changed pickup time; driver reconfirmation required":null,updatedAt:now}).where(and(eq(bookings.reference,booking.reference),eq(bookings.bookingVersion,booking.bookingVersion)));
  for(const assignment of active)await getDb().update(bookingAssignments).set({reconfirmationRequired:true,updatedAt:now}).where(eq(bookingAssignments.id,assignment.id));
  await getDb().delete(bookingNotifications).where(and(eq(bookingNotifications.bookingReference,booking.reference),ne(bookingNotifications.status,"sent")));
  await getDb().insert(bookingChanges).values({id:crypto.randomUUID(),bookingReference:booking.reference,changeType:"rescheduled",previousJson:JSON.stringify({pickupDate:booking.pickupDate,pickupTime:booking.pickupTime}),nextJson:JSON.stringify({pickupDate:input.pickupDate,pickupTime:input.pickupTime}),actor:"customer",createdAt:now});
  await getDb().insert(bookingEvents).values({bookingReference:booking.reference,eventType:"customer_rescheduled",createdAt:now});
  if(active.length)await getDb().insert(operationsAlerts).values({id:crypto.randomUUID(),bookingReference:booking.reference,assignmentId:active[0].id,alertType:"driver_reconfirmation",severity:"warning",title:"Customer changed pickup time",details:`New pickup: ${input.pickupDate} at ${input.pickupTime}`,dedupeKey:`reschedule:${booking.reference}:${booking.bookingVersion+1}`,status:"open",expectedAt:new Date(newPickup).toISOString(),detectedAt:now,createdAt:now,updatedAt:now});
  await sendBookingManagementEmail({to:booking.customerEmail,name:booking.customerName,reference:booking.reference,pickup:booking.pickup,dropoff:booking.dropoff,pickupDate:input.pickupDate as string,pickupTime:input.pickupTime as string,vehicle:booking.vehicle,action:"rescheduled"});
  return NextResponse.json({ok:true});
}
