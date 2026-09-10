import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://waydidi-private-transfer.dankbangkok.chatgpt.site", lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
