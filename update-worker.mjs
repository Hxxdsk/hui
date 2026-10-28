import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1],root=path.resolve(value('--root')),parent=Number(value('--parent')),engine=path.resolve(value('--engine')),file=path.resolve(value('--package')),port=Number(value('--port'));
const allowed=path.join(root,'.hui-update','download')+path.sep;if(!engine.startsWith(allowed)||!file.startsWith(allowed)||!Number.isInteger(parent)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('升级接管参数无效');
for(let i=0;i<100;i++){let alive=true;try{process.kill(parent,0);}catch{alive=false;}if(!alive)break;if(i===99)throw new Error('旧桌面进程未退出，未开始替换');await new Promise(r=>setTimeout(r,150));}
let result;try{const {updateInstallation}=await import(pathToFileURL(engine));result={ok:true,...await updateInstallation({target:root,packagePath:file})};}catch(error){result={ok:false,error:error.message};}
await fs.writeFile(path.join(root,'.hui-update','result.json'),JSON.stringify({...result,time:Date.now()},null,2));await fs.unlink(path.join(root,'.hui-update','pending.json')).catch(()=>{});
const child=spawn(path.join(root,'绘.exe'),['--reuse-page','--port',String(port),'--cleanup-helper',process.execPath,'--helper-pid',String(process.pid)],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',async error=>{await fs.writeFile(path.join(root,'.hui-update','restart-error.txt'),error.message);});child.unref();
