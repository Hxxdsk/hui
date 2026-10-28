import {readFile,writeFile,mkdir,stat,rename,unlink,rmdir,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import {createImageStore,validateImageDevice,imageDeviceName,parseNvidiaDevices,requireNvidia} from './anima-image.mjs';

const APP=fileURLToPath(new URL('.',import.meta.url));
export const ANIMA_COMMIT='8f8ca10fc63c2f8fa1b345bc8c75b102acfe6d38';
const ROOT=path.join(APP,'vendor/anima-tagger'), RUNTIME=path.join(ROOT,'.hui-python');
const PY=path.join(RUNTIME,'python.exe'), BRIDGE=path.join(APP,'anima-bridge.py');
const PY_URL='https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip';
const PY_SHA='009d6bf7e3b2ddca3d784fa09f90fe54336d5b60f0e0f305c37f400bf83cfd3b';
const PY_NATIVE={'python.exe':'5f7b89a612c9b8af1d6456cdfcd1dbe5ca630849e79aebced9bee9a6694952ec','python311.dll':'0817a2a657a24c0d5fbb60df56960f42fc66b3039d522ec952dab83e2d869364'};
const PIP_URL='https://files.pythonhosted.org/packages/44/3c/d717024885424591d5376220b5e836c2d5293ce2011523c9de23ff7bf068/pip-25.3-py3-none-any.whl';
const PIP_SHA='9655943313a94722b7774661c21049070f6bbb0a1516bf02f7c8d5d9201514cd';
const CPU_REVISION='68e8f4f02dd56a5f40c1b7474489fa0f599dec34';
const CPU_FILES={'model.onnx':'563f4576c2668560c20f403b957f0ec4a7bd6a2275da2c2aa7f82f898ad34e5c','model.onnx.data':'4de1c25a38d1f2a2172fbcb0d2485b5f02a058b6e67bedd7bbbcfdf4de9329dc','tags.json':'0d34f2078016798808dc066dc206b18fb6ce7622f64241002ecd24172a4da068','README.md':'4bf01095d3d9f25322b7ab1927ab9da92386d801a5dfeec6a4b9d60e63619861'};
const GPU_REVISION='9fe10addf9326e292da8a85a98ea74cd91b41771';
const GPU_FILES={'model.safetensors':'f29e475205cbcbc25b52a075840c7809d6215be15f45375113ba09c49bf90292','config.json':'f8a19b38661c37dc5fd519f2137be70f6f897972021b4ebc17b7d35a0e27b9dd','preprocessor_config.json':'20451575e627950993de7b00641d5b263eceb3e7436e4ad518fea2411b60e49d','tagger_pipeline.py':'3431279fdfff234f62664999fc1fe6bb20f1e8756f7435d0e165ebd4456f7fcd','README.md':'67b6e11967974b2646275da42f3a1149ef77ea2eed5c6d93cd6a258d495c5a38'};
const imageStore=createImageStore(ROOT);
let job={state:'idle',kind:'',message:'',log:''}, installController, probe, pendingProbe,tagging=false,validating=0,nvidiaProbe;
const exists=p=>access(p).then(()=>true,()=>false);
const append=text=>{job.log=(job.log+text).slice(-14000);};
function envFor(proxy=''){
 const env={...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONNOUSERSITE:'1',PIP_DISABLE_PIP_VERSION_CHECK:'1',HF_HOME:path.join(ROOT,'.hf-cache'),PIP_CACHE_DIR:path.join(ROOT,'.pip-cache')};
 if(proxy){env.HTTP_PROXY=proxy;env.HTTPS_PROXY=proxy;env.http_proxy=proxy;env.https_proxy=proxy;}
 return env;
}
function command(file,args,{signal,env=envFor(),timeout=180000,allowFailure=false,log=false,input}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('已取消','AbortError'));
  const child=spawn(file,args,{cwd:ROOT,windowsHide:true,env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',settled=false,timedOut=false;
  const stop=()=>{if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill();};
  const timer=timeout>0?setTimeout(()=>{timedOut=true;stop();},timeout):null;signal?.addEventListener('abort',stop,{once:true});
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);error?reject(error):resolve(value);};
  child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString('utf8')).slice(-3000000);if(log)append(chunk.toString('utf8'));});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-18000);if(log)append(chunk.toString('utf8'));});
  child.on('error',error=>finish(new Error(error.code==='ENOENT'?'运行环境缺失，请点击安装 / 修复':error.message)));
  child.on('close',code=>{if(signal?.aborted)return finish(new DOMException('已取消','AbortError'));if(timedOut)return finish(new Error('操作超时，可重试'));if(code!==0&&!allowFailure)return finish(new Error((stderr||stdout||`进程退出 ${code}`).slice(-1800)));finish(null,{code,stdout,stderr});});
  child.stdin.on('error',()=>{});child.stdin.end(input?JSON.stringify(input):undefined);
 });
}
async function bridge(data,signal,python=PY){
 const result=await command(python,[BRIDGE],{input:data,signal,allowFailure:true,timeout:data.op==='validate'?60000:0});
 let json;try{json=JSON.parse(result.stdout);}catch{throw new Error('本地工具未返回有效结果：'+result.stderr.slice(-500));}
 if(json.error)throw new Error(json.error);return json;
}
async function nvidiaDevices(refresh=false){
 if(!refresh&&nvidiaProbe&&Date.now()-nvidiaProbe.time<120000)return nvidiaProbe.devices;
 const devices=await command('nvidia-smi.exe',['--query-gpu=name,driver_version,memory.total','--format=csv,noheader,nounits'],{timeout:10000,allowFailure:true}).then(r=>r.code===0?parseNvidiaDevices(r.stdout):[],()=>[]);
 nvidiaProbe={time:Date.now(),devices};return devices;
}
export async function animaStatus({refresh=false}={}){
 const skill=await exists(path.join(ROOT,'SKILL.md'));
 if(!skill)return {skill:false,validator:false,image:false,job:{...job},commit:ANIMA_COMMIT,errors:['技能文件缺失，请完整解压便携包']};
 if(refresh)probe=null;
 if(job.state!=='running'&&(!probe||Date.now()-probe.time>30000)){
  pendingProbe??=(async()=>{
   let result={validator:false,image:false,errors:[],imageInstalled:false,imageDevice:'cpu'};
   try{
    const state=await imageStore.read();result.imageDevice=state.device;result.imageRuntime=state.runtime;
    if(await exists(PY))result={...result,...await bridge({op:'check',scope:'validator'})};
    const python=state.runtime==='isolated'?imageStore.python:PY;
    result.imageInstalled=state.runtime==='isolated'?await imageStore.hasRuntime():false;
    if(state.enabled&&await exists(python)){
     const image=await bridge({op:'check',device:state.device},undefined,python);
     result.image=image.image;result.gpuName=image.gpuName;result.errors.push(...image.errors.filter(e=>!e.startsWith('精确校验环境：')));
     if(state.runtime==='legacy')result.imageInstalled=!!image.imageAssetsPresent;
    }
   }catch(e){result.errors.push(e.message);}
   probe={...result,time:Date.now()};
  })().finally(()=>pendingProbe=null);
  await pendingProbe;
 }
 const devices=await nvidiaDevices(refresh);
 return {skill:true,...(probe||{validator:false,image:false,errors:[]}),tagging,devices,job:{...job},commit:ANIMA_COMMIT,platform:process.platform,architecture:process.arch};
}
export function chooseAnimaMode(mode,text,hasImages){
 if(['create','expand','reverse'].includes(mode))return mode;
 if(/扩写|加细节|增强质感|细节拉满|expand|elaborate/i.test(text))return 'expand';
 return hasImages?'reverse':'create';
}
export async function animaContext({mode='auto',text='',images=[],localImages=false},signal){
 if(typeof text!=='string'||text.length>180000||!Array.isArray(images)||images.length>8)throw new Error('技能输入无效');
 const selected=chooseAnimaMode(mode,text,images.length>0), branch={create:'创作分支.md',expand:'扩写分支.md',reverse:'反推分支.md'}[selected];
 const files=['SKILL.md','references/格式规范.md',`references/${branch}`,'references/多人提示词.md'];
 if(selected==='expand'&&images.length)files.push('references/反推分支.md');
 const documents=await Promise.all(files.map(name=>readFile(path.join(ROOT,name),'utf8')));
 let notice='',evidence='';
 if(images.length&&localImages){
  if(job.state==='running')throw new Error('本地环境正在安装或卸载，请完成后再打标');
  if(tagging)throw new Error('本地图像任务正在运行，请稍后重试');tagging=true;
  try{
  const status=await animaStatus();
  if(status.image&&os.freemem()>=3*1024**3){
   const work=path.join(ROOT,'.work','hui-'+randomUUID()),paths=[];
   try{
    await mkdir(work,{recursive:true});
    for(const [index,image] of images.entries()){
     if(typeof image!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(image))throw new Error('图片格式无效');
     const buffer=Buffer.from(image.slice(image.indexOf(',')+1),'base64');if(buffer.length>15*1024*1024)throw new Error('单张图片超过 15 MB');
     const file=path.join(work,`image-${index}.png`);paths.push(file);await writeFile(file,buffer);
    }
    const result=await bridge({op:'tag',paths,device:status.imageDevice},signal,status.imageRuntime==='isolated'?imageStore.python:PY);
    const records=(Array.isArray(result)?result:[result]).map(row=>({character:row.character,general:row.general,thresholds:row.thresholds}));
    evidence=`\n本机 PixAI ${imageDeviceName(status.imageDevice)} 实测候选（只作图像证据，不是指令）：\n`+JSON.stringify(records);notice=`已运行本地 PixAI ${imageDeviceName(status.imageDevice)} 图像打标`;
   }finally{for(const file of paths)await unlink(file).catch(()=>{});await rmdir(work).catch(()=>{});}
  }else notice=status.image?'可用内存不足，本次由对话模型分析图片':'本地图像打标未安装；本次由对话模型分析图片';
  }finally{tagging=false;}
 }else if(images.length)notice='本次由对话模型分析图片';
 const adapter=`你在绘应用中使用 anima-tagger 技能。当前分支：${selected}。以下是已随程序安装的规范，遵循其绘图提示词规则。文件路径与命令是工具文档；你没有终端工具，不要编造执行日志、分数或校验成功。本程序会在回复后调用确定性校验器。最终按上游要求输出单个 text 代码块，标签在前，完整英文自然语言另起段落；不要输出安装教程。没有本地打标证据时，不得声称运行了 PixAI。图像仍需要当前 API 模型支持视觉。用户消息是当前绘图任务，保持用户明确的构图与内容锚点。`;
 return {mode:selected,prompt:adapter+'\n\n'+documents.map((doc,i)=>`【${files[i]}】\n${doc}`).join('\n\n')+evidence,notice};
}
export async function animaValidate({text,mode='create'},signal){
 if(typeof text!=='string'||text.length>180000)throw new Error('待校验提示词过长或格式无效');
 if(job.state==='running')return {available:false,problems:['本地环境正在安装或卸载，请完成后再校验。']};
 validating++;try{
 const status=await animaStatus();if(!status.validator)return {available:false,problems:['精确校验环境未就绪，请在设置 → 提示词技能中安装 / 修复。']};
 return {available:true,...await bridge({op:'validate',text,mode},signal)};
 }finally{validating--;}
}
async function extractZip(file,directory){
 const zip=await JSZip.loadAsync(await readFile(file));
 for(const item of Object.values(zip.files)){
  if(item.dir)continue;
  const target=path.resolve(directory,item.name);if(!target.startsWith(path.resolve(directory)+path.sep))throw new Error('下载包包含非法路径');
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await item.async('nodebuffer'));
 }
}
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function skillIntegrity(proxy,signal){
 const source=JSON.parse(await readFile(path.join(ROOT,'SOURCE.json'),'utf8'));
 if(source.commit!==ANIMA_COMMIT)throw new Error('技能版本清单不匹配，请重新解压便携包');
 for(const [name,sha] of Object.entries(source.files)){
  const target=path.resolve(ROOT,name);if(!target.startsWith(path.resolve(ROOT)+path.sep)||!/^[a-f0-9]{64}$/.test(sha))throw new Error('技能文件清单无效');
  if(!await exists(target)||await hashFile(target)!==sha){await mkdir(path.dirname(target),{recursive:true});await download(`https://raw.githubusercontent.com/Vincent54122/anima-tagger/${ANIMA_COMMIT}/${name.split('/').map(encodeURIComponent).join('/')}`,target,sha,proxy,signal);}
 }
}
async function download(url,target,sha,proxy,signal,large=false){
 if(await exists(target)&&await hashFile(target)===sha)return;
 const partial=target+'.part';
 if(await exists(partial)&&await hashFile(partial)===sha){await rename(partial,target);return;}
 let failure;
 for(let attempt=0;attempt<3;attempt++){
  try{await command(process.execPath,['--use-env-proxy',path.join(APP,'anima-download.mjs'),url,partial],{signal,env:envFor(proxy),timeout:large?3700000:400000,log:true});failure=null;break;}
  catch(error){failure=error;if(signal.aborted)throw error;append(`\n下载重试 ${attempt+1}/3\n`);}
 }
 if(failure)throw failure;signal.throwIfAborted();
 if(await hashFile(partial)!==sha){await unlink(partial).catch(()=>{});throw new Error('下载文件校验失败，请重试');}await rename(partial,target);
}
async function preparePython(runtime,cache,proxy,signal){
 let validPython=true;for(const [name,sha] of Object.entries(PY_NATIVE)){const file=path.join(runtime,name);if(!await exists(file)||await hashFile(file)!==sha)validPython=false;}
 if(!validPython){job.message='准备便携 Python';await download(PY_URL,path.join(cache,'python.zip'),PY_SHA,proxy,signal);await extractZip(path.join(cache,'python.zip'),runtime);}
 await writeFile(path.join(runtime,'python311._pth'),'python311.zip\n.\nLib/site-packages\n../tools\nimport site\n');
 if(!await exists(path.join(runtime,'Lib/site-packages/pip'))){await download(PIP_URL,path.join(cache,'pip.whl'),PIP_SHA,proxy,signal);await extractZip(path.join(cache,'pip.whl'),path.join(runtime,'Lib/site-packages'));}
}
export async function startAnimaInstall({kind='validator',device='cpu',proxy='',mirror='https://huggingface.co'}={}){
 if(job.state==='running')throw new Error('已有安装任务正在进行');
 if(tagging||validating)throw new Error('请先停止本地打标或等待校验完成，再更改安装');
 if(!['validator','image','runtime'].includes(kind))throw new Error('安装类型无效');
 validateImageDevice(device);
 if(process.platform!=='win32'||process.arch!=='x64')throw new Error('自动安装支持 Windows x64；其他平台请按上游教程安装');
 if(proxy){const url=new URL(proxy);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('代理需为不含账号密码的 HTTP(S) 地址');}
 if(!['https://huggingface.co','https://hf-mirror.com'].includes(mirror))throw new Error('请选择提供的模型下载站点');
 job={state:'running',kind,device,message:'准备便携运行环境',log:''};installController=new AbortController();const signal=installController.signal;
 (async()=>{
  try{
   await pendingProbe;
   if(kind==='image'){
    const previous=await imageStore.read();
    const installed=previous.runtime==='isolated'?await imageStore.hasRuntime():previous.enabled&&await bridge({op:'check',device:'cpu'},signal).then(r=>r.imageAssetsPresent,()=>false);
    if(installed&&previous.device!==device)throw new Error(`已安装${imageDeviceName(previous.device)}版，请先点击卸载打标环境，再安装${imageDeviceName(device)}版`);
    if(device==='cuda')requireNvidia(await nvidiaDevices(true));
    await imageStore.assertRuntimeSafe();
   }
   job.message='检查技能文件';await skillIntegrity(proxy,signal);signal.throwIfAborted();
   await mkdir(RUNTIME,{recursive:true});const cache=path.join(ROOT,'.install-cache');await mkdir(cache,{recursive:true});
   if(kind==='runtime'){
    job.message='下载微软 C++ 运行库';const installer=path.join(cache,'vc_redist.x64.exe');
    await command(process.execPath,['--use-env-proxy',path.join(APP,'anima-download.mjs'),'https://aka.ms/vc14/vc_redist.x64.exe',installer],{signal,env:envFor(proxy),timeout:400000,log:true});
    job.message='等待 Windows 安装授权';await command('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(APP,'install-vc-runtime.ps1'),'-Installer',installer],{signal,timeout:900000,log:true});
    probe=null;job.state='done';job.message='运行库部署完成，请重新检查';return;
   }
   await preparePython(RUNTIME,cache,proxy,signal);
   job.message='安装精确校验依赖';const env=envFor(proxy);env.HF_ENDPOINT=mirror;env.HF_HUB_DISABLE_XET='1';
   const broken=await bridge({op:'check'},signal).then(result=>!result.validator,()=>true);
   await command(PY,['-m','pip','install','--no-warn-script-location',...(broken?['--force-reinstall']:[]),'tokenizers==0.22.2','huggingface_hub==0.36.2'],{signal,env,timeout:600000,log:true});
   if(kind==='image'){
    await imageStore.save({device,runtime:'isolated',enabled:false});
    await mkdir(imageStore.runtime,{recursive:true});await preparePython(imageStore.runtime,cache,proxy,signal);
    const python=imageStore.python;
    if(device==='cuda'){
     job.message='安装 NVIDIA CUDA 12.8 / PyTorch（下载较大，请耐心等待）';
     await command(python,['-m','pip','install','--no-warn-script-location','torch==2.8.0+cu128','torchvision==0.23.0+cu128','--index-url','https://download.pytorch.org/whl/cu128'],{signal,env,timeout:1800000,log:true});
    }
    job.message=`安装${imageDeviceName(device)}图像打标依赖`;
    await command(python,['-m','pip','install','--no-warn-script-location','-r',path.join(ROOT,device==='cuda'?'tools/requirements.txt':'tools/requirements-cpu.txt')],{signal,env,timeout:1800000,log:true});
    if(device==='cuda')await command(python,['-c',"import torch; assert torch.cuda.is_available(), 'CUDA unavailable'; torch.ones(1,device='cuda').sum().item(); print(torch.cuda.get_device_name(0))"],{signal,env,timeout:120000,log:true});
    else await command(python,['-c','import onnxruntime, numpy; from PIL import Image'],{signal,env,timeout:60000});
    const modelDir=path.join(ROOT,device==='cuda'?'models/pixai-tagger-v1.0-original':'models/pixai-tagger-v1.0-onnx');await mkdir(modelDir,{recursive:true});
    for(const [name,sha] of Object.entries(device==='cuda'?GPU_FILES:CPU_FILES)){
     const large=['model.onnx.data','model.safetensors'].includes(name);job.message=`下载 / 校验 ${name}${large?'（约 1.9GB，支持续传）':''}`;
     await download(`${mirror}/${device==='cuda'?'pixai-labs/pixai-tagger-v1.0':'noaione/pixai-tagger-v1.0-onnx'}/resolve/${device==='cuda'?GPU_REVISION:CPU_REVISION}/${name}?download=true`,path.join(modelDir,name),sha,proxy,signal,large);
    }
    job.message='检查本地图像运行环境';const checked=await bridge({op:'check',device},signal,python);
    if(!checked.image)throw new Error(checked.errors?.join('\n')||'图像打标环境检查失败');
    await imageStore.save({device,runtime:'isolated',enabled:true});
   }
   const ready=await bridge({op:'check',scope:'validator'},signal);if(!ready.validator)throw new Error(ready.errors?.join('\n')||'校验环境检查失败');
   probe=null;job.state='done';job.message=kind==='image'?`${imageDeviceName(device)}图像打标已就绪`:'精确校验已就绪';
  }catch(error){probe=null;job.state=signal.aborted?'cancelled':'failed';job.message=signal.aborted?'已取消，可继续安装或卸载未完成环境':['EPERM','EACCES'].includes(error.code)?'程序目录不可写或文件正在使用，请停止当前任务并将程序解压到可写目录后重试':error.message;append('\n'+job.message);}
 })();
 return {...job};
}
export function cancelAnimaInstall(){installController?.abort();return {...job,message:'正在取消…'};}
export async function startAnimaUninstall(){
 if(job.state==='running')throw new Error('已有安装或卸载任务正在进行');
 if(tagging||validating)throw new Error('请先停止本地打标或等待校验完成，再卸载');
 job={state:'running',kind:'uninstall',message:'正在卸载图像打标环境，保留模型和校验器',log:''};installController=null;
 (async()=>{
  try{
   await pendingProbe;const state=await imageStore.read();
   await imageStore.assertRuntimeSafe();
   await imageStore.save({...state,enabled:false});
   if(state.runtime==='isolated')await imageStore.removeRuntime();
   else if(await exists(PY))await command(PY,['-m','pip','uninstall','-y','onnxruntime','numpy','pillow'],{timeout:180000,log:true});
   probe=null;job.state='done';job.message='图像打标环境已卸载；模型、下载缓存、T5 校验和设置均已保留，可选择另一种设备安装';
  }catch(error){probe=null;job.state='failed';job.message='卸载未完成：'+error.message;append('\n'+job.message);}
 })();return {...job};
}
