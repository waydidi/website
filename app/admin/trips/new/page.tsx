import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { TripWorkspace } from "@/components/trip-planner/trip-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";
import { chatTranscript } from "@/lib/sales-ai/trip-planning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New trip · Waydidi operations", robots: { index: false, follow: false } };

// ?chat=<conversation id> (from a "Trip planning request" card) loads that chat into "Start from the customer's chat".
// The chat is read here on the server, for the owner and operations only; nothing is planned until staff press the button.
export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string; chat?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/trips/new");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const params = await searchParams;
  const chat = params.chat && ["owner", "operations"].includes(access.user.role) ? await chatTranscript(params.chat) : "";
  return <TripWorkspace mode="admin" initialTemplate={params.template === "1"} initialChatText={chat} />;
}
