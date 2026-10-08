import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

test('mobile tabs hide below viewport, return on upward scroll, and stay visible while pinned', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'scroll-fixture', configureServer(s) {
    s.middlewares.use((req, res, next) => {
      if (req.url !== '/') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><body><div id="root"></div><script type="module" src="/tests/browser/fixtures/scroll-entry.tsx"></script></body></html>');
    });
  } }] });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    const bar = page.getByRole('navigation');
    await bar.waitFor();
    const scroll = async (y, hidden) => {
      await page.evaluate(y => window.scrollTo(0, y), y);
      await page.waitForFunction(hidden => document.querySelector('nav')?.dataset.hidden === String(hidden), hidden);
    };
    await scroll(300, true);
    await page.waitForFunction(() => document.querySelector('nav').getBoundingClientRect().top >= innerHeight);
    await scroll(270, false);
    await page.waitForFunction(() => document.querySelector('nav').getBoundingClientRect().bottom <= innerHeight);
    await bar.getByRole('button', { name: 'More' }).click();
    await scroll(500, false);
    await bar.getByRole('button', { name: 'More' }).click();
    await scroll(600, true);
    await scroll(0, false);
    await bar.getByRole('button', { name: 'Bookings' }).click();
    await scroll(200, true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
