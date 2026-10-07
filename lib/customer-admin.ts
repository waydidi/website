import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingEvents, bookings, customerBookingLinks, customers } from "@/db/schema";
import { crmDb } from "@/lib/crm";
import { csvStream } from "@/lib/csv-stream";
import { csvCell } from "@/lib/crm-rules";
import { ACCOUNT_VISIBLE_STATUSES } from "@/lib/customer-account";

/**
 * Registered members for the admin Users tab, newest first. Trips count
 * bookings made with the member's email or while signed in.
 */
export async function listCustomers(search: string, page = 1, pageSize = 50) {
  const term = search.trim().toLowerCase().slice(0, 100);
  const statuses = sql.join(ACCOUNT_VISIBLE_STATUSES.map((s) => sql`${s}`), sql`, `);
  return getDb().select({
    id: customers.id,
    email: customers.email,
    name: customers.name,
    surname: customers.surname,
    phone: customers.phone,
    marketingOptIn: customers.marketingOptIn,
    createdAt: customers.createdAt,
    lastSeenAt: customers.lastSeenAt,
    // Outer columns are written as "customers"."…" explicitly: an interpolated
    // column renders unqualified, and inside a subquery SQLite would resolve
    // a bare "id" to the inner table's own id.
    trips: sql<number>`(select count(*) from bookings b where b.status in (${statuses}) and ((lower(b.customer_email) = "customers"."email" and not exists (select 1 from customer_booking_links l where l.booking_reference=b.reference)) or b.reference in (select l.booking_reference from customer_booking_links l where l.customer_id = "customers"."id")))`,
    providers: sql<string | null>`(select group_concat(i.provider) from customer_identities i where i.customer_id = "customers"."id")`,
  }).from(customers)
    .where(term ? sql`(${customers.email} like ${`%${term}%`} or lower(coalesce(${customers.name}, '') || ' ' || coalesce(${customers.surname}, '')) like ${`%${term}%`} or coalesce(${customers.phone}, '') like ${`%${term}%`})` : undefined)
    .orderBy(desc(customers.createdAt))
    .limit(Math.min(100, Math.max(1, pageSize))).offset((Math.max(1,page)-1)*Math.min(100,Math.max(1,pageSize)));
}

/**
 * Deletes a member account: profile, sign-in methods, sessions, saved places
 * and travellers. Booking records are kept (unlinked) because they are
 * needed for accounting, disputes and legal duties, as the privacy notice
 * explains. Admin-only; customers cannot delete their own account.
 */
export async function deleteCustomerAccount(customerId: string) {
  const db = getDb();
  const [customer] = await db.select({ email: customers.email }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return false;
  // Booking and payment evidence is retained; account-only records are erased atomically.
  const raw = crmDb();
  const retainedId = `deleted:${crypto.randomUUID()}`;
  await raw.batch([
    raw.prepare("UPDATE partner_voucher_codes SET box_id=NULL WHERE box_id IN (SELECT id FROM member_boxes WHERE customer_id=?)").bind(customerId),
    ...["customer_booking_links","customer_identities","customer_saved_places","customer_saved_passengers","customer_billing_profiles","customer_sessions","member_spins","member_gifts","member_boxes","member_reward_emails","member_coupons"].map(t=>raw.prepare(`DELETE FROM ${t} WHERE customer_id=?`).bind(customerId)),
    raw.prepare("DELETE FROM customer_login_codes WHERE email=?").bind(customer.email),
    raw.prepare("UPDATE booking_member_discounts SET customer_id=? WHERE customer_id=?").bind(retainedId,customerId),
    raw.prepare("UPDATE website_conversations SET customer_id=NULL WHERE customer_id=?").bind(customerId),
    raw.prepare("UPDATE support_reviews SET customer_id=NULL WHERE customer_id=?").bind(customerId),
    raw.prepare("UPDATE agency_members SET active=0 WHERE email=?").bind(customer.email),
    raw.prepare("UPDATE crm_outbox SET status=CASE WHEN status='sent' THEN status ELSE 'cancelled' END,payload_json='{}',email='' WHERE contact_id IN (SELECT id FROM crm_contacts WHERE member_id=?)").bind(customerId),
    raw.prepare("DELETE FROM crm_marketing_tokens WHERE contact_id IN (SELECT id FROM crm_contacts WHERE member_id=?)").bind(customerId),
    raw.prepare("DELETE FROM crm_sources WHERE kind='member' AND source_id=?").bind(customerId),
    raw.prepare("UPDATE crm_contacts SET name='Deleted member',email=NULL,phone=NULL WHERE member_id=? AND NOT EXISTS(SELECT 1 FROM crm_sources s WHERE s.contact_id=crm_contacts.id AND s.kind IN ('booking','chat'))").bind(customerId),
    raw.prepare("UPDATE crm_contacts SET member_id=NULL,marketing_opt_in=0,consent_at=NULL,consent_source=NULL,notes='',updated_at=? WHERE member_id=?").bind(new Date().toISOString(),customerId),
    raw.prepare("DELETE FROM customers WHERE id=?").bind(customerId),
  ]);
  return true;
}

/** Adds a booking to a member's account; moving it from another account needs move=true. */
export async function linkBookingToCustomer(customerId: string, reference: string, move: boolean, by: string) {
  const db = getDb();
  const [customer] = await db.select({ id: customers.id, email: customers.email }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return { ok: false as const, status: 404, error: "User not found." };
  const [booking] = reference ? await db.select({ reference: bookings.reference, status: bookings.status, email: bookings.customerEmail, name: bookings.customerName, surname: bookings.customerSurname }).from(bookings).where(eq(bookings.reference, reference)).limit(1) : [];
  if (!booking || booking.status === "binned") return { ok: false as const, status: 404, error: "No booking with that reference." };
  const [link] = await db.select().from(customerBookingLinks).where(eq(customerBookingLinks.bookingReference, reference)).limit(1);
  if (link?.customerId === customerId || (!link && (booking.email ?? "").toLowerCase() === customer.email)) return { ok: true as const, reference, already: true };
  const [emailOwner] = !link && booking.email ? await db.select({ id: customers.id, email: customers.email }).from(customers).where(eq(customers.email, booking.email.toLowerCase())).limit(1) : [];
  if (!move && (link || (emailOwner && emailOwner.id !== customerId))) {
    const [other] = link ? await db.select({ email: customers.email }).from(customers).where(eq(customers.id, link.customerId)).limit(1) : [emailOwner];
    return { ok: false as const, status: 409, error: `This booking is in another account (${other?.email ?? "unknown"}). Move it here?`, needsMove: true };
  }
  const now = new Date().toISOString();
  const [changed] = await db.batch([
    db.insert(customerBookingLinks).values({ bookingReference: reference, customerId, createdAt: now })
      .onConflictDoUpdate({ target: customerBookingLinks.bookingReference, set: { customerId, createdAt: now }, setWhere: move ? undefined : eq(customerBookingLinks.customerId, customerId) }),
    db.insert(bookingEvents).select(sql`SELECT NULL, ${reference}, 'admin_added_to_account', NULL, ${now} FROM customer_booking_links WHERE booking_reference=${reference} AND customer_id=${customerId}`),
  ]);
  if (!changed.meta.changes) return { ok: false as const, status: 409, error: "Booking ownership changed. Review it before moving it.", needsMove: true };
  console.info("Admin added booking to account", { reference, customerId, admin: by });
  return { ok: true as const, reference, already: false, guest: `${booking.name} ${booking.surname ?? ""}`.trim() };
}

function memberQuery(search: string, filter: string, sort: string) {
  const term=search.trim().toLowerCase().slice(0,100),q=`%${term.replace(/[%_^]/g,"^$&")}%`;
  const statuses=ACCOUNT_VISIBLE_STATUSES.map(s=>`'${s}'`).join(',');
  const tripSql=`(select count(*) from bookings b where b.status in (${statuses}) and (exists(select 1 from customer_booking_links l where l.booking_reference=b.reference and l.customer_id=c.id) or (lower(b.customer_email)=c.email and not exists(select 1 from customer_booking_links l where l.booking_reference=b.reference))))`;
  const now=Date.now(),bkk=new Date(now+7*3600000),monthStart=new Date(Date.UTC(bkk.getUTCFullYear(),bkk.getUTCMonth(),1)-7*3600000).toISOString(),activeSince=new Date(now-30*86400000).toISOString();
  let where="(c.email LIKE ? ESCAPE '^' or lower(coalesce(c.name,'') || ' ' || coalesce(c.surname,'')) LIKE ? ESCAPE '^' or coalesce(c.phone,'') LIKE ? ESCAPE '^')";const args:unknown[]=[q,q,q];
  if(filter==='booked')where+=` AND ${tripSql}>0`;if(filter==='none')where+=` AND ${tripSql}=0`;if(filter==='new'){where+=' AND c.created_at>=?';args.push(monthStart);}
  const key=sort==='name'?"coalesce(c.name,'')":sort==='trips'?tripSql:'c.created_at';
  const direction=sort==='name'||sort==='oldest'?'ASC':'DESC';
  // Trips break ties ascending by ID, matching the member directory.
  const idDirection=sort==='trips'?'ASC':direction;
  const order=`${key} ${direction},c.id ${idDirection}`;
  const select=`SELECT c.id,c.email,c.name,c.surname,c.phone,c.marketing_opt_in marketingOptIn,c.created_at createdAt,c.last_seen_at lastSeenAt,${tripSql} trips,(select group_concat(provider) from customer_identities i where i.customer_id=c.id) providers`;
  return {where,args,key,direction,idDirection,order,select,tripSql,monthStart,activeSince};
}
export async function memberPage(search:string,page=1,filter="all",sort="newest") {
  const db=crmDb(),{where,args,order,select,tripSql,monthStart,activeSince}=memberQuery(search,filter,sort);
  const [items,count,stats]=await Promise.all([
    db.prepare(`${select} FROM customers c WHERE ${where} ORDER BY ${order} LIMIT 50 OFFSET ?`).bind(...args,(Math.max(1,page)-1)*50).all(),
    db.prepare(`SELECT count(*) total FROM customers c WHERE ${where}`).bind(...args).first<{total:number}>(),
    db.prepare(`SELECT count(*) total,sum(c.created_at>=?) newThisMonth,sum(c.last_seen_at>=?) active30,sum(c.marketing_opt_in) optIn,sum(${tripSql}>0) booked FROM customers c`).bind(monthStart,activeSince).first(),
  ]);
  return {items:items.results,total:count?.total??0,page,stats};
}
export async function memberCsv(search:string,filter:string,sort:string){
  const db=crmDb(),{where,args,key,direction,idDirection,order,select}=memberQuery(search,filter,sort);
  let cursor:{id:string;value:unknown}|null=null;
  return csvStream(['Name','Email','Phone','Trips','Joined','Last active','Offers'].map(csvCell).join(',')+'\r\n',async()=>{
    const after=cursor?` AND (${key}${direction==='ASC'?'>':'<'}? OR (${key}=? AND c.id${idDirection==='ASC'?'>':'<'}?))`:'';
    const batch=(await db.prepare(`${select},${key} csv_sort_key FROM customers c WHERE ${where}${after} ORDER BY ${order} LIMIT 100`).bind(...args,...(cursor?[cursor.value,cursor.value,cursor.id]:[])).all<Record<string,unknown>>()).results;
    const last=batch.at(-1);if(last)cursor={id:String(last.id),value:last.csv_sort_key};
    return {text:batch.map(u=>[`${u.name??''} ${u.surname??''}`.trim(),u.email,u.phone,u.trips,u.createdAt,u.lastSeenAt,u.marketingOptIn?'Yes':'No'].map(csvCell).join(',')+'\r\n').join(''),done:batch.length<100};
  });
}
