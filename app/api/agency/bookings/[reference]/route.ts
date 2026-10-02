import { NextResponse } from "next/server";
import { agencyBooking,agencyForCustomer } from "@/lib/agency";
import { customerFromRequest,driverStatuses } from "@/lib/customer-auth";
import { acceptedPolicy } from "@/lib/accepted-policy";
export async function GET(request:Request,context:{params:Promise<{reference:string}>}){
 const agency=await agencyForCustomer((await customerFromRequest(request))?.customer??null);
 if(!agency)return NextResponse.json({error:"Partner access required."},{status:401});
 const {reference}=await context.params,b=await agencyBooking(agency,reference.toUpperCase());
 if(!b)return NextResponse.json({error:"Booking not found."},{status:404});
 const [policy,statuses]=await Promise.all([acceptedPolicy(b.reference),driverStatuses([b.reference])]);
 return NextResponse.json({booking:{reference:b.reference,guest:b.customerName,phone:b.customerPhone,email:b.customerEmail,pickup:b.pickup,destination:b.dropoff,pickupDate:b.pickupDate,pickupTime:b.pickupTime,vehicle:b.vehicle,passengers:b.passengers,luggage:b.luggage,status:b.status,paymentStatus:b.paymentStatus,driverStatus:statuses.get(b.reference)??"Not assigned",returnDate:b.returnDate,returnTime:b.returnTime,cancellationPolicy:policy?.terms??"Contact operations for the accepted terms."}},{headers:{"Cache-Control":"private, no-store"}});
}
