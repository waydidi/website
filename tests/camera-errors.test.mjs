import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// What a driver is told when the live camera can't be opened: the reason, how to fix it, and always the phone's camera app.
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},server:{middlewareMode:true}});
const {cameraProblem,isInAppBrowser}=await vite.ssrLoadModule('/lib/camera-errors.ts');
test.after(()=>vite.close());

test('each reason has its own message, and every one offers the phone camera app',()=>{
 const denied=cameraProblem('NotAllowedError',false);
 assert.match(denied,/กล้องถูกปิดไว้ เปิดสิทธิ์กล้องให้ waydidi\.com/);
 assert.doesNotMatch(denied,/Telegram|Chrome/);
 assert.match(cameraProblem('NotFoundError',false),/ไม่พบกล้อง/);
 assert.match(cameraProblem('NotReadableError',false),/แอปอื่นใช้กล้อง/);
 assert.match(cameraProblem('SomethingElse',false),/เปิดกล้องในหน้านี้ไม่ได้/);
 for(const name of ['NotAllowedError','SecurityError','NotFoundError','NotReadableError','AbortError','',undefined])assert.match(cameraProblem(name??'',true),/แอปกล้องของโทรศัพท์/);
});

test('a link open inside another app (Telegram, LINE, Facebook) is told to open it in Chrome',()=>{
 assert.match(cameraProblem('NotAllowedError',true),/Telegram หรือ LINE[\s\S]*เปิดใน Chrome/);
 assert.ok(isInAppBrowser('Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Telegram-Android/10.0'));
 assert.ok(isInAppBrowser('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36 Line/13.1.0'));
 assert.ok(isInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605 [FBAN/FBIOS;FBAV/430]'));
 assert.ok(!isInAppBrowser('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'));
 assert.ok(!isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'));
});
