import type { SecurityDatabase } from "@/lib/worker-db";
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { staffForToken, STAFF_COOKIE, STAFF_SESSION_SECONDS } from "./staff-security";
export const ADMIN_COOKIE = STAFF_COOKIE;
export const ADMIN_SESSION_SECONDS = STAFF_SESSION_SECONDS;
export type AdminUser = { id: string; displayName: string; email: string; fullName: string | null; role: string };
export function adminKeyConfigured() { return (env.WAYDIDI_ADMIN_SESSION_SECRET ?? "").length >= 32; }
export async function getWaydidiAdmin() {
  const account=await staffForToken(env.DB,(await cookies()).get(ADMIN_COOKIE)?.value??"");
  return account ? {id:account.id,displayName:account.display_name,email:account.email||account.username,fullName:account.display_name,role:account.role}:null;
}
export async function requireWaydidiAdmin(_returnTo?: string) {
  void _returnTo;
  const user=await getWaydidiAdmin();
  return {user:user??{id:"",displayName:"Staff",email:"",fullName:null,role:""},authorized:!!user,configured:adminKeyConfigured()};
}
export async function verifyAdminKey(candidate: string) {
  // Destructive-action reauthentication uses the signed-in person's password.
  const user=await getWaydidiAdmin(); if(!user) return false;
  const row=await (env.DB as SecurityDatabase).prepare("SELECT password_hash FROM staff_accounts WHERE id=? AND active=1").bind(user.id).first<{password_hash:string}>();
  return row ? (await import("./staff-security")).verifyStaffPassword(candidate,row.password_hash) : false;
}
