import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createPreferencesStore} from '../preferences.mjs';
import {createApp} from '../server.mjs';
test('API credentials survive store recreation and concurrent atomic saves; HTTP route restores all provider fields',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hui-preferences-')),file=path.join(dir,'settings.json'),store=createPreferencesStore(file);t.after(async()=>{await unlink(file);await rmdir(dir);});assert.equal(await store.load(),null);
 const data={config:{baseUrl:'https://example.com/v1',model:'synthetic-model',translationService:'volcengine'},credentials:{chatKey:'synthetic-chat',translation:{key:'synthetic-translation',ak:'synthetic-ak',sk:'synthetic-sk',sessionToken:'synthetic-sts',deeplKey:'synthetic-deepl'}}};await Promise.all([store.save({...data,config:{...data.config,model:'first'}}),store.save(data)]);assert.equal((await createPreferencesStore(file).load()).credentials.translation.sk,'synthetic-sk');
 const server=createApp({preferencesStore:createPreferencesStore(file)});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const root='http://127.0.0.1:'+server.address().port;const response=await fetch(root+'/api/preferences/load',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),restored=await response.json();assert.deepEqual(restored.credentials,data.credentials);assert.deepEqual(restored.config,data.config);assert.equal(response.headers.get('cache-control'),'no-store');
});
