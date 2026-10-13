import { env } from "cloudflare:workers";
import { cashReceiptStatements } from "@/lib/cash-collection";
import { getFile, putFile } from "@/lib/file-store";
import { readSlip, slipOcrConfigured } from "@/lib/payment-slip-ocr";
import { assessSlip, SLIP_REASONS, SLIP_TYPES, slipConfig, validApprovalAmount, type SlipExtraction, type SlipMime, type SlipReason, type SlipStatus } from "@/lib/payment-slip-rules";
import { sha256Bytes } from "@/lib/security";
import { isChargeableStatus } from "@/lib/booking-status";

// Bank-transfer / PromptPay slips for "pay later" (cash) bookings. The customer uploads a
// slip, Claude reads it, assessSlip() decides whether it may be approved without a person,
// and an approval is recorded as a cash receipt — inside one D1 batch, guarded so a slip
// is approved once, never past the booking total, and never twice for one bank reference.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<{ meta: { changes: number } }[]> };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, unknown>;

export const MAX_SLIPS_PER_BOOKING = 10;
export const SLIP_CHECKER = "slip-checker";

let tableReady = false;
/** Workers Builds deploys code without applying D1 migrations; this mirrors drizzle/0102_payment_slips.sql. */
export async function ensureSlipTable() {
  if (tableReady) return;
  await db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS payment_slips (id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, customer_id TEXT, file_key TEXT NOT NULL, mime TEXT NOT NULL, image_sha256 TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('needs_review','approved','rejected')), extraction_json TEXT, amount_minor INTEGER, bank_reference TEXT, reasons_json TEXT NOT NULL DEFAULT '[]', approved_amount_minor INTEGER, decided_by TEXT, decided_at TEXT, decision_note TEXT, created_at TEXT NOT NULL, UNIQUE(booking_reference, image_sha256))"),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_payment_slips_status ON payment_slips(status, created_at)"),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_payment_slips_hash ON payment_slips(image_sha256)"),
    db().prepare("CREATE UNIQUE INDEX IF NOT EXISTS uidx_payment_slips_approved_reference ON payment_slips(bank_reference) WHERE status='approved' AND bank_reference IS NOT NULL"),
  ]);
  tableReady = true;
}

type BookingBalance = { reference: string; payment_method: string; status: string; total: number; created_at: string; received_minor: number };

export async function bookingBalance(reference: string) {
  const row = await db().prepare("SELECT reference,payment_method,status,total,created_at,COALESCE((SELECT SUM(amount_minor) FROM cash_receipts WHERE booking_reference=bookings.reference),0) AS received_minor FROM bookings WHERE reference=?").bind(reference).first<BookingBalance>();
  if (!row) return null;
  return { ...row, outstandingMinor: Math.max(0, Math.round(row.total * 100) - row.received_minor) };
}

/** Whether this booking can take a slip right now (cash method, committed, money still due). */
export const acceptsSlips = (b: { payment_method: string; status: string; outstandingMinor: number }) =>
  b.payment_method === "cash" && isChargeableStatus(b.status) && b.outstandingMinor > 0;

type SlipRow = { id: string; booking_reference: string; status: SlipStatus; amount_minor: number | null; approved_amount_minor: number | null; bank_reference: string | null; reasons_json: string; extraction_json: string | null; decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string };

const reasonsOf = (row: Pick<SlipRow, "reasons_json">) => { try { return (JSON.parse(row.reasons_json) as SlipReason[]).filter((r) => r in SLIP_REASONS); } catch { return []; } };

/** What the customer sees: status and amount, never the internal fraud signals. */
export function customerSlipView(row: SlipRow) {
  return { id: row.id, status: row.status, amountMinor: row.approved_amount_minor ?? row.amount_minor, createdAt: row.created_at, note: row.status === "rejected" ? row.decision_note : null };
}

export async function slipsForBooking(reference: string) {
  await ensureSlipTable();
  const { results } = await db().prepare("SELECT * FROM payment_slips WHERE booking_reference=? ORDER BY created_at DESC LIMIT 20").bind(reference).all<SlipRow>();
  return results;
}

export type SubmitResult = { ok: true; slip: ReturnType<typeof customerSlipView> } | { ok: false; status: number; error: string };

export async function submitSlip(input: { reference: string; customerId: string; bytes: Uint8Array; mime: SlipMime; now?: Date }): Promise<SubmitResult> {
  const config = slipConfig(vars());
  if (!config) return { ok: false, status: 404, error: "Slip upload is not available." };
  await ensureSlipTable();
  // A repeated upload of the same image (a retry, a double tap) returns the first result.
  const hash = await sha256Bytes(input.bytes);
  const same = await db().prepare("SELECT * FROM payment_slips WHERE booking_reference=? AND image_sha256=?").bind(input.reference, hash).first<SlipRow>();
  if (same) return { ok: true, slip: customerSlipView(same) };
  const balance = await bookingBalance(input.reference);
  if (!balance || !acceptsSlips(balance)) return { ok: false, status: 409, error: "This booking has nothing to pay by transfer." };
  const count = await db().prepare("SELECT COUNT(*) AS n FROM payment_slips WHERE booking_reference=?").bind(input.reference).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_SLIPS_PER_BOOKING) return { ok: false, status: 429, error: "Too many slips for this booking. Please contact us." };

  const id = crypto.randomUUID();
  const now = input.now ?? new Date();
  const fileKey = `payment-slips/${input.reference}/${id}.${SLIP_TYPES[input.mime]}`;
  await putFile(fileKey, input.bytes, input.mime);

  let extraction: SlipExtraction | null = null;
  let ocr: "ok" | "unavailable" | "failed" = slipOcrConfigured() ? "ok" : "unavailable";
  if (ocr === "ok") {
    try { extraction = await readSlip(input.bytes, input.mime); }
    catch (error) { ocr = "failed"; console.error("Slip OCR failed", error instanceof Error ? error.message : error); }
  }
  const elsewhere = await db().prepare("SELECT 1 AS x FROM payment_slips WHERE image_sha256=? AND booking_reference<>? LIMIT 1").bind(hash, input.reference).first();
  const reused = extraction?.bankReference ? await db().prepare("SELECT 1 AS x FROM payment_slips WHERE bank_reference=? AND status<>'rejected' LIMIT 1").bind(extraction.bankReference).first() : null;
  const verdict = assessSlip(extraction, { outstandingMinor: balance.outstandingMinor, bookingCreatedAt: balance.created_at, now: now.getTime(), config, duplicateImageElsewhere: !!elsewhere, duplicateBankReference: !!reused }, ocr);

  const inserted = await db().prepare("INSERT OR IGNORE INTO payment_slips(id,booking_reference,customer_id,file_key,mime,image_sha256,status,extraction_json,amount_minor,bank_reference,reasons_json,created_at) VALUES(?,?,?,?,?,?,'needs_review',?,?,?,?,?)")
    .bind(id, input.reference, input.customerId, fileKey, input.mime, hash, extraction ? JSON.stringify(extraction) : null, extraction?.amountMinor ?? null, extraction?.bankReference ?? null, JSON.stringify(verdict.reasons), now.toISOString()).run();
  if (!inserted.meta.changes) {
    // The same image arrived twice at once; the first upload wins.
    const first = await db().prepare("SELECT * FROM payment_slips WHERE booking_reference=? AND image_sha256=?").bind(input.reference, hash).first<SlipRow>();
    if (first) return { ok: true, slip: customerSlipView(first) };
  }
  if (verdict.decision === "approve" && extraction?.amountMinor) {
    const approved = await approveSlip(id, extraction.amountMinor, SLIP_CHECKER);
    if (!approved.ok) await db().prepare("UPDATE payment_slips SET reasons_json=? WHERE id=? AND status='needs_review'").bind(JSON.stringify(["over_balance"]), id).run();
  }
  const row = await db().prepare("SELECT * FROM payment_slips WHERE id=?").bind(id).first<SlipRow>();
  if (row?.status === "needs_review") await notifySlipForReview(row).catch((e) => console.error("Slip Telegram alert failed", e instanceof Error ? e.message : e));
  return { ok: true, slip: customerSlipView(row!) };
}

export type DecisionResult = { ok: true } | { ok: false; status: number; error: string };

/** Approves a slip for `amountMinor` (whole satang). Safe to retry; only one approval can ever succeed. */
export async function approveSlip(id: string, amountMinor: number, by: string, now = new Date()): Promise<DecisionResult> {
  await ensureSlipTable();
  const slip = await db().prepare("SELECT * FROM payment_slips WHERE id=?").bind(id).first<SlipRow>();
  if (!slip) return { ok: false, status: 404, error: "Slip not found." };
  if (slip.status === "approved") return slip.approved_amount_minor === amountMinor ? { ok: true } : { ok: false, status: 409, error: "This slip was already approved for a different amount." };
  if (slip.status !== "needs_review") return { ok: false, status: 409, error: "This slip was already rejected." };
  const balance = await bookingBalance(slip.booking_reference);
  if (!balance || !validApprovalAmount(amountMinor, balance.outstandingMinor)) return { ok: false, status: 409, error: "The amount must be more than zero and no more than the balance due." };
  const at = now.toISOString();
  const receiptId = `slip:${id}`;
  const note = `Bank transfer slip${slip.bank_reference ? ` ref ${slip.bank_reference}` : ""}`;
  // The slip's own state is part of the insert's guard: a slip rejected a moment ago records nothing.
  const receipt = cashReceiptStatements(db(), { receiptId, reference: slip.booking_reference, amountMinor, collectedBy: by, note, now: at }, { sql: "EXISTS(SELECT 1 FROM payment_slips WHERE id=? AND status='needs_review')", params: [id] });
  try {
    const results = await db().batch([
      ...receipt,
      db().prepare("UPDATE payment_slips SET status='approved', approved_amount_minor=?, decided_by=?, decided_at=? WHERE id=? AND status='needs_review' AND EXISTS(SELECT 1 FROM cash_receipts WHERE id=? AND amount_minor=?)").bind(amountMinor, by, at, id, receiptId, amountMinor),
    ]);
    if (results[results.length - 1].meta.changes) return { ok: true };
  } catch (error) {
    if (/UNIQUE/i.test(error instanceof Error ? error.message : "")) return { ok: false, status: 409, error: "This bank reference was already approved on another slip." };
    throw error;
  }
  const after = await db().prepare("SELECT status,approved_amount_minor FROM payment_slips WHERE id=?").bind(id).first<{ status: string; approved_amount_minor: number | null }>();
  if (after?.status === "approved" && after.approved_amount_minor === amountMinor) return { ok: true };
  return { ok: false, status: 409, error: "The slip could not be approved: it was decided by someone else or exceeds the balance due." };
}

export async function rejectSlip(id: string, note: string, by: string, now = new Date()): Promise<DecisionResult> {
  await ensureSlipTable();
  const reason = note.trim().slice(0, 300);
  if (!reason) return { ok: false, status: 400, error: "Give the customer a reason." };
  const result = await db().prepare("UPDATE payment_slips SET status='rejected', decided_by=?, decided_at=?, decision_note=? WHERE id=? AND status='needs_review'").bind(by, now.toISOString(), reason, id).run();
  return result.meta.changes ? { ok: true } : { ok: false, status: 409, error: "This slip was already decided." };
}

/** Finance queue: slips waiting for a person, then the latest decisions. */
export async function slipQueue() {
  await ensureSlipTable();
  const { results } = await db().prepare("SELECT s.*, b.customer_name, b.total FROM payment_slips s LEFT JOIN bookings b ON b.reference=s.booking_reference ORDER BY CASE WHEN s.status='needs_review' THEN 0 ELSE 1 END, s.created_at DESC LIMIT 100").all<SlipRow & { customer_name: string | null; total: number | null }>();
  const balances = new Map<string, number>();
  for (const ref of new Set(results.filter((r) => r.status === "needs_review").map((r) => r.booking_reference))) balances.set(ref, (await bookingBalance(ref))?.outstandingMinor ?? 0);
  return results.map((r) => ({
    id: r.id, reference: r.booking_reference, customer: r.customer_name, status: r.status, createdAt: r.created_at,
    amountMinor: r.amount_minor, approvedAmountMinor: r.approved_amount_minor, outstandingMinor: balances.get(r.booking_reference) ?? null,
    bankReference: r.bank_reference, extraction: r.extraction_json ? JSON.parse(r.extraction_json) as SlipExtraction : null,
    reasons: reasonsOf(r).map((code) => ({ code, label: SLIP_REASONS[code] })),
    decidedBy: r.decided_by, decidedAt: r.decided_at, note: r.decision_note,
  }));
}

export async function slipImage(id: string) {
  await ensureSlipTable();
  const row = await db().prepare("SELECT file_key, mime FROM payment_slips WHERE id=?").bind(id).first<{ file_key: string; mime: string }>();
  if (!row) return null;
  const file = await getFile(row.file_key);
  return file ? { body: file.body, mime: row.mime } : null;
}

async function notifySlipForReview(row: SlipRow) {
  const { telegramConfigured, sendCard } = await import("@/lib/telegram/client");
  if (!telegramConfigured()) return;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const amount = row.amount_minor == null ? "อ่านไม่ได้" : `฿${(row.amount_minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const reasons = reasonsOf(row).map((r) => `• ${esc(SLIP_REASONS[r])}`).join("\n");
  await sendCard([`<b>สลิปโอนเงินรอตรวจ ${esc(row.booking_reference)}</b>`, `ยอดในสลิป: ${amount}`, reasons, "", "ตรวจและอนุมัติที่ Admin → Payments → Transfer slips"].filter(Boolean).join("\n"));
}
