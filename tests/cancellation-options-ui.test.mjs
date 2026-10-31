import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,optimizeDeps:{noDiscovery:true},resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const ui=await vite.ssrLoadModule('/components/home/purchased-cancellation-policy.tsx');
test('public policy options are hidden off and explain all options with the configured window on',()=>{
 assert.equal(typeof ui.CancellationPolicyOptions,'function');
 const config={enabled:false,discountBps:500,surchargeBps:1500,fullRefundHours:18};
 assert.equal(renderToStaticMarkup(React.createElement(ui.CancellationPolicyOptions,{config})), '');
 const html=renderToStaticMarkup(React.createElement(ui.CancellationPolicyOptions,{config:{...config,enabled:true}}));
 assert.match(html,/Standard/);assert.match(html,/Non-refundable/);assert.match(html,/Flexible/);assert.match(html,/18 hours/);
});
