import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// A driver's step photo is posted to the Telegram group as a reply under the booking card.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__tripPhotos={env:{DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0env';},load(id){if(id==='\0env')return 'export const env=globalThis.__tripPhotos.env';}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sent=[];
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 sent.push({method:String(url).split('/').pop(),form:init.body});
 return Response.json({ok:true,result:{message_id:77,chat:{id:-100}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__tripPhotos;});

test('the step photo goes to the group under the booking card with step, driver, time and GPS',async()=>{
 const {putFile}=await vite.ssrLoadModule('/lib/file-store.ts');
 const {postTripPhoto}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 await putFile('driver-private-evidence/a1/x.jpg',new Uint8Array([0xff,0xd8,0xff,0xd9]),'image/jpeg');
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES('52LLDS',4321,'2026-10-10T00:00:00Z')").run();
 await postTripPhoto({reference:'52LLDS',status:'standby',driverName:'Thanakorn <B>',evidence:{id:'e1',assignment_id:'a1',booking_reference:'52LLDS',leg:'outbound',driver_id:'d1',event_type:'pickup',status_event_id:null,device_captured_at:'2026-10-10T14:24:53.000Z',received_at:'2026-10-10T14:24:55.000Z',confirmed_at:null,latitude:13.7399,longitude:100.5,accuracy_metres:6.2,original_key:'driver-private-evidence/a1/x.jpg',stamped_key:'x.svg',expires_at:'2099-01-01',deleted_at:null}});
 assert.equal(sent.length,1);
 assert.equal(sent[0].method,'sendPhoto');
 const form=sent[0].form;
 assert.equal(form.get('chat_id'),'-100');
 assert.deepEqual(JSON.parse(form.get('reply_parameters')),{message_id:4321,allow_sending_without_reply:true});
 const caption=form.get('caption');
 assert.match(caption,/📸 <b>Stand by<\/b> · 52LLDS/);
 assert.match(caption,/Driver: Thanakorn &lt;B&gt;/);
 assert.match(caption,/21:24:53 ICT/);
 assert.match(caption,/maps\?q=13\.7399,100\.5/);
 const photo=form.get('photo');
 assert.equal(photo.type,'image/jpeg');
 assert.deepEqual([...new Uint8Array(await photo.arrayBuffer())],[0xff,0xd8,0xff,0xd9]);
});
