import ts from 'typescript';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
// Only repository-authored public UI copy is approved for machine translation.
// Runtime names, addresses, chat text and private pages can never expand this catalog.
const root=resolve(import.meta.dirname,'..'), texts=new Set();
const excluded=/(^|\/)(admin|admin-setup|account|agency|booking|chat-pay|pay|trip|itinerary|f|s|api|driver)(\/|$)|chat|inbox|customer|telegram/;
function add(s){for(const t of [s.trim(),s.replace(/\s+/g,' ').trim()])if(t && t.length<=2000 && /\p{L}/u.test(t))texts.add(t);}
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=resolve(dir,e.name),name=relative(root,f);if(excluded.test(name))continue;if(e.isDirectory())await walk(f);else if(/\.tsx?$/.test(f)){const source=ts.createSourceFile(f,await readFile(f,'utf8'),ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n))add(n.text);ts.forEachChild(n,visit);}visit(source);}}}
await walk(resolve(root,'app'));await walk(resolve(root,'components'));
for(const name of ['destination-guides.ts','public-content.ts','destinations.ts','site.ts','vehicles.ts']){try{const source=ts.createSourceFile(name,await readFile(resolve(root,'lib',name),'utf8'),ts.ScriptTarget.Latest,true);function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))add(n.text);ts.forEachChild(n,visit);}visit(source);}catch(e){if(e.code!=='ENOENT')throw e;}}
function messages(v){if(typeof v==='string')add(v);else if(v&&typeof v==='object')Object.values(v).forEach(messages);}
messages(JSON.parse(await readFile(resolve(root,'messages/en.json'),'utf8')));
await writeFile(resolve(root,'lib/site-translation-sources.json'),JSON.stringify([...texts].sort(),null,2)+'\n');
