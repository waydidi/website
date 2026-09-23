import { SITE_URL } from "@/lib/public-content";

export type Crumb = { name: string; path: string };

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
