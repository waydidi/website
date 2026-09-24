import { WaydidiWordmark } from "@/components/waydidi-logo";
import { FooterLegal } from "@/components/footer-legal";
import { destinations } from "@/lib/public-content";

const columns = [
  {title:"Ride",links:[["Airport transfer","/airport-transfer"],["A-to-B transfer","/a-to-b-transfer"],["Long journeys","/long-journeys"],["Hourly driver","/hourly-driver"]]},
  {title:"Destinations",links:[...destinations.map(d=>[d.name,`/destinations/${d.slug}`]),["All destinations","/destinations"]]},
  {title:"Help",links:[["Help centre","/help"],["Contact support","/contact"],["Frequently asked questions","/faq"],["Manage booking","/booking/manage"],["Airport pickup guide","/airport-pickup-instructions"]]},
];

export function PublicFooter(){return <footer className="bg-[#FF8A05] text-white">
  <div className="mx-auto max-w-[1240px] px-5 py-14 lg:px-8">
    <div className="grid gap-10 lg:grid-cols-[1.25fr_2fr]">
      <div><a href="/" className="inline-flex text-white" aria-label="Waydidi home"><WaydidiWordmark className="h-[40px] w-[156px]"/></a><p className="mt-5 max-w-sm text-base leading-7 text-white/90">Private transfers across Thailand with clear booking details and local driver operations.</p></div>
      <div className="grid gap-8 sm:grid-cols-3">{columns.map(c=><div key={c.title}><h3 className="font-black">{c.title}</h3><ul className="mt-4 space-y-3 text-sm text-white/90">{c.links.map(([label,href])=><li key={href}><a className="hover:text-white hover:underline" href={href}>{label}</a></li>)}</ul></div>)}</div>
    </div>
    <div className="mt-12 flex flex-col gap-4 border-t border-white/30 pt-7 text-sm text-white/85 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-5"><a href="/about">About</a><a href="/cancellation-refund-policy">Cancellation & refunds</a><a href="/luggage-policy">Luggage</a><a href="/safety-driver-standards">Safety</a><a href="/terms">Terms</a><a href="/privacy">Privacy / PDPA</a></div></div>
    <FooterLegal />
  </div>
</footer>}
