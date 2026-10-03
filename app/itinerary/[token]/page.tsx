import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Backpack, CalendarDays, Car, CheckCircle2, Clock, Download, MapPin, Shirt, Ticket, Users } from "lucide-react";
import { getDb } from "@/db";
import { agencyApplications, smartTrips } from "@/db/schema";
import { ItineraryActions } from "@/components/itinerary/itinerary-actions";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { YourDay } from "@/components/itinerary/your-day";
import { TripFeedback } from "@/components/itinerary/trip-feedback";
import { reviewUrl } from "@/lib/trip-thanks";
import { tripByToken, tripSnapshot } from "@/lib/smart-trips";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your itinerary · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const longDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Date to be confirmed");
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** Past trip date, or the 7-day price hold is over. */
function quoteExpired(tripDate: string | null, sentAt: string | null) {
  const now = Date.now();
  const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
  return Boolean((tripDate && tripDate < today) || (sentAt && now - Date.parse(sentAt) > 7 * 86_400_000));
}

/** True from the trip day onwards (Bangkok time). */
function tripStarted(tripDate: string | null) {
  return Boolean(tripDate && tripDate <= new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
}

function Unavailable({ title, text }: { title: string; text: string }) {
  return <main className="grid min-h-[70vh] place-items-center bg-[#F5F6F8] px-5"><div className="max-w-md rounded-[24px] bg-white p-8 text-center"><h1 className="text-[24px] font-bold">{title}</h1><p className="mt-3 text-slate-600">{text}</p><Link href="/" className="mt-5 inline-flex h-11 items-center rounded-full bg-[#FF8A05] px-5 font-semibold text-white">Waydidi home</Link></div></main>;
}

export default async function ItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = await tripByToken(token);
  const s = trip ? tripSnapshot(trip) : null;
  if (!trip || !s) return <Unavailable title="Itinerary not found" text="This link isn't valid or the itinerary isn't ready yet. Please check the link or contact us." />;
  if (trip.status === "cancelled") return <Unavailable title="This itinerary was withdrawn" text="Please contact us if you'd still like to travel; we'll gladly plan a new one." />;
  if (!trip.viewedAt) await getDb().update(smartTrips).set({ viewedAt: new Date().toISOString() }).where(eq(smartTrips.id, trip.id)).catch(() => undefined);
  const [agency] = trip.agencyId ? await getDb().select({ name: agencyApplications.agencyName }).from(agencyApplications).where(eq(agencyApplications.id, trip.agencyId)).limit(1) : [];
  const paid = trip.status === "accepted";
  const expired = !paid && quoteExpired(s.tripDate, trip.sentAt);
  const points = [
    ...(s.pickup ? [{ id: "pickup", lat: s.pickup.lat, lng: s.pickup.lng, label: "P", title: `Pickup · ${s.pickupText}`, kind: "pickup" as const }] : []),
    ...s.stops.filter((x) => x.lat != null && x.lng != null).map((x, i) => ({ id: x.id, lat: x.lat!, lng: x.lng!, label: String(i + 1), title: x.name, kind: "stop" as const })),
    ...(s.end ? [{ id: "end", lat: s.end.lat, lng: s.end.lng, label: "E", title: s.endText, kind: "end" as const }] : s.pickup && s.stops.length ? [{ id: "back", lat: s.pickup.lat, lng: s.pickup.lng, label: "P", title: "Back to your hotel", kind: "end" as const }] : []),
  ];

  return <main className="bg-[#F5F6F8] pb-16 text-[#211726]">
    <section className="bg-[#FF8A05] px-5 pb-10 pt-8 text-white">
      <div className="mx-auto max-w-[880px]">
        <p className="text-[13px] font-bold uppercase tracking-[.16em] text-white/80">{agency ? `Prepared by ${agency.name} with Waydidi` : "Your private day trip"}</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight tracking-[-.03em] sm:text-[42px]">{s.title}</h1>
        <p className="mt-2 text-[16px] text-white/90">{s.customerName ? `For ${s.customerName} · ` : ""}{longDate(s.tripDate)}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-[14px] font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5"><Clock size={15} />Pickup {s.startTime}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5"><CalendarDays size={15} />Back around {hhmm(s.returnAt)}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5"><Users size={15} />{s.adults + s.children} traveller{s.adults + s.children > 1 ? "s" : ""}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5"><Car size={15} />{s.vehicleName}</span>
        </div>
      </div>
    </section>

    <div className="mx-auto -mt-5 grid max-w-[880px] gap-4 px-4">
      {paid && <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900 shadow-sm"><p className="flex items-center gap-2 text-[17px] font-bold"><CheckCircle2 size={20} />Booked and paid{trip.bookingReference ? ` · ${trip.bookingReference}` : ""}</p>
        <p className="mt-1 text-[15px]">Your confirmation is in your email. On the day, follow your driver and the next stop live.</p>
        {trip.bookingReference && <Link href={`/trip/${trip.bookingReference}?day=${token}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-emerald-700 px-5 font-semibold text-white">Open “Your day”</Link>}</div>}
      {paid && <YourDay token={token} />}
      {paid && tripStarted(s.tripDate) && <TripFeedback token={token} rating={trip.feedbackRating} reviewUrl={reviewUrl()} />}
      {trip.status === "changes_requested" && <div className="rounded-3xl bg-amber-50 p-5 text-amber-900 shadow-sm"><p className="font-bold">We&apos;re updating your itinerary</p><p className="mt-1 text-[15px]">Thanks for your request. You&apos;ll get a new version soon; this page will show it.</p></div>}

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm"><ItineraryMap points={points} /></section>

      <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-[22px] font-bold">Your day</h2>
        <ol className="mt-4 grid gap-0">
          <Row time={s.startTime} title="Hotel pickup" sub={s.pickupText} dot="P" />
          {s.stops.map((st, i) => <li key={st.id} className="relative grid grid-cols-[64px_1fr] gap-3 pb-6">
            <span className="pt-1 text-[15px] font-bold tabular-nums">{hhmm(st.start)}</span>
            <div className="border-l-2 border-orange-200 pl-4">
              {st.travelMin > 0 && <p className="-mt-1 mb-2 text-[13px] text-slate-500">{dur(st.travelMin)} drive</p>}
              <h3 className="text-[18px] font-bold"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#FF8A05] text-[12px] text-white">{i + 1}</span>{st.name}</h3>
              <p className="mt-0.5 text-[14px] text-slate-600">{hhmm(st.start)}–{hhmm(st.end)}{st.program ? ` · ${st.program}` : ""}{st.openHours ? ` · open ${st.openHours}` : ""}</p>
              {st.checkIn != null && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-[#9A4D00]"><Ticket size={14} />Session at {st.sessionTime}: check in by {hhmm(st.checkIn)}</p>}
              {st.cover && <img src={st.cover} alt={st.name} className="mt-3 aspect-[16/9] w-full rounded-2xl object-cover" loading="lazy" />}
              {st.description && <p className="mt-3 text-[15px] leading-7 text-slate-700">{st.description}</p>}
              {st.highlights.length > 0 && <ul className="mt-2 grid gap-1 text-[14px] text-slate-700">{st.highlights.map((h) => <li key={h}>• {h}</li>)}</ul>}
              {st.gallery.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto">{st.gallery.slice(0, 6).map((g) => <img key={g} src={g} alt="" className="h-24 w-32 shrink-0 rounded-xl object-cover" loading="lazy" />)}</div>}
              {st.dressCode && <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold"><Shirt size={15} className="text-[#D96F00]" />{st.dressCode}</p>}
              {st.fee && <p className="mt-1 text-[13px] text-slate-500">{st.fee.included ? "Tickets included in your price." : `Entrance fee on the day: ${thb(st.fee.adult)} adult${st.fee.child ? `, ${thb(st.fee.child)} child` : ""}.`}</p>}
              {st.note && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-[14px] text-slate-700">{st.note}</p>}
            </div>
          </li>)}
          <Row time={hhmm(s.returnAt)} title={s.end ? "Drop-off" : "Back at your hotel"} sub={s.endText} dot="P" />
        </ol>
        <p className="mt-2 text-[13px] text-slate-500">Times are estimates and may change with traffic. Your driver may adjust the route for weather or local conditions.</p>
      </section>

      {s.packing.length > 0 && <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7"><h2 className="flex items-center gap-2 text-[20px] font-bold"><Backpack size={20} className="text-[#D96F00]" />What to bring</h2>
        <ul className="mt-3 grid gap-2 text-[15px] sm:grid-cols-2">{s.packing.map((p) => <li key={p} className="flex gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />{p}</li>)}</ul></section>}

      {s.notes && <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7"><h2 className="text-[20px] font-bold">Notes</h2><p className="mt-2 whitespace-pre-line text-[15px] text-slate-700">{s.notes}</p></section>}

      <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-[20px] font-bold">Price</h2>
        <dl className="mt-3 grid gap-2 text-[15px]">
          <div className="flex justify-between"><dt className="text-slate-600">Private car, driver, fuel and tolls</dt><dd>{thb(s.transportPrice)}</dd></div>
          {s.feesIncluded > 0 && <div className="flex justify-between"><dt className="text-slate-600">Tickets included</dt><dd>{thb(s.feesIncluded)}</dd></div>}
          {s.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>−{thb(s.discount)}</dd></div>}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-[19px] font-bold"><dt>Total</dt><dd>{thb(s.total)}</dd></div>
          {s.feesOnSite > 0 && <p className="text-[13px] text-slate-500">Plus about {thb(s.feesOnSite)} in entrance fees paid on the day.</p>}
        </dl>
        <div className="mt-5">
          {paid ? null : expired ? <p className="rounded-xl bg-slate-50 p-4 text-[15px] text-slate-700">This price has expired. Please contact us and we&apos;ll confirm it again.</p>
            : <ItineraryActions token={token} total={s.total} name={trip.customerName ?? ""} email={trip.customerEmail ?? ""} phone={trip.customerPhone ?? ""} />}
        </div>
        <a href={`/api/itinerary/${token}/pdf`} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#C96100] hover:underline"><Download size={16} />Download the itinerary (PDF)</a>
        <p className="mt-2 text-[12px] text-slate-500">Reference {s.ref} · version {s.version}. Free cancellation up to 24 hours before pickup; see the <Link href="/refund-policy" className="underline">cancellation policy</Link>.</p>
      </section>
    </div>
  </main>;
}

function Row({ time, title, sub, dot }: { time: string; title: string; sub: string; dot: string }) {
  return <li className="grid grid-cols-[64px_1fr] gap-3 pb-6"><span className="pt-0.5 text-[15px] font-bold tabular-nums">{time}</span>
    <div className="border-l-2 border-orange-200 pl-4"><p className="flex items-center gap-2 text-[16px] font-bold"><span className="grid size-6 place-items-center rounded-full bg-[#211726] text-[12px] text-white">{dot}</span>{title}</p><p className="mt-0.5 flex items-start gap-1 text-[14px] text-slate-600"><MapPin size={14} className="mt-0.5 shrink-0" />{sub}</p></div></li>;
}
