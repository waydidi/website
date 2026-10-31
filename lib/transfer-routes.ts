import { limitVehicles } from './vehicle-routes';
import type { Point } from './geo';

export type TransferPlace = Point & {slug: string; name: string; destination: string};
const place = (slug: string, name: string, lat: number, lng: number, destination: string): TransferPlace => ({slug,name,lat,lng,destination});
const bkk=place('bkk-airport','Suvarnabhumi Airport (BKK)',13.6900,100.7501,'bangkok');
const dmk=place('dmk-airport','Don Mueang Airport (DMK)',13.9126,100.6067,'bangkok');
const bangkok=place('bangkok','Bangkok city centre',13.7466,100.5347,'bangkok');
const pattaya=place('pattaya','Pattaya',12.9346,100.8836,'pattaya');
const huahin=place('hua-hin','Hua Hin',12.5684,99.9577,'hua-hin');
const ayutthaya=place('ayutthaya','Ayutthaya',14.3532,100.5689,'ayutthaya');
const kanchanaburi=place('kanchanaburi','Kanchanaburi',14.0228,99.5328,'kanchanaburi');
// Mainland pier only: this route does not promise an island hotel or ferry crossing.
const pier=place('koh-chang-ferry-pier','Ao Thammachat ferry pier (mainland)',12.1758,102.3023,'koh-chang');
const hkt=place('phuket-airport','Phuket Airport (HKT)',8.1132,98.3169,'phuket');
const patong=place('patong','Patong',7.8961,98.2966,'phuket');
const kata=place('kata','Kata Beach',7.8204,98.2995,'phuket');
const khaolak=place('khao-lak','Khao Lak',8.6441,98.2520,'khao-lak');
const krabi=place('krabi','Krabi town',8.0863,98.9063,'krabi');
const kbv=place('krabi-airport','Krabi Airport (KBV)',8.0993,98.9862,'krabi');
const aonang=place('ao-nang','Ao Nang',8.0343,98.8236,'krabi');
const cnx=place('chiang-mai','Chiang Mai',18.7883,98.9853,'chiang-mai');
const rai=place('chiang-rai','Chiang Rai',19.9105,99.8406,'chiang-rai');
const pai=place('pai','Pai',19.3582,98.4404,'pai');
export type TransferRoute = {slug:string;from:TransferPlace;to:TransferPlace;distanceMeters:number;durationMinutes:number};
// Editorial road-distance / driving-time estimates, not live directions. Exact addresses,
// traffic and date are priced again by the existing Google-backed booking flow.
const pairs: [TransferPlace,TransferPlace,number,number][] = [
 [bkk,bangkok,32,45],[dmk,bangkok,27,45],
 [bkk,pattaya,125,110],[dmk,pattaya,165,150],[bangkok,pattaya,150,140],
 [bkk,huahin,230,210],[bangkok,huahin,200,190],
 [bangkok,ayutthaya,80,90],[dmk,ayutthaya,60,60],
 [bangkok,kanchanaburi,145,150],[bkk,pier,310,270],
 [hkt,patong,40,60],[hkt,kata,47,75],[hkt,khaolak,80,90],[hkt,krabi,145,160],
 [kbv,aonang,26,40],[krabi,aonang,18,30],
 [cnx,rai,185,210],[cnx,pai,130,180],
];
export const TRANSFER_ROUTES: TransferRoute[] = pairs.flatMap(([from,to,km,durationMinutes])=>[
 {slug:`${from.slug}-to-${to.slug}`,from,to,distanceMeters:km*1000,durationMinutes},
 {slug:`${to.slug}-to-${from.slug}`,from:to,to:from,distanceMeters:km*1000,durationMinutes},
]);

type PricingDeps = {
 matchArea:(point:Point)=>Promise<{id:string;pricingType:string}|null>;
 prices:(areaId:string,distanceMeters:number)=>Promise<Record<string,{total:number}>>;
};
export type PricedTransfer = TransferRoute & {pricesMinor:Record<string,number>};
/** No demo fares, network routing calls, or fallback prices. Missing pricing fails closed. */
export async function quoteTransferRoute(route:TransferRoute, deps:PricingDeps):Promise<PricedTransfer|null> {
 try {
  const area=await deps.matchArea({lat:route.to.lat,lng:route.to.lng});
  if(!area || area.pricingType==='manual')return null;
  const prices=limitVehicles(await deps.prices(area.id,route.distanceMeters),
   {latitude:route.from.lat,longitude:route.from.lng},{latitude:route.to.lat,longitude:route.to.lng});
  const entries=Object.entries(prices);
  if(!entries.length || entries.some(([,p])=>!Number.isSafeInteger(p.total*100)||p.total<=0))return null;
  return {...route,pricesMinor:Object.fromEntries(entries.map(([id,p])=>[id,p.total*100]))};
 }catch{return null;}
}
export function transferBookingUrl(route:TransferRoute) {
 return '/?'+new URLSearchParams({rebook:'again',pickup:route.from.name,dropoff:route.to.name}).toString()+'#booking-search';
}
