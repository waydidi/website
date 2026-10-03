import type { SecurityDatabase } from "./worker-db";
import { constantTimeEqual, secureToken, sha256 } from "./security";

export const STAFF_SESSION_SECONDS = 8 * 60 * 60;
export const STAFF_COOKIE = "waydidi_admin_session";
export const CHALLENGE_COOKIE = "waydidi_admin_challenge";
export type StaffRole = "owner" | "operations" | "finance" | "editor" | "support";
export type StaffAccount = { id: string; username: string; email: string; display_name: string; password_hash: string; role: StaffRole; mfa_secret: string | null; last_totp_step: number; active: number };
const encoder = new TextEncoder();
const base32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2,"0")).join("");
function unhex(value: string) { return Uint8Array.from(value.match(/../g) ?? [], x => parseInt(x,16)); }

export async function hashStaffPassword(password: string) {
  if (password.length < 12 || password.length > 200) throw new Error("Use a password of 12–200 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:100000},key,256);
  return `pbkdf2-sha256$100000$${hex(salt)}$${hex(derived)}`;
}
export async function verifyStaffPassword(password: string, stored: string) {
  const [algorithm, iterations, salt, expected] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || iterations !== "100000" || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected) || password.length > 200) return false;
  const key = await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  return constantTimeEqual(hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unhex(salt),iterations:100000},key,256)),expected);
}
export function newTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = ""; for (const byte of bytes) bits += byte.toString(2).padStart(8,"0");
  let value = ""; for(let i=0;i<bits.length;i+=5) value += base32[parseInt(bits.slice(i,i+5),2)];
  return value;
}
function decodeBase32(secret: string) {
  let bits = ""; for(const char of secret) { const n=base32.indexOf(char); if(n<0) throw new Error("Invalid MFA secret"); bits+=n.toString(2).padStart(5,"0"); }
  return Uint8Array.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2)));
}
export async function totpCode(secret: string, step: number) {
  const counter = new Uint8Array(8); new DataView(counter.buffer).setBigUint64(0,BigInt(step));
  const key = await crypto.subtle.importKey("raw",decodeBase32(secret),{name:"HMAC",hash:"SHA-1"},false,["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC",key,counter));
  const offset = digest[19] & 15;
  const number = ((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3];
  return String(number%1000000).padStart(6,"0");
}
export async function acceptedTotpStep(secret: string, code: string, now = Date.now()) {
  if(!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now/30000);
  for(const step of [current,current-1,current+1]) if(constantTimeEqual(await totpCode(secret,step),code)) return step;
  return null;
}
async function encryptionKey(secret: string) {
  if(secret.length<32) throw new Error("Staff encryption secret is not configured.");
  return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",encoder.encode(`staff-mfa:${secret}`)),"AES-GCM",false,["encrypt","decrypt"]);
}
export async function encryptMfa(value: string, secret: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  return `${hex(iv)}.${hex(await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(secret),encoder.encode(value)))}`;
}
export async function decryptMfa(value: string, secret: string) {
  const [iv,ciphertext]=value.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unhex(iv)},await encryptionKey(secret),unhex(ciphertext)));
}
export function readCookie(request: Request, name: string) {
  return (request.headers.get("cookie")??"").split(";").map(p=>p.trim()).find(p=>p.startsWith(`${name}=`))?.slice(name.length+1)??"";
}
export async function staffForToken(db: SecurityDatabase, token: string) {
  if(!/^[a-f0-9]{48,128}$/.test(token)) return null;
  const now=new Date().toISOString(), idle=new Date(Date.now()-30*60000).toISOString();
  const hash=await sha256(token);
  const account=await db.prepare(`SELECT a.* FROM staff_accounts a JOIN staff_sessions s ON s.staff_id=a.id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_used_at>? AND a.active=1 AND a.mfa_secret IS NOT NULL`).bind(hash,now,idle).first<StaffAccount>();
  if(account) await db.prepare("UPDATE staff_sessions SET last_used_at=? WHERE token_hash=? AND revoked_at IS NULL").bind(now,hash).run();
  return account;
}
export async function newStaffSession(db: SecurityDatabase, staffId: string) {
  const token=secureToken(), now=new Date();
  await db.prepare("INSERT INTO staff_sessions(token_hash,staff_id,expires_at,last_used_at,created_at) VALUES(?,?,?,?,?)").bind(await sha256(token),staffId,new Date(now.getTime()+STAFF_SESSION_SECONDS*1000).toISOString(),now.toISOString(),now.toISOString()).run();
  return token;
}
export function allowedStaffRoute(role: StaffRole, path: string, method: string) {
  if(role==="owner") return true;
  if(path==="/api/admin/session") return true;
  if(path==="/admin" || path==="/api/admin/overview") return role==="operations";
  const section=path.replace(/^\/(?:api\/)?admin\/?/,"").split("/")[0];
  if(section==="chat") return ["operations","support"].includes(role);
  if(["staff","settings"].includes(section)) return false;
  if(["payments","refunds","finance","reports","payouts","partners"].includes(section)) return role==="finance";
  if(["blog","posts","content"].includes(section)) return role==="editor";
  if(role==="operations") return ["bookings","calendar","drivers","assignments","alerts","operations","flights","routes","vehicles","dashboard","manual-booking","journeys","notifications","automation","evidence","driver-images","driver-applications","forms","agencies","agency-applications"].includes(section);
  if(role==="support") return method==="GET" && ["bookings","customers"].includes(section);
  return false;
}
