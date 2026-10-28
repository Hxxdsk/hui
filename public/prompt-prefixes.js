export const DEFAULT_PREFIXES = [
  { id:'anima-original', name:'Anima 原项目', positive:'masterpiece, very aesthetic, best quality, score_9, score_8, highres, absurdres, newest', negative:'worst quality, low quality, score_1, score_2, score_3, blurry, bad anatomy, bad hands, bad fingers, extra fingers, missing fingers, distorted face, jpeg artifacts, text, watermark, logo, signature' },
  { id:'simple-quality', name:'简洁质量', positive:'best quality, highres', negative:'low quality, watermark, logo' }
];
export function prefixState(cached={}) {
  const prefixes=Array.isArray(cached.prefixes)?cached.prefixes.slice(0,100).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string').map(p=>({id:p.id,name:p.name.slice(0,80),positive:String(p.positive||'').slice(0,16000),negative:String(p.negative||'').slice(0,16000)})):structuredClone(DEFAULT_PREFIXES);
  const seen=new Set();const unique=prefixes.filter(p=>!seen.has(p.id)&&seen.add(p.id));
  const ids=new Set(unique.map(p=>p.id));
  const valid=values=>[...new Set(Array.isArray(values)?values:[])].filter(id=>ids.has(id));
  return {prefixes:unique,positivePrefixes:valid(cached.positivePrefixes||(cached.quality?['anima-original']:[])),negativePrefixes:valid(cached.negativePrefixes)};
}
export function composePrefixedPrompt(prefixes,selected,side,body,nltags='') {
  const byId=new Map(prefixes.map(p=>[p.id,p]));
  const front=selected.map(id=>String(byId.get(id)?.[side]||'').trim()).filter(Boolean).join(', ');
  // Prefixes are an independent layer. Never deduplicate, edit, or reweight body tags.
  const prompt=[front,body].filter(Boolean).join(', ');
  return [prompt,nltags.trim()].filter(Boolean).join('\n');
}
