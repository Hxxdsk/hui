import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function createPreferencesStore(file=fileURLToPath(new URL('./user-data/settings.json',import.meta.url))){
 if(file instanceof URL)file=fileURLToPath(file);
 let queue=Promise.resolve();
 return {
  async load(){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw new Error('本机设置无法读取，请从备份恢复');}},
  save(data){
   if(!data||!data.config||Array.isArray(data.config)||typeof data.config!=='object'||JSON.stringify(data).length>2000000)throw new Error('设置格式无效');
   const secrets={chatKey:String(data.credentials?.chatKey||'').slice(0,16384),translation:{}};
   for(const name of ['key','ak','sk','sessionToken','deeplKey'])secrets.translation[name]=String(data.credentials?.translation?.[name]||'').slice(0,16384);
   const saved=JSON.stringify({version:1,config:data.config,credentials:secrets});
   const operation=queue.catch(()=>{}).then(async()=>{await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,saved,{mode:0o600});await rename(temp,file);return {ok:true};});
   queue=operation;return operation;
  }
 };
}
