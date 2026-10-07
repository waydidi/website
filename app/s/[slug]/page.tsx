import Link from "next/link";
import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Image from "next/image";
import { StoreWizard } from "@/components/booking-form/store-wizard";
import { storefrontBySlug } from "@/lib/storefront";

export const metadata: Metadata = { title: "Book your ride | Waydidi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// QR poster at a partner store: book with the store's special price.
export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await storefrontBySlug(slug);
  if (!store) return <main className="grid min-h-dvh place-items-center bg-brand px-6 text-center text-white">
    <div><Image src="/waydidi-logo.png" alt="Waydidi" width={180} height={68} className="mx-auto mb-8 h-auto w-40" />
      <h1 className="text-[28px] font-bold">This QR code isn&apos;t active</h1>
      <p className="mt-3 text-[17px] text-white/90">You can still <Link href="/" className="underline">book on Waydidi</Link>.</p></div>
  </main>;
  return <StoreWizard store={{ slug: store.slug, name: store.name, discountPercent: store.discountPercent }} cardEnabled={Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET)} />;
}
