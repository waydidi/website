import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/home/booking-flow';
import { PublicFooter } from '@/components/public-footer';
import { Breadcrumbs, JsonLd, breadcrumbSchema, faqSchema, SHARE_IMAGE } from '@/components/seo';
import { publishedTransferRoute } from '@/lib/transfer-routes-server';
import { TRANSFER_ROUTES, transferBookingUrl } from '@/lib/transfer-routes';
import { inclusionLines, resolveInclusions, ROUTE_RULES } from '@/lib/route-inclusions';
import { destinations, SITE_URL } from '@/lib/public-content';
import { VEHICLES } from '@/lib/vehicles';
import en from '@/messages/en.json';

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
 const {slug}=await params;const r=await publishedTransferRoute(slug);if(!r)return {};
 const title=`${r.from.name} to ${r.to.name} private transfer | Waydidi`;
 const description=en['transfers.description'];const url=`${SITE_URL}/transfers/${r.slug}`;
 return {title,description,alternates:{canonical:url},openGraph:{title,description,url,type:'website',images:[SHARE_IMAGE]}};
}
export default async function TransferPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const r=await publishedTransferRoute(slug);if(!r)notFound();
 const title=`${r.from.name} to ${r.to.name}`;
 const crumbs=[{name:'Home',path:'/'},{name:en['transfers.title'],path:'/transfers'},{name:title,path:`/transfers/${slug}`}];
 const lines=inclusionLines(resolveInclusions(r.from,r.to,ROUTE_RULES),'en');
 const faq=[{q:en['transfers.faq.price.q'],a:en['transfers.faq.price.a']},{q:en['transfers.faq.pickup.q'],a:en['transfers.faq.pickup.a']},{q:en['transfers.faq.time.q'],a:en['transfers.faq.time.a']}];
 const candidates=TRANSFER_ROUTES.filter(x=>x.slug!==slug && (x.from.slug===r.to.slug || x.from.slug===r.from.slug));
 const related=(await Promise.all(candidates.map(x=>publishedTransferRoute(x.slug)))).filter(x=>x!==null).slice(0,6);
 const url=`${SITE_URL}/transfers/${slug}`;
 const schema={'@context':'https://schema.org','@type':'Service',name:title,serviceType:'Private passenger transfer',url,provider:{'@type':'Organization',name:'Waydidi',url:SITE_URL},offers:Object.entries(r.pricesMinor).map(([id,minor])=>({'@type':'Offer',name:VEHICLES[id as keyof typeof VEHICLES]?.name??id,priceCurrency:'THB',price:minor/100,url,description:en['transfers.estimate']}))};
 return <BookingFlow initialRoute={{pickup:r.from.name,dropoff:r.to.name}} hero={{title,subtitle:en['transfers.description'],top:<Breadcrumbs crumbs={crumbs}/>}}>
 <main className="bg-canvas text-plum"><JsonLd data={[breadcrumbSchema(crumbs),schema,faqSchema(faq)]}/>
 <section className="mx-auto max-w-[1180px] px-5 py-14"><h2 className="text-3xl font-black">{en['transfers.prices']}</h2><p className="mt-3 text-slate-600">{en['transfers.estimate']}</p>
 <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(r.pricesMinor).map(([id,minor])=><a key={id} href={transferBookingUrl(r)+''} className="rounded-card bg-white p-6"><h3 className="text-xl font-bold">{VEHICLES[id as keyof typeof VEHICLES]?.name??id}</h3><p className="mt-3 font-black">{en['transfers.from']} ฿{(minor/100).toLocaleString('en-US')}</p><p className="mt-2 text-brand-deep">{en['transfers.book']}</p></a>)}</div>
 <p className="mt-6">{en['transfers.distance']}: {r.distanceMeters/1000} km · {en['transfers.duration']}: {r.durationMinutes} min</p>
 <h2 className="mt-10 text-2xl font-black">{en['transfers.included']}</h2><ul className="mt-4 list-inside list-disc"><li>{en['transfers.private']}</li>{lines.included.map(t=><li key={t}>{t}</li>)}</ul>
 {lines.excluded.length?<><h3 className="mt-4 font-bold">{en['transfers.excluded']}</h3><ul>{lines.excluded.map(t=><li key={t}>{t}</li>)}</ul></>:null}
 <h2 className="mt-10 text-2xl font-black">{en['transfers.faq']}</h2>{faq.map(f=><details key={f.q} className="mt-4 rounded-card bg-white p-5"><summary className="cursor-pointer font-bold">{f.q}</summary><p className="mt-3 leading-7">{f.a}</p></details>)}
 <h2 className="mt-10 text-2xl font-black">{en['transfers.related']}</h2><ul className="mt-4 space-y-3">{related.map(x=><li key={x.slug}><a className="text-brand-deep underline" href={`/transfers/${x.slug}`}>{x.from.name} to {x.to.name}</a></li>)}</ul>
 <nav className="mt-8 flex flex-wrap gap-5" aria-label="Destinations">{destinations.filter(d=>[r.from.destination,r.to.destination].includes(d.slug)).map(d=><a className="text-brand-deep underline" key={d.slug} href={`/destinations/${d.slug}`}>{d.name}</a>)}<Link href="/transfers" prefetch={false} className="text-brand-deep underline">{en['transfers.all']}</Link></nav>
 </section><PublicFooter/></main></BookingFlow>;
}
