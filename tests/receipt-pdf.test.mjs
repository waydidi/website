import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {Miniflare} from 'miniflare';
import {PDFDocument} from 'pdf-lib';
import {migrationStatements} from './helpers/migrations.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(x=>x.endsWith('.sql')).sort()){
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
const s=globalThis.__receiptTest={env:{DB:d1},session:null,admin:null,owned:null};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'receipt-boundaries',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0receipt-env';if(id.endsWith('/lib/customer-auth'))return '\0receipt-auth';if(id.endsWith('/lib/admin'))return '\0receipt-admin';},load(id){if(id==='\0receipt-env')return 'export const env=globalThis.__receiptTest.env';if(id==='\0receipt-auth')return 'export async function customerFromRequest(){return globalThis.__receiptTest.session};export async function customerBooking(_c,ref){const b=globalThis.__receiptTest.owned;return b?.reference===ref?b:null}';if(id==='\0receipt-admin')return 'export async function getWaydidiAdmin(){return globalThis.__receiptTest.admin}';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__receiptTest;});
const {getDb}=await vite.ssrLoadModule('/db/index.ts'),db=getDb();
const schema=await vite.ssrLoadModule('/db/schema.ts');
const {buildReceipt,receiptIssuer}=await vite.ssrLoadModule('/lib/receipt.ts');
const {receiptForBooking}=await vite.ssrLoadModule('/lib/receipt-db.ts');
const {createReceiptPdf}=await vite.ssrLoadModule('/lib/receipt-pdf.ts');
const customer=await vite.ssrLoadModule('/app/api/account/trips/[reference]/receipt/route.ts');
const staff=await vite.ssrLoadModule('/app/api/admin/payments/[reference]/receipt/route.ts');
const extras={discount:null,memberDiscount:null,addons:[],taxInvoice:null};
const issuer=receiptIssuer({});
let seq=0;
async function seed(overrides={}){
 const b={reference:'RECEIPT'+(++seq),customerName:'Narubordee Test',customerEmail:'test@example.invalid',pickup:'BKK',dropoff:'Pattaya',pickupDate:'2026-11-01',pickupTime:'09:00',passengers:2,luggage:1,vehicle:'Sedan',paymentMethod:'cash',total:1070,status:'confirmed',paymentStatus:'paid',amountPaid:1070,accessTokenHash:'test',createdAt:'2026-10-08T10:00:00Z',updatedAt:'2026-10-08T10:00:00Z',...overrides};
 await db.insert(schema.bookings).values(b);return (await db.select().from(schema.bookings).where((await import('drizzle-orm')).eq(schema.bookings.reference,b.reference)))[0];
}
test('unpaid cash and misleading paid labels cannot produce receipts; test and disputed payments blocked',async()=>{
 for(const overrides of [{amountPaid:0,paymentStatus:'paid'},{amountPaid:0,paymentStatus:'cash_due'},{paymentMethod:'test'},{paymentStatus:'disputed'}]){
  const b=await seed(overrides);await assert.rejects(()=>receiptForBooking(b));
 }
});
test('exact satang breakdown, partial payment, discounts, overtime, refunds and inclusive VAT',async()=>{
 const b=await seed();
 const full={booking:b,extras:{...extras,discount:{code:'PROMO',amount:100},addons:[{label:'Child seat',amount:200}]},issuer};
 const r=buildReceipt(full);assert.equal(r.items.reduce((n,x)=>n+x.totalMinor,0),107000);assert.equal(r.kind,'receipt');
 const partial=buildReceipt({...full,booking:{...b,amountPaid:500,paymentStatus:'cash_due'},overtimeMinor:30000,overtimeReceivedMinor:10000});assert.equal(partial.receivedMinor,60000);assert.equal(partial.outstandingMinor,77000);
 const taxed=buildReceipt({...full,tax:{name:'บริษัท ทดสอบ จำกัด',address:'กรุงเทพมหานคร',taxId:'0105555555555',branch:'สำนักงานใหญ่'},issuer:receiptIssuer({WAYDIDI_RECEIPT_VAT_REGISTERED:'1',WAYDIDI_RECEIPT_ISSUER_ADDRESS:'Bangkok',WAYDIDI_RECEIPT_ISSUER_TAX_ID:'0105555555555'})});assert.equal(taxed.kind,'tax_invoice');assert.equal(taxed.subtotalMinor,100000);assert.equal(taxed.vatMinor,7000);assert.equal(taxed.totalMinor,107000);
 const refunded=buildReceipt({...full,booking:{...b,refundAmount:100,paymentStatus:'partially_refunded'}});assert.equal(refunded.refundedMinor,10000);
 assert.throws(()=>receiptIssuer({WAYDIDI_RECEIPT_VAT_REGISTERED:'1'}),/incomplete/);
 assert.throws(()=>buildReceipt({...full,booking:{...b,amountPaid:2000}}),/consistent/);
});
test('concurrent downloads retain one immutable document number and billing snapshot',async()=>{
 const b=await seed();
 await db.insert(schema.bookingTaxInvoices).values({id:crypto.randomUUID(),bookingReference:b.reference,name:'บริษัท ทดสอบ จำกัด',taxId:'0105555555555',branch:'สำนักงานใหญ่',address:'123 ถนนสุขุมวิท กรุงเทพฯ 10110',createdAt:b.createdAt});
 const receipts=await Promise.all([receiptForBooking(b),receiptForBooking(b),receiptForBooking(b)]);
 assert.equal(new Set(receipts.map(r=>r.number)).size,1);assert.equal(receipts[0].customer.address,'123 ถนนสุขุมวิท กรุงเทพฯ 10110');
 assert.equal((await d1.prepare('SELECT COUNT(*) n FROM booking_receipt_documents WHERE booking_reference=?').bind(b.reference).first()).n,1);
 await d1.prepare('UPDATE booking_tax_invoices SET name=? WHERE booking_reference=?').bind('Changed',b.reference).run();
 assert.equal((await receiptForBooking(b)).customer.name,'บริษัท ทดสอบ จำกัด');
 const revised=await receiptForBooking({...b,refundAmount:100,paymentStatus:'partially_refunded'});assert.notEqual(revised.number,receipts[0].number);assert.equal(revised.refundedMinor,10000);
});
test('customer ownership and finance role gates; private PDF response',async()=>{
 const b=await seed(),ctx={params:Promise.resolve({reference:b.reference})},req=new Request('https://example.invalid/receipt');
 assert.equal((await customer.GET(req,ctx)).status,401);
 s.session={customer:{id:'test'}};s.owned=null;assert.equal((await customer.GET(req,ctx)).status,404);
 s.owned=b;const result=await customer.GET(req,ctx);assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),'application/pdf');assert.match(result.headers.get('cache-control'),/private, no-store/);
 assert.equal((await staff.GET(req,ctx)).status,401);s.admin={role:'operations'};assert.equal((await staff.GET(req,ctx)).status,403);s.admin={role:'finance'};assert.equal((await staff.GET(req,ctx)).status,200);
});
test('Thai billing details preserved; long content paginates; generate visual fixture',async()=>{
 const b=await seed();const draft=buildReceipt({booking:{...b,pickup:'สนามบินสุวรรณภูมิ',dropoff:'พัทยา'},extras,issuer:{...issuer,name:'Waydidi Travel',address:'Bangkok, Thailand'}});
 const fixture={...draft,number:'R-20261008-SAMPLE',issuedAt:'2026-10-08T12:00:00Z',customer:{name:'บริษัท ตัวอย่าง จำกัด',taxId:'0105555555555',branch:'สำนักงานใหญ่',address:'123 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',email:'accounts@example.invalid'}};
 const bytes=await createReceiptPdf(fixture);const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);
 await mkdir(root+'/outputs/receipts',{recursive:true});await writeFile(root+'/outputs/receipts/Waydidi-Receipt-Sample.pdf',bytes);
 const long=await createReceiptPdf({...fixture,items:[{description:'Long route details '.repeat(300),quantity:1,unitMinor:107000,totalMinor:107000}]});assert.ok((await PDFDocument.load(long)).getPageCount()>1);
});
