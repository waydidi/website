import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { PostEditor } from "@/components/blog-admin/post-editor";
import { EMPTY_POST } from "@/components/blog-admin/editor-types";
import { knownCategories } from "@/components/blog-admin/editor-data";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add new post · Waydidi operations", robots: { index: false, follow: false } };

export default async function NewPostPage() {
  const access = await requireWaydidiAdmin("/admin/blog/new");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <main className="min-h-screen bg-[#F6F7F9] px-4 text-[#1f1726] sm:px-8"><div className="mx-auto max-w-[1280px]"><PostEditor initial={EMPTY_POST} knownCategories={await knownCategories()} /></div></main>;
}
