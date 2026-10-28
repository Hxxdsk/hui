// Manual UI QA fixture only. Never points at a paid provider.
import http from 'node:http';
http.createServer(async (req,res)=>{
  res.setHeader('Content-Type','application/json');
  if (req.url === '/v1/models') return res.end(JSON.stringify({data:[{id:'lantern-test-vision'},{id:'lantern-test-chat'}]}));
  const chunks=[]; for await (const chunk of req) chunks.push(chunk);
  const data=JSON.parse(Buffer.concat(chunks));
  if (!data.stream) return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({translation:'silver hair, neon street, rain',pairs:[{source:'银色长发',target:'silver hair'},{source:'霓虹街道',target:'neon street'},{source:'雨',target:'rain'}]})},finish_reason:'stop'}]}));
  const continuation=data.messages.at(-1)?.content?.includes?.('请紧接上一条');
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const parts=continuation?['\n\n雨中的霓虹街道，','映着银色长发的轮廓。\n\n','（本地测试接口 · 续写完成）']:['你好，这是一条本地测试回复。\n\n','图片和文件会随消息一起发送，','对话内容会保存在当前浏览器。'];
  for(const content of parts) res.write(`data: ${JSON.stringify({choices:[{delta:{content}}]})}\n\n`);
  res.end(`data: ${JSON.stringify({choices:[{delta:{},finish_reason:continuation?'stop':'length'}]})}\n\ndata: [DONE]\n\n`);
}).listen(3211,'127.0.0.1',()=>console.log('UI QA provider: http://127.0.0.1:3211/v1'));
