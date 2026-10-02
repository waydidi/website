// Run locally as the database administrator. Password input is hidden; stdout contains SQL, never the password.
import { randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
const [username,email]=process.argv.slice(2);
if(!/^[a-z0-9._-]{3,60}$/.test(username??'')||!/^\S+@\S+\.\S+$/.test(email??'')){process.stderr.write('Usage: node scripts/provision-staff-owner.mjs <individual-staff-id> <email>\n');process.exit(1);}
let muted=false;
const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stderr.write(chunk);callback();}});
const input=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
const password=await new Promise(resolve=>{input.question('Owner password (12–200 characters): ',resolve);muted=true;});
input.close();process.stderr.write('\n');
if(password.length<12||password.length>200){process.stderr.write('Password must contain 12–200 characters.\n');process.exit(1);}
const salt=randomBytes(16),hash=`pbkdf2-sha256$100000$${salt.toString('hex')}$${pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')}`;
const quote=value=>`'${value.replaceAll("'","''")}'`;
process.stdout.write(`INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,created_at) SELECT ${[randomUUID(),username,email.toLowerCase(),username,hash,'owner',new Date().toISOString()].map(quote).join(',')} WHERE NOT EXISTS(SELECT 1 FROM staff_accounts);\n`);
