import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Clock3, MapPin, Plane, Route, Timer, CarFront, Clock } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { Breadcrumbs, JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo";
import { destinations, SITE_URL } from "@/lib/public-content";

export function generateStaticParams(){return destinations.map(({slug})=>({slug}))}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;const d=destinations.find(x=>x.slug===slug);if(!d)return{};
  const title=d.seoTitle??`Private transfers in ${d.name} | Waydidi`;const description=d.seoDescription??d.intro;const url=`${SITE_URL}/destinations/${d.slug}`;
  return{title,description,alternates:{canonical:url},openGraph:{title,description,url,type:"website",images:[{url:`${SITE_URL}/waydidi-transfer.png`,alt:`Waydidi private transfer in ${d.name}`}]}};
}

const services=[
  {title:"Airport transfer",text:"Pickup or drop-off with meeting instructions.",href:"/airport-transfer",icon:Plane},
  {title:"A-to-B ride",text:"One private car between any two addresses.",href:"/a-to-b-transfer",icon:CarFront},
  {title:"Long journey",text:"Intercity trips without changing vehicles.",href:"/long-journeys",icon:Route},
  {title:"Hourly driver",text:"Keep a car and driver for several stops.",href:"/hourly-driver",icon:Clock},
];

export default async function DestinationPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const d=destinations.find(x=>x.slug===slug);if(!d)notFound();
  const crumbs=[{name:"Home",path:"/"},{name:"Destinations",path:"/destinations"},{name:d.name,path:`/destinations/${d.slug}`}];
  const nearby=(d.nearby??[]).map(s=>destinations.find(x=>x.slug===s)).filter(x=>x!==undefined);
  const schemas:object[]=[breadcrumbSchema(crumbs),{"@context":"https://schema.org","@type":"TaxiService",name:`Waydidi private transfers in ${d.name}`,description:d.seoDescription??d.intro,url:`${SITE_URL}/destinations/${d.slug}`,provider:{"@type":"Organization",name:"Waydidi",url:SITE_URL},areaServed:{"@type":"City",name:d.name,containedInPlace:{"@type":"Country",name:"Thailand"}}}];
  if(d.faq?.length)schemas.push(faqSchema(d.faq));

  return <main className="bg-white text-[#211726]">
  <JsonLd data={schemas}/>
  <section className="mx-auto max-w-[1280px] px-5 pt-5 lg:px-8"><div className="relative overflow-hidden rounded-[30px] px-6 py-14 text-white sm:px-10 lg:px-16 lg:py-20" style={{backgroundColor:d.color}}><div className="absolute -right-20 top-0 h-full w-[44%] rotate-[-8deg] bg-[#FF8A05] opacity-85"/><div className="relative max-w-3xl"><Breadcrumbs crumbs={crumbs} className="text-white"/><p className="mt-12 text-sm font-black uppercase tracking-[.18em] text-[#FFB25A]">{d.kicker}</p><h1 className="mt-3 text-5xl font-black tracking-[-.05em] sm:text-7xl">{d.h1??`Private transfers in ${d.name}`}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-white/80">{d.intro}</p><Link href="/#booking-search" className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-6 py-4 font-black text-[#C96100]">Book a {d.name} ride <ArrowRight size={18}/></Link></div></div></section>

  {d.journeys?.length ? <section className="mx-auto max-w-[1180px] px-5 pt-16"><p className="text-sm font-black uppercase tracking-[.18em] text-[#D96F00]">Popular journeys</p><h2 className="mt-2 text-3xl font-black tracking-[-.035em] sm:text-5xl">Where people travel from {d.name}</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">Drive times are typical estimates. Your exact time and price appear when you search your pickup and drop-off.</p><div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{d.journeys.map(j=><article key={j.title} className="flex flex-col rounded-[24px] border border-slate-200 p-6"><h3 className="text-xl font-black">{j.title}</h3><p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#D96F00]"><Timer size={16}/>{j.time}</p><p className="mt-3 leading-7 text-slate-600">{j.text}</p><Link href="/#booking-search" className="mt-auto inline-flex items-center gap-2 pt-6 font-black text-[#C96100]">Search this trip <ArrowRight size={17}/></Link></article>)}</div></section> : null}

  <section className="mx-auto grid max-w-[1180px] gap-8 px-5 py-16 lg:grid-cols-[1.15fr_.85fr]"><div><p className="text-sm font-black uppercase tracking-[.18em] text-[#D96F00]">Where Waydidi helps</p><h2 className="mt-2 text-3xl font-black tracking-[-.035em] sm:text-5xl">Arrive with the next step already arranged.</h2><div className="mt-8 grid gap-3">{d.highlights.map(h=><div key={h} className="flex items-start gap-4 rounded-2xl bg-[#F5F6F8] p-5"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]"><Check size={18}/></span><span className="pt-1 font-bold">{h}</span></div>)}</div></div><aside className="rounded-[26px] bg-[#FFF0DF] p-6 sm:p-8"><Clock3 className="text-[#D96F00]"/><h2 className="mt-5 text-2xl font-black">Local travel note</h2><p className="mt-3 text-lg leading-8 text-slate-700">{d.note}</p><p className="mt-6 border-t border-orange-200 pt-6 text-sm leading-6 text-slate-600">Route times shown during booking are estimates and can change with weather, road, ferry and terminal conditions.</p></aside></section>

  {d.areas?.length ? <section className="mx-auto max-w-[1180px] px-5 pb-16"><h2 className="text-3xl font-black tracking-[-.035em]">Areas we cover in {d.name}</h2><ul className="mt-6 flex flex-wrap gap-3">{d.areas.map(a=><li key={a} className="inline-flex items-center gap-2 rounded-full bg-[#F5F6F8] px-4 py-2 font-bold"><MapPin size={16} className="text-[#D96F00]"/>{a}</li>)}</ul></section> : null}

  <section className="bg-[#211726] py-16 text-white"><div className="mx-auto max-w-[1180px] px-5"><p className="text-sm font-black uppercase tracking-[.18em] text-[#FF9E2F]">Services</p><h2 className="mt-2 text-3xl font-black tracking-[-.035em] sm:text-5xl">Private rides in {d.name}</h2><div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{services.map(({title,text,href,icon:Icon})=><a key={href} href={href} className="rounded-2xl border border-white/15 p-5 hover:bg-white/5"><Icon className="text-[#FF8A05]"/><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-1 text-white/70">{text}</p></a>)}</div></div></section>

  {d.tips?.length ? <section className="mx-auto max-w-[860px] px-5 py-16"><h2 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Travel tips for {d.name} transfers</h2><div className="mt-6 grid gap-5 text-lg leading-8 text-slate-700">{d.tips.map(t=><p key={t}>{t}</p>)}</div></section> : null}

  {d.faq?.length ? <section className="bg-[#F5F6F8] py-16"><div className="mx-auto max-w-[860px] px-5"><h2 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">{d.name} transfer FAQ</h2><div className="mt-8 grid gap-3">{d.faq.map(f=><details key={f.q} className="group rounded-2xl bg-white p-5"><summary className="cursor-pointer list-none font-black">{f.q}</summary><p className="mt-3 leading-7 text-slate-600">{f.a}</p></details>)}</div></div></section> : null}

  {nearby.length ? <section className="mx-auto max-w-[1180px] px-5 pt-16"><h2 className="text-3xl font-black tracking-[-.035em]">Nearby destinations</h2><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{nearby.map(n=><a key={n.slug} href={`/destinations/${n.slug}`} className="flex items-center justify-between rounded-2xl p-5 font-black text-white" style={{backgroundColor:n.color}}>{n.name}<ArrowRight size={18}/></a>)}</div></section> : null}

  <section className="mx-auto max-w-[1180px] px-5 py-16"><div className="grid items-center gap-8 rounded-[28px] bg-[#FF8A05] p-7 text-white md:grid-cols-[1fr_auto] md:p-10"><div><MapPin/><h2 className="mt-5 text-3xl font-black">Your exact pickup matters.</h2><p className="mt-2 max-w-xl text-white/85">Select the precise hotel, terminal, pier or address so Waydidi can calculate the route and show the right options.</p></div><Link href="/#booking-search" className="rounded-full bg-white px-6 py-4 text-center font-black text-[#C96100]">Search vehicles</Link></div></section>
  <PublicFooter/>
</main>}
