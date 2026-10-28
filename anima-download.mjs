import {open,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Uses the bundled Node runtime, including its HTTP(S) proxy support.
export async function downloadFile(url,file,{signal,onProgress=()=>{}}={}){
 const source=new URL(url);if(source.protocol!=='https:'&&!(source.protocol==='http:'&&['127.0.0.1','localhost'].includes(source.hostname)))throw new Error('下载地址必须使用 HTTPS');
 let size=await stat(file).then(s=>s.size,()=>0);
 let response=await fetch(source,{headers:size?{Range:`bytes=${size}-`}:{},signal});
 if(response.status===416){size=0;response=await fetch(source,{signal});}
 if(!response.ok)throw new Error('下载返回 HTTP '+response.status);
 const final=new URL(response.url);if(final.protocol!=='https:'&&!(final.protocol==='http:'&&['127.0.0.1','localhost'].includes(final.hostname)))throw new Error('下载重定向地址无效');
 const append=response.status===206&&size>0;
 if(append&&!response.headers.get('content-range')?.startsWith(`bytes ${size}-`))throw new Error('下载站点返回了错误的续传位置');
 if(!append)size=0;
 const total=Number(response.headers.get('content-length')||0)+size;
 const handle=await open(file,append?'a':'w');let last=0;
 try{for await(const bytes of response.body){signal?.throwIfAborted();await handle.write(bytes);size+=bytes.length;if(Date.now()-last>1000){onProgress(size,total);last=Date.now();}}}
 finally{await handle.close();}
 onProgress(size,total);return size;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await downloadFile(process.argv[2],process.argv[3],{onProgress:(size,total)=>console.log(`${total?Math.min(100,Math.floor(size/total*100))+'% · ':''}${(size/1048576).toFixed(1)} MB${total?' / '+(total/1048576).toFixed(1)+' MB':''}`)});}
 catch(error){console.error(error.message);process.exitCode=1;}
}
