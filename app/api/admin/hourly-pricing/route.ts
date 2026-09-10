import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { hourlyPackages, pricingAreas } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { DEFAULT_HOURLY_PACKAGES } from "@/lib/hourly-pricing";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { VEHICLE_IDS } from "@/lib/pricing";

export async function GET() {
  if (!await getWaydidiAdmin()) return NextResponse.json({error:"Unauthorized"},{status:401});
  const [packages,areas]=await Promise.all([getDb().select().from(hourlyPackages),getDb().select().from(pricingAreas).where(eq(pricingAreas.status,"published"))]);
  return NextResponse.json({defaults:DEFAULT_HOURLY_PACKAGES,packages,areas:areas.map(({id,name,color})=>({id,name,color}))},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request) {
  const admin=await getWaydidiAdmin();
  if (!admin) return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!sameOrigin(request)||!isJsonRequest(request)) return NextResponse.json({error:"Request blocked"},{status:403});
  const input=await request.json() as {areaId?:string;vehicleId?:string;minimumHours?:number;basePrice?:number;additionalHourPrice?:number;includedKmPerHour?:number;extraPricePerKm?:number};
  const numbers=[input.minimumHours,input.basePrice,input.additionalHourPrice,input.includedKmPerHour,input.extraPricePerKm];
  if (!input.areaId || !VEHICLE_IDS.includes(input.vehicleId as any) || numbers.some((n)=>!Number.isInteger(n)||n!<0) || input.minimumHours!<2 || input.minimumHours!>12 || input.basePrice!>100000 || input.additionalHourPrice!>20000 || input.includedKmPerHour!>200 || input.extraPricePerKm!>1000) return NextResponse.json({error:"Check hourly package values"},{status:400});
  const now=new Date().toISOString();
  const [old]=await getDb().select().from(hourlyPackages).where(and(eq(hourlyPackages.areaId,input.areaId),eq(hourlyPackages.vehicleId,input.vehicleId!))).limit(1);
  if (old) await getDb().delete(hourlyPackages).where(eq(hourlyPackages.id,old.id));
  await getDb().insert(hourlyPackages).values({id:crypto.randomUUID(),areaId:input.areaId,vehicleId:input.vehicleId!,minimumHours:input.minimumHours!,basePrice:input.basePrice!,additionalHourPrice:input.additionalHourPrice!,includedKmPerHour:input.includedKmPerHour!,extraPricePerKm:input.extraPricePerKm!,active:true,version:(old?.version??0)+1,updatedAt:now});
  return NextResponse.json({ok:true});
}
