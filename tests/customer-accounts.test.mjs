import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());

const account = await vite.ssrLoadModule("/lib/customer-account.ts");
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [schema, migration, auth, codeRoute, verifyRoute, checkout, signInForm] = await Promise.all([
  read("db/schema.ts"), read("drizzle/0028_customer_accounts.sql"), read("lib/customer-auth.ts"),
  read("app/api/account/code/route.ts"), read("app/api/account/verify/route.ts"), read("app/api/checkout/route.ts"),
  read("components/account/sign-in-form.tsx"),
]);

test("sign-in codes are six uniformly generated digits", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const code = account.generateSignInCode();
    assert.match(code, /^\d{6}$/);
    seen.add(code);
  }
  assert.ok(seen.size > 1900, "codes should not repeat often");
  assert.equal(account.isValidCode("12345"), false);
  assert.equal(account.isValidCode("12345a"), false);
});

test("emails are normalised and validated", () => {
  assert.equal(account.normalizeEmail("  Alice@Example.COM "), "alice@example.com");
  assert.equal(account.normalizeEmail(42), "");
  assert.equal(account.isValidEmail("alice@example.com"), true);
  assert.equal(account.isValidEmail("not-an-email"), false);
  assert.equal(account.isValidEmail(`${"a".repeat(250)}@x.co`), false);
});

test("account cookie is HttpOnly, Secure and SameSite", () => {
  const cookie = account.accountCookie("token");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(account.accountCookie("", 0), /Max-Age=0/);
});

test("trips are bucketed by status and pickup time", () => {
  const now = new Date("2026-09-24T12:00:00+07:00").getTime();
  assert.equal(account.tripBucket("cancelled", "2026-10-01", "09:00", now), "cancelled");
  assert.equal(account.tripBucket("completed", "2026-10-01", "09:00", now), "completed");
  assert.equal(account.tripBucket("confirmed", "2026-10-01", "09:00", now), "upcoming");
  assert.equal(account.tripBucket("confirmed", "2026-09-24", "08:00", now), "upcoming", "stays upcoming shortly after pickup");
  assert.equal(account.tripBucket("confirmed", "2026-09-20", "08:00", now), "completed");
});

test("profile text is trimmed, bounded and stripped of control characters", () => {
  assert.equal(account.sanitizeProfileText("  Alice\u0000 ", 80), "Alice");
  assert.equal(account.sanitizeProfileText("x".repeat(100), 10), "x".repeat(10));
  assert.equal(account.sanitizeProfileText("   ", 10), null);
  assert.equal(account.sanitizeProfileText(5, 10), null);
});

test("codes and sessions are stored only as hashes", () => {
  assert.match(schema, /codeHash: text\("code_hash"\)/);
  assert.match(schema, /tokenHash: text\("token_hash"\)/);
  assert.doesNotMatch(migration, /`code` text|`token` text/);
  assert.match(codeRoute, /codeHash: await sha256\(`\$\{id\}:\$\{code\}`\)/);
  assert.match(auth, /tokenHash: await sha256\(token\)/);
});

test("the bookings table is not widened past D1's 100-column limit", () => {
  assert.doesNotMatch(migration, /ALTER TABLE `bookings`/);
  assert.match(migration, /CREATE TABLE `customer_booking_links`/);
});

test("code verification limits guesses and consumes codes once", () => {
  const countAt = verifyRoute.indexOf("attempts: sql`");
  const compareAt = verifyRoute.indexOf("constantTimeEqual(");
  assert.ok(countAt > 0 && compareAt > countAt, "attempt is counted before the comparison");
  assert.match(verifyRoute, /record\.attempts >= MAX_CODE_ATTEMPTS/);
  assert.match(verifyRoute, /isNull\(customerLoginCodes\.consumedAt\)\)\)\.returning/);
  assert.match(codeRoute, /MAX_CODES_PER_EMAIL_PER_HOUR/);
  assert.match(codeRoute, /overRateLimit\(request, "account-code"/);
  assert.match(verifyRoute, /overRateLimit\(request, "account-verify"/);
});

test("customers only see bookings linked to them or made with their verified email", () => {
  assert.match(auth, /or\(inArray\(bookings\.reference, linked\), sql`lower\(\$\{bookings\.customerEmail\}\) = \$\{customer\.email\}`\)/);
  assert.match(auth, /customerBooking\(customer: Customer, reference: string\)[\s\S]+ownedBy\(customer\)/);
  assert.match(auth, /ACCOUNT_VISIBLE_STATUSES/);
});

test("checkout links bookings to the signed-in customer", () => {
  const insertAt = checkout.indexOf(".insert(bookings)");
  const linkAt = checkout.indexOf("insert(customerBookingLinks)");
  assert.ok(insertAt > 0 && linkAt > insertAt);
});

test("post-sign-in redirects stay on this site", () => {
  assert.match(signInForm, /!value\.startsWith\("\/\/"\)/);
  assert.match(signInForm, /!value\.startsWith\("\/\\\\"\)/);
});
