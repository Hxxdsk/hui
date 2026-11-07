import { normalizeAnimaTag, parseAnimaPrompt } from './anima-core.js';

export const NAI_PREFIXES = [
  {id:'nai-v5', name:'NAI V5 · 标准画质', positive:'very aesthetic, masterpiece, no text', negative:''},
  {id:'nai-v45', name:'NAI V4.5 Full · 画质', positive:'location, very aesthetic, masterpiece, no text', negative:''},
  {id:'nai-uc', name:'NAI · 常见缺陷', positive:'', negative:'lowres, bad anatomy, bad hands, worst quality, jpeg artifacts'}
];

export const NAI_SPECIAL = [
  ['masterpiece','杰作'],['very aesthetic','非常美观'],['aesthetic','美观'],
  ['top aesthetic','顶级美观'],['amazing quality','极佳质量'],['best quality','最佳质量'],
  ['great quality','高质量'],['normal quality','普通质量'],['bad quality','低质量'],
  ['worst quality','最差质量'],['very displeasing','非常不悦目'],['displeasing','不悦目'],
  ['no text','无文字'],['location','地点'],['background dataset','背景数据集'],
  ['rating:general','全年龄'],['low complexity','低复杂度'],['medium complexity','中等复杂度'],
  ['high complexity','高复杂度'],['ultra complexity','超高复杂度']
];

export const validNaiWeight = value => Number.isFinite(value) && value >= -5 && value <= 5;

export function formatNaiTag({text,weight,category}){
  const tag = text.startsWith('@') || category===1 ? 'artist:'+text.replace(/^@/,'') : text;
  return weight === 1 ? tag : `${Number(weight.toFixed(3))}::${tag}::`;
}

// Track explicit numerical spans and the traditional strengthening brackets.
export function parseNaiPrompt(input,{acceptAnimaWeights=false}={}){
  const result=[], stack=[];
  let buffer='', parentheses=0;
  const flush=()=>{
    const text=normalizeAnimaTag(buffer).replace(/^artist:\s*/, '@');
    buffer='';
    if(!text)return;
    const weight=Number(stack.reduce((product,item)=>product*item.factor,1).toFixed(3));
    if(acceptAnimaWeights && /^\(.+:[+-]?(?:\d+(?:\.\d*)?|\.\d+)\)$/.test(text)){
      result.push(...parseAnimaPrompt(text.replace(/artist:\s*/gi,'@'),weight));
      return;
    }
    if(!validNaiWeight(weight))throw new Error('NovelAI 标签权重需在 -5–5 之间');
    result.push({text,weight});
  };
  const pieces=String(input).normalize('NFKC').matchAll(/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))::|::|[{}\[\](),、;\r\n]|[^{}\[\](),、;\r\n:]+|:/g);
  for(const [piece,number] of pieces){
    if(piece==='(')parentheses++;
    if(piece===')')parentheses=Math.max(0,parentheses-1);
    if(parentheses || piece==='(' || piece===')'){buffer+=piece;continue;}
    if(number!==undefined && !buffer.trim()){flush();stack.push({factor:Number(number),end:'::'});}
    else if(piece==='::'){flush();const i=stack.findLastIndex(item=>item.end==='::');stack.splice(Math.max(0,i));}
    else if(piece==='{'||piece==='['){flush();stack.push({factor:piece==='{'?1.05:1/1.05,end:piece==='{'?'}':']'});}
    else if(piece===stack.at(-1)?.end){flush();stack.pop();}
    else if(/^[,、;\r\n]$/.test(piece))flush();
    else buffer+=piece;
  }
  flush();
  return result;
}
