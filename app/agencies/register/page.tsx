import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { AgencyForm } from "@/components/agencies/agency-form";
import { requireCustomer } from "@/lib/customer-auth";
import { agencyForCustomer } from "@/lib/agency";
import { getDb } from "@/db";
import { agencyApplications } from "@/db/schema";
import { fullName } from "@/lib/person-name";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create your agency account · Waydidi", robots: { index: false, follow: false } };

export default async function AgencyRegistrationPage() {
  const customer = await requireCustomer("/agencies/register");
  if (await agencyForCustomer(customer)) redirect("/agency");
  const [application] = await getDb().select().from(agencyApplications)
    .where(sql`lower(${agencyApplications.email}) = ${customer.email.toLowerCase()}`)
    .orderBy(desc(agencyApplications.createdAt)).limit(1);
  const pending = application && ["new", "contacted"].includes(application.status);
  return <main className="font-home min-h-[70vh] bg-[#F7F8FA] px-5 py-12 text-[#171D21] sm:py-16">
    <div className="mx-auto max-w-[800px]">
      <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-.02em] sm:text-[40px]">{pending ? "Your application is being reviewed" : "Create your agency account"}</h1>
      <p className="mb-8 mt-4 text-[16px] leading-7 text-slate-600">{pending ? "Your email is verified and your application has been received. Our partnerships team will contact you within 2 working days." : "Your email is verified. Tell us about your agency to apply for partner access. Our team reviews your application before activating your agency portal."}</p>
      {pending ? <div className="rounded-[28px] bg-white p-8">
        <p className="font-semibold">{application.agencyName}</p>
        <p className="mt-2 text-slate-600">{customer.email}</p>
        <p className="mt-4 text-sm text-slate-600">Portal access becomes available after approval. Partner rates are agreed with you by our team.</p>
        <Link href="/contact" className="mt-6 inline-flex rounded-full bg-[#171D21] px-6 py-3 font-semibold text-white">Contact partnerships</Link>
      </div> : <AgencyForm initialEmail={customer.email} initialName={fullName(customer.name, customer.surname)} />}
      <Link href="/agencies" className="mt-6 inline-block text-sm font-semibold underline underline-offset-4">Learn about partnering with Waydidi</Link>
    </div>
  </main>;
}
