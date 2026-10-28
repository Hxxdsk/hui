import {DesktopController} from './desktop-ui.js';
import {encodeBackup,decodeBackup} from './settings-backup.js';
import {composeRequest,appendRequestInstructions,requestPlan} from './request-prompts.js';
import {AnimaSkill} from './anima-skill-ui.js';
import {loadSettings,persistSettings} from './settings-store.js';
import { consumeCompletion, trimContext, messageContent, splitTags, estimateTokens } from './core.js';
import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import { AnimaEditor } from './anima-ui.js';
import { TranslationPanel } from './translation-ui.js';
const $ = id => document.getElementById(id);
const defaults = { baseUrl: '', model: '', temperature: 0.8, maxTokens: 4096, contextBudget: 32000, autoContinue: 1, stream: true, sendTemperature: true, tokenField: 'max_tokens', preset: 'assistant', system: '你是一位细致、可靠的中文助手。根据用户任务给出清晰、具体的回答。', extra: '', tail:'', systemEnabled:true, extraEnabled:true, tailEnabled:false, translationSeparate: false, translationUrl: '', translationModel: '', translationService: '', translationRegion: 'cn-north-1', translationDelay: 800, translationRealtime: true };
Object.assign(defaults,{taggerEnabled:false,taggerMode:'auto',taggerLocalImages:true});
Object.assign(defaults,{continuePrompt:'请紧接上一条回复的末尾继续，不要重复已输出内容，也不要重新开头。',promptProfiles:[],promptProfile:''});
let config = { ...defaults }, key = '', chats = [], activeId = null, pendingFiles = [], busy = false, uploading = 0, controller, db, animaEditor, translator,animaSkill;
try { config = { ...defaults, ...JSON.parse(localStorage.getItem('lantern-settings') || '{}') }; } catch {}
if(!config.translationService) config.translationService=config.translationSeparate?'openai':'follow';
const presets = {
  assistant: {title:'直接回答',system:'根据用户明确的任务直接给出具体、完整的回答，保持事实与推测的区分。',extra:'优先完成当前任务；缺少信息时明确必要的假设。',tail:''},
  writer: {title:'长文续写',system:'根据用户提供的文本和写作要求完成创作，遵循指定的视角、文风和格式。',extra:'承接已有内容，保留关键细节，避免重复开头或无必要的总结。',tail:'从正文开始。续写时紧接上一段末尾，不重复已经输出的内容。'},
  structured: {title:'严格格式',system:'严格按照用户指定的数据结构和字段生成结果。',extra:'仅输出用户要求的内容，不添加开场白、代码围栏或额外解释。',tail:'检查输出结构完整，保留用户指定的字段名与顺序。'},
  artist: {title:'绘图提示词',system:'把视觉描述转换为精确的英文绘图 tags，使用 Anima 语法。',extra:'小写、空格、英文逗号分隔；保留 score_9 和权重，画师使用 @ 前缀。',tail:'仅输出整理后的 Prompt。'}
};
delete config.role;
const escapeName = value => String(value || '').slice(0, 200);
function element(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
let toastTimer;
function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200); }
function current() { return chats.find(c => c.id === activeId); }
function setComposerCollapsed(collapsed){$('composer-wrap').classList.toggle('is-collapsed',collapsed);$('composer-content').inert=collapsed;$('composer-toggle').textContent=collapsed?'展开输入框 ↑':'收起输入框 ↓';$('composer-toggle').setAttribute('aria-expanded',String(!collapsed));try{localStorage.setItem('hui-composer-collapsed',String(collapsed));}catch{}}
function sizeComposer(height){const value=Math.max(68,Math.min(height,Math.min(600,innerHeight*.6)));$('message-input').style.height=value+'px';$('composer-resize').setAttribute('aria-valuenow',String(Math.round(value)));try{localStorage.setItem('hui-composer-height',String(value));}catch{}}
$('composer-toggle').onclick=()=>setComposerCollapsed(!$('composer-wrap').classList.contains('is-collapsed'));
$('composer-resize').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const handle=e.currentTarget,startY=e.clientY,height=$('composer-wrap').classList.contains('is-collapsed')?68:$('message-input').getBoundingClientRect().height;handle.setPointerCapture(e.pointerId);$('composer-wrap').classList.add('is-resizing');handle.onpointermove=event=>{const next=height+startY-event.clientY;setComposerCollapsed(next<38);if(next>=38)sizeComposer(next);};const end=()=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;handle.onlostpointercapture=null;if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);$('composer-wrap').classList.remove('is-resizing');};handle.onpointerup=end;handle.onpointercancel=end;handle.onlostpointercapture=end;};
$('composer-resize').onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setComposerCollapsed(false);sizeComposer($('message-input').getBoundingClientRect().height+(e.key==='ArrowUp'?24:-24));}};
try{const height=Number(localStorage.getItem('hui-composer-height'));if(height)sizeComposer(height);setComposerCollapsed(localStorage.getItem('hui-composer-collapsed')==='true');}catch{}
window.addEventListener('resize',()=>{if($('message-input').style.height)sizeComposer(parseFloat($('message-input').style.height));});
let renameChatId=null;
$('rename-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const title=$('rename-title').value.trim();
  if(!title){$('rename-error').textContent='请输入对话名称';$('rename-title').focus();return;}
  if([...title].length>80){$('rename-error').textContent='名称最多 80 个字';return;}
  const chat=chats.find(c=>c.id===renameChatId);if(!chat){$('rename-dialog').close();return;}
  chat.title=title;chat.titleLocked=true;await persist(chat);renderHistory();
  if(chat.id===activeId)$('chat-title').textContent=chat.title;
  $('rename-dialog').close();toast('已重命名');
});
$('rename-cancel').onclick=()=>$('rename-dialog').close();
function connectionStatus(label, connected = false) { $('connection-badge').classList.toggle('connected',connected); $('connection-badge').replaceChildren(element('i'), document.createTextNode(label)); }
function database() { return new Promise((resolve, reject) => { const request = indexedDB.open('lantern-local', 1); request.onupgradeneeded = () => request.result.createObjectStore('chats', { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function persist(chat = current()) {
  if (!chat || !db) return;
  try { await new Promise((resolve, reject) => { const tx = db.transaction('chats', 'readwrite'); tx.objectStore('chats').put(structuredClone(chat)); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  catch { toast('记录保存失败，浏览器空间可能不足；请导出备份'); }
}
async function loadChats() { db = await database(); chats = await new Promise((resolve, reject) => { const request = db.transaction('chats').objectStore('chats').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); chats.sort((a,b) => b.updated - a.updated); }
function saveConfig() { try { localStorage.setItem('lantern-settings', JSON.stringify(config)); } catch {}const operation=translator?persistSettings({config,credentials:{chatKey:key,translation:translator.secrets}}):Promise.resolve();operation.catch(e=>toast(e.message));return operation; }
function syncBadges() { $('preset-label').textContent = presets[config.preset]?.title || '自定义预设'; translator?.syncBadge();animaSkill?.syncBadge(); }
function newChat() {
  if (busy || uploading) return toast('请先停止生成或等待附件读取完成');
  setComposerCollapsed(false);
  const chat = { id: crypto.randomUUID(), title: '新对话', updated: Date.now(), messages: [] }; chats.unshift(chat); activeId = chat.id; pendingFiles = []; $('message-input').value = ''; $('generation-info').textContent = ''; renderAll(); persist(chat); $('message-input').focus();
}
function renderHistory() {
  const filter = $('history-search').value.toLowerCase(); $('history').replaceChildren();
  const filtered = [...chats].sort((a,b) => b.updated - a.updated).filter(c => c.title.toLowerCase().includes(filter));
  if (!filtered.length) $('history').append(element('p', 'empty-history', '还没有匹配的对话'));
  for (const chat of filtered) {
    const row = element('div', `history-item ${chat.id === activeId ? 'active' : ''}`);
    const select = element('button', '', `▱  ${chat.title}`); select.title = chat.title;
    select.onclick = () => { if (busy || uploading) return toast('请先停止生成或等待附件读取完成'); activeId = chat.id; toolTab('chat'); pendingFiles = []; $('generation-info').textContent = ''; renderAll(); };
    const rename = element('button', 'rename-chat', '✎'); rename.title = '重命名'; rename.setAttribute('aria-label', `重命名 ${chat.title}`);
    rename.onclick = () => { renameChatId=chat.id; $('rename-title').value=chat.title; $('rename-error').textContent=''; $('rename-dialog').showModal(); $('rename-title').focus(); $('rename-title').select(); };
    const del = element('button', 'delete-chat', '×'); del.title = '删除此对话'; del.setAttribute('aria-label', `删除 ${chat.title}`);
    del.onclick = async () => { if (busy || uploading) return toast('请先停止生成或等待附件读取完成'); if (!confirm(`删除「${chat.title}」？此操作无法撤销。`)) return; chats = chats.filter(c => c.id !== chat.id); if (db) { const tx = db.transaction('chats', 'readwrite'); tx.objectStore('chats').delete(chat.id); } if (activeId === chat.id) { activeId = chats[0]?.id; pendingFiles = []; } if (!activeId) newChat(); else renderAll(); };
    row.append(select, rename, del); $('history').append(row);
  }
}
function welcome() {
 const wrap=element('div','welcome');wrap.append(element('div','welcome-seal','绘'),element('h2','','开始对话'),element('p','','配置 API 后选择模型。图片和文件可直接拖入页面。'));
 const cards=element('div','welcome-cards');for(const [label,desc,action] of [['连接模型','设置地址、Key 与模型',()=>openSettings()],['请求提示词','指令组合与生成参数',()=>openSettings('prompts')],['翻译','中英互译、短语定位',()=>toolTab('translate')],['Tag 编辑','中文选词、权重与前缀',()=>toolTab('tags')]]){const b=element('button','welcome-card');b.append(element('strong','',label),element('span','',desc));b.onclick=action;cards.append(b);}wrap.append(cards);$('messages').append(wrap);
}
function renderMessage(message, index) {
  const row = element('article', `message ${message.role}`); row.dataset.id = message.id;
  row.append(element('div', 'avatar', message.role === 'user' ? '你' : '绘'));
  const body = element('div', 'message-body'), meta = element('div', 'message-meta'); meta.append(element('span', '', message.role === 'user' ? '你' : (message.model || '助手')));
  if (message.reason && !['stop','generating'].includes(message.reason)) meta.append(element('span', 'finish-label', ({ length: '达到长度上限', content_filter: '服务商过滤', interrupted: '连接中断', cancelled: '已停止', error: '生成失败', tool_calls: '模型请求了工具（未配置）' })[message.reason] || message.reason));
  body.append(meta, element('div', 'message-text', message.text || (message.reason === 'generating' ? '…' : '（没有文本内容）')));
  if (message.role === 'assistant' && message.reason !== 'generating' && message.text) {
    body.querySelector('.message-text').innerHTML = DOMPurify.sanitize(marked.parse(message.text, { breaks:true }), { ALLOWED_TAGS:['p','br','strong','em','del','blockquote','pre','code','ul','ol','li','h1','h2','h3','h4','hr','table','thead','tbody','tr','th','td','a'], ALLOWED_ATTR:['href','title','start'] });
    body.querySelector('.message-text').classList.add('markdown');
  }
  if(message.skill&&message.reason!=='generating'){
    const result=message.skill.validation,report=element('div','skill-report '+(result?.passed?'passed':'pending'));
    const label={create:'创作',expand:'扩写',reverse:'反推'}[message.skill.mode]||'提示词';
    const count=result?.tokens?.count,limit=result?.tokens?.limit_enforced?` / ${result.tokens.limit}`:'';
    report.append(element('strong','',`Anima · ${label}${Number.isFinite(count)?` · T5 ${count}${limit}`:''} · ${result?.passed?'校验通过':result?.available===false?'未校验':'待修正'}`));
    if(message.skill.notice)report.append(element('p','',message.skill.notice));
    if(result?.problems?.length){report.append(element('p','',result.problems.slice(0,4).join('；')));const repair=element('button','quiet','填入修正要求 →');repair.onclick=()=>insertChat('请按 anima-tagger 规范修正以下提示词，保留用户明确的画面锚点。校验问题：'+result.problems.join('；')+'\n\n'+message.text);report.append(repair);}
    if(result?.final_tags?.length){const transfer=element('button','quiet','送入 Tag 编辑器 →');transfer.onclick=async()=>{await animaEditor.addTags(result.final_tags);if(result.nl){animaEditor.state.nltags=[animaEditor.state.nltags,result.nl].filter(Boolean).join('\n');$('anima-nltags').value=animaEditor.state.nltags;animaEditor.save();animaEditor.render();}toolTab('tags');};report.append(transfer);}
    body.append(report);
  }
  for (const file of message.files || []) { if (file.type === 'image') { const img = element('img', 'message-image'); img.src = file.data; img.alt = file.name; img.loading = 'lazy'; body.append(img); } else body.append(element('span', 'file-badge', `▱ ${file.name}`)); }
  const actions = element('div', 'message-actions'); const copy = element('button', '', '复制'); copy.onclick = () => copyText(message.text); actions.append(copy);
  const translate = element('button', '', '翻译此段'); translate.onclick = () => { showTools(); toolTab('translate'); translator.useText(message.text); }; actions.append(translate);
  if (message.role === 'assistant' && index === current().messages.length - 1) { const retry = element('button', '', '重新生成'); retry.onclick = () => generate('retry'); actions.append(retry); }
  body.append(actions); row.append(body); return row;
}
function renderMessages() { const nearBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 140; $('messages').replaceChildren(); const chat = current(); if (!chat?.messages.length) { welcome(); $('messages').scrollTop = 0; return; } chat.messages.forEach((m,i) => $('messages').append(renderMessage(m,i))); if (nearBottom || busy) $('messages').scrollTop = $('messages').scrollHeight; }
function renderAttachments() { $('attachments').replaceChildren(); for (const [index, file] of pendingFiles.entries()) { const chip = element('div', 'attachment'); if (file.type === 'image') { const img = element('img'); img.src = file.data; img.alt = file.name; chip.append(img); } chip.append(element('span', '', file.name)); const remove = element('button', '', '×'); remove.title = '移除附件'; remove.disabled = busy; remove.onclick = () => { pendingFiles.splice(index,1); renderAttachments(); }; chip.append(remove); $('attachments').append(chip); } $('file-count').textContent = pendingFiles.length ? `${pendingFiles.length} 个附件` : ''; }
function renderAll() { $('chat-title').textContent = current()?.title || '新对话'; renderHistory(); renderMessages(); renderAttachments(); syncBadges(); }
function setBusy(value) { busy = value; $('send').classList.toggle('hidden',value); $('stop').classList.toggle('hidden',!value); $('message-input').disabled = value; $('upload').disabled = value; $('continue').disabled = value; $('chat-model').disabled = value; $('send').disabled = value || uploading > 0; renderAttachments(); }
function credentials() {
  const c = { baseUrl:config.baseUrl, key, model:config.model };
  if (!c.baseUrl.trim()) throw new Error('请先在设置中填写 API 基础地址');
  if (!c.model.trim()) throw new Error('请先检测并选择模型，或手动填写模型 ID');
  return c;
}
async function requestChat(c, payload, signal) { return fetch('/api/chat', { method:'POST', headers: { 'Content-Type':'application/json' }, body:JSON.stringify({ ...c, payload }), signal }); }
async function generate(mode = 'send') {
  if(desktop.updating)return toast('正在更新并准备重启，请更新完成后再发送');
  if (busy || uploading) return toast('请等待当前操作完成');
  let c; try { c = credentials(); } catch (e) { toast(e.message); openSettings('connection'); return; }
  const chat = current(); if (!chat) return;
  if (mode === 'send') {
    const text = $('message-input').value.trim(); if (!text && !pendingFiles.length) return;
    chat.messages.push({ id: crypto.randomUUID(), role:'user', text, files:pendingFiles }); pendingFiles = []; $('message-input').value = '';
    if (!chat.titleLocked && chat.messages.filter(m => m.role === 'user').length === 1) chat.title = (text || chat.messages[0].files?.[0]?.name || '图片对话').slice(0,28);
  } else if (!chat.messages.length || chat.messages.at(-1).role !== 'assistant') return toast('请先发送消息并获得回复');
  if (mode === 'retry') chat.messages.pop();
  const answer = mode === 'continue' ? chat.messages.at(-1) : { id:crypto.randomUUID(), role:'assistant', text:'', model:c.model, reason:'generating' };
  if (mode !== 'continue') chat.messages.push(answer);
  controller = new AbortController();
  chat.updated = Date.now(); setBusy(true);renderHistory();$('chat-title').textContent=chat.title;
  if(mode==='send'){if($('messages').querySelector('.welcome'))$('messages').replaceChildren();$('messages').append(renderMessage(chat.messages.at(-2),chat.messages.length-2),renderMessage(answer,chat.messages.length-1));}
  else renderMessages();
  $('messages').scrollTop=$('messages').scrollHeight;void persist(chat);
  let count = 0, continueRequest = mode === 'continue';
  try {
    if(config.taggerEnabled)$('generation-info').textContent=config.taggerLocalImages&&chat.messages.findLast(m=>m.role==='user')?.files?.some(f=>f.type==='image')?'本地 PixAI 图像辅助处理中，请等待完成；可点击停止生成取消…':'正在准备 anima-tagger 技能…';
    const skillContext=await animaSkill.prepare(chat.messages,controller.signal);
    if(skillContext)answer.skill={mode:skillContext.mode,notice:skillContext.notice};else delete answer.skill;
    do {
      controller.signal.throwIfAborted();
      let wire = chat.messages.filter(m => m.id !== answer.id || continueRequest).map(m => ({ role:m.role, content:messageContent(m) }));
      wire = composeRequest(wire,{...config,tailEnabled:false});
      if(skillContext){if(wire[0]?.role==='system')wire[0].content+='\n\n'+skillContext.prompt;else wire.unshift({role:'system',content:skillContext.prompt});}
      const suffix=[];
      if(config.tailEnabled && config.tail?.trim())suffix.push({role:'user',content:config.tail.trim()});
      if (continueRequest) suffix.push({ role:'user', content:config.continuePrompt||defaults.continuePrompt });
      const suffixTokens=estimateTokens(suffix);
      const context = trimContext(wire, config.contextBudget - config.maxTokens - suffixTokens);
      context.messages=appendRequestInstructions(context.messages,suffix.map(m=>m.content));context.tokens=estimateTokens(context.messages);
      if (context.tokens > config.contextBudget - config.maxTokens) throw new Error('系统提示词或最新消息超出上下文预算，请减少附件/提示词，或调大预算');
      $('generation-info').textContent = `已发送，等待模型回复 · 输入约 ${context.tokens.toLocaleString()} tokens${context.removed ? ` · 已移除 ${context.removed} 轮较早历史` : ''}${count ? ` · 第 ${count} 次续写` : ''}`;
      const payload = { model:c.model, messages:context.messages, stream:config.stream, [config.tokenField]:config.maxTokens };
      if (config.sendTemperature) payload.temperature = config.temperature;
      answer.reason = 'generating';
      const response = await requestChat(c,payload,controller.signal);
      if (response.ok) connectionStatus('接口已连通',true);
      let frame = false;
      const completion = await consumeCompletion(response, text => { answer.text += text; if (!frame) { frame = true; requestAnimationFrame(() => { frame = false; if (answer.reason !== 'generating') return; const node = [...$('messages').querySelectorAll('.message')].find(n => n.dataset.id === answer.id); if (node) node.querySelector('.message-text').textContent = answer.text; $('messages').scrollTop = $('messages').scrollHeight; }); } });
      answer.reason = completion.reason; answer.usage = completion.usage;
      if (!completion.received) { if (answer.reason === 'stop') answer.reason = 'empty'; toast('模型未返回文本；请检查模型类型或服务商响应'); }
      await persist(chat); renderMessages();
      if (completion.reason !== 'length' || !completion.received || count >= config.autoContinue) break;
      continueRequest = true; count++;
    } while (!controller.signal.aborted);
    if(skillContext&&answer.reason==='stop'&&answer.text){$('generation-info').textContent='正在进行 Anima 精确校验…';try{answer.skill.validation=await animaSkill.validate(answer.text,skillContext.mode,controller.signal);}catch(error){if(controller.signal.aborted)throw error;answer.skill.validation={available:false,problems:[error.message]};}}
    const states = { stop:'回复完成', length:'达到输出上限，可点击「接着写」', content_filter:'服务商过滤了输出，请调整请求', interrupted:'连接提前结束，已保留收到的内容，可手动续写', empty:'模型没有返回文本', tool_calls:'此模型请求了工具，当前未配置工具' };
    $('generation-info').textContent = `${states[answer.reason] || '生成结束'}${answer.usage?.total_tokens ? ` · 本次 ${answer.usage.total_tokens} tokens` : ''}${count ? ` · 已续写 ${count} 次` : ''}`;
  } catch (error) { answer.reason = controller.signal.aborted ? 'cancelled' : 'error'; $('generation-info').textContent = controller.signal.aborted ? '已停止，已保留生成内容' : error.message; if (!controller.signal.aborted) toast(error.message); }
  finally { setBusy(false); renderAll(); await persist(chat); }
}
async function detectModels(translation = false) {
  const button = $(translation ? 'detect-translation' : 'detect-models'); button.disabled = true; button.textContent = '检测中…';
  try {
    const response = await fetch('/api/models', { method:'POST', headers: { 'Content-Type':'application/json' }, body:JSON.stringify({ baseUrl:$(translation ? 'translation-url':'base-url').value, key:$(translation ? 'translation-key':'api-key').value }), signal:AbortSignal.timeout(30000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    const list = $(translation ? 'translation-model-list':'model-list'); list.replaceChildren();
    for (const model of data.models.sort()) { const option = element('option'); option.value = model; list.append(option); }
    const field = $(translation ? 'translation-model':'settings-model'); if (!field.value && data.models.length) field.value = data.models[0];
    autoSaveApi();
    const info = data.models.length ? `已读取 ${data.models.length} 个模型；请保存后开始对话` : '接口已连接，但未返回模型列表，可手动填写 ID';
    if (!translation) $('detect-status').textContent = info; toast(info);
    if (!translation) connectionStatus('接口已连通',true);
  } catch (error) { const msg = error.name === 'TimeoutError' ? '检测超时，请检查网址或网络' : error.message; if (!translation) $('detect-status').textContent = msg; toast(msg); }
  finally { button.disabled = false; button.textContent = translation ? '检测翻译模型' : '检测模型列表'; }
}
function settingsTab(name) { document.querySelectorAll('[data-settings]').forEach(b => b.classList.toggle('active',b.dataset.settings === name)); document.querySelectorAll('[data-settings-panel]').forEach(s => s.classList.toggle('hidden',s.dataset.settingsPanel !== name)); }
function openSettings(tab = 'connection') {
  $('base-url').value = config.baseUrl; $('api-key').value = key; $('settings-model').value = config.model;
  $('temperature').value = config.temperature; $('max-tokens').value = config.maxTokens; $('context-budget').value = config.contextBudget; $('auto-continue').value = config.autoContinue;
  $('stream-enabled').checked = config.stream; $('send-temperature').checked = config.sendTemperature; $('token-field').value = config.tokenField;
  $('preset-select').value = config.preset; $('system-prompt').value = config.system; $('extra-prompt').value = config.extra;
  for(const field of ['system','extra','tail']) $(field+'-enabled').checked=config[field+'Enabled']!==false; $('tail-prompt').value=config.tail||'';
  translator.fillSettings();
  animaSkill.fillSettings();
  $('continue-prompt').value=config.continuePrompt||defaults.continuePrompt;renderRequestProfiles();
  settingsTab(tab); if (!$('settings').open) $('settings').showModal();
}
function applyPreset(name) { const preset = presets[name]; if (preset) { $('system-prompt').value = preset.system; $('extra-prompt').value = preset.extra; $('tail-prompt').value=preset.tail||''; $('tail-enabled').checked=!!preset.tail; } }
function requestFields(){return {system:$('system-prompt').value,extra:$('extra-prompt').value,tail:$('tail-prompt').value,systemEnabled:$('system-enabled').checked,extraEnabled:$('extra-enabled').checked,tailEnabled:$('tail-enabled').checked,continuePrompt:$('continue-prompt').value||defaults.continuePrompt};}
function renderRequestProfiles(){const select=$('request-profile-select');select.replaceChildren(element('option','','当前自定义'));select.firstChild.value='';if(!Array.isArray(config.promptProfiles))config.promptProfiles=[];for(const profile of config.promptProfiles){const option=element('option','',profile.name);option.value=profile.id;select.append(option);}select.value=config.promptProfile||'';$('request-profile-name').value=config.promptProfiles.find(p=>p.id===config.promptProfile)?.name||'';}
function applyRequestProfile(){const id=$('request-profile-select').value,profile=config.promptProfiles.find(p=>p.id===id);config.promptProfile=id;if(profile){for(const field of ['system','extra','tail','continue'])$(field+'-prompt').value=profile[field==='continue'?'continuePrompt':field]||'';for(const field of ['system','extra','tail'])$(field+'-enabled').checked=profile[field+'Enabled']!==false;Object.assign(config,requestFields(),{preset:'custom'});$('preset-select').value='custom';}$('request-profile-name').value=profile?.name||'';saveConfig();syncBadges();}
function saveRequestProfile(){const name=$('request-profile-name').value.trim();if(!name)return toast('请填写方案名称');if(config.promptProfiles.length>=50&&!config.promptProfile)return toast('最多保存 50 个方案');const id=config.promptProfile||crypto.randomUUID(),profile={id,name:name.slice(0,60),...requestFields()},at=config.promptProfiles.findIndex(p=>p.id===id);if(at<0)config.promptProfiles.push(profile);else config.promptProfiles[at]=profile;config.promptProfile=id;Object.assign(config,requestFields(),{preset:'custom'});$('preset-select').value='custom';saveConfig();renderRequestProfiles();syncBadges();toast('方案已保存并应用');}
function readSettings() {
  const numbers = { temperature:Number($('temperature').value), maxTokens:Number($('max-tokens').value), contextBudget:Number($('context-budget').value), autoContinue:Number($('auto-continue').value) };
  if (!Number.isFinite(numbers.temperature) || numbers.temperature < 0 || numbers.temperature > 2) throw new Error('Temperature 需为 0–2');
  if (!Number.isInteger(numbers.maxTokens) || numbers.maxTokens < 64 || numbers.maxTokens > 131072) throw new Error('回复上限需为 64–131072 的整数');
  if (!Number.isInteger(numbers.contextBudget) || numbers.contextBudget < 2048 || numbers.contextBudget > 2000000 || numbers.contextBudget <= numbers.maxTokens + 512) throw new Error('上下文预算需大于回复上限至少 512 tokens，且在 2048–2000000 之间');
  if (!Number.isInteger(numbers.autoContinue) || numbers.autoContinue < 0 || numbers.autoContinue > 5) throw new Error('自动续写次数需为 0–5 的整数');
  for (const id of ['base-url']) if ($(id).value.trim()) { const url = new URL($(id).value); if (!['https:','http:'].includes(url.protocol)) throw new Error('API 地址必须为 http 或 https'); }
  return { ...numbers, baseUrl:$('base-url').value.trim(), model:$('settings-model').value.trim(), stream:$('stream-enabled').checked, sendTemperature:$('send-temperature').checked, tokenField:$('token-field').value, preset:$('preset-select').value, ...requestFields(),promptProfiles:config.promptProfiles,promptProfile:config.promptProfile,...translator.readSettings(), ...animaSkill.readSettings() };
}
async function saveSettings() {
  if (busy) return toast('请在对话生成结束后保存设置');
  try { const next = readSettings(); if (next.baseUrl !== config.baseUrl || key !== $('api-key').value.trim()) connectionStatus(next.baseUrl ? '待验证' : '待连接'); config = next; key = $('api-key').value.trim(); translator.commitSettings();await saveConfig();animaEditor.translationConfigurationChanged();$('chat-model').value = config.model; syncBadges(); $('settings').close(); toast('设置和 API 凭据已保存'); } catch (e) { toast(e.message); }
}
async function filesSelected(files) {
  if (busy) return toast('请先停止生成');
  setComposerCollapsed(false);
  uploading++; $('send').disabled = true;
  try {
    for (const file of files) {
      if (pendingFiles.length >= 8) { toast('每条消息最多 8 个附件'); break; }
      if (file.size > 15 * 1024 * 1024) { toast(`${file.name} 超过 15 MB，已跳过`); continue; }
      if (pendingFiles.reduce((s,f) => s + (f.size || 0),0) + file.size > 24 * 1024 * 1024) { toast('附件总大小不能超过 24 MB'); continue; }
      try {
        if (['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) {
          const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
          pendingFiles.push({ type:'image', name:file.name, size:file.size, data });
        } else if (/\.(pdf|docx)$/i.test(file.name)) {
          const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
          toast(`正在提取 ${file.name}…`);
          const response = await fetch('/api/extract', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ name:file.name,data }) });
          const result = await response.json(); if (!response.ok) throw new Error(result.error);
          pendingFiles.push({ type:'text', name:file.name, size:file.size, text:result.text });
        } else if (/\.(txt|md|csv|json|js|ts|py|html|css|xml|ya?ml|log)$/i.test(file.name) || file.type.startsWith('text/')) {
          const text = await file.text(); if (text.length > 180000) throw new Error('文字超过 18 万字符，请拆分');
          pendingFiles.push({ type:'text', name:file.name, size:file.size,text });
        } else throw new Error('不支持该文件格式，请上传图片、PDF、DOCX 或文本');
      } catch (e) { toast(`${file.name}：${e.message || '文件读取失败'}`); }
      renderAttachments();
    }
  } finally { uploading--; $('send').disabled = uploading > 0 || busy; $('file-input').value = ''; }
}
function toolTab(name) {
 document.querySelector('.workspace').dataset.view=name;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
 $('translate-panel').classList.toggle('hidden',name!=='translate');$('tags-panel').classList.toggle('hidden',name!=='tags');$('tool-title').textContent=name==='tags'?'Tag 编辑':'翻译';$('translator-settings').classList.toggle('hidden',name==='tags');
 if(name==='tags')animaEditor.ensureReady().catch(e=>toast(e.message));else animaEditor?.hideCandidates();
}
function showTools(){toolTab('translate');}
function insertChat(text){if(!text)return toast('没有可发送的内容');$('message-input').value+=($('message-input').value?'\n':'')+text;toolTab('chat');setComposerCollapsed(false);$('message-input').focus();}
function addTags(values) { return animaEditor.addTags(values); }
async function copyText(text) { if (!text) return toast('暂无可复制的内容'); try { await navigator.clipboard.writeText(text); toast('已复制'); } catch { toast('复制失败，请手动选择文字复制'); } }
function download(name,data) { const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); const a = element('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function validatedChat(raw) {
  if (!Array.isArray(raw.messages) || raw.messages.length > 10000) throw new Error('对话格式不正确');
  const messages = raw.messages.map(m => {
    if (!['user','assistant'].includes(m.role) || typeof m.text !== 'string') throw new Error('消息格式不正确');
    const files = (Array.isArray(m.files) ? m.files : []).slice(0,8).map(f => {
      if (f.type === 'image' && typeof f.data === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(f.data)) return { type:'image',name:escapeName(f.name),data:f.data };
      if (f.type === 'text' && typeof f.text === 'string') return { type:'text',name:escapeName(f.name),text:f.text.slice(0,180000) };
      throw new Error('导入文件含不支持的附件');
    });
    return { id:crypto.randomUUID(),role:m.role,text:m.text,files,model:escapeName(m.model),reason:escapeName(m.reason) || 'stop' };
  });
  return { id:crypto.randomUUID(),title:escapeName(raw.title) || '导入对话',titleLocked:raw.titleLocked===true,messages,updated:Date.now() };
}
$('new-chat').onclick = () => {toolTab('chat');newChat();}; $('history-search').oninput = renderHistory;
$('send').onclick = () => generate(); $('continue').onclick = () => generate('continue'); $('stop').onclick = () => controller?.abort();
$('message-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); generate(); } };
document.addEventListener('keydown',e => { if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newChat(); } });
$('open-settings').onclick = $('quick-connect').onclick = () => openSettings(); $('prompt-shortcut').onclick = () => openSettings('prompts'); $('translator-settings').onclick = () => openSettings('translation');
document.querySelectorAll('[data-settings]').forEach(b => b.onclick = () => settingsTab(b.dataset.settings));
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => toolTab(b.dataset.view));
const desktop=new DesktopController({toast,getBusy:()=>busy||uploading>0,save:async()=>{await saveConfig();await persist();animaEditor.save();}});
$('save-settings').onclick = saveSettings; $('detect-models').onclick = () => detectModels(); $('detect-translation').onclick = () => detectModels(true);
$('preset-select').onchange = () => applyPreset($('preset-select').value);
$('request-profile-select').onchange=applyRequestProfile;$('request-profile-save').onclick=saveRequestProfile;
$('request-profile-delete').onclick=()=>{config.promptProfiles=config.promptProfiles.filter(p=>p.id!==config.promptProfile);config.promptProfile='';saveConfig();renderRequestProfiles();};
$('request-plan-preview').onclick=()=>{$('request-plan-output').textContent=requestPlan(requestFields());$('request-plan-dialog').showModal();};$('request-plan-close').onclick=()=>$('request-plan-dialog').close();
for (const id of ['system-prompt','extra-prompt','tail-prompt']) $(id).oninput = () => $('preset-select').value = 'custom';
$('chat-model').value = config.model; $('chat-model').onchange = () => { config.model = $('chat-model').value.trim(); saveConfig(); };
$('toggle-tools').onclick = () => toolTab('translate');
$('upload').onclick = () => $('file-input').click(); $('file-input').onchange = e => filesSelected(e.target.files);
let fileDragDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();fileDragDepth++;$('page-drop').classList.remove('hidden');}});
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
document.addEventListener('dragleave',()=>{if(--fileDragDepth<=0){fileDragDepth=0;$('page-drop').classList.add('hidden');}});
document.addEventListener('drop',e=>{if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();fileDragDepth=0;$('page-drop').classList.add('hidden');if(e.dataTransfer.files.length){toolTab('chat');filesSelected([...e.dataTransfer.files]);}});
window.addEventListener('blur',()=>{fileDragDepth=0;$('page-drop').classList.add('hidden');});
$('message-input').addEventListener('paste',e => { const images = [...e.clipboardData.items].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()); if (images.length) { e.preventDefault(); filesSelected(images); } });
$('export-chat').onclick = () => { if (current()) download(`绘-${current().title.replace(/[\\/:*?"<>|]/g,'_')}.json`, { version:1,...current() }); };
$('import-chat').onclick = () => $('history-file').click();
$('history-file').onchange = async e => { if (busy || uploading) return toast('请先完成当前操作'); const file = e.target.files[0]; if (!file) return; try { if (file.size > 32 * 1024 * 1024) throw new Error('导入文件不能超过 32 MB'); const chat = validatedChat(JSON.parse(await file.text())); chats.unshift(chat); activeId = chat.id; pendingFiles = []; await persist(chat); renderAll(); toast('对话已导入'); } catch (e) { toast(e.message); } finally { $('history-file').value = ''; } };
$('import-preset').onclick = () => $('preset-file').click();
$('export-preset').onclick = () => download('绘-请求提示词.json',{version:3,...requestFields()});
$('preset-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('预设不能超过 1 MB');const raw=JSON.parse(await file.text());if(!['system','extra','tail'].some(k=>typeof raw[k]==='string'))throw new Error('未识别到请求提示词');for(const field of ['system','extra','tail']){$(field+'-prompt').value=String(raw[field]||'');if(typeof raw[field+'Enabled']==='boolean')$(field+'-enabled').checked=raw[field+'Enabled'];}$('continue-prompt').value=String(raw.continuePrompt||defaults.continuePrompt);$('preset-select').value='custom';toast('已载入，保存后生效');}catch(error){toast(error.message);}finally{e.target.value='';}};
translator = new TranslationPanel({getConfig:()=>config,getChatCredentials:()=>credentials(),requestChat,toast,copy:copyText,onPreference:update=>{Object.assign(config,update);saveConfig();},onSettings:()=>openSettings('translation'),onAddTags:values=>addTags(values),onShowTags:()=>{showTools();toolTab('tags');}});
animaEditor = new AnimaEditor({toast,copy:copyText,onInsert:insertChat,translateTags:(tags,options)=>translator.translateTags(tags,options)});
animaSkill = new AnimaSkill({getConfig:()=>config,toast});
const apiFields={'base-url':'baseUrl','settings-model':'model','translation-url':'translationUrl','translation-model':'translationModel','translation-service':'translationService','volc-region':'translationRegion'};
const secretFields={'translation-key':'key','volc-ak':'ak','volc-sk':'sk','volc-session-token':'sessionToken','deepl-key':'deeplKey'};
function autoSaveApi(){
  for(const [id,field] of Object.entries(apiFields))config[field]=$(id).value.trim();
  config.translationRegion||='cn-north-1';config.translationSeparate=config.translationService==='openai';key=$('api-key').value.trim();
  for(const [id,field] of Object.entries(secretFields))translator.secrets[field]=$(id).value.trim();
  translator.cancel();translator.cache.clear();translator.syncBadge();animaEditor.translationConfigurationChanged();$('chat-model').value=config.model;
  $('settings-message').textContent='正在自动保存 API…';saveConfig().then(()=>$('settings-message').textContent='API 已自动保存；其他设置点击保存生效。').catch(()=>{});
}
for(const id of [...Object.keys(apiFields),...Object.keys(secretFields),'api-key'])$(id).addEventListener($(id).tagName==='SELECT'?'change':'input',autoSaveApi);
document.addEventListener('translation-credentials-filled',autoSaveApi);
document.querySelector('.workspace').dataset.view='chat';
$('translation-to-chat').onclick=()=>insertChat(translator.result?.translation);
$('backup-open').onclick=()=>{$('backup-password').value='';$('backup-dialog').showModal();};$('backup-close').onclick=()=>$('backup-dialog').close();
$('help-open').onclick=()=>$('help-dialog').showModal();$('help-close').onclick=()=>$('help-dialog').close();
$('backup-export').onclick=async()=>{try{await saveConfig();const raw={format:'hui-settings',version:1,created:new Date().toISOString(),config:{...config},anima:structuredClone(animaEditor.state),credentials:{chatKey:key,translation:{...translator.secrets}}};download('绘-设置备份-'+new Date().toISOString().slice(0,10)+'.json',await encodeBackup(raw,$('backup-password').value));toast('备份已下载，包含 API 凭据');}catch(e){toast(e.message);}};
$('backup-import').onclick=()=>$('backup-file').click();
$('backup-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(busy||uploading)throw new Error('请先完成当前操作');if(file.size>4000000)throw new Error('备份文件过大');const raw=await decodeBackup(JSON.parse(await file.text()),$('backup-password').value);const next={...defaults};for(const field of Object.keys(defaults))if(raw.config[field]!==undefined&&typeof raw.config[field]===typeof defaults[field])next[field]=raw.config[field];if(raw.anima){const {prefixState}=await import('./prompt-prefixes.js');animaEditor.state={...structuredClone(raw.anima),...prefixState(raw.anima)};animaEditor.state.target=['positive','negative'].includes(raw.anima.target)?raw.anima.target:'positive';$('tag-target').value=animaEditor.state.target;$('anima-nltags').value=animaEditor.state.nltags||'';animaEditor.save();animaEditor.render();}translator.cancel();translator.cache.clear();config=next;delete config.role;key='';for(const field of Object.keys(translator.secrets))translator.secrets[field]='';if(raw.credentials){key=typeof raw.credentials.chatKey==='string'?raw.credentials.chatKey:'';for(const field of Object.keys(translator.secrets))translator.secrets[field]=typeof raw.credentials.translation?.[field]==='string'?raw.credentials.translation[field]:'';}await saveConfig();animaEditor.translationConfigurationChanged();$('chat-model').value=config.model;$('translation-live').checked=config.translationRealtime;syncBadges();connectionStatus('待验证');$('backup-dialog').close();toast('已恢复设置、前缀与标签');}catch(error){toast(error.message);}finally{e.target.value='';}};
try{const stored=await loadSettings();if(stored?.config){const next={...defaults};for(const field of Object.keys(defaults))if(stored.config[field]!==undefined&&typeof stored.config[field]===typeof defaults[field])next[field]=stored.config[field];config=next;key=String(stored.credentials?.chatKey||'');for(const field of Object.keys(translator.secrets))translator.secrets[field]=String(stored.credentials?.translation?.[field]||'');localStorage.setItem('lantern-settings',JSON.stringify(config));$('chat-model').value=config.model;$('translation-live').checked=config.translationRealtime;syncBadges();}else await saveConfig();}catch(error){toast(error.message);}
animaEditor.translationConfigurationChanged();
try { await loadChats(); } catch { toast('浏览器存储不可用，本次记录仅保留在内存，请及时导出'); }
activeId = chats[0]?.id; if (!activeId) newChat(); else renderAll();

desktop.restoreDraft();
