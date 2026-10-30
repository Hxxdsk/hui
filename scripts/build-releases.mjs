import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {corePath,managedPath,hashFile,resourceNeedsUpdate} from './update-engine.mjs';

const project=fileURLToPath(new URL('..',import.meta.url)),release=path.join(project,'release'),root=path.join(release,'绘-便携版'),version=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8')).version;
const archive=new JSZip(),dataZip=new JSZip(),entries=[],assetEntries=[];
const names=['server.mjs','desktop-lifecycle.mjs','update-manager.mjs','update-worker.mjs','update-engine.mjs','updates.mjs','preferences.mjs','translation.mjs','anima-service.mjs','anima-image.mjs','anima-download.mjs','anima-bridge.py','install-vc-runtime.ps1','package.json','package-lock.json'];
const selected=new Set(names.map(name=>'app/'+name));
async function walk(dir,prefix,filter=()=>true){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const relative=prefix+'/'+entry.name;if(!filter(relative,entry))continue;if(entry.isDirectory())await walk(path.join(dir,entry.name),relative,filter);else if(entry.isFile())selected.add(relative);}}
for(const name of ['public','data','node_modules'])await walk(path.join(project,name),'app/'+name);
await walk(path.join(project,'vendor/anima-tagger'),'app/vendor/anima-tagger',(p,e)=>!/(^|\/)(onnxruntime(?:-[^/]+\.dist-info)?|numpy(?:\.libs|-[^/]+\.dist-info)?|PIL|pillow(?:\.libs|-[^/]+\.dist-info)?|\.hui-image-python|\.hui-image\.json(?:\.tmp)?|\.install-cache|\.pip-cache|\.hf-cache|\.work|__pycache__|pixai-tagger-v1\.0-onnx|pixai-tagger-v1\.0-original|Scripts)(\/|$)/.test(p)&&!p.endsWith('.pyc'));
for(const name of ['绘.exe','使用教程.txt','README.md','CHANGELOG.md','LICENSE','THIRD_PARTY_NOTICES.md','runtime/node.exe','runtime/LICENSE','assets/hui.ico','assets/brand.png','app/data/LICENSE-anima-prompt-tool.txt'])selected.add(name);
await walk(path.join(project,'docs'),'docs');
await fs.writeFile(path.join(root,'version.json'),JSON.stringify({name:'hui',version,repository:'Hxxdsk/hui',platform:'win32-x64'},null,2));selected.add('version.json');
for(const relative of [...selected].sort()){const file=path.join(root,...relative.split('/')),bytes=await fs.readFile(file),sha256=await hashFile(file);archive.file('绘-便携版/'+relative,bytes);if(managedPath(relative))entries.push({path:relative,size:bytes.length,sha256});if(['app/data/Anima-preview.csv','app/data/anima-index.json','app/data/tags.sqlite','app/vendor/anima-tagger/models/t5_tokenizer/tokenizer.json'].includes(relative)){const assetPath=relative.replace(/^app\//,'');dataZip.file(assetPath,bytes,{date:new Date('2026-01-01T00:00:00Z')});assetEntries.push({path:assetPath,size:bytes.length,sha256});}}
for(const name of ['data/SOURCES.md','data/DOWNLOAD-REPORT.md','data/LICENSE-Anima-preview-GPL-3.0.txt','data/sources/LICENSE-prompt-all-in-one.txt','vendor/anima-prompt-tool/LICENSE','vendor/anima-tagger/LICENSE','vendor/anima-tagger/THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md'])dataZip.file(name,await fs.readFile(path.join(project,name)),{date:new Date('2026-01-01T00:00:00Z')});
dataZip.forEach((_name,entry)=>{entry.date=new Date('2026-01-01T00:00:00Z');});
const dataName=`hui-data-v${version}.zip`,dataFile=path.join(release,dataName);await fs.writeFile(dataFile,await dataZip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
const dataHash=await hashFile(dataFile);let dataManifest={schema:'hui-data',version,bundle:{url:`https://github.com/Hxxdsk/hui/releases/download/v${version}/${dataName}`,sha256:dataHash},files:assetEntries};try{const previousData=JSON.parse(await fs.readFile(path.join(project,'assets/data-manifest.json'),'utf8'));if(previousData.bundle.sha256===dataHash)dataManifest=previousData;}catch{}await fs.writeFile(path.join(project,'assets/data-manifest.json'),JSON.stringify(dataManifest,null,2)+'\n');
let baseline;const args=process.argv.slice(2);if(args.includes('--baseline'))baseline=JSON.parse(await fs.readFile(args[args.indexOf('--baseline')+1],'utf8'));const previous=new Map((baseline?.files||[]).map(f=>[f.path,f]));
// Carry resource changes forward, so skipping a release never skips a required asset update.
for(const item of entries)item.updateResource=resourceNeedsUpdate(item,previous.get(item.path),!!baseline);
const manifest={schema:'hui-release',format:1,version,platform:'win32-x64',files:entries};const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'release-manifest.json'),manifestBytes);await fs.writeFile(path.join(release,'release-manifest.json'),manifestBytes);archive.file('绘-便携版/release-manifest.json',manifestBytes);
const updateZip=new JSZip(),files=[];
for(const item of entries){const payload=corePath(item.path)||item.updateResource;files.push({...item,payload:!!payload});if(payload)updateZip.file('payload/'+item.path,await fs.readFile(path.join(root,...item.path.split('/'))));}
files.push({path:'release-manifest.json',size:manifestBytes.length,sha256:await hashFile(path.join(root,'release-manifest.json')),payload:true});updateZip.file('payload/release-manifest.json',manifestBytes);
const remove=(baseline?.files||[]).filter(f=>!entries.some(e=>e.path===f.path)&&corePath(f.path)&&managedPath(f.path)).map(f=>({path:f.path,sha256:f.sha256}));
updateZip.file('hui-update.json',JSON.stringify({schema:'hui-update',format:1,version,minimumVersion:'2.2.0',baseline:baseline?.version||'core-only',files,remove},null,2));
const dataUpdateName=`hui-update-data-v${version}.zip`,dataUpdate=await updateZip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});await fs.writeFile(path.join(release,dataUpdateName),dataUpdate);
const upgradeZip=new JSZip();upgradeZip.file('hui-upgrade/hui-update.exe',await fs.readFile(path.join(release,'.build-tools/hui-update.exe')));upgradeZip.file('hui-upgrade/apply-update.mjs',await fs.readFile(new URL('../update-engine.mjs',import.meta.url)));upgradeZip.file('hui-upgrade/'+dataUpdateName,dataUpdate);upgradeZip.file('hui-upgrade/升级教程.txt','将本升级包解压到旧版目录以外的位置。关闭旧版绘启动器。运行 hui-update.exe，选择旧版目录，检查差异，再开始升级。\r\n相同文件跳过，API 设置、模型和词库保留。失败自动回滚，也可回滚上次升级。\r\n支持 2.2.0 及以后版本；过早版本请使用完整包和设置备份。\r\n');
const fullName=`hui-portable-v${version}-windows-x64.zip`,upgradeName=`hui-upgrade-v${version}-windows-x64.zip`;
await fs.writeFile(path.join(release,fullName),await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));await fs.copyFile(path.join(release,fullName),path.join(release,'绘-便携版-Windows-x64.zip'));
await fs.writeFile(path.join(release,upgradeName),await upgradeZip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
const artifacts=[fullName,upgradeName,dataName,'release-manifest.json'];const sums=[];for(const name of artifacts){const file=path.join(release,name);sums.push((await hashFile(file))+'  '+name);console.log(JSON.stringify({file:name,bytes:(await fs.stat(file)).size}));}await fs.writeFile(path.join(release,'SHA256SUMS.txt'),sums.join('\n')+'\n');
