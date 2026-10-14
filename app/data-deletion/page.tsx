import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing-page";
import { dataDeletionPage, SITE_URL } from "@/lib/public-content";

export const metadata: Metadata = { title: "Delete your data | Waydidi", description: dataDeletionPage.intro, alternates: { canonical: `${SITE_URL}/data-deletion` } };

export default function DataDeletionPage() { return <MarketingPage page={dataDeletionPage} />; }
