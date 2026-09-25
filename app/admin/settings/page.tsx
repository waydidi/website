import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { SignOutButton } from "@/components/admin-settings/sign-out";
import { adminUsername, requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings · Waydidi operations", robots: { index: false, follow: false } };

const set = (...names: string[]) => names.every((n) => Boolean((env as Record<string, unknown>)[n]));

// What is switched on for this site. Values are never shown, only whether each one is set.
export default async function SettingsPage() {
  const access = await requireWaydidiAdmin("/admin/settings");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const groups: { title: string; rows: [string, boolean, string][] }[] = [
    { title: "Payments and alerts", rows: [
      ["Card payments (Stripe)", set("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"), "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET"],
      ["LINE alerts", set("LINE_CHANNEL_ACCESS_TOKEN", "LINE_ADMIN_TARGET_ID"), "LINE_CHANNEL_ACCESS_TOKEN, LINE_ADMIN_TARGET_ID"],
    ] },
    { title: "Maps and flights", rows: [
      ["Google Maps", set("GOOGLE_MAPS_SERVER_KEY"), "GOOGLE_MAPS_SERVER_KEY"],
      ["Flight tracking", set("AVIATIONSTACK_API_KEY"), "AVIATIONSTACK_API_KEY"],
    ] },
    { title: "Customer sign-in", rows: [
      ["Google", set("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"), "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET"],
      ["Facebook", set("FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"), "FACEBOOK_APP_ID, FACEBOOK_APP_SECRET"],
      ["LINE", set("LINE_LOGIN_CHANNEL_ID", "LINE_LOGIN_CHANNEL_SECRET"), "LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET"],
      ["Apple", set("APPLE_SIGNIN_CLIENT_ID", "APPLE_SIGNIN_TEAM_ID", "APPLE_SIGNIN_KEY_ID", "APPLE_SIGNIN_PRIVATE_KEY"), "APPLE_SIGNIN_CLIENT_ID, TEAM_ID, KEY_ID, PRIVATE_KEY"],
    ] },
  ];
  return <div className="px-4 pb-10 pt-4 sm:px-8">
    <div className="grid max-w-[900px] gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-[#15161C] text-[14px] font-bold text-white" aria-hidden="true">WD</div>
            <div><p className="text-[16px] font-semibold">Waydidi Admin</p><p className="text-[14px] text-slate-500">Admin ID: {adminUsername()} · stays signed in for 7 days on this device</p></div>
          </div>
          <SignOutButton />
        </div>
        <p className="mt-4 text-[14px] text-slate-600">To change the admin ID, set a <code className="rounded bg-slate-100 px-1">WAYDIDI_ADMIN_USERNAME</code> secret. To change the password, set a new <code className="rounded bg-slate-100 px-1">WAYDIDI_ADMIN_KEY_HASH</code> secret (the SHA-256 of the password) in Cloudflare (Workers &amp; Pages → waydidi-website → Settings → Variables and Secrets).</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-[18px] font-semibold">File storage</h2>
        <p className="mt-1 text-[14px] text-slate-600">{env.BUCKET ? "Driver photos, trip pictures and blog images are stored in Cloudflare R2." : "R2 isn't turned on, so driver photos, trip pictures and blog images are stored in the database. This works; turning on R2 later is better for many large files."}</p>
      </section>

      {groups.map((g) => <section key={g.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-4 text-[18px] font-semibold">{g.title}</h2>
        <ul>{g.rows.map(([label, on, keys]) => <li key={label} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 last:border-0">
          <span><span className="block text-[15px] font-medium">{label}</span>{!on && <span className="block text-[12px] text-slate-500">Set in Cloudflare: {keys}</span>}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[13px] font-medium ${on ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-50 text-slate-600"}`}><span className={`size-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />{on ? "On" : "Not set up"}</span>
        </li>)}</ul>
      </section>)}
    </div>
  </div>;
}
