import {formatAnimaTag} from './anima-core.js';
import {formatNaiTag, parseNaiPrompt} from './nai-prompt.js';

export function convertTranslationTags(text,mode,lexicon) {
  const tags=new Map(), misses=new Set(), unsupported=new Set();
  for(const part of parseNaiPrompt(text,{acceptAnimaWeights:true})){
    const nai=mode==='nai';
    if((nai&&/^score_\d+$/.test(part.text)) || (!nai&&part.weight<.1)){
      unsupported.add(part.text);
      continue;
    }
    const encoded=nai?formatNaiTag(part):formatAnimaTag(part);
    const result=lexicon.convert(encoded);
    for(const entry of result.tags)if(!tags.has(entry.text))tags.set(entry.text,entry);
    for(const miss of result.misses)misses.add(miss);
  }
  return {tags:[...tags.values()],misses:[...misses],unsupported:[...unsupported]};
}
