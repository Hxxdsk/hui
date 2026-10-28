import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import JSZip from 'jszip';
import {checkForUpdates,currentVersion} from './updates.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
export function createUpdateManager({root=process.env.HUI_INSTALL_ROOT||here,managed=process.env.HUI_MANAGED==='1',check=checkForUpdates,fetcher=fetch,onReady=()=>{}}={}){
 root=path.resolve(root);let state={phase:'idle',message:'',version:currentVersion,percent:0},controller;
 const work=path.join(root,'.hui-update');
 const publicState=()=>({...state,managed});
 async function download(url,file,expected){
  if(!url.startsWith('https://github.com/Hxxdsk/hui/releases/download/'))throw new Error('更新下载地址无效');
  const response=await fetcher(url,{signal:controller.signal,redirect:'follow'});if(!response.ok)throw new Error('下载升级失败 HTTP '+response.status);
  const chunks=[],hash=createHash('sha256'),total=Number(response.headers.get('content-length'))||0;let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>512*1024**2)throw new Error('升级包过大');chunks.push(chunk);hash.update(chunk);state.percent=total?Math.min(85,Math.round(bytes/total*85)):0;state.message='正在下载更新 · '+Math.round(bytes/1024)+' KB';}
  if(hash.digest('hex')!==expected)throw new Error('更新包 SHA256 校验失败，原程序未修改');const result=Buffer.concat(chunks);await fs.writeFile(file,result);return result;
 }
 async function perform(expectedVersion){
  try{
   const release=await check({force:true});if(!release.available||release.latest!==expectedVersion)throw new Error('版本信息已变化，请重新检查更新');
   const asset=release.assets.find(a=>a.name===`hui-upgrade-v${release.latest}-windows-x64.zip`),sums=release.assets.find(a=>a.name==='SHA256SUMS.txt');if(!asset||!sums)throw new Error('该版本缺少完整升级资产，请稍后重试');
   state.version=release.latest;state.phase='downloading';
   const sumResponse=await fetcher(sums.url,{signal:controller.signal});if(!sumResponse.ok)throw new Error('无法下载发布校验清单');const sumText=await sumResponse.text();const expected=sumText.split(/\r?\n/).map(l=>l.trim().split(/\s+/)).find(parts=>parts[1]===asset.name)?.[0];if(!/^[a-f0-9]{64}$/i.test(expected||''))throw new Error('发布校验清单缺少升级包 SHA256');
   const stage=path.join(work,'download','v'+release.latest+'-'+randomUUID());await fs.mkdir(stage,{recursive:true});
   const zip=await JSZip.loadAsync(await download(asset.url,path.join(stage,'upgrade.zip'),expected));const names=Object.keys(zip.files);const engine=names.find(n=>n==='hui-upgrade/apply-update.mjs'),payload=names.find(n=>n===`hui-upgrade/hui-update-data-v${release.latest}.zip`);if(!engine||!payload)throw new Error('升级包结构不完整');
   const engineFile=path.join(stage,'apply-update.mjs'),dataFile=path.join(stage,'update-data.zip'),dataBytes=await zip.file(payload).async('nodebuffer'),inner=await JSZip.loadAsync(dataBytes),manifestEntry=inner.file('hui-update.json');if(!manifestEntry)throw new Error('升级数据缺少清单');const manifest=JSON.parse(await manifestEntry.async('string'));if(manifest.schema!=='hui-update'||manifest.version!==release.latest)throw new Error('升级数据版本与发布信息不一致，未关闭原程序');await fs.writeFile(engineFile,await zip.file(engine).async('nodebuffer'));await fs.writeFile(dataFile,dataBytes);
   const pending={schema:'hui-desktop-update',version:release.latest,port:Number(process.env.PORT||3210),engine:path.relative(root,engineFile).split(path.sep).join('/'),package:path.relative(root,dataFile).split(path.sep).join('/')};
   const temp=path.join(work,'pending.tmp');await fs.writeFile(temp,JSON.stringify(pending));await fs.rename(temp,path.join(work,'pending.json'));
   state={...state,phase:'restarting',percent:100,message:'校验完成，正在更新并重启，请保持页面打开…'};onReady();
  }catch(error){state={...state,phase:'failed',message:error.message,percent:0};}
 }
 return {status:publicState,busy:()=>['checking','downloading','restarting'].includes(state.phase),start(version){if(!managed)throw new Error('请通过新版绘.exe 启动，网页内更新需要桌面进程管理');if(this.busy())return publicState();if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('更新版本号无效');controller=new AbortController();controller.signal.addEventListener('abort',()=>{}, {once:true});state={phase:'checking',message:'正在确认正式发布…',version,percent:0};const timeout=setTimeout(()=>controller.abort(),300000);perform(version).finally(()=>clearTimeout(timeout));return publicState();},async result(){try{return JSON.parse(await fs.readFile(path.join(work,'result.json'),'utf8'));}catch{return null;}},dispose(){controller?.abort();}};
}
