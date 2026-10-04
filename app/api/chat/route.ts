import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { readCookie } from "@/lib/staff-security";
import { isJsonRequest, sameOrigin, secureToken, sha256 } from "@/lib/security";
import { CHAT_MESSAGE_SELECT, ensureChatAssignments } from "@/lib/website-chat";
const cookie="waydidi_chat";
async function conversation(request:Request) {
 const token=readCookie(request,cookie);if(!/^[a-f0-9]{48}$/.test(token))return null;
 return await env.DB.prepare("SELECT id FROM website_conversations WHERE token_hash=? AND expires_at>?").bind(await sha256(token),new Date().toISOString()).first() as {id:string}|null;
}
export async function GET(request:Request) {
 const chat=await conversation(request);
 if(chat)await ensureChatAssignments(env.DB);
 const messages=chat?(await env.DB.prepare(`${CHAT_MESSAGE_SELECT} WHERE m.conversation_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 100`).bind(chat.id).all()).results.reverse():[];
 const assignment=chat?await env.DB.prepare("SELECT staff_name FROM website_chat_assignments WHERE conversation_id=?").bind(chat.id).first():null;
 return NextResponse.json({messages,assignment},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
 if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked"},{status:403});
 const input=await request.json().catch(()=>({})) as {message?:unknown};
 if(typeof input.message!=="string"||!input.message.trim()||input.message.length>2000)return NextResponse.json({error:"Write a message of up to 2,000 characters."},{status:400});
 const window=Math.floor(Date.now()/900000),fingerprint=await sha256(`chat:${env.RATE_LIMIT_SALT??"waydidi"}:${request.headers.get("cf-connecting-ip")??"unknown"}`);
 const attempt=await env.DB.prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1 WHERE attempts<10 RETURNING attempts").bind(fingerprint,window).first();
 if(!attempt)return NextResponse.json({error:"Please wait a few minutes before sending more messages."},{status:429});
 let chat=await conversation(request),token:string|null=null;const now=new Date().toISOString();
 if(!chat){token=secureToken();chat={id:crypto.randomUUID()};await env.DB.prepare("INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)").bind(chat.id,await sha256(token),new Date(Date.now()+7*86400000).toISOString(),now,now).run();}
 await env.DB.batch([env.DB.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES(?,?,'visitor',?,?)").bind(crypto.randomUUID(),chat.id,input.message.trim(),now),env.DB.prepare("UPDATE website_conversations SET updated_at=? WHERE id=?").bind(now,chat.id)]);
 const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 if(token)response.cookies.set(cookie,token,{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:7*86400});return response;
}
