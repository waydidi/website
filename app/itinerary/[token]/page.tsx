import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Backpack, CalendarDays, CheckCircle2, Clock, Download, Landmark, MapPin, Shirt, ShieldCheck, Ticket, X } from "lucide-react";
import { getDb } from "@/db";
import { agencyApplications, smartTrips } from "@/db/schema";
import { HighlightsCard } from "@/components/itinerary/highlights-card";
import { InfoRow } from "@/components/itinerary/info-row";
import { ItineraryActions } from "@/components/itinerary/itinerary-actions";
import { SectionTabs } from "@/components/itinerary/section-tabs";
import { TripMap, type MapPlace } from "@/components/itinerary/trip-map";
import { StopPhoto } from "@/components/itinerary/stop-photo";
import { TripGallery } from "@/components/itinerary/trip-gallery";
import { ticketStops, tripHighlights, tripPhotos, withCurrentPhotos } from "@/lib/trip-photos";
import { attractionsById } from "@/lib/attractions";
import { YourDay } from "@/components/itinerary/your-day";
import { TripFeedback } from "@/components/itinerary/trip-feedback";
import { reviewUrl } from "@/lib/trip-thanks";
import { groupDays, tripByToken, tripSnapshot, tripStops, type TripSnapshot } from "@/lib/smart-trips";
import { getWaydidiAdmin } from "@/lib/admin";
import { dateLocale, fill, tripWords, type TripWords } from "@/lib/trip-i18n";
import { FULL_REFUND_HOURS } from "@/lib/refund-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your itinerary · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const longDate = (d: string | null, lang: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** Past trip date, or the price hold is over. */
function quoteExpired(tripDate: string | null, sentAt: string | null, holdDays: number) {
  const now = Date.now();
  const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
  return Boolean((tripDate && tripDate < today) || (sentAt && now - Date.parse(sentAt) > holdDays * 86_400_000));
}

/** True from the trip day onwards (Bangkok time). */
function tripStarted(tripDate: string | null) {
  return Boolean(tripDate && tripDate <= new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
}

function Unavailable({ title, text, home }: { title: string; text: string; home: string }) {
  return <main className="grid min-h-[70vh] place-items-center bg-canvas px-5"><div className="max-w-md rounded-[24px] bg-white p-8 text-center"><h1 className="text-[24px] font-bold">{title}</h1><p className="mt-3 text-slate-600">{text}</p><Link href="/" className="mt-5 inline-flex h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">{home}</Link></div></main>;
}

export default async function ItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await tripByToken(token);
  const sentDays = opened ? (await groupDays(opened)).map((d) => ({ trip: d, snap: tripSnapshot(d) })).filter((d): d is { trip: typeof d.trip; snap: TripSnapshot } => Boolean(d.snap)) : [];
  // Photos come from the attractions as they are now (staff may add them after sending); everything else as sent.
  const attractionOf = Object.fromEntries(sentDays.flatMap((d) => tripStops(d.trip).map((x) => [x.id, x.attractionId])));
  const current = await attractionsById(Object.values(attractionOf).filter((x): x is string => Boolean(x)));
  const days = sentDays.map((d) => ({ ...d, snap: { ...d.snap, stops: withCurrentPhotos(d.snap.stops, attractionOf, current) } }));
  const lead = days[0];
  const w = tripWords(opened?.language);
  if (!opened || !lead) return <Unavailable title={w.notFound} text={w.notFoundText} home={w.home} />;
  const trip = lead.trip, s = lead.snap;
  if (trip.status === "cancelled") return <Unavailable title={w.withdrawn} text={w.withdrawnText} home={w.home} />;
  // Staff previews don't count as the customer opening it.
  if (!trip.viewedAt && !(await getWaydidiAdmin())) await getDb().update(smartTrips).set({ viewedAt: new Date().toISOString() }).where(eq(smartTrips.id, trip.id)).catch(() => undefined);
  const [agency] = trip.agencyId ? await getDb().select({ name: agencyApplications.agencyName }).from(agencyApplications).where(eq(agencyApplications.id, trip.agencyId)).limit(1) : [];
  const lang = trip.language;
  const paid = trip.status === "accepted";
  const expired = !paid && quoteExpired(s.tripDate, trip.sentAt, trip.holdDays);
  const multi = days.length > 1;
  const sum = (f: (x: TripSnapshot) => number) => days.reduce((n, d) => n + f(d.snap), 0);
  const total = sum((x) => x.total);
  const packing = [...new Set(days.flatMap((d) => d.snap.packing))];
  const travellers = s.adults + s.children;
  const leadToken = trip.token;

  const allStops = days.flatMap((d) => d.snap.stops.filter((x) => !(d.snap.liveSkipped ?? []).includes(x.id)));
  const photos = tripPhotos(allStops);
  const highlights = tripHighlights(allStops);
  const tickets = ticketStops(allStops);
  const highlightItems = [...new Set(highlights.flatMap((h) => h.items))];
  // "View maps": a pin and card for each day's pickup and each place with a location (address from the attraction).
  const mapPlaces: MapPlace[] = days.flatMap((d) => {
    const s = d.snap, day = multi ? `${fill(w.day, { n: d.trip.dayNumber })} · ` : "";
    return [
      ...(s.pickup ? [{ id: `pickup-${d.trip.id}`, kind: "pickup" as const, lat: s.pickup.lat, lng: s.pickup.lng, name: s.pickupText || w.hotelPickup, photo: null, subtitle: `${day}${w.departure} · ${s.startTime}`, detail: "" }] : []),
      ...s.stops.filter((x) => !(s.liveSkipped ?? []).includes(x.id) && x.lat != null && x.lng != null).map((x) => {
        const a = current[attractionOf[x.id] ?? ""];
        return { id: `${d.trip.id}-${x.id}`, kind: "stop" as const, lat: x.lat!, lng: x.lng!, name: x.name, photo: x.cover ?? x.gallery[0] ?? null, subtitle: `${day}${w.mapAttraction}`, detail: a?.address || a?.area || "" };
      }),
    ];
  });
  const tabs = [
    ...(highlightItems.length ? [{ id: "highlights", label: w.highlights }] : []), { id: "expect", label: w.tabExpect },
    { id: "includes", label: w.tabIncludes }, { id: "booking", label: w.tabBooking },
  ];
  const lastReturn = hhmm(days.at(-1)!.snap.returnAt);
  const dressCodes = [...new Map(allStops.filter((x) => x.dressCode).map((x) => [x.dressCode!, x.name])).entries()];
  // Every section runs the full width of the page (no card); headings carry a short coloured bar, like Klook's.
  const card = "-mx-4 scroll-mt-[131px] bg-white px-4 py-6 sm:px-7 lg:scroll-mt-[159px]";
  const heading = "border-l-4 border-brand pl-3 text-[22px] font-bold leading-7";

  return <main className="bg-canvas pb-16 text-plum">
    <div className="mx-auto max-w-[880px]"><TripGallery photos={photos} words={w} /></div>
    <div className={`relative z-10 mx-auto max-w-[880px] bg-white px-4 pb-6 pt-6 sm:px-7 ${photos.length ? "-mt-5 rounded-t-card" : ""}`}>
      <h1 className="text-[28px] font-black leading-tight tracking-[-.035em] sm:text-[38px]">{s.title}</h1>
      {s.pickupText && <p className="mt-2 text-[17px] text-slate-600">{fill(w.departingFrom, { place: "" })}<span className="font-semibold text-plum">{s.pickupText}</span></p>}
      <p className="mt-2 text-[15px] font-semibold text-brand-deep">{agency ? fill(w.preparedBy, { agency: agency.name }) : multi ? fill(w.multiDay, { n: days.length }) : w.privateTrip}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[15px] text-slate-700"><CalendarDays size={15} className="shrink-0 text-slate-500" />{longDate(s.tripDate, lang)}{multi ? ` – ${longDate(days.at(-1)!.snap.tripDate, lang)}` : ""}</p>
      <ul className="mt-4 flex flex-wrap gap-2 text-[15px] text-slate-700">
        {[w.privateCarChip, w.hotelPickup, travellers > 1 ? fill(w.travellers, { n: travellers }) : w.traveller, multi ? fill(w.daysChip, { n: days.length }) : fill(w.hoursChip, { n: s.durationHours }), allStops.length === 1 ? w.stopCount : fill(w.stopsCount, { n: allStops.length })].map((c) => <li key={c} className="rounded-md bg-slate-100 px-3 py-1.5">{c}</li>)}
      </ul>
    </div>
    <SectionTabs tabs={tabs} label={w.sectionsNav} />

    <div className="mx-auto mt-5 grid max-w-[880px] gap-4 px-4">
      {paid && <div className="-mx-4 bg-emerald-50 px-4 py-5 text-emerald-900 sm:px-7"><p className="flex items-center gap-2 text-[17px] font-bold"><CheckCircle2 size={20} />{w.paidTitle}{trip.bookingReference ? ` · ${trip.bookingReference}` : ""}</p>
        <p className="mt-1 text-[15px]">{w.paidText}</p>
        {trip.bookingReference && <Link href={`/trip/${trip.bookingReference}?day=${leadToken}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-emerald-700 px-5 font-semibold text-white">{w.openYourDay}</Link>}</div>}
      {paid && <YourDay token={leadToken} words={w} />}
      {paid && tripStarted(s.tripDate) && <TripFeedback token={leadToken} rating={trip.feedbackRating} reviewUrl={reviewUrl()} words={w} />}
      {trip.status === "changes_requested" && <div className="-mx-4 bg-amber-50 px-4 py-5 text-amber-900 sm:px-7"><p className="font-bold">{w.updating}</p><p className="mt-1 text-[15px]">{w.updatingText}</p></div>}

      <section id="highlights" className={card}>
        {highlightItems.length > 0 && <><h2 className={heading}>{w.highlights}</h2>
          <div className="mt-4"><HighlightsCard items={highlightItems} words={w} /></div></>}
        {/* The day at a glance, like Klook's: places, hours, how it starts, cancellation; then the route map. */}
        <div className={`rounded-card bg-[#fcfaf8] px-5 py-5 ring-1 ring-slate-100 sm:px-6 ${highlightItems.length ? "mt-5" : ""}`}>
          <ul className="grid gap-3 text-[17px] leading-6 text-plum">
            {allStops.length > 0 && <li className="flex gap-3"><Landmark size={22} aria-hidden className="mt-px shrink-0 text-emerald-600" /><ul className="grid gap-2.5">{[...new Set(allStops.map((x) => x.name))].map((n) => <li key={n}>{n}</li>)}</ul></li>}
            <li className="flex gap-3"><Clock size={22} aria-hidden className="mt-px shrink-0 text-emerald-600" /><ul className="grid gap-2.5">{days.map((d) => <li key={d.trip.id}>{multi ? `${fill(w.day, { n: d.trip.dayNumber })} · ` : ""}{d.snap.startTime} – {hhmm(d.snap.returnAt)}</li>)}</ul></li>
            <li className="flex gap-3"><MapPin size={22} aria-hidden className="mt-px shrink-0 text-emerald-600" />{fill(w.departureType, { type: w.hotelPickup })}</li>
            <li className="flex gap-3"><ShieldCheck size={22} aria-hidden className="mt-px shrink-0 text-emerald-600" />{fill(w.freeCancelNotice, { hours: FULL_REFUND_HOURS })}</li>
          </ul>
          <TripMap places={mapPlaces} words={w} />
        </div>
      </section>

      <section id="expect" className={card}>
        <h2 className={heading}>{w.tabExpect}</h2>
        <WhatToExpect days={days.map((d) => ({ id: d.trip.id, label: multi ? fill(w.day, { n: d.trip.dayNumber }) : "", s: d.snap }))} stops={allStops} w={w} />
        <h3 className="mt-8 text-[20px] font-bold">{w.itineraryHeading}</h3>
        <div className="mt-5 grid gap-8">
          {multi && <nav aria-label="Days" className="flex gap-2 overflow-x-auto">{days.map((d) => <a key={d.trip.id} href={`#day-${d.trip.dayNumber}`} className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-[14px] font-semibold hover:border-brand">{fill(w.day, { n: d.trip.dayNumber })} · {d.snap.tripDate ? new Date(`${d.snap.tripDate}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", timeZone: "UTC" }) : ""}</a>)}</nav>}
          {days.map((d) => <DayTimeline key={d.trip.id} s={d.snap} w={w} title={multi ? `${fill(w.day, { n: d.trip.dayNumber })} · ${longDate(d.snap.tripDate, lang)}` : undefined} id={multi ? `day-${d.trip.dayNumber}` : undefined} />)}
        </div>
      </section>

      <section id="includes" className={card}>
        <h2 className={heading}>{w.included}</h2>
        <ul className="mt-4 grid gap-3 text-[16px]">
          {[w.transport, w.hotelTransfer, ...(tickets.included.length ? [fill(w.ticketsAt, { places: tickets.included.join(", ") })] : [])].map((x) => <li key={x} className="flex items-start gap-3"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />{x}</li>)}
          {tickets.onSite.map((place) => <li key={place} className="flex items-start gap-3"><X size={20} className="mt-0.5 shrink-0 text-slate-400" /><span><span className="sr-only">{w.notIncluded}: </span>{fill(w.feeAt, { place })}</span></li>)}
        </ul>
        <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          <InfoRow title={w.accPickup} closeLabel={w.closeLabel}>
            <ul className="grid gap-1.5">{days.map((d) => <li key={d.trip.id}>{multi ? `${fill(w.day, { n: d.trip.dayNumber })} · ` : ""}{fill(w.pickupAt, { time: d.snap.startTime, place: d.snap.pickupText || w.hotelPickup })}</li>)}</ul>
            {!multi && <p className="mt-1.5">{fill(w.backAround, { time: lastReturn })}{s.endText && s.endText !== s.pickupText ? ` · ${s.endText}` : ""}</p>}
          </InfoRow>
          {(packing.length > 0 || dressCodes.length > 0 || days.some((d) => d.snap.notes)) && <InfoRow title={w.accBefore} closeLabel={w.closeLabel}>
            {packing.length > 0 && <><p className="font-semibold text-plum">{w.whatToBring}</p><ul className="mt-1.5 grid gap-1.5">{packing.map((p) => <li key={p} className="flex gap-2"><Backpack size={16} className="mt-1 shrink-0 text-brand-text" />{p}</li>)}</ul></>}
            {dressCodes.length > 0 && <ul className="mt-3 grid gap-1.5">{dressCodes.map(([code, place]) => <li key={code} className="flex gap-2"><Shirt size={16} className="mt-1 shrink-0 text-brand-text" />{place}: {code}</li>)}</ul>}
            {days.filter((d) => d.snap.notes).map((d) => <p key={d.trip.id} className="mt-3 whitespace-pre-line"><span className="font-semibold text-plum">{w.notes}{multi ? ` (${fill(w.day, { n: d.trip.dayNumber })})` : ""}: </span>{d.snap.notes}</p>)}
          </InfoRow>}
          <InfoRow title={w.accTerms} closeLabel={w.closeLabel}>
            <p>{fill(w.refLine, { ref: s.ref, v: s.version, hours: FULL_REFUND_HOURS })} <Link href="/refund-policy" className="font-semibold text-brand-deep underline">{w.policy}</Link>.</p>
            {!paid && <p className="mt-2">{fill(w.priceHeld, { n: trip.holdDays })}</p>}
            <p className="mt-2">{w.timesNote}</p>
          </InfoRow>
          <InfoRow title={w.accHow} closeLabel={w.closeLabel}>
            <ol className="grid list-decimal gap-1.5 pl-5">{[w.howStep1, w.howStep2, w.howStep3].map((x) => <li key={x}>{x}</li>)}</ol>
          </InfoRow>
        </div>
      </section>

      <section id="booking" className={card}>
        <p className="text-[15px] text-slate-600">{w.totalFor}</p>
        <p className="mt-1 text-[32px] font-black tracking-[-.03em]">{thb(total)}</p>
        <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-[15px]">
          {multi ? days.map((d) => <div key={d.trip.id} className="flex justify-between"><dt className="text-slate-600">{fill(w.day, { n: d.trip.dayNumber })}</dt><dd>{thb(d.snap.total)}</dd></div>) : <>
            <div className="flex justify-between gap-3"><dt className="text-slate-600">{w.transport}</dt><dd>{thb(s.transportPrice)}</dd></div>
            {s.feesIncluded > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-600">{w.tickets}</dt><dd>{thb(s.feesIncluded)}</dd></div>}
            {s.discount > 0 && <div className="flex justify-between gap-3 text-emerald-700"><dt>{w.discount}</dt><dd>−{thb(s.discount)}</dd></div>}
          </>}
          {sum((x) => x.feesOnSite) > 0 && <p className="text-[13px] text-slate-500">{fill(w.plusFees, { amount: thb(sum((x) => x.feesOnSite)) })}</p>}
        </dl>
        <div className="mt-5">
          {paid ? null : expired ? <p className="rounded-xl bg-slate-50 p-4 text-[15px] text-slate-700">{w.expired}</p>
            : <ItineraryActions token={leadToken} total={total} name={trip.customerName ?? ""} email={trip.customerEmail ?? ""} phone={trip.customerPhone ?? ""} words={w} />}
        </div>
        <a href={`/api/itinerary/${leadToken}/pdf`} className="mt-4 inline-flex min-h-tap items-center gap-1.5 text-[15px] font-semibold text-brand-darker hover:underline"><Download size={16} />{w.downloadPdf}</a>
        <p className="mt-1 text-[12px] text-slate-500">{fill(w.refLine, { ref: s.ref, v: s.version, hours: FULL_REFUND_HOURS })} <Link href="/refund-policy" className="underline">{w.policy}</Link>.</p>
      </section>
    </div>
  </main>;
}

/** "What to expect", like Klook's: one line about the day, then a bullet per place. */
function WhatToExpect({ days, stops, w }: { days: { id: string; label: string; s: TripSnapshot }[]; stops: TripSnapshot["stops"]; w: TripWords }) {
  const s = days[0].s;
  return <>
    <p className="mt-4 text-[17px] leading-7">{fill(w.expectIntro, { place: s.pickupText || w.hotelPickup })}</p>
    <ul className="mt-3 grid gap-2.5 text-[17px] leading-7">
      {stops.map((x) => <li key={x.id} className="flex gap-3"><span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-plum" />{x.description?.trim() || fill(w.visitPlace, { place: x.name })}</li>)}
    </ul>
  </>;
}

/** One day as a timeline: departure, each place (name and photo) and the return, on one grey line. The route map is behind "View maps". */
function DayTimeline({ s, w, title, id }: { s: TripSnapshot; w: TripWords; title?: string; id?: string }) {
  const skipped = s.liveSkipped ?? [];
  const stops = s.stops.filter((x) => !skipped.includes(x.id));
  const dot = "absolute left-0 top-0 grid size-10 place-items-center rounded-full";
  return <div id={id} className="scroll-mt-[131px] lg:scroll-mt-[159px]">
    {title && <h3 className="mb-3 text-[19px] font-bold">{title}</h3>}
    <ol className="relative grid gap-6 before:absolute before:bottom-5 before:left-5 before:top-5 before:w-0.5 before:-translate-x-1/2 before:bg-slate-200">
      <li className="relative min-h-10 pl-14">
        <span aria-hidden className={`${dot} bg-brand-wash text-brand-deep`}><MapPin size={20} /></span>
        <p className="pt-1.5 text-[18px] font-bold"><span className="tabular-nums">{s.startTime}</span> · {w.departure}</p>
        <p className="mt-0.5 text-[15px] text-slate-600">{s.pickupText || w.hotelPickup}</p>
      </li>
      {stops.map((st) => {
        const photos = [st.cover, ...st.gallery].filter((x, i, all): x is string => Boolean(x) && all.indexOf(x) === i);
        return <li key={st.id} className="relative pl-14">
          <span aria-hidden className={`${dot} bg-emerald-50 text-emerald-700`}><Landmark size={19} /></span>
          <h4 className="pt-1.5 text-[18px] font-bold">{st.name}</h4>
          {st.program && <p className="mt-0.5 text-[14px] text-slate-600">{st.program}</p>}
          {st.checkIn != null && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-[#9A4D00]"><Ticket size={14} />{fill(w.sessionCheckIn, { time: st.sessionTime ?? "", checkIn: hhmm(st.checkIn) })}</p>}
          {photos.length > 0 && <div className="mt-3 overflow-hidden rounded-2xl"><StopPhoto photos={photos} name={st.name} words={w} className="aspect-[16/10] w-full object-cover" /></div>}
        </li>;
      })}
      <li className="relative min-h-10 pl-14">
        <span aria-hidden className={`${dot} bg-brand-wash text-brand-deep`}><MapPin size={20} /></span>
        <p className="pt-1.5 text-[18px] font-bold"><span className="tabular-nums">{hhmm(s.returnAt)}</span> · {w.returnLabel}</p>
        <p className="mt-0.5 text-[15px] text-slate-600">{s.end ? s.endText : w.backAtHotel}</p>
      </li>
    </ol>
    <p className="mt-4 text-[13px] text-slate-500">* {w.timesNote}</p>
  </div>;
}
