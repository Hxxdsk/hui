export const TRANSLATION_SERVICES={follow:'跟随对话模型',openai:'独立兼容 API',volcengine:'火山翻译',deepl:'DeepL'};
export function detectTranslationCredentials(raw) {
  const text=String(raw||'').trim();if(!text)return null;
  let fields={};try{const parsed=JSON.parse(text);fields={...(parsed.credentials||{}),...parsed};}catch{
    for(const line of text.split(/[\n;,，]+/)){const pair=line.match(/^\s*([\w\u3400-\u9fff -]+?)\s*[:=：]\s*["']?(.+?)["']?\s*$/);if(pair)fields[pair[1]]=pair[2];}
  }
  const normalized=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k.toLowerCase().replace(/[ _-]/g,''),String(v).trim()]));
  const find=(...names)=>names.map(n=>normalized[n]).find(Boolean)||'';
  const name=find('provider','service','type','服务商','服务');
  const ak=find('ak','accesskey','accesskeyid','volcaccesskey','volcengineaccesskey','访问密钥id');
  const sk=find('sk','secretkey','secretaccesskey','volcsecretkey','volcenginesecretkey','访问密钥');
  const key=find('key','apikey','authkey','authenticationkey');
  const baseUrl=find('baseurl','url','endpoint');
  let provider=null;
  if(/火山|volc|volcano/i.test(name))provider='volcengine';
  else if(/deepl/i.test(name))provider='deepl';
  else if(/openai|兼容/i.test(name))provider='openai';
  else if(!name&&(/\bAKLT/i.test(ak)&&sk))provider='volcengine';
  else if(!name&&/:fx$/.test(key||text))provider='deepl';
  else if(!name&&baseUrl&&/^https?:\/\//.test(baseUrl))provider='openai';
  return {provider,ak,sk,key:key||(!Object.keys(fields).length?text:''),baseUrl,model:find('model','模型'),sessionToken:find('sessiontoken','securitytoken'),needsProvider:!provider};
}
export function translationSegments(text,maxLength=4500) {
  const segments=[];
  for(const match of text.matchAll(/[^,，、;；\n\r]+/g)){
    let start=match.index;let value=match[0];const leading=value.length-value.trimStart().length;start+=leading;value=value.trim();
    for(let i=0;i<value.length;){let end=Math.min(i+maxLength,value.length);if(end<value.length&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;segments.push({source:value.slice(i,end),start:start+i,end:start+end});i=end;}
  }
  return segments;
}
export function translationBatches(segments,maxItems=16,maxChars=5000){const batches=[];let batch=[],size=0;for(const segment of segments){if(batch.length&&(batch.length>=maxItems||size+segment.source.length>maxChars)){batches.push(batch);batch=[];size=0;}batch.push(segment);size+=segment.source.length;}if(batch.length)batches.push(batch);return batches;}
export function assembleTranslation(source,segments,translations,targetLanguage){
  if(segments.length!==translations.length||translations.some(t=>typeof t!=='string'||!t.trim()))throw new Error('翻译服务返回的段落数量或内容不正确');
  translations=translations.map(t=>t.replace(/[,，、][ \t]*/g,targetLanguage==='en'?', ':'，'));
  let text=source;for(let i=segments.length-1;i>=0;i--)text=text.slice(0,segments[i].start)+translations[i]+text.slice(segments[i].end);
  text=text.replace(/[,，、][ \t]*/g,targetLanguage==='en'?', ':'，');
  return {translation:text,pairs:segments.map((s,i)=>({source:s.source,target:translations[i]})).slice(0,60),alignment:'segments'};
}
