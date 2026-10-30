import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { translateWithService } from './translation.mjs';
import {animaStatus,animaContext,animaValidate,startAnimaInstall,cancelAnimaInstall,startAnimaUninstall} from './anima-service.mjs';
import {createPreferencesStore} from './preferences.mjs';
import {checkForUpdates,currentVersion,currentDisplayVersion} from './updates.mjs';
import {createDesktopLifecycle} from './desktop-lifecycle.mjs';
import {createUpdateManager} from './update-manager.mjs';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const MAX_BODY = 36 * 1024 * 1024;
export function endpoint(base, route) {
  const url = new URL(base.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('地址必须为 http(s)，且不能包含账号密码');
  url.search = ''; url.hash = '';
  let p = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/, '');
  if (!p) p = '/v1';
  url.pathname = `${p}/${route}`;
  return url;
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { const e = new Error('请求超过 36 MB，请减少附件'); e.status = 413; throw e; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('请求 JSON 无效'); }
}
export function createApp({translationHandler=translateWithService,preferencesStore=createPreferencesStore(),desktopLifecycle,updateManager}={}) {
  const lifecycle=desktopLifecycle||createDesktopLifecycle();const updates=updateManager||createUpdateManager({managed:false});
  const app=http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Loopback only; reject DNS rebinding and browser requests from other origins.
    const hosts = ['127.0.0.1', 'localhost', '[::1]'];
    if (!hosts.some(h => req.headers.host === h || req.headers.host?.startsWith(`${h}:`))) return json(res, 403, { error: '仅允许本机访问' });
    if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(res, 403, { error: '不允许跨站请求' });
    const pathname = new URL(req.url, 'http://localhost').pathname;
    try {
      if (pathname === '/api/health') return json(res, 200, { ok: true });
      if (pathname === '/api/version') return json(res,200,{version:currentVersion,displayVersion:currentDisplayVersion});
      if(pathname==='/api/session/status')return json(res,200,lifecycle.status());
      if (pathname.startsWith('/api/')) {
        if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return json(res, 405, { error: '请使用 JSON POST' });
        const data = await body(req);
        if(pathname==='/api/updates/check')return json(res,200,await checkForUpdates({force:!!data.force}));
        if(pathname==='/api/updates/status')return json(res,200,{...updates.status(),displayVersion:currentDisplayVersion,result:await updates.result()});
        if(pathname==='/api/updates/start')return json(res,202,updates.start(data.version));
        if(pathname==='/api/session/open')return json(res,200,lifecycle.open(data.id));
        if(pathname==='/api/session/ping')return json(res,200,lifecycle.ping(data.id));
        if(pathname==='/api/session/quit')return json(res,200,lifecycle.quit());
        if(pathname==='/api/session/close')return json(res,200,lifecycle.close(data.id));
        if(pathname==='/api/preferences/load')return json(res,200,await preferencesStore.load());
        if(pathname==='/api/preferences/save')return json(res,200,await preferencesStore.save(data));
        if(pathname.startsWith('/api/anima/')){
          if(pathname==='/api/anima/status')return json(res,200,await animaStatus(data));
          if(pathname==='/api/anima/install')return json(res,202,await startAnimaInstall(data));
          if(pathname==='/api/anima/uninstall')return json(res,202,await startAnimaUninstall());
          if(pathname==='/api/anima/cancel')return json(res,200,cancelAnimaInstall());
          const controller=new AbortController();const unlimitedImage=pathname==='/api/anima/context'&&data.localImages&&Array.isArray(data.images)&&data.images.length>0;const timer=unlimitedImage?null:setTimeout(()=>controller.abort(),660000);
          const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
          try{
            if(pathname==='/api/anima/context')return json(res,200,await animaContext(data,controller.signal));
            if(pathname==='/api/anima/validate')return json(res,200,await animaValidate(data,controller.signal));
            return json(res,404,{error:'技能接口不存在'});
          }finally{clearTimeout(timer);res.off('close',disconnect);}
        }
        if(pathname==='/api/translate'){
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
          const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
          try{return json(res,200,await translationHandler(data,{signal:controller.signal}));}finally{clearTimeout(timer);res.off('close',disconnect);}
        }
        if (pathname === '/api/extract') {
          const buffer = Buffer.from(data.data || '', 'base64');
          if (buffer.length > 15 * 1024 * 1024) throw new Error('单个文档不能超过 15 MB');
          let text;
          if (/\.pdf$/i.test(data.name)) {
            const { default: parse } = await import('pdf-parse/lib/pdf-parse.js');
            text = (await parse(new Uint8Array(buffer))).text;
          } else if (/\.docx$/i.test(data.name)) {
            const { default: mammoth } = await import('mammoth');
            text = (await mammoth.extractRawText({ buffer })).value;
          } else throw new Error('此提取接口支持 PDF 和 DOCX');
          if (text.length > 180000) throw new Error('文档文字超过 18 万字符，请拆分文件');
          if (!text.trim()) throw new Error('未提取到文字；扫描版 PDF 请先 OCR，或上传页面图片');
          return json(res, 200, { text });
        }
        if (!['/api/models', '/api/chat'].includes(pathname)) return json(res, 404, { error: '接口不存在' });
        const target = endpoint(data.baseUrl || '', pathname === '/api/models' ? 'models' : 'chat/completions');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('请求超过 5 分钟')), 300000);
        const disconnect = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', disconnect);
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (data.key) headers.Authorization = `Bearer ${data.key}`;
          const upstream = await fetch(target, {
            method: pathname === '/api/models' ? 'GET' : 'POST', headers,
            body: pathname === '/api/models' ? undefined : JSON.stringify(data.payload),
            signal: controller.signal, redirect: 'error'
          });
          if (!upstream.ok) {
            const raw = await upstream.text();
            let message;
            try { const parsed = JSON.parse(raw); message = parsed.error?.message || parsed.message; } catch {}
            // Never reflect a provider's echoed credentials back into the UI.
            message = String(message || `服务商返回 HTTP ${upstream.status}`).slice(0, 1200);
            if (data.key) message = message.split(data.key).join('[已隐藏]');
            return json(res, upstream.status, { error: message });
          }
          if (pathname === '/api/models') {
            const result = await upstream.json();
            const list = Array.isArray(result.data) ? result.data : Array.isArray(result.models) ? result.models : [];
            return json(res, 200, { models: list.map(m => typeof m === 'string' ? m : m.id || m.name).filter(Boolean) });
          }
          res.writeHead(200, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          for await (const chunk of upstream.body) {
            if (res.destroyed) break;
            if (!res.write(chunk)) await new Promise(resolve => { const finish = () => { res.off('drain',finish); res.off('close',finish); resolve(); }; res.once('drain',finish); res.once('close',finish); });
          }
          res.end();
        } finally { clearTimeout(timer); res.off('close', disconnect); }
        return;
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      const vendor = { '/vendor/marked.js': '../node_modules/marked/lib/marked.esm.js', '/vendor/purify.js': '../node_modules/dompurify/dist/purify.es.mjs' };
      if (vendor[pathname]) {
        res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-cache' });
        res.end(await readFile(path.join(publicRoot,vendor[pathname]))); return;
      }
      const dataFiles = { '/data/anima-index.json':'anima-index.json', '/data/Anima-preview.csv':'Anima-preview.csv', '/data/SOURCES.md':'SOURCES.md' };
      if(dataFiles[pathname]) {
        const name=dataFiles[pathname];
        res.writeHead(200, { 'Content-Type':name.endsWith('.json')?'application/json; charset=utf-8':name.endsWith('.csv')?'text/csv; charset=utf-8':'text/plain; charset=utf-8', 'Cache-Control':'no-cache', ...(name.endsWith('.csv')?{'Content-Disposition':'attachment; filename="Anima-preview.csv"'}:{}) });
        res.end(await readFile(fileURLToPath(new URL(`./data/${name}`,import.meta.url))));return;
      }
      const files = { '/': 'index.html', '/app.js': 'app.js', '/desktop-ui.js':'desktop-ui.js', '/core.js': 'core.js', '/style.css': 'style.css', '/anima.css':'anima.css', '/features.css':'features.css', '/hui.css':'hui.css', '/patchouli.css':'patchouli.css', '/workbench.css':'workbench.css', '/brand.svg':'brand.svg', '/prompt-preview.css':'prompt-preview.css', '/prompt-preview.js':'prompt-preview.js', '/settings-store.js':'settings-store.js', '/settings-backup.js':'settings-backup.js', '/request-prompts.js':'request-prompts.js', '/anima-skill-ui.js':'anima-skill-ui.js', '/anima-core.js':'anima-core.js', '/anima-ui.js':'anima-ui.js', '/anima-worker.js':'anima-worker.js', '/prompt-prefixes.js':'prompt-prefixes.js', '/translation-core.js':'translation-core.js', '/translation-ui.js':'translation-ui.js' };
      const file = files[pathname];
      if (!file) return json(res, 404, { error: 'Not found' });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg':'image/svg+xml' }[path.extname(file)];
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(await readFile(path.join(publicRoot, file)));
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      json(res, error.status || 400, { error: error.name === 'AbortError' ? '请求已取消或超时' : (error.message || '请求失败') });
    }
  });app.on('close',()=>{lifecycle.dispose();updates.dispose();});return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3210);
  let app;const stop=()=>{app.close();app.closeAllConnections();setTimeout(()=>process.exit(0),100).unref();};
  const updates=createUpdateManager({onReady:()=>setTimeout(stop,2500)});
  const lifecycle=createDesktopLifecycle({enabled:process.env.HUI_MANAGED==='1',shutdown:stop,busy:()=>updates.busy()});
  app = createApp({desktopLifecycle:lifecycle,updateManager:updates});
  app.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。若绘已启动，请直接打开 http://127.0.0.1:${port}` : error.message); process.exitCode = 1; });
  app.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`绘 已启动：${url}\n关闭此窗口可停止服务。`);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      const opener = spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{ windowsHide:true,stdio:'ignore' });
      opener.on('error',()=>console.log(`请手动在浏览器中打开 ${url}`));
    }
  });
}
