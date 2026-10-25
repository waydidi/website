import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { deliveryKinds, deliveryReviewSchema, REVIEW_PAGE_SIZE } from "@/lib/delivery-review-rules";
import { ensureDeliveryReviews, listDeliveryReviews, deliveryReviewJob, publicDeliveryJob, deliveryReviewHistory, applyDeliveryReview, DeliveryReviewError } from "@/lib/delivery-review-db";

const headers={"Cache-Control":"no-store"};
const reply=(error:string,status:number)=>NextResponse.json({error},{status,headers});
export async function GET(request:Request){
  const staff=await getWaydidiAdmin();if(!staff)return reply("Unauthorized",401);if(staff.role!=="owner")return reply("Owner access required.",403);
  const url=new URL(request.url),kind=url.searchParams.get("kind")??"all",id=url.searchParams.get("jobId"),rawOffset=url.searchParams.get("offset")??"0",state=url.searchParams.get("state")??"open";
  if(!["all",...deliveryKinds].includes(kind)||!/^\d{1,9}$/.test(rawOffset)||Number(rawOffset)%REVIEW_PAGE_SIZE||!["open","all"].includes(state)||id&&(kind==="all"||id.length>500))return reply("Invalid review filter or page.",400);
  try{
    await ensureDeliveryReviews(env.DB);const enabled=env.NOTIFICATION_DELIVERY_RETRY==="1";
    if(id){
      const job=await deliveryReviewJob(env.DB,kind as typeof deliveryKinds[number],id);if(!job)return reply("Delivery not found.",404);
      return NextResponse.json({job:await publicDeliveryJob(job,enabled),history:await deliveryReviewHistory(env.DB,job.kind,id,Number(rawOffset)),retryEnabled:enabled},{headers});
    }
    return NextResponse.json({...await listDeliveryReviews(env.DB,{kind:kind as typeof deliveryKinds[number]|"all",offset:Number(rawOffset),state:state as "open"|"all"},enabled),retryEnabled:enabled},{headers});
  }catch{return reply("Delivery reviews could not be loaded.",503);}
}
export async function POST(request:Request){
  const staff=await getWaydidiAdmin();if(!staff)return reply("Unauthorized",401);if(staff.role!=="owner"||!sameOrigin(request)||!isJsonRequest(request))return reply("Request blocked.",403);
  const raw=await request.text();if(raw.length>4096)return reply("Review request is too large.",413);
  let value:unknown;try{value=JSON.parse(raw);}catch{return reply("Invalid review request.",400);}
  const parsed=deliveryReviewSchema.safeParse(value);if(!parsed.success)return reply(parsed.error.issues[0]?.message??"Check the review decision.",400);
  try{
    await ensureDeliveryReviews(env.DB);
    return NextResponse.json(await applyDeliveryReview(env.DB,staff.id,parsed.data,env.NOTIFICATION_DELIVERY_RETRY==="1"),{headers});
  }catch(error){return reply(error instanceof DeliveryReviewError?error.message:"The review was not committed. Retry the same request ID.",error instanceof DeliveryReviewError?error.status:503);}
}
