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

test("saved places need a name and a Google place from the suggestions", () => {
  assert.equal(account.validateSavedPlace({ label: "", address: "Sukhumvit", placeId: "ChIJabcdefghij" }).ok, false);
  assert.equal(account.validateSavedPlace({ label: "Home", address: "Sukhumvit", placeId: "not a place" }).ok, false);
  const ok = account.validateSavedPlace({ label: "  Home ", address: "Sukhumvit 55", placeId: "ChIJabcdefghij" });
  assert.deepEqual(ok, { ok: true, value: { label: "Home", placeId: "ChIJabcdefghij", address: "Sukhumvit 55" } });
});

test("saved travellers need a full name and valid optional contacts", () => {
  assert.equal(account.validateSavedPassenger({ name: "Mia" }).ok, false);
  assert.equal(account.validateSavedPassenger({ name: "Mia", surname: "T", email: "nope" }).ok, false);
  assert.equal(account.validateSavedPassenger({ name: "Mia", surname: "T", phone: "call me" }).ok, false);
  const ok = account.validateSavedPassenger({ name: "Mia", surname: "Tester", email: "MIA@Example.com", phone: "+66 81 222 3333" });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.email, "mia@example.com");
});

test("book again keeps the route and book the return trip reverses it", () => {
  const trip = { pickup: "BKK", dropoff: "Pattaya", passengers: 3, luggage: 4, vehicle: "comfort_suv", serviceType: "transfer", bookedHours: null };
  const places = { pickupPlaceId: "ChIJpickup", dropoffPlaceId: "ChIJdropoff" };
  const again = new URLSearchParams(account.rebookQuery(trip, places, "again").split("?")[1].split("#")[0]);
  assert.equal(again.get("pickup"), "BKK");
  assert.equal(again.get("dropoffPlaceId"), "ChIJdropoff");
  const back = new URLSearchParams(account.rebookQuery(trip, places, "return").split("?")[1].split("#")[0]);
  assert.equal(back.get("pickup"), "Pattaya");
  assert.equal(back.get("dropoff"), "BKK");
  assert.equal(back.get("pickupPlaceId"), "ChIJdropoff");
  assert.equal(back.get("passengers"), "3");
  const hourly = new URLSearchParams(account.rebookQuery({ ...trip, serviceType: "hourly", bookedHours: 5 }, places, "return").split("?")[1].split("#")[0]);
  assert.equal(hourly.get("dropoff"), null);
  assert.equal(hourly.get("hours"), "5");
});

test("saved places and travellers are always scoped to the signed-in customer", async () => {
  const files = await Promise.all(["app/api/account/places/[id]/route.ts", "app/api/account/passengers/[id]/route.ts"].map(read));
  for (const source of files) {
    for (const match of source.matchAll(/\.(delete|update)\(customerSaved\w+\)[^;]+;/g)) {
      assert.match(match[0], /eq\(customerSaved\w+\.customerId, session\.customer\.id\)/, match[0]);
    }
  }
  const rebook = await read("app/api/account/trips/[reference]/rebook/route.ts");
  assert.match(rebook, /customerBooking\(session\.customer, reference\.toUpperCase\(\)\)/);
});
