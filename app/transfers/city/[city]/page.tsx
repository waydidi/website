import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicFooter } from '@/components/public-footer';
import { Breadcrumbs, JsonLd, breadcrumbSchema } from '@/components/seo';
import { publishedTransferRoutes } from '@/lib/transfer-routes-server';
import { cityRoutes, transferCity, type PricedTransfer } from '@/lib/transfer-routes';
import { SITE_URL } from '@/lib/site';
import en from '@/messages/en.json';

const fill=(text:string,city:string)=>text.replace('{city}',city);
export async function generateMetadata({params}:{params:Promise<{city:string}>}):Promise<Metadata>{
 const city=transferCity((await params).city);if(!city)return {};
 const {from,to}=cityRoutes(await publishedTransferRoutes(),city.slug);if(!from.length&&!to.length)return {};
 const title=`${fill(en['transfers.cityTitle'],city.name)} | Waydidi`,description=en['transfers.description'],url=`${SITE_URL}/transfers/city/${city.slug}`;
 return {title,description,alternates:{canonical:url},openGraph:{title,description,url,type:'website'}};
}
const List=({title,routes}:{title:string;routes:PricedTransfer[]})=>routes.length?<><h2 className="mt-10 text-2xl font-black">{title}</h2><ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{routes.map(r=><li key={r.slug}><a className="block rounded-card bg-white p-6" href={`/transfers/${r.slug}`}><h3 className="text-xl font-bold">{r.from.name} to {r.to.name}</h3><p className="mt-3 font-bold text-brand-deep">{en['transfers.from']} ฿{(Math.min(...Object.values(r.pricesMinor))/100).toLocaleString('en-US')}</p></a></li>)}</ul></>:null;
export default async function TransferCity({params}:{params:Promise<{city:string}>}){
 const city=transferCity((await params).city);if(!city)notFound();
 const {from,to}=cityRoutes(await publishedTransferRoutes(),city.slug);
 // Nothing priced means nothing to book, so the page does not exist. This also covers the flag being off.
 if(!from.length&&!to.length)notFound();
 const title=fill(en['transfers.cityTitle'],city.name);
 const crumbs=[{name:'Home',path:'/'},{name:en['transfers.title'],path:'/transfers'},{name:city.name,path:`/transfers/city/${city.slug}`}];
 return <main className="bg-canvas text-plum"><section className="mx-auto max-w-[1180px] px-5 py-16"><Breadcrumbs crumbs={crumbs}/><JsonLd data={breadcrumbSchema(crumbs)}/><h1 className="mt-6 text-4xl font-black tracking-[-.035em]">{title}</h1><p className="mt-4 max-w-2xl leading-7 text-slate-600">{en['transfers.estimate']}</p><List title={fill(en['transfers.cityFrom'],city.name)} routes={from}/><List title={fill(en['transfers.cityTo'],city.name)} routes={to}/></section><PublicFooter/></main>;
}
