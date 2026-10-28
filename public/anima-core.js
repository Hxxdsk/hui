// Browser/Node shared utilities. Matching follows anima-prompt-tool's core-first,
// longest-match approach. All dictionary candidates are filtered by the CSV index.
export const hasChinese = text => /[\u3400-\u9fff]/u.test(text);
export function normalizeAnimaTag(value) {
  let tag = String(value).normalize('NFKC').replace(/\\([()[\]\\])/g,'$1').trim().toLowerCase().replace(/\s+/g,' ');
  if (/^by\s+/.test(tag)) tag = '@' + tag.replace(/^by\s+/,'');
  tag = tag.replace(/^@+/, '@');
  if (/^score[ _]\d+$/.test(tag)) return tag.replace(' ','_');
  return tag.replace(/_/g,' ').replace(/\s+/g,' ');
}
export function splitPromptParts(text) {
  const result=[]; let start=0, depth=0, escaped=false;
  for(let i=0;i<text.length;i++) {
    const char=text[i];
    if(escaped) { escaped=false; continue; }
    if(char==='\\') { escaped=true; continue; }
    if(char==='(' || char==='（') depth++;
    else if(char===')' || char==='）') depth=Math.max(0,depth-1);
    if(depth===0 && /[,，、;；\n\r]/.test(char)) { result.push({text:text.slice(start,i),start,end:i}); start=i+1; }
  }
  result.push({text:text.slice(start),start,end:text.length}); return result;
}
export function parseAnimaPrompt(text, multiplier=1, depth=0) {
  if(depth>10) throw new Error('权重分组嵌套过深');
  const result=[];
  for(const part of splitPromptParts(String(text).normalize('NFKC'))) {
    const value=part.text.trim(); if(!value) continue;
    const weighted=value.match(/^\(([\s\S]+):([+-]?(?:\d+(?:\.\d*)?|\.\d+))\)$/);
    if(weighted) {
      const weight=Math.round(multiplier*Number(weighted[2])*1000)/1000;
      if(weight<.1 || weight>5 || !Number.isFinite(weight)) throw new Error('标签权重需在 0.1–5 之间');
      result.push(...parseAnimaPrompt(weighted[1],weight,depth+1));
    } else result.push({text:normalizeAnimaTag(value),weight:multiplier});
  }
  return result;
}
export function formatAnimaTag(tag) {
  const value=normalizeAnimaTag(tag.text).replace(/([()[\]])/g,'\\$1');
  return tag.weight===1 ? value : `(${value}:${Number(tag.weight.toFixed(3))})`;
}
export function activeTagFragment(text, caret, selectionEnd=caret) {
  if(selectionEnd>caret) return {text:text.slice(caret,selectionEnd),start:caret,end:selectionEnd};
  const part=splitPromptParts(text).find(p=>caret>=p.start && caret<=p.end) || {text:'',start:caret,end:caret};
  let value=part.text; let start=part.start;
  const leading=value.length-value.trimStart().length; start+=leading; value=value.trim();
  const weighted=value.match(/^\(([\s\S]+):([+-]?(?:\d+(?:\.\d*)?|\.\d+))\)$/);
  if(weighted) { start++; value=weighted[1]; }
  return {text:value,start,end:start+value.length,weight:weighted?Number(weighted[2]):1};
}
export function candidatePopoverPosition(rect,viewport){
  const width=Math.min(380,viewport.width-24),height=Math.min(340,viewport.height-24);
  if(rect.left>=width+24)return {left:rect.left-width-12,top:Math.max(12,Math.min(rect.top,viewport.height-height-12)),width,height};
  if(viewport.width-rect.right>=width+24)return {left:rect.right+12,top:Math.max(12,Math.min(rect.top,viewport.height-height-12)),width,height};
  const below=viewport.height-rect.bottom-12,above=rect.top-12,available=Math.max(below,above);
  const useAbove=above>=100,fitted=Math.max(90,Math.min(height,useAbove?above:available));
  return {left:Math.max(12,Math.min(viewport.width-width-12,rect.left)),top:Math.max(12,useAbove?rect.top-fitted-6:rect.bottom+6),width,height:fitted};
}
const specialControls = tag => /^score_\d+$/.test(tag) || /^year (?:19|20)\d{2}$/.test(tag);
export class AnimaLexicon {
  constructor(index) {
    this.index=index; this.exact=new Map(); this.aliases=new Map(); this.core=new Map(); this.chinese=new Map(); this.coreTags=new Set();
    for(const row of index.entries) { this.exact.set(row[0],row); }
    for(const row of index.entries) for(const alias of row[3]) if(!this.aliases.has(alias)) this.aliases.set(alias,row[0]);
    for(const [cn,tag,group] of index.core) { if(!this.core.has(cn)) this.core.set(cn,[]); this.core.get(cn).push({tag,group}); this.coreTags.add(tag); }
    for(const row of index.entries) for(const cn of row[4]) { if(!hasChinese(cn)) continue; if(!this.chinese.has(cn)) this.chinese.set(cn,[]); this.chinese.get(cn).push(row[0]); }
    this.translated=index.entries.filter(r=>r[4].length); this.maxCore=[...this.core.keys()].reduce((n,s)=>Math.max(n,s.length),1); this.maxChinese=[...this.chinese.keys()].reduce((n,s)=>Math.max(n,s.length),1);
    this.stop=new Set(index.stopwords); this.maxStop=Math.max(1,...index.stopwords.map(s=>s.length));
  }
  lookup(value) {
    let tag=normalizeAnimaTag(value); let row=this.exact.get(tag);
    if(!row && !tag.startsWith('@')) row=this.exact.get('@'+tag);
    if(!row && this.aliases.has(tag)) row=this.exact.get(this.aliases.get(tag));
    if(!row) return {tag,known:specialControls(tag),group:specialControls(tag)?'画质控制':'自定义',category:5,count:0,cn:'',source:specialControls(tag)?'控制词':'未校验'};
    return {tag:row[0],category:row[1],count:row[2],cn:row[4][0]||'',group:row[5],source:this.coreTags.has(row[0])?'核心词典':'表内标签',known:true};
  }
  search(raw, options={}) {
    const query=String(raw).trim(); if(!query) return [];
    const normalized=normalizeAnimaTag(query); const chinese=hasChinese(query), results=[];
    const rows=chinese?this.translated:this.index.entries;
    for(const row of rows) {
      if(options.group && options.group!=='all' && row[5]!==options.group) continue;
      let score=-1, match='', start=0, end=query.length;
      if(chinese) {
        for(const alias of row[4]) {
          let points=-1, a=0,b=query.length;
          if(alias===query) points=2400;
          else if(alias.startsWith(query)) points=1800-(alias.length-query.length)*12;
          else if(alias.includes(query)) points=1400-(alias.length-query.length)*12;
          else if(query.includes(alias)) { a=query.lastIndexOf(alias); b=a+alias.length; points=1700+alias.length*20-(query.length-b)*30; }
          if(points>score) { score=points; match=alias; start=a; end=b; }
        }
      } else {
        for(const alias of [row[0],...row[3]]) {
          const points=alias===normalized?2400:alias.startsWith(normalized)?1700:alias.includes(normalized)?1200:-1;
          if(points>score) score=points;
        }
      }
      if(score<0) continue;
      if(this.core.get(match)?.some(c=>c.tag===row[0])) score+=60;
      score+=Math.log10(row[2]+1)*8;
      const info=this.lookup(row[0]);
      if(chinese && !this.core.get(match)?.some(c=>c.tag===row[0]))info.source=this.origin(row,match);
      results.push({...info,cn:match||row[4][0]||'',start,end,score});
    }
    results.sort((a,b)=>b.score-a.score || b.count-a.count);
    return results.slice(0,options.limit||24);
  }
  convert(raw) {
    const tags=[],misses=[],seen=new Set();
    const push=(tag,weight,source,cn='')=>{const item=this.lookup(tag); if(!seen.has(item.tag)) {seen.add(item.tag);tags.push({...item,text:item.tag,weight,source,cn:cn||item.cn});}};
    for(const part of parseAnimaPrompt(raw)) {
      const text=part.text;
      if(!hasChinese(text)) { if(text) { const info=this.lookup(text); push(info.tag,part.weight,info.source); } continue; }
      let i=0,miss=''; const flush=()=>{if(miss.trim())misses.push(miss.trim());miss='';};
      while(i<text.length) {
        const char=text[i];
        if(/[\s。.!！?？:：]/.test(char)) {flush();i++;continue;}
        let found;
        for(let len=Math.min(this.maxCore,text.length-i);len>=1;len--) {const word=text.slice(i,i+len);if(this.core.has(word)){found={word,items:this.core.get(word),source:'核心词典'};break;}}
        if(!found) for(let len=Math.min(this.maxChinese,text.length-i);len>=2;len--) {const word=text.slice(i,i+len);if(this.chinese.has(word)){const tag=this.chinese.get(word)[0];found={word,items:[{tag}],source:this.origin(this.exact.get(tag),word)};break;}}
        if(found) {flush();for(const item of found.items)push(item.tag,part.weight,found.source,found.word);i+=found.word.length;continue;}
        let stop=''; for(let len=Math.min(this.maxStop,text.length-i);len>=1;len--)if(this.stop.has(text.slice(i,i+len))){stop=text.slice(i,i+len);break;}
        if(stop){flush();i+=stop.length;continue;}
        if(/[a-z0-9@]/i.test(char)) {const word=text.slice(i).match(/^[a-z0-9@_ -]+/i)?.[0]?.trim();if(word){flush();const info=this.lookup(word);push(info.tag,part.weight,info.source);i+=word.length;continue;}}
        miss+=char; i++;
      }
      flush();
    }
    return {tags,misses:[...new Set(misses)]};
  }
  origin(row,cn){return row && Number.isInteger(row[6]) && row[4].indexOf(cn)>=row[6]?'扩展词库':'补充词典';}
}
