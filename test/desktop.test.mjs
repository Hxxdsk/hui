import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopLifecycle} from '../desktop-lifecycle.mjs';
test('sleep, missing heartbeats, startup delay, refresh and closing tabs never stop service; only explicit quit does',async()=>{
 let closed=0,busy=false;const life=createDesktopLifecycle({enabled:true,shutdown:()=>closed++,busy:()=>busy});
 life.tick();life.open('page-0001');life.close('page-0001');for(let i=0;i<10000;i++)life.tick();assert.equal(closed,0);
 busy=true;assert.throws(()=>life.quit(),/更新/);busy=false;life.quit();life.quit();await new Promise(r=>setTimeout(r,200));assert.equal(closed,1);life.dispose();
});
test('unmanaged service cannot be shut down through the desktop quit action',()=>{const life=createDesktopLifecycle();assert.throws(()=>life.quit(),/绘.exe/);life.dispose();});
