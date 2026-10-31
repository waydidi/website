import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { migrationStatements } from './helpers/migrations.mjs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

const root = fileURLToPath(new URL('..', import.meta.url));
globalThis.__stopsSurfaceEnv = {};
const vite = await createServer({ root, optimizeDeps: { noDiscovery: true }, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{
  name: 'stops-env', enforce: 'pre', resolveId(id) { if (id === 'cloudflare:workers') return '\0stops-env'; },
  load(id) { if (id === '\0stops-env') return 'export const env=globalThis.__stopsSurfaceEnv'; },
}] });
after(() => vite.close());
const stops = [{ offerId: 'historic', attractionId: 'historic-attraction', name: 'Muang Boran <historic>', durationMinutes: 180, priceMinor: 60025 }, { offerId: 'market', attractionId: 'market-attraction', name: 'Old market', durationMinutes: 30, priceMinor: 10000 }];
const routeStopsJson = JSON.stringify(stops);
const booking = { reference: 'STOPS1', name: 'Test', customerName: 'Test', customerSurname: null, to: 'test@example.invalid', customerEmail: 'test@example.invalid', customerPhone: '000', pdf: new Uint8Array(), pickup: 'Bangkok', dropoff: 'Pattaya', pickupDate: '2099-02-01', pickupTime: '10:00', vehicle: 'economy_sedan', passengers: 2, luggage: 1, total: 2500, paymentMethod: 'card', flightNumber: null, pickupSign: null, pickupInstructions: null, childSeats: 0, oversizedLuggage: false, specialRequests: null, serviceType: 'transfer', pricingArea: null, bookedHours: null };

test('confirmation email renders frozen stop names, minutes and exact satang in both alternatives', async () => {
  const { prepareConfirmationEmail } = await vite.ssrLoadModule('/lib/email.ts');
  const { payload } = prepareConfirmationEmail({ ...booking, routeStopsJson });
  for (const part of [payload.text, payload.html]) {
    assert.match(part, /180 min/); assert.match(part, /THB 600\.25/); assert.match(part, /Old market/); assert.match(part, /THB 100\.00/);
    assert.match(part, /Sightseeing stops \(outbound\)/);
  }
  assert.match(payload.html, /Muang Boran &lt;historic&gt;/);
  assert.doesNotMatch(payload.html, /<historic>/);
  assert.doesNotMatch(prepareConfirmationEmail(booking).payload.text, /Sightseeing stops/);
});

test('driver API projection includes outbound names and minutes only, never prices or return stops', async () => {
  const { driverRouteStops } = await vite.ssrLoadModule('/lib/route-stop-display.ts');
  assert.deepEqual(driverRouteStops(routeStopsJson, 'outbound'), stops.map(({ name, durationMinutes }) => ({ name, durationMinutes })));
  assert.deepEqual(driverRouteStops(routeStopsJson, 'return'), []);
  for (const value of [null, undefined, '[]']) assert.deepEqual(driverRouteStops(value), []);
  assert.throws(() => driverRouteStops('{broken'), /INVALID_ROUTE_STOP_SNAPSHOT/);
});

test('Thai private driver jobs show frozen stop name and minutes, never the stop sale price', async () => {
  const { driverJobText } = await vite.ssrLoadModule('/lib/telegram/job-text.ts');
  const text = driverJobText({ ...booking, routeStopsJson }, 800);
  assert.match(text, /Muang Boran <historic>.*180 นาที/); assert.match(text, /Old market.*30 นาที/);
  assert.doesNotMatch(text, /600[.,]25|100[.,]00|700[.,]25/);
  assert.match(text, /800/);
});

test('team booking cards and lookup replies carry frozen stops with HTML escaping', async () => {
  const { bookingCard } = await vite.ssrLoadModule('/lib/telegram/cards.ts');
  const { jobReply } = await vite.ssrLoadModule('/lib/telegram/job-lookup.ts');
  const { driverRouteStops } = await vite.ssrLoadModule('/lib/route-stop-display.ts');
  const card = bookingCard({ ...booking, routeStops: driverRouteStops(routeStopsJson), payment: 'paid' });
  assert.match(card, /Muang Boran &lt;historic&gt;.*180 นาที/);
  const reply = jobReply({ ...booking, route_stops_json: routeStopsJson, pickup_date: booking.pickupDate, pickup_time: booking.pickupTime, customer_name: 'Test', customer_surname: null });
  assert.match(reply, /Muang Boran &lt;historic&gt;.*180 นาที/);
  assert.doesNotMatch(reply, /600[.,]25|100[.,]00|700[.,]25/);
});

test('open and taken driver-group jobs escape names and do not disclose customer stop prices', async () => {
  const { offerText } = await vite.ssrLoadModule('/lib/telegram/driver-group-rules.ts');
  for (const state of [{ kind: 'open' }, { kind: 'taken', driverName: 'Test' }]) {
    const text = offerText({ ...booking, routeStopsJson, vehicleName: 'SUV', driverCost: 800 }, state);
    assert.match(text, /Muang Boran &lt;historic&gt;.*180 นาที/);
    assert.doesNotMatch(text, /600[.,]25|100[.,]00|700[.,]25|<historic>/);
  }
});

test('details component shows customer prices, omits empty snapshots, and hides all prices for drivers', async () => {
  const { RouteStopsDetails } = await vite.ssrLoadModule('/components/route-stops-details.tsx');
  const html = renderToStaticMarkup(createElement(RouteStopsDetails, { routeStopsJson }));
  assert.match(html, /Muang Boran &lt;historic&gt;/); assert.match(html, /180 min/); assert.match(html, /THB 600\.25/); assert.match(html, /THB 700\.25/);
  for (const value of [null, undefined, '[]', '{broken']) assert.equal(renderToStaticMarkup(createElement(RouteStopsDetails, { routeStopsJson: value })), '');
  const driver = renderToStaticMarkup(createElement(RouteStopsDetails, { routeStopsJson, driver: true }));
  assert.match(driver, /180 นาที/); assert.doesNotMatch(driver, /600|100\.00|700|THB/);
  const projected = renderToStaticMarkup(createElement(RouteStopsDetails, { driver: true, driverStops: stops.map(({ name, durationMinutes }) => ({ name, durationMinutes })) }));
  assert.match(projected, /180 นาที/); assert.doesNotMatch(projected, /600|100\.00|700|THB/);
});

test('confirmation PDF includes every stop on extra pages without disturbing the existing total', async () => {
  const { createConfirmationPdf } = await vite.ssrLoadModule('/lib/confirmation-pdf.ts');
  const original = await PDFDocument.load(await createConfirmationPdf(booking));
  const pdf = await PDFDocument.load(await createConfirmationPdf({ ...booking, routeStopsJson }));
  assert.equal(pdf.getPageCount(), original.getPageCount() + 1);
  const pageContent = page => page.node.Contents().asArray().map(ref => Buffer.from(decodePDFRawStream(page.doc.context.lookup(ref)).decode()).toString('latin1')).join('\n');
  assert.equal(pageContent(pdf.getPage(0)), pageContent(original.getPage(0)), 'the original confirmation and total stay unchanged');
  const content = [...pdf.context.enumerateIndirectObjects()].flatMap(([, o]) => o instanceof PDFRawStream ? [Buffer.from(decodePDFRawStream(o).decode()).toString('latin1')] : []).join('\n');
  // Standard-font text uses hex strings in the content stream.
  for (const text of ['Muang Boran <historic>', '180 min', 'THB 600.25', 'Old market', 'THB 100.00', 'THB 700.25']) assert.ok(content.includes(Buffer.from(text).toString('hex').toUpperCase()), text);
});

test('real driver GET denies invalid and revoked links and sends only outbound names and minutes', async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
  try {
    const db = await mf.getD1Database('DB');
    for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
      const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8'));
      if (statements.length) await db.batch(statements.map(s => db.prepare(s)));
    }
    globalThis.__stopsSurfaceEnv.DB = db;
    const { sha256 } = await vite.ssrLoadModule('/lib/security.ts');
    const { GET } = await vite.ssrLoadModule('/app/api/driver/trips/[token]/route.ts');
    const now = new Date().toISOString(), expires = '2099-02-03T00:00:00Z';
    await db.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,return_date,return_time,passengers,luggage,vehicle,payment_method,total,status,access_token_hash,created_at,updated_at) VALUES('SURFACE1','Test','test@example.invalid','Bangkok','Pattaya','2099-02-01','10:00','2099-02-02','11:00',2,1,'economy_sedan','card',2500,'confirmed','hash',?,?)").bind(now, now).run();
    await db.prepare("INSERT INTO booking_route_stops(booking_reference,route_stops_json) VALUES('SURFACE1',?)").bind(routeStopsJson).run();
    const { bookingRouteStopSnapshots } = await vite.ssrLoadModule('/lib/booking-route-stop-snapshots.ts');
    const snapshots = await bookingRouteStopSnapshots(['SURFACE1', 'SURFACE1', ...Array.from({ length: 81 }, (_, i) => 'missing-' + i)]);
    assert.deepEqual([...snapshots], [['SURFACE1', routeStopsJson]]);
    await db.prepare("INSERT INTO drivers(id,full_name,phone,status,created_at,updated_at) VALUES('surface-driver','Test Driver','000','active',?,?)").bind(now, now).run();
    const response = token => GET(new Request('https://example.invalid/api/driver/trips/' + token), { params: Promise.resolve({ token }) });
    assert.equal((await response('invalid')).status, 404);
    for (const [leg, token] of [['outbound', 'a'.repeat(48)], ['return', 'b'.repeat(48)]]) {
      await db.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES(?,'SURFACE1',?,'surface-driver',?,'assigned','owner',?,?,?)").bind('surface-' + leg, leg, await sha256(token), now, expires, now).run();
      const result = await response(token); assert.equal(result.status, 200);
      const body = await result.json();
      assert.deepEqual(body.booking.routeStops, leg === 'outbound' ? stops.map(({ name, durationMinutes }) => ({ name, durationMinutes })) : []);
      assert.doesNotMatch(JSON.stringify(body), /routeStopsJson|priceMinor|60025|10000|historic-attraction/);
    }
    await db.prepare("UPDATE booking_assignments SET revoked_at=? WHERE id='surface-outbound'").bind(now).run();
    assert.equal((await response('a'.repeat(48))).status, 404);
  } finally { await mf.dispose(); delete globalThis.__stopsSurfaceEnv.DB; }
});

test('all customer and staff views receive the stored snapshot, including API projections and email retries', async () => {
  for (const file of [
    'app/booking/confirmation/[reference]/confirmation-client.tsx', 'app/account/trips/[reference]/page.tsx',
    'components/trip/trip-view.tsx', 'app/admin/bookings/page.tsx', 'components/admin-overview/upcoming-rides.tsx', 'app/driver/trip/[token]/trip-client.tsx',
  ]) assert.match(await readFile(root + file, 'utf8'), /RouteStopsDetails/, file);
  for (const file of ['app/api/bookings/[reference]/route.ts', 'app/api/trip/[reference]/route.ts', 'lib/booking-fulfillment.ts', 'app/api/bookings/[reference]/email/route.ts', 'app/api/admin/bookings/[reference]/confirmation/route.ts']) assert.match(await readFile(root + file, 'utf8'), /routeStopsJson/, file);
  assert.match(await readFile(root + 'app/api/driver/trips/[token]/route.ts', 'utf8'), /driverRouteStops/);
  for (const file of ['lib/telegram/bookings.ts', 'lib/telegram/driver-group.ts', 'lib/telegram/assignments.ts', 'lib/telegram/job-lookup.ts', 'lib/telegram/assistant-tools.ts']) assert.match(await readFile(root + file, 'utf8'), /route_stops_json/, file);
});
