import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createNaiLexicon} from '../public/nai-lexicon.js';
import {formatNaiTag, NAI_PREFIXES, parseNaiPrompt} from '../public/nai-prompt.js';
import {promptTokens} from '../public/prompt-preview.js';
import {animaContext} from '../anima-service.mjs';
import {prepareArtistDirectory,searchArtistDirectory} from '../public/artist-directory.js';
import {AnimaLexicon,formatAnimaTag} from '../public/anima-core.js';
import {convertTranslationTags} from '../public/translation-tags.js';

test('NovelAI parses grouped and negative emphasis and puts quality after the subject',()=>{
  const positive=parseNaiPrompt('1.25::long hair, smile::, 0::text::, -0.8::feet::, [rain]');
  assert.deepEqual(positive.map(formatNaiTag),['1.25::long hair::','1.25::smile::','0::text::','-0.8::feet::','0.952::rain::']);
  const tokens=promptTokens({mode:'nai',positive,prefixes:NAI_PREFIXES,positivePrefixes:['nai-v5']},'positive');
  assert.equal(tokens[0].raw,'1.25::long hair::');
  assert.deepEqual(tokens.slice(-3).map(t=>t.raw),['very aesthetic','masterpiece','no text']);
});

test('bundled NovelAI dictionary resolves Chinese aliases and keeps Anima scores out of candidates',async()=>{
  const csv=await fs.readFile(new URL('../data/nai-tags.csv',import.meta.url),'utf8');
  const lexicon=createNaiLexicon(csv,{entries:[],core:[],stopwords:[]});
  assert.ok(lexicon.index.meta.tags>300000);
  assert.equal(lexicon.search('七分身')[0].tag,'cowboy shot');
  assert.equal(lexicon.convert('1.4::黑丝::').tags.map(formatNaiTag).join(', '),'1.4::black thighhighs::');
  assert.deepEqual(lexicon.search('score_9'),[]);
});

test('NovelAI image assistance uses its own prompt instructions',async()=>{
  const result=await animaContext({profile:'nai',text:'书房里的少女'});
  assert.equal(result.profile,'nai');
  assert.match(result.prompt,/Undesired Content/);
  assert.match(result.prompt,/1\.2::tag::/);
  assert.doesNotMatch(result.prompt,/本程序会在回复后调用确定性校验器/);
});

test('translation transfer preserves grouped weights and artist prefixes in each target format',()=>{
  const index={entries:[],core:[],stopwords:[]};
  const text='(artist:asanagi:1.2), 0.8::long_hair, smile::, score_9, -0.4::monochrome::';
  const anima=convertTranslationTags(text,'anima',new AnimaLexicon(index));
  assert.deepEqual(anima.tags.map(formatAnimaTag),['(@asanagi:1.2)','(long hair:0.8)','(smile:0.8)','score_9']);
  assert.deepEqual(anima.unsupported,['monochrome']);
  const nai=convertTranslationTags(text,'nai',new AnimaLexicon(index,parseNaiPrompt));
  assert.deepEqual(nai.tags.map(formatNaiTag),['1.2::artist:asanagi::','0.8::long hair::','0.8::smile::','-0.4::monochrome::']);
  assert.deepEqual(nai.unsupported,['score_9']);
});

test('the public artist directory matches names and aliases without using character names',async()=>{
  const file=await fs.readFile(new URL('../data/artist-names.json',import.meta.url),'utf8');
  const rows=prepareArtistDirectory(JSON.parse(file));
  const search=query=>searchArtistDirectory(rows,query,{exact:true});
  assert.equal(search('朝凪')[0].tag,'asanagi');
  assert.equal(search('Fatalpulse')[0].tag,'asanagi');
  assert.equal(search('王凌')[0].tag,'wlop');
  assert.deepEqual(searchArtistDirectory(rows,'朝凪海'),[]);
});
