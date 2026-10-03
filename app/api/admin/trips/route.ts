import { adminActor, handleList, handleSave } from "@/lib/trip-api";

export async function GET(request: Request) { return handleList(request, await adminActor()); }
export async function POST(request: Request) { return handleSave(request, await adminActor()); }
