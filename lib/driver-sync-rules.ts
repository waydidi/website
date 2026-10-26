export type DriverStepSync = {
  attempts: number;
  lastAttemptAt: string | null;
  retryAt: string | null;
  blocked: boolean;
  error: "network" | "server" | "rate_limited" | "unverified" | "rejected" | null;
  httpStatus: number | null;
  message: string | null;
  leaseId: string | null;
  leaseUntil: string | null;
};

export function initialDriverSync(): DriverStepSync {
  return { attempts: 0, lastAttemptAt: null, retryAt: null, blocked: false, error: null, httpStatus: null, message: null, leaseId: null, leaseUntil: null };
}

/** A successful-looking page or a response for another event is not an acknowledgment. */
export function driverResponseKind(status: number, payload: unknown, step: { id: string; status: string }): "accepted" | "retry" | "blocked" {
  if (status === 200 && typeof payload === "object" && payload !== null) {
    const result = payload as { ok?: unknown; eventId?: unknown; status?: unknown };
    if (result.ok === true && result.eventId === step.id && result.status === step.status) return "accepted";
  }
  if (status >= 200 && status < 300 || status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return "retry";
  return "blocked";
}

export function driverRetryAt(attempts: number, now: number, retryAfter: string | null = null) {
  const backoff = Math.min(300000, 20000 * 2 ** Math.min(10, Math.max(0, attempts - 1)));
  let serverDelay = 0;
  if (retryAfter) {
    if (/^\d{1,8}$/.test(retryAfter)) serverDelay = Number(retryAfter) * 1000;
    else {
      const parsed = Date.parse(retryAfter);
      if (Number.isFinite(parsed)) serverDelay = Math.max(0, parsed - now);
    }
  }
  return new Date(now + Math.max(backoff, Math.min(serverDelay, 86400000))).toISOString();
}

export function mayRetryDriverStep(sync: DriverStepSync | undefined, now: number, manual = false) {
  if (sync?.leaseUntil && Date.parse(sync.leaseUntil) > now) return false;
  if (sync?.blocked && !manual) return false;
  if (sync?.retryAt && Date.parse(sync.retryAt) > now && (!manual || sync.httpStatus === 429)) return false;
  return true;
}
