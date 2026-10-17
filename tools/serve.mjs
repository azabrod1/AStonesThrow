// Tiny static server for local development: node tools/serve.mjs [port]
// Then open http://localhost:8123/ (Three.js loads from the CDN).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8123);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.md': 'text/markdown' };

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.join(root, pathname);
    if (!file.startsWith(root)) throw new Error('outside root');
    const data = await readFile(file);
    // Never cached, so a reload always runs the files as they are on disk.
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
}).listen(port, () => console.log(`A Stone’s Throw: http://localhost:${port}/`));
