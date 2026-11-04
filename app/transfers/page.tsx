import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicFooter } from '@/components/public-footer';
import { Breadcrumbs, JsonLd, breadcrumbSchema } from '@/components/seo';
import { publishedTransferRoutes, transferPagesEnabled } from '@/lib/transfer-routes-server';
import { transferHubs } from '@/lib/transfer-routes';
import { SITE_URL } from '@/lib/site';
import en from '@/messages/en.json';
export const metadata:Metadata={title:'Thailand private transfer routes | Waydidi',description:en['transfers.description'],alternates:{canonical:`${SITE_URL}/transfers`},openGraph:{title:'Thailand private transfer routes | Waydidi',description:en['transfers.description'],url:`${SITE_URL}/transfers`,type:'website'}};
export default async function Transfers(){
 if(!transferPagesEnabled())notFound();
 const routes=await publishedTransferRoutes();
 const crumbs=[{name:'Home',path:'/'},{name:en['transfers.title'],path:'/transfers'}];
 return <main className="bg-canvas text-plum"><section className="mx-auto max-w-[1180px] px-5 py-16"><Breadcrumbs crumbs={crumbs}/><JsonLd data={breadcrumbSchema(crumbs)}/><h1 className="mt-6 text-4xl font-black tracking-[-.035em]">{en['transfers.title']}</h1><p className="mt-4 max-w-2xl leading-7 text-slate-600">{en['transfers.description']}</p><p className="mt-3 text-slate-600">{en['transfers.estimate']}</p>{routes.length?<nav aria-label={en['transfers.byCity']} className="mt-6 flex flex-wrap gap-x-5 gap-y-2">{transferHubs(routes).map(c=><a key={c.slug} className="text-brand-deep underline" href={`/transfers/city/${c.slug}`}>{c.name}</a>)}</nav>:null}<ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{routes.map(r=><li key={r.slug}><a className="block rounded-card bg-white p-6" href={`/transfers/${r.slug}`}><h2 className="text-xl font-bold">{r.from.name} to {r.to.name}</h2><p className="mt-3 font-bold text-brand-deep">{en['transfers.from']} ฿{(Math.min(...Object.values(r.pricesMinor))/100).toLocaleString('en-US')}</p></a></li>)}</ul>{!routes.length?<p className="mt-8">{en['transfers.empty']}</p>:null}</section><PublicFooter/></main>;
}
