import type { BlogBlock, CoverTone } from "@/lib/blog-posts";

export type EditorPost = {
  id?: string; title: string; slug: string; excerpt: string; status: "draft" | "published" | "trash"; publishedAt: string | null;
  categories: string[]; featured: boolean; popularRank: number | null; featuredImage: string | null;
  cover: { headline: string; tone: CoverTone; focusKeyword?: string }; route: { pickup: string; dropoff: string; label: string; service?: "transfer" | "hourly" } | null;
  blocks: BlogBlock[]; seoTitle: string; seoDescription: string; author: string;
};

export const EMPTY_POST: EditorPost = { title: "", slug: "", excerpt: "", status: "draft", publishedAt: null, categories: [], featured: false, popularRank: null, featuredImage: null, cover: { headline: "", tone: "orange" }, route: null, blocks: [{ type: "paragraph", text: "" }], seoTitle: "", seoDescription: "", author: "Waydidi team" };
