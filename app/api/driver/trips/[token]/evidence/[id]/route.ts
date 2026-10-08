import { activeAssignmentForToken } from "@/lib/driver-operations";
import { evidenceMedia } from "@/lib/evidence-media";
export async function GET(request:Request, context:{params:Promise<{token:string;id:string}>}) {
 const {token,id}=await context.params;
 const assignment=await activeAssignmentForToken(token);
 if(!assignment) return new Response(null,{status:401,headers:{"Cache-Control":"no-store"}});
 return evidenceMedia(id,assignment.id,new URL(request.url).searchParams.get("original")==="1");
}
