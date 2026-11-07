import {activeTagFragment, normalizeAnimaTag, parseAnimaPrompt, referenceTagKey} from './anima-core.js';
import {isEastAsianName} from './artist-directory.js';
import {parseNaiPrompt} from './nai-prompt.js';

const $ = id => document.getElementById(id);
const artistName = text => normalizeAnimaTag(text.replace(/^(?:artist:\s*|@\s*)/i, ''));
const modelExamples = {
  anima:{label:'Anima',source:'comfyui',model:'anima'},
  nai:{label:'NovelAI',source:'novelai'}
};

function loadReferenceImage(item, signal) {
  return new Promise(resolve=>{
    const img=new Image();
    const stop=()=>finish(null);
    const timer=setTimeout(stop,8500);
    function finish(result){
      clearTimeout(timer);
      signal.removeEventListener('abort',stop);
      img.onload=img.onerror=null;
      if(!result)img.removeAttribute('src');
      resolve(result);
    }
    if(signal.aborted)return stop();
    signal.addEventListener('abort',stop,{once:true});
    img.alt=item.label;img.referrerPolicy='no-referrer';
    img.onload=()=>finish(img);
    img.onerror=stop;
    img.src=item.thumbnail;
  });
}

export class TagReference {
  constructor(editor) {
    this.editor = editor;
    $('reference-search').onclick = () => this.search($('reference-query').value);
    $('reference-refresh').onclick=()=>{
      const batch=this.batch;
      if(batch)this.loadBatch(batch,batch.page+1);
    };
    $('reference-include-adult').onchange=()=>{
      const batch=this.batch;
      if(batch)this.show(batch.tag,batch.selected);
    };
    $('reference-query').onkeydown = event => {
      if(event.key === 'Enter') this.search(event.currentTarget.value);
    };
    $('artist-import').onclick = () => this.importArtists();
    $('artist-copy').onclick = async () => {
      try {
        const chain = await this.resolveArtists($('artist-chain').value);
        if(chain) editor.copy(chain.map(tag=>editor.formatTag(tag)).join(', '));
      } catch(error) { editor.toast(error.message); }
    };
    $('artist-chain').oninput = () => {
      editor.state.artistInput = $('artist-chain').value;
      editor.save();
      this.scheduleArtists();
    };
    $('artist-reference').onclick = () => {
      $('reference-query').scrollIntoView({block:'center'});
      this.search($('artist-chain').value, true);
    };
    const field=$('artist-chain');
    field.oncompositionstart=()=>{this.artistComposing=true;this.hideArtists();};
    field.oncompositionend=()=>{this.artistComposing=false;this.scheduleArtists();};
    field.onclick=()=>this.scheduleArtists();
    field.onkeydown=event=>this.artistKeys(event);
    field.onblur=()=>this.hideArtists();
  }

  hideArtists(){
    clearTimeout(this.artistTimer);
    this.artistSearchId=(this.artistSearchId||0)+1;
    this.artistMatches=[];
    $('artist-suggestions').classList.add('hidden');
    $('artist-chain').setAttribute('aria-expanded','false');
    $('artist-chain').removeAttribute('aria-activedescendant');
  }

  scheduleArtists(){
    this.hideArtists();
    if(!this.artistComposing)this.artistTimer=setTimeout(()=>this.findArtists(),140);
  }

  async findArtists(){
    const field=$('artist-chain'), editor=this.editor, id=this.artistSearchId, epoch=editor.modeEpoch;
    const value=field.value, fragment=activeTagFragment(value,field.selectionStart,field.selectionEnd);
    const lead=fragment.text.match(/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)::)?[\s{\[]*(?:artist:\s*|@\s*)?/i)[0];
    const query=fragment.text.slice(lead.length).replace(/(?:::|[}\]])+$/,'').trim();
    if(!query||query.length>160)return;
    const start=fragment.start+lead.length;
    try{
      await editor.ensureReady();
      if(id!==this.artistSearchId||epoch!==editor.modeEpoch)return;
      const matches=await editor.rpc('artists',{query,limit:12});
      if(id!==this.artistSearchId||epoch!==editor.modeEpoch||value!==field.value||document.activeElement!==field)return;
      const list=$('artist-suggestions');
      list.replaceChildren();
      this.artistFragment={start,end:start+query.length,value};
      this.artistMatches=matches;this.artistSelected=0;
      for(const [index,item] of matches.entries()){
        const button=document.createElement('button'),name=document.createElement('strong'),tag=document.createElement('small');
        button.type='button';button.id='artist-option-'+index;button.setAttribute('role','option');
        name.textContent=item.cn||artistName(item.tag);tag.textContent=artistName(item.tag);
        button.append(name,tag);
        button.onpointerdown=event=>event.preventDefault();
        button.onclick=()=>this.chooseArtist(index);
        list.append(button);
      }
      if(matches.length){
        list.classList.remove('hidden');field.setAttribute('aria-expanded','true');this.highlightArtist();
      }
    }catch(error){if(id===this.artistSearchId)editor.toast(error.message);}
  }

  highlightArtist(scroll=false){
    const options=[...$('artist-suggestions').children];
    options.forEach((item,index)=>item.setAttribute('aria-selected',String(index===this.artistSelected)));
    const active=options[this.artistSelected];
    if(active){
      $('artist-chain').setAttribute('aria-activedescendant',active.id);
      if(scroll)active.scrollIntoView({block:'nearest'});
    }
  }

  artistKeys(event){
    if(event.isComposing||this.artistComposing)return;
    if(event.key==='Escape'){this.hideArtists();return;}
    const count=this.artistMatches?.length;
    if(!count)return;
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();
      this.artistSelected=(this.artistSelected+(event.key==='ArrowDown'?1:-1)+count)%count;
      this.highlightArtist(true);
    }else if(event.key==='Enter'||event.key==='Tab'){
      event.preventDefault();this.chooseArtist(this.artistSelected);
    }
  }

  chooseArtist(index){
    const field=$('artist-chain'), item=this.artistMatches[index], part=this.artistFragment;
    if(!item||field.value!==part.value)return;
    const tag=artistName(item.tag), suffix=field.value.slice(part.end);
    field.value=field.value.slice(0,part.start)+tag+suffix+(suffix?'':', ');
    const caret=part.start+tag.length+(suffix?0:2);
    this.editor.state.artistInput=field.value;this.editor.save();
    this.hideArtists();field.focus();field.setSelectionRange(caret,caret);
  }

  reset(){
    this.hideArtists();
    this.request?.abort();
    this.batch=null;
    $('reference-refresh').disabled=true;
    $('reference-query').value = '';
    $('reference-images').replaceChildren();
    $('reference-terms').replaceChildren();
    $('reference-links').classList.add('hidden');
    $('reference-source').href='https://tags.latent.moe/zh-CN';
    $('reference-status').textContent = '输入标签，查看 Anima 与 NovelAI 的生成样例。';
    $('artist-chain').value = this.editor.state.artistInput || '';
    $('reference-gallery').href = this.editor.mode === 'nai' ? 'https://tags.gallery/en/v5' : 'https://tags.gallery/en';
  }

  async resolveArtists(raw){
    const editor=this.editor, revision=editor.editRevision;
    if(!raw.trim())throw new Error('请先输入或粘贴画师串');
    if(raw.length>4000)throw new Error('画师串请控制在 4000 字符以内');
    const parse = /::|[{}\[\]]/.test(raw) ? parseNaiPrompt : parseAnimaPrompt;
    const parts=parse(raw.replace(/\s*[+＋]\s*/g, ', '));
    if(parts.length>30)throw new Error('单次最多导入 30 个画师');
    await editor.ensureReady();
    if(revision!==editor.editRevision)return null;
    const result=[], missing=[];
    for(const part of parts){
      let name=artistName(part.text);
      if(!editor.validWeight(part.weight))throw new Error('画师权重超出当前模式的范围');
      const candidates=await editor.rpc('artists',{query:name,exact:true,limit:2});
      const canonical=candidates.find(item=>artistName(item.tag)===name);
      let info=canonical||(candidates.length===1?candidates[0]:null);
      if(!info){
        if(isEastAsianName(name)||candidates.length>1){missing.push(name);continue;}
        [info]=await editor.rpc('lookup',{tags:[name]});
        if(info?.known && info.category!==1){missing.push(name);continue;}
      }
      name=artistName(info?.tag||name);
      if(revision!==editor.editRevision)return null;
      if(name&&!result.some(item=>artistName(item.text)===name)){
        result.push({...info,text:editor.mode==='anima'?'@'+name:name,category:1,group:'画师',weight:part.weight});
      }
    }
    if(missing.length)throw new Error('这些名字未能唯一匹配画师，请选择画师候选或输入英文标签：'+missing.join('、'));
    return result;
  }

  async importArtists(){
    try{
      const chain=await this.resolveArtists($('artist-chain').value);
      if(!chain)return;
      const positive=this.editor.state.positive;
      const names=new Set(positive.filter(tag=>tag.category===1||tag.group==='画师'||tag.text.startsWith('@')).map(tag=>artistName(tag.text)));
      const added=chain.filter(tag=>!names.has(artistName(tag.text)));
      positive.push(...added);
      this.editor.state.target='positive';
      $('tag-target').value='positive';
      $('arrange-target').value='positive';
      this.editor.render();
      this.editor.toast(`已加入 ${added.length} 个画师标签`);
    }catch(error){this.editor.toast(error.message);}
  }

  async search(raw,artists=false){
    this.request?.abort();
    const controller=new AbortController();
    this.request=controller;
    const {signal}=controller, status=$('reference-status');
    this.batch=null;
    $('reference-refresh').disabled=true;
    $('reference-images').replaceChildren();
    $('reference-terms').replaceChildren();
    $('reference-links').classList.add('hidden');
    status.textContent='正在查找示例…';
    try{
      if(!raw.trim()||raw.length>4000)throw new Error('请输入标签或画师名，最多 4000 字符');
      const editor=this.editor;
      await editor.ensureReady();
      if(signal.aborted)return;
      const result=artists?await this.resolveArtists(raw):await editor.rpc('convert',{text:raw});
      if(signal.aborted||!result)return;
      const tags=[...new Set((artists?result:result.tags).map(item=>artistName(item.text)))].slice(0,12);
      if(!tags.length)throw new Error('没有找到可检索的英文标签');
      for(const tag of tags){
        const button=document.createElement('button');
        button.type='button';button.className='outline';button.textContent=tag;
        button.onclick=()=>this.show(tag,button);
        $('reference-terms').append(button);
      }
      this.show(tags[0],$('reference-terms').firstElementChild);
    }catch(error){if(!signal.aborted)status.textContent=error.message;}
  }

  show(tag,selected){
    this.request?.abort();
    const status=$('reference-status'), gallery=$('reference-images');
    for(const button of $('reference-terms').children)button.setAttribute('aria-pressed',String(button===selected));
    gallery.replaceChildren();
    const key=referenceTagKey(tag);
    if(!key){
      this.batch=null;
      $('reference-refresh').disabled=true;
      $('reference-links').classList.add('hidden');
      status.textContent='请选择单个英文标签查看样例。';
      return;
    }
    const rating=$('reference-include-adult').checked?'all':'general';
    $('reference-source').href='https://tags.latent.moe/zh-CN/t/'+encodeURIComponent(key);
    $('reference-gallery-results').href='https://latent.moe/tags/'+encodeURIComponent(key);
    const query=new URLSearchParams({tags:rating==='all'?key:key+' rating:g'});
    $('reference-danbooru-results').href='https://danbooru.donmai.us/posts?'+query;
    $('reference-aibooru-results').href='https://aibooru.online/posts?'+query;
    $('reference-links').classList.remove('hidden');
    const batch={tag,key,selected,rating,page:0,seen:new Set()};
    this.batch=batch;
    this.loadBatch(batch,1);
  }

  latentExample(key,rank,{label='生成参考',source,model}={}){
    const url=new URL('https://latent.moe/api/v1/images/resolve');
    url.search=new URLSearchParams({tag:key,size:'preview',rank:String(rank)});
    if(source)url.searchParams.set('source',source);
    if(model)url.searchParams.set('model',model);
    const original=new URL(url);original.searchParams.set('size','original');
    return {label:label+' · Latent',thumbnail:url.href,url:original.href};
  }

  async loadBatch(batch,page){
    this.request?.abort();
    const controller=new AbortController();
    this.request=controller;
    const {signal}=controller;
    const {tag,key,rating,seen}=batch;
    const gallery=$('reference-images'), status=$('reference-status'), refresh=$('reference-refresh');
    refresh.disabled=true;
    status.textContent='正在查找「'+tag+'」第 '+page+' 批图片…';
    let loaded=0;
    const add=async (item,order)=>{
      if(seen.has(item.thumbnail))return;
      const img=await loadReferenceImage(item,signal);
      if(!img||signal.aborted||seen.has(item.thumbnail))return;
      seen.add(item.thumbnail);
      if(!loaded++)gallery.replaceChildren();
      const card=document.createElement('figure'), link=document.createElement('a'), caption=document.createElement('figcaption');
      card.dataset.order=String(order);
      link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
      caption.textContent=item.label;
      link.append(img);card.append(link,caption);
      const later=[...gallery.children].find(child=>Number(child.dataset.order)>order);
      gallery.insertBefore(card,later||null);
      return true;
    };
    let unavailable=0;
    const lookup=async()=>{
      try{
        const response=await fetch('/api/tag-reference',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag:key,page,rating}),signal
        });
        if(!response.ok)throw new Error('查询失败');
        const data=await response.json();
        unavailable=data.unavailable;
        await Promise.all(data.images.map((item,index)=>add(item,index+2)));
      }catch{unavailable=2;}
    };
    const loadModels=async()=>{
      const modes=this.editor.mode==='nai'?['nai','anima']:['anima','nai'];
      const results=await Promise.all(modes.map((mode,index)=>add(this.latentExample(key,page,modelExamples[mode]),index)));
      if(!signal.aborted&&!results.some(Boolean))await add(this.latentExample(key,page),0);
    };
    await Promise.all([lookup(),loadModels()]);
    if(signal.aborted)return;
    batch.page=page;
    refresh.disabled=page>=1000;
    const preserved=!loaded&&gallery.children.length;
    status.textContent=loaded?'「'+tag+'」第 '+page+' 批 · '+loaded+' 张':
      preserved?'这一批没有可显示的新图，已保留上一批。':'未找到可显示的图片，可打开下方图库继续查看。';
    if(unavailable)status.textContent+=unavailable===2?' Danbooru 和 AIBooru 暂时无法访问。':' 部分图站暂时无法访问。';
  }
}
