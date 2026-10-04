import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { ensureTelegramChat, telegramCall, telegramChatConfig } from "@/lib/telegram-chat";
import { SITE_URL } from "@/lib/site";
const headers={"Cache-Control":"no-store"};
export async function GET(){
 const staff=await getWaydidiAdmin();if(staff?.role!=="owner")return NextResponse.json({error:"Owner access required."},{status:403,headers});
 await ensureTelegramChat();const config=telegramChatConfig();
 const linked=(await env.DB.prepare("SELECT t.telegram_user_id,a.id,a.display_name,a.active FROM website_telegram_staff t JOIN staff_accounts a ON a.id=t.staff_id ORDER BY a.display_name").all()).results;
 const accounts=(await env.DB.prepare("SELECT id,display_name,username FROM staff_accounts WHERE active=1 AND role IN ('owner','support','operations') ORDER BY display_name").all()).results;
 const pending=await env.DB.prepare("SELECT COUNT(*) count FROM website_telegram_deliveries WHERE status<>'sent'").first();
 return NextResponse.json({configured:config.configured,tokenSet:!!config.token,chatSet:!!config.chatId,secretSet:!!config.secret,linked,accounts,pending:pending?.count??0,webhookUrl:`${SITE_URL}/api/webhooks/telegram`},{headers});
}
export async function POST(request:Request){
 if(!sameOrigin(request)||!isJsonRequest(request))return NextResponse.json({error:"Request blocked."},{status:403,headers});
 const staff=await getWaydidiAdmin();if(staff?.role!=="owner")return NextResponse.json({error:"Owner access required."},{status:403,headers});
 const input=await request.json().catch(()=>null) as {action?:string;telegramId?:string;staffId?:string}|null;
 await ensureTelegramChat();
 if(input?.action==="register"){
  if(!telegramChatConfig().configured)return NextResponse.json({error:"Set the bot token, chat ID and webhook secret in Cloudflare first."},{status:400,headers});
  try{await telegramCall("setWebhook",{url:`${SITE_URL}/api/webhooks/telegram`,secret_token:telegramChatConfig().secret,allowed_updates:["message"],drop_pending_updates:false});return NextResponse.json({ok:true},{headers});}catch{return NextResponse.json({error:"Telegram could not register the webhook. Check the bot configuration."},{status:502,headers});}
 }
 if(input?.action==="unlink"&&typeof input.telegramId==="string"){
  await env.DB.prepare("DELETE FROM website_telegram_staff WHERE telegram_user_id=?").bind(input.telegramId).run();return NextResponse.json({ok:true},{headers});
 }
 if(input?.action!=="link"||typeof input.telegramId!=="string"||!/^\d{1,16}$/.test(input.telegramId)||!Number.isSafeInteger(Number(input.telegramId))||Number(input.telegramId)<1||typeof input.staffId!=="string")return NextResponse.json({error:"Choose a staff profile and enter the numeric Telegram user ID."},{status:400,headers});
 const account=await env.DB.prepare("SELECT id FROM staff_accounts WHERE id=? AND active=1 AND role IN ('owner','support','operations')").bind(input.staffId).first();
 if(!account)return NextResponse.json({error:"Choose an active support, operations or owner profile."},{status:400,headers});
 try{await env.DB.prepare("INSERT INTO website_telegram_staff(telegram_user_id,staff_id) VALUES(?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET staff_id=excluded.staff_id").bind(input.telegramId,input.staffId).run();}catch{return NextResponse.json({error:"This staff profile already has a linked Telegram account. Remove that link first."},{status:409,headers});}
 return NextResponse.json({ok:true},{headers});
}
