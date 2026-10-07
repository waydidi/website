import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), braces=require('braces');
test('installed braces fork rejects deep patterns before recursive walkers run',()=>{
 const malicious='{'.repeat(16000)+'a'+'}'.repeat(16000);
 for(const action of [braces,braces.compile,braces.expand,braces.stringify,braces.parse])assert.throws(()=>action(malicious),/nesting exceeds 100/);
 assert.deepEqual(braces('src/{app,lib}/**/*.{ts,tsx}',{expand:true}),['src/app/**/*.ts','src/app/**/*.tsx','src/lib/**/*.ts','src/lib/**/*.tsx']);
});
test('recursive brace walkers reject deep or cyclic caller-supplied ASTs',()=>{
 let deep={type:'text',value:'x'};for(let i=0;i<12000;i++)deep={type:'root',nodes:[deep]};
 for(const action of [braces.compile,braces.expand,braces.stringify])assert.throws(()=>action(deep),/AST exceeds/);
 const cycle={type:'root',nodes:[]};cycle.nodes.push(cycle);assert.throws(()=>braces.compile(cycle),/AST exceeds/);
});
test('normal parsed brace ASTs remain usable across compile, expansion and stringify',()=>{
 const ast=braces.parse('a/{b,c}/d');assert.equal(braces.compile(ast),'a/(b|c)/d');assert.deepEqual(braces.expand(ast),['a/b/d','a/c/d']);assert.equal(braces.stringify(ast),'a/{b,c}/d');
});
