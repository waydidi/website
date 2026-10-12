import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customerIdentities, customers } from "@/db/schema";
import type { SocialProfile, SocialProvider } from "@/lib/social-auth";

/** Finds the customer for this identity, linking or creating by verified email. */
export async function customerFor(provider: SocialProvider, profile: SocialProfile) {
  const db = getDb();
  const now = new Date().toISOString();
  const [linked] = await db.select({ customer: customers, identityId: customerIdentities.id }).from(customerIdentities)
    .innerJoin(customers, eq(customers.id, customerIdentities.customerId))
    .where(and(eq(customerIdentities.provider, provider), eq(customerIdentities.providerUserId, profile.providerUserId))).limit(1);
  if (linked) {
    await db.update(customerIdentities).set({ lastUsedAt: now, email: profile.email }).where(eq(customerIdentities.id, linked.identityId));
    return linked.customer;
  }
  // Linking to an existing account by email is only safe when the provider has verified that email.
  if (!profile.email || !profile.emailVerified) return null;
  let [customer] = await db.select().from(customers).where(eq(customers.email, profile.email)).limit(1);
  if (!customer) {
    [customer] = await db.insert(customers).values({
      id: crypto.randomUUID(), email: profile.email, name: profile.firstName, surname: profile.lastName,
      createdAt: now, updatedAt: now, lastSeenAt: now,
    }).onConflictDoNothing().returning();
    customer ??= (await db.select().from(customers).where(eq(customers.email, profile.email)).limit(1))[0];
  } else if (!customer.name && (profile.firstName || profile.lastName)) {
    await db.update(customers).set({ name: profile.firstName, surname: customer.surname ?? profile.lastName, updatedAt: now }).where(eq(customers.id, customer.id));
  }
  await linkIdentity(customer.id, provider, profile);
  return customer;
}

/**
 * Links a provider identity to a customer who has already proved who they are (an existing
 * signed-in session). Never moves an identity already linked to someone else.
 */
export async function linkIdentity(customerId: string, provider: SocialProvider, profile: SocialProfile) {
  const now = new Date().toISOString();
  await getDb().insert(customerIdentities).values({
    id: crypto.randomUUID(), customerId, provider, providerUserId: profile.providerUserId, email: profile.email, createdAt: now, lastUsedAt: now,
  }).onConflictDoNothing();
  const [row] = await getDb().select({ customerId: customerIdentities.customerId }).from(customerIdentities)
    .where(and(eq(customerIdentities.provider, provider), eq(customerIdentities.providerUserId, profile.providerUserId))).limit(1);
  return row?.customerId === customerId;
}
