import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFooter } from "@/components/public-footer";
import { BookingFlow } from "@/components/home/booking-flow";
import { Breadcrumbs, JsonLd, breadcrumbSchema, SHARE_IMAGE, destinationShareImage } from "@/components/seo";
import { destinations, SITE_URL } from "@/lib/public-content";
import { multiCityEnabled } from "@/lib/multi-city-server";

export function generateStaticParams(){return destinations.map(({slug})=>({slug}))}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;const d=destinations.find(x=>x.slug===slug);if(!d)return{};
  const title=d.seoTitle??`Private transfers in ${d.name} | Waydidi`;const description=d.seoDescription??d.intro;const url=`${SITE_URL}/destinations/${d.slug}`;
  return{title,description,alternates:{canonical:url},openGraph:{title,description,url,type:"website",images:[d.image?destinationShareImage(d.slug,d.name):SHARE_IMAGE]}};
}

// A city page is the header, the hero (photo, headline and booking form) and the footer, nothing else.
export default async function DestinationPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const d=destinations.find(x=>x.slug===slug);if(!d)notFound();
  const crumbs=[{name:"Home",path:"/"},{name:"Destinations",path:"/destinations"},{name:d.name,path:`/destinations/${d.slug}`}];
  const schemas:object[]=[breadcrumbSchema(crumbs),{"@context":"https://schema.org","@type":"TaxiService",name:`Waydidi private transfers in ${d.name}`,description:d.seoDescription??d.intro,url:`${SITE_URL}/destinations/${d.slug}`,provider:{"@type":"Organization",name:"Waydidi",url:SITE_URL},areaServed:{"@type":"City",name:d.name,containedInPlace:{"@type":"Country",name:"Thailand"}}}];
  return <BookingFlow multiCity={multiCityEnabled()} hero={{title:d.h1??`Private transfers in ${d.name}`,subtitle:d.intro,image:d.image,homeSpacing:true,top:<Breadcrumbs crumbs={crumbs} className="text-white"/>}}><main className="bg-white text-plum">
  <JsonLd data={schemas}/>
  <PublicFooter/>
</main></BookingFlow>}
