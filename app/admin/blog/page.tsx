import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { BlogPostsAdmin } from "@/components/blog-admin/posts-list";
import { requireWaydidiAdmin } from "@/lib/admin";
import { adminPosts } from "@/lib/blog-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blog posts · Waydidi operations", robots: { index: false, follow: false } };

export default async function BlogAdminPage() {
  const access = await requireWaydidiAdmin("/admin/blog");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const posts = await adminPosts().catch(() => null);
  return <main className="min-h-screen bg-[#F6F7F9] px-4 py-8 text-[#1f1726] sm:px-8">
    <div className="mx-auto max-w-[1200px]">
      {posts ? <BlogPostsAdmin posts={posts} /> : <p className="rounded-2xl bg-amber-50 p-5 text-amber-900">The blog table isn&apos;t in the database yet. Apply migration 0036 (blog_posts), then reload.</p>}
    </div>
  </main>;
}
