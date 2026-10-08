import { evidenceDb, type EvidenceRow } from "@/lib/trip-evidence";
import { getFile } from "@/lib/file-store";
export async function evidenceMedia(id:string,assignmentId:string|null,original=false) {
 const headers={"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer", "Content-Security-Policy":"default-src 'none'; img-src data:; sandbox"};
 const row=await evidenceDb().prepare("SELECT * FROM driver_trip_evidence WHERE id=? AND deleted_at IS NULL AND expires_at>?"+(assignmentId?" AND assignment_id=?":"")).bind(...[id,new Date().toISOString(),...(assignmentId?[assignmentId]:[])]).first<EvidenceRow>();
 if(!row) return new Response(null,{status:404,headers});
 const object=await getFile(original?row.original_key:row.stamped_key);
 if(!object) return new Response(null,{status:404,headers});
 return new Response(object.body,{headers:{...headers,"Content-Type":original?"image/jpeg":"image/svg+xml","Content-Disposition":`inline; filename="trip-evidence.${original?'jpg':'svg'}"`}});
}
