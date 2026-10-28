export function estimateTokens(messages) {
  return messages.reduce((sum, m) => {
    const text = typeof m.content === 'string' ? m.content : m.content.filter(p => p.type === 'text').map(p => p.text).join('');
    const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const images = Array.isArray(m.content) ? m.content.filter(p => p.type === 'image_url').length : 0;
    return sum + cjk + Math.ceil((text.length - cjk) / 3) + images * 1600 + 6;
  }, 0);
}
export function trimContext(messages, budget) {
  const costs=messages.map(m=>estimateTokens([m]));let tokens=costs.reduce((a,b)=>a+b,0),removed=0;
  const first=messages[0]?.role==='system'?1:0,lastUser=messages.findLastIndex(m=>m.role==='user');let start=first;
  while(tokens>budget&&messages.length-(start-first)>2&&lastUser>start){let next=start+1;while(next<lastUser&&messages[next].role!=='user')next++;for(let i=start;i<next;i++)tokens-=costs[i];start=next;removed++;}
  return {messages:[...messages.slice(0,first),...messages.slice(start)],removed,tokens};
}
export async function consumeCompletion(response, onText) {
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `HTTP ${response.status}`); }
  if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
    const json = await response.json();
    if (json.error) throw new Error(json.error.message || '接口返回错误');
    const choice = json.choices?.[0];
    const content = choice?.message?.content || choice?.message?.refusal || '';
    if (typeof content !== 'string') throw new Error('服务商返回了不支持的消息格式');
    onText(content);
    return { reason: choice?.finish_reason || 'stop', usage: json.usage, received: content.length > 0 };
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = '', eventLines = [], reason = '', usage, done = false, received = false;
  const dispatch = () => {
    const raw = eventLines.join('\n'); eventLines = [];
    if (!raw) return;
    if (raw.trim() === '[DONE]') { done = true; return; }
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error('服务商返回了无效的流式 JSON'); }
    if (json.error) throw new Error(json.error.message || '流式接口错误');
    const choice = json.choices?.[0];
    const delta = choice?.delta?.content || choice?.delta?.refusal;
    if (typeof delta === 'string') { received = true; onText(delta); }
    if (choice?.finish_reason) reason = choice.finish_reason;
    if (json.usage) usage = json.usage;
  };
  const line = value => { if (!value) dispatch(); else if (value.startsWith('data:')) eventLines.push(value.slice(5).trimStart()); };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, index).replace(/\r$/, '')); buffer = buffer.slice(index + 1); }
      if (chunk.done) break;
    }
    if (buffer) line(buffer.replace(/\r$/, ''));
    dispatch();
  } finally { reader.releaseLock(); }
  return { reason: reason || (done ? 'stop' : 'interrupted'), usage, received };
}
export function messageContent(message) {
  const parts = [{ type: 'text', text: message.text || '' }];
  for (const file of message.files || []) {
    if (file.type === 'image') parts.push({ type: 'image_url', image_url: { url: file.data } });
    else parts[0].text += `\n\n<attachment name=${JSON.stringify(file.name)}>\n${file.text}\n</attachment>`;
  }
  return parts.length === 1 ? parts[0].text : parts;
}
export function splitTags(text) { return text.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean); }
