import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/account/sign-in-form";
import { currentCustomer } from "@/lib/customer-auth";

export const metadata: Metadata = { title: "Sign in · Waydidi", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next, email } = await searchParams;
  if (await currentCustomer()) redirect("/account");
  return <main className="min-h-[calc(100vh-97px)] bg-[#F5F6F8] px-5 py-12 text-[#211726] sm:py-20">
    <div className="mx-auto max-w-[480px]"><SignInForm next={next ?? null} initialEmail={typeof email === "string" ? email.slice(0, 254) : undefined} /></div>
  </main>;
}
