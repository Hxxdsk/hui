import test from 'node:test';
import assert from 'node:assert/strict';
import {trimContext,estimateTokens} from '../public/core.js';
import {AnimaSkill} from '../public/anima-skill-ui.js';

test('large history trimming remains linear and preserves latest multimodal turn and system',()=>{
 const history=[{role:'system',content:'system'}];for(let i=0;i<4000;i++)history.push({role:i%2?'assistant':'user',content:'long hair, score_9, '.repeat(60)});
 const latest={role:'user',content:[{type:'text',text:'latest prompt'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]};history.push(latest);
 const result=trimContext(history,2200);assert.equal(result.messages[0],history[0]);assert.equal(result.messages.at(-1),latest);assert.ok(result.removed>1900);assert.equal(result.tokens,estimateTokens(result.messages));assert.equal(history.length,4002);
});

test('local image assistance has no deadline, waits for completion, and still respects manual cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const skill=Object.create(AnimaSkill.prototype),calls=[];
 skill.getConfig=()=>({taggerEnabled:true,taggerLocalImages:true,taggerMode:'auto'});
 let finish;skill.api=async(route,data,signal)=>{calls.push({data,signal});return new Promise((resolve,reject)=>{finish=resolve;signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});});};
 const controller=new AbortController();const task=skill.prepare([{role:'user',text:'prompt',files:[{type:'image',data:'image'}]}],controller.signal);
 t.mock.timers.tick(24*60*60*1000);assert.equal(calls.length,1);assert.equal(calls[0].signal.aborted,false);assert.equal(calls[0].data.localImages,true);finish({mode:'reverse',prompt:'completed local evidence'});assert.equal((await task).prompt,'completed local evidence');
 const second=skill.prepare([{role:'user',files:[{type:'image',data:'image'}]}],controller.signal);controller.abort();await assert.rejects(second);assert.equal(calls.length,2);
});
