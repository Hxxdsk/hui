import {createHash,createHmac} from 'node:crypto';
import {translationSegments,translationBatches,assembleTranslation} from './public/translation-core.js';
const hash=text=>createHash('sha256').update(text).digest('hex');
const hmac=(key,text)=>createHmac('sha256',key).update(text).digest();
export function signVolcTranslation({ak,sk,sessionToken='',region='cn-north-1',texts,sourceLanguage,targetLanguage,now=new Date()}){
  if(!ak||!sk)throw new Error('火山翻译需要 Access Key ID（AK）和 Secret Access Key（SK）');
  if(!/^[a-z0-9-]{1,40}$/.test(region))throw new Error('火山地域格式无效');
  const url='https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01';
  const body=JSON.stringify({...(sourceLanguage?{SourceLanguage:sourceLanguage}:{}),TargetLanguage:targetLanguage,TextList:texts});
  const date=now.toISOString().replace(/[:-]|\.\d{3}/g,''),short=date.slice(0,8),scope=`${short}/${region}/translate/request`;
  const signed={'host':'translate.volcengineapi.com','x-content-sha256':hash(body),'x-date':date};
  if(sessionToken)signed['x-security-token']=sessionToken;
  const keys=Object.keys(signed).sort(),signedHeaders=keys.join(';');
  const canonical=['POST','/','Action=TranslateText&Version=2020-06-01',keys.map(k=>`${k}:${signed[k]}`).join('\n')+'\n',signedHeaders,hash(body)].join('\n');
  const stringToSign=['HMAC-SHA256',date,scope,hash(canonical)].join('\n');
  const signingKey=hmac(hmac(hmac(hmac(sk,short),region),'translate'),'request');
  const signature=createHmac('sha256',signingKey).update(stringToSign).digest('hex');
  return {url,method:'POST',body,headers:{'Content-Type':'application/json',...signed,Authorization:`HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`}};
}
function redact(message,credentials){let text=String(message||'翻译服务请求失败').slice(0,1500);for(const value of Object.values(credentials||{}))if(typeof value==='string'&&value)text=text.split(value).join('[已隐藏]');return text;}
export async function translateWithService(input,{fetchImpl=fetch,signal,now}={}){
  const {provider,text,sourceLanguage,targetLanguage}=input;
  const credentials=input.credentials||{};
  if(!['volcengine','deepl'].includes(provider))throw new Error('不支持此机器翻译服务');
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw new Error('待翻译内容需在 1–16000 字符之间');
  if(!['zh','en'].includes(targetLanguage)||!['zh','en',''].includes(sourceLanguage||''))throw new Error('当前支持中英互译');
  const segments=translationSegments(text);if(!segments.length||segments.length>256)throw new Error('请减少翻译片段，单次最多 256 段');
  const batches=translationBatches(segments,provider==='volcengine'?16:50,provider==='volcengine'?5000:16000),translations=[];
  try{
    for(const batch of batches){
      signal?.throwIfAborted();let request;
      if(provider==='volcengine')request=signVolcTranslation({...credentials,region:input.region||'cn-north-1',texts:batch.map(s=>s.source),sourceLanguage,targetLanguage,now});
      else{
        if(!credentials.key)throw new Error('请填写 DeepL API Key');
        request={url:`https://${credentials.key.endsWith(':fx')?'api-free.deepl.com':'api.deepl.com'}/v2/translate`,method:'POST',headers:{'Content-Type':'application/json',Authorization:`DeepL-Auth-Key ${credentials.key}`},body:JSON.stringify({text:batch.map(s=>s.source),source_lang:(sourceLanguage||'').toUpperCase()||undefined,target_lang:targetLanguage.toUpperCase()})};
      }
      const {url,...options}=request;const response=await fetchImpl(url,{...options,signal,redirect:'error'});
      const result=await response.json().catch(()=>({}));
      const providerError=result.ResponseMetadata?.Error;
      if(!response.ok||providerError){const error=new Error(`${providerError?.Code||response.status}: ${providerError?.Message||result.message||'翻译请求失败，请检查凭据、权限和余额'}`);error.status=response.ok?400:response.status;throw error;}
      const rows=provider==='volcengine'?result.TranslationList?.map(t=>t.Translation):result.translations?.map(t=>t.text);
      if(!Array.isArray(rows)||rows.length!==batch.length)throw new Error('翻译服务返回的段落数量不一致');
      translations.push(...rows);
    }
    return {...assembleTranslation(text,segments,translations,targetLanguage),provider};
  }catch(error){if(signal?.aborted)throw error;const safe=new Error(redact(error.message,credentials));safe.status=error.status||400;throw safe;}
}
