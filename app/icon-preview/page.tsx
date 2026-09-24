import { CancelCalendar3D } from "@/components/icons/cancel-calendar-3d";
import { AirportRide3D, DayTrip3D, ReserveCalendar3D } from "@/components/icons/service-3d";

export const metadata = { robots: { index: false } };

// Temporary preview of the new 3D icons (not linked anywhere).
export default function IconPreview() {
  const cards = [
    ["Ride", "Go anywhere in Thailand with Waydidi. Reserve your private ride, hop in, and enjoy.", AirportRide3D],
    ["Reserve", "Reserve your ride in advance so you can relax on the day of your trip.", ReserveCalendar3D],
    ["Day trips", "Book a private driver and explore several destinations in one comfortable day.", DayTrip3D],
  ] as const;
  return <main className="font-home mx-auto max-w-[420px] bg-white px-5 py-6">
    <h1 className="text-[26px] font-semibold leading-tight text-[#1C1C1C]">Explore what you can do with Waydidi</h1>
    <div className="mt-5 grid gap-4">
      {cards.map(([title, text, Icon]) => <div key={title} className="flex items-center gap-4 rounded-[24px] bg-[#F3F3F3] p-5">
        <div className="min-w-0 flex-1"><h2 className="text-[20px] font-semibold">{title}</h2><p className="mt-2 text-[15px] leading-6 text-[#4A4A4A]">{text}</p></div>
        <Icon size={96} />
      </div>)}
    </div>
    <div className="mt-6 flex items-center justify-center gap-6"><AirportRide3D size={160} /><AirportRide3D size={160} backdrop="#D9EBFF" /></div>
    <p className="mt-6 text-sm text-slate-500">Blue backdrop variant, to match the cancellation icon:</p>
    <div className="mt-3 flex gap-3"><AirportRide3D size={80} backdrop="#D9EBFF" /><ReserveCalendar3D size={80} backdrop="#D9EBFF" /><DayTrip3D size={80} backdrop="#D9EBFF" /><CancelCalendar3D size={80} /></div>
  </main>;
}
