import { adminActor, handleAction, handleGet } from "@/lib/trip-api";

type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Ctx) { return handleGet((await params).id, await adminActor()); }
export async function POST(request: Request, { params }: Ctx) { return handleAction(request, (await params).id, await adminActor()); }
