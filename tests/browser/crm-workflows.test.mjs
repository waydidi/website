import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
let server,browser,origin;
before(async()=>{
 server=await createServer({root,configFile:false,resolve:{alias:[{find:'@',replacement:root},{find:'next/navigation',replacement:root+'/tests/browser/fixtures/navigation.ts'},{find:'next/link',replacement:root+'/tests/browser/fixtures/link.tsx'}]},server:{host:'127.0.0.1',port:0},plugins:[{name:'crm-browser-harness',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/?')||req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><div id="root"></div><script type="module" src="/tests/browser/fixtures/crm-entry.tsx"></script></html>');}else next();});}}]});
 await server.listen();origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
});
after(async()=>{await browser?.close();await server?.close();});
const quote={id:'q1',contact_id:'c1',name:'Traveller',lead_id:'lead1',title:'Airport transfer',status:'sent',version:2,pickup:'Bangkok',dropoff:'Pattaya',trip_date:'2030-01-01',trip_time:'09:00',vehicle:'economy_sedan',amount_minor:200000};
const task={id:'t1',contact_id:'c1',name:'Traveller',lead_id:'lead1',title:'Call traveller',status:'open',owner_id:'owner',owner_name:'Owner',due_at:'2030-01-01T02:00:00.000Z'};
async function setup(view,{fail=false}={}){
 const page=await browser.newPage();page.setDefaultTimeout(7000);const errors=[],posts=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/admin/crm?**',async route=>{
  const u=new URL(route.request().url());
  if(u.searchParams.has('id')){
   await new Promise(resolve=>setTimeout(resolve,750));
   const id=u.searchParams.get('id');
   await route.fulfill({status:fail?500:200,json:fail?{error:'Enquiries unavailable'}:{contact:{id,name:id==='c1'?'Traveller':'Other traveller'},leads:[{id:id==='c1'?'lead1':'lead2',title:id==='c1'?'Original enquiry':'Other enquiry',stage:'quoted'}]}});return;
  }
  await route.fulfill({json:{items:u.searchParams.get('view')==='customers'?[{id:'c2',name:'Other traveller',email:'other@example.invalid'}]:[view==='quotes'?quote:task],total:1,page:1,team:[{id:'owner',name:'Owner'}]}});
 });
 await page.route('**/api/admin/crm',async route=>{posts.push(route.request().postDataJSON());await route.fulfill({json:{id:'saved'}});});
 await page.goto(origin+'/?view='+view);return{page,errors,posts};
}
for(const view of ['quotes','tasks'])test(`${view}: delayed enquiries preserve selection through save`,async()=>{
 const {page,errors,posts}=await setup(view);
 try{
  await page.getByRole('button',{name:view==='quotes'?'Revise':'Reschedule',exact:true}).click();
  const lead=page.getByLabel('Linked enquiry (optional)'),save=page.getByRole('button',{name:'Save',exact:true});
  await page.getByRole('status').waitFor();assert.equal(await save.isDisabled(),true);
  assert.equal(await lead.inputValue(),'lead1');
  await page.getByRole('option',{name:'Original enquiry · Quoted'}).waitFor({state:'attached'});
  if(view==='quotes')await page.getByLabel('Expiry (Thailand)').fill('2029-12-01T09:00');
  await save.click();await page.waitForFunction(()=>!document.querySelector('form'));
  assert.equal(posts.length,1);assert.equal(posts[0].leadId,'lead1');assert.equal(posts[0].action,view==='quotes'?'quote':'task');assert.deepEqual(errors,[]);
 }catch(error){console.error('Browser workflow failed',errors,await page.locator('body').innerText());throw error;}finally{await page.close();}
});
test('changing customer clears enquiry and ignores delayed previous-customer results',async()=>{
 const {page,errors,posts}=await setup('quotes');
 try{
  await page.getByRole('button',{name:'Revise',exact:true}).click();
  await page.getByRole('status').waitFor();
  await page.getByLabel('Find customer').fill('Other');
  await page.getByRole('button',{name:/Other traveller/}).click();
  const lead=page.getByLabel('Linked enquiry (optional)');
  await page.getByRole('option',{name:'Other enquiry · Quoted'}).waitFor({state:'attached'});
  assert.equal(await lead.inputValue(),'');
  await lead.selectOption('lead2');await page.getByLabel('Expiry (Thailand)').fill('2029-12-01T09:00');
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('form'));
  assert.equal(posts[0].contactId,'c2');assert.equal(posts[0].leadId,'lead2');assert.deepEqual(errors,[]);
 }catch(error){console.error('Browser workflow failed',errors,await page.locator('body').innerText());throw error;}finally{await page.close();}
});
test('enquiry load failure prevents accidental unlinking on reschedule',async()=>{
 const {page,posts}=await setup('tasks',{fail:true});
 try{
  await page.getByRole('button',{name:'Reschedule',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Enquiries unavailable'}).waitFor();
  assert.equal(await page.getByLabel('Linked enquiry (optional)').inputValue(),'lead1');
  assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);assert.equal(posts.length,0);
 }finally{await page.close();}
});

test('affiliate payout CSV escapes formulas and operations cannot see payout actions',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/admin/affiliates**',async route=>{
  const params=new URL(route.request().url()).searchParams;
  await route.fulfill({json:params.has('kit')?{prices:{}}:params.has('payouts')?{payouts:[{id:'p1',name:'=HYPERLINK("https://example.invalid")',email:'p1@example.invalid',phone:'+66123456789',notes:'\n=SUM(1,2)',rides:1,amount:100,unpaid:100,paid_at:null}]}:{affiliates:[],canPay:false}});
 });
 try{
  await page.goto(origin+'/?affiliates=1');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download CSV',exact:true}).click();
  const stream=await (await download).createReadStream();let csv='';for await(const chunk of stream)csv+=chunk.toString();
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"")"'));assert.ok(csv.includes('"\'\n=SUM(1,2)"'));assert.equal(await page.getByRole('button',{name:'Mark paid',exact:true}).count(),0);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
