import type { SecurityDatabase } from "@/lib/worker-db";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { hashStaffPassword, type StaffRole } from "@/lib/staff-security";
import { sameOrigin, isJsonRequest } from "@/lib/security";
export async function GET() {
 const admin=await getWaydidiAdmin(); if(admin?.role!=="owner") return NextResponse.json({error:"Owner access required."},{status:403});
 const {results}=await (env.DB as SecurityDatabase).prepare("SELECT id,username,email,display_name,role,active,mfa_secret IS NOT NULL AS enrolled FROM staff_accounts ORDER BY username").all();
 return NextResponse.json({staff:results},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
 if(!sameOrigin(request)||!isJsonRequest(request)) return NextResponse.json({error:"Request blocked."},{status:403});
 const admin=await getWaydidiAdmin(); if(admin?.role!=="owner") return NextResponse.json({error:"Owner access required."},{status:403});
 const input=await request.json() as {action?:string;id?:string;username?:string;email?:string;password?:string;role?:StaffRole};
 const now=new Date().toISOString();
 if(input.action==="revoke") { await (env.DB as SecurityDatabase).prepare("UPDATE staff_sessions SET revoked_at=? WHERE staff_id=?").bind(now,input.id??admin.id).run(); return NextResponse.json({ok:true}); }
 if(input.action==="disable"&&input.id&&input.id!==admin.id) {
  await (env.DB as SecurityDatabase).batch([(env.DB as SecurityDatabase).prepare("UPDATE staff_accounts SET active=0 WHERE id=? AND role<>'owner'").bind(input.id),(env.DB as SecurityDatabase).prepare("UPDATE staff_sessions SET revoked_at=? WHERE staff_id=?").bind(now,input.id)]);
  return NextResponse.json({ok:true});
 }
 if(input.action!=="create"||!input.username||!/^[a-z0-9._-]{3,60}$/.test(input.username)||!input.email||!/^\S+@\S+\.\S+$/.test(input.email)||!["operations","finance","editor","support"].includes(input.role??"")) return NextResponse.json({error:"Provide a staff ID, email, and permitted role."},{status:400});
 try { const password=await hashStaffPassword(input.password??"");
 await (env.DB as SecurityDatabase).prepare("INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),input.username,input.email.toLowerCase(),input.username,password,input.role,now).run();
 return NextResponse.json({ok:true}); } catch { return NextResponse.json({error:"Use a unique staff ID and a password of 12–200 characters."},{status:400}); }
}
