import type { MetadataRoute } from "next";

// Sitemap entries from already-loaded data. Kept free of database imports so it is unit tested
// (tests/sitemap.test.mjs). `lastModified` is only given when the date is real: Google ignores
// lastmod on sites where it always says "today", so pages without a known edit date omit it.

type Entry = MetadataRoute.Sitemap[number];
export type SitemapPost = { slug: string; date: string; updated?: string; categories: string[] };
export type SitemapPackage = { slug: string; updatedAt: string };

const day = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t) : undefined;
};
const latest = (dates: (Date | undefined)[]) => dates.reduce<Date | undefined>((a, b) => (b && (!a || b > a) ? b : a), undefined);

export function sitemapEntries(input: {
  siteUrl: string;
  pageSlugs: string[];
  destinationSlugs: string[];
  posts: SitemapPost[];
  packages: SitemapPackage[];
  categorySlug: (category: string) => string;
}): MetadataRoute.Sitemap {
  const { siteUrl, posts, packages, categorySlug } = input;
  const page = (path: string, changeFrequency: Entry["changeFrequency"], priority: number, lastModified?: Date): Entry =>
    ({ url: `${siteUrl}${path}`, changeFrequency, priority, ...(lastModified ? { lastModified } : {}) });
  const postDate = (p: SitemapPost) => day(p.updated && p.updated > p.date ? p.updated : p.date);
  const categories = new Map<string, Date | undefined>();
  for (const post of posts) for (const c of post.categories) {
    const slug = categorySlug(c);
    categories.set(slug, latest([categories.get(slug), postDate(post)]));
  }
  return [
    page("", "weekly", 1),
    page("/help", "monthly", .7),
    page("/destinations", "monthly", .9),
    ...input.pageSlugs.map((slug) => page(`/${slug}`, "monthly", .75)),
    ...input.destinationSlugs.map((slug) => page(`/destinations/${slug}`, "monthly", .8)),
    ...packages.map((p) => page(`/trips/${p.slug}`, "monthly", .75, day(p.updatedAt))),
    page("/drivers", "monthly", .6),
    page("/agencies", "monthly", .6),
    page("/blog", "weekly", .8, latest(posts.map(postDate))),
    ...[...categories].map(([slug, date]) => page(`/blog/category/${slug}`, "weekly", .6, date)),
    ...posts.map((post) => page(`/blog/${post.slug}`, "monthly", .7, postDate(post))),
    page("/refund-policy", "yearly", .4),
    page("/flights", "weekly", .5),
    page("/partners", "monthly", .4),
    page("/terms", "yearly", .3),
    page("/privacy", "yearly", .3),
  ];
}
