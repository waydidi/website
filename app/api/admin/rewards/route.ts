import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { memberBoxes, mysteryPrizes, partnerVoucherCodes } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { loadDefaultPrizes } from "@/lib/boxes";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const weight = z.number().int().min(0).max(1000).optional();
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("loadDefaults") }),
  z.object({ action: z.literal("savePrize"), prize: z.object({
    id: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "Use lowercase letters, numbers and dashes for the ID."),
    name: z.string().trim().min(2).max(80), description: z.string().trim().max(300), emoji: z.string().trim().min(1).max(8),
    kind: z.enum(["coupon", "child_seat", "exchange_stop", "airport_transfer", "partner_ticket"]),
    value: z.number().int().min(0).max(10000), weights: z.object({ gold: weight, diamond: weight, platinum: weight }),
    stock: z.number().int().min(0).max(100000).nullable(), active: z.boolean(), validDays: z.number().int().min(1).max(365), terms: z.string().trim().max(500),
  }) }),
  z.object({ action: z.literal("addCodes"), prizeId: z.string().max(40), codes: z.array(z.string().trim().min(3).max(60)).min(1).max(500) }),
  z.object({ action: z.literal("ticket"), boxId: z.string().max(80), fulfilment: z.enum(["to_arrange", "sent", "used"]), voucherCode: z.string().trim().max(60).optional() }),
]);

// Admin-only: mystery box prizes, partner voucher codes and ticket fulfilment.
export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const input = parsed.data;
  const now = new Date().toISOString();
  if (input.action === "loadDefaults") return NextResponse.json({ ok: true, added: await loadDefaultPrizes() });
  if (input.action === "savePrize") {
    const p = input.prize;
    if (p.kind === "coupon" && p.value < 50) return NextResponse.json({ error: "Set how many THB the coupon takes off (at least 50)." }, { status: 400 });
    const values = { name: p.name, description: p.description, emoji: p.emoji, kind: p.kind, value: p.kind === "coupon" ? p.value : 0, weightsJson: JSON.stringify(p.weights), stock: p.stock, active: p.active, validDays: p.validDays, terms: p.terms, updatedAt: now };
    await getDb().insert(mysteryPrizes).values({ id: p.id, ...values, issued: 0, createdAt: now }).onConflictDoUpdate({ target: mysteryPrizes.id, set: values });
    console.info("Admin saved mystery prize", { id: p.id, admin: admin.email });
    return NextResponse.json({ ok: true });
  }
  if (input.action === "addCodes") {
    const unique = [...new Set(input.codes)];
    for (const code of unique) await getDb().insert(partnerVoucherCodes).values({ id: crypto.randomUUID(), prizeId: input.prizeId, code, createdAt: now });
    return NextResponse.json({ ok: true, added: unique.length });
  }
  await getDb().update(memberBoxes).set({ fulfilment: input.fulfilment, ...(input.voucherCode ? { voucherCode: input.voucherCode } : {}) }).where(eq(memberBoxes.id, input.boxId));
  return NextResponse.json({ ok: true });
}
