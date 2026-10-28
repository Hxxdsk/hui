import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
import {chooseAnimaMode,animaContext,animaValidate,animaStatus,startAnimaInstall} from '../anima-service.mjs';
test('skill branch selection respects explicit choices and expansion with image input',()=>{
 assert.equal(chooseAnimaMode('auto','扩写这些提示词',true),'expand');assert.equal(chooseAnimaMode('auto','参考图',true),'reverse');assert.equal(chooseAnimaMode('auto','书房少女',false),'create');assert.equal(chooseAnimaMode('create','扩写',true),'create');
});
test('mounted skill uses actual pinned instructions without claiming that local tools ran',async()=>{
 const context=await animaContext({mode:'expand',text:'扩写'});assert.equal(context.mode,'expand');assert.ok(context.prompt.includes('七层细节'));assert.ok(context.prompt.includes('不受 T5 512 上限'));assert.ok(context.prompt.includes('不要编造执行日志'));assert.equal(context.notice,'');
 const tokenizer=await readFile(new URL('../vendor/anima-tagger/models/t5_tokenizer/tokenizer.json',import.meta.url));assert.equal(createHash('sha256').update(tokenizer).digest('hex'),'2432e8aa83414a69884a5cbd54a68f528c042d1f30780affbefcbb85091f022e');
 await assert.rejects(startAnimaInstall({kind:'execute-anything'}),/安装类型/);
 await assert.rejects(startAnimaInstall({kind:'image',device:'shell'}),/CPU 或 NVIDIA/);
});
const portableReady=await access(new URL('../vendor/anima-tagger/.hui-python/python.exe',import.meta.url)).then(()=>true,()=>false);
test('bundled portable Python runs upstream exact T5 validation and enforces normal/expanded budgets',{skip:!portableReady},async()=>{
 const status=await animaStatus();assert.equal(status.validator,true);
 const normal=await animaValidate({text:'```text\n1girl, solo, long hair, long hair, reading, book\n\nA girl reads a book beside a window.\n```',mode:'create'});assert.equal(normal.passed,true);assert.equal(normal.deduped_removed,1);assert.match(normal.tokens.method,/exact/);assert.equal(normal.tokens.limit_enforced,true);
 const text='1girl, solo, reading, book\n\n'+('A girl reads a book beside a window. '.repeat(100));
 const tooLong=await animaValidate({text,mode:'create'}),expanded=await animaValidate({text,mode:'expand'});assert.ok(tooLong.tokens.count>512);assert.equal(tooLong.passed,false);assert.equal(expanded.tokens.limit_enforced,false);assert.equal(expanded.passed,true);
});
test('skill API serves bundled context, rejects cross-origin deployment, and never treats an install type as a command',async t=>{
 const app=createApp();app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(r=>app.close(r)));const root='http://127.0.0.1:'+app.address().port;
 let response=await fetch(root+'/api/anima/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'create',text:'书房少女'})});assert.equal(response.status,200);assert.equal((await response.json()).mode,'create');
 response=await fetch(root+'/api/anima/install',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});assert.equal(response.status,403);
 response=await fetch(root+'/api/anima/uninstall',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});assert.equal(response.status,403);
 response=await fetch(root+'/api/anima/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'powershell'})});assert.equal(response.status,400);
});
