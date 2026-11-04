import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { Breadcrumbs, JsonLd, breadcrumbSchema } from "@/components/seo";
import { fromPrice, KIND_LABEL, listPackages, type PackageView } from "@/lib/packages";
import { destinations, SITE_URL } from "@/lib/public-content";
import en from "@/messages/en.json";

export const dynamic = "force-dynamic";
const url = `${SITE_URL}/trips`;
export const metadata: Metadata = { title: `${en["trips.title"]} | Waydidi`, description: en["trips.description"], alternates: { canonical: url }, openGraph: { title: `${en["trips.title"]} | Waydidi`, description: en["trips.description"], url, type: "website" } };

export default async function TripsPage() {
  const packages = await listPackages({ publishedOnly: true }).catch(() => [] as PackageView[]);
  // An empty catalogue is not a page worth showing or indexing.
  if (!packages.length) notFound();
  const cities = [...new Set(packages.map((p) => p.city))];
  const crumbs = [{ name: "Home", path: "/" }, { name: en["trips.title"], path: "/trips" }];
  return <main className="bg-canvas text-plum">
    <section className="mx-auto max-w-[1180px] px-5 py-16">
      <Breadcrumbs crumbs={crumbs} /><JsonLd data={breadcrumbSchema(crumbs)} />
      <h1 className="mt-6 text-4xl font-black tracking-[-.035em]">{en["trips.title"]}</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-600">{en["trips.description"]}</p>
      {cities.map((slug) => <div key={slug} id={slug} className="mt-12 scroll-mt-24">
        <h2 className="text-2xl font-black">{en["trips.fromCity"].replace("{city}", destinations.find((d) => d.slug === slug)?.name ?? slug)}</h2>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{packages.filter((p) => p.city === slug).map((p) => { const from = fromPrice(p); return <li key={p.id}><Link href={`/trips/${p.slug}`} className="block h-full overflow-hidden rounded-[22px] border border-slate-200 bg-white">
          <div className="aspect-[16/10] bg-slate-100">{p.coverImage && <img src={p.coverImage} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
          <div className="p-5"><p className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-text"><Clock size={15} aria-hidden="true" />{KIND_LABEL[p.kind as keyof typeof KIND_LABEL]}</p><h3 className="mt-1 text-xl font-black">{p.name}</h3>{from && <p className="mt-2 font-bold text-brand-deep">{en["trips.fromPrice"].replace("{price}", from.toLocaleString("en-US"))}</p>}</div>
        </Link></li>; })}</ul>
      </div>)}
    </section>
    <PublicFooter />
  </main>;
}
