import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { SignInForm } from "@/components/account/sign-in-form";
import { currentCustomer } from "@/lib/customer-auth";
import { configuredProviders, safeNextPath } from "@/lib/social-auth";

export const metadata: Metadata = { title: "Sign in · Waydidi", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string; error?: string }> }) {
  const { next, email, error } = await searchParams;
  if (await currentCustomer()) redirect(safeNextPath(next));
  // Social buttons appear only for providers whose credentials are configured.
  const providers = configuredProviders(env as unknown as Record<string, string | undefined>);
  return <main className="bg-gradient-to-b from-brand-tint via-white to-white px-5 pt-10 text-navy sm:pt-16">
    <div className="mx-auto max-w-[460px]">
      {/* No site header on sign-in / register: just the orange Waydidi logo, back to the home page. */}
      <Link href="/" aria-label="Waydidi home" className="mx-auto mb-8 flex w-fit text-brand"><WaydidiLogo className="h-[53px] w-[139px] sm:h-[68px] sm:w-[179px]" /></Link>
      <SignInForm next={next ?? null} initialEmail={typeof email === "string" ? email.slice(0, 254) : undefined} providers={providers} providerError={typeof error === "string" ? error : undefined} />
    </div>
  </main>;
}
