type OperationalContext = Record<string, string | number | boolean | null | undefined>;

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{8,80}$/;

export function requestIdFor(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim() ?? "";
  return REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN_ERROR";
  const normalized = error.message.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
  return normalized.slice(0, 80) || "UNKNOWN_ERROR";
}

export function logOperationalError(
  event: string,
  requestId: string,
  error: unknown,
  context: OperationalContext = {},
) {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      requestId,
      errorCode: safeErrorCode(error),
      ...context,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function monitoredHeaders(requestId: string, startedAt: number) {
  return {
    "Cache-Control": "no-store",
    "Server-Timing": `app;dur=${Math.max(0, Date.now() - startedAt)}`,
    "X-Request-ID": requestId,
  };
}
