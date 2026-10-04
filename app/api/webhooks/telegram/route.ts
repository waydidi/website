import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/security";
import { acceptTelegramChatReply, telegramChatConfig, type TelegramUpdate } from "@/lib/telegram-chat";
export async function POST(request:Request){
 const config=telegramChatConfig();
 if(!config.configured)return NextResponse.json({error:"Telegram chat is not configured."},{status:503});
 if(!constantTimeEqual(request.headers.get("x-telegram-bot-api-secret-token")??"",config.secret))return NextResponse.json({error:"Invalid webhook secret."},{status:401});
 const raw=await request.text();if(raw.length>32000)return NextResponse.json({error:"Payload too large."},{status:413});
 let update:TelegramUpdate;try{update=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid payload."},{status:400});}
 if(!update||typeof update!=="object")return NextResponse.json({error:"Invalid update."},{status:400});
 const result=await acceptTelegramChatReply(update);
 const feedback=result.status==="delivered"?"Reply delivered to the customer on website chat.":result.status==="assigned_elsewhere"?"This chat is assigned to another admin. Open Website Chat to coordinate the reply.":result.status==="unavailable"?"This website conversation is unavailable or expired.":null;
 return NextResponse.json(feedback?{method:"sendMessage",chat_id:config.chatId,text:feedback,reply_parameters:{message_id:update.message!.message_id}}:{ok:true},{headers:{"Cache-Control":"no-store"}});
}
