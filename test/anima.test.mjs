import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AnimaLexicon, normalizeAnimaTag,parseAnimaPrompt,formatAnimaTag,activeTagFragment,hasChinese,candidatePopoverPosition} from '../public/anima-core.js';
const index=JSON.parse(await readFile(new URL('../data/anima-index.json',import.meta.url),'utf8'));
const lexicon=new AnimaLexicon(index);
test('desktop suggestions sit beside the sidebar and leave its conversion controls clickable',()=>{
  const input={left:867,top:271,bottom:351};const pos=candidatePopoverPosition(input,{width:1150,height:720});
  assert.ok(pos.left+pos.width<input.left);assert.ok(pos.top>=12&&pos.top+pos.height<=708);
  const mobile=candidatePopoverPosition({left:12,top:270,bottom:350},{width:390,height:720});assert.ok(mobile.left>=12&&mobile.left+mobile.width<=378);
  assert.ok(mobile.top+mobile.height<=270,'mobile suggestions leave the conversion controls below the field free');
  const right=candidatePopoverPosition({left:270,right:600,top:200,bottom:300},{width:1280,height:720});assert.ok(right.left>600,'two-column layouts use room to the right');
});
test('Anima normalizes spaces, artist prefixes and preserves score controls',()=>{
  assert.equal(normalizeAnimaTag(' Looking_At_Viewer '),'looking at viewer');
  assert.equal(normalizeAnimaTag('SCORE_9'),'score_9');
  assert.equal(normalizeAnimaTag('score 8'),'score_8');
  assert.equal(normalizeAnimaTag('by dairi'),'@dairi');
  assert.equal(normalizeAnimaTag('@@dairi'),'@dairi');
  assert.equal(lexicon.lookup('dairi').tag,'@dairi');
  assert.equal(lexicon.lookup('hires').tag,'highres');
});
test('Anima weights round-trip grouped tags and escaped literal parentheses',()=>{
  const parts=parseAnimaPrompt('(long_hair, looking_at_viewer:2), score_9');
  assert.deepEqual(parts,[{text:'long hair',weight:2},{text:'looking at viewer',weight:2},{text:'score_9',weight:1}]);
  assert.deepEqual(parts.map(formatAnimaTag),['(long hair:2)','(looking at viewer:2)','score_9']);
  const character={text:'name (series)',weight:1};
  assert.equal(formatAnimaTag(character),'name \\(series\\)');
  assert.deepEqual(parseAnimaPrompt(formatAnimaTag(character)),[character]);
  assert.throws(()=>parseAnimaPrompt('(long hair:0)'),/权重/);
  assert.throws(()=>parseAnimaPrompt('(long hair:6)'),/权重/);
});
test('autocomplete replaces only the active fragment and preserves explicit weight',()=>{
  const text='1girl, (长发:2), rain';
  assert.deepEqual(activeTagFragment(text,10),{text:'长发',start:8,end:10,weight:2});
  assert.deepEqual(activeTagFragment('站在街道的女孩',0,2),{text:'站在',start:0,end:2});
});
test('Chinese candidates are canonical CSV members with exact concepts ranked first',()=>{
  const rows=lexicon.search('长发');assert.equal(rows[0].tag,'long hair');
  for(const row of rows)assert.ok(lexicon.exact.has(row.tag));
  assert.ok(lexicon.search('微笑',{group:'动作姿势'}).every(t=>t.group==='动作姿势'));
  assert.ok(lexicon.search('zzzznotarealtagzzzz').length===0);
});
test('core-first conversion retains unmatched Chinese separately and removes duplicate tags',()=>{
  const result=lexicon.convert('一个女孩，长发，看镜头，长头发，霓虹灯，不存在xyz概念');
  assert.ok(result.tags.some(t=>t.text==='1girl'));
  assert.ok(result.tags.some(t=>t.text==='looking at viewer'));
  assert.equal(result.tags.filter(t=>t.text==='long hair').length,1);
  assert.ok(result.misses.length>0);
  assert.ok(result.tags.every(t=>!hasChinese(t.text)));
  assert.ok(result.tags.filter(t=>t.source==='核心词典'||t.source==='补充词典').every(t=>lexicon.exact.has(t.text)));
  const custom=lexicon.convert('my custom english tag').tags[0];assert.equal(custom.known,false);
  assert.equal(lexicon.lookup('year 2025').known,true);
});
test('prepared CSV is the exact pinned upstream Git blob and index covers every row',async()=>{
  const csv=await readFile(new URL('../data/Anima-preview.csv',import.meta.url));
  const hash=createHash('sha1').update(`blob ${csv.length}\0`).update(csv).digest('hex');
  assert.equal(hash,'ca8f2294f38067b526718ac75f4e558188bd2a79');
  assert.equal(index.meta.tags,111513);assert.equal(index.entries.length,111513);
  assert.ok(index.meta.chineseAliases>3000);
});
test('full original SQLite is checksum verified and configured into the filtered runtime lexicon',async()=>{
  const db=await readFile(new URL('../data/tags.sqlite',import.meta.url));
  assert.equal(createHash('sha1').update(`blob ${db.length}\0`).update(db).digest('hex'),'8b1727009de0a42012a7b7fd50c2f1a524ec45e0');
  assert.equal(index.meta.originalSqliteRows,334048);assert.equal(index.meta.originalSqliteUniqueTags,330744);assert.ok(index.meta.originalSqliteAliases>80000);
  const candidate=lexicon.search('头戴式耳机').find(t=>t.tag==='headphones');assert.ok(candidate);assert.equal(candidate.source,'扩展词库');
});
