import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeCompletion, trimContext, estimateTokens, messageContent, splitTags } from '../public/core.js';
const encoder = new TextEncoder();
function streamResponse(text, width = 1) { const bytes = encoder.encode(text); return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += width) c.enqueue(bytes.slice(i,i+width)); c.close(); } }), { headers: { 'Content-Type':'text/event-stream' } }); }
test('SSE retains Chinese text split at byte boundaries and finish reason', async () => {
  let text = '';
  const response = streamResponse(': keepalive\r\n\r\ndata: {"choices":[{"delta":{"content":"你好，"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"灯下"},"finish_reason":"length"}]}\n\ndata: {"usage":{"total_tokens":22},"choices":[]}\n\ndata: [DONE]\n\n');
  const result = await consumeCompletion(response, s => text += s);
  assert.equal(text,'你好，灯下'); assert.equal(result.reason,'length'); assert.equal(result.usage.total_tokens,22);
});
test('unterminated final event is consumed and premature close is identified', async () => {
  let text = ''; const result = await consumeCompletion(streamResponse('data: {"choices":[{"delta":{"content":"部分"}}]}'), s => text += s);
  assert.equal(text,'部分'); assert.equal(result.reason,'interrupted');
});
test('non-stream JSON and refusals are retained', async () => {
  let text = ''; const result = await consumeCompletion(Response.json({choices:[{message:{refusal:'无法处理'},finish_reason:'content_filter'}]}),s => text += s);
  assert.equal(text,'无法处理'); assert.equal(result.reason,'content_filter');
});
test('HTTP and provider SSE errors reject with a useful message', async () => {
  await assert.rejects(consumeCompletion(Response.json({error:'额度不足'},{status:429}),()=>{}),/额度不足/);
  await assert.rejects(consumeCompletion(streamResponse('data: {"error":{"message":"服务错误"}}\n\n'),()=>{}),/服务错误/);
  await assert.rejects(consumeCompletion(streamResponse('data: invalid\n\n'),()=>{}),/无效/);
});
test('context trimming removes full turns and retains system/latest user', () => {
  const messages = [{role:'system',content:'设定'},{role:'user',content:'旧问题'.repeat(100)},{role:'assistant',content:'旧回复'.repeat(100)},{role:'user',content:'新问题'}];
  const result = trimContext(messages,100);
  assert.deepEqual(result.messages,[messages[0],messages[3]]); assert.equal(result.removed,1);
  assert.ok(estimateTokens([{content:[{type:'text',text:'图'},{type:'image_url',image_url:{url:'data:'}}]}]) > 1600);
});
test('multimodal messages preserve images and text attachments', () => {
  const result = messageContent({text:'分析',files:[{type:'image',data:'data:image/png;base64,eA=='},{type:'text',name:'a.txt',text:'资料'}]});
  assert.equal(result[1].type,'image_url'); assert.match(result[0].text,/资料/); assert.deepEqual(splitTags('a, b，c\nd'),['a','b','c','d']);
});
