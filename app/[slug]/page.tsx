import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPage } from "@/components/marketing-page";
import { publicPages, SITE_URL } from "@/lib/public-content";

export function generateStaticParams(){return publicPages.map(({slug})=>({slug}))}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const page=publicPages.find(p=>p.slug===slug);if(!page)return {};return {title:`${page.eyebrow} | Waydidi`,description:page.intro,alternates:{canonical:`${SITE_URL}/${page.slug}`},openGraph:{title:`${page.title} | Waydidi`,description:page.intro,url:`${SITE_URL}/${page.slug}`,type:"website"}}}
export default async function PublicInfoPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const page=publicPages.find(p=>p.slug===slug);if(!page)notFound();return <MarketingPage page={page}/>}
