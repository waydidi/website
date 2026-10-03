import Link from "next/link";
import { agencyForCustomer } from "@/lib/agency";
import { requireCustomer } from "@/lib/customer-auth";

/** The signed-in agency for agency portal pages, or the "not linked" message to show instead. */
export async function requireAgencyPage(returnTo: string) {
  const customer = await requireCustomer(returnTo);
  const agency = await agencyForCustomer(customer);
  if (agency) return { agency, blocked: null };
  return { agency: null, blocked: <main className="grid min-h-[70vh] place-items-center bg-[#F5F6F8] px-5"><div className="max-w-md rounded-[24px] bg-white p-8 text-center">
    <h1 className="text-[26px] font-bold">Agency portal</h1>
    <p className="mt-3 text-slate-600"><b>{customer.email}</b> isn&apos;t linked to an approved agency account yet. <Link href="/agencies" className="font-semibold text-[#D96F00] underline">Apply as a partner</Link>.</p>
  </div></main> };
}
