import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// /book in the Admin Telegram group: the real reader, draft storage and createManualBooking on an in-memory D1.
// Only Telegram and the AI model are faked.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map(s => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
const ADMIN = '-100555';
globalThis.__bkEnv = { DB: d1, TELEGRAM_BOOKING_BUILDER: '1', WAYDIDI_PUBLIC_URL: 'https://waydidi.example' };
globalThis.__tg = { sent: [], docs: [], answers: [], calls: [], next: 1000 };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'bk-test', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0bk-env'; if (id.endsWith('/lib/telegram/client')) return '\0bk-tg'; },
  load(id) {
    if (id === '\0bk-env') return 'export const env=globalThis.__bkEnv';
    if (id === '\0bk-tg') return `const T=globalThis.__tg;
      export const telegramChatId=()=>'${ADMIN}';export const telegramCommentChatId=()=>'';export const telegramConfigured=()=>true;
      export async function sendTo(chat,text,keyboard,replyTo){const message_id=++T.next;T.sent.push({chat,text,keyboard,replyTo,message_id});return {message_id}}
      export async function sendCard(text,keyboard,replyTo){return sendTo('${ADMIN}',text,keyboard,replyTo)}
      export async function sendDocument(bytes,filename,type,caption,chat,replyTo){T.docs.push({filename,caption,replyTo});return {message_id:++T.next}}
      export async function answerCallback(id,text,alert){T.answers.push({id,text,alert})}
      export async function tg(method,payload){T.calls.push({method,payload});return {message_id:++T.next}}
      export async function sendPhoto(){return {message_id:++T.next}}`;
  } }] });
after(async () => { await vite.close(); await mf.dispose(); });
const rules = await vite.ssrLoadModule('/lib/telegram/booking-builder-rules.ts');
const builder = await vite.ssrLoadModule('/lib/telegram/booking-builder.ts');
const cmd = await vite.ssrLoadModule('/lib/telegram/commands.ts');

const TODAY = '2026-11-16';
const deps = (call = null) => ({ call, today: TODAY, now: () => new Date('2026-11-16T03:00:00Z') });
const member = { display_name: 'Anna' };
let msg = 0;
const message = (text, replyTo) => ({ message_id: ++msg, chat: { id: Number(ADMIN), type: 'supergroup' }, from: { id: 42, first_name: 'Anna' }, text, ...(replyTo ? { reply_to_message: { message_id: replyTo } } : {}) });
const lastSent = () => globalThis.__tg.sent.at(-1);
const okButton = (s) => s.keyboard?.flat().find((b) => b.callback_data?.startsWith('bkb_ok:'));
const tap = async (button, name = 'Anna', messageId = lastSent().message_id) => {
  const [action, id, version] = button.callback_data.split(':');
  return builder.handleBookingCallback(action, id, version, { name }, { id: `cb${++msg}`, message: { message_id: messageId, chat: { id: Number(ADMIN) } } }, deps());
};
const bookingsCount = async () => (await d1.prepare('SELECT COUNT(*) n FROM bookings').first()).n;
beforeEach(() => { Object.assign(globalThis.__tg, { sent: [], docs: [], answers: [], calls: [] }); globalThis.__bkEnv.TELEGRAM_BOOKING_BUILDER = '1'; });

const FULL = ['/add_booking', 'name: John Smith', 'phone: +66 81 234 5678', 'email: John@Example.com', 'date: 29/11/2099', 'time: 08:30',
  'pickup: Suvarnabhumi Airport', 'dropoff: Hilton Pattaya', 'passengers: 3', 'luggage: 2', 'car: SUV', 'price: 2,500', 'payment: cash'].join('\n');

test('labelled lines in English and Thai are read by code into checked fields', () => {
  const { labelled, rest } = rules.splitLabelled('ชื่อ: สมชาย ใจดี\nเบอร์โทร: 081-234-5678\nวันที่: 29 พ.ย.\nเวลา: 8pm\nรถ: รถตู้\nราคา: 3,000 บาท\nการชำระเงิน: โอนแล้ว\nwants a quiet driver');
  assert.equal(rest, 'wants a quiet driver');
  const { patch, problems } = rules.readFields(labelled, TODAY);
  assert.deepEqual(problems, []);
  assert.equal(patch.customerName, 'สมชาย'); assert.equal(patch.customerSurname, 'ใจดี');
  assert.equal(patch.pickupDate, '2026-11-29'); assert.equal(patch.pickupTime, '20:00');
  assert.equal(patch.vehicle, 'premium_minivan'); assert.equal(patch.fare, 3000); assert.equal(patch.payment, 'paid');
});

test('bad values are refused with the reason and do not fill the field', () => {
  const { patch, problems } = rules.readFields({ date: '1/1/2020', email: 'not-an-email', phone: '12', car: 'bus', price: 'free', payment: 'maybe', passengers: '50' }, TODAY);
  assert.deepEqual(patch, {});
  assert.equal(problems.length, 7);
  assert.match(problems.join('\n'), /ผ่านไปแล้ว/);
  assert.equal(rules.readField('payment', 'โอน', TODAY).patch.payment, 'waiting', 'transfer not yet paid');
  assert.equal(rules.readField('payment', 'cash to driver', TODAY).patch.payment, 'cash');
});

test('missing fields depend on the service, and cross-field rules are checked', () => {
  assert.deepEqual(rules.missingFields({}), ['name', 'phone', 'email', 'date', 'time', 'pickup', 'dropoff', 'passengers', 'car', 'price', 'payment']);
  assert.ok(rules.missingFields({ serviceType: 'hourly' }).includes('hours'));
  assert.ok(!rules.missingFields({ serviceType: 'hourly' }).includes('dropoff'));
  assert.match(rules.draftProblem({ vehicle: 'economy_sedan', passengers: 5 }), /นั่งได้ 2 คน/);
  assert.match(rules.draftProblem({ serviceType: 'hourly', bookedHours: 2, vehicle: 'comfort_suv' }), /3 ชั่วโมง/);
  assert.equal(rules.draftTotal({ fare: 2500, discount: 200, childSeats: 1 }), 2600);
});

test('the AI answer is untrusted: only known keys, and each value is checked like a typed one', () => {
  const fields = rules.parseAiFields('Sure! {"name":"Jane Doe","email":"jane@example.com","date":"2020-01-01","admin":"yes","price":2500}');
  assert.deepEqual(Object.keys(fields).sort(), ['date', 'email', 'name', 'price']);
  const { patch, problems } = rules.readFields(fields, TODAY);
  assert.equal(patch.pickupDate, undefined); assert.equal(problems.length, 1);
  assert.equal(rules.parseAiFields('no json here'), null);
  assert.equal(rules.parseAiFields('[1,2]'), null);
});

test('the /add_booking command (or the older /book) is recognised only at the start', () => {
  assert.equal(rules.parseBookCommand('/add_booking'), '');
  assert.equal(rules.parseBookCommand('/add_booking@WaydidiBot name: John'), 'name: John');
  assert.equal(rules.parseBookCommand('/book name: John'), 'name: John', 'the older name still works');
  for (const t of ['book name', '/booking', 'please /add_booking', '/add-booking x', '/add_bookings', '']) assert.equal(rules.parseBookCommand(t), null, t);
});

test('a full /book shows the summary with สร้างการจอง; the tap saves one confirmed booking and sends the PDF, never an email', async () => {
  const before = await bookingsCount();
  assert.equal(await builder.handleBookingBuilder(message(FULL), member, deps()), true);
  const summary = lastSent();
  assert.match(summary.text, /ข้อมูลครบ/); assert.match(summary.text, /รวม 2,500 บาท/);
  const button = okButton(summary);
  assert.ok(button);
  await tap(button);
  assert.equal(await bookingsCount(), before + 1);
  const b = await d1.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 1').first();
  assert.equal(b.status, 'confirmed'); assert.equal(b.total, 2500); assert.equal(b.customer_email, 'john@example.com');
  assert.equal(b.customer_name, 'John Smith'); assert.equal(b.pickup_date, '2099-11-29'); assert.equal(b.payment_method, 'cash');
  assert.equal(b.email_status, 'not_sent', 'the customer is not emailed from Telegram');
  const draft = await d1.prepare('SELECT status,booking_reference FROM telegram_booking_drafts ORDER BY created_at DESC LIMIT 1').first();
  assert.deepEqual(draft, { status: 'created', booking_reference: b.reference });
  assert.equal(globalThis.__tg.docs.length, 1);
  assert.match(globalThis.__tg.docs[0].filename, new RegExp(b.reference));
  // A second tap, or a second person, does not save it again.
  await tap(button, 'Ben');
  assert.equal(await bookingsCount(), before + 1);
  assert.match(globalThis.__tg.answers.at(-1).text, new RegExp(b.reference));
});

test('missing fields are listed; a reply to the bot fills them in and only then the button appears', async () => {
  await builder.handleBookingBuilder(message('/add_booking\nname: Ploy Many\ndate: 30/11\ntime: 10:00'), member, deps());
  const first = lastSent();
  assert.match(first.text, /ยังขาด:.*เบอร์โทร.*อีเมล/s);
  assert.equal(okButton(first), undefined);
  await builder.handleBookingBuilder(message('phone: +66 89 000 1111\nemail: ploy@example.com\npickup: Don Mueang\ndropoff: Siam\npassengers: 2\ncar: sedan\nprice: 1200\npayment: paid', first.message_id), member, deps());
  const second = lastSent();
  assert.match(second.text, /ข้อมูลครบ/);
  assert.match(second.text, /Ploy Many/, 'earlier fields are kept');
  const button = okButton(second);
  assert.ok(button);
  // The button under the older summary is refused once the draft changed again.
  await builder.handleBookingBuilder(message('notes: baby on board', second.message_id), member, deps());
  const before = await bookingsCount();
  await tap(button);
  assert.equal(await bookingsCount(), before);
  assert.match(globalThis.__tg.answers.at(-1).text, /ข้อมูลเปลี่ยนแล้ว/);
});

test('free text is read by the AI reader; without AI the bot asks for labelled lines', async () => {
  const fake = async (system, user) => { assert.match(user, /<note>/); return JSON.stringify({ name: 'Mai Tran', email: 'mai@example.com', phone: '+84 90 123 4567', date: '2099-12-01', time: '07:15', pickup: 'Phuket Airport', dropoff: 'Patong Beach', passengers: '2', car: 'sedan', price: '900', payment: 'transfer' }); };
  await builder.handleBookingBuilder(message('/add_booking Mai Tran 2 pax Phuket airport to Patong 1 Dec 7.15 sedan 900 baht bank transfer mai@example.com +84 90 123 4567'), member, deps(fake));
  assert.match(lastSent().text, /ข้อมูลครบ/);
  assert.match(lastSent().text, /รอโอนก่อนเดินทาง/);
  await builder.handleBookingBuilder(message('/add_booking John from airport to hotel tomorrow'), member, deps(null));
  assert.match(lastSent().text, /ไม่มี AI/);
});

test('someone not on the team cannot start or change a draft', async () => {
  const before = await d1.prepare('SELECT COUNT(*) n FROM telegram_booking_drafts').first();
  await builder.handleBookingBuilder(message(FULL), null, deps());
  assert.match(lastSent().text, /เฉพาะทีม/);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM telegram_booking_drafts').first()).n, before.n);
  await builder.handleBookingBuilder(message('/add_booking\nname: Team Draft'), member, deps());
  const summary = lastSent();
  await builder.handleBookingBuilder(message('name: Hacker', summary.message_id), null, deps());
  assert.match(lastSent().text, /เฉพาะทีม/);
  const d = await d1.prepare("SELECT fields_json FROM telegram_booking_drafts WHERE fields_json LIKE '%Team%'").first();
  assert.match(d.fields_json, /Team/); assert.doesNotMatch(d.fields_json, /Hacker/);
});

test('a webhook retry of the same /book message makes one draft; ยกเลิก closes it', async () => {
  const m = message('/add_booking\nname: Retry Person');
  await builder.handleBookingBuilder(m, member, deps());
  await builder.handleBookingBuilder(m, member, deps());
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM telegram_booking_drafts WHERE request_message_id=?').bind(m.message_id).first()).n, 1);
  const summary = lastSent();
  await builder.handleBookingBuilder(message('ยกเลิก', summary.message_id), member, deps());
  assert.match(lastSent().text, /ยกเลิกร่าง/);
  await builder.handleBookingBuilder(message('phone: +66 81 111 2222', summary.message_id), member, deps());
  assert.match(lastSent().text, /ปิดแล้ว/);
});

test('two taps at the same moment save the booking once', async () => {
  await builder.handleBookingBuilder(message(FULL.replace('John Smith', 'Twin Tap')), member, deps());
  const button = okButton(lastSent());
  const before = await bookingsCount();
  await Promise.all([tap(button, 'Anna'), tap(button, 'Ben')]);
  assert.equal(await bookingsCount(), before + 1);
});

test('off unless TELEGRAM_BOOKING_BUILDER=1: /book is ignored and not in the menu', async () => {
  globalThis.__bkEnv.TELEGRAM_BOOKING_BUILDER = '';
  assert.equal(await builder.handleBookingBuilder(message(FULL), member, deps()), false);
  assert.equal(globalThis.__tg.sent.length, 0);
  assert.deepEqual(cmd.menus(ADMIN, '', false, false)[0].commands.map((c) => c.command), ['c', 'pdf', 'ask', 'id']);
  assert.deepEqual(cmd.menus(ADMIN, '', false, true)[0].commands.map((c) => c.command), ['c', 'add_booking', 'pdf', 'ask', 'id']);
  // The owner's command names; Telegram allows only a–z, 0–9 and _ (no hyphen) in a command.
  const all = cmd.menus(ADMIN, '', true, true)[0].commands.map((c) => c.command);
  assert.deepEqual(all, ['c', 'add_booking', 'add_trip', 'add_attraction', 'pdf', 'ask', 'id']);
  for (const c of all) assert.match(c, /^[a-z0-9_]{1,32}$/);
});

test('ordinary replies in the group are not taken as booking edits', async () => {
  assert.equal(await builder.handleBookingBuilder(message('thanks!', 999999), member, deps()), false);
  assert.equal(await builder.handleBookingBuilder(message('hello'), member, deps()), false);
});

test('a return trip goes back the same way unless a different return pick-up or drop-off is typed', () => {
  const same = { pickup: 'Suvarnabhumi Airport', dropoff: 'Hilton Pattaya', returnDate: '2099-12-03', returnTime: '14:00' };
  assert.match(rules.draftSummary(same), /ขากลับ: 2099-12-03 14:00 · Hilton Pattaya → Suvarnabhumi Airport \(กลับทางเดิม\)/);
  const { labelled } = rules.splitLabelled('return pickup: Centara Hua Hin\nส่งขากลับ: Don Mueang Airport');
  const { patch, problems } = rules.readFields(labelled, TODAY);
  assert.deepEqual(problems, []);
  assert.deepEqual(patch, { returnPickup: 'Centara Hua Hin', returnDropoff: 'Don Mueang Airport' });
  assert.match(rules.draftSummary({ ...same, ...patch }), /ขากลับ: .* · Centara Hua Hin → Don Mueang Airport$/m);
  assert.equal(rules.readField('return_pickup', 'same', TODAY).patch.returnPickup, '', '"same" goes back to the outbound trip reversed');
  assert.match(rules.draftProblem({ returnPickup: 'Centara Hua Hin' }), /ยังไม่มีวันและเวลากลับ/);
  assert.match(rules.draftProblem({ serviceType: 'hourly', bookedHours: 5, returnDate: '2099-12-03', returnTime: '14:00' }), /transfer/);
  const input = rules.draftToManualInput({ ...same, ...patch });
  assert.equal(input.returnPickup, 'Centara Hua Hin'); assert.equal(input.returnDropoff, 'Don Mueang Airport');
});

test('a return from a different hotel to a different place is saved with its own route', async () => {
  const text = FULL.replace('John Smith', 'Return Other') + '\nreturn date: 3/12/2099\nreturn time: 14:00\nreturn pickup: Centara Hua Hin\nreturn dropoff: Don Mueang Airport';
  await builder.handleBookingBuilder(message(text), member, deps());
  assert.match(lastSent().text, /Centara Hua Hin → Don Mueang Airport/);
  await tap(okButton(lastSent()));
  const b = await d1.prepare("SELECT * FROM bookings WHERE customer_name='Return Other'").first();
  assert.equal(b.return_date, '2099-12-03'); assert.equal(b.return_time, '14:00');
  assert.equal(b.return_pickup, 'Centara Hua Hin'); assert.equal(b.return_dropoff, 'Don Mueang Airport');
  assert.equal(b.pickup, 'Suvarnabhumi Airport'); assert.equal(b.dropoff, 'Hilton Pattaya');
});

test('a return without its own addresses is saved as the outbound trip reversed', async () => {
  const text = FULL.replace('John Smith', 'Return Same') + '\nreturn date: 3/12/2099\nreturn time: 14:00';
  await builder.handleBookingBuilder(message(text), member, deps());
  await tap(okButton(lastSent()));
  const b = await d1.prepare("SELECT * FROM bookings WHERE customer_name='Return Same'").first();
  assert.equal(b.return_pickup, 'Hilton Pattaya'); assert.equal(b.return_dropoff, 'Suvarnabhumi Airport');
});
