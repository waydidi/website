import { adminActor, handlePlan } from "@/lib/trip-api";

export async function POST(request: Request) { return handlePlan(request, await adminActor()); }
