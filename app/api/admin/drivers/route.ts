import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { drivers } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { prepareDriverImage } from "@/lib/admin-driver-images";
import { deleteFile, putFile } from "@/lib/file-store";
import { sameOrigin } from "@/lib/security";
import { THAI_BANKS } from "@/lib/thai-banks";

const phoneValid = (value: string) => /^[+0-9() .-]{7,30}$/u.test(value.trim());
const emailValid = (value: string) =>
  /^\S+@\S+\.\S+$/u.test(value) && value.length <= 254;

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/form-data")
  )
    return NextResponse.json(
      { error: "Use the driver form to upload verification images." },
      { status: 415 },
    );

  const form = await request.formData();
  const fullName = String(form.get("fullName") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const baseLocation = String(form.get("baseLocation") ?? "").trim();
  const vehicle = String(form.get("vehicle") ?? "").trim();
  const bankCode = String(form.get("bankCode") ?? "").trim().toUpperCase();
  const bankAccountNumber = String(form.get("bankAccountNumber") ?? "").replace(/[^0-9]/gu, "");
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (
    fullName.length < 2 ||
    fullName.length > 100 ||
    !phoneValid(phone) ||
    baseLocation.length < 2 ||
    baseLocation.length > 150 ||
    vehicle.length < 2 ||
    vehicle.length > 150 ||
    !THAI_BANKS.some((bank) => bank.code === bankCode) ||
    bankAccountNumber.length < 8 ||
    bankAccountNumber.length > 16 ||
    (email && !emailValid(email))
  )
    return NextResponse.json(
      {
        error:
          "Full name, phone number, base location, vehicle, driving licence, Thai bank, and a valid account number are required.",
      },
      { status: 400 },
    );

  let idImage;
  let carImage;
  try {
    [idImage, carImage] = await Promise.all([
      prepareDriverImage(form.get("idImage"), "driving licence image"),
      prepareDriverImage(form.get("carImage"), "car image"),
    ]);
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Images could not be verified.",
      },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const idImageKey = `driver-verification/${id}/identity.${idImage.extension}`;
  const carImageKey = `driver-verification/${id}/vehicle.${carImage.extension}`;
  try {
    await Promise.all([
      putFile(idImageKey, idImage.bytes, idImage.mime),
      putFile(carImageKey, carImage.bytes, carImage.mime),
    ]);
    const now = new Date().toISOString();
    const driver = {
      id,
      fullName,
      phone,
      email: email || null,
      baseLocation,
      vehicle,
      bankCode,
      bankAccountNumber,
      idImageKey,
      idImageMime: idImage.mime,
      idImageBytes: idImage.size,
      idImageSha256: idImage.sha256,
      carImageKey,
      carImageMime: carImage.mime,
      carImageBytes: carImage.size,
      carImageSha256: carImage.sha256,
      remindersEnabled: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await getDb().insert(drivers).values(driver);
    return NextResponse.json({
      driver: { ...driver, idImageKey: "available", carImageKey: "available" },
    });
  } catch {
    await Promise.all([
      deleteFile(idImageKey),
      deleteFile(carImageKey),
    ]).catch(() => undefined);
    return NextResponse.json(
      { error: "The driver could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
