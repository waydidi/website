import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingChanges, bookingAssignments } from "@/db/schema";
import { canManageStatus, HOUR, managedBooking, pickupInstant } from "@/lib/booking-management";

export async function GET(request:Request){
  const booking=await managedBooking(request);if(!booking)return NextResponse.json({error:"Your management session expired."},{status:401});
  const [changes,assignments]=await Promise.all([getDb().select().from(bookingChanges).where(eq(bookingChanges.bookingReference,booking.reference)).orderBy(desc(bookingChanges.createdAt)).limit(50),getDb().select().from(bookingAssignments).where(eq(bookingAssignments.bookingReference,booking.reference))]);
  const remaining=pickupInstant(booking.pickupDate,booking.pickupTime)-Date.now();
  const journeyStarted=assignments.some(a=>!a.revokedAt&&["going_to_standby","standby","passenger_picked_up","completed"].includes(a.currentStatus));
  return NextResponse.json({booking:{reference:booking.reference,status:booking.status,pickup:booking.pickup,dropoff:booking.dropoff,pickupDate:booking.pickupDate,pickupTime:booking.pickupTime,passengers:booking.passengers,luggage:booking.luggage,vehicle:booking.vehicle,total:booking.total,paymentMethod:booking.paymentMethod,serviceType:booking.serviceType,bookedHours:booking.bookedHours,refundStatus:booking.refundStatus,cancellationReason:booking.cancellationReason,bookingVersion:booking.bookingVersion},eligibility:{canReschedule:canManageStatus(booking.status)&&!journeyStarted&&remaining>=72*HOUR,canCancel:canManageStatus(booking.status)&&!journeyStarted&&remaining>=24*HOUR,rescheduleCutoff:new Date(pickupInstant(booking.pickupDate,booking.pickupTime)-72*HOUR).toISOString(),cancellationCutoff:new Date(pickupInstant(booking.pickupDate,booking.pickupTime)-24*HOUR).toISOString()},changes},{headers:{"Cache-Control":"private, no-store"}});
}
