export type RouteStopCard = { id: string; name: string; photo: string | null; durationMinutes: number; priceMinor: number };
export type RouteStopSelection = { key: string; ids: string[] };
export function selectedRouteStopIds(selection: RouteStopSelection, key: string): string[] {
  return selection.key === key ? selection.ids : [];
}
export function toggleRouteStop(selection: RouteStopSelection, key: string, id: string): RouteStopSelection {
  const ids = selectedRouteStopIds(selection, key);
  return { key, ids: ids.includes(id) ? ids.filter(value => value !== id) : ids.length < 3 ? [...ids, id] : ids };
}
