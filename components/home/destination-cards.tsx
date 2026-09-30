import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { destinations } from "@/lib/public-content";

const links = [
  { label: "Airports", href: "/airport-transfer" },
  { label: "Cities", href: "/destinations" },
  { label: "Day trips", href: "/hourly-driver" },
  { label: "And many more", href: "/destinations" },
];

export function DestinationCards() {
  return <section aria-labelledby="home-destinations-heading" className="home-destinations bg-[#F5F6F2] py-8 text-[#080808] sm:py-14 lg:py-20" style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' }}>
    <div className="mx-auto max-w-[1180px] px-5">
      <h2 id="home-destinations-heading" className="text-[32px] font-bold leading-[1.15] tracking-[-.025em] sm:text-[40px] lg:text-[48px]">Destinations</h2>
      <p className="mt-4 max-w-[850px] text-[16px] leading-[26px] text-[#575757] sm:mt-5 sm:text-[18px] sm:leading-8">Book a private transfer to airports, cities and piers across Thailand</p>
      <nav aria-label="Explore destinations" className="mt-8 flex max-w-[430px] flex-wrap gap-x-6 gap-y-4 text-[14px] font-bold leading-[20px] sm:max-w-none sm:gap-x-8 sm:text-[16px]">
        {links.map(link => <Link key={link.label} href={link.href} className="inline-flex items-center gap-2 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FE8B05]">{link.label}<ArrowRight className="size-[15px] sm:size-[18px]" strokeWidth={2.3} aria-hidden="true" /></Link>)}
      </nav>
    </div>
    <div role="region" aria-label="Waydidi service areas — scroll to explore" tabIndex={0} className="home-destination-track mt-11 flex gap-3 overflow-x-auto overscroll-x-contain px-5 pb-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FE8B05] sm:mt-12 sm:gap-4" style={{ scrollSnapType: "x mandatory", scrollPaddingInline: "max(20px, calc((100vw - 1140px) / 2))", paddingInline: "max(20px, calc((100vw - 1140px) / 2))", scrollbarWidth: "none" }}>
      {destinations.map(destination => <Link
        key={destination.slug}
        href={`/destinations/${destination.slug}`}
        className="group relative isolate block aspect-[4/5] w-[65.5vw] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-[16px] text-white outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#FE8B05] sm:w-[320px] sm:rounded-[20px] lg:w-[360px]"
        style={{ backgroundColor: destination.color }}
      >
        {destination.image && <Image src={destination.image} alt="" fill unoptimized sizes="(max-width: 639px) 65.5vw, (max-width: 1023px) 320px, 360px" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]" />}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(0,0,0,.2)_65%,rgba(0,0,0,.85)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-6 sm:px-7 sm:pb-7">
          <h3 className="text-[24px] font-bold leading-[1.15] tracking-[-.01em] sm:text-[28px]">{destination.name}</h3>
          <p className="mt-3 text-[14px] leading-[1.4] text-white/80 sm:text-[16px]">{destination.kicker}</p>
        </div>
      </Link>)}
    </div>
  </section>;
}
