import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { FlightStatusSearch } from "@/components/flights/flight-status";
import { JsonLd, breadcrumbSchema } from "@/components/seo";
import { SITE_URL } from "@/lib/public-content";

const URL_PATH = "/flights";
export const metadata: Metadata = {
  title: "Flight Status Thailand – Arrivals & Departures | Waydidi",
  description: "Check the live status of domestic Thai flights and flights to and from Thailand by flight number or route. Then book your airport transfer.",
  alternates: { canonical: `${SITE_URL}${URL_PATH}` },
};

// App-style page like Trip.com: no site header or footer, just a back arrow, the title and the search card.
export default function FlightsPage() {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Flight status", path: URL_PATH }];
  return <main className="font-home min-h-dvh bg-white bg-[linear-gradient(180deg,#FE8B05_0px,#FFA33D_200px,#FFE3C2_360px,#FFFFFF_480px)] bg-no-repeat text-[#211726]">
    <JsonLd data={breadcrumbSchema(crumbs)} />
    <div className="mx-auto max-w-[720px] px-4 pb-12 pt-[calc(14px+env(safe-area-inset-top))] sm:px-6">
      <div className="flex h-12 items-center gap-3">
        <Link href="/" aria-label="Back to homepage" className="-ml-2 grid size-10 place-items-center rounded-full text-white hover:bg-white/15"><ChevronLeft size={30} strokeWidth={1.8} /></Link>
        <h1 className="text-[22px] font-semibold text-white">Flight status</h1>
      </div>
      <div className="mt-12"><FlightStatusSearch /></div>
    </div>
  </main>;
}
