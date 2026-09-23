import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing-page";
import { privacyPage, SITE_URL } from "@/lib/public-content";

export const metadata: Metadata = { title: "Privacy & PDPA notice | Waydidi", description: privacyPage.intro, alternates:{canonical:`${SITE_URL}/privacy`} };

export default function PrivacyPage() { return <MarketingPage page={privacyPage}/>; }
