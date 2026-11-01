// Real streaming HTTP regressions for inactivity deadlines and body decoding.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { loadAsset, dropEarlyAssets } from '../src/loadAsset.js';

const json = { label: 'Rain ☔', ready: true };
const requests = new Map();   // by url
const server = createServer((request, response) => {
  requests.set(request.url, (requests.get(request.url) ?? 0) + 1);
  const route = request.url.split('?')[0];
  if (route === '/headers-stall') return;
  if (route === '/missing') { response.writeHead(404); response.end(); return; }
  if (route === '/after-freeze') { setTimeout(() => response.end(JSON.stringify(json)), 500); return; }
  if (route === '/invalid') { response.end('{broken'); return; }
  if (route === '/compressed') {
    const compressed = gzipSync(JSON.stringify(json));
    response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': compressed.length });
    response.end(compressed);
    return;
  }
  response.writeHead(200);
  response.flushHeaders();
  if (route === '/body-stall') { response.write('partial'); return; }
  const bytes = Buffer.from(JSON.stringify(json));
  let offset = 0;
  // Each byte progresses well within the deadline, but the total exceeds it.
  // One byte per write also splits the multibyte UTF-8 character across chunks.
  const timer = setInterval(() => {
    response.write(bytes.subarray(offset, ++offset));
    if (offset === bytes.length) { clearInterval(timer); response.end(); }
  }, 30);
  response.on('close', () => clearInterval(timer));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  // Node's fetch loads its HTTP client at its first request, which on a cold CI runner can take longer than the
  // deadlines below (it aborted the first of them there once): one untimed request first.
  await (await fetch(`${origin}/compressed?warm`)).arrayBuffer();
  const started = performance.now();
  assert.deepEqual(await loadAsset(`${origin}/slow`, 'json', { timeout: 300 }), json);
  assert(performance.now() - started > 300);
  console.log('PASS: progressing transfer outlives its idle deadline and preserves split UTF-8');
  const binary = await loadAsset(`${origin}/compressed`, 'arrayBuffer');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(binary)), json);
  console.log('PASS: gzip body decoding does not rely on compressed Content-Length');
  for (const endpoint of ['headers-stall', 'body-stall']) {
    await assert.rejects(loadAsset(`${origin}/${endpoint}`, 'arrayBuffer', { timeout: 100 }), { name: 'AbortError' });
  }
  console.log('PASS: stalled headers and a body stalled after partial data both abort');
  // A page frozen past the deadline (the main thread held: a slow GPU compiling its programs) could not take the
  // progress the network made, so its timer, firing late, gives the request a fresh timeout; one truly stalled is
  // still aborted a timeout later. The freeze holds this process's server too: it answers, 500 ms in, once it ends.
  const freeze = (milliseconds) => { const until = performance.now() + milliseconds; while (performance.now() < until); };
  const afterFreeze = loadAsset(`${origin}/after-freeze`, 'json', { timeout: 200 });
  const stalledThroughFreeze = loadAsset(`${origin}/headers-stall?freeze`, 'json', { timeout: 200 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  freeze(700);
  assert.deepEqual(await afterFreeze, json);
  await assert.rejects(stalledThroughFreeze, { name: 'AbortError' });
  console.log('PASS: a page frozen past the deadline gives the request a fresh one; a request stalled through it still aborts');
  for (const endpoint of ['headers-stall', 'body-stall', 'slow']) {
    const controller = new AbortController();
    const pending = loadAsset(`${origin}/${endpoint}`, 'arrayBuffer', { signal: controller.signal });
    setTimeout(() => controller.abort(), 60);
    await assert.rejects(pending, { name: 'AbortError' });
  }
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(loadAsset(`${origin}/compressed`, 'json', { signal: cancelled.signal }), { name: 'AbortError' });
  console.log('PASS: caller cancellation aborts before headers, during streaming and before a request');
  await assert.rejects(loadAsset(`${origin}/missing`), /HTTP 404/);
  await assert.rejects(loadAsset(`${origin}/invalid`), SyntaxError);
  assert.deepEqual(await loadAsset(`${origin}/compressed`), json);
  console.log('PASS: HTTP and parse failures propagate; subsequent downloads still succeed');
  // index.html's early fetches (window.__earlyAssets): a load takes its url's request over, asking for nothing more,
  // under its own deadline; dropEarlyAssets aborts those no load took.
  const early = (href) => { const controller = new AbortController(); return { response: fetch(href, { signal: controller.signal }), controller }; };
  globalThis.__earlyAssets = new Map([`${origin}/compressed?early`, `${origin}/headers-stall?early`, `${origin}/headers-stall?unused`].map((href) => [href, early(href)]));
  const unused = globalThis.__earlyAssets.get(`${origin}/headers-stall?unused`).response;
  assert.deepEqual(await loadAsset(`${origin}/compressed?early`), json);
  assert.equal(requests.get('/compressed?early'), 1);
  await assert.rejects(loadAsset(`${origin}/headers-stall?early`, 'json', { timeout: 100 }), { name: 'AbortError' });
  assert.equal(requests.get('/headers-stall?early'), 1);
  dropEarlyAssets();
  await assert.rejects(unused, { name: 'AbortError' });
  assert.equal(globalThis.__earlyAssets.size, 0);
  assert.deepEqual(await loadAsset(`${origin}/compressed?early`), json);   // taken once: a later load fetches afresh
  assert.equal(requests.get('/compressed?early'), 2);
  delete globalThis.__earlyAssets;
  console.log('PASS: a load takes over the page\'s early request for its url, under its deadline; those no load took are aborted');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
