import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import CalendarWorkspace from "./calendar-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operations calendar · Waydidi",
  robots: { index: false, follow: false },
};

export default async function OperationsCalendarPage() {
  const access = await requireWaydidiAdmin("/admin/calendar");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <CalendarWorkspace email={access.user.email} />;
}
