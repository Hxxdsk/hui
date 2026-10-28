import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {hashFile} from './update-engine.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),manifest=JSON.parse(await fs.readFile(path.join(root,'assets/data-manifest.json'),'utf8'));
const missing=[];for(const file of manifest.files){const target=path.resolve(root,file.path);if(!target.startsWith(root+path.sep)||!/^(data\/(?:Anima-preview.csv|anima-index.json|tags.sqlite)|vendor\/anima-tagger\/models\/t5_tokenizer\/tokenizer.json)$/.test(file.path))throw new Error('非法资产路径');try{if(await hashFile(target)===file.sha256)continue;}catch(error){if(error.code!=='ENOENT')throw error;}missing.push(file);}
if(!missing.length)console.log('词库与 tokenizer 已完整配置，相同文件全部跳过。');
else{
 const cache=path.join(root,'.assets-cache');await fs.mkdir(cache,{recursive:true});const archiveFile=path.join(cache,'hui-data-v'+manifest.version+'.zip');let valid=false;try{valid=await hashFile(archiveFile)===manifest.bundle.sha256;}catch{}
 if(!valid){console.log('下载固定版本数据资产，可使用 HTTPS_PROXY 或 Node --use-env-proxy。');const response=await fetch(manifest.bundle.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw new Error('下载数据失败 HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==manifest.bundle.sha256)throw new Error('数据包 SHA256 校验失败');await fs.writeFile(archiveFile,bytes);}
 const zip=await JSZip.loadAsync(await fs.readFile(archiveFile));for(const file of missing){if(!/^(data\/(?:Anima-preview.csv|anima-index.json|tags.sqlite)|vendor\/anima-tagger\/models\/t5_tokenizer\/tokenizer.json)$/.test(file.path))throw new Error('数据清单路径无效');const entry=zip.file(file.path);if(!entry)throw new Error('数据包缺少 '+file.path);const bytes=await entry.async('nodebuffer');if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('资产校验失败 '+file.path);const target=path.join(root,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target+'.download',bytes);await fs.rename(target+'.download',target);console.log('已配置 '+file.path);}
}
