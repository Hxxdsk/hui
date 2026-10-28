// Browser-only fixture. Synthetic credentials are never sent to external services.
import {createApp} from '../server.mjs';
import {createPreferencesStore} from '../preferences.mjs';
import {translationSegments,assembleTranslation} from '../public/translation-core.js';
let count=0;
createApp({preferencesStore:createPreferencesStore(new URL('./qa/persistent-settings-test.json',import.meta.url)),translationHandler:async(input,{signal})=>{
  count++;console.log(`Mock translation request ${count} (${input.provider})`);
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,input.text.includes('慢请求')?1200:60);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
  const segments=translationSegments(input.text);const translations=segments.map(s=>input.targetLanguage==='zh'?({'cobalt vapor aura':'钴蓝蒸汽光晕','velvet dusk canopy':'天鹅绒暮色帷幕'}[s.source]||'标签：'+s.source):({'长发':'long hair','微笑':'smile','耳机':'headphones','新输入':'new input'}[s.source]||`translated ${s.source}`));
  return assembleTranslation(input.text,segments,translations,input.targetLanguage);
}}).listen(Number(process.env.PORT||3212),'127.0.0.1',()=>console.log('QA only: http://127.0.0.1:'+(process.env.PORT||3212)));
