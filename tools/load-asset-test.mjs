// Real streaming HTTP regressions for inactivity deadlines and body decoding.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { loadAsset } from '../src/loadAsset.js';

const json = { label: 'Rain ☔', ready: true };
const server = createServer((request, response) => {
  if (request.url === '/headers-stall') return;
  if (request.url === '/missing') { response.writeHead(404); response.end(); return; }
  if (request.url === '/invalid') { response.end('{broken'); return; }
  if (request.url === '/compressed') {
    const compressed = gzipSync(JSON.stringify(json));
    response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': compressed.length });
    response.end(compressed);
    return;
  }
  response.writeHead(200);
  response.flushHeaders();
  if (request.url === '/body-stall') { response.write('partial'); return; }
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
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
