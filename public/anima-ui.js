import { activeTagFragment, formatAnimaTag, normalizeAnimaTag, hasChinese, candidatePopoverPosition } from './anima-core.js';
import { prefixState, composePrefixedPrompt } from './prompt-prefixes.js';
import {PROMPT_CATEGORIES,promptTokens,bilingualChat} from './prompt-preview.js';
const $=id=>document.getElementById(id);
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
export class AnimaEditor {
  constructor({toast,copy,onInsert,translateTags}) {
    this.toast=toast;this.copy=copy;this.onInsert=onInsert;this.pending=new Map();this.nextId=0;this.searchVersion=0;this.selected=0;this.candidates=[];this.metadata=null;this.editIndex=-1;this.dragIndex=-1;
    this.state={positive:[],negative:[],target:'positive',nltags:'',...prefixState()};
    this.translateTags=translateTags;this.previewMetadata=new Map();this.previewFilters={positive:new Set(),negative:new Set()};this.translationPending=new Set();this.translationFailed=new Set();this.state.translations={};this.state.previewChinese=false;this.translationVersion=0;
    try {
      const cached=JSON.parse(localStorage.getItem('lantern-anima-v1')||'null');
      if(cached){for(const key of ['positive','negative'])this.state[key]=(Array.isArray(cached[key])?cached[key]:[]).filter(t=>typeof t.text==='string'&&Number.isFinite(t.weight)&&t.weight>=.1&&t.weight<=5).map(t=>({...t,text:normalizeAnimaTag(t.text)}));Object.assign(this.state,prefixState(cached));this.state.nltags=String(cached.nltags||'').slice(0,32000);this.state.translations=cached.translations&&typeof cached.translations==='object'?cached.translations:{};this.state.previewChinese=!!cached.previewChinese;}
      else {const old=JSON.parse(localStorage.getItem('lantern-tags')||'[]');if(Array.isArray(old))this.state.positive=old.filter(t=>typeof t.text==='string'&&!hasChinese(t.text)&&Number.isFinite(t.weight)&&t.weight>=.1&&t.weight<=5).map(t=>({...t,text:normalizeAnimaTag(t.text)}));}
    }catch{}
    $('anima-nltags').value=this.state.nltags;
    this.bind();this.render();
  }
  ensureReady() {
    if(this.loading)return this.loading;
    $('anima-status').textContent='正在载入 Anima 本地索引…';
    this.worker=new Worker('/anima-worker.js',{type:'module'});
    this.worker.onmessage=event=>{const task=this.pending.get(event.data.id);if(!task)return;clearTimeout(task.timer);this.pending.delete(event.data.id);event.data.error?task.reject(new Error(event.data.error)):task.resolve(event.data.result);};
    this.worker.onerror=()=>{for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(new Error('词库加载失败，请检查服务已启动并刷新页面'));}this.pending.clear();};
    this.loading=this.rpc('init').then(async meta=>{
      this.metadata=meta;$('anima-status').textContent=`${meta.tags.toLocaleString()} 个表内标签 · ${meta.chineseAliases.toLocaleString()} 条中文别名${meta.originalSqliteRows?' · 33 万扩展已启用':''}`;
      for(const target of ['positive','negative']){
        const rows=await this.rpc('lookup',{tags:this.state[target].map(t=>t.text)});
        this.state[target]=this.state[target].map((t,i)=>({...t,...rows[i],text:t.text}));
      }
      this.render();this.refreshPreviewMetadata();return meta;
    }).catch(error=>{$('anima-status').textContent=error.message;throw error;});
    return this.loading;
  }
  rpc(type,data={}) {
    return new Promise((resolve,reject)=>{const id=++this.nextId;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('本地词库处理超时，请缩短输入后重试'));},60000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,type,...data});});
  }
  save(){try{localStorage.setItem('lantern-anima-v1',JSON.stringify(this.state));}catch{this.toast('Tag 设置保存失败，请复制 Prompt 备份');}}
  translated(text){const value=this.state.translations?.[text];return typeof value==='string'?value:'';}
  async addTags(values,options={}) {
    const target=options.target||this.state.target,revision=this.editRevision||0;
    try {
      await this.ensureReady();const result=await this.rpc('convert',{text:values.join(', ')});if(revision!==(this.editRevision||0))return null;let count=0;
      for(const entry of result.tags){if(!this.state[target].some(t=>t.text===entry.text)){this.state[target].push(entry);count++;}}
      this.showMisses(result.misses);this.render();this.toast(result.misses.length?`加入 ${count} 个标签；${result.misses.length} 段中文未匹配，已保留提示`:`已加入 ${count} 个标签${count?'':'（重复项已跳过）'}`);return result;
    }catch(error){this.toast(error.message);return null;}
  }
  showMisses(misses){const box=$('unmatched-tags');box.replaceChildren();box.classList.toggle('hidden',!misses.length);if(misses.length){box.append(node('strong','','未匹配的中文 · 不进入 Prompt'),node('p','',misses.join(' / ')),node('small','','可换词检索；复杂动作请在自然语言补充区用英文表达。'));}}
  positiveOutput(){return composePrefixedPrompt(this.state.prefixes,this.state.positivePrefixes,'positive',this.state.positive.map(formatAnimaTag).join(', '),this.state.nltags);}
  negativeOutput(){return composePrefixedPrompt(this.state.prefixes,this.state.negativePrefixes,'negative',this.state.negative.map(formatAnimaTag).join(', '));}
  renderOutputs(){$('tag-output').value=this.positiveOutput();$('negative-output').value=this.negativeOutput();this.renderPromptPreviews();this.save();this.refreshPreviewMetadata();this.queueTranslations();}
  renderPrefixes(){
    const list=$('prefix-list');list.replaceChildren();
    for(const p of this.state.prefixes){const row=node('div','prefix-row');row.append(node('strong','',p.name));for(const side of ['positive','negative']){const label=node('label',''),check=node('input');check.type='checkbox';check.checked=this.state[side+'Prefixes'].includes(p.id);check.disabled=!p[side].trim();check.setAttribute('aria-label',`${p.name} · ${side==='positive'?'正面':'负面'}`);check.onchange=()=>{const key=side+'Prefixes';this.state[key]=check.checked?[...this.state[key],p.id]:this.state[key].filter(id=>id!==p.id);this.renderOutputs();};label.append(check,side==='positive'?'正面':'负面');row.append(label);}const edit=node('button','quiet','编辑');edit.setAttribute('aria-label',`编辑前缀 ${p.name}`);edit.onclick=()=>this.openPrefix(p.id);row.append(edit);list.append(row);}
    if(!this.state.prefixes.length)list.append(node('p','micro','还没有前缀方案，点击上方新增。'));
  }
  openPrefix(id=null){this.prefixEditing=id;const p=this.state.prefixes.find(p=>p.id===id);$('prefix-name').value=p?.name||'';$('prefix-positive').value=p?.positive||'';$('prefix-negative').value=p?.negative||'';$('prefix-delete').classList.toggle('hidden',!p);$('prefix-editor').returnValue='cancel';$('prefix-editor').showModal();}
  render(){
    const list=$('tag-list');list.replaceChildren();const entries=this.state[this.state.target];
    $('tag-summary').textContent=`${this.state.target==='positive'?'正向':'负向'}标签 · ${entries.length}`;
    for(const [i,t] of entries.entries()){
      const chip=node('div',`anima-tag ${t.known===false?'unverified':''}`);chip.dataset.tag=t.text;chip.dataset.index=i;
      const grip=node('button','tag-grip','⠿');grip.type='button';grip.setAttribute('aria-label',`移动 ${t.text}`);grip.title='拖动手柄排序；↑↓ 前后移动，Home / End 移到首尾';
      grip.onpointerdown=e=>this.startSort(e,chip,entries,i);
      grip.onkeydown=e=>{let next=i;if(e.key==='ArrowUp'||e.key==='ArrowLeft')next=Math.max(0,i-1);else if(e.key==='ArrowDown'||e.key==='ArrowRight')next=Math.min(entries.length-1,i+1);else if(e.key==='Home')next=0;else if(e.key==='End')next=entries.length-1;else return;e.preventDefault();const [item]=entries.splice(i,1);entries.splice(next,0,item);this.render();$('tag-list').children[next]?.querySelector('.tag-grip').focus();};
      const edit=node('button','anima-tag-edit');const cn=t.cn||this.translated(t.text)||(t.known===false?'翻译补充中…':t.group||'标签');edit.append(node('span','tag-cn',cn),node('strong','',t.text));if(t.weight!==1)edit.append(node('small','',`× ${t.weight}`));edit.title=`${t.known===false?'翻译补充 · 词库外标签':t.group||'标签'} · 点击编辑`;
      edit.onclick=()=>{this.hideCandidates();this.editIndex=i;this.editTarget=this.state.target;$('edit-tag-text').value=t.text;$('edit-tag-weight').value=t.weight;$('tag-editor').returnValue='cancel';$('tag-editor').showModal();};
      const remove=node('button','anima-tag-remove','×');remove.setAttribute('aria-label',`移除 ${t.text}`);remove.onclick=()=>{entries.splice(i,1);this.render();};chip.append(grip,edit,remove);list.append(chip);
    }
    if(!entries.length)list.append(node('p','micro','从候选窗选词，或转换上面的整段描述。'));
    this.renderPrefixes();this.renderOutputs();
  }
  renderPromptPreviews(){
    $('prompt-chinese').checked=!!this.state.previewChinese;
    for(const side of ['positive','negative']){
      const tokens=promptTokens(this.state,side,this.previewMetadata),preview=$(side+'-preview'),filters=$(side+'-filters'),available=new Set(tokens.map(t=>t.kind)),selected=this.previewFilters[side];
      for(const value of selected)if(!available.has(value))selected.delete(value);
      filters.replaceChildren();const addFilter=(kind,label)=>{const button=node('button','prompt-filter category-'+kind);if(kind!=='all')button.append(node('span','category-swatch'));button.append(document.createTextNode(label));button.type='button';button.dataset.kind=kind;button.onclick=()=>{if(kind==='all')selected.clear();else if(selected.has(kind))selected.delete(kind);else selected.add(kind);this.applyPromptFilter(side);};filters.append(button);};
      addFilter('all','全部');for(const [kind,label] of PROMPT_CATEGORIES)if(available.has(kind))addFilter(kind,label);
      preview.replaceChildren();
      for(const token of tokens){
        const section=node('span','prompt-section category-'+token.kind);section.dataset.kind=token.kind;
        const content=node('span','prompt-section-content'),chip=node('span','prompt-token'+(token.known===false?' translated-extra':''));chip.dataset.raw=token.raw;chip.dataset.source=token.source;chip.append(node('span','prompt-en',token.raw));const cn=hasChinese(token.cn||'')?token.cn:this.translated(token.text);if(this.state.previewChinese&&cn&&token.kind!=='narrative')chip.append(node('span','prompt-zh',`（${cn}）`));chip.title=token.known===false?'翻译补充 · 词库外标签':token.cn||'';content.append(chip);section.append(content);preview.append(section);
      }
      if(!tokens.length)preview.append(node('p','micro','添加标签或选择前缀后显示。'));
      preview.oncopy=e=>{const selection=getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0),tags=[],nl=[];for(const chip of preview.querySelectorAll('.prompt-token')){if(chip.closest('.is-filtered')||!range.intersectsNode(chip))continue;(chip.dataset.source==='nl'?nl:tags).push(chip.dataset.raw);}if(tags.length||nl.length){e.preventDefault();e.clipboardData.setData('text/plain',[tags.join(', '),...nl].filter(Boolean).join('\n'));}};
      preview.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();const range=document.createRange();range.selectNodeContents(preview);getSelection().removeAllRanges();getSelection().addRange(range);}};
      this.applyPromptFilter(side);
    }
  }
  startSort(event,chip,entries,index){
    if(event.button!==0)return;event.preventDefault();this.hideCandidates();
    const handle=event.currentTarget,list=$('tag-list'),target=this.state.target,start={x:event.clientX,y:event.clientY};let x=start.x,y=start.y,active=false,frame;
    handle.setPointerCapture(event.pointerId);
    const place=()=>{const others=[...list.querySelectorAll('.anima-tag')].filter(n=>n!==chip);let best=null,distance=Infinity;for(const item of others){const r=item.getBoundingClientRect(),d=Math.hypot(x-(r.left+r.width/2),y-(r.top+r.height/2));if(d<distance){best=item;distance=d;}}if(best){const r=best.getBoundingClientRect(),after=y>r.bottom||y>=r.top&&x>r.left+r.width/2,ref=after?best.nextSibling:best;if(ref!==chip&&chip.nextSibling!==ref){if(list.moveBefore)list.moveBefore(chip,ref);else{list.insertBefore(chip,ref);handle.setPointerCapture(event.pointerId);}}}};
    const scroll=()=>{if(active){const r=list.getBoundingClientRect(),panel=$('tools-panel'),pr=panel.getBoundingClientRect(),top=Math.max(r.top,pr.top),bottom=Math.min(r.bottom,pr.bottom);const speed=y<top+55?-Math.ceil((top+55-y)/5):y>bottom-55?Math.ceil((y-bottom+55)/5):0;if(speed){const scroller=list.scrollHeight>list.clientHeight+1?list:panel;scroller.scrollTop+=Math.max(-24,Math.min(24,speed));place();}}frame=requestAnimationFrame(scroll);};
    handle.onpointermove=e=>{x=e.clientX;y=e.clientY;if(!active&&Math.hypot(x-start.x,y-start.y)>5){active=true;chip.classList.add('sorting');list.classList.add('is-sorting');}if(active)place();};
    const finish=cancel=>{cancelAnimationFrame(frame);handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;handle.onlostpointercapture=null;if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);list.classList.remove('is-sorting');chip.classList.remove('sorting');if(active&&this.state.target===target&&!cancel){this.state[target]=[...list.querySelectorAll('.anima-tag')].map(n=>entries[Number(n.dataset.index)]);this.render();const moved=this.state[target].indexOf(entries[index]);$('tag-list').children[moved]?.querySelector('.tag-grip').focus({preventScroll:true});}else if(active)this.render();};
    handle.onpointerup=()=>finish(false);handle.onpointercancel=()=>finish(true);handle.onlostpointercapture=()=>finish(true);frame=requestAnimationFrame(scroll);
  }
  applyPromptFilter(side){const selected=this.previewFilters[side];for(const section of $(side+'-preview').querySelectorAll('.prompt-section')){const hidden=selected.size>0&&!selected.has(section.dataset.kind);section.classList.toggle('is-filtered',hidden);section.setAttribute('aria-hidden',String(hidden));}for(const button of $(side+'-filters').children){const active=button.dataset.kind==='all'?selected.size===0:selected.has(button.dataset.kind);button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}}
  refreshPreviewMetadata(){
    if(!this.metadata)return;
    const all=[...promptTokens(this.state,'positive'),...promptTokens(this.state,'negative')].filter(t=>t.kind!=='narrative'),names=[...new Set(all.map(t=>t.text))],signature=names.join('\0');
    if(signature===this.previewMetaSignature)return;this.previewMetaSignature=signature;
    this.rpc('lookup',{tags:names}).then(rows=>{if(signature!==this.previewMetaSignature)return;names.forEach((name,i)=>this.previewMetadata.set(name,rows[i]));this.renderPromptPreviews();this.queueTranslations();}).catch(()=>{this.previewMetaSignature='';});
  }
  translationConfigurationChanged(){this.translationVersion++;this.translationController?.abort();this.translationFailed.clear();this.queueTranslations();}
  queueTranslations(){
    clearTimeout(this.translationTimer);if(!this.metadata||!this.translateTags||this.translationRunning)return;
    const tokens=[...promptTokens(this.state,'positive',this.previewMetadata),...promptTokens(this.state,'negative',this.previewMetadata)];
    const names=[...new Set(tokens.filter(t=>t.kind!=='narrative'&&(t.known===false||this.state.previewChinese)&&!hasChinese(t.cn||'')&&!this.translated(t.text)&&!this.translationFailed.has(t.text)).map(t=>t.text))];
    if(!names.length){if(!this.translationFailed.size){$('tag-translation-status').textContent='';$('tag-translation-retry').classList.add('hidden');}return;}
    this.translationTimer=setTimeout(async()=>{
      this.translationRunning=true;const version=this.translationVersion,controller=new AbortController(),timeout=setTimeout(()=>controller.abort('timeout'),60000);this.translationController=controller;$('tag-translation-status').textContent=`正在补充 ${names.length} 个标签的中文…`;
      try{const translated=await this.translateTags(names,{signal:controller.signal});if(version!==this.translationVersion)return;this.state.translations={...this.state.translations,...translated};for(const chip of $('tag-list').querySelectorAll('[data-tag]')){const cn=translated[chip.dataset.tag];if(cn)chip.querySelector('.tag-cn').textContent=cn;}this.renderPromptPreviews();this.save();$('tag-translation-status').textContent='';$('tag-translation-retry').classList.add('hidden');}
      catch(error){if(controller.signal.aborted&&controller.signal.reason!=='timeout')return;names.forEach(name=>this.translationFailed.add(name));$('tag-translation-status').textContent=controller.signal.reason==='timeout'?'标签翻译超时，可点击重试':'中文补充未完成：'+error.message;$('tag-translation-retry').classList.remove('hidden');}
      finally{clearTimeout(timeout);this.translationRunning=false;this.queueTranslations();}
    },450);
  }
  hideCandidates(){this.searchVersion++;$('anima-candidates').classList.add('hidden');$('tag-input').setAttribute('aria-expanded','false');$('tag-input').removeAttribute('aria-activedescendant');}
  position(){const r=$('tag-input').getBoundingClientRect(),popup=$('anima-candidates'),p=candidatePopoverPosition(r,{width:innerWidth,height:innerHeight});popup.style.width=`${p.width}px`;popup.style.left=`${p.left}px`;popup.style.top=`${p.top}px`;popup.style.maxHeight=`${p.height}px`;}
  async search(){
    const field=$('tag-input');const fragment=activeTagFragment(field.value,field.selectionStart,field.selectionEnd);const version=++this.searchVersion;
    if(!fragment.text.trim()){this.hideCandidates();return;}
    if(fragment.text.length>500){this.hideCandidates();return;}
    try{
      await this.ensureReady();const matches=await this.rpc('search',{query:fragment.text,options:{group:$('anima-group').value,limit:24}});
      if(version!==this.searchVersion||document.activeElement!==field)return;
      this.fragment=fragment;this.queryValue=field.value;this.candidates=matches;this.selected=0;
      $('anima-query-label').textContent=`“${fragment.text.slice(0,18)}” · ${matches.length} 个候选`;
      const list=$('anima-candidate-list');list.replaceChildren();
      if(!matches.length)list.append(node('p','anima-no-match','没有表内匹配。试试更短的词；长句可点击「转换并加入标签」。'));
      for(const [i,item] of matches.entries()){
        const option=node('button','anima-option');option.id=`anima-option-${i}`;option.type='button';option.setAttribute('role','option');
        const main=node('div');main.append(node('strong','',item.cn||item.tag),node('span','anima-option-en',item.tag));
        const detail=node('small','',`${item.group} · ${item.source} · ${item.count.toLocaleString()}`);option.append(main,detail);
        option.onpointerdown=e=>e.preventDefault();option.onclick=()=>this.choose(i);option.onpointermove=()=>{this.selected=i;this.highlight();};list.append(option);
      }
      $('anima-candidates').classList.remove('hidden');field.setAttribute('aria-expanded','true');this.position();this.highlight(false);
    }catch(error){if(version===this.searchVersion)this.toast(error.message);}
  }
  highlight(scroll=true){const options=$('anima-candidate-list').querySelectorAll('[role=option]');options.forEach((n,i)=>{n.classList.toggle('selected',i===this.selected);n.setAttribute('aria-selected',String(i===this.selected));});if(options[this.selected]){$('tag-input').setAttribute('aria-activedescendant',options[this.selected].id);if(scroll)options[this.selected].scrollIntoView({block:'nearest'});}}
  choose(index){
    const item=this.candidates[index],field=$('tag-input');if(!item||field.value!==this.queryValue)return this.hideCandidates();
    const weight=this.fragment.weight||1;if(weight<.1||weight>5)return this.toast('标签权重需在 0.1–5 之间');
    const target=this.state[this.state.target];if(!target.some(t=>t.text===item.tag))target.push({...item,text:item.tag,weight});
    const start=this.fragment.start+item.start,end=this.fragment.start+item.end;
    const original=field.value;field.value=original.slice(0,start)+item.tag+original.slice(end);
    let caret=start+item.tag.length;
    if(end===original.length){field.value+=', ';caret+=2;}
    this.hideCandidates();this.render();field.focus();field.setSelectionRange(caret,caret);
  }
  bind(){
    let composing=false,timer;
    const schedule=()=>{clearTimeout(timer);this.hideCandidates();if(!composing)timer=setTimeout(()=>this.search(),130);};
    $('tag-input').addEventListener('compositionstart',()=>{composing=true;this.hideCandidates();});$('tag-input').addEventListener('compositionend',()=>{composing=false;schedule();});
    $('tag-input').addEventListener('input',()=>{this.showMisses([]);schedule();});$('tag-input').addEventListener('click',schedule);$('tag-input').addEventListener('focus',()=>this.ensureReady().catch(e=>this.toast(e.message)));
    $('tag-input').addEventListener('keydown',e=>{
      if(composing||e.isComposing)return;
      if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();$('split-tags').click();return;}
      if(e.key==='Escape'){e.preventDefault();clearTimeout(timer);this.hideCandidates();return;}
      const open=!$('anima-candidates').classList.contains('hidden');
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!open){e.preventDefault();this.search();return;}if(this.candidates.length){e.preventDefault();this.selected=(this.selected+(e.key==='ArrowDown'?1:-1)+this.candidates.length)%this.candidates.length;this.highlight();}return;}
      if(open&&this.candidates.length&&(e.key==='Enter'||e.key==='Tab')){e.preventDefault();this.choose(this.selected);}
    });
    $('show-candidates').onclick=()=>{$('tag-input').focus();this.search();};$('close-candidates').onclick=()=>this.hideCandidates();
    document.addEventListener('pointerdown',e=>{if(!$('anima-candidates').contains(e.target)&&e.target!==$('tag-input')&&e.target!==$('show-candidates'))this.hideCandidates();});
    window.addEventListener('resize',()=>this.hideCandidates());$('tools-panel').addEventListener('scroll',()=>this.hideCandidates());
    $('anima-group').onchange=()=>{$('tag-input').focus();this.search();};$('tag-target').onchange=()=>{this.hideCandidates();this.state.target=$('tag-target').value;this.render();};
    $('split-tags').onclick=async()=>{const value=$('tag-input').value.trim();if(!value)return this.toast('请先输入中文或英文 Prompt');if(value.length>16000)return this.toast('单次请控制在 16000 字符以内');this.hideCandidates();$('split-tags').disabled=true;try{const result=await this.addTags([value]);if(result&&!result.misses.length&&$('tag-input').value.trim()===value)$('tag-input').value='';}finally{$('split-tags').disabled=false;}};
    $('clear-tags').onclick=()=>{this.state[this.state.target]=[];this.showMisses([]);this.render();};
    $('clear-all-tags').onclick=()=>{this.editRevision=(this.editRevision||0)+1;this.hideCandidates();this.translationVersion++;this.translationController?.abort();this.translationFailed.clear();this.state.positive=[];this.state.negative=[];this.state.positivePrefixes=[];this.state.negativePrefixes=[];this.state.nltags='';this.previewFilters.positive.clear();this.previewFilters.negative.clear();$('tag-input').value='';$('anima-nltags').value='';$('tag-translation-status').textContent='';$('tag-translation-retry').classList.add('hidden');this.showMisses([]);this.render();this.toast('已清空正负向标签、输入和补充，并取消全部前缀勾选');};
    $('expand-tag-list').onclick=()=>{const expanded=$('tag-list').classList.toggle('expanded');$('expand-tag-list').textContent=expanded?'收起列表':'展开全部';$('expand-tag-list').setAttribute('aria-expanded',String(expanded));};
    $('anima-nltags').oninput=()=>{this.state.nltags=$('anima-nltags').value;this.renderOutputs();};
    $('prefix-new').onclick=()=>this.openPrefix();
    $('prefix-editor').addEventListener('close',()=>{if($('prefix-editor').returnValue!=='save')return;const p={id:this.prefixEditing||crypto.randomUUID(),name:$('prefix-name').value.trim(),positive:$('prefix-positive').value,negative:$('prefix-negative').value};if(!p.name)return;const index=this.state.prefixes.findIndex(x=>x.id===p.id);if(index<0)this.state.prefixes.push(p);else this.state.prefixes[index]=p;this.renderPrefixes();this.renderOutputs();this.toast('前缀方案已保存，已有 Tags 保持不变');});
    $('prefix-delete').onclick=()=>{const id=this.prefixEditing;this.state.prefixes=this.state.prefixes.filter(p=>p.id!==id);this.state.positivePrefixes=this.state.positivePrefixes.filter(x=>x!==id);this.state.negativePrefixes=this.state.negativePrefixes.filter(x=>x!==id);$('prefix-editor').close('cancel');this.renderPrefixes();this.renderOutputs();};
    $('copy-tags').onclick=()=>this.copy(this.positiveOutput());$('copy-negative').onclick=()=>this.copy(this.negativeOutput());$('tags-to-chat').onclick=()=>this.onInsert(bilingualChat(this.positiveOutput(),this.negativeOutput()));
    $('prompt-chinese').onchange=()=>{this.state.previewChinese=$('prompt-chinese').checked;this.renderOutputs();};$('tag-translation-retry').onclick=()=>{this.translationFailed.clear();this.queueTranslations();};
    $('tag-editor').addEventListener('close',async()=>{
      const index=this.editIndex,target=this.editTarget;this.editIndex=-1;if($('tag-editor').returnValue!=='save'||index<0)return;
      const text=$('edit-tag-text').value.trim(),weight=Number($('edit-tag-weight').value);if(!text||hasChinese(text)||weight<.1||weight>5)return this.toast('编辑时请输入英文标签；中文请在检索框中选词');
      try{await this.ensureReady();const [info]=await this.rpc('lookup',{tags:[text]});if(this.state[target].some((t,i)=>i!==index&&t.text===info.tag))return this.toast('该标签已存在');this.state[target][index]={...info,text:info.tag,weight};this.render();}catch(e){this.toast(e.message);}
    });
    $('delete-tag').onclick=()=>{if(this.editIndex>=0)this.state[this.editTarget].splice(this.editIndex,1);$('tag-editor').close('cancel');this.render();};
  }
}
