import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Only text on the approved list is sent for translation (lib/site-translation-sources.json), so every line of the
// refund policy page must be on it, or that line stays in English for visitors.
const approved = new Set(JSON.parse(readFileSync(new URL('../lib/site-translation-sources.json', import.meta.url), 'utf8')));
const file = new URL('../app/refund-policy/page.tsx', import.meta.url);

test('every sentence on the refund policy page can be translated', () => {
  const sf = ts.createSourceFile('page.tsx', readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing = [];
  (function visit(n) {
    if (ts.isJsxText(n)) {
      const text = n.text.replace(/\s+/g, ' ').trim();
      if (/\p{L}/u.test(text) && !approved.has(text) && !approved.has(n.text.trim())) missing.push(text);
    }
    ts.forEachChild(n, visit);
  })(sf);
  assert.deepEqual(missing, []);
});

test('the refund policy page is about private transportation only (no tours or tickets)', () => {
  const source = readFileSync(file, 'utf8');
  assert.equal(/\b(tour|tours|ticket|tickets|attraction|attractions)\b/i.test(source), false);
});
