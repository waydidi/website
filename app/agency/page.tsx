import type { Metadata } from "next";
import Link from "next/link";
import { PartnerWorkspace } from "@/components/agency/partner-workspace";
import { agencyBookings, agencyForCustomer, agencyRequests } from "@/lib/agency";
import { requireCustomer } from "@/lib/customer-auth";
import { canBook, canFinance, partnerProfile, partnerRates, partnerInvoices, commissionStatement, thaiToday } from "@/lib/partner-portal";
import { toSatang } from "@/lib/money";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Hotel & agency portal · Waydidi",robots:{index:false,follow:false}};
export default async function AgencyPortalPage(){
 const customer=await requireCustomer("/agency"),agency=await agencyForCustomer(customer);
 if(!agency)return <main className="grid min-h-[70vh] place-items-center bg-slate-50 px-5"><div className="max-w-lg rounded-3xl bg-white p-8"><p className="text-sm font-bold text-orange-600">WAYDIDI PARTNERS</p><h1 className="mt-3 text-3xl font-bold">Hotel & agency portal</h1><p className="my-5 text-slate-600">{customer.email} is not linked to an approved partner account. Use your verified work email, ask your partner administrator to add you, or apply below. Contact our team if your email maps to multiple partners.</p><Link className="rounded-full bg-orange-500 px-5 py-3 font-bold text-white" href="/agencies/register">Apply as a partner</Link></div></main>;
 const [profile,rates,rows,requests]=await Promise.all([partnerProfile(agency),partnerRates(agency.id),agencyBookings(agency),agencyRequests(agency)]);
 const finance=canFinance(agency.portalRole),period=thaiToday().slice(0,7);
 const [statement,invoices]=finance?await Promise.all([commissionStatement(agency.id,period),partnerInvoices(agency.id)]):[null,[]];
 const bookings=rows.map(b=>({reference:b.reference,customerName:b.customerName,pickup:b.pickup,dropoff:b.dropoff,pickupDate:b.pickupDate,pickupTime:b.pickupTime,vehicle:b.vehicle,status:b.status,paymentStatus:b.paymentStatus,totalMinor:toSatang(b.total)}));
 return <PartnerWorkspace name={agency.agencyName} email={customer.email} role={agency.portalRole} kind={profile.partner_kind} rates={rates} bookings={bookings} requests={(canBook(agency.portalRole)?requests:[]).map(r=>({token:r.token,status:r.status,note:r.note,expiresAt:r.expiresAt}))} profile={finance?profile:null} statement={statement} invoices={invoices.map(i=>({id:i.id,bookingReference:i.booking_reference,amountMinor:i.amount_minor,createdAt:i.created_at}))}/>;
}
