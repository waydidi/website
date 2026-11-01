import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Input } from "@/components/ui/input";
import { getWaydidiAdmin } from "@/lib/admin";
import { listRouteStopAttractions, listRouteStopOffers, RouteStopValidationError, saveRouteStopOffer, type RouteStopOffer } from "@/lib/route-stops-db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Paid route stops · Waydidi operations", robots: { index: false, follow: false } };
const path = "/admin/route-stops";

async function saveOffer(data: FormData) {
  "use server";
  const staff = await getWaydidiAdmin();
  if (!staff || (staff.role !== "owner" && staff.role !== "operations")) throw new Error("Permission denied.");
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  // Do not rely solely on the page gate or the framework's action CSRF check.
  if (!origin || !host || !["https://", "http://"].some(scheme => origin === `${scheme}${host}`)) throw new Error("Request blocked.");
  let errorMessage: string | null = null;
  try {
    await saveRouteStopOffer({
      id: data.get("id") || crypto.randomUUID(), attractionId: data.get("attractionId"),
      originZoneJson: data.get("originZoneJson"), destinationZoneJson: data.get("destinationZoneJson"),
      priceMinor: Number(data.get("priceMinor")), durationMinutes: Number(data.get("durationMinutes")),
      sort: Number(data.get("sort")), active: data.get("active") === "on", bidirectional: data.get("bidirectional") === "on",
    });
  } catch (error) {
    if (!(error instanceof RouteStopValidationError)) throw error;
    errorMessage = error.message;
  }
  if (errorMessage) redirect(`${path}?error=${encodeURIComponent(errorMessage)}`);
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

type Attraction = { id: string; name: string };
function OfferForm({ offer, attractions }: { offer?: RouteStopOffer; attractions: Attraction[] }) {
  const prefix = offer?.id ?? "new";
  const fieldClass = "flex flex-col gap-2 text-sm font-bold";
  return <form action={saveOffer} className="space-y-5 rounded-card bg-white p-5 text-plum shadow-sm dark:bg-card dark:text-card-foreground">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-black tracking-[-.035em]">{offer?.name ?? "New route stop"}</h2>
      {offer && <span className={`rounded-full px-3 py-1 text-xs font-bold ${offer.active ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{offer.active ? "Active" : "Inactive draft"}</span>}
    </div>
    <input type="hidden" name="id" value={offer?.id ?? ""} />
    <label className={fieldClass} htmlFor={`${prefix}-attraction`}>Attraction
      <select id={`${prefix}-attraction`} name="attractionId" defaultValue={offer?.attractionId ?? ""} required className="min-h-tap rounded-lg border border-input bg-transparent px-3 text-base font-normal">
        <option value="" disabled>Choose an active attraction</option>
        {offer && !attractions.some(a => a.id === offer.attractionId) && <option value={offer.attractionId} disabled>{offer.name} (hidden — choose another attraction)</option>}
        {attractions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className={fieldClass} htmlFor={`${prefix}-price`}>Price (satang)
        <Input id={`${prefix}-price`} name="priceMinor" type="number" min={0} max={100000000} step={1} required defaultValue={offer?.priceMinor ?? 0} className="min-h-tap" />
        <span className="font-normal text-muted-foreground">100 satang = THB 1. Per stop, not per guest.</span>
      </label>
      <label className={fieldClass} htmlFor={`${prefix}-duration`}>Stop duration (minutes)
        <Input id={`${prefix}-duration`} name="durationMinutes" type="number" min={1} max={480} step={1} required defaultValue={offer?.durationMinutes ?? 60} className="min-h-tap" />
      </label>
      <label className={fieldClass} htmlFor={`${prefix}-sort`}>Display order
        <Input id={`${prefix}-sort`} name="sort" type="number" min={0} max={1000000} step={1} required defaultValue={offer?.sort ?? 0} className="min-h-tap" />
      </label>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      {(["originZoneJson", "destinationZoneJson"] as const).map((name, i) => <label key={name} className={fieldClass} htmlFor={`${prefix}-${name}`}>{i === 0 ? "Pickup zone polygons (JSON)" : "Drop-off zone polygons (JSON)"}
        <textarea id={`${prefix}-${name}`} name={name} rows={5} required maxLength={100000} defaultValue={offer?.[name] ?? ""} placeholder={'[[{"lat":13.45,"lng":100.25},{"lat":13.45,"lng":100.97},{"lat":14.05,"lng":100.97}]]'} className="w-full rounded-lg border border-input bg-transparent p-3 font-mono text-base font-normal" />
      </label>)}
    </div>
    <p className="text-sm text-muted-foreground">Each zone is an array of polygons containing latitude/longitude objects. At least three distinct points enclosing an area are required. Confirm the detour, opening hours and any entry fees before activating.</p>
    <div className="flex flex-wrap gap-5">
      <label className="flex min-h-tap items-center gap-3 text-sm font-bold"><input type="checkbox" name="bidirectional" defaultChecked={offer?.bidirectional ?? true} className="size-5" />Offer on the reverse route too</label>
      <label className="flex min-h-tap items-center gap-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={offer?.active ?? false} className="size-5" />Active (available only when paid route stops are enabled)</label>
    </div>
    <button type="submit" className="min-h-tap rounded-full bg-brand px-6 font-bold text-ink hover:bg-brand-hover">{offer ? "Save changes" : "Create offer"}</button>
  </form>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const staff = await getWaydidiAdmin();
  if (!staff) return <main className="p-6"><h1 className="text-xl font-black">Staff sign-in required</h1><Link className="inline-flex min-h-tap items-center text-brand-deep underline" href="/admin">Sign in</Link></main>;
  if (staff.role !== "owner" && staff.role !== "operations") return <main className="p-6"><h1 className="text-xl font-black">Permission denied</h1><p role="alert" className="text-danger">Only owner and operations staff can manage route stops.</p></main>;
  const query = await searchParams;
  let offers: RouteStopOffer[];
  let attractions: Attraction[];
  try { [offers, attractions] = await Promise.all([listRouteStopOffers(), listRouteStopAttractions()]); }
  catch { return <main className="p-6"><h1 className="text-xl font-black">Paid route stops</h1><p role="alert" className="text-danger">Route stops could not be loaded. Please reload to try again.</p></main>; }
  return <main className="min-h-screen space-y-6 bg-canvas p-4 text-plum sm:p-6 dark:bg-background dark:text-foreground">
    <header className="space-y-2"><Link href="/admin" className="inline-flex min-h-tap items-center text-brand-deep underline">Back to operations</Link><h1 className="text-3xl font-black tracking-[-.035em]">Paid route stops</h1><p className="max-w-3xl text-sm text-muted-foreground">Manage optional sightseeing stops for transfer routes. Prices are additional to the transfer fare. Suggested drafts stay inactive until reviewed; changing an offer does not change stops already purchased.</p></header>
    {query.error && <p role="alert" className="rounded-lg bg-danger-soft p-4 text-danger">{query.error.slice(0, 300)}</p>}
    {query.saved === "1" && <p role="status" aria-live="polite" className="rounded-lg bg-success-soft p-4 text-success">Saved. Your route-stop offer has been updated.</p>}
    {!offers.length && <p className="rounded-card bg-white p-5 dark:bg-card">No route-stop offers yet. Create an inactive draft below.</p>}
    {!attractions.length && <p role="alert" className="text-warning">Add an active attraction in <Link href="/admin/attractions" className="underline">Attractions</Link> before creating offers.</p>}
    <section className="space-y-4" aria-label="Route-stop offers">{offers.map(offer => <OfferForm key={offer.id} offer={offer} attractions={attractions} />)}</section>
    {attractions.length > 0 && <OfferForm attractions={attractions} />}
  </main>;
}
