import {readFile} from 'node:fs/promises';
import https from 'node:https';
import {Readable} from 'node:stream';
const proxy=process.env.HUI_UPDATE_PROXY||process.env.https_proxy||process.env.HTTPS_PROXY;
const agent=proxy?new https.Agent({proxyEnv:{HTTPS_PROXY:proxy},keepAlive:true}):undefined;
export async function fetchUpdate(url,options={},redirects=0){
 const target=new URL(url);
 if(target.protocol!=='https:'||!['github.com','api.github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(target.hostname))throw new Error('更新来源无效');
 const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000);
 const response=agent?await new Promise((resolve,reject)=>{
  https.get(target,{agent,signal,headers:options.headers},res=>{
   const headers=new Headers();
   for(const [key,value] of Object.entries(res.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
   resolve(new Response([204,304].includes(res.statusCode)?null:Readable.toWeb(res),{status:res.statusCode,headers}));
  }).on('error',reject);
 }):await fetch(target,{...options,signal,redirect:'manual'});
 if(response.status>=300&&response.status<400){
  const next=response.headers.get('location');await response.body?.cancel();
  if(!next||redirects>=5)throw new Error('更新下载重定向异常');
  return fetchUpdate(new URL(next,target),options,redirects+1);
 }
 return response;
}
export const RELEASES_URL='https://github.com/Hxxdsk/hui/releases';
const metadata=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
export const currentVersion=metadata.version;
export const currentDisplayVersion=metadata.displayVersion||currentVersion;
let cache;
export async function checkForUpdates({fetcher=fetchUpdate,force=false}={}){
 if(!force&&fetcher===fetchUpdate&&cache&&Date.now()-cache.time<300000)return cache.value;
 let response;
 try{
  response=await fetcher('https://api.github.com/repos/Hxxdsk/hui/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'hui/'+currentVersion},signal:AbortSignal.timeout(15000),redirect:'error'});
 }catch(error){if(fetcher!==fetchUpdate)throw error;}
 if(fetcher===fetchUpdate&&(!response||[403,429].includes(response.status))){
  await response?.body?.cancel();
  const fallback=await fetcher(RELEASES_URL+'/latest/download/release-manifest.json');
  if(!fallback.ok)throw new Error('更新服务器暂时无法连接，请稍后重试');
  const manifest=await fallback.json(),version=manifest.version;
  if(manifest.schema!=='hui-release'||!/^\d+\.\d+\.\d+$/.test(version||''))throw new Error('发布清单无效');
  const names=['hui-upgrade-v'+version+'-windows-x64.zip','SHA256SUMS.txt'];
  response=Response.json({tag_name:'v'+version,name:'绘 '+version,body:'本次更新说明请查看 GitHub 发布页。',assets:names.map(name=>({name,browser_download_url:RELEASES_URL+'/download/v'+version+'/'+name}))});
 }
 if(response.status===404)return {current:currentVersion,latest:null,available:false,releasesUrl:RELEASES_URL,message:'暂未发布正式版本，可在项目 Releases 查看。'};
 if(!response.ok)throw new Error('检查更新失败（GitHub HTTP '+response.status+'），可手动打开发布页面');
 const data=await response.json(),version=String(data.tag_name||'').replace(/^v/,'');if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('发布版本号格式无效');
 const a=version.split('.').map(Number),b=currentVersion.split('.').map(Number);let available=false;for(let i=0;i<3;i++){if(a[i]!==b[i]){available=a[i]>b[i];break;}}
 const assets=(data.assets||[]).filter(asset=>typeof asset.name==='string'&&typeof asset.browser_download_url==='string'&&asset.browser_download_url.startsWith('https://github.com/Hxxdsk/hui/releases/download/')).map(asset=>({name:asset.name,url:asset.browser_download_url,size:asset.size}));
 const value={current:currentVersion,latest:version,displayVersion:typeof data.name==='string'?data.name:version,available,releasesUrl:RELEASES_URL,notes:typeof data.body==='string'?data.body.slice(0,60000):'',assets,message:available?'发现新版本':'当前已是最新正式版本'};if(fetcher===fetchUpdate)cache={time:Date.now(),value};return value;
}
