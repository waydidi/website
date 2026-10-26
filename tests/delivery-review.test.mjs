import assert from "node:assert/strict";
import test,{after} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {Miniflare} from "miniflare";
import {createServer} from "vite";
import {migrationStatements} from "./helpers/migrations.mjs";
const root=fileURLToPath(new URL("..",import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:"2026-05-22",d1Databases:["DB"]});
const db=await mf.getD1Database("DB");
// Start from the pre-review schema to exercise Worker first-use bootstrap.
// The additive review migration is then applied to populated audit history below.
for(const file of (await readdir(root+"/drizzle")).filter(name=>name.endsWith(".sql")&&!name.startsWith("0115_")).sort()){
 const statements=migrationStatements(await readFile(root+"/drizzle/"+file,"utf8"));if(statements.length)await db.batch(statements.map(sql=>db.prepare(sql)));
}
const owner={id:"review-owner",role:"owner",displayName:"Owner",email:"owner@example.invalid"};
globalThis.__deliveryReview={env:{DB:db,NOTIFICATION_DELIVERY_RETRY:"1"},staff:owner};
const vite=await createServer({root,configFile:false,appType:"custom",resolve:{alias:{"@":root}},server:{middlewareMode:true},plugins:[{
 name:"delivery-review-boundaries",enforce:"pre",
 resolveId(id){if(id==="cloudflare:workers")return "\0review-env";if(id==="@/lib/admin"||id.endsWith("/lib/admin")||id.endsWith("/lib/admin.ts"))return "\0review-admin";},
 load(id){if(id==="\0review-env")return "export const env=globalThis.__deliveryReview.env";if(id==="\0review-admin")return "export async function getWaydidiAdmin(){return globalThis.__deliveryReview.staff}";},
}]});
const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw new Error("No provider request is permitted in a review");};
after(async()=>{assert.equal(network,0);globalThis.fetch=originalFetch;await vite.close();await mf.dispose();delete globalThis.__deliveryReview;});
const reviews=await vite.ssrLoadModule("/lib/delivery-review-db.ts"),rules=await vite.ssrLoadModule("/lib/delivery-review-rules.ts"),route=await vite.ssrLoadModule("/app/api/admin/delivery-reviews/route.ts");
const email=await vite.ssrLoadModule("/lib/booking-delivery-db.ts"),messages=await vite.ssrLoadModule("/lib/telegram/message-store.ts");
await reviews.ensureDeliveryReviews(db);
let sequence=0;
async function booking(){
 const ref="RV"+String(++sequence).padStart(4,"0"),now=new Date().toISOString();
 await db.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,access_token_hash,created_at,updated_at) VALUES(?,'Test Traveller','private@example.invalid','Bangkok','Pattaya','2027-01-01','09:00',1,0,'economy_sedan','cash',1000,'confirmed','cash_due','test',?,?)").bind(ref,now,now).run();return ref;
}
async function fixture(kind,options={}){
 const id=crypto.randomUUID(),now=new Date().toISOString(),at=new Date(Date.now()-3000).toISOString(),ref=await booking();
 if(kind==="telegram"){
  const payload={text:"Private notification PRIVATE_TOKEN",...(options.target?{target:{kind:"booking_card",id:ref}}:{})};
  await db.prepare("INSERT INTO telegram_delivery_jobs(id,booking_reference,destination,payload_json,status,attempts,attempted_at,next_attempt_at,created_at,updated_at) VALUES(?,?,'-100',?,'uncertain',1,?,?,?,?)").bind(id,ref,JSON.stringify(payload),at,at,now,now).run();
  if(options.target)await db.prepare('INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,0,?)').bind(ref,now).run();
 }else if(kind==="booking"){
  await db.prepare("INSERT INTO booking_deliveries(id,booking_reference,channel,recipient,status,attempts,attempted_at,next_attempt_at,created_at,updated_at) VALUES(?,?,'customer_email','private@example.invalid','processing',1,?,?,?,?)").bind(id,ref,at,at,now,now).run();
  await email.freezeDeliveryEmail(db,{id,attempted_at:at,attempts:1,created_at:now,last_error:null},{payload:{from:"from@example.invalid",to:["private@example.invalid"],text:"Private confirmation PRIVATE_TOKEN"},idempotencyKey:"old-key"});
  await db.prepare("UPDATE booking_delivery_payloads SET first_attempt_at=?,send_attempts=1,outcome_unknown=1 WHERE delivery_id=?").bind(at,id).run();
  await db.prepare("UPDATE booking_deliveries SET status='uncertain' WHERE id=?").bind(id).run();
 }else if(kind==="assignment"){
  await db.prepare("INSERT INTO booking_notifications(id,booking_reference,assignment_id,notification_type,channel,recipient,dedupe_key,scheduled_for,status,attempt_count,last_attempt_at,created_at,updated_at) VALUES(?,?,?,'driver_assignment','telegram','-100',?,?,'processing',1,?,?,?)").bind(id,ref,crypto.randomUUID(),id,at,at,now,now).run();
  await messages.freezeTelegramMessage(db,{kind,id,claim:at},{primary:{chat_id:"-100",text:"Private assignment PRIVATE_TOKEN"},context:{tokenHash:"test",bookingVersion:1}});
  await db.prepare("UPDATE booking_notifications SET status='uncertain' WHERE id=?").bind(id).run();
 }else{
  const conversationId=crypto.randomUUID(),claim=crypto.randomUUID();
  await db.prepare("INSERT INTO website_conversations(id,public_id,token_hash,expires_at,created_at,updated_at,telegram_message_id) VALUES(?,?,?,'2099-01-01',?,?,?)").bind(conversationId,"CHAT-"+ref,conversationId,now,now,options.root?null:900).run();
  await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,telegram_status) VALUES(?,?,'visitor','Private question PRIVATE_TOKEN',?,'processing')").bind(id,conversationId,now).run();
  await db.prepare("INSERT INTO telegram_chat_delivery_attempts(message_id,claim_id,attempted_at,destination,attempts) VALUES(?,?,?,'-100',1)").bind(id,claim,at).run();
  await messages.freezeTelegramMessage(db,{kind,id,claim},{primary:{chat_id:"-100",text:"Private chat PRIVATE_TOKEN"},context:{group:"-100",root:Boolean(options.root),dm:false}});
  if(options.root)await db.prepare("INSERT INTO telegram_chat_card_claims(conversation_id,message_id,claim_id,attempted_at) VALUES(?,?,?,?)").bind(conversationId,id,claim,at).run();
  await db.prepare("UPDATE website_chat_messages SET telegram_status='uncertain' WHERE id=?").bind(id).run();
  return {kind,id,ref,conversationId};
 }
 return {kind,id,ref};
}
const state=job=>reviews.deliveryReviewJob(db,job.kind,job.id);
const publicJob=async job=>reviews.publicDeliveryJob(await state(job),true);
async function proposal(job,action="retry",extra={}){return rules.deliveryReviewSchema.parse({requestId:crypto.randomUUID(),kind:job.kind,jobId:job.id,expectedVersion:(await publicJob(job)).version,action,reason:action==="retry"?"confirmed_absent":action==="close"?"not_required":"verified_in_provider",confirmedAbsent:action!=="confirm_delivered",...(action==="confirm_delivered"?{providerMessageId:job.kind==="booking"?"receipt-id":"123456"}:{}),...extra});}
const post=body=>route.POST(new Request("https://example.invalid/api/admin/delivery-reviews",{method:"POST",headers:{origin:"https://example.invalid","content-type":"application/json"},body:JSON.stringify(body)}));

test("review API denies guests and every non-owner role before reading or mutating deliveries",async()=>{
 for(const role of [null,"support","operations","finance","editor"]){
  globalThis.__deliveryReview.staff=role?{...owner,role}:null;
  for(const response of [await route.GET(new Request("https://example.invalid/api/admin/delivery-reviews")),await post({})]){assert.equal(response.status,role?403:401);assert.equal(response.headers.get("cache-control"),"no-store");}
 }
 globalThis.__deliveryReview.staff=owner;
 const security=await vite.ssrLoadModule("/lib/staff-security.ts");for(const role of ["support","operations","finance","editor"])assert.equal(security.allowedStaffRoute(role,"/api/admin/delivery-reviews","POST"),false);
});

test("default-off retry flag is enforced, but absence reviews remain available",async()=>{
 const job=await fixture("telegram"),body=await proposal(job);delete globalThis.__deliveryReview.env.NOTIFICATION_DELIVERY_RETRY;
 try{assert.equal((await post(body)).status,409);assert.equal((await state(job)).status,"uncertain");assert.equal((await post(await proposal(job,"close"))).status,200);assert.equal((await state(job)).status,"cancelled");}
 finally{globalThis.__deliveryReview.env.NOTIFICATION_DELIVERY_RETRY="1";}
});

test("invalid confirmation, provider IDs, reasons, filters and cross-origin writes are rejected",async()=>{
 const job=await fixture("telegram"),body=await proposal(job);
 for(const change of [{confirmedAbsent:false},{reason:"verified_in_provider"},{requestId:"bad"},{expectedVersion:"stale"},{extra:"untrusted"}])assert.equal((await post({...body,...change})).status,400);
 assert.equal((await route.POST(new Request("https://example.invalid/api/admin/delivery-reviews",{method:"POST",headers:{origin:"https://other.invalid","content-type":"application/json"},body:JSON.stringify(body)}))).status,403);
 for(const query of ["kind=other","offset=-1","offset=1","state=other","kind=all&jobId=test"])assert.equal((await route.GET(new Request("https://example.invalid/api/admin/delivery-reviews?"+query))).status,400);
});

test("all four queues commit an audit decision and preserve attempts and original messages",async()=>{
 for(const kind of rules.deliveryKinds){
  const job=await fixture(kind),before=await state(job),body=await proposal(job),result=await post(body);assert.equal(result.status,200);
  const after=await state(job);assert.equal(after.status,["booking","chat"].includes(kind)?"pending":"queued");assert.equal(after.attempts,before.attempts);assert.equal(after.raw_payload,before.raw_payload);assert.equal(after.payload_version,before.payload_version);
  const history=await reviews.deliveryReviewHistory(db,kind,job.id);assert.equal(history.items.length,1);assert.equal(history.items[0].previous_status,"uncertain");assert.equal(history.items[0].previous_attempts,1);assert.equal(history.items[0].actor_id,owner.id);
  if(kind==="booking"){const payload=await db.prepare('SELECT send_attempts,outcome_unknown FROM booking_delivery_payloads WHERE delivery_id=?').bind(job.id).first();assert.equal(payload.send_attempts,1);assert.equal(payload.outcome_unknown,1);}
 }
});

test("parallel retries of one request commit once and changed request payloads conflict",async()=>{
 const job=await fixture("telegram"),body=await proposal(job),responses=await Promise.all([post(body),post(body)]);assert.ok(responses.every(response=>response.status===200));
 assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items.length,1);
 assert.equal((await post({...body,reason:"configuration_corrected"})).status,409);
 delete globalThis.__deliveryReview.env.NOTIFICATION_DELIVERY_RETRY;
 try{const replay=await post(body);assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);}
 finally{globalThis.__deliveryReview.env.NOTIFICATION_DELIVERY_RETRY="1";}
});

test("different owners' simultaneous proposals for the same version have one winner",async()=>{
 const job=await fixture("telegram"),first=await proposal(job),second={...first,requestId:crypto.randomUUID()};
 const results=await Promise.allSettled([reviews.applyDeliveryReview(db,"owner-one",first,true),reviews.applyDeliveryReview(db,"owner-two",second,true)]);
 assert.equal(results.filter(result=>result.status==="fulfilled").length,1);assert.equal(results.filter(result=>result.status==="rejected"&&result.reason.status===409).length,1);
 assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items.length,1);
});

test("a stale proposal cannot override a newly processing or completed attempt",async()=>{
 const job=await fixture("telegram"),body=await proposal(job);
 await db.prepare("UPDATE telegram_delivery_jobs SET status='processing',attempts=attempts+1,attempted_at=? WHERE id=?").bind(new Date().toISOString(),job.id).run();
 assert.equal((await post(body)).status,409);assert.equal((await state(job)).status,"processing");assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items.length,0);
});

test("an injected audit failure rolls back the queue change and preserves request retry safety",async()=>{
 const job=await fixture("telegram"),body=await proposal(job);await db.prepare("CREATE TRIGGER reject_review_insert BEFORE INSERT ON notification_delivery_reviews BEGIN SELECT RAISE(ABORT,'test fault'); END").run();
 try{assert.equal((await post(body)).status,503);assert.equal((await state(job)).status,"uncertain");assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items.length,0);}
 finally{await db.prepare('DROP TRIGGER reject_review_insert').run();}
 assert.equal((await post(body)).status,200);assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items.length,1);
});

test("audit history rejects updates and deletes at the database boundary",async()=>{
 const job=await fixture("telegram"),body=await proposal(job,"close");assert.equal((await post(body)).status,200);
 await assert.rejects(()=>db.prepare("UPDATE notification_delivery_reviews SET reason='changed' WHERE request_id=?").bind(body.requestId).run(),/immutable/);
 await assert.rejects(()=>db.prepare('DELETE FROM notification_delivery_reviews WHERE request_id=?').bind(body.requestId).run(),/immutable/);
});

test("retry review cannot bypass provider holds, queue age, attempt budgets or email deduplication expiry",async()=>{
 for(const kind of rules.deliveryKinds){
  const job=await fixture(kind);
  if(kind==="booking")await db.prepare("UPDATE booking_delivery_payloads SET first_attempt_at=? WHERE delivery_id=?").bind(new Date(Date.now()-24*3600000).toISOString(),job.id).run();
  if(kind==="telegram")await db.prepare('UPDATE telegram_delivery_jobs SET attempts=12 WHERE id=?').bind(job.id).run();
  if(kind==="assignment")await db.prepare("UPDATE booking_notifications SET created_at='2000-01-01' WHERE id=?").bind(job.id).run();
  if(kind==="chat")await db.prepare('UPDATE telegram_chat_payloads SET next_attempt_at=? WHERE id=?').bind(new Date(Date.now()+3600000).toISOString(),job.id).run();
  const body=await proposal(job);assert.equal((await publicJob(job)).canRetry,false);assert.equal((await post(body)).status,409);assert.equal((await state(job)).status,"uncertain");
 }
});

test("corrupt snapshots cannot be queued for a reviewed retry",async()=>{
 const job=await fixture("chat");await db.prepare("UPDATE telegram_chat_payloads SET payload_json='{}' WHERE id=?").bind(job.id).run();assert.equal((await post(await proposal(job))).status,409);assert.equal((await state(job)).status,"uncertain");
});

test("confirmed provider receipts repair booking-card routing in the same audited transaction",async()=>{
 const job=await fixture("telegram",{target:true}),body=await proposal(job,"confirm_delivered");assert.equal((await post(body)).status,200);
 assert.equal((await state(job)).status,"sent");assert.equal((await db.prepare('SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?').bind(job.ref).first()).telegram_message_id,123456);
 assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items[0].provider_message_id,"123456");
});

test("an observed chat root receipt repairs the root and reply mapping, then releases the held claim",async()=>{
 const job=await fixture("chat",{root:true}),body=await proposal(job,"confirm_delivered",{destinationType:"group",destinationId:"-100",useAsRoot:true});assert.equal((await post(body)).status,200);
 assert.equal((await db.prepare('SELECT telegram_message_id FROM website_conversations WHERE id=?').bind(job.conversationId).first()).telegram_message_id,123456);
 assert.equal((await db.prepare("SELECT conversation_id FROM telegram_message_routes WHERE chat_id='-100' AND message_id=123456").first()).conversation_id,job.conversationId);
 assert.equal(await db.prepare('SELECT * FROM telegram_chat_card_claims WHERE message_id=?').bind(job.id).first(),null);
});

test("closing an absent root notification releases its claim without inventing a root or sending",async()=>{
 const job=await fixture("chat",{root:true});assert.equal((await post(await proposal(job,"close"))).status,200);assert.equal((await state(job)).status,"skipped");
 assert.equal((await db.prepare('SELECT telegram_message_id FROM website_conversations WHERE id=?').bind(job.conversationId).first()).telegram_message_id,null);
 assert.equal(await db.prepare('SELECT * FROM telegram_chat_card_claims WHERE message_id=?').bind(job.id).first(),null);
});

test("owner receipt confirmation updates booking email summary without moving money or booking status",async()=>{
 const job=await fixture("booking"),before=await db.prepare('SELECT status,payment_status,total FROM bookings WHERE reference=?').bind(job.ref).first();assert.equal((await post(await proposal(job,"confirm_delivered"))).status,200);
 const after=await db.prepare('SELECT status,payment_status,total,email_status FROM bookings WHERE reference=?').bind(job.ref).first();assert.equal(after.email_status,"sent");assert.equal(after.status,before.status);assert.equal(after.payment_status,before.payment_status);assert.equal(after.total,before.total);
});

test("review lists and history never return message bodies or tokens, and paging is complete",async()=>{
 const legacy=await fixture("telegram");await db.prepare("UPDATE telegram_delivery_jobs SET last_error='Provider echoed PRIVATE_TOKEN private@example.invalid' WHERE id=?").bind(legacy.id).run();
 const legacyView=await (await route.GET(new Request(`https://example.invalid/api/admin/delivery-reviews?kind=telegram&jobId=${legacy.id}`))).json();assert.equal(legacyView.job.lastError,"Previous delivery failure; check the provider.");assert.ok(!JSON.stringify(legacyView).includes("PRIVATE_TOKEN"));
 for(let i=0;i<55;i++)await fixture("telegram");
 const first=await route.GET(new Request('https://example.invalid/api/admin/delivery-reviews?kind=telegram&state=all'));assert.equal(first.status,200);const page=await first.json();assert.equal(page.items.length,50);assert.equal(page.hasMore,true);assert.ok(!JSON.stringify(page).includes("PRIVATE_TOKEN"));assert.ok(!JSON.stringify(page).includes("Private notification"));
 const next=await (await route.GET(new Request('https://example.invalid/api/admin/delivery-reviews?kind=telegram&state=all&offset=50'))).json();assert.ok(next.items.length>0);assert.ok(!next.items.some(item=>page.items.some(previous=>previous.id===item.id)));
});

test("job version remains stale after an accepted decision even if physical queue fields are restored",async()=>{
 const job=await fixture("telegram"),before=await state(job),body=await proposal(job);assert.equal((await post(body)).status,200);
 await db.prepare('UPDATE telegram_delivery_jobs SET status=?,next_attempt_at=?,updated_at=?,last_error=? WHERE id=?').bind(before.status,before.next_attempt_at,before.updated_at,before.last_error,job.id).run();
 assert.equal((await post({...body,requestId:crypto.randomUUID()})).status,409);assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items.length,1);
});

test("a receipt cannot be replaced, redirected or used to overwrite another conversation card",async()=>{
 const job=await fixture("chat",{root:true});
 assert.equal((await post(await proposal(job,"confirm_delivered",{destinationType:"group",destinationId:"-999",useAsRoot:true}))).status,409);
 const body=await proposal(job,"confirm_delivered",{destinationType:"group",destinationId:"-100",useAsRoot:true});
 await db.prepare('UPDATE website_conversations SET telegram_message_id=444 WHERE id=?').bind(job.conversationId).run();
 assert.equal((await post(body)).status,409);assert.equal((await state(job)).status,"uncertain");assert.equal((await db.prepare('SELECT telegram_message_id FROM website_conversations WHERE id=?').bind(job.conversationId).first()).telegram_message_id,444);
});

test("history pagination retains every accepted review and unattempted legacy-email ambiguity stays held",async()=>{
 const job=await fixture("telegram");
 for(let i=0;i<52;i++)await reviews.applyDeliveryReview(db,owner.id,await proposal(job),true);
 const first=await reviews.deliveryReviewHistory(db,job.kind,job.id),second=await reviews.deliveryReviewHistory(db,job.kind,job.id,50);
 assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.equal(second.items.length,2);assert.ok(!second.items.some(row=>first.items.some(previous=>previous.sequence===row.sequence)));
 const legacy=await fixture("booking");await db.prepare('DELETE FROM booking_delivery_payloads WHERE delivery_id=?').bind(legacy.id).run();await db.prepare('UPDATE booking_deliveries SET attempts=0 WHERE id=?').bind(legacy.id).run();
 assert.equal((await publicJob(legacy)).canRetry,false);assert.equal((await post(await proposal(legacy))).status,409);
});

test("an observed legacy chat receipt requires an explicit root decision and cannot steal another conversation's route",async()=>{
 const job=await fixture("chat",{root:true});await db.prepare('DELETE FROM telegram_chat_payloads WHERE id=?').bind(job.id).run();
 assert.equal((await post(await proposal(job,"confirm_delivered",{providerMessageId:"234567",destinationType:"group",destinationId:"-100"}))).status,400);
 assert.equal((await post(await proposal(job,"confirm_delivered",{providerMessageId:"123456",destinationType:"group",destinationId:"-100",useAsRoot:true}))).status,409);
 assert.equal((await state(job)).status,"uncertain");assert.equal((await reviews.deliveryReviewHistory(db,job.kind,job.id)).items.length,0);
 assert.equal((await post(await proposal(job,"confirm_delivered",{providerMessageId:"234567",destinationType:"group",destinationId:"-100",useAsRoot:true}))).status,200);
 assert.equal((await db.prepare("SELECT conversation_id FROM telegram_message_routes WHERE chat_id='-100' AND message_id=234567").first()).conversation_id,job.conversationId);
});

test("simultaneously checked receipts cannot be assigned to two different conversations",async()=>{
 const first=await fixture("chat",{root:true}),second=await fixture("chat",{root:true});
 const inputs=await Promise.all([first,second].map(job=>proposal(job,"confirm_delivered",{providerMessageId:"345678",destinationType:"group",destinationId:"-100",useAsRoot:true})));
 let checked=0,release;const barrier=new Promise(resolve=>{release=resolve;});
 const guarded={prepare(sql){let original=db.prepare(sql);return {get underlying(){return original;},bind(...values){original=original.bind(...values);return this;},async first(){const value=await original.first();if(sql.startsWith('SELECT 1 x FROM (SELECT conversation_id')&&!value){checked++;if(checked===2)release();await barrier;}return value;},run(){return original.run();},all(){return original.all();}};},batch(statements){return db.batch(statements.map(statement=>statement.underlying));}};
 const results=await Promise.allSettled(inputs.map(input=>reviews.applyDeliveryReview(guarded,owner.id,input,true)));
 assert.equal(checked,2);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
 const row=await db.prepare("SELECT conversation_id FROM telegram_message_routes WHERE chat_id='-100' AND message_id=345678").first();assert.ok([first.conversationId,second.conversationId].includes(row.conversation_id));
 assert.equal((await reviews.deliveryReviewHistory(db,'chat',first.id)).items.length+(await reviews.deliveryReviewHistory(db,'chat',second.id)).items.length,1);
});

test("applying the additive migration and repeated bootstrap preserves populated immutable history",async()=>{
 const before=await db.prepare('SELECT COUNT(*) n FROM notification_delivery_reviews').first();assert.ok(before.n>0);
 const statements=migrationStatements(await readFile(root+'/drizzle/0115_notification_delivery_reviews.sql','utf8'));await db.batch(statements.map(sql=>db.prepare(sql)));
 await Promise.all([reviews.ensureDeliveryReviews(db),reviews.ensureDeliveryReviews(db)]);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM notification_delivery_reviews').first()).n,before.n);
 await assert.rejects(()=>db.prepare('DELETE FROM notification_delivery_reviews').run(),/immutable/);
});
