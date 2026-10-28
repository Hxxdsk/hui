import test from 'node:test';
import assert from 'node:assert/strict';
import {promptTokens,categoryRuns,categoryFor,bilingualChat} from '../public/prompt-preview.js';
import {composePrefixedPrompt} from '../public/prompt-prefixes.js';
import {appendRequestInstructions} from '../public/request-prompts.js';
test('semantic preview preserves interleaved order, weights and raw prompt independent of visual language',()=>{
 const state={prefixes:[{id:'q',positive:'score_9, best quality',negative:'low quality'}],positivePrefixes:['q'],negativePrefixes:['q'],positive:[{text:'long hair',weight:1.5,cn:'长发'},{text:'soft lighting',weight:1},{text:'highres',weight:1}],negative:[{text:'bad hands',weight:1}],nltags:'A girl reads a book.',translations:{'soft lighting':'柔光'}};
 const snapshot=structuredClone(state),tokens=promptTokens(state,'positive');assert.deepEqual(tokens.map(t=>t.raw),['score_9','best quality','(long hair:1.5)','soft lighting','highres','A girl reads a book.']);assert.deepEqual(categoryRuns(tokens).map(r=>r.kind),['quality','appearance','scene','quality','narrative']);assert.deepEqual(state,snapshot);assert.equal(categoryFor({text:'hair ornament'}),'clothing');assert.equal(categoryFor({text:'bad hands'}),'correction');
 const raw=composePrefixedPrompt(state.prefixes,state.positivePrefixes,'positive','(long hair:1.5), soft lighting, highres',state.nltags);assert.ok(!raw.includes('长发'));assert.match(bilingualChat(raw,'low quality, bad hands'),/正向 Prompt（Positive）：[\s\S]+负向 Prompt（Negative）：/);
});
test('tail instructions merge into a multimodal user turn without changing the source or adding consecutive user messages',()=>{
 const source=[{role:'user',content:[{type:'text',text:'原文'},{type:'image_url',image_url:{url:'data:image/png;base64,a'}}]}],wire=appendRequestInstructions(source,['只输出 JSON','从末尾继续']);assert.equal(wire.length,1);assert.equal(wire[0].content.at(-1).text,'只输出 JSON\n\n从末尾继续');assert.equal(source[0].content.length,2);assert.equal(appendRequestInstructions([{role:'assistant',content:'已有回复'}],['继续']).at(-1).role,'user');
});
