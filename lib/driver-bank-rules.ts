// Rules for the driver's bank details page ("กรอกข้อมูลบัญชี", shown after the Drop). No database or
// runtime imports, so the page and the API share them and they are unit tested directly
// (tests/driver-bank-details.test.mjs). Thai messages: the driver link is Thai.
import { THAI_BANKS } from "./thai-banks";

export type BankField = "bank" | "number" | "name";
export type BankDetails = { bankCode: string; accountNumber: string; accountName: string };

const TITLES = /^(นางสาว|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/iu;

/** A name with the title, spaces and punctuation taken out, so "นาย สมชาย  ใจดี" equals "สมชายใจดี". */
export const normalizePersonName = (name: string) => name.normalize("NFC").toLowerCase().trim().replace(TITLES, "").replace(/[\s.\-_,]+/gu, "");

/** The account name must be the assigned driver's own name (title, spacing and case ignored). */
export function accountNameMatches(accountName: string, driverName: string) {
  const wanted = normalizePersonName(driverName);
  return wanted.length > 0 && normalizePersonName(accountName) === wanted;
}

/** Validates what the driver typed. The account name is checked against the assigned driver's name. */
export function parseBankDetails(
  input: { bankCode?: unknown; accountNumber?: unknown; accountName?: unknown },
  driverName: string,
): { ok: true; value: BankDetails } | { ok: false; field: BankField; error: string } {
  const bankCode = String(input.bankCode ?? "").trim().toUpperCase();
  if (!THAI_BANKS.some((bank) => bank.code === bankCode)) return { ok: false, field: "bank", error: "กรุณาเลือกธนาคาร" };
  const accountNumber = String(input.accountNumber ?? "").replace(/[^0-9]/gu, "");
  if (accountNumber.length < 8 || accountNumber.length > 16) return { ok: false, field: "number", error: "เลขที่บัญชีไม่ถูกต้อง (ตัวเลข 8–16 หลัก)" };
  const accountName = String(input.accountName ?? "").trim().replace(/\s+/gu, " ");
  if (accountName.length < 2 || accountName.length > 120) return { ok: false, field: "name", error: "กรุณากรอกชื่อบัญชี" };
  if (!accountNameMatches(accountName, driverName)) return { ok: false, field: "name", error: `ชื่อบัญชีต้องตรงกับชื่อคนขับ (${driverName})` };
  return { ok: true, value: { bankCode, accountNumber, accountName } };
}

/** "xxxxxx1234": everything but the last four digits hidden (for old accounts shown in alerts). */
export const maskAccount = (accountNumber: string) => `${"x".repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
