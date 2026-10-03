import { agencyActor, handleList, handleSave } from "@/lib/trip-api";

export async function GET(request: Request) { return handleList(request, await agencyActor(request)); }
export async function POST(request: Request) { return handleSave(request, await agencyActor(request)); }
