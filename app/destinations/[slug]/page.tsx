import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarDays, CarFront, ChevronDown, Clock, Headphones, Luggage, MapPin, Plane, Route, ShieldCheck, Timer, UserRoundCheck, Users } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { Breadcrumbs, JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo";
import { destinations, SITE_URL, type Destination } from "@/lib/public-content";

export function generateStaticParams(){return destinations.map(({slug})=>({slug}))}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;const d=destinations.find(x=>x.slug===slug);if(!d)return{};
  const title=d.seoTitle??`Private transfers in ${d.name} | Waydidi`;const description=d.seoDescription??d.intro;const url=`${SITE_URL}/destinations/${d.slug}`;
  return{title,description,alternates:{canonical:url},openGraph:{title,description,url,type:"website",images:[{url:`${SITE_URL}${d.image??"/waydidi-transfer.png"}`,alt:`Waydidi private transfer in ${d.name}`}]}};
}

const services=[
  {title:"Airport transfer",text:"Pickup or drop-off with meeting instructions",href:"/airport-transfer",icon:Plane},
  {title:"A-to-B ride",text:"One private car between any two addresses",href:"/a-to-b-transfer",icon:CarFront},
  {title:"Long journey",text:"Intercity trips without changing vehicles",href:"/long-journeys",icon:Route},
  {title:"Hourly driver",text:"Keep a car and driver for several stops",href:"/hourly-driver",icon:Clock},
];

const features=[
  {title:"One private vehicle",text:"No shared shuttle and no strangers. The car is yours from pickup to drop-off.",icon:CarFront},
  {title:"Price before you book",text:"See the total for your exact route and vehicle before you confirm.",icon:BadgeCheck},
  {title:"Help when you need it",text:"Contact Waydidi with your booking reference before, during or after your ride.",icon:Headphones},
  {title:"Local drivers",text:"Drivers who know the city, its traffic and the right entrance to your hotel.",icon:UserRoundCheck},
  {title:"Room for your luggage",text:"Choose a vehicle by passengers and bags so everything fits.",icon:Luggage},
  {title:"Safety standards",text:"Roadworthy vehicles, lawful driving and journey status checks on every ride.",icon:ShieldCheck},
];

function PlaceCard({place}:{place:Destination}){
  return <Link href={`/destinations/${place.slug}`} className="group block">
    <div className="relative aspect-square overflow-hidden rounded-[22px]" style={{backgroundColor:place.color}}>
      {place.image ? <img src={place.image} alt={`${place.name}, Thailand`} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"/> : <><div className="absolute -bottom-16 -right-10 size-56 rounded-full bg-white/10 transition duration-500 group-hover:scale-110"/><div className="absolute -left-8 -top-12 size-40 rounded-full bg-[#FF8A05]/25"/><span className="absolute bottom-5 left-5 text-sm font-bold text-white/75">{place.kicker}</span></>}
    </div>
    <p className="mt-3 px-1 text-lg font-bold">{place.name}</p>
  </Link>;
}

export default async function DestinationPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const d=destinations.find(x=>x.slug===slug);if(!d)notFound();
  const crumbs=[{name:"Home",path:"/"},{name:"Destinations",path:"/destinations"},{name:d.name,path:`/destinations/${d.slug}`}];
  const nearby=(d.nearby??[]).map(s=>destinations.find(x=>x.slug===s)).filter(x=>x!==undefined);
  const schemas:object[]=[breadcrumbSchema(crumbs),{"@context":"https://schema.org","@type":"TaxiService",name:`Waydidi private transfers in ${d.name}`,description:d.seoDescription??d.intro,url:`${SITE_URL}/destinations/${d.slug}`,provider:{"@type":"Organization",name:"Waydidi",url:SITE_URL},areaServed:{"@type":"City",name:d.name,containedInPlace:{"@type":"Country",name:"Thailand"}}}];
  if(d.faq?.length)schemas.push(faqSchema(d.faq));

  return <main className="bg-white text-[#211726]">
  <JsonLd data={schemas}/>

  {/* Hero: photo (or brand colour) background, breadcrumb, headline and a search bar that opens the booking form */}
  <section className="relative overflow-hidden text-white" style={{backgroundColor:d.color}}>
    {d.image ? <img src={d.image} alt="" className="absolute inset-0 h-full w-full object-cover"/> : <div className="absolute -right-24 top-0 h-full w-[46%] rotate-[-8deg] bg-[#FF8A05] opacity-80"/>}
    <div className="absolute inset-0 bg-gradient-to-r from-[#211726]/85 via-[#211726]/55 to-[#211726]/20"/>
    <div className="relative mx-auto max-w-[1180px] px-5 pb-16 pt-12 sm:pt-16 lg:pb-24">
      <Breadcrumbs crumbs={crumbs} className="text-white"/>
      <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-[-.045em] sm:text-6xl">{d.h1??`Private transfers in ${d.name}`}</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-white/85 sm:text-xl">{d.intro}</p>
      <Link href="/#booking-search" aria-label={`Search private transfers in ${d.name}`} className="mt-9 grid gap-1 rounded-[22px] bg-white p-2 text-slate-500 shadow-2xl shadow-black/20 sm:rounded-full md:grid-cols-[1fr_1fr_.8fr_auto] md:items-center">
        <span className="flex items-center gap-3 px-4 py-3"><MapPin size={20} className="shrink-0 text-[#211726]"/>From airport, hotel, address</span>
        <span className="flex items-center gap-3 border-slate-200 px-4 py-3 md:border-l"><MapPin size={20} className="shrink-0 text-[#FF8A05]"/>To {d.name} or anywhere</span>
        <span className="flex items-center gap-3 border-slate-200 px-4 py-3 md:border-l"><CalendarDays size={20} className="shrink-0 text-[#211726]"/>Date <Users size={18} className="ml-auto shrink-0"/> 2</span>
        <span className="rounded-full bg-[#FF8A05] px-8 py-4 text-center font-black text-white">Search</span>
      </Link>
    </div>
  </section>

  {/* Trust strip */}
  <section className="border-b border-slate-200 bg-[#F5F6F8]"><div className="mx-auto flex max-w-[1180px] flex-wrap gap-x-8 gap-y-3 px-5 py-5 text-sm font-bold sm:text-base">{[["Private car, never shared",CarFront],["Price shown before you book",BadgeCheck],["Local drivers and support",Headphones]].map(([t,Icon])=>{const I=Icon as typeof CarFront;return <span key={t as string} className="flex items-center gap-2"><I size={19} className="text-[#D96F00]"/>{t as string}</span>})}</div></section>

  {/* Popular journeys: white cards on a light panel */}
  {d.journeys?.length ? <section className="bg-[#F5F6F8] py-16"><div className="mx-auto max-w-[1180px] px-5"><h2 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Popular private transfers in {d.name}</h2><p className="mt-3 max-w-2xl leading-7 text-slate-600">Drive times are typical estimates. Your exact time and price appear when you search your pickup and drop-off.</p><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.journeys.map(j=><Link key={j.title} href="/#booking-search" className="group flex flex-col rounded-[20px] bg-white p-5 transition hover:shadow-lg hover:shadow-slate-900/5"><h3 className="text-lg font-black">{j.title}</h3><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-[#D96F00] underline-offset-4 group-hover:underline"><Timer size={15}/>{j.time}</p><p className="mt-3 text-sm leading-6 text-slate-600">{j.text}</p></Link>)}</div></div></section> : null}

  {/* Areas + services */}
  <section className="mx-auto max-w-[1180px] px-5 py-16">
    {d.areas?.length ? <><h2 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Areas we cover in {d.name}</h2><ul className="mt-6 flex flex-wrap gap-3">{d.areas.map(a=><li key={a} className="inline-flex items-center gap-2 rounded-full bg-[#F5F6F8] px-4 py-2 font-bold"><MapPin size={16} className="text-[#D96F00]"/>{a}</li>)}</ul></> : null}
    <h2 className={`${d.areas?.length?"mt-14":""} text-3xl font-black tracking-[-.035em] sm:text-4xl`}>Ride services in {d.name}</h2>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{services.map(({title,text,href,icon:Icon})=><a key={href} href={href} className="rounded-[20px] border border-slate-200 p-5 transition hover:border-[#FF8A05]"><Icon className="text-[#FF8A05]"/><h3 className="mt-4 font-black">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></a>)}</div>
  </section>

  {/* Nearby destinations: square place cards */}
  {nearby.length ? <section className="mx-auto max-w-[1180px] px-5 pb-16"><h2 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Popular destinations near {d.name}</h2><div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">{nearby.map(n=><PlaceCard key={n.slug} place={n}/>)}</div></section> : null}

  {/* Why Waydidi: tinted feature panel */}
  <section className="px-3 sm:px-5"><div className="mx-auto max-w-[1440px] rounded-[30px] bg-[#FFF0DF] px-5 py-14 sm:py-16"><div className="mx-auto grid max-w-[1180px] gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{features.map(({title,text,icon:Icon})=><div key={title}><Icon className="text-[#D96F00]"/><h3 className="mt-4 text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-slate-700">{text}</p></div>)}</div></div></section>

  {/* Local knowledge */}
  <section className="mx-auto max-w-[860px] px-5 py-16"><h2 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Travel tips for {d.name} transfers</h2><div className="mt-6 grid gap-5 text-lg leading-8 text-slate-700">{(d.tips?.length?d.tips:[d.note]).map(t=><p key={t}>{t}</p>)}</div></section>

  {/* FAQ: two-column accordion on a tinted panel */}
  {d.faq?.length ? <section className="bg-[#F5F6F8] py-16"><div className="mx-auto max-w-[1180px] px-5"><h2 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">{d.name} transfer FAQ</h2><p className="mt-2 text-lg text-slate-600">Quick answers before you book.</p><div className="mt-8 grid items-start gap-4 md:grid-cols-2">{d.faq.map(f=><details key={f.q} className="group rounded-[20px] bg-white px-6 py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">{f.q}<ChevronDown size={22} className="shrink-0 text-[#D96F00] transition group-open:rotate-180"/></summary><p className="mt-3 leading-7 text-slate-600">{f.a}</p></details>)}</div><div className="mt-8 text-center"><Link href="/faq" className="inline-flex rounded-full bg-[#FF8A05] px-6 py-3 font-black text-white">See all FAQs</Link></div></div></section> : null}

  {/* Closing call to action */}
  <section className="mx-auto max-w-[1180px] px-5 pb-16"><div className="relative overflow-hidden rounded-[30px] bg-[#211726] px-6 py-14 text-center text-white sm:px-12"><div className="absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-[#FF8A05]/25"/><h2 className="relative text-3xl font-black tracking-[-.04em] sm:text-5xl">Your {d.name} ride, ready when you land.</h2><p className="relative mx-auto mt-4 max-w-2xl text-lg leading-8 text-white/75">Choose your exact pickup and drop-off, pick a vehicle for your group and bags, and get a confirmed booking reference.</p><Link href="/#booking-search" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-[#FF8A05] px-7 py-4 font-black">Search your ride <ArrowRight size={18}/></Link></div></section>

  {/* All destinations: plain link columns for internal linking */}
  <section className="border-t border-slate-200 py-14"><div className="mx-auto max-w-[1180px] px-5"><h2 className="text-2xl font-black">Private transfers across Thailand</h2><ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">{destinations.filter(x=>x.slug!==d.slug).map(x=><li key={x.slug}><Link href={`/destinations/${x.slug}`} className="text-slate-600 hover:text-[#D96F00] hover:underline">{x.name} transfers</Link></li>)}<li><Link href="/destinations" className="font-bold text-[#D96F00] hover:underline">All destinations</Link></li></ul></div></section>

  <PublicFooter/>
</main>}
