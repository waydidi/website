import Image from "next/image";
import { VEHICLES } from "@/lib/vehicles";

const FLEET: { id: keyof typeof VEHICLES; name: string; models: string }[] = [
  { id: "economy_sedan", name: "Economy", models: "Toyota Corolla Altis or similar" },
  { id: "comfort_bmw", name: "Comfort BMW", models: "BMW 3 Series or similar" },
  { id: "comfort_suv", name: "Comfort SUV", models: "Toyota Fortuner or similar" },
  { id: "premium_minivan", name: "Premium Minivan", models: "Toyota Commuter or similar" },
];

const Person = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="text-grey-text"><circle cx="12" cy="7.5" r="4.5" fill="currentColor" /><path d="M3 21c0-4.4 4-7.5 9-7.5s9 3.1 9 7.5z" fill="currentColor" /></svg>;
const Bag = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="text-grey-text"><path d="M9 3h6v3h2.5A1.5 1.5 0 0 1 19 7.5v11A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H9zm1.5 1.5V6h3V4.5z" fill="currentColor" /><path d="M9 11h6M9 15h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></svg>;

// "Maximum comfort and safety": the Waydidi cars, one card each (swipe on phones).
export function FleetSection() {
  return <section aria-labelledby="fleet-heading" className="font-home overflow-x-clip bg-gradient-to-b from-[#F4F4F2] to-[#ECECE9] py-10 sm:py-14">
    <div className="mx-auto max-w-[1024px] px-5 lg:px-0">
      <h2 id="fleet-heading" className="max-w-[560px] text-[32px] font-bold leading-[1.08] tracking-[-.03em] text-[#141414] sm:text-[40px]">Maximum comfort and safety for your trip</h2>
      <p className="mt-3 text-[17px] text-[#5A5A5A]">Licensed vehicles, professional drivers</p>
      <ul tabIndex={0} className="-mx-5 mt-7 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {FLEET.map((car) => {
          const v = VEHICLES[car.id];
          return <li key={car.id} className="relative flex w-[82%] shrink-0 flex-col overflow-hidden rounded-[22px] border border-[#E4E4E1] bg-white md:w-auto">
            <div className="relative grid h-[180px] place-items-center bg-[radial-gradient(ellipse_at_50%_85%,#EDEDED_0%,#FFFFFF_70%)] px-6">
              <Image src={`/vehicle-${car.id.replace(/_/g, "-")}.webp`} alt={v.name} width={320} height={180} unoptimized className="h-[130px] w-auto object-contain" />
            </div>
            <div className="flex flex-1 flex-col px-5 pb-6 pt-2">
              <h3 className="text-[21px] font-bold tracking-[-.01em] text-[#141414]">{car.name}</h3>
              <p className="mt-2 flex-1 text-[15px] leading-6 text-[#5A5A5A]">{car.models}</p>
              <p className="mt-4 flex items-center gap-6 text-[17px] text-[#141414]">
                <span className="flex items-center gap-2"><Person /><span className="sr-only">Passengers:</span>{v.passengers}</span>
                <span className="flex items-center gap-2"><Bag /><span className="sr-only">Bags:</span>{v.bags}</span>
              </p>
            </div>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}
