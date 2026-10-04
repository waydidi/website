import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import type { SecurityDatabase } from "@/lib/worker-db";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile · Waydidi operations", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const access = await requireWaydidiAdmin("/admin/profile");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const account = await (env.DB as SecurityDatabase).prepare("SELECT username,email FROM staff_accounts WHERE id=? AND active=1").bind(access.user.id).first<{ username: string; email: string }>();
  if (!account) return <AdminKeyLogin configured={access.configured} />;
  return <div className="px-4 py-5 sm:px-8"><ProfileForm displayName={access.user.displayName} email={account.email} username={account.username} role={access.user.role} /></div>;
}
