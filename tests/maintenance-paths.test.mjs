import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Maintenance mode shows visitors the maintenance page, but the links customers are sent must keep working.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const { openInMaintenance } = await vite.ssrLoadModule('/lib/maintenance-paths.ts');

test("a customer's smart-trip itinerary link opens during maintenance, like their trip and payment links", () => {
  for (const path of ['/itinerary/47LQUGMAP58BGVVPKFEY', '/itinerary', '/trip/WD-1234', '/booking/manage', '/pay/abc', '/api/itinerary/TOKEN/pdf', '/api/blog-images/x.jpg', '/admin/trips']) assert.equal(openInMaintenance(path), true, path);
});

test('public pages still show the maintenance page', () => {
  for (const path of ['/', '/tours', '/airport-transfer', '/itineraryx', '/blog/post', '/account']) assert.equal(openInMaintenance(path), false, path);
});
