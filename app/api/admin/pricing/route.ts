import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { pricingAreas, pricingAudit, pricingRules } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { validPolygon, VEHICLE_IDS, type Point } from "@/lib/pricing";

type RuleInput = {
  vehicleId: string;
  basePrice: number;
  includedDistanceKm: number;
  extraPricePerKm: number;
  fixedPrice: number | null;
};
type AreaInput = {
  id?: string;
  name: string;
  code: string;
  color: string;
  pricingType: string;
  priority: number;
  polygons: Point[][];
  rules: RuleInput[];
  action: "draft" | "publish" | "archive";
};

async function authorized() {
  return getWaydidiAdmin();
}

export async function GET() {
  const user = await authorized();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const areas = await getDb()
    .select()
    .from(pricingAreas)
    .orderBy(asc(pricingAreas.name));
  const rules = await getDb().select().from(pricingRules);
  return NextResponse.json(
    {
      areas: areas.map((area) => ({
        ...area,
        polygons: JSON.parse(
          area.draftGeometryJson ?? area.publishedGeometryJson ?? "[]",
        ),
        rules: rules.filter((rule) => rule.areaId === area.id),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await authorized();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request))
    return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const input = (await request.json()) as AreaInput;
  if (!input || !["draft", "publish", "archive"].includes(input.action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const id =
    input.id && /^[a-z0-9-]{8,80}$/.test(input.id)
      ? input.id
      : crypto.randomUUID();
  if (input.action !== "archive") {
    if (
      !input.name?.trim() ||
      input.name.length > 80 ||
      !/^[A-Z0-9_]{2,50}$/.test(input.code) ||
      !/^#[0-9A-Fa-f]{6}$/.test(input.color) ||
      !["hybrid", "fixed", "manual"].includes(input.pricingType) ||
      !Number.isInteger(input.priority) ||
      input.priority < 0 ||
      input.priority > 999
    )
      return NextResponse.json(
        { error: "Check the area settings" },
        { status: 400 },
      );
    if (
      !Array.isArray(input.polygons) ||
      input.polygons.length < 1 ||
      input.polygons.length > 20 ||
      !input.polygons.every(validPolygon)
    )
      return NextResponse.json(
        { error: "Draw at least one valid area inside Thailand" },
        { status: 400 },
      );
    if (
      !Array.isArray(input.rules) ||
      input.rules.length !== VEHICLE_IDS.length ||
      input.rules.some(
        (rule) =>
          !VEHICLE_IDS.includes(
            rule.vehicleId as (typeof VEHICLE_IDS)[number],
          ) ||
          !Number.isInteger(rule.basePrice) ||
          rule.basePrice < 0 ||
          rule.basePrice > 100000 ||
          !Number.isInteger(rule.includedDistanceKm) ||
          rule.includedDistanceKm < 0 ||
          rule.includedDistanceKm > 2000 ||
          !Number.isInteger(rule.extraPricePerKm) ||
          rule.extraPricePerKm < 0 ||
          rule.extraPricePerKm > 10000 ||
          (rule.fixedPrice !== null &&
            (!Number.isInteger(rule.fixedPrice) ||
              rule.fixedPrice < 0 ||
              rule.fixedPrice > 100000)),
      )
    )
      return NextResponse.json(
        { error: "Check all vehicle prices" },
        { status: 400 },
      );
  }
  const now = new Date().toISOString();
  const [existing] = await getDb()
    .select()
    .from(pricingAreas)
    .where(eq(pricingAreas.id, id))
    .limit(1);
  if (input.action === "archive") {
    if (!existing)
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    await getDb()
      .update(pricingAreas)
      .set({ status: "archived", updatedAt: now })
      .where(eq(pricingAreas.id, id));
  } else {
    const geometry = JSON.stringify(input.polygons);
    const version =
      input.action === "publish"
        ? (existing?.version ?? 0) + 1
        : (existing?.version ?? 1);
    const values = {
      id,
      name: input.name.trim(),
      code: input.code,
      color: input.color,
      pricingType: input.pricingType,
      priority: input.priority,
      status:
        input.action === "publish"
          ? "published"
          : existing?.status === "published"
            ? "published"
            : "draft",
      draftGeometryJson: geometry,
      publishedGeometryJson:
        input.action === "publish"
          ? geometry
          : (existing?.publishedGeometryJson ?? null),
      version,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      publishedAt:
        input.action === "publish" ? now : (existing?.publishedAt ?? null),
    };
    await getDb()
      .insert(pricingAreas)
      .values(values)
      .onConflictDoUpdate({ target: pricingAreas.id, set: values });
    await getDb().delete(pricingRules).where(eq(pricingRules.areaId, id));
    await getDb()
      .insert(pricingRules)
      .values(
        input.rules.map((rule) => ({
          id: crypto.randomUUID(),
          areaId: id,
          originCode: "ANY",
          vehicleId: rule.vehicleId,
          basePrice: rule.basePrice,
          includedDistanceKm: rule.includedDistanceKm,
          extraPricePerKm: rule.extraPricePerKm,
          fixedPrice:
            input.pricingType === "fixed"
              ? (rule.fixedPrice ?? rule.basePrice)
              : null,
          active: true,
          version,
          updatedAt: now,
        })),
      );
  }
  await getDb()
    .insert(pricingAudit)
    .values({
      areaId: id,
      action: input.action,
      actorEmail: user.email,
      detailsJson: JSON.stringify({ name: input.name, code: input.code }),
      createdAt: now,
    });
  return NextResponse.json({
    id,
    status:
      input.action === "archive"
        ? "archived"
        : input.action === "publish"
          ? "published"
          : "draft",
  });
}
