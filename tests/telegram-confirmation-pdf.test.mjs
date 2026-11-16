import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// /pdf in the Admin Telegram group: the real handler, a real in-memory D1 and the real PDF builder; only Telegram is faked.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map(s => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
globalThis.__pdfEnv = { DB: d1 };
globalThis.__cards = []; globalThis.__docs = []; globalThis.__docFail = false;
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'pdf-test', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0pdf-env'; if (id.endsWith('/lib/telegram/client')) return '\0pdf-tg'; },
  load(id) {
    if (id === '\0pdf-env') return 'export const env=globalThis.__pdfEnv';
    if (id === '\0pdf-tg') return `export async function sendCard(text,keyboard,replyTo){globalThis.__cards.push({text,replyTo});return {message_id:1}}
      export async function sendDocument(bytes,filename,type,caption,chatId,replyTo){if(globalThis.__docFail)throw new Error('telegram down');globalThis.__docs.push({bytes,filename,type,caption,replyTo});return {message_id:2}}`;
  } }] });
after(async () => { await vite.close(); await mf.dispose(); });
const rules = await vite.ssrLoadModule('/lib/telegram/confirmation-pdf-rules.ts');
const { answerPdfCommand } = await vite.ssrLoadModule('/lib/telegram/confirmation-pdf.ts');

let n = 0;
async function booking(o = {}) {
  const reference = o.reference ?? `PDF${++n}X`;
  const now = '2026-10-01T00:00:00.000Z';
  await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,access_token_hash,fulfillment_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(reference, o.name ?? 'Tayla', o.surname ?? 'Smith', 't@example.invalid', 'Suvarnabhumi Airport', 'Siam Beach Resort', o.date ?? '2099-01-20', '06:00', 3, 2, 'premium_minivan', 'cash', 2500, o.status ?? 'confirmed', 'cash_due', 0, 'x', 'complete', now, now).run();
  return reference;
}
beforeEach(() => { globalThis.__cards = []; globalThis.__docs = []; globalThis.__docFail = false; });

test('the /pdf command is recognised, with or without the bot name, and only at the start', () => {
  assert.equal(rules.parsePdfCommand('/pdf FMBNUW'), 'FMBNUW');
  assert.equal(rules.parsePdfCommand('/pdf@WaydidiBot  Tayla   Smith '), 'Tayla Smith');
  assert.equal(rules.parsePdfCommand('/pdf'), '');
  assert.equal(rules.parsePdfCommand('/PDF fmbnuw'), 'fmbnuw');
  for (const t of ['pdf FMBNUW', 'send /pdf', '/pdfs', '/pdfFMBNUW', '', `/pdf ${'x'.repeat(61)}`]) assert.equal(rules.parsePdfCommand(t), null, t);
});

test('the reference is read from a replied booking card or job message', () => {
  assert.equal(rules.referenceInText('🚐 New booking\nReference: FMBNUW\nTayla'), 'FMBNUW');
  assert.equal(rules.referenceInText('FMBNUW\nชื่อลูกค้า: Tayla'), 'FMBNUW');
  assert.equal(rules.referenceInText('Hello team'), null);
  assert.equal(rules.referenceInText(null), null);
});

test('only confirmed or completed bookings get a confirmation', () => {
  assert.equal(rules.pdfRefusal('confirmed'), null);
  assert.equal(rules.pdfRefusal('completed'), null);
  for (const s of ['pending_payment', 'cancelled', 'refunded', 'expired', 'no_show']) assert.ok(rules.pdfRefusal(s), s);
});

test('a team member gets the PDF of a booking by reference, as a reply', async () => {
  const ref = await booking();
  await answerPdfCommand(ref.toLowerCase(), 41, null, null);
  assert.equal(globalThis.__cards.length, 0);
  assert.equal(globalThis.__docs.length, 1);
  const doc = globalThis.__docs[0];
  assert.equal(doc.replyTo, 41);
  assert.equal(doc.type, 'application/pdf');
  assert.match(doc.filename, new RegExp(ref));
  assert.match(doc.caption, new RegExp(ref));
  assert.equal(Buffer.from(doc.bytes.slice(0, 5)).toString(), '%PDF-');
});

test('someone who is not on the team gets no PDF and no booking details', async () => {
  const ref = await booking();
  await answerPdfCommand(ref, 42, null, '777');
  assert.equal(globalThis.__docs.length, 0);
  assert.equal(globalThis.__cards.length, 1);
  assert.match(globalThis.__cards[0].text, /777/);
  assert.doesNotMatch(globalThis.__cards[0].text, new RegExp(`${ref}|Tayla`));
});

test('/pdf replying to a booking card uses that booking', async () => {
  const ref = await booking();
  await answerPdfCommand('', 43, `New booking\nReference: ${ref}`, null);
  assert.equal(globalThis.__docs.length, 1);
  assert.match(globalThis.__docs[0].filename, new RegExp(ref));
});

test('bare /pdf with nothing to go on explains how to use it', async () => {
  await answerPdfCommand('', 44, 'Good morning', null);
  assert.equal(globalThis.__docs.length, 0);
  assert.match(globalThis.__cards[0].text, /\/pdf/);
});

test('an unpaid or cancelled booking gets the reason, not a confirmation', async () => {
  const unpaid = await booking({ status: 'pending_payment' });
  const cancelled = await booking({ status: 'cancelled' });
  await answerPdfCommand(unpaid, 45, null, null);
  await answerPdfCommand(cancelled, 46, null, null);
  assert.equal(globalThis.__docs.length, 0);
  assert.match(globalThis.__cards[0].text, /รอชำระเงิน/);
  assert.match(globalThis.__cards[1].text, /ยกเลิก/);
});

test('a name with several upcoming bookings lists their references; one booking sends its PDF', async () => {
  const a = await booking({ name: 'Ploy', surname: 'Many', date: '2099-02-01' });
  const b = await booking({ name: 'Ploy', surname: 'Many', date: '2099-02-05' });
  await answerPdfCommand('ploy many', 47, null, null);
  assert.equal(globalThis.__docs.length, 0);
  assert.match(globalThis.__cards[0].text, new RegExp(`/pdf ${a}[\\s\\S]*/pdf ${b}`));
  const one = await booking({ name: 'Unique', surname: 'Person' });
  await answerPdfCommand('Unique Person', 48, null, null);
  assert.equal(globalThis.__docs.length, 1);
  assert.match(globalThis.__docs[0].filename, new RegExp(one));
});

test('an unknown name or reference says nothing was found', async () => {
  await answerPdfCommand('Nobody Here', 49, null, null);
  assert.equal(globalThis.__docs.length, 0);
  assert.match(globalThis.__cards[0].text, /ไม่พบ/);
});

test('when Telegram cannot take the file, the team is told instead of silence', async () => {
  const ref = await booking();
  globalThis.__docFail = true;
  await answerPdfCommand(ref, 50, null, null);
  assert.equal(globalThis.__cards.length, 1);
  assert.match(globalThis.__cards[0].text, /ไม่สำเร็จ/);
});
