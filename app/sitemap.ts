import type { MetadataRoute } from "next";
import { destinations, publicPages, SITE_URL } from "@/lib/public-content";
import { publishedPosts } from "@/lib/blog-store";
import { categorySlug } from "@/lib/blog-posts";
import { listPackages } from "@/lib/packages";
import { sitemapEntries } from "@/lib/sitemap-entries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, packages] = await Promise.all([
    publishedPosts(),
    // A package problem must not take the whole sitemap down.
    listPackages({ publishedOnly: true }).catch(() => []),
  ]);
  return sitemapEntries({
    siteUrl: SITE_URL,
    pageSlugs: publicPages.map((p) => p.slug),
    destinationSlugs: destinations.map((d) => d.slug),
    posts,
    packages,
    categorySlug,
  });
}
