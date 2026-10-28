const $=id=>document.getElementById(id);
export class AnimaSkill {
 constructor({getConfig,toast}){this.getConfig=getConfig;this.toast=toast;this.busy=false;
  $('tagger-install-validator').onclick=()=>this.install('validator');$('tagger-install-image').onclick=()=>this.install('image');$('tagger-install-runtime').onclick=()=>this.install('runtime');$('tagger-refresh').onclick=()=>this.refresh(true);$('tagger-cancel').onclick=async()=>{await this.api('cancel',{});await this.refresh();};
 }
 async api(route,data,signal){const response=await fetch('/api/anima/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'技能操作失败');return result;}
 fillSettings(){const c=this.getConfig();$('tagger-enabled').checked=!!c.taggerEnabled;$('tagger-mode').value=c.taggerMode||'auto';$('tagger-local-images').checked=c.taggerLocalImages!==false;this.refresh().catch(e=>{$('tagger-status').textContent=e.message;});}
 readSettings(){return {taggerEnabled:$('tagger-enabled').checked,taggerMode:$('tagger-mode').value,taggerLocalImages:$('tagger-local-images').checked};}
 syncBadge(){const on=!!this.getConfig().taggerEnabled;$('skill-badge').classList.toggle('hidden',!on);}
 async refresh(full=false){
  clearTimeout(this.timer);const status=await this.api('status',{refresh:full});const job=status.job||{};this.busy=job.state==='running';
  $('tagger-skill-state').textContent=status.skill?'已内置':'缺少文件';$('tagger-validator-state').textContent=status.validator?'已就绪':'未安装';$('tagger-image-state').textContent=status.image?'已就绪':'未安装';
  $('tagger-status').textContent=this.busy?job.message:job.state==='failed'?job.message:job.state==='done'?job.message:(status.errors?.[0]||'文字技能无需安装；精确校验和本地图像打标分别检查。');
  for(const id of ['tagger-install-validator','tagger-install-image','tagger-install-runtime','tagger-refresh'])$(id).disabled=this.busy;
  $('tagger-cancel').classList.toggle('hidden',!this.busy||(job.kind==='runtime'&&job.message==='等待 Windows 安装授权'));$('tagger-install-log').textContent=job.log||'';$('tagger-progress').classList.toggle('hidden',!this.busy);
  if(this.busy)this.timer=setTimeout(()=>this.refresh().catch(e=>{$('tagger-status').textContent=e.message;}),1500);
  return status;
 }
 async install(kind){try{$('tagger-status').textContent='正在创建安装任务…';await this.api('install',{kind,proxy:$('tagger-proxy').value.trim(),mirror:$('tagger-mirror').value});await this.refresh();}catch(e){this.toast(e.message);}}
 async prepare(messages,signal){
  const c=this.getConfig();if(!c.taggerEnabled)return null;
  const user=messages.findLast(m=>m.role==='user'),images=(user?.files||[]).filter(f=>f.type==='image').map(f=>f.data),data={mode:c.taggerMode,text:user?.text||'',images,localImages:c.taggerLocalImages};
  // Local image assistance waits for completion; only the user's signal can cancel it.
  if(images.length&&data.localImages)return this.api('context',data,signal);
  const local=new AbortController(),timer=setTimeout(()=>local.abort(),3000);
  try{return await this.api('context',data,AbortSignal.any([signal,local.signal]));}
  catch(error){if(signal.aborted)throw error;const fallback=await this.api('context',{...data,images:[],localImages:false},AbortSignal.any([signal,AbortSignal.timeout(3000)]));if(images.length)fallback.notice='本地辅助未及时完成，图片已直接交给对话模型分析';return fallback;}
  finally{clearTimeout(timer);}
 }
 async validate(text,mode,signal){return this.api('validate',{text,mode},signal);}
}
