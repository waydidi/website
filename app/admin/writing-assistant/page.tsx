import type { Metadata } from "next";
import { WritingAssistant } from "@/components/admin-writing/writing-assistant";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Writing assistant · Waydidi operations", robots: { index: false, follow: false } };

export default async function WritingAssistantPage() {
  const access = await requireWaydidiAdmin("/admin/writing-assistant");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <main className="px-4 py-5 sm:px-8">
    <h1 className="mb-4 text-2xl font-black tracking-[-.02em] md:hidden">Writing assistant</h1>
    <WritingAssistant />
  </main>;
}
