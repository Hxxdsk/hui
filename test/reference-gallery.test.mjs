import test from 'node:test';
import assert from 'node:assert/strict';
import {findReferencePosts} from '../server.mjs';

test('including adult references keeps general results, removes the rating filter and rejects unrelated media hosts',async()=>{
  const request=async url=>{
    assert.equal(url.searchParams.get('page'),'2');
    assert.equal(url.searchParams.get('tags'),'torn_pantyhose');
    const cdn=url.hostname==='aibooru.online'?'cdn.aibooru.online':'cdn.donmai.us';
    return Response.json([
      {id:5,rating:'e',media_asset:{variants:[{type:'360x360',url:'https://'+cdn+'/image.webp'}]}},
      {id:6,rating:'g',preview_file_url:'https://'+cdn+'/general.jpg'},
      {id:7,rating:'q',preview_file_url:'https://'+cdn+'.example.com/image.jpg'}
    ]);
  };
  const result=await findReferencePosts({tag:'torn_pantyhose',page:2,rating:'all'},request);
  assert.equal(result.unavailable,0);
  assert.deepEqual(result.images.map(image=>image.url),['https://danbooru.donmai.us/posts/5','https://danbooru.donmai.us/posts/6','https://aibooru.online/posts/5','https://aibooru.online/posts/6']);
});

test('a reference source remains available if the other fails, with general-rated images only',async()=>{
  const result=await findReferencePosts({tag:'long_hair',page:1,rating:'general'},async url=>{
    assert.equal(url.searchParams.get('tags'),'long_hair rating:g');
    if(url.hostname==='danbooru.donmai.us')return new Response(null,{status:503});
    return Response.json([
      {id:1,rating:'g',preview_file_url:'https://cdn.aibooru.online/general.jpg'},
      {id:2,rating:'e',preview_file_url:'https://cdn.aibooru.online/other.jpg'}
    ]);
  });
  assert.equal(result.unavailable,1);
  assert.deepEqual(result.images.map(image=>image.url),['https://aibooru.online/posts/1']);
});
