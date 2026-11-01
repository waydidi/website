/** A primitive key for a route page's prefill, so the booking form applies it once per route
 *  and a new prop object on re-render never overwrites what the customer typed. */
export function routePrefillKey(route?: {pickup: string; dropoff: string} | null): string {
  return route ? JSON.stringify([route.pickup, route.dropoff]) : '';
}
