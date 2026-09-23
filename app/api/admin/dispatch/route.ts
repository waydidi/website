import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingCosts, bookingEvents, bookingNotifications, bookings, driverAvailability, drivers } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { sendDriverAssignmentEmail } from "@/lib/email";
import { bookingWindow, rangesOverlap } from "@/lib/operations-calendar";
import { isJsonRequest, safeOrigin, sameOrigin, secureToken, sha256 } from "@/lib/security";

const phoneValid=(value:string)=>/^[+0-9() .-]{7,30}$/u.test(value.trim());
const emailValid=(value:string)=>/^\S+@\S+\.\S+$/u.test(value)&&value.length<=254;

export async function GET(){
  const admin=await getWaydidiAdmin(); if(!admin)return NextResponse.json({error:"Unauthorized"},{status:401});
  const [bookingRows,driverRows,costRows,assignmentRows]=await Promise.all([
    getDb().select().from(bookings).orderBy(desc(bookings.createdAt)).limit(200),
    getDb().select().from(drivers).orderBy(drivers.fullName),getDb().select().from(bookingCosts),
    getDb().select().from(bookingAssignments).orderBy(desc(bookingAssignments.assignedAt)).limit(300),
  ]);
  return NextResponse.json({bookings:bookingRows.filter(row=>["confirmed","completed"].includes(row.status)).map(row=>({reference:row.reference,customerName:row.customerName,pickup:row.pickup,dropoff:row.dropoff,pickupDate:row.pickupDate,pickupTime:row.pickupTime,returnPickup:row.returnPickup,returnDropoff:row.returnDropoff,returnDate:row.returnDate,returnTime:row.returnTime,vehicle:row.vehicle,total:row.total,status:row.status})),drivers:driverRows.map(row=>({id:row.id,fullName:row.fullName,phone:row.phone,email:row.email,remindersEnabled:row.remindersEnabled,status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,idImageKey:row.idImageKey?"available":null,carImageKey:row.carImageKey?"available":null})),costs:costRows,assignments:assignmentRows.filter(row=>!row.revokedAt).map(row=>({id:row.id,bookingReference:row.bookingReference,driverId:row.driverId,currentStatus:row.currentStatus,assignedAt:row.assignedAt}))},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request){
  const admin=await getWaydidiAdmin(); if(!admin)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked"},{status:403});
  const input=await request.json() as {action?:string;bookingReference?:string;driverId?:string;assignmentId?:string;fullName?:string;phone?:string;email?:string;agreedDriverCost?:number;additionalCosts?:number;paymentStatus?:string;paymentReference?:string;notes?:string};
  const now=new Date().toISOString();

  if(input.action==="create_driver"){
    const fullName=input.fullName?.trim()??"",phone=input.phone?.trim()??"",email=input.email?.trim().toLowerCase()??"";
    if(fullName.length<2||fullName.length>100||!phoneValid(phone)||(email&&!emailValid(email)))return NextResponse.json({error:"Enter a valid driver name, phone number, and email."},{status:400});
    const driver={id:crypto.randomUUID(),fullName,phone,email:email||null,remindersEnabled:true,status:"active",createdAt:now,updatedAt:now};
    await getDb().insert(drivers).values(driver); return NextResponse.json({driver});
  }

  if(input.action==="assign_driver"||input.action==="rotate_link"){
    let bookingReference=input.bookingReference?.trim()??"",driverId=input.driverId?.trim()??"";
    if(input.action==="rotate_link"){
      const [existing]=await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id,input.assignmentId??"")).limit(1);
      if(!existing)return NextResponse.json({error:"Assignment not found."},{status:404}); bookingReference=existing.bookingReference;driverId=existing.driverId;
    }
    const [[booking],[driver]]=await Promise.all([getDb().select().from(bookings).where(eq(bookings.reference,bookingReference)).limit(1),getDb().select().from(drivers).where(eq(drivers.id,driverId)).limit(1)]);
    if(!booking||booking.status!=="confirmed"||!driver||driver.status!=="active")return NextResponse.json({error:"Choose a confirmed booking and an active driver."},{status:409});
    if(input.action==="assign_driver"){
      const cost=Number(input.agreedDriverCost??0); if(!Number.isInteger(cost)||cost<0||cost>1_000_000)return NextResponse.json({error:"Enter a valid agreed driver cost."},{status:400});
      const [driverAssignments,allBookings,unavailableRows]=await Promise.all([getDb().select().from(bookingAssignments).where(and(eq(bookingAssignments.driverId,driverId),isNull(bookingAssignments.revokedAt))),getDb().select().from(bookings),getDb().select().from(driverAvailability).where(eq(driverAvailability.driverId,driverId))]);
      const candidate=bookingWindow(booking),bookingMap=new Map(allBookings.map(row=>[row.reference,row])),conflicts:string[]=[];
      for(const assignment of driverAssignments.filter(row=>row.bookingReference!==bookingReference&&row.currentStatus!=="completed")){const assigned=bookingMap.get(assignment.bookingReference);if(!assigned||assigned.status!=="confirmed")continue;const occupied=bookingWindow(assigned);if(rangesOverlap(candidate.startsAt,candidate.endsAt,occupied.startsAt,occupied.endsAt))conflicts.push(`Overlaps ${assigned.reference} at ${assigned.pickupTime}`);}
      for(const unavailable of unavailableRows)if(rangesOverlap(candidate.startsAt,candidate.endsAt,new Date(unavailable.startsAt).getTime(),new Date(unavailable.endsAt).getTime()))conflicts.push(unavailable.reason?`Driver unavailable: ${unavailable.reason}`:"Driver unavailable during this journey");
      if(conflicts.length)return NextResponse.json({error:`Driver schedule conflict: ${conflicts.join("; ")}. Review the Operations Calendar.`},{status:409});
      const [savedCost]=await getDb().select().from(bookingCosts).where(eq(bookingCosts.bookingReference,bookingReference)).limit(1),additional=savedCost?.additionalCosts??0;
      await getDb().insert(bookingCosts).values({bookingReference,agreedDriverCost:cost,additionalCosts:additional,totalDriverCost:cost+additional,paymentStatus:savedCost?.paymentStatus??"unpaid",paidAt:savedCost?.paidAt??null,paymentReference:savedCost?.paymentReference??null,notes:savedCost?.notes??null,updatedBy:admin.email,createdAt:savedCost?.createdAt??now,updatedAt:now}).onConflictDoUpdate({target:bookingCosts.bookingReference,set:{agreedDriverCost:cost,totalDriverCost:cost+additional,updatedBy:admin.email,updatedAt:now}});
    }
    const active=await getDb().select().from(bookingAssignments).where(and(eq(bookingAssignments.bookingReference,bookingReference),isNull(bookingAssignments.revokedAt))); for(const row of active)await getDb().update(bookingAssignments).set({revokedAt:now,updatedAt:now}).where(eq(bookingAssignments.id,row.id));
    const token=secureToken(),pickup=new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime(),expiry=new Date(Math.max(Date.now()+48*60*60*1000,pickup+24*60*60*1000)).toISOString();
    const assignment={id:crypto.randomUUID(),bookingReference,driverId,tokenHash:await sha256(token),currentStatus:"assigned",assignedBy:admin.email,assignedAt:now,tokenExpiresAt:expiry,updatedAt:now};
    await getDb().insert(bookingAssignments).values(assignment); await getDb().insert(bookingEvents).values({bookingReference,eventType:input.action==="rotate_link"?"driver_link_rotated":"driver_assigned_by_admin",providerEventId:`assignment:${assignment.id}`,createdAt:now});
    const driverUrl=`${safeOrigin(request)}/driver/trip/${token}`;
    if(driver.email&&driver.remindersEnabled){const delivery=await sendDriverAssignmentEmail({to:driver.email,driverName:driver.fullName,driverUrl,reference:booking.reference,pickup:booking.pickup,dropoff:booking.dropoff,pickupDate:booking.pickupDate,pickupTime:booking.pickupTime,vehicle:booking.vehicle});await getDb().insert(bookingNotifications).values({id:crypto.randomUUID(),bookingReference,assignmentId:assignment.id,notificationType:"driver_assignment",channel:"email",recipient:driver.email,dedupeKey:`driver-assignment:${assignment.id}`,scheduledFor:now,status:delivery.status==="sent"?"sent":"failed",attemptCount:1,lastAttemptAt:now,sentAt:delivery.status==="sent"?now:null,errorMessage:delivery.status==="sent"?null:delivery.status,createdAt:now,updatedAt:now});}
    return NextResponse.json({assignment:{id:assignment.id,bookingReference,driverId,currentStatus:"assigned",assignedAt:now},driverUrl});
  }

  if(input.action==="revoke"){
    const [assignment]=await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id,input.assignmentId??"")).limit(1); if(!assignment)return NextResponse.json({error:"Assignment not found."},{status:404});
    await getDb().update(bookingAssignments).set({revokedAt:now,updatedAt:now}).where(eq(bookingAssignments.id,assignment.id)); await getDb().insert(bookingEvents).values({bookingReference:assignment.bookingReference,eventType:"driver_access_revoked",providerEventId:`revoked:${assignment.id}`,createdAt:now}); return NextResponse.json({ok:true});
  }

  if(input.action==="update_cost"){
    const reference=input.bookingReference?.trim()??"",agreed=Number(input.agreedDriverCost??0),additional=Number(input.additionalCosts??0),paymentStatus=String(input.paymentStatus??"unpaid");
    if(!Number.isInteger(agreed)||agreed<0||agreed>1_000_000||!Number.isInteger(additional)||additional<0||additional>1_000_000||!["unpaid","scheduled","paid"].includes(paymentStatus))return NextResponse.json({error:"Check the cost and payment values."},{status:400});
    const [booking]=await getDb().select().from(bookings).where(eq(bookings.reference,reference)).limit(1); if(!booking)return NextResponse.json({error:"Booking not found."},{status:404});
    const notes=String(input.notes??"").trim().slice(0,500),paymentReference=String(input.paymentReference??"").trim().slice(0,120);
    await getDb().insert(bookingCosts).values({bookingReference:reference,agreedDriverCost:agreed,additionalCosts:additional,totalDriverCost:agreed+additional,paymentStatus,paidAt:paymentStatus==="paid"?now:null,paymentReference:paymentReference||null,notes:notes||null,updatedBy:admin.email,createdAt:now,updatedAt:now}).onConflictDoUpdate({target:bookingCosts.bookingReference,set:{agreedDriverCost:agreed,additionalCosts:additional,totalDriverCost:agreed+additional,paymentStatus,paidAt:paymentStatus==="paid"?now:null,paymentReference:paymentReference||null,notes:notes||null,updatedBy:admin.email,updatedAt:now}});
    await getDb().insert(bookingEvents).values({bookingReference:reference,eventType:"driver_cost_updated",providerEventId:null,createdAt:now}); return NextResponse.json({ok:true,margin:booking.total-agreed-additional});
  }
  return NextResponse.json({error:"Unsupported action."},{status:400});
}
