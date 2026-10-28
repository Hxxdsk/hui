import fs from 'node:fs/promises';
import path from 'node:path';

export const imageDeviceName=device=>device==='cuda'?'NVIDIA 显卡':'CPU';
export function validateImageDevice(device){if(!['cpu','cuda'].includes(device))throw new Error('请选择 CPU 或 NVIDIA 显卡');return device;}
export function parseNvidiaDevices(output){
 return String(output).trim().split(/\r?\n/).flatMap(line=>{const parts=line.split(',').map(s=>s.trim()),memoryMB=Number(parts.pop()),driver=parts.pop(),name=parts.join(', ');return name&&/^\d+\.\d+/.test(driver)&&Number.isFinite(memoryMB)?[{name,driver,memoryMB}]:[];});
}
export function requireNvidia(devices){
 if(!devices?.length)throw new Error('未检测到 NVIDIA 显卡或驱动，请安装 NVIDIA 驱动后重新检查；也可选择通用 CPU 版');
 const [major,minor]=devices[0].driver.split('.').map(Number);
 if(major<570||(major===570&&minor<65))throw new Error('显卡版使用 CUDA 12.8，请将 NVIDIA Windows 驱动更新至 570.65 或更高版本');
}
export function createImageStore(root){
 root=path.resolve(root);const runtime=path.join(root,'.hui-image-python'),file=path.join(root,'.hui-image.json');
 const exists=p=>fs.access(p).then(()=>true,()=>false);
 async function read(){
  try{const data=JSON.parse(await fs.readFile(file,'utf8'));validateImageDevice(data.device);if(!['legacy','isolated'].includes(data.runtime)||typeof data.enabled!=='boolean')throw new Error('安装状态格式无效');return data;}
  catch(error){if(error.code==='ENOENT')return {device:'cpu',runtime:'legacy',enabled:true,legacy:true};throw new Error('图像安装状态无法读取：'+error.message);}
 }
 async function save(data){validateImageDevice(data.device);await fs.mkdir(root,{recursive:true});const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n');await fs.rename(temp,file);}
 async function assertRuntimeSafe(){
  const resolvedRoot=await fs.realpath(root);
  if(path.dirname(runtime)!==root||path.basename(runtime)!=='.hui-image-python')throw new Error('图像运行环境路径无效');
  if(await exists(runtime)){if((await fs.lstat(runtime)).isSymbolicLink())throw new Error('图像运行环境不能是符号链接或目录联接');const target=await fs.realpath(runtime);if(path.dirname(target)!==resolvedRoot)throw new Error('图像运行环境超出程序目录');}
 }
 async function removeRuntime(){await assertRuntimeSafe();await fs.rm(runtime,{recursive:true,force:true});}
 return {runtime,python:path.join(runtime,'python.exe'),read,save,assertRuntimeSafe,removeRuntime,hasRuntime:()=>exists(runtime)};
}
