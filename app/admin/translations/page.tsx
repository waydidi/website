import type { Metadata } from "next";
import { SiteTranslations } from "@/components/admin-translations/translations";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Translations · Waydidi operations", robots: { index: false, follow: false } };

export default async function TranslationsPage() {
  const access = await requireWaydidiAdmin("/admin/translations");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <main className="px-4 py-5 sm:px-8">
    <h1 className="mb-4 text-2xl font-black tracking-[-.02em]">Website translations</h1>
    <SiteTranslations />
  </main>;
}
