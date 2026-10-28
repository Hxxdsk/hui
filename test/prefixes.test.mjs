import test from 'node:test';
import assert from 'node:assert/strict';
import {prefixState,composePrefixedPrompt} from '../public/prompt-prefixes.js';
test('prefix selection only changes the front layer, preserving weighted base tags and their order',()=>{
  const profiles=[{id:'a',name:'A',positive:'highres, (watercolor:1.3)',negative:'low quality'},{id:'b',name:'B',positive:'year 2025, score_9',negative:'watermark'}];
  const body='highres, (long hair:2), @dairi';
  assert.equal(composePrefixedPrompt(profiles,['a','b'],'positive',body),'highres, (watercolor:1.3), year 2025, score_9, '+body);
  assert.equal(composePrefixedPrompt(profiles,['b'],'positive',body),'year 2025, score_9, '+body);
  assert.equal(composePrefixedPrompt(profiles,[],'positive',body),body);
  assert.equal(composePrefixedPrompt(profiles,['a'],'negative','(bad hands:1.5)'),'low quality, (bad hands:1.5)');
  assert.equal(composePrefixedPrompt(profiles,[],'positive',body,'Keep hands apart.'),body+'\nKeep hands apart.');
});
test('legacy quality switch migrates to a selected preset without touching tag arrays',()=>{
  const cached={quality:true,positive:[{text:'highres',weight:2}],negative:[{text:'blurry',weight:1}]},before=structuredClone(cached);
  const state=prefixState(cached);assert.deepEqual(state.positivePrefixes,['anima-original']);assert.deepEqual(state.negativePrefixes,[]);assert.deepEqual(cached,before);
  const custom=prefixState({prefixes:[{id:'x',name:'自定义',positive:'RAW_prefix (tag:2)',negative:'Bad Hands'}],positivePrefixes:['x','missing','x'],negativePrefixes:['x']});
  assert.deepEqual(custom.positivePrefixes,['x']);assert.equal(custom.prefixes[0].positive,'RAW_prefix (tag:2)');
});
