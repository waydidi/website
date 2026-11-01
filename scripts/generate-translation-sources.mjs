import ts from 'typescript';
import { build } from 'esbuild';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
// Only repository-authored public UI copy is approved for machine translation.
// Runtime names, addresses, chat text and private pages can never expand this catalog.
const root=resolve(import.meta.dirname,'..'), texts=new Set();
// A scoped refresh avoids changing unrelated policy approvals during a route rollout.
const transfersOnly=process.argv.includes('--transfers-only');
if(transfersOnly)for(const text of JSON.parse(await readFile(resolve(root,'lib/site-translation-sources.json'),'utf8')))texts.add(text);
const excluded=/(^|\/)(admin|admin-setup|account|agency|booking|chat-pay|pay|trip|itinerary|f|s|api|driver)(\/|$)|chat|inbox|customer|telegram/;
function add(s){for(const t of [s.trim(),s.replace(/\s+/g,' ').trim()])if(t && t.length<=2000 && /\p{L}/u.test(t))texts.add(t);}
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=resolve(dir,e.name),name=relative(root,f);if(excluded.test(name))continue;if(e.isDirectory())await walk(f);else if(/\.tsx?$/.test(f)){const source=ts.createSourceFile(f,await readFile(f,'utf8'),ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n))add(n.text);ts.forEachChild(n,visit);}visit(source);}}}
if(!transfersOnly){
await walk(resolve(root,'app'));await walk(resolve(root,'components'));
for(const name of ['destination-guides.ts','public-content.ts','destinations.ts','site.ts','vehicles.ts']){try{const source=ts.createSourceFile(name,await readFile(resolve(root,'lib',name),'utf8'),ts.ScriptTarget.Latest,true);function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))add(n.text);ts.forEachChild(n,visit);}visit(source);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function messages(v){if(typeof v==='string')add(v);else if(v&&typeof v==='object')Object.values(v).forEach(messages);}
const englishMessages=JSON.parse(await readFile(resolve(root,'messages/en.json'),'utf8'));
messages(transfersOnly?Object.fromEntries(Object.entries(englishMessages).filter(([key])=>key.startsWith('transfers.'))):englishMessages);
// Curated route names are repository-authored; never load pricing or customer data here.
const routesBundle = await build({entryPoints:[resolve(root,'lib/transfer-routes.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const { TRANSFER_ROUTES } = await import('data:text/javascript;base64,'+Buffer.from(routesBundle.outputFiles[0].text).toString('base64'));
for (const route of TRANSFER_ROUTES) {
  add(route.from.name); add(route.to.name);
  add(`${route.from.name} to ${route.to.name}`);
  add(`${route.from.name} to ${route.to.name} private transfer | Waydidi`);
}
await writeFile(resolve(root,'lib/site-translation-sources.json'),JSON.stringify([...texts].sort(),null,2)+'\n');
