import {readFile} from 'node:fs/promises';
export const RELEASES_URL='https://github.com/Hxxdsk/hui/releases';
export const currentVersion=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8')).version;
let cache;
export async function checkForUpdates({fetcher=fetch,force=false}={}){
 if(!force&&fetcher===fetch&&cache&&Date.now()-cache.time<300000)return cache.value;
 const response=await fetcher('https://api.github.com/repos/Hxxdsk/hui/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'hui/'+currentVersion},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(response.status===404)return {current:currentVersion,latest:null,available:false,releasesUrl:RELEASES_URL,message:'暂未发布正式版本，可在项目 Releases 查看。'};
 if(!response.ok)throw new Error('检查更新失败（GitHub HTTP '+response.status+'），可手动打开发布页面');
 const data=await response.json(),version=String(data.tag_name||'').replace(/^v/,'');if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('发布版本号格式无效');
 const a=version.split('.').map(Number),b=currentVersion.split('.').map(Number);let available=false;for(let i=0;i<3;i++){if(a[i]!==b[i]){available=a[i]>b[i];break;}}
 const assets=(data.assets||[]).filter(asset=>typeof asset.name==='string'&&typeof asset.browser_download_url==='string'&&asset.browser_download_url.startsWith('https://github.com/Hxxdsk/hui/releases/download/')).map(asset=>({name:asset.name,url:asset.browser_download_url,size:asset.size}));
 const value={current:currentVersion,latest:version,available,releasesUrl:RELEASES_URL,notes:typeof data.body==='string'?data.body.slice(0,60000):'',assets,message:available?'发现新版本':'当前已是最新正式版本'};if(fetcher===fetch)cache={time:Date.now(),value};return value;
}
