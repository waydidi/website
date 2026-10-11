import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";

export const dynamic = "force-dynamic";

// The old booking page. Links to it (Telegram, LINE, emails, search) now open the booking's card in
// Bookings, with its details shown.
export default async function JourneyPage({ params }: { params: Promise<{ reference: string }> }) {
  const reference = (await params).reference.toUpperCase();
  const [row] = await getDb().select({ serviceType: bookings.serviceType }).from(bookings).where(eq(bookings.reference, reference)).limit(1).catch(() => []);
  const type = row?.serviceType === "hourly" || row?.serviceType === "tour" ? row.serviceType : "transfer";
  redirect(`/admin/bookings?type=${type}&open=${encodeURIComponent(reference)}`);
}
