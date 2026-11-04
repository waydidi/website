import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import type { SecurityDatabase } from "@/lib/worker-db";
import Link from "next/link";
import { MaintenanceToggle } from "@/components/admin-settings/maintenance";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile · Waydidi operations", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const access = await requireWaydidiAdmin("/admin/profile");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const account = await (env.DB as SecurityDatabase).prepare("SELECT username,email FROM staff_accounts WHERE id=? AND active=1").bind(access.user.id).first<{ username: string; email: string }>();
  if (!account) return <AdminKeyLogin configured={access.configured} />;
  // On phones the "Setting" tab opens this page, so the owner's site switches are here too (also in Admin → Settings).
  const owner = access.user.role === "owner";
  return <div className="grid gap-5 px-4 py-5 sm:px-8">
    {owner && <div className="grid max-w-[760px] gap-5">
      <MaintenanceToggle />
      <Link href="/admin/settings" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 font-semibold text-brand-darker hover:underline sm:p-6">All settings<span aria-hidden="true">→</span></Link>
    </div>}
    <ProfileForm displayName={access.user.displayName} email={account.email} username={account.username} role={access.user.role} />
  </div>;
}
