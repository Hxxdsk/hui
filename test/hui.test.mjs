import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeBackup,decodeBackup} from '../public/settings-backup.js';
import {composeRequest} from '../public/request-prompts.js';
test('encrypted portable settings roundtrip includes credentials and weighted tags; wrong passwords fail',async()=>{
 const raw={format:'hui-settings',version:1,config:{baseUrl:'https://example.com/v1',temperature:.8,maxTokens:4096,contextBudget:32000},credentials:{chatKey:'synthetic-only',translation:{ak:'fake-ak',sk:'fake-sk'}},anima:{positive:[{text:'long hair',weight:2}],negative:[]}};
 const encoded=await encodeBackup(raw,'测试密码');assert.ok(!JSON.stringify(encoded).includes('synthetic-only'));assert.deepEqual(await decodeBackup(encoded,'测试密码'),raw);await assert.rejects(decodeBackup(encoded,'wrong'),/密码/);assert.deepEqual(await decodeBackup(await encodeBackup(raw)),raw);await assert.rejects(decodeBackup({...raw,config:{baseUrl:'javascript:alert(1)'}}),/地址/);
});
test('request layers preserve multimodal history, honor toggles and ignore legacy roles',()=>{
 const source=[{role:'user',content:[{type:'text',text:'画图'},{type:'image_url',image_url:{url:'data:image/png;base64,abc'}}]}];const c={system:'系统',extra:'附加',tail:'末尾',role:'旧角色',tailEnabled:true};const wire=composeRequest(source,c);assert.equal(wire[0].content,'系统\n\n附加');assert.deepEqual(wire[1],source[0]);assert.equal(wire[2].content,'末尾');assert.equal(source.length,1);assert.deepEqual(composeRequest(source,{...c,systemEnabled:false,extraEnabled:false,tailEnabled:false}),source);
});
