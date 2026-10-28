import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createApp, endpoint } from '../server.mjs';
import { consumeCompletion } from '../public/core.js';
import { docxFixture, pdfFixture } from './fixtures.mjs';

test('base URLs accept custom paths and prevent duplicate chat endpoints', () => {
  assert.equal(endpoint('https://example.com','models').href,'https://example.com/v1/models');
  assert.equal(endpoint('http://localhost:8000/custom/v1/chat/completions','models').pathname,'/custom/v1/models');
  assert.throws(()=>endpoint('file:///etc/passwd','models'));
  assert.throws(()=>endpoint('https://secret@example.com','models'));
});
test('local proxy detects models, forwards multimodal body, streams, redacts errors and blocks cross-site access', async t => {
  let posted, auth;
  const mock = http.createServer(async (req,res) => {
    auth = req.headers.authorization;
    if (req.url === '/v1/models') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({data:[{id:'test-vision'},{id:'test-chat'}]})); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk); posted = JSON.parse(Buffer.concat(chunks));
    if (posted.model === 'error') { res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:`bad key: ${auth.slice(7)}`}})); return; }
    res.writeHead(200,{'Content-Type':'text/event-stream'}); res.end('data: {"choices":[{"delta":{"content":"成功"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  const app = createApp(); mock.listen(0,'127.0.0.1'); app.listen(0,'127.0.0.1'); await Promise.all([once(mock,'listening'),once(app,'listening')]);
  t.after(()=>{ app.closeAllConnections(); app.close(); mock.closeAllConnections(); mock.close(); });
  const root = `http://127.0.0.1:${app.address().port}`, baseUrl = `http://127.0.0.1:${mock.address().port}/v1`;
  const send = (route,data,extra={}) => fetch(root+route,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify({baseUrl,key:'test-secret',...data})});
  const list = await (await send('/api/models',{})).json(); assert.deepEqual(list.models,['test-vision','test-chat']); assert.equal(auth,'Bearer test-secret');
  const payload = {model:'test-vision',messages:[{role:'user',content:[{type:'text',text:'图片'},{type:'image_url',image_url:{url:'data:image/png;base64,eA=='}}]}],stream:true};
  let output = ''; await consumeCompletion(await send('/api/chat',{payload}),text=>output+=text); assert.equal(output,'成功'); assert.deepEqual(posted,payload);
  const error = await send('/api/chat',{payload:{model:'error'}}); assert.equal(error.status,401); const result = await error.text(); assert.ok(!result.includes('test-secret')); assert.match(result,/已隐藏/);
  assert.equal((await send('/api/models',{}, {Origin:'https://attacker.example'})).status,403);
  const badHostStatus = await new Promise((resolve,reject) => { const request = http.get(root,{headers:{Host:'attacker.example'}},response => { response.resume(); resolve(response.statusCode); }); request.on('error',reject); });
  assert.equal(badHostStatus,403);
  const page = await fetch(root); assert.equal(page.status,200); assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/); assert.match(await page.text(),/<title>绘<\/title>/);
  assert.equal((await fetch(root+'/missing')).status,404);
  for(const route of ['/anima-core.js','/anima-ui.js','/anima-worker.js','/anima.css']) assert.equal((await fetch(root+route)).status,200);
  const csv = await fetch(root+'/data/Anima-preview.csv');assert.equal(csv.status,200);assert.match(csv.headers.get('content-disposition'),/Anima-preview.csv/);assert.match(await csv.text(),/^1girl,0,/);
  const index = await (await fetch(root+'/data/anima-index.json')).json();assert.equal(index.meta.tags,111513);
  assert.equal((await fetch(root+'/data/tags.sqlite')).status,404);
  for (const [name,buffer,expected] of [['sample.docx',docxFixture(),/灯下 Word attachment/],['sample.pdf',pdfFixture(),/Lantern PDF attachment/]]) {
    const extracted = await send('/api/extract',{name,data:buffer.toString('base64')});
    const result = await extracted.json(); assert.equal(extracted.status,200,JSON.stringify(result)); assert.match(result.text,expected);
  }
  assert.equal((await send('/api/extract',{name:'bad.exe',data:'eA=='})).status,400);
});
