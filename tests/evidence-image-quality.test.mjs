import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';

// The server keeps a driver's photo sharp: the stamp text stays readable after it re-encodes the picture.
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const {sanitizeEvidence,MAX_EVIDENCE_BYTES}=await vite.ssrLoadModule('/lib/evidence-image.ts');

function detailed(width,height){ // thin white strokes on a dark band, like stamp text
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,text=y>height*0.7&&((x*7+y*3)%23<2);data.set(text?[255,255,255,255]:[(x*5+y)%90+60,(y*3)%80+60,100,255],i);}
 return data;
}

test('a 1600 x 1200 picture is accepted and re-saved at a high quality, under the size limit',()=>{
 const input=jpeg.encode({width:1600,height:1200,data:detailed(1600,1200)},92).data;
 assert.ok(input.length<MAX_EVIDENCE_BYTES);
 const out=sanitizeEvidence(new Uint8Array(input));
 assert.deepEqual([out.width,out.height],[1600,1200]);
 assert.ok(out.original.length<MAX_EVIDENCE_BYTES);
 // Higher quality than the old quality 80 re-save: a visibly larger file, so less blur on thin text.
 const oldQuality=jpeg.encode(jpeg.decode(input,{useTArray:true}),80).data;
 assert.ok(out.original.length>oldQuality.length*1.2,`${out.original.length} vs ${oldQuality.length}`);
});

test('a picture over 1600 px or 2 megapixels is still refused',()=>{
 const wide=jpeg.encode({width:1700,height:100,data:new Uint8Array(1700*100*4).fill(120)},90).data;
 assert.throws(()=>sanitizeEvidence(new Uint8Array(wide)),/1600/);
});
