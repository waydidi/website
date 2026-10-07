import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { Breadcrumbs, JsonLd, breadcrumbSchema } from "@/components/seo";
import { PackageBooking } from "@/components/packages/package-booking";
import { earliestDate, fromPrice, KIND_LABEL, packageBySlug, packageStops } from "@/lib/packages";
import { destinations, SITE_URL } from "@/lib/public-content";
import { VEHICLES } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await packageBySlug((await params).slug).catch(() => null);
  if (!p) return {};
  const url = `${SITE_URL}/trips/${p.slug}`;
  const description = p.summary ?? `${KIND_LABEL[p.kind as keyof typeof KIND_LABEL]} private trip with hotel pickup.`;
  return { title: `${p.name} | Waydidi`, description, alternates: { canonical: url }, openGraph: { title: p.name, description, url, images: p.coverImage ? [{ url: p.coverImage }] : undefined } };
}

export default async function PackagePage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await packageBySlug((await params).slug);
  if (!p) notFound();
  const { stops } = await packageStops(p);
  const city = destinations.find((d) => d.slug === p.city);
  const crumbs = [{ name: "Home", path: "/" }, ...(city ? [{ name: city.name, path: `/destinations/${city.slug}` }] : []), { name: p.name, path: `/trips/${p.slug}` }];
  const from = fromPrice(p);
  const cars = Object.entries(p.prices).filter(([id, n]) => n > 0 && id in VEHICLES).map(([id, price]) => ({ id, price, name: VEHICLES[id as keyof typeof VEHICLES].name, seats: VEHICLES[id as keyof typeof VEHICLES].passengers }));
  const product = { "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.summary ?? undefined, image: p.coverImage ?? undefined,
    offers: from ? { "@type": "Offer", price: from, priceCurrency: "THB", availability: "https://schema.org/InStock", url: `${SITE_URL}/trips/${p.slug}` } : undefined };

  return <main className="bg-white text-plum">
    <JsonLd data={[breadcrumbSchema(crumbs), product]} />
    <section className="mx-auto max-w-[1180px] px-4 pt-5 sm:px-5">
      <div className="relative overflow-hidden rounded-[26px] bg-plum text-white">
        {p.coverImage && <><img src={p.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-plum/90 via-plum/50 to-plum/10" /></>}
        <div className="relative p-6 pt-24 sm:p-10 sm:pt-40">
          <Breadcrumbs crumbs={crumbs} className="mb-5 text-white" />
          <p className="text-sm font-black uppercase tracking-[.16em] text-[#FFB25A]">{KIND_LABEL[p.kind as keyof typeof KIND_LABEL]} · Private car and driver</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight tracking-[-.035em] sm:text-5xl">{p.name}</h1>
          {from && <p className="mt-4 text-lg font-bold">From THB {from.toLocaleString("en-US")} per car</p>}
        </div>
      </div>
    </section>

    <section className="mx-auto grid max-w-[1180px] gap-10 px-4 py-10 sm:px-5 lg:grid-cols-[1fr_400px]">
      <div className="grid content-start gap-10">
        {p.summary && <p className="text-lg leading-8 text-slate-700">{p.summary}</p>}
        {p.highlights.length > 0 && <ul className="grid gap-2">{p.highlights.map((h) => <li key={h} className="flex gap-2"><Check size={20} className="mt-0.5 shrink-0 text-brand-text" />{h}</li>)}</ul>}
        <div>
          <h2 className="text-2xl font-black tracking-[-.03em]">Your day</h2>
          <ol className="mt-5 grid gap-4">
            <li className="flex gap-3 rounded-2xl bg-canvas p-4 font-bold">Pickup from your hotel</li>
            {stops.map((s, i) => <li key={s.id} className="grid gap-3 overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-[180px_1fr]">
              <div className="aspect-[16/10] bg-slate-100 sm:aspect-auto">{s.cover && <img src={s.cover} alt={s.name} loading="lazy" className="h-full w-full object-cover" />}</div>
              <div className="p-4 sm:pl-0"><p className="text-sm font-bold text-brand-text">Stop {i + 1}</p><h3 className="text-lg font-black">{s.name}</h3>
                {s.pitch && <p className="mt-1 leading-7 text-slate-600">{s.pitch}</p>}
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-500"><Clock size={15} />About {s.durationMin >= 60 ? `${Math.round(s.durationMin / 30) / 2} h` : `${s.durationMin} min`}</p></div>
            </li>)}
            <li className="flex gap-3 rounded-2xl bg-canvas p-4 font-bold">Drop-off at your hotel</li>
          </ol>
          <p className="mt-3 text-sm text-slate-500">The order can change to suit your hotel and the day. You see the exact times before you pay.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div><h2 className="text-xl font-black">Included</h2><ul className="mt-3 grid gap-2">{p.included.map((x) => <li key={x} className="flex gap-2"><Check size={18} className="mt-1 shrink-0 text-emerald-600" />{x}</li>)}</ul></div>
          <div><h2 className="text-xl font-black">Not included</h2><ul className="mt-3 grid gap-2">{p.excluded.map((x) => <li key={x} className="flex gap-2"><X size={18} className="mt-1 shrink-0 text-slate-400" />{x}</li>)}</ul></div>
        </div>
      </div>
      <aside id="book" className="lg:sticky lg:top-24 lg:self-start">
        <PackageBooking slug={p.slug} startTimes={p.startTimes} cars={cars} minDate={earliestDate(p)} />
      </aside>
    </section>
    <PublicFooter />
  </main>;
}
