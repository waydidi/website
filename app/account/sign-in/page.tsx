import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/account/sign-in-form";
import { currentCustomer } from "@/lib/customer-auth";
import { configuredProviders } from "@/lib/social-auth";

export const metadata: Metadata = { title: "Sign in · Waydidi", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string; error?: string }> }) {
  const { next, email, error } = await searchParams;
  if (await currentCustomer()) redirect("/account");
  // Social buttons appear only for providers whose credentials are configured.
  const providers = configuredProviders(env as unknown as Record<string, string | undefined>);
  return <main className="bg-gradient-to-b from-[#FFF0DF] via-white to-white px-5 pt-10 text-[#0F294D] sm:pt-16">
    <div className="mx-auto max-w-[460px]">
      <SignInForm next={next ?? null} initialEmail={typeof email === "string" ? email.slice(0, 254) : undefined} providers={providers} providerError={typeof error === "string" ? error : undefined} />
    </div>
  </main>;
}
