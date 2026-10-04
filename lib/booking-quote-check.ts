import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, fareQuotes, hourlyQuotes, pricingAreas, smartTrips } from "@/db/schema";
import { validTransferQuote } from "./quote-validity";
import { validHourlyQuoteWindow } from "./hourly-policy";
import { pricesForArea } from "./pricing";
import { withSeason } from "./seasons";
import { demoTripFor } from "./demo-route";
export async function validTransferPrice(quote:typeof fareQuotes.$inferSelect,vehicle:string) {
 if(!validTransferQuote(quote)||!quote.departureDate) return false;
 const quoted=JSON.parse(quote.vehiclePricesJson)[vehicle]?.total;
 let prices:Record<string,{total:number}>;
 if(quote.areaId.startsWith("sample-")) {
  const trip=demoTripFor(quote.pickupText,quote.dropoffText)??demoTripFor(quote.dropoffText,quote.pickupText);
  if(!trip||quote.areaId!==`sample-${trip.id}`) return false;
  prices=Object.fromEntries(Object.entries(trip.prices).map(([id,total])=>[id,{total}]));
 } else {
  const [area]=await getDb().select().from(pricingAreas).where(eq(pricingAreas.id,quote.areaId)).limit(1);
  if(!area||area.status!=="published"||area.version!==quote.pricingVersion)return false;
  prices=await pricesForArea(area.id,quote.distanceMeters);
 }
 const current=await withSeason(prices,quote.departureDate,{service:"transfer",areaId:quote.areaId});
 return Number.isSafeInteger(quoted)&&quoted>0&&current[vehicle]?.total===quoted;
}
export async function validBookingQuotes(booking:typeof bookings.$inferSelect) {
 const vehicle=Object.entries((await import("./vehicles")).VEHICLES).find(([id,v])=>id===booking.vehicle||v.name===booking.vehicle)?.[0];
 if(!vehicle) return false;
 // Tours use the itinerary price frozen by operations, rather than a transfer quote.
 if(booking.serviceType==="tour") {
  const days=await getDb().select().from(smartTrips).where(eq(smartTrips.bookingReference,booking.reference)).orderBy(smartTrips.dayNumber);
  if(!days.length||days.some(trip=>!["sent","accepted"].includes(trip.status)||!trip.snapshotJson)) return false;
  try {
   const snapshots=days.map(trip=>JSON.parse(trip.snapshotJson!) as {total:number;tripDate:string;startTime:string});
   return snapshots.every(snapshot=>Number.isSafeInteger(snapshot.total)&&snapshot.total>=0)&&snapshots.reduce((total,snapshot)=>total+snapshot.total,0)===booking.total&&snapshots[0].tripDate===booking.pickupDate&&snapshots[0].startTime===booking.pickupTime;
  } catch { return false; }
 }
 if(booking.serviceType==="hourly") {
  if(!booking.hourlyQuoteId)return false;
  const [quote]=await getDb().select().from(hourlyQuotes).where(eq(hourlyQuotes.id,booking.hourlyQuoteId)).limit(1);
  return !!quote&&validHourlyQuoteWindow(quote)&&quote.departureDate===booking.pickupDate&&quote.departureTime===booking.pickupTime;
 }
 if(!booking.fareQuoteId)return false;
 const [out]=await getDb().select().from(fareQuotes).where(eq(fareQuotes.id,booking.fareQuoteId)).limit(1);
 if(!out||out.departureDate!==booking.pickupDate||out.departureTime!==booking.pickupTime||!await validTransferPrice(out,vehicle))return false;
 if(booking.returnDate) {
  if(!booking.returnFareQuoteId)return false;
  const [back]=await getDb().select().from(fareQuotes).where(eq(fareQuotes.id,booking.returnFareQuoteId)).limit(1);
  if(!back||back.pickupPlaceId!==out.dropoffPlaceId||back.dropoffPlaceId!==out.pickupPlaceId||back.departureDate!==booking.returnDate||back.departureTime!==booking.returnTime||!await validTransferPrice(back,vehicle))return false;
 }
 return true;
}
