import { SITE_URL } from "@/lib/public-content";
import { SUPPORT_EMAIL, WHATSAPP_E164 } from "@/lib/contact";

export type Crumb = { name: string; path: string };

/**
 * Public profiles of Waydidi on other sites (Facebook page, Instagram, LINE Official Account,
 * TripAdvisor…), shown to Google as `sameAs`. Add only accounts Waydidi owns.
 */
export const SOCIAL_PROFILES: string[] = [];

/** Link-preview image (LINE, Facebook, WhatsApp, X): 1200×630 JPEG. */
export const SHARE_IMAGE = { url: `${SITE_URL}/og/waydidi.jpg`, width: 1200, height: 630, alt: "A Waydidi driver taking a passenger through Bangkok" };

/** Each destination's photo cropped for link previews (public/og/destinations). */
export const destinationShareImage = (slug: string, name: string) => ({ url: `${SITE_URL}/og/destinations/${slug}.jpg`, width: 1200, height: 630, alt: `Waydidi private transfer in ${name}` });

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** Who Waydidi is, on every page: name, logo and how customers reach support. */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "Waydidi Travel",
    alternateName: "Waydidi",
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/waydidi-logo.png`, width: 810, height: 308 },
    email: SUPPORT_EMAIL,
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer service", email: SUPPORT_EMAIL, telephone: WHATSAPP_E164, areaServed: "TH", availableLanguage: ["English", "Thai"] }],
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
  };
}

export function websiteSchema() {
  return { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "Waydidi Travel", url: SITE_URL, publisher: { "@id": ORGANIZATION_ID } };
}

/** The private-transfer service; only on pages that sell it (home), not on the blog or legal pages. */
export function transferServiceSchema() {
  return { "@context": "https://schema.org", "@type": "Service", name: "Waydidi Private Transfers", serviceType: "Private passenger transfer", provider: { "@id": ORGANIZATION_ID }, areaServed: { "@type": "Country", name: "Thailand" }, url: SITE_URL };
}

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function breadcrumbSchema(crumbs: Crumb[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })) };
}

export function faqSchema(faq: { q: string; a: string }[]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
}

export function Breadcrumbs({ crumbs, className = "" }: { crumbs: Crumb[]; className?: string }) {
  return <nav aria-label="Breadcrumb" className={`text-sm font-semibold ${className}`}>
    <ol className="flex flex-wrap items-center gap-2">
      {crumbs.map((c, i) => <li key={c.path} className="flex items-center gap-2">
        {i > 0 && <span aria-hidden className="opacity-50">/</span>}
        {i === crumbs.length - 1 ? <span aria-current="page">{c.name}</span> : <a href={c.path} className="opacity-70 hover:opacity-100">{c.name}</a>}
      </li>)}
    </ol>
  </nav>;
}
