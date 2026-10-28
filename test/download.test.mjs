import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {downloadFile} from '../anima-download.mjs';
test('portable downloader resumes validated ranges and restarts when a server ignores Range',async t=>{
 const bytes=Buffer.from('portable-model-fixture-'.repeat(200));let requested;
 const server=http.createServer((req,res)=>{requested=req.headers.range;if(req.url==='/range'&&requested){const offset=Number(requested.match(/\d+/)[0]);res.writeHead(206,{'Content-Range':`bytes ${offset}-${bytes.length-1}/${bytes.length}`,'Content-Length':bytes.length-offset});res.end(bytes.subarray(offset));}else{res.writeHead(200,{'Content-Length':bytes.length});res.end(bytes);}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const dir=await mkdtemp(path.join(tmpdir(),'hui-download-')),file=path.join(dir,'model.part');t.after(async()=>{await unlink(file);await rmdir(dir);});const root='http://127.0.0.1:'+server.address().port;
 await writeFile(file,bytes.subarray(0,123));await downloadFile(root+'/range',file);assert.equal(requested,'bytes=123-');assert.deepEqual(await readFile(file),bytes);
 await writeFile(file,bytes.subarray(0,123));await downloadFile(root+'/ignore-range',file);assert.deepEqual(await readFile(file),bytes);
});
