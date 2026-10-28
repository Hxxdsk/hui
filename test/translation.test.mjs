import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {signVolcTranslation,translateWithService} from '../translation.mjs';
import {detectTranslationCredentials,translationSegments,translationBatches,assembleTranslation} from '../public/translation-core.js';
test('credential identification recognizes explicit services, does not guess arbitrary AK/SK pairs',()=>{
  const c=detectTranslationCredentials('{"provider":"火山翻译","accessKeyId":"test-ak","secretAccessKey":"test-sk"}');
  assert.equal(c.provider,'volcengine');assert.equal(c.ak,'test-ak');assert.equal(c.sk,'test-sk');
  assert.equal(detectTranslationCredentials('accessKeyId=AKLT_TEST_ONLY\nsecretAccessKey=test-sk').provider,'volcengine');
  assert.equal(detectTranslationCredentials('{"ak":"other-provider-ak","sk":"other-sk"}').provider,null);
  assert.equal(detectTranslationCredentials('unknown-api-key').provider,null);
  assert.equal(detectTranslationCredentials('test-free-key:fx').provider,'deepl');
  assert.equal(detectTranslationCredentials('{"provider":"openai","apiKey":"test:fx"}').provider,'openai');
});
test('translation segmentation respects Unicode and native batch limits; alignment stays at phrase level',()=>{
  const source='长发，微笑\n站在窗边';const segments=translationSegments(source);
  const result=assembleTranslation(source,segments,['long hair','smile','standing by the window'],'en');
  assert.equal(result.translation,'long hair, smile\nstanding by the window');assert.equal(result.pairs.length,3);assert.equal(result.alignment,'segments');
  assert.equal(translationSegments('一个完整句子没有分隔符').length,1);
  const long='🙂'.repeat(3000);assert.equal(translationSegments(long).map(s=>s.source).join(''),long);
  const groups=translationBatches(Array.from({length:35},()=>({source:'字'.repeat(400)})));
  assert.ok(groups.every(g=>g.length<=16&&g.reduce((n,s)=>n+s.source.length,0)<=5000));
});
test('Volc signing uses the official endpoint, scope, UTC date, JSON body and signed security token',()=>{
  const request=signVolcTranslation({ak:'AKLT_TEST_ONLY',sk:'dummy-secret',sessionToken:'dummy-sts',texts:['你好'],sourceLanguage:'zh',targetLanguage:'en',now:new Date('2026-10-27T01:02:03Z')});
  assert.equal(request.url,'https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01');
  assert.equal(request.headers['x-date'],'20261027T010203Z');assert.equal(request.headers['x-security-token'],'dummy-sts');
  assert.match(request.headers.Authorization,/20261027\/cn-north-1\/translate\/request/);assert.match(request.headers.Authorization,/SignedHeaders=host;x-content-sha256;x-date;x-security-token/);
  // Golden value compared against the official @volcengine/openapi Signer using synthetic credentials.
  assert.match(request.headers.Authorization,/Signature=d959e4b1ac4043b0aa039170baef19de9f73a744ffb58fa56e1f274c3aa229fe$/);
  assert.deepEqual(JSON.parse(request.body),{SourceLanguage:'zh',TargetLanguage:'en',TextList:['你好']});
});
test('Volc adapter sends native TextList batches, never chat messages, and maps each returned phrase',async()=>{
  const calls=[];const text=Array.from({length:20},(_,i)=>`词语${i}`).join('，');
  const result=await translateWithService({provider:'volcengine',text,sourceLanguage:'zh',targetLanguage:'en',credentials:{ak:'test-ak',sk:'test-sk'}},{fetchImpl:async(url,request)=>{
    const body=JSON.parse(request.body);calls.push({url,body});assert.ok(!('model' in body)&&!('messages' in body));
    return Response.json({TranslationList:body.TextList.map(s=>({Translation:`word-${s.slice(2)}`})),ResponseMetadata:{Error:null}});
  }});
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.body.TextList.length<=16));assert.equal(result.pairs.length,20);assert.match(result.translation,/word-19/);
});
test('native translation errors redact credentials and cancelled requests do not launch another batch',async()=>{
  await assert.rejects(translateWithService({provider:'volcengine',text:'你好',targetLanguage:'en',credentials:{ak:'test-ak',sk:'secret-test'}},{fetchImpl:async()=>Response.json({ResponseMetadata:{Error:{Code:'AuthFailure',Message:'bad secret-test test-ak'}}})}),e=>!e.message.includes('secret-test')&&!e.message.includes('test-ak')&&e.message.includes('[已隐藏]'));
  const controller=new AbortController();let calls=0;
  await assert.rejects(translateWithService({provider:'volcengine',text:Array.from({length:20},()=> '词语').join(','),targetLanguage:'en',credentials:{ak:'test-ak',sk:'test-sk'}},{signal:controller.signal,fetchImpl:async(url,request)=>{calls++;controller.abort();return Response.json({TranslationList:JSON.parse(request.body).TextList.map(()=>({Translation:'word'}))});}}));
  assert.equal(calls,1);
});
test('DeepL chooses the built-in Free endpoint and native authentication without a model URL',async()=>{
  const result=await translateWithService({provider:'deepl',text:'你好',sourceLanguage:'zh',targetLanguage:'en',credentials:{key:'dummy-key:fx'}},{fetchImpl:async(url,request)=>{assert.equal(url,'https://api-free.deepl.com/v2/translate');assert.equal(request.headers.Authorization,'DeepL-Auth-Key dummy-key:fx');assert.equal(JSON.parse(request.body).target_lang,'EN');return Response.json({translations:[{text:'Hello'}]});}});
  assert.equal(result.translation,'Hello');
});
test('local translation route forwards cancellation context and JSON independently of chat routes',async t=>{
  const app=createApp({translationHandler:async(data,{signal})=>{assert.ok(signal instanceof AbortSignal);assert.equal(data.provider,'volcengine');return {translation:'Hello',pairs:[{source:data.text,target:'Hello'}]};}});app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>{app.closeAllConnections();app.close();});
  const root=`http://127.0.0.1:${app.address().port}`;
  const response=await fetch(root+'/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'volcengine',text:'你好'})});assert.equal(response.status,200);assert.equal((await response.json()).translation,'Hello');
});
