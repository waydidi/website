import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/public-content";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/driver/", "/booking/"] }, sitemap: `${SITE_URL}/sitemap.xml` };
}
