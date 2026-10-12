// Pure rules for bank-transfer / PromptPay slips. No database or runtime imports,
// so every decision here is unit tested directly (tests/payment-slips.test.mjs).
//
// A slip is only ever money in for a "cash" (pay later) booking: an approved slip is
// recorded as a cash receipt, so it reuses the same balance guard as cash collection.

export const SLIP_MAX_BYTES = 5 * 1024 * 1024;
export const SLIP_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type SlipMime = keyof typeof SLIP_TYPES;
export type SlipStatus = "needs_review" | "approved" | "rejected";

export type SlipConfig = { payeeNames: string[]; payeeAccounts: string[]; payeeDisplay: string; autoApprove: boolean };

const list = (value: unknown) => String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Slips are offered only once the owner has said who the money must be paid to. */
export function slipConfig(env: Record<string, unknown>): SlipConfig | null {
  const payeeNames = list(env.WAYDIDI_SLIP_PAYEE_NAMES);
  if (!payeeNames.length) return null;
  return {
    payeeNames,
    payeeAccounts: list(env.WAYDIDI_SLIP_PAYEE_ACCOUNTS).map((a) => a.replace(/\D/g, "")).filter((a) => a.length >= 4),
    payeeDisplay: String(env.WAYDIDI_SLIP_PAYEE_DISPLAY ?? "").trim().slice(0, 200),
    autoApprove: env.WAYDIDI_SLIP_AUTO_APPROVE === "1",
  };
}

/** Checks the file's own bytes, not the name or the browser's claimed type. */
export function sniffSlipImage(bytes: Uint8Array): SlipMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export type SlipExtraction = {
  isTransferSlip: boolean;
  amountMinor: number | null;
  transferredAt: string | null;
  bankReference: string | null;
  senderName: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  bank: string | null;
  confidence: "high" | "medium" | "low";
  tamperSigns: string[];
};

/** JSON schema the OCR model must answer in (structured outputs). */
export const SLIP_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_transfer_slip", "amount_baht", "transferred_at", "bank_reference", "sender_name", "receiver_name", "receiver_account", "bank", "confidence", "tamper_signs"],
  properties: {
    is_transfer_slip: { type: "boolean", description: "True only for a Thai bank transfer or PromptPay payment confirmation." },
    amount_baht: { type: ["number", "null"], description: "Amount transferred in THB, e.g. 1500.00. Null if unreadable." },
    transferred_at: { type: ["string", "null"], description: "Transfer date and time in Bangkok time as YYYY-MM-DDTHH:mm, converted to the Gregorian year (2569 BE or 69 = 2026)." },
    bank_reference: { type: ["string", "null"], description: "Transaction reference / ref no. exactly as printed." },
    sender_name: { type: ["string", "null"] },
    receiver_name: { type: ["string", "null"], description: "Receiver / payee name exactly as printed." },
    receiver_account: { type: ["string", "null"], description: "Receiver account, PromptPay ID or biller ID as printed, including any x masks." },
    bank: { type: ["string", "null"], description: "Bank or app that issued the slip." },
    confidence: { type: "string", enum: ["high", "medium", "low"], description: "How sure you are that every field above is read correctly." },
    tamper_signs: { type: "array", items: { type: "string" }, description: "Visible signs of editing (mismatched fonts, misaligned digits, pasted areas, screenshot of a screenshot). Empty if none." },
  },
} as const;

const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Validates the model's JSON; anything malformed becomes a low-confidence non-slip. */
export function parseSlipExtraction(raw: unknown): SlipExtraction {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const baht = typeof o.amount_baht === "number" && Number.isFinite(o.amount_baht) && o.amount_baht > 0 && o.amount_baht < 10_000_000 ? o.amount_baht : null;
  const confidence = o.confidence === "high" || o.confidence === "medium" ? o.confidence : "low";
  return {
    isTransferSlip: o.is_transfer_slip === true,
    amountMinor: baht == null ? null : Math.round(baht * 100),
    transferredAt: str(o.transferred_at, 40),
    bankReference: str(o.bank_reference, 80)?.replace(/\s+/g, "") ?? null,
    senderName: str(o.sender_name),
    receiverName: str(o.receiver_name),
    receiverAccount: str(o.receiver_account, 60),
    bank: str(o.bank, 60),
    confidence,
    tamperSigns: Array.isArray(o.tamper_signs) ? o.tamper_signs.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.slice(0, 200)).slice(0, 10) : [],
  };
}

/** "YYYY-MM-DDTHH:mm" in Bangkok time (Buddhist years corrected) to epoch ms. */
export function slipTime(value: string | null): number | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]) > 2400 ? Number(m[1]) - 543 : Number(m[1]);
  const t = Date.parse(`${year}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00`);
  return Number.isFinite(t) ? t : null;
}

const normalName = (s: string) => s.toLowerCase().replace(/^(นาย|นางสาว|นาง|mr\.?|mrs\.?|ms\.?|miss)\s*/i, "").replace(/บริษัท|บจก\.?|จำกัด|\(มหาชน\)|co\.?,?|ltd\.?|limited|company|[\s.,()]/gi, "");

export function payeeMatches(extraction: Pick<SlipExtraction, "receiverName" | "receiverAccount">, config: Pick<SlipConfig, "payeeNames" | "payeeAccounts">) {
  const name = normalName(extraction.receiverName ?? "");
  const nameOk = !!name && config.payeeNames.some((p) => { const n = normalName(p); return !!n && (name.includes(n) || n.includes(name) && name.length >= 4); });
  if (!config.payeeAccounts.length) return nameOk;
  // Slips mask most digits (e.g. "xxx-x-x6789-x"). Line the printed account up with each
  // configured account from the right: every visible digit must match, masks match anything.
  const printed = (extraction.receiverAccount ?? "").replace(/[^0-9xX*]/g, "").toLowerCase().replace(/\*/g, "x");
  const visibleDigits = printed.replace(/x/g, "").length;
  const accountOk = visibleDigits >= 3 && config.payeeAccounts.some((a) => a.length === printed.length && [...printed].every((c, i) => c === "x" || c === a[i]));
  return nameOk && accountOk;
}

export const SLIP_REASONS = {
  not_a_slip: "This does not look like a bank transfer slip.",
  low_confidence: "Some details could not be read clearly.",
  amount_unreadable: "The amount could not be read.",
  amount_mismatch: "The amount is different from the balance due.",
  over_balance: "The amount is more than the balance due.",
  nothing_due: "Nothing is due on this booking.",
  payee_mismatch: "The receiver is not Waydidi's account.",
  date_unreadable: "The transfer date could not be read.",
  date_out_of_range: "The transfer date is before the booking or in the future.",
  duplicate_image: "The same image was uploaded for another booking.",
  duplicate_reference: "This bank reference was already used on another slip.",
  tampering_suspected: "The image may have been edited.",
  ocr_unavailable: "Automatic reading is not configured.",
  ocr_failed: "Automatic reading failed.",
  auto_approve_off: "Automatic approval is switched off.",
} as const;
export type SlipReason = keyof typeof SLIP_REASONS;

export type SlipContext = {
  outstandingMinor: number;
  bookingCreatedAt: string;
  now: number;
  config: SlipConfig;
  duplicateImageElsewhere: boolean;
  duplicateBankReference: boolean;
};

/**
 * Decides whether a slip may be approved without a person. Every check must pass;
 * any doubt sends it to finance review. Never rejects on its own — only people reject.
 */
export function assessSlip(extraction: SlipExtraction | null, ctx: SlipContext, ocr: "ok" | "unavailable" | "failed" = "ok") {
  const reasons: SlipReason[] = [];
  if (ocr !== "ok" || !extraction) reasons.push(ocr === "unavailable" ? "ocr_unavailable" : "ocr_failed");
  else {
    if (!extraction.isTransferSlip) reasons.push("not_a_slip");
    if (extraction.confidence !== "high") reasons.push("low_confidence");
    if (extraction.amountMinor == null) reasons.push("amount_unreadable");
    else if (ctx.outstandingMinor <= 0) reasons.push("nothing_due");
    else if (extraction.amountMinor > ctx.outstandingMinor) reasons.push("over_balance");
    else if (extraction.amountMinor !== ctx.outstandingMinor) reasons.push("amount_mismatch");
    if (!payeeMatches(extraction, ctx.config)) reasons.push("payee_mismatch");
    const at = slipTime(extraction.transferredAt);
    const created = Date.parse(ctx.bookingCreatedAt);
    if (at == null) reasons.push("date_unreadable");
    // Minute-precision slips: allow an hour before the booking record and ten minutes of clock skew.
    else if ((Number.isFinite(created) && at < created - 3_600_000) || at > ctx.now + 600_000 || at < ctx.now - 30 * 86_400_000) reasons.push("date_out_of_range");
    if (extraction.tamperSigns.length) reasons.push("tampering_suspected");
  }
  if (ctx.duplicateImageElsewhere) reasons.push("duplicate_image");
  if (ctx.duplicateBankReference) reasons.push("duplicate_reference");
  if (!reasons.length && !ctx.config.autoApprove) reasons.push("auto_approve_off");
  return { decision: reasons.length ? "review" as const : "approve" as const, reasons };
}

/** The amount a person may approve: positive whole satang within the balance due. */
export function validApprovalAmount(amountMinor: unknown, outstandingMinor: number): amountMinor is number {
  return Number.isSafeInteger(amountMinor) && (amountMinor as number) > 0 && (amountMinor as number) <= outstandingMinor;
}
