import { and, desc, eq, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { blogPosts, blogSlugHistory } from "@/db/schema";
import { BLOG_POSTS, categoryLabel, COVER_TONES, postBlocks, type BlogBlock, type BlogPost } from "./blog-posts";

type Row = typeof blogPosts.$inferSelect;

const parse = <T,>(json: string | null | undefined, fallback: T): T => {
  try { return json ? (JSON.parse(json) as T) : fallback; } catch { return fallback; }
};

export function rowToPost(row: Row): BlogPost & { id: string; status: string } {
  const cover = parse<Partial<BlogPost["cover"]>>(row.coverJson, {});
  return {
    id: row.id,
    status: row.status,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    date: (row.publishedAt ?? row.updatedAt).slice(0, 10),
    updated: row.updatedAt.slice(0, 10),
    categories: parse<string[]>(row.categoriesJson, []),
    featured: row.featured,
    popular: row.popularRank ?? undefined,
    cover: { headline: cover.headline || row.title, tone: COVER_TONES.includes(cover.tone as never) ? cover.tone! : "orange", photo: row.featuredImage ?? undefined },
    route: parse<BlogPost["route"] | null>(row.routeJson, null) ?? undefined,
    blocks: parse<BlogBlock[]>(row.blocksJson, []),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    author: row.author,
  };
}

// Public pages. Until the first post is written in admin, the built-in starter guides show.
export async function publishedPosts(): Promise<BlogPost[]> {
  try {
    const any = await getDb().select({ id: blogPosts.id }).from(blogPosts).limit(1);
    if (!any.length) return BLOG_POSTS;
    const rows = await getDb().select().from(blogPosts)
      .where(and(eq(blogPosts.status, "published"), lte(blogPosts.publishedAt, new Date().toISOString())))
      .orderBy(desc(blogPosts.publishedAt));
    return rows.map(rowToPost);
  } catch {
    return BLOG_POSTS; // table not created yet
  }
}

export async function publishedPost(slug: string, preview = false): Promise<BlogPost | null> {
  try {
    const any = await getDb().select({ id: blogPosts.id }).from(blogPosts).limit(1);
    if (!any.length) return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
    const [row] = await getDb().select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
    if (!row || row.status === "trash") return null;
    if (!preview && (row.status !== "published" || !row.publishedAt || row.publishedAt > new Date().toISOString())) return null;
    return rowToPost(row);
  } catch {
    return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
  }
}

/** New slug for a post whose permalink was changed, so old links can 301. */
export async function renamedSlug(oldSlug: string): Promise<string | null> {
  try {
    const [hit] = await getDb().select({ slug: blogPosts.slug, status: blogPosts.status }).from(blogSlugHistory)
      .innerJoin(blogPosts, eq(blogPosts.id, blogSlugHistory.postId)).where(eq(blogSlugHistory.oldSlug, oldSlug)).limit(1);
    return hit && hit.status === "published" && hit.slug !== oldSlug ? hit.slug : null;
  } catch {
    return null;
  }
}

// ---- Admin ----

export async function adminPosts() {
  const rows = await getDb().select().from(blogPosts).orderBy(desc(blogPosts.updatedAt));
  return rows.map((row) => ({ ...rowToPost(row), updatedAt: row.updatedAt, publishedAt: row.publishedAt }));
}

export async function adminPost(id: string) {
  const [row] = await getDb().select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return row ? { ...rowToPost(row), publishedAt: row.publishedAt } : null;
}

export const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);

const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().max(5000) }),
  z.object({ type: z.literal("heading"), text: z.string().max(200) }),
  z.object({ type: z.literal("list"), items: z.array(z.string().max(500)).max(30) }),
  z.object({ type: z.literal("tip"), text: z.string().max(1000) }),
  z.object({ type: z.literal("image"), src: z.string().max(500), alt: z.string().max(200), caption: z.string().max(300).optional() }),
  z.object({ type: z.literal("faq"), items: z.array(z.object({ q: z.string().max(300), a: z.string().max(2000) })).max(20) }),
  z.object({ type: z.literal("booking") }),
]);

export const postInputSchema = z.object({
  id: z.string().max(80).optional(),
  title: z.string().trim().min(3, "Add a title.").max(200),
  slug: z.string().trim().max(90).optional(),
  excerpt: z.string().trim().max(400).default(""),
  status: z.enum(["draft", "published", "trash"]),
  publishedAt: z.string().max(40).nullable().optional(),
  categories: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  featured: z.boolean().default(false),
  popularRank: z.number().int().min(1).max(20).nullable().optional(),
  featuredImage: z.string().max(500).nullable().optional(),
  cover: z.object({ headline: z.string().max(80).default(""), tone: z.enum(COVER_TONES) }),
  route: z.object({ pickup: z.string().trim().min(2).max(120), dropoff: z.string().trim().max(120), label: z.string().trim().max(120), service: z.enum(["transfer", "hourly"]).optional() }).nullable().optional(),
  blocks: z.array(block).max(200),
  seoTitle: z.string().trim().max(120).nullable().optional(),
  seoDescription: z.string().trim().max(300).nullable().optional(),
  author: z.string().trim().max(80).default("Waydidi team"),
});
export type PostInput = z.infer<typeof postInputSchema>;

export async function savePost(input: PostInput): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const slug = slugify(input.slug || input.title) || `post-${Date.now()}`;
  const [clash] = await getDb().select({ id: blogPosts.id }).from(blogPosts).where(input.id ? and(eq(blogPosts.slug, slug), ne(blogPosts.id, input.id)) : eq(blogPosts.slug, slug)).limit(1);
  if (clash) return { ok: false, error: "Another post already uses this permalink. Change the slug." };
  const publishedAt = input.status === "published" ? (input.publishedAt || now) : input.publishedAt ?? null;
  const values = {
    slug, title: input.title, excerpt: input.excerpt, status: input.status, publishedAt,
    categoriesJson: JSON.stringify(input.categories), featured: input.featured, popularRank: input.popularRank ?? null,
    featuredImage: input.featuredImage || null, coverJson: JSON.stringify(input.cover),
    routeJson: input.route && input.route.pickup ? JSON.stringify(input.route) : null,
    blocksJson: JSON.stringify(input.blocks), seoTitle: input.seoTitle || null, seoDescription: input.seoDescription || null,
    author: input.author || "Waydidi team", updatedAt: now,
  };
  if (input.id) {
    const [before] = await getDb().select({ slug: blogPosts.slug, status: blogPosts.status }).from(blogPosts).where(eq(blogPosts.id, input.id)).limit(1);
    // Remember the old permalink of a published post so shared links keep working.
    if (before && before.slug !== slug && before.status === "published") {
      await getDb().insert(blogSlugHistory).values({ oldSlug: before.slug, postId: input.id, createdAt: now })
        .onConflictDoUpdate({ target: blogSlugHistory.oldSlug, set: { postId: input.id, createdAt: now } }).catch(() => undefined);
    }
    await getDb().delete(blogSlugHistory).where(eq(blogSlugHistory.oldSlug, slug)).catch(() => undefined);
    const updated = await getDb().update(blogPosts).set(values).where(eq(blogPosts.id, input.id)).returning({ id: blogPosts.id });
    if (!updated.length) return { ok: false, error: "Post not found." };
    return { ok: true, id: input.id, slug };
  }
  const id = crypto.randomUUID();
  await getDb().insert(blogPosts).values({ id, ...values, createdAt: now });
  return { ok: true, id, slug };
}

export async function deletePostForever(id: string) {
  await getDb().delete(blogPosts).where(eq(blogPosts.id, id));
  await getDb().delete(blogSlugHistory).where(eq(blogSlugHistory.postId, id)).catch(() => undefined);
}

// Copies the 8 starter guides into the table (published) so they can be edited in admin.
export async function importStarterPosts() {
  const existing = new Set((await getDb().select({ slug: blogPosts.slug }).from(blogPosts)).map((r) => r.slug));
  const now = new Date().toISOString();
  const rows = BLOG_POSTS.filter((p) => !existing.has(p.slug)).map((p) => ({
    id: crypto.randomUUID(), slug: p.slug, title: p.title, excerpt: p.excerpt, status: "published",
    publishedAt: `${p.date}T00:00:00.000Z`, categoriesJson: JSON.stringify(p.categories.map(categoryLabel)), featured: Boolean(p.featured),
    popularRank: p.popular ?? null, featuredImage: p.cover.photo ?? null, coverJson: JSON.stringify({ headline: p.cover.headline, tone: p.cover.tone }),
    routeJson: p.route ? JSON.stringify(p.route) : null, blocksJson: JSON.stringify(postBlocks(p)), seoTitle: null, seoDescription: null,
    author: "Waydidi team", createdAt: now, updatedAt: now,
  }));
  // One row per statement: D1 allows at most 100 bound values per query.
  for (const row of rows) await getDb().insert(blogPosts).values(row);
  return rows.length;
}
