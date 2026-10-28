import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createImageStore,parseNvidiaDevices,requireNvidia,validateImageDevice} from '../anima-image.mjs';
import {managedPath} from '../update-engine.mjs';

test('GPU preflight parses NVIDIA cards and rejects missing/old drivers and arbitrary devices',()=>{
 const devices=parseNvidiaDevices('NVIDIA GeForce RTX 4060, 576.52, 8188\r\nNVIDIA RTX 5090, 580.10, 32607');
 assert.equal(devices.length,2);assert.equal(devices[0].memoryMB,8188);assert.equal(devices[0].driver,'576.52');requireNvidia(devices);
 assert.throws(()=>requireNvidia([]),/未检测到 NVIDIA/);assert.throws(()=>requireNvidia([{driver:'570.64'}]),/570.65/);assert.doesNotThrow(()=>requireNvidia([{driver:'570.65'}]));
 assert.throws(()=>validateImageDevice('cpu; powershell'),/请选择/);assert.deepEqual(parseNvidiaDevices('NVIDIA-SMI has failed'),[]);
});
test('image environment uninstall preserves both weight formats, validator, caches, settings and a persisted disabled state',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hui-image-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=createImageStore(root);
 assert.deepEqual(await store.read(),{device:'cpu',runtime:'legacy',enabled:true,legacy:true});
 const preserved=['models/pixai-tagger-v1.0-onnx/model.onnx.data','models/pixai-tagger-v1.0-original/model.safetensors','.hui-python/python.exe','.pip-cache/torch.whl','.install-cache/python.zip','settings.json'];
 for(const name of [...preserved,'.hui-image-python/Lib/site-packages/torch/model.dll']){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,name);}
 await store.save({device:'cuda',runtime:'isolated',enabled:true});assert.equal((await createImageStore(root).read()).device,'cuda');
 await store.save({device:'cuda',runtime:'isolated',enabled:false});await store.removeRuntime();
 assert.equal(await store.hasRuntime(),false);assert.equal((await createImageStore(root).read()).enabled,false);
 for(const name of preserved)assert.equal(await fs.readFile(path.join(root,name),'utf8'),name);
 await store.save({device:'cpu',runtime:'isolated',enabled:true});assert.equal((await store.read()).device,'cpu');
});
test('uninstall refuses a linked runtime and update manifests cannot alter personal image environments or weights',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hui-image-link-')),outside=await fs.mkdtemp(path.join(os.tmpdir(),'hui-image-outside-'));
 t.after(async()=>{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});});
 await fs.writeFile(path.join(outside,'keep'),'protected');await fs.symlink(outside,path.join(root,'.hui-image-python'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(createImageStore(root).removeRuntime(),/符号链接|目录联接/);assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'protected');
 for(const p of ['app/vendor/anima-tagger/.hui-image-python/python.exe','app/vendor/anima-tagger/.hui-image.json','app/vendor/anima-tagger/models/pixai-tagger-v1.0-original/model.safetensors'])assert.equal(managedPath(p),false,p);
});
const winPy=new URL('../vendor/anima-tagger/.hui-python/python.exe',import.meta.url);
const bridgePythonAvailable=process.platform!=='win32'||await fs.access(winPy).then(()=>true,()=>false);
test('Python bridge dispatches explicit CPU/CUDA and checks CUDA kernels without a silent CPU fallback',{skip:!bridgePythonAvailable},async()=>{
 const python=process.platform==='win32'?fileURLToPath(winPy):'python3';
 const result=spawnSync(python,[fileURLToPath(new URL('./anima-bridge.test.py',import.meta.url))],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
