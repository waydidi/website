import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar · Waydidi operations", robots: { index: false, follow: false } };

export default async function OperationsCalendarPage() {
  const access = await requireWaydidiAdmin("/admin/calendar");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <CalendarClient email={access.user.email} />;
}
