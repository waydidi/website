import {expect,test} from "@playwright/test";
test.use({storageState:"e2e/.auth/admin.json"});
const base={kind:"telegram",id:"review-job",reference:"ABCD23",channel:"telegram",destination:"-100",status:"uncertain",attempts:2,attemptedAt:"2026-10-26T00:00:00Z",nextAttemptAt:null,createdAt:"2026-10-26T00:00:00Z",lastError:"Telegram: delivery outcome unknown",providerMessageId:null,version:"a".repeat(64),canReview:true,canRetry:true,retryBlockedReason:null,canClose:true,canConfirm:true,receiptDestinationType:null,hasRoot:false,needsRoot:false};

test("review retries retain the exact proposal after a lost response and show immutable history",async({page})=>{
 let applied=false;const proposals:Record<string,unknown>[]=[];
 await page.route("**/api/admin/delivery-reviews*",async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==="POST"){
   proposals.push(request.postDataJSON());if(proposals.length===1){await route.fulfill({status:503,json:{error:"Result not confirmed"}});return;}
   if(proposals.length===2){await route.fulfill({json:{ok:true,requestId:"wrong-request",replayed:true}});return;}
   applied=true;await route.fulfill({json:{ok:true,requestId:proposals[0].requestId,replayed:true}});return;
  }
  const job={...base,...(applied?{status:"queued",version:"b".repeat(64)}:{})};
  await route.fulfill({json:url.searchParams.has("jobId")?{job,retryEnabled:true,history:{items:applied?[{sequence:1,request_id:proposals[0].requestId,actor_id:"owner",action:"retry",reason:"confirmed_absent",previous_status:"uncertain",previous_attempts:2,created_at:"2026-10-26T01:00:00Z",provider_message_id:null}]:[],hasMore:false,offset:0}}:{items:[job],hasMore:false,offset:0,retryEnabled:true}});
 });
 await page.goto("/admin/delivery-reviews");await page.getByRole("button",{name:"Review telegram ABCD23"}).click();
 const selected=page.getByRole("region",{name:"Selected delivery"});
 await selected.getByRole("checkbox",{name:"I checked the provider or storage and this delivery did not succeed."}).check();
 await selected.getByRole("button",{name:"Record decision"}).click();await expect(page.getByRole("alert")).toContainText("Result not confirmed");
 await expect(selected.getByRole("combobox",{name:"Decision"})).toBeDisabled();
 await page.getByRole("button",{name:"Retry the same review request"}).click();
 await expect(page.getByRole("alert")).toContainText("not acknowledged");await page.getByRole("button",{name:"Retry the same review request"}).click();
 await expect(page.getByRole("status")).toContainText("original message is queued");expect(proposals).toHaveLength(3);expect(proposals[0]).toEqual(proposals[1]);expect(proposals[0]).toEqual(proposals[2]);expect(proposals[0].expectedVersion).toBe(base.version);expect(proposals[0].confirmedAbsent).toBe(true);
 await expect(selected.getByText("retry · Checked provider: message absent")).toBeVisible();await expect(selected.getByText(/previously uncertain after 2 attempts/)).toBeVisible();
});

test("disabled retry permits an explicit closure without queuing a message",async({page})=>{
 let closed=false;const proposals:Record<string,unknown>[]=[];
 await page.route("**/api/admin/delivery-reviews*",async route=>{
  const url=new URL(route.request().url());if(route.request().method()==="POST"){proposals.push(route.request().postDataJSON());closed=true;await route.fulfill({json:{ok:true,requestId:proposals.at(-1)?.requestId,replayed:false}});return;}
  const job={...base,canRetry:false,retryBlockedReason:"Owner retry is disabled in Worker settings.",...(closed?{status:"cancelled",canReview:false,canClose:false}: {})};
  await route.fulfill({json:url.searchParams.has("jobId")?{job,history:{items:[],hasMore:false,offset:0},retryEnabled:false}:{items:[job],hasMore:false,offset:0,retryEnabled:false}});
 });
 await page.goto("/admin/delivery-reviews?kind=telegram&jobId=review-job");const selected=page.getByRole("region",{name:"Selected delivery"});
 await expect(selected.getByRole("button",{name:"Record decision"})).toBeDisabled();
 await selected.getByRole("combobox",{name:"Decision"}).selectOption("close");await selected.getByRole("combobox",{name:"Reason"}).selectOption("not_required");
 await selected.getByRole("checkbox",{name:"I checked the provider or storage and this delivery did not succeed."}).check();await selected.getByRole("button",{name:"Record decision"}).click();
 await expect(page.getByRole("status")).toContainText("No message was queued");expect(proposals).toHaveLength(1);expect(proposals[0].action).toBe("close");expect(proposals[0].confirmedAbsent).toBe(true);await expect(selected.getByText(/resolved or currently processing/)).toBeVisible();
});

test("a chat receipt requires destination evidence and an explicit first-card decision",async({page})=>{
 const proposals:Record<string,unknown>[]=[];
 await page.route("**/api/admin/delivery-reviews*",async route=>{
  const url=new URL(route.request().url());if(route.request().method()==="POST"){proposals.push(route.request().postDataJSON());await route.fulfill({json:{ok:true,requestId:proposals.at(-1)?.requestId,replayed:false}});return;}
  const job={...base,kind:"chat",receiptDestinationType:"group",needsRoot:true};await route.fulfill({json:url.searchParams.has("jobId")?{job,history:{items:[],hasMore:false,offset:0},retryEnabled:true}:{items:[job],hasMore:false,offset:0,retryEnabled:true}});
 });
 await page.goto("/admin/delivery-reviews?kind=chat&jobId=review-job");const selected=page.getByRole("region",{name:"Selected delivery"});
 await selected.getByRole("combobox",{name:"Decision"}).selectOption("confirm_delivered");await selected.getByRole("textbox",{name:"Observed provider message ID"}).fill("123456");
 await expect(selected.getByRole("textbox",{name:"Observed Telegram chat ID"})).toHaveValue("-100");
 const root=selected.getByRole("checkbox",{name:"Use this observed group message as the conversation’s first card."});await expect(root).not.toBeChecked();await root.check();
 await selected.getByRole("button",{name:"Record decision"}).click();await expect(page.getByRole("status")).toContainText("No message was queued");expect(proposals[0]).toMatchObject({kind:"chat",action:"confirm_delivered",providerMessageId:"123456",destinationType:"group",destinationId:"-100",useAsRoot:true,confirmedAbsent:false});
});

test("delivery filters and history page controls retain the selected job",async({page})=>{
 const queries:string[]=[];let unavailable=false;
 await page.route("**/api/admin/delivery-reviews*",route=>{
  const url=new URL(route.request().url()),offset=Number(url.searchParams.get("offset")??0);queries.push(url.search);
  if(unavailable)return route.fulfill({status:503,json:{error:"Review data unavailable"}});
  return route.fulfill({json:url.searchParams.has("jobId")?{job:{...base,status:"sent",canReview:false},history:{items:[{sequence:100-offset,actor_id:"owner",action:"close",reason:"not_required",previous_status:"uncertain",previous_attempts:2,created_at:"2026-10-26T00:00:00Z",provider_message_id:null}],hasMore:!offset,offset},retryEnabled:true}:{items:[{...base,id:"review-"+offset,reference:"ABCD23"}],hasMore:!offset,offset,retryEnabled:true}});
 });
 await page.goto("/admin/delivery-reviews");await page.getByRole("button",{name:"Next deliveries"}).click();await expect(page.getByRole("button",{name:"Previous deliveries"})).toBeEnabled();
 await page.getByRole("combobox",{name:"Delivery type"}).selectOption("chat");await expect(page.getByRole("button",{name:"Previous deliveries"})).toBeDisabled();
 await page.getByRole("button",{name:"Review telegram ABCD23"}).click();await page.getByRole("button",{name:"Older reviews"}).click();await expect(page.getByRole("button",{name:"Newer reviews"})).toBeEnabled();
 expect(queries.some(query=>query.includes("kind=chat")&&query.includes("offset=0"))).toBe(true);expect(queries.some(query=>query.includes("jobId=review-0")&&query.includes("offset=50"))).toBe(true);
 unavailable=true;await page.getByRole("button",{name:"Refresh",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Review data unavailable");await expect(page.getByText("Could not load the selected delivery. Refresh to retry.")).toBeVisible();await expect(page.getByText("Loading selected delivery…")).toHaveCount(0);
 unavailable=false;await page.getByRole("button",{name:"Refresh",exact:true}).click();await expect(page.getByRole("region",{name:"Selected delivery"})).toBeVisible();await expect(page.getByRole("alert")).toHaveCount(0);
});
