import { NextResponse } from "next/server";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { driverPlan } from "@/lib/trip-driver";

// Driver: the day plan for a smart-trip booking (empty for ordinary transfers).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const assignment = await activeAssignmentForToken((await params).token);
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ days: await driverPlan(assignment.bookingReference) }, { headers: { "Cache-Control": "no-store" } });
}
