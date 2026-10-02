import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { MarketingPage } from "@/components/marketing-page";
import { BookingFlow } from "@/components/home/booking-flow";
import { Breadcrumbs } from "@/components/seo";

// Service pages that open with the city-page hero: photo, headline and the booking form.
const SERVICE_HEROES: Record<string, { title: string; subtitle: string; image: string; crumb: string }> = {
  "airport-transfer": { title: "Private airport transfers in Thailand", subtitle: "Pre-book your airport pickup or drop-off with a fixed price, a confirmed vehicle and a driver who meets you at arrivals.", image: "/service-ride-airport.webp", crumb: "Airport transfer" },
  "a-to-b-transfer": { title: "City-to-city private transfers", subtitle: "Your own car and driver between Thai cities, hotels and beaches, door to door with no shared stops.", image: "/destinations/pattaya.webp", crumb: "City-to-city transfer" },
  "long-journeys": { title: "Multi-city private transfers", subtitle: "Travel across Thailand in one comfortable private car, with stops, islands and ferries planned for you.", image: "/destinations/koh-chang.webp", crumb: "Multi-city transfer" },
};
import { publicPages, SITE_URL } from "@/lib/public-content";

export function generateStaticParams(){return publicPages.map(({slug})=>({slug}))}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const page=publicPages.find(p=>p.slug===slug);if(!page)return {};return {title:`${page.eyebrow} | Waydidi`,description:page.intro,alternates:{canonical:`${SITE_URL}/${page.slug}`},openGraph:{title:`${page.title} | Waydidi`,description:page.intro,url:`${SITE_URL}/${page.slug}`,type:"website"}}}
export default async function PublicInfoPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;if(slug==="cancellation-refund-policy")permanentRedirect("/refund-policy");const page=publicPages.find(p=>p.slug===slug);if(!page)notFound();const hero=SERVICE_HEROES[slug];if(!hero)return <MarketingPage page={page}/>;
  return <BookingFlow hero={{title:hero.title,subtitle:hero.subtitle,image:hero.image,top:<Breadcrumbs crumbs={[{name:"Home",path:"/"},{name:hero.crumb,path:`/${slug}`}]} className="text-white"/>}}><MarketingPage page={page} hideHero/></BookingFlow>}
