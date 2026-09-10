import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/booking/confirmation/"] }, sitemap: "https://waydidi-private-transfer.dankbangkok.chatgpt.site/sitemap.xml" };
}
