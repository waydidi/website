import type { Metadata } from "next";
import { AdminOwnerSetup } from "@/components/admin-owner-setup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin setup · Waydidi", robots: { index: false, follow: false } };

export default function Page() {
  return <AdminOwnerSetup mode="create" />;
}
