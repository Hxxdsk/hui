import {AnimaLexicon, normalizeAnimaTag, hasChinese} from './anima-core.js';
import {NAI_SPECIAL, parseNaiPrompt} from './nai-prompt.js';

const groups={1:'画师',3:'作品',4:'角色',5:'补充细节'};

export function createNaiLexicon(csv,shared){
  const entries=new Map();
  const common=new Map(shared.entries.map(row=>[row[0].replace(/^@/,''),row]));
  for(const line of csv.split(/\r?\n/)){
    const fields=line.match(/^(.*?),([01345]),(\d+),("(?:[^"]|"")*"|[^,]*),(.*)$/);
    if(!fields)continue;
    const [,name,category,count,rawAliases,rawChinese]=fields;
    const tag=normalizeAnimaTag(name);
    if(!tag||/^score_\d+$/.test(tag))continue;
    const source=common.get(tag);
    const unquote=value=>value.replace(/^"|"$/g,'').replaceAll('""','"');
    const aliases=unquote(rawAliases).split(',').filter(Boolean).map(normalizeAnimaTag);
    const cn=[...new Set([...unquote(rawChinese).split(/[,，、]/).map(x=>x.trim()).filter(hasChinese),...(source?.[4]||[])])];
    entries.set(tag,[tag,Number(category),Number(count),aliases,cn,groups[category]||source?.[5]||'补充细节']);
  }
  if(!entries.size)throw new Error('NovelAI 中文词库格式无效');
  for(const [tag,cn] of NAI_SPECIAL){
    const row=entries.get(tag);
    entries.set(tag,[tag,5,row?.[2]||0,row?.[3]||[],[...new Set([cn,...(row?.[4]||[])])],'画质控制']);
  }
  const rows=[...entries.values()];
  const core=shared.core.map(([cn,tag,group])=>[cn,tag.replace(/^@/,''),group]).filter(([,tag])=>entries.has(tag));
  for(const [cn,tag,group] of [['七分身','cowboy shot','补充细节'],['黑丝','black thighhighs','补充细节'],['黑色丝袜','black thighhighs','补充细节'],['猫娘','cat girl','角色']]){if(entries.has(tag))core.unshift([cn,tag,group]);}
  for(const [cn,tag] of core){const aliases=entries.get(tag)[4];if(!aliases.includes(cn))aliases.push(cn);}
  const meta={tags:rows.length,chineseAliases:rows.reduce((sum,row)=>sum+row[4].length,0)};
  const lexicon=new AnimaLexicon({entries:rows,core,stopwords:shared.stopwords,meta},parseNaiPrompt);
  const lookup=lexicon.lookup.bind(lexicon);
  lexicon.lookup=value=>{
    const explicit=/^(?:@|artist:\s*)/i.test(value);
    const name=value.replace(/^(?:@|artist:\s*)/i,'');
    const result=lookup(name);
    if(/^score_\d+$/.test(result.tag))return {...result,known:false,source:'非 NAI 控制词'};
    return explicit?{...result,category:1,tag:result.category===1?result.tag:'@'+result.tag}:result;
  };
  return lexicon;
}
