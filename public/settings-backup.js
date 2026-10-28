const encoder = new TextEncoder(), decoder = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function keyFor(password, salt, usage) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, [usage]);
}
export function validateBackup(raw) {
  if (raw?.format !== 'hui-settings' || raw.version !== 1 || !raw.config || typeof raw.config !== 'object' || Array.isArray(raw.config)) throw new Error('不是有效的绘设置备份');
  if (JSON.stringify(raw).length > 2000000) throw new Error('设置备份过大');
  for (const field of ['baseUrl','translationUrl']) if (raw.config[field]) { const url = new URL(raw.config[field]); if (!['http:','https:'].includes(url.protocol)) throw new Error('备份中的 API 地址无效'); }
  for (const [field, min, max] of [['temperature',0,2],['maxTokens',64,131072],['contextBudget',2048,2000000],['autoContinue',0,5],['translationDelay',300,5000]]) if (raw.config[field] !== undefined && (!Number.isFinite(raw.config[field]) || raw.config[field] < min || raw.config[field] > max)) throw new Error('备份参数无效：'+field);
  if(raw.config.maxTokens!==undefined && raw.config.contextBudget!==undefined && raw.config.contextBudget<=raw.config.maxTokens+512)throw new Error('备份上下文预算不足');
  if(raw.config.translationService && !['follow','openai','volcengine','deepl'].includes(raw.config.translationService))throw new Error('备份翻译服务无效');
  if(raw.config.tokenField && !['max_tokens','max_completion_tokens'].includes(raw.config.tokenField))throw new Error('备份输出参数无效');
  if(raw.anima?.nltags!==undefined && typeof raw.anima.nltags!=='string')throw new Error('备份自然语言补充无效');
  if (raw.anima) for (const field of ['positive','negative']) if (!Array.isArray(raw.anima[field]) || raw.anima[field].length>20000 || raw.anima[field].some(t=>!t||typeof t.text!=='string'||t.text.length>2000||!Number.isFinite(t.weight)||t.weight<.1||t.weight>5)) throw new Error('备份标签格式无效');
  return raw;
}
export async function encodeBackup(raw, password = '') {
  validateBackup(raw);
  if (!password) return raw;
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv}, await keyFor(password,salt,'encrypt'), encoder.encode(JSON.stringify(raw))));
  // Chunk the ciphertext to avoid argument-stack limits for large tag libraries.
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {format:'hui-encrypted',version:1,salt:b64(salt),iv:b64(iv),data:btoa(binary)};
}
export async function decodeBackup(raw, password = '') {
  if (raw?.format !== 'hui-encrypted') return validateBackup(raw);
  if(raw.version!==1||typeof raw.data!=='string'||raw.data.length>3000000)throw new Error('加密备份格式无效');
  if(!password)throw new Error('请输入备份密码');
  try { return validateBackup(JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(raw.iv)}, await keyFor(password,unb64(raw.salt),'decrypt'),unb64(raw.data))))); }
  catch { throw new Error('密码不正确，或备份文件已损坏'); }
}
