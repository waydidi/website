import { BLOG_CATEGORIES } from "@/lib/blog-posts";
import { adminPost, adminPosts } from "@/lib/blog-store";
import { EMPTY_POST, type EditorPost } from "./editor-types";

export async function knownCategories() {
  const posts = await adminPosts().catch(() => []);
  return Array.from(new Set([...Object.values(BLOG_CATEGORIES), ...posts.flatMap((p) => p.categories)]));
}

export async function editorPost(id: string): Promise<EditorPost | null> {
  const p = await adminPost(id).catch(() => null);
  if (!p) return null;
  return {
    ...EMPTY_POST, id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, status: p.status as EditorPost["status"], publishedAt: p.publishedAt,
    categories: p.categories, featured: Boolean(p.featured), popularRank: p.popular ?? null, featuredImage: p.cover.photo ?? null,
    cover: { headline: p.cover.headline === p.title ? "" : p.cover.headline, tone: p.cover.tone, focusKeyword: p.focusKeyword ?? "" }, route: p.route ? { ...p.route } : null,
    blocks: p.blocks?.length ? p.blocks : EMPTY_POST.blocks, seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", author: p.author ?? "Waydidi team",
  };
}
