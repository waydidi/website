import { env } from 'cloudflare:workers';
import { matchPublishedArea, pricesForArea } from './pricing';
import { quoteTransferRoute, TRANSFER_ROUTES } from './transfer-routes';

export const transferPagesEnabled = () => (env as unknown as Record<string,unknown>).TRANSFER_ROUTE_PAGES === '1';
/** Reads published rules only. No calls to Google or paid translation during indexing. */
export async function publishedTransferRoutes() {
 if (!transferPagesEnabled()) return [];
 const priced=[];
 // Bounded sequential reads avoid 38 parallel D1 operations per cache miss.
 for (const route of TRANSFER_ROUTES) {
  const quote=await quoteTransferRoute(route,{matchArea:matchPublishedArea,prices:pricesForArea});
  if(quote)priced.push(quote);
 }
 return priced;
}
export async function publishedTransferRoute(slug:string) {
 if(!transferPagesEnabled())return null;
 const route=TRANSFER_ROUTES.find(r=>r.slug===slug);
 return route ? quoteTransferRoute(route,{matchArea:matchPublishedArea,prices:pricesForArea}) : null;
}
