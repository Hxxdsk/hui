import {normalizeAnimaTag} from './anima-core.js';

export const isEastAsianName = text => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);

export function prepareArtistDirectory(rows) {
  return rows.map(([name,count,aliases])=>{
    const names=[name,...aliases];
    return {name,count,names,keys:names.map(normalizeAnimaTag),display:aliases.find(isEastAsianName)||''};
  });
}

export function searchArtistDirectory(rows, raw, {limit=12, exact=false}={}) {
  const query=normalizeAnimaTag(raw);
  if(!query)return [];
  const results=[];
  for(const {name,count,names,keys,display} of rows){
    let score=0, matched='';
    for(const [index,key] of keys.entries()){
      const rank=key===query?2400:exact?0:key.startsWith(query)?1700:key.includes(query)?1200:0;
      if(rank>score){score=rank;matched=names[index];}
      if(rank===2400)break;
    }
    if(!score)continue;
    if(matched===name && score===2400)score+=50;
    const cn=isEastAsianName(matched)?matched:display;
    results.push({tag:name,cn,count,score:score+Math.log10(count+1)*8});
  }
  results.sort((a,b)=>b.score-a.score);
  return results.slice(0,limit);
}
