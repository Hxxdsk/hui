import { AnimaLexicon, normalizeAnimaTag } from './anima-core.js';
import {isEastAsianName, prepareArtistDirectory, searchArtistDirectory} from './artist-directory.js';
import {createNaiLexicon} from './nai-lexicon.js';
import {convertTranslationTags} from './translation-tags.js';
let shared, nai, artistDirectory;
const ready=fetch('/data/anima-index.json').then(async r=>{if(!r.ok)throw new Error('Anima 索引未准备好，请重新构建');shared=await r.json();
  return new AnimaLexicon(shared);});

function loadNai(){
  nai??=fetch('/data/nai-tags.csv').then(async response=>{
    if(!response.ok)throw new Error('NovelAI 词库加载失败');
    return createNaiLexicon(await response.text(),shared);
  }).catch(error=>{nai=null;throw error;});
  return nai;
}

async function searchArtists(lexicon, query, {limit=12,exact=false}){
  artistDirectory??=fetch('/data/artist-names.json').then(async response=>{
    if(!response.ok)throw new Error('公开画师目录未载入');
    return prepareArtistDirectory(await response.json());
  }).catch(error=>{artistDirectory=null;throw error;});
  const directory=await artistDirectory;
  const supplemental=searchArtistDirectory(directory,query,{limit,exact});
  const local=isEastAsianName(query)||exact?[]:lexicon.search(query,{group:'画师',limit});
  const ranked=[...supplemental,...local].sort((a,b)=>b.score-a.score);
  const found=new Map();
  for(const item of ranked){
    const tag=normalizeAnimaTag(item.tag).replace(/^@/,'');
    if(found.has(tag))continue;
    const active=lexicon.lookup(tag),known=active.known&&active.category===1;
    found.set(tag,{...item,tag,known,source:known?active.source:'公开画师别名'});
  }
  return [...found.values()].slice(0,limit);
}
self.onmessage=async event=>{
  const {id,type,mode,...data}=event.data;
  try {
    let lexicon=await ready;
    if(mode==='nai')lexicon=await loadNai();
    const meta=lexicon.index.meta;let result;
    if(type==='init')result={...meta,quality:lexicon.index.quality,negative:lexicon.index.negative};
    else if(type==='search')result=lexicon.search(data.query,data.options);
    else if(type==='artists')result=await searchArtists(lexicon,data.query,data);
    else if(type==='convert')result=lexicon.convert(data.text);
    else if(type==='convert-translation')result=convertTranslationTags(data.text,mode,lexicon);
    else if(type==='lookup')result=data.tags.map(tag=>lexicon.lookup(tag));
    else throw new Error('未知的词库操作');
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message});}
};
