import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
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
    {/* Every element (logo, text, fields, buttons, spacing) is 10% smaller. */}
    <div className="mx-auto max-w-[460px]" style={{ zoom: 0.9 }}>
      {/* No site header and no logo here: just the form. */}
      <SignInForm next={next ?? null} initialEmail={typeof email === "string" ? email.slice(0, 254) : undefined} providers={providers} providerError={typeof error === "string" ? error : undefined} />
    </div>
  </main>;
}
