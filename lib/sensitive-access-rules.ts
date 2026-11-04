// Who may see full bank account numbers and tax IDs (pure: unit tested directly).
// Everyone else on the staff sees them masked ("•••• 4521").
export const FULL_PII_ROLES = ["owner", "finance"] as const;
export const canSeeFullPii = (role: string | null | undefined) => (FULL_PII_ROLES as readonly string[]).includes(String(role ?? ""));

export const SENSITIVE_KINDS = ["driver_account", "tax_invoice", "payout_export"] as const;
export type SensitiveKind = (typeof SENSITIVE_KINDS)[number];
/** Validates a reveal request: a known kind and a plain record id. */
export function parseRevealRequest(input: unknown): { kind: Exclude<SensitiveKind, "payout_export">; id: string } | null {
  if (!input || typeof input !== "object") return null;
  const { kind, id } = input as Record<string, unknown>;
  if (kind !== "driver_account" && kind !== "tax_invoice") return null;
  if (typeof id !== "string" || !/^[A-Za-z0-9:_-]{1,100}$/.test(id)) return null;
  return { kind, id };
}
