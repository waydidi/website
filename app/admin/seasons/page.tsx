import type { Metadata } from "next";
import { FareTabs } from "@/components/admin-fares/fare-tabs";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import SeasonsWorkspace from "./workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seasons · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page() {
  const access = await requireWaydidiAdmin("/admin/seasons");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <><FareTabs current="/admin/seasons" /><SeasonsWorkspace /></>;
}
