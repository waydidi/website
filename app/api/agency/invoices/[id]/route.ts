import { NextResponse } from "next/server";
import { agencyForCustomer, agencyBooking } from "@/lib/agency";
import { customerFromRequest } from "@/lib/customer-auth";
import { getWaydidiAdmin } from "@/lib/admin";
import { partnerDb, canFinance, thb, type PartnerInvoice, type InvoiceSnapshot } from "@/lib/partner-portal";
const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;
 const agency=await agencyForCustomer((await customerFromRequest(request))?.customer??null);
 const staff=await getWaydidiAdmin();
 const staffAllowed=staff&&["owner","finance"].includes(staff.role);
 if(!staffAllowed&&(!agency||!canFinance(agency.portalRole)))return NextResponse.json({error:"Finance access required."},{status:403});
 const invoice=await partnerDb().prepare(`SELECT * FROM partner_invoices WHERE id=? ${staffAllowed?"":"AND agency_id=?"}`).bind(...(staffAllowed?[id]:[id,agency!.id])).first<PartnerInvoice>();
 if(!invoice)return NextResponse.json({error:"Invoice not found."},{status:404});
 const data=JSON.parse(invoice.snapshot) as InvoiceSnapshot;
 const booking=agency?await agencyBooking(agency,invoice.booking_reference):await partnerDb().prepare("SELECT payment_status paymentStatus,status,refund_amount refundAmount FROM bookings WHERE reference=?").bind(invoice.booking_reference).first<{status:string;paymentStatus:string;refundAmount:number|null}>();
 const state=booking?.status==="cancelled"?"Cancelled booking — contact finance for an adjustment":booking?.refundAmount?"Refund recorded — contact finance for an adjustment":booking?.paymentStatus==="paid"?"Payment recorded":"Payment outstanding / review payment records";
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escape(invoice.id)}</title><style>body{font:16px system-ui;color:#211726;max-width:850px;margin:48px auto;padding:24px}h1{color:#d96f00}.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px}p{white-space:pre-wrap;line-height:1.6}table{width:100%;border-collapse:collapse;margin:32px 0}td,th{border-bottom:1px solid #ddd;padding:16px;text-align:left}.total{text-align:right;font-size:24px;font-weight:700}.note{color:#59616d;font-size:14px}@media print{body{margin:0}.print-help{display:none}}</style></head><body><p class="print-help">Use your browser’s Print command to print or save this invoice as PDF.</p><h1>Commercial invoice</h1><p>${escape(invoice.id)}<br>Issued ${escape(invoice.created_at.slice(0,10))}</p><div class="parties"><section><h2>From</h2><p>${escape(data.issuer.name)}<br>${escape(data.issuer.address)}<br>${escape(data.issuer.taxId)}</p></section><section><h2>Bill to</h2><p>${escape(data.buyer.name)}<br>${escape(data.buyer.address)}<br>${escape(data.buyer.taxId)}</p></section></div><table><thead><tr><th>Service</th><th>Amount</th></tr></thead><tbody><tr><td>${escape(data.reference)} · ${escape(data.pickupDate)} ${escape(data.pickupTime)} Thailand time<br>${escape(data.pickup)} → ${escape(data.dropoff)}<br>${escape(data.vehicle)}</td><td>${escape(thb(data.amountMinor))}</td></tr></tbody></table><p class="total">Total ${escape(thb(invoice.amount_minor))}</p><p>${escape(state)}</p><p class="note">This commercial invoice is not a VAT tax invoice or proof of payment. The original issued amount is retained; refunds require a separate finance adjustment.</p></body></html>`;
 return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
}
