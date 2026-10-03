import { NextResponse } from "next/server";
import { agencyForCustomer } from "@/lib/agency";
import { customerFromRequest } from "@/lib/customer-auth";
import { canFinance, commissionStatement, thaiToday } from "@/lib/partner-portal";
export async function GET(request:Request){
 const agency=await agencyForCustomer((await customerFromRequest(request))?.customer??null);
 if(!agency||!canFinance(agency.portalRole))return NextResponse.json({error:"Partner finance access required."},{status:403});
 const period=new URL(request.url).searchParams.get("period")??thaiToday().slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))return NextResponse.json({error:"Choose a valid month."},{status:400});
 const data=await commissionStatement(agency.id,period);
 if(new URL(request.url).searchParams.get("format")!=="csv")return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
 const cell=(value:unknown)=>{const text=String(value);return '"'+(/^[=+@-]/.test(text)?"'":"")+text.replaceAll('"','""')+'"';};
 const csv=["Reference,Pickup date,Trip status,Payment status,Commission satang",...data.rows.map(r=>[r.reference,r.pickup_date,r.status,r.payment_status,r.commissionMinor].map(cell).join(",")),`Total,,,,${data.earnedMinor}`,`Paid,,,,${data.paidMinor}`,`Balance,,,,${data.balanceMinor}`].join("\r\n");
 return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="waydidi-commission-${period}.csv"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
