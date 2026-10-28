import { AnimaLexicon } from './anima-core.js';
let lexicon;
const ready=fetch('/data/anima-index.json').then(async r=>{if(!r.ok)throw new Error('Anima 索引未准备好，请重新构建');lexicon=new AnimaLexicon(await r.json());return lexicon.index.meta;});
self.onmessage=async event=>{
  const {id,type,...data}=event.data;
  try {
    const meta=await ready; let result;
    if(type==='init')result={...meta,quality:lexicon.index.quality,negative:lexicon.index.negative};
    else if(type==='search')result=lexicon.search(data.query,data.options);
    else if(type==='convert')result=lexicon.convert(data.text);
    else if(type==='lookup')result=data.tags.map(tag=>lexicon.lookup(tag));
    else throw new Error('未知的词库操作');
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message});}
};
