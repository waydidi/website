import { NextResponse } from "next/server";
import { z } from "zod";
import { agencyForCustomer } from "@/lib/agency";
import { customerFromRequest, overRateLimit } from "@/lib/customer-auth";
import { partnerDb } from "@/lib/partner-portal";
import { sameOrigin, isJsonRequest } from "@/lib/security";
import { env } from "cloudflare:workers";
const schema=z.object({email:z.string().trim().toLowerCase().email().max(254),role:z.enum(["admin","booker","finance","viewer"]),active:z.boolean()});
export async function GET(request:Request){
 const agency=await agencyForCustomer((await customerFromRequest(request))?.customer??null);
 if(!agency||agency.portalRole!=="admin")return NextResponse.json({error:"Partner administrator access required."},{status:403});
 const {results}=await partnerDb().prepare("SELECT email,role,active,created_at FROM partner_members WHERE agency_id=? ORDER BY email").bind(agency.id).all();
 return NextResponse.json({members:results,primaryEmail:agency.email},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
 if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked."},{status:403});
 const customer=(await customerFromRequest(request))?.customer;
 const agency=await agencyForCustomer(customer??null);
 if(!agency||agency.portalRole!=="admin")return NextResponse.json({error:"Partner administrator access required."},{status:403});
 if(await overRateLimit(request,`partner-team:${agency.id}`,20,15,env.RATE_LIMIT_SALT??"waydidi"))return NextResponse.json({error:"Try again later."},{status:429});
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Enter a work email and team role."},{status:400});
 const {email,role,active}=parsed.data;
 if(email===agency.email.toLowerCase()||email===customer!.email.toLowerCase())return NextResponse.json({error:"Ask the primary contact to change your access. The primary contact cannot be removed here."},{status:400});
 // A work email may belong to only one partner. Conditional SQL prevents two
 // partners inviting the same address concurrently.
 try{
 const result=await partnerDb().prepare(`INSERT INTO partner_members(agency_id,email,role,active,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM agency_applications WHERE lower(email)=? AND id<>? AND status='approved') ON CONFLICT(email) DO UPDATE SET role=excluded.role,active=excluded.active WHERE partner_members.agency_id=excluded.agency_id`).bind(agency.id,email,role,active?1:0,new Date().toISOString(),email,agency.id).run();
 if(!result.meta.changes)return NextResponse.json({error:"This email cannot be assigned to this partner. Contact Waydidi."},{status:409});
 await partnerDb().prepare("INSERT INTO partner_audit(id,agency_id,actor,action,details,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),agency.id,customer!.email,"team_access",JSON.stringify({email,role,active}),new Date().toISOString()).run();
 return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:"Team access could not be saved."},{status:503});}
}
