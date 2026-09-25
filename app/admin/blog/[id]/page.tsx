import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { PostEditor } from "@/components/blog-admin/post-editor";
import { editorPost, knownCategories } from "@/components/blog-admin/editor-data";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit post · Waydidi operations", robots: { index: false, follow: false } };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireWaydidiAdmin(`/admin/blog/${id}`);
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const post = await editorPost(id);
  if (!post) notFound();
  return <main className="min-h-screen bg-[#F6F7F9] px-4 text-[#1f1726] sm:px-8"><div className="mx-auto max-w-[1280px]"><PostEditor key={post.id} initial={post} knownCategories={await knownCategories()} /></div></main>;
}
