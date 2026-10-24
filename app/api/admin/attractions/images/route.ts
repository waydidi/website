import { POST as uploadAdminImage } from "@/app/api/admin/blog/images/route";

/** Same bounded image store, under the attraction permission scope used by operations staff. */
export async function POST(request: Request) { return uploadAdminImage(request); }
