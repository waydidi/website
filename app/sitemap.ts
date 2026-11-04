import type { MetadataRoute } from "next";
import { env } from "cloudflare:workers";
import { publishedTransferRoutes } from "@/lib/transfer-routes-server";
import { destinations, publicPages, SITE_URL } from "@/lib/public-content";
import { publishedPosts } from "@/lib/blog-store";
import { categorySlug } from "@/lib/blog-posts";
import { listPackages } from "@/lib/packages";
import { sitemapEntries } from "@/lib/sitemap-entries";
import { transferHubs } from "@/lib/transfer-routes";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, packages] = await Promise.all([
    publishedPosts(),
    // A package problem must not take the whole sitemap down.
    listPackages({ publishedOnly: true }).catch(() => []),
  ]);
  const transfers = await publishedTransferRoutes();
  return sitemapEntries({
    siteUrl: SITE_URL,
    transferSlugs: transfers.map(r=>r.slug),
    transferCitySlugs: transferHubs(transfers).map(c=>c.slug),
    languageUrls: (env as unknown as Record<string,unknown>).PUBLIC_LANGUAGE_URLS === "1",
    pageSlugs: publicPages.map((p) => p.slug),
    destinationSlugs: destinations.map((d) => d.slug),
    posts,
    packages,
    categorySlug,
  });
}
