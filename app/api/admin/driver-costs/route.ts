import { POST as operationsPost } from "@/app/api/admin/operations/route";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingCosts, bookingEvents, bookings, drivers } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const phoneValid=(value:string)=>/^[+0-9() .-]{7,30}$/u.test(value.trim());
const emailValid=(value:string)=>/^\S+@\S+\.\S+$/u.test(value)&&value.length<=254;

export async function GET(){
  const admin=await getWaydidiAdmin(); if(!admin)return NextResponse.json({error:"Unauthorized"},{status:401});
  const [bookingRows,driverRows,costRows,assignmentRows]=await Promise.all([
    getDb().select().from(bookings).orderBy(desc(bookings.createdAt)).limit(200),
    getDb().select().from(drivers).orderBy(drivers.fullName),getDb().select().from(bookingCosts),
    getDb().select().from(bookingAssignments).orderBy(desc(bookingAssignments.assignedAt)).limit(300),
  ]);
  return NextResponse.json({bookings:bookingRows.filter(row=>["confirmed","completed","no_show"].includes(row.status)).map(row=>({reference:row.reference,customerName:row.customerName,pickup:row.pickup,dropoff:row.dropoff,pickupDate:row.pickupDate,pickupTime:row.pickupTime,returnPickup:row.returnPickup,returnDropoff:row.returnDropoff,returnDate:row.returnDate,returnTime:row.returnTime,vehicle:row.vehicle,total:row.total,status:row.status})),drivers:driverRows.map(row=>({id:row.id,fullName:row.fullName,phone:row.phone,email:row.email,remindersEnabled:row.remindersEnabled,status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,idImageKey:row.idImageKey?"available":null,carImageKey:row.carImageKey?"available":null})),costs:costRows,assignments:assignmentRows.filter(row=>!row.revokedAt && row.leg === "outbound").map(row=>({id:row.id,bookingReference:row.bookingReference,driverId:row.driverId,currentStatus:row.currentStatus,assignedAt:row.assignedAt}))},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request){
  const admin=await getWaydidiAdmin(); if(!admin)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked"},{status:403});
  const input=await request.json() as {action?:string;bookingReference?:string;driverId?:string;assignmentId?:string;fullName?:string;phone?:string;email?:string;agreedDriverCost?:number;additionalCosts?:number;paymentStatus?:string;paymentReference?:string;notes?:string};
  const now=new Date().toISOString();

  if(input.action==="assign_driver"||input.action==="create_driver")return NextResponse.json({error:"Assign drivers from the journey's Driver information section."},{status:400});
  if(input.action==="create_driver"){
    const fullName=input.fullName?.trim()??"",phone=input.phone?.trim()??"",email=input.email?.trim().toLowerCase()??"";
    if(fullName.length<2||fullName.length>100||!phoneValid(phone)||(email&&!emailValid(email)))return NextResponse.json({error:"Enter a valid driver name, phone number, and email."},{status:400});
    const driver={id:crypto.randomUUID(),fullName,phone,email:email||null,remindersEnabled:true,status:"active",createdAt:now,updatedAt:now};
    await getDb().insert(drivers).values(driver); return NextResponse.json({driver});
  }

  if(input.action==="rotate_link") {
    return operationsPost(new Request(request.url,{method:"POST",headers:request.headers,body:JSON.stringify(input)}));
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
