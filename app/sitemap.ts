import type { MetadataRoute } from "next";
import { destinations, publicPages, SITE_URL } from "@/lib/public-content";
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: .7 },
    { url: `${SITE_URL}/destinations`, lastModified: now, changeFrequency: "monthly", priority: .9 },
    ...publicPages.map(page => ({url:`${SITE_URL}/${page.slug}`,lastModified:now,changeFrequency:"monthly" as const,priority:.75})),
    ...destinations.map(place => ({url:`${SITE_URL}/destinations/${place.slug}`,lastModified:now,changeFrequency:"monthly" as const,priority:.8})),
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: .3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: .3 },
  ];
}
