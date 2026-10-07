import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false}});
const {loadMaps,attachPlaceAutocomplete,resolveGooglePlaceId}=await vite.ssrLoadModule('/lib/google-places.ts');
const realFetch=globalThis.fetch, realTimer=globalThis.setTimeout;
class Element extends EventTarget {
  attrs=new Map();children=[];dataset={};style={};hidden=false;value='';disabled=false;
  setAttribute(k,v){this.attrs.set(k,v);}getAttribute(k){return this.attrs.get(k)??null;}removeAttribute(k){this.attrs.delete(k);}
  appendChild(e){this.children.push(e);return e;}replaceChildren(){this.children=[];}remove(){this.removed=true;}
  querySelectorAll(){return this.children.filter(e=>e.role==='option');}
  getBoundingClientRect(){return {left:10,bottom:100,width:300};}
}
const tick=()=>new Promise(r=>realTimer(r,15));
let existing=null, scriptHandler;
function setup(){
 const body=new Element(), head=new Element();head.appendChild=(el)=>{existing=el;scriptHandler?.(el);return el;};
 globalThis.document={body,head,activeElement:null,querySelector:()=>existing?.removed?null:existing,createElement:()=>new Element()};
 globalThis.window=Object.assign(new EventTarget(),{innerWidth:600,innerHeight:800});
 globalThis.setTimeout=(fn,ms,...args)=>realTimer(fn,ms===250?1:ms===12000?50:ms,...args);
}
after(async()=>{await vite.close();globalThis.fetch=realFetch;globalThis.setTimeout=realTimer;delete globalThis.window;delete globalThis.document;});
test('Maps loader shares requests, removes a failed script and allows a successful retry',async()=>{
 setup();let fetches=0;globalThis.fetch=async()=>{fetches++;return new Response(JSON.stringify({apiKey:'browser-test'}));};
 scriptHandler=el=>realTimer(()=>el.dispatchEvent(new Event('error')),1);
 const a=loadMaps(),b=loadMaps();assert.equal(a,b);assert.deepEqual(await Promise.all([a,b]),[false,false]);assert.equal(fetches,1);assert.ok(existing.removed);
 scriptHandler=el=>realTimer(()=>{window.google={maps:{places:{AutocompleteSuggestion:{}}}};el.dispatchEvent(new Event('load'));},1);
 assert.equal(await loadMaps(),true);assert.equal(fetches,2);assert.equal(await loadMaps(),true);assert.equal(fetches,2);
});
test('a stale script without a load/error event times out rather than leaving every caller pending',async()=>{
 setup();existing=new Element();scriptHandler=null;globalThis.fetch=async()=>new Response(JSON.stringify({apiKey:'browser-test'}));
 assert.equal(await loadMaps(),false);assert.ok(existing.removed);
});
test('Places New suggestions use Thailand, bounds and sessions; keyboard selection rotates the token and cleanup restores the input',async()=>{
 setup();existing=null;const input=new Element();input.setAttribute('role','searchbox');document.activeElement=input;
 const requests=[],picks=[];let fields=[];
 const prediction={placeId:'place-new',text:{toString:()=>'<Hotel> Bangkok'},toPlace:()=>({id:'place-new',displayName:'Hotel',formattedAddress:'Bangkok, Thailand',location:{lat:()=>13.7,lng:()=>100.5},fetchFields:async o=>{fields=o.fields;}})};
 window.google={maps:{places:{AutocompleteSessionToken:class{},AutocompleteSuggestion:{fetchAutocompleteSuggestions:async request=>{requests.push(request);return {suggestions:[{placePrediction:prediction}]};}}}}};
 const auto=attachPlaceAutocomplete(input,p=>picks.push(p));auto.setBounds({south:13,west:100,north:14,east:101});
 input.value='Ho';input.dispatchEvent(new Event('input'));await tick();input.value='Hotel';input.dispatchEvent(new Event('input'));await tick();
 assert.deepEqual(requests[0].includedRegionCodes,['th']);assert.equal(requests[0].sessionToken,requests[1].sessionToken);assert.equal(requests[0].locationBias.north,14);
 assert.equal(document.body.children[0].children[0].textContent,'<Hotel> Bangkok');assert.equal(input.getAttribute('aria-expanded'),'true');
 for(const key of ['ArrowDown','Enter'])input.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key}));await tick();
 assert.deepEqual(fields,['id','displayName','formattedAddress','location']);assert.deepEqual(picks,[{placeId:'place-new',address:'Hotel, Bangkok, Thailand',location:{lat:13.7,lng:100.5}}]);
 input.value='Next';input.dispatchEvent(new Event('input'));await tick();assert.notEqual(requests[2].sessionToken,requests[1].sessionToken);
 auto.dispose();assert.equal(input.getAttribute('role'),'searchbox');assert.equal(input.getAttribute('aria-controls'),null);assert.ok(document.body.children[0].removed);
 const count=requests.length;input.dispatchEvent(new Event('input'));await tick();assert.equal(requests.length,count);
 assert.equal(await resolveGooglePlaceId('Bangkok'),'place-new');
});
test('late suggestions and detail results cannot overwrite newer typing or a disposed input',async()=>{
 setup();const input=new Element();document.activeElement=input;let resolveSuggestions,resolveDetails;const picks=[];
 const prediction={placeId:'old',text:{toString:()=> 'Old'},toPlace:()=>({id:'old',formattedAddress:'Old address',fetchFields:()=>new Promise(r=>{resolveDetails=r;})})};
 window.google={maps:{places:{AutocompleteSessionToken:class{},AutocompleteSuggestion:{fetchAutocompleteSuggestions:()=>new Promise(r=>{resolveSuggestions=r;})}}}};
 const auto=attachPlaceAutocomplete(input,p=>picks.push(p));input.value='Old';input.dispatchEvent(new Event('input'));await tick();const first=resolveSuggestions;
 input.value='New';input.dispatchEvent(new Event('input'));await tick();first({suggestions:[{placePrediction:prediction}]});await tick();assert.equal(input.getAttribute('aria-expanded'),'false');
 resolveSuggestions({suggestions:[{placePrediction:prediction}]});await tick();document.body.children[0].children[0].dispatchEvent(new Event('pointerdown',{cancelable:true}));await tick();
 input.value='Changed';input.dispatchEvent(new Event('input'));resolveDetails();await tick();assert.deepEqual(picks,[]);assert.equal(input.value,'Changed');
 auto.dispose();resolveSuggestions({suggestions:[{placePrediction:prediction}]});await tick();assert.ok(document.body.children[0].removed);assert.deepEqual(picks,[]);
});
