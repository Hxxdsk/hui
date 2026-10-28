import {marked} from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
const $=id=>document.getElementById(id);
export class DesktopController{
 constructor({toast,save,getBusy}){
  this.toast=toast;this.save=save;this.getBusy=getBusy;this.id=crypto.randomUUID();this.current='';this.updating=false;
  const ping=()=>this.post('session/ping',{id:this.id}).catch(()=>{});this.post('session/open',{id:this.id}).catch(()=>{});this.heartbeat=setInterval(ping,5000);
  window.addEventListener('pagehide',()=>navigator.sendBeacon('/api/session/close',new Blob([JSON.stringify({id:this.id})],{type:'application/json'})));
  window.addEventListener('pageshow',ping);window.addEventListener('online',ping);
  $('check-updates').onclick=()=>this.check(true);$('update-notice-open').onclick=()=>this.show();$('update-notice-dismiss').onclick=()=>{try{sessionStorage.setItem('hui-dismissed-update',this.release?.latest||'');}catch{}$('update-notice').classList.add('hidden');};
  $('update-dialog-close').onclick=()=>$('update-dialog').close();$('update-cancel').onclick=()=>$('update-dialog').close();$('update-confirm').onclick=()=>this.confirm();
  $('install-update').onclick=()=>this.show();
  $('message-input').addEventListener('input',()=>{if(this.updating)sessionStorage.setItem('hui-update-draft',$('message-input').value);});
  fetch('/api/version').then(r=>r.json()).then(data=>{this.current=data.version;this.displayVersion=data.displayVersion||data.version;$('update-version').textContent='当前版本：'+this.displayVersion;}).catch(()=>{});
  setTimeout(()=>this.check(false),2500);this.checkTimer=setInterval(()=>this.check(false),30*60*1000);
  this.post('updates/status',{}).then(data=>{const result=data.result;if(result&&Date.now()-result.time<10*60*1000&&sessionStorage.getItem('hui-update-result')!==String(result.time)){sessionStorage.setItem('hui-update-result',String(result.time));this.toast(result.ok?'已更新到 '+(data.displayVersion||result.to||this.current)+'，对话和设置已保留':'更新未完成，已恢复原版本：'+result.error);}}).catch(()=>{});
 }
 async post(route,data){const response=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(!response.ok)throw new Error(result.error||'操作失败');return result;}
 async check(manual){if(this.checking||this.updating)return;this.checking=true;$('check-updates').disabled=true;if(manual)$('update-status').textContent='正在检查正式发布…';try{const data=await this.post('updates/check',{force:!!manual});this.release=data;$('update-status').textContent=data.message+(data.latest?' · '+(data.displayVersion||data.latest):'');$('install-update').classList.toggle('hidden',!data.available);if(data.available&&(manual||sessionStorage.getItem('hui-dismissed-update')!==data.latest)){$('update-notice-label').textContent='发现新版本 '+(data.displayVersion||data.latest);$('update-notice').classList.remove('hidden');}if(manual&&data.available)this.show();}catch(error){if(manual)$('update-status').textContent=error.message;}finally{this.checking=false;$('check-updates').disabled=false;}}
 show(){if(!this.release?.available){this.check(true);return;}if($('settings').open)$('settings').close();$('update-dialog-title').textContent='更新到 '+(this.release.displayVersion||this.release.latest);$('update-release-notes').innerHTML=DOMPurify.sanitize(marked.parse(this.release.notes||'此版本未填写更新说明。',{breaks:true}),{ALLOWED_TAGS:['p','br','strong','em','del','pre','code','ul','ol','li','h1','h2','h3','h4','hr','blockquote'],ALLOWED_ATTR:[]});$('update-progress-message').textContent='确认后自动下载、校验并更新，完成后在当前页面重启。对话、设置和已下载模型会保留。';$('update-confirm').disabled=this.updating;$('update-cancel').textContent=this.updating?'收起窗口':'暂不更新';$('update-dialog').showModal();}
 async confirm(){if(this.updating||!this.release?.available)return;if(this.getBusy())return this.toast('请先停止生成或等附件处理完成，再进行更新');this.updating=true;this.startedAt=Date.now();$('update-confirm').disabled=true;$('update-cancel').textContent='收起窗口';$('update-progress').classList.remove('hidden');try{await this.save();sessionStorage.setItem('hui-update-draft',$('message-input').value);const data=await this.post('updates/start',{version:this.release.latest});$('update-notice-label').textContent='正在更新…';$('update-notice').classList.remove('hidden');$('update-progress-message').textContent=data.message;this.poll();}catch(error){this.failed(error.message);}}
 failed(message){this.updating=false;$('update-confirm').disabled=false;$('update-progress-message').textContent=message;$('update-status').textContent=message;$('update-notice-label').textContent='更新未完成，可重试';this.toast(message);}
 async poll(){
  try{const response=await fetch('/api/version',{cache:'no-store'});if(response.ok){const version=(await response.json()).version;if(version!==this.current){location.reload();return;}}
   const data=await this.post('updates/status',{});if(data.phase==='idle'&&data.result?.time>=this.startedAt){location.reload();return;}if(data.phase==='failed'){this.failed(data.message);return;}$('update-progress-message').textContent=data.message||'正在完成更新并重启…';$('update-status').textContent=$('update-progress-message').textContent;$('update-progress').value=data.percent||0;$('update-notice-label').textContent=data.phase==='restarting'?'更新中，即将重启…':'正在下载更新…';
  }catch{$('update-progress-message').textContent='正在重启服务，请保持页面打开…';$('update-notice-label').textContent='正在重启…';}
  if(Date.now()-this.startedAt>10*60*1000){this.failed('重启耗时较长，请重新打开绘.exe；设置与对话仍保留。');return;}this.pollTimer=setTimeout(()=>this.poll(),1200);
 }
 restoreDraft(){try{const draft=sessionStorage.getItem('hui-update-draft');if(draft!==null){$('message-input').value=draft;sessionStorage.removeItem('hui-update-draft');}}catch{}}
}
