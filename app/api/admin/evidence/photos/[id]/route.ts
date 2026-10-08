import { getWaydidiAdmin } from "@/lib/admin";
import { evidenceMedia } from "@/lib/evidence-media";
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
 const admin=await getWaydidiAdmin();
 if(!admin||!["owner","operations"].includes(admin.role)) return new Response(null,{status:403});
 return evidenceMedia((await context.params).id,null,new URL(request.url).searchParams.get("original")==="1");
}
