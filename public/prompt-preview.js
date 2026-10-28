import {parseAnimaPrompt,formatAnimaTag,normalizeAnimaTag} from './anima-core.js';
export const PROMPT_CATEGORIES=[['quality','画质'],['subject','主体 / 角色'],['appearance','外貌'],['clothing','服饰 / 道具'],['pose','动作 / 表情'],['composition','构图'],['scene','场景 / 光照'],['style','风格 / 画师'],['correction','缺陷 / 排除'],['other','其他'],['narrative','自然语言']];
export function categoryFor(tag){
 const t=normalizeAnimaTag(tag.text||tag.tag||'');
 if(/^(?:score[_ ]\d|masterpiece|best quality|worst quality|low quality|normal quality|high quality|very aesthetic|aesthetic|highres|absurdres|newest|recent|year |rating|general$|sensitive$|questionable$|explicit$)/.test(t)||/\b(?:resolution|quality|jpeg artifacts|blurry)\b/.test(t))return 'quality';
 if(/^(?:bad |extra |missing |mutated |deformed |distorted |poorly |malformed )/.test(t)||/^(?:watermark|signature|text|logo|error|duplicate|cropped|out of frame)$/.test(t))return 'correction';
 if(t.startsWith('@')||tag.category===1||/\b(?:style|watercolor|oil painting|sketch|pixel art|photorealistic|anime|lineart|illustration|3d|render)\b/.test(t))return 'style';
 if(tag.category===4||tag.category===3||/^(?:\d+girls?|\d+boys?|solo|multiple girls|multiple boys|no humans|animal|cat|dog|bird)$/.test(t))return 'subject';
 if(/\b(?:hair ornament|hair bow|hairclip|hair flower|hair ribbon|headphones)\b/.test(t))return 'clothing';
 if(/\b(?:hair|bangs|eyes|eyelashes|eyebrows|skin|body|breasts|waist|hips|legs|ears|tail|horns|wings|nails|fangs|freckles|mole|ahoge)\b/.test(t))return 'appearance';
 if(tag.group==='动作姿势'||/\b(?:standing|sitting|lying|kneeling|walking|running|jumping|looking|holding|reading|smile|smiling|blush|wink|mouth|crying|laughing|pose|arms|hand on|head tilt|expression)\b/.test(t))return 'pose';
 if(/\b(?:close-up|close up|portrait|full body|upper body|cowboy shot|from above|from below|from side|from behind|view|angle|framing|depth of field|perspective|focus|bokeh|composition)\b/.test(t))return 'composition';
 if(tag.group==='场景背景'||/\b(?:background|indoors|outdoors|sky|cloud|rain|snow|sunlight|lighting|light|shadow|night|day|sunset|room|window|forest|city|street|ocean|sea|water|beach|garden|mountain|field|building)\b/.test(t))return 'scene';
 if(/\b(?:dress|shirt|skirt|sleeves|coat|jacket|uniform|hat|ribbon|bow|gloves|shoes|boots|socks|stockings|pantyhose|pants|shorts|armor|collar|necklace|earrings|hair ornament|headphones|umbrella|book|sword|weapon|bag|belt|accessor|clothes|clothing|fabric|lace|frills)\b/.test(t))return 'clothing';
 return 'other';
}
export function promptTokens(state,side,metadata=new Map()){
 const result=[],prefixes=new Map(state.prefixes.map(p=>[p.id,p]));
 for(const id of state[side+'Prefixes']){const text=prefixes.get(id)?.[side]||'';let parts;try{parts=parseAnimaPrompt(text);}catch{parts=[{text,weight:1}];}for(const entry of parts){const info=metadata.get(entry.text)||{};result.push({...info,...entry,raw:formatAnimaTag(entry),source:'prefix',key:`prefix:${id}:${result.length}`});}}
 for(const [i,entry] of state[side].entries())result.push({...metadata.get(entry.text),...entry,raw:formatAnimaTag(entry),source:'body',key:`body:${i}:${entry.text}`});
 for(const entry of result)entry.kind=categoryFor(entry);
 if(side==='positive'&&state.nltags?.trim())result.push({text:state.nltags,raw:state.nltags,kind:'narrative',source:'nl',key:'nl'});
 return result;
}
export function categoryRuns(tokens){const runs=[];for(const token of tokens){let last=runs.at(-1);if(!last||last.kind!==token.kind){last={kind:token.kind,tokens:[]};runs.push(last);}last.tokens.push(token);}return runs;}
export function bilingualChat(positive,negative){if(!positive.trim()&&!negative.trim())return '';return `正向 Prompt（Positive）：\n${positive.trim()||'（空）'}\n\n负向 Prompt（Negative）：\n${negative.trim()||'（空）'}`;}
