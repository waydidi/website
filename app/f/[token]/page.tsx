import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Image from "next/image";
import { getDb } from "@/db";
import { bookingForms } from "@/db/schema";
import { FormWizard } from "@/components/booking-form/form-wizard";
import type { FormPrefill, FormService } from "@/lib/booking-form";

export const metadata: Metadata = { title: "Your ride details | Waydidi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Notice({ title, text }: { title: string; text: string }) {
  return <main className="grid min-h-dvh place-items-center bg-[#FF8A05] px-6 text-white">
    <div className="max-w-md text-center">
      <Image src="/waydidi-logo.png" alt="Waydidi" width={180} height={68} className="mx-auto mb-8 h-auto w-40" />
      <h1 className="text-[30px] font-bold leading-tight">{title}</h1>
      <p className="mt-3 text-[17px] text-white/90">{text}</p>
    </div>
  </main>;
}

// Private step-by-step booking form sent to a customer by the admin.
export default async function BookingFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [form] = await getDb().select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
  if (!form) return <Notice title="Link not found" text="Please check the link, or ask us to send a new one." />;
  if (form.status !== "waiting") return <Notice title="Thank you!" text="We've received your details and will confirm your ride shortly." />;
  if (form.expiresAt < new Date().toISOString()) return <Notice title="This link has expired" text="Please message us and we'll send you a new one." />;
  return <FormWizard token={token} service={form.serviceType as FormService} prefill={(form.prefill ? JSON.parse(form.prefill) : {}) as FormPrefill} />;
}
