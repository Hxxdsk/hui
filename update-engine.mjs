import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const CORE_ROOTS=new Set(['绘.exe','hui-update.exe','apply-update.mjs','version.json','release-manifest.json','使用教程.txt','readme.md','changelog.md','license','third_party_notices.md']);
export function managedPath(value){
 if(typeof value!=='string'||!value||value.length>240||value.includes('\\')||value.startsWith('/')||value.includes(':'))return false;
 const parts=value.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/[\x00-\x1f<>"|?*]/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))return false;
 const p=value.toLowerCase();if(/(^|\/)(user-data|\.git|\.env[^/]*|\.hui-update|\.work|\.hf-cache|\.pip-cache|\.install-cache|__pycache__)(\/|$)/.test(p)||p==='app/data/user_dict.json'||/\/models\/pixai[^/]*(\/|$)/.test(p))return false;
 return CORE_ROOTS.has(p)||/^(assets|docs|updater|runtime)\//.test(p)||/^app\/(public|data|node_modules|vendor\/anima-tagger)\//.test(p)||/^app\/[a-z0-9_-]+\.(mjs|py|ps1|json)$/.test(p);
}
export const corePath=p=>!/^runtime\/|^app\/(?:data|node_modules|vendor\/anima-tagger\/(?:\.hui-python|models))\//i.test(p);
export const resourceNeedsUpdate=(item,previous,hasBaseline)=>!corePath(item.path)&&!!(previous?.updateResource||(hasBaseline&&(!previous||previous.sha256!==item.sha256)));
const exists=p=>fs.access(p).then(()=>true,()=>false);
const sourceRoots=new Set();
const installedPath=(root,p)=>path.join(root,...(sourceRoots.has(root)?p.replace(/^app\//,''):p).split('/'));
export async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1;}return 0;}
async function safeTarget(root,relative){
 if(!managedPath(relative))throw new Error('升级包包含受保护或非法路径：'+relative);
 let current=root;for(const part of (sourceRoots.has(root)?relative.replace(/^app\//,''):relative).split('/')){current=path.join(current,part);try{const entry=await fs.lstat(current);if(entry.isSymbolicLink())throw new Error('不能通过符号链接或目录联接更新：'+relative);}catch(e){if(e.code!=='ENOENT')throw e;}}
 return installedPath(root,relative);
}
async function ensureRoot(target){const root=await fs.realpath(path.resolve(target));if(!await exists(path.join(root,'app/server.mjs'))&&await exists(path.join(root,'server.mjs')))sourceRoots.add(root);for(const p of ['绘.exe','runtime/node.exe','app/server.mjs','app/package.json'])if(!await exists(installedPath(root,p)))throw new Error('请选择完整旧版便携目录（包含 绘.exe、app、runtime）');return root;}
export async function isAppRunning(root){
 if(process.platform!=='win32')return false;
 const script="$ErrorActionPreference='Stop';$r=$env:HUI_UPDATE_TARGET.TrimEnd('\\');$exe=Join-Path $r '绘.exe';$node=Join-Path $r 'runtime\\node.exe';$app=Join-Path $r 'app\\server.mjs';$hit=Get-CimInstance Win32_Process | Where-Object { ($_.ExecutablePath -eq $exe) -or ($_.Name -eq 'node.exe' -and $_.ProcessId -ne [int]$env:HUI_UPDATER_PID -and ($_.ExecutablePath -eq $node -or ($_.CommandLine -and $_.CommandLine.IndexOf($app,[StringComparison]::OrdinalIgnoreCase) -ge 0))) };if($hit){exit 10}else{exit 0}";
 return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,env:{...process.env,HUI_UPDATE_TARGET:root,HUI_UPDATER_PID:String(process.pid)},stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(new Error('检查运行中的程序超时，请关闭绘后重试'));},12000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code===0||code===10)resolve(code===10);else reject(new Error('无法确认旧程序是否已关闭，未执行更新'));});});
}
async function loadZip(file,root){
 let JSZip;try{JSZip=createRequire(installedPath(root,'app/package.json'))('jszip');}catch{JSZip=createRequire(import.meta.url)('jszip');}
 const info=await fs.stat(file);if(info.size>1024**3)throw new Error('升级包过大，请使用完整安装包');
 const zip=await JSZip.loadAsync(await fs.readFile(file));const entry=zip.file('hui-update.json');if(!entry)throw new Error('不是绘升级包，缺少 hui-update.json');
 const text=await entry.async('string');if(text.length>4*1024**2)throw new Error('升级清单过大');const manifest=JSON.parse(text);
 if(manifest.schema!=='hui-update'||manifest.format!==1||!/^\d+\.\d+\.\d+$/.test(manifest.version)||!/^\d+\.\d+\.\d+$/.test(manifest.minimumVersion)||!Array.isArray(manifest.files)||manifest.files.length>20000)throw new Error('升级清单格式无效');
 const seen=new Set();let total=0;
 for(const item of manifest.files){if(!managedPath(item.path)||seen.has(item.path.toLowerCase())||!Number.isSafeInteger(item.size)||item.size<0||item.size>512*1024**2||!/^[a-f0-9]{64}$/.test(item.sha256)||typeof item.payload!=='boolean')throw new Error('升级清单含重复、非法路径或校验值');seen.add(item.path.toLowerCase());if(item.payload){total+=item.size;const payload=zip.file('payload/'+item.path);if(!payload||(Number(payload.unixPermissions)&0xf000)===0xa000)throw new Error('升级包文件缺失或含符号链接：'+item.path);}}
 if(total>1024**3)throw new Error('升级包解压后过大');
 for(const item of manifest.remove||[])if(!managedPath(item.path)||!corePath(item.path)||!/^[a-f0-9]{64}$/.test(item.sha256)||seen.has(item.path.toLowerCase()))throw new Error('非法的旧文件移除清单');
 return {zip,manifest};
}
async function inspect(root,file){
 const {zip,manifest}=await loadZip(file,root),installed=JSON.parse(await fs.readFile(installedPath(root,'app/package.json'),'utf8')).version;
 if(!/^\d+\.\d+\.\d+$/.test(installed)||compare(installed,manifest.minimumVersion)<0)throw new Error('此版本过旧，请使用完整便携包并导入设置备份');
 if(compare(installed,manifest.version)>0)throw new Error('不能用旧升级包降级当前程序');
 const changes=[],removals=[];let unchanged=0,preserved=0;
 for(const item of manifest.files){const dest=await safeTarget(root,item.path);if(!item.payload){preserved++;continue;}const present=await exists(dest);if(present&&(await fs.stat(dest)).size===item.size&&await hashFile(dest)===item.sha256){unchanged++;continue;}changes.push({...item,existed:present,oldHash:present?await hashFile(dest):null});}
 for(const item of manifest.remove||[]){const dest=await safeTarget(root,item.path);if(await exists(dest)&&await hashFile(dest)===item.sha256)removals.push({...item,existed:true,oldHash:item.sha256,remove:true});}
 return {zip,manifest,changes,removals,summary:{from:installed,to:manifest.version,replace:changes.filter(f=>f.existed).length,add:changes.filter(f=>!f.existed).length,remove:removals.length,unchanged,preserved,bytes:changes.reduce((n,f)=>n+f.size,0),paths:[...changes,...removals].map(f=>f.path)}};
}
async function atomicWrite(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.hui-'+randomUUID()+'.tmp';try{await fs.writeFile(temp,data);await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}}
async function recover(root,journalFile){
 const journal=JSON.parse(await fs.readFile(journalFile,'utf8'));if(journal.schema!=='hui-update-journal'||!Array.isArray(journal.operations))throw new Error('回滚记录无效');
 const folder=path.dirname(journalFile);
 for(const item of [...journal.operations].reverse()){
  const dest=await safeTarget(root,item.path),backup=path.join(folder,'backup',...item.path.split('/'));
  if(item.existed){if(await exists(dest)&&await hashFile(dest)===item.oldHash)continue;if(!await exists(backup))throw new Error('回滚文件缺失：'+item.path);if(await hashFile(backup)!==item.oldHash)throw new Error('回滚文件校验失败：'+item.path);await atomicWrite(dest,await fs.readFile(backup));}
  else await fs.unlink(dest).catch(e=>{if(e.code!=='ENOENT')throw e;});
 }
 journal.state='rolled-back';await atomicWrite(journalFile,JSON.stringify(journal,null,2));return {rolledBack:true,version:journal.from};
}
export async function updateInstallation({target,packagePath,planOnly=false,rollback=false,onProgress=()=>{},checkRunning=isAppRunning,beforeWrite}={}){
 const root=await ensureRoot(target);if(await checkRunning(root))throw new Error('请先关闭目标目录的绘启动器和服务，再执行升级');
 const work=path.join(root,'.hui-update');await fs.mkdir(work,{recursive:true});if((await fs.lstat(work)).isSymbolicLink())throw new Error('升级工作目录不能是符号链接');
 const lockFile=path.join(work,'update.lock');let lock;try{lock=await fs.open(lockFile,'wx');await lock.writeFile(String(process.pid));}catch(error){if(error.code==='EEXIST')throw new Error('另一个升级任务正在运行，或上次异常退出；确认升级器已退出后移除 .hui-update/update.lock 再重试');throw error;}
 try{
  const lastFile=path.join(work,'last.json');let previous;if(await exists(lastFile)){previous=JSON.parse(await fs.readFile(lastFile,'utf8'));if(!/^[a-zA-Z0-9-]+$/.test(previous.id))throw new Error('升级记录无效');const journalFile=path.join(work,previous.id,'journal.json');const journal=JSON.parse(await fs.readFile(journalFile,'utf8'));if(rollback||journal.state==='applying'){if(planOnly)return {needsRecovery:true};return await recover(root,journalFile);}}
  else if(rollback)throw new Error('没有可以回滚的升级记录');
  const plan=await inspect(root,packagePath);if(planOnly||(!plan.changes.length&&!plan.removals.length))return plan.summary;
  const id='v'+plan.manifest.version.replaceAll('.','-')+'-'+randomUUID(),folder=path.join(work,id),operations=[];
  await fs.mkdir(path.join(folder,'stage'),{recursive:true});
  for(const [index,item] of plan.changes.entries()){onProgress({phase:'校验与暂存',current:index,total:plan.changes.length,path:item.path});const bytes=await plan.zip.file('payload/'+item.path).async('nodebuffer');if(bytes.length!==item.size||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('升级文件校验失败，尚未替换程序：'+item.path);const stage=path.join(folder,'stage',...item.path.split('/'));await fs.mkdir(path.dirname(stage),{recursive:true});await fs.writeFile(stage,bytes);}
  for(const item of [...plan.changes,...plan.removals]){const dest=await safeTarget(root,item.path);if(item.existed){if(await hashFile(dest)!==item.oldHash)throw new Error('文件在检查后发生变化，请重新检查：'+item.path);const backup=path.join(folder,'backup',...item.path.split('/'));await fs.mkdir(path.dirname(backup),{recursive:true});await fs.copyFile(dest,backup);}operations.push(item);}
  if(await checkRunning(root))throw new Error('检测到绘已重新启动，未执行替换，请关闭后重试');
  const journalFile=path.join(folder,'journal.json'),journal={schema:'hui-update-journal',state:'applying',from:plan.summary.from,to:plan.summary.to,operations};
  await atomicWrite(journalFile,JSON.stringify(journal,null,2));await atomicWrite(lastFile,JSON.stringify({id}));
  try{for(const [index,item] of operations.entries()){onProgress({phase:'更新文件',current:index,total:operations.length,path:item.path});await beforeWrite?.(item,index);const dest=await safeTarget(root,item.path);if(item.remove)await fs.unlink(dest);else await atomicWrite(dest,await fs.readFile(path.join(folder,'stage',...item.path.split('/'))));}journal.state='complete';await atomicWrite(journalFile,JSON.stringify(journal,null,2));}
  catch(error){try{await recover(root,journalFile);}catch(recovery){throw new Error(error.message+'；自动回滚未完成：'+recovery.message+'。请勿删除 .hui-update 备份。');}throw new Error(error.message+'；已自动回滚，旧版仍可使用');}
  // Stage contains only copied update files, never downloaded models or user settings.
  onProgress({phase:'完成',current:operations.length,total:operations.length});return {...plan.summary,backup:folder};
 }finally{await lock.close();await fs.unlink(lockFile).catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);const value=key=>args[args.indexOf(key)+1];
 try{if(!args.includes('--target'))throw new Error('缺少 --target 旧版目录');const result=await updateInstallation({target:value('--target'),packagePath:args.includes('--package')?value('--package'):undefined,planOnly:args.includes('--plan'),rollback:args.includes('--rollback'),onProgress:p=>process.stderr.write(JSON.stringify(p)+'\n')});process.stdout.write(JSON.stringify({ok:true,...result}));}
 catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}
