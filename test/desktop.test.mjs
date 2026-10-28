import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopLifecycle} from '../desktop-lifecycle.mjs';
test('closing the final page releases managed service; refresh, multiple pages, hidden periods and updates stay alive',()=>{
 let now=0,closed=0,busy=false;const life=createDesktopLifecycle({enabled:true,now:()=>now,shutdown:()=>closed++,busy:()=>busy,grace:2500,heartbeatTimeout:130000,startupTimeout:90000});
 life.open('page-0001');life.open('page-0002');life.close('page-0001');now=3000;life.tick();assert.equal(closed,0);
 life.close('page-0002');now=4000;life.open('reload-0001');now=7000;life.tick();assert.equal(closed,0);now=70000;life.tick();assert.equal(closed,0);
 life.close('reload-0001');busy=true;now=75000;life.tick();assert.equal(closed,0);busy=false;life.tick();assert.equal(closed,1);life.dispose();
});
test('development service does not exit when a web page closes',()=>{let count=0;const life=createDesktopLifecycle({enabled:false,now:()=>1000000,shutdown:()=>count++});life.open('page-0001');life.close('page-0001');life.tick();assert.equal(count,0);life.dispose();});
