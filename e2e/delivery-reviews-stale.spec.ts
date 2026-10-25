import {expect,test} from "@playwright/test";
test.use({storageState:"e2e/.auth/admin.json"});

test("refreshing a stale review clears the old provider attestation before a new decision",async({page})=>{
 let version="a".repeat(64);const proposals:Record<string,unknown>[]=[];
 await page.route("**/api/admin/delivery-reviews*",async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==="POST"){
   proposals.push(route.request().postDataJSON());version="b".repeat(64);
   await route.fulfill(proposals.length===1?{status:409,json:{error:"Delivery changed; refresh it."}}:{json:{ok:true,requestId:proposals.at(-1)?.requestId,replayed:false}});return;
  }
  const job={kind:"telegram",id:"stale-job",reference:"ABCD23",channel:"telegram",destination:"-100",status:"uncertain",attempts:2,attemptedAt:null,nextAttemptAt:null,createdAt:"2026-10-26T00:00:00Z",lastError:null,providerMessageId:null,version,canReview:true,canRetry:true,retryBlockedReason:null,canClose:true,canConfirm:true,receiptDestinationType:null,hasRoot:false,needsRoot:false};
  await route.fulfill({json:url.searchParams.has("jobId")?{job,history:{items:[],hasMore:false,offset:0},retryEnabled:true}:{items:[job],hasMore:false,offset:0,retryEnabled:true}});
 });
 await page.goto("/admin/delivery-reviews?kind=telegram&jobId=stale-job");
 const selected=page.getByRole("region",{name:"Selected delivery"}),attestation=selected.getByRole("checkbox",{name:"I checked the provider or storage and this delivery did not succeed."});
 await attestation.check();await selected.getByRole("button",{name:"Record decision"}).click();await expect(page.getByRole("alert")).toContainText("Delivery changed");
 await page.getByRole("button",{name:"Refresh",exact:true}).click();await expect(attestation).not.toBeChecked();
 await selected.getByRole("button",{name:"Record decision"}).click();expect(proposals).toHaveLength(1);
 await attestation.check();await selected.getByRole("button",{name:"Record decision"}).click();await expect(page.getByRole("status")).toContainText("original message is queued");
 expect(proposals).toHaveLength(2);expect(proposals[0].expectedVersion).toBe("a".repeat(64));expect(proposals[1].expectedVersion).toBe("b".repeat(64));expect(proposals[1].requestId).not.toBe(proposals[0].requestId);
});
