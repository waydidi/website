import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
export async function GET(request:Request) {
 const staff=await getWaydidiAdmin();if(!staff||!["owner","support","operations"].includes(staff.role))return NextResponse.json({error:"Support staff access required."},{status:403});
 const id=new URL(request.url).searchParams.get("id");
 const data=id?{messages:(await env.DB.prepare("SELECT sender,body,created_at FROM website_chat_messages WHERE conversation_id=? ORDER BY created_at,id LIMIT 200").bind(id).all()).results}:{conversations:(await env.DB.prepare("SELECT c.id,c.updated_at,(SELECT body FROM website_chat_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) preview FROM website_conversations c WHERE c.expires_at>? ORDER BY c.updated_at DESC LIMIT 100").bind(new Date().toISOString()).all()).results};
 return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
 if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked"},{status:403});
 const staff=await getWaydidiAdmin();if(!staff||!["owner","support","operations"].includes(staff.role))return NextResponse.json({error:"Support staff access required."},{status:403});
 const input=await request.json() as {id?:string;message?:string};if(!input.id||typeof input.message!=="string"||!input.message.trim()||input.message.length>2000)return NextResponse.json({error:"Conversation and message required."},{status:400});
 const now=new Date().toISOString();const result=await env.DB.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,staff_id,created_at) SELECT ?,id,'staff',?,?,? FROM website_conversations WHERE id=? AND expires_at>?").bind(crypto.randomUUID(),input.message.trim(),staff.id,now,input.id,now).run();
 if(!result.meta.changes)return NextResponse.json({error:"Conversation expired."},{status:404});
 await env.DB.prepare("UPDATE website_conversations SET updated_at=? WHERE id=?").bind(now,input.id).run();return NextResponse.json({ok:true});
}
