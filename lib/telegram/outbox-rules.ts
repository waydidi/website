export const TELEGRAM_MAX_ATTEMPTS = 12;
export const TELEGRAM_MAX_AGE_MS = 7 * 86400000;
export const TELEGRAM_LEASE_MS = 120000;
export function telegramBudgetExpired(job: { attempts: number; created_at: string }, now = Date.now()) {
  const created = Date.parse(job.created_at);
  return !Number.isFinite(created) || job.attempts >= TELEGRAM_MAX_ATTEMPTS || now - created >= TELEGRAM_MAX_AGE_MS;
}
export function telegramNextAttempt(attempts: number, retryAfterMs = 0, now = Date.now()) {
  return new Date(now + Math.max(Math.min(3600000, 60000 * 2 ** Math.min(attempts - 1, 6)), retryAfterMs)).toISOString();
}
