import { NextResponse } from "next/server";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { isJsonRequest, sameOrigin } from "@/lib/security";
export async function POST(request:Request) {
 if(!sameOrigin(request)||!isJsonRequest(request)) return NextResponse.json({error:"Request blocked"},{status:403});
 const input=await request.json().catch(()=>({})) as {token?:string};
 const token=input.token??""; if(token==="session") return NextResponse.json({error:"Invalid link"},{status:400});
 const assignment=await activeAssignmentForToken(token);
 if(!assignment) return NextResponse.json({error:"Driver link expired or revoked."},{status:404});
 const maxAge=Math.max(0,Math.min(12*3600,Math.floor((Date.parse(assignment.tokenExpiresAt)-Date.now())/1000)));
 return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store","Set-Cookie":`waydidi_driver=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}});
}
