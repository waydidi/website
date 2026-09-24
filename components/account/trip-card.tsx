import Link from "next/link";
import { ArrowRight, CalendarDays, CarFront, MapPin, UserRoundCheck } from "lucide-react";
import { formatTripDate } from "@/components/account/account-shell";
import { driverStatusLabel, type TripBucket } from "@/lib/customer-account";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

export type TripSummary = {
  reference: string; status: string; pickup: string; dropoff: string; pickupDate: string; pickupTime: string;
  vehicle: string; total: number; serviceType: string; returnDate: string | null;
};

export function vehicleName(id: string) {
  return VEHICLES[id as VehicleId]?.name ?? id.replace(/_/g, " ");
}

const badge: Record<TripBucket, string> = {
  upcoming: "bg-emerald-50 text-emerald-700",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-50 text-red-700",
};
const badgeLabel: Record<TripBucket, string> = { upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled" };

export function TripCard({ trip, bucket, driverStatus, featured = false }: { trip: TripSummary; bucket: TripBucket; driverStatus?: string; featured?: boolean }) {
  return <Link href={`/account/trips/${trip.reference}`} className={`group block rounded-[22px] bg-white p-5 transition hover:shadow-lg hover:shadow-slate-900/5 sm:p-6 ${featured ? "ring-2 ring-[#FF8A05]" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${badge[bucket]}`}>{badgeLabel[bucket]}</span>
      <span className="text-sm font-bold text-slate-500">Ref {trip.reference}</span>
    </div>
    <div className="mt-4 grid gap-2">
      <p className="flex items-start gap-2 font-black"><MapPin size={18} className="mt-0.5 shrink-0 text-[#211726]" /><span className="min-w-0">{trip.pickup}</span></p>
      <p className="flex items-start gap-2 font-black"><MapPin size={18} className="mt-0.5 shrink-0 text-[#FF8A05]" /><span className="min-w-0">{trip.serviceType === "hourly" ? "Hourly driver" : trip.dropoff}</span></p>
    </div>
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
      <span className="inline-flex items-center gap-1.5"><CalendarDays size={16} />{formatTripDate(trip.pickupDate, trip.pickupTime)}</span>
      <span className="inline-flex items-center gap-1.5"><CarFront size={16} />{vehicleName(trip.vehicle)}</span>
      {bucket === "upcoming" ? <span className="inline-flex items-center gap-1.5"><UserRoundCheck size={16} />{driverStatusLabel(driverStatus)}</span> : null}
    </div>
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
      <span className="font-black">฿{trip.total.toLocaleString()}{trip.returnDate ? <span className="ml-2 text-sm font-bold text-slate-500">incl. return</span> : null}</span>
      <span className="inline-flex items-center gap-1 text-sm font-black text-[#C96100]">View trip <ArrowRight size={16} className="transition group-hover:translate-x-0.5" /></span>
    </div>
  </Link>;
}
