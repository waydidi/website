import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing-page";
import { SITE_URL, termsPage } from "@/lib/public-content";

export const metadata: Metadata = { title: "Terms of service | Waydidi", description: termsPage.intro, alternates:{canonical:`${SITE_URL}/terms`} };

export default function TermsPage() { return <MarketingPage page={termsPage}/>; }
