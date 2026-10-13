// What the Worker does with a request for an admin page when no staff session cookie arrived. No runtime
// imports, so it is unit tested directly (tests/admin-gate.test.mjs).
//
// The staff cookie is SameSite=Strict, so a link tapped outside the site (Telegram's "Open booking",
// an email, another app) arrives without it even for a signed-in person. Such a page visit is sent through
// one hop: a small page on waydidi.com that reloads the same address, which the browser treats as a
// same-site navigation and sends the cookie with. If there is still no staff session after the hop, the
// person is signed out and goes to the sign-in page. Everything that is not a page visit (APIs, fetches)
// keeps the plain 401, and the cookie rule itself is unchanged.

export const ADMIN_HOP_PARAM = "__hop";

export type AdminGate = "json401" | "hop" | "sign-in";

export function adminGate(input: { method: string; accept: string | null; secFetchSite: string | null; hopped: boolean }): AdminGate {
  const pageVisit = (input.method === "GET" || input.method === "HEAD") && (input.accept ?? "").includes("text/html");
  if (!pageVisit) return "json401";
  const fromInsideSite = input.secFetchSite === "same-origin" || input.secFetchSite === "same-site";
  return input.hopped || fromInsideSite ? "sign-in" : "hop";
}

/** The hop page: reloads the same address from inside the site. The address is escaped for the HTML and the script. */
export function adminHopPage(target: string) {
  const html = target.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const js = JSON.stringify(target).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Waydidi</title><noscript><meta http-equiv="refresh" content="0;url=${html}"></noscript></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#4a2a1a"><p>กำลังเปิด…</p><script>location.replace(${js})</script></body></html>`;
}
