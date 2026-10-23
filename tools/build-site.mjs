// Assembles the published site in _site/: what GitHub Pages serves, nothing
// else (no tools, shots or node_modules).
//
//   node tools/build-site.mjs        (npm run site)
//
// The published page serves its pinned Three.js modules from vendor/ so a
// third-party CDN cannot block startup. Use Three.js's official minified build. Local development keeps the import
// map's CDN URLs. SITE_FILES lists application assets,
// so a new file or folder the page loads at run time must be added here, or
// the deployed page will 404 on it. UNPUBLISHED leaves out what lies among
// them but the page never loads: the sky's Radiance panoramas
// (assets/sky/*.hdr), the source tools/sky-encode.mjs makes the page's JPEGs
// from. tools/site-check.mjs loads _site/ under
// the Pages path to catch that before a push. .github/workflows/deploy.yml runs
// this script on every push to main.
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_FILES = ['index.html', 'src', 'assets'];
const UNPUBLISHED = /\.hdr$/;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDirectory = path.join(root, '_site');
await rm(siteDirectory, { recursive: true, force: true });
await mkdir(siteDirectory);
for (const entry of SITE_FILES) await cp(path.join(root, entry), path.join(siteDirectory, entry), { recursive: true, filter: (source) => !UNPUBLISHED.test(source) });
// Keep the import-map version and the installed modules in agreement.
const htmlPath = path.join(siteDirectory, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const { version } = JSON.parse(await readFile(path.join(root, 'node_modules/three/package.json'), 'utf8'));
const cdnPrefix = `https://cdn.jsdelivr.net/npm/three@${version}/`;
if (!html.includes(`${cdnPrefix}build/three.module.js`) || !html.includes(`${cdnPrefix}examples/jsm/`)) {
  throw new Error('Three.js import map does not match the installed version');
}
for (const file of ['build/three.module.min.js', 'build/three.core.min.js', 'examples/jsm/loaders/UltraHDRLoader.js', 'LICENSE']) {
  const destination = path.join(siteDirectory, 'vendor/three', file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, 'node_modules/three', file), destination);
}
// Every module the page loads, preloaded with the page: a browser otherwise
// finds a module's imports only once it has the module, a round trip a level
// (src/ is four deep, three.core.min.js under three.module.min.js and the
// sky's UltraHDRLoader.js under src/sky.js). The modules are the page's own
// imports (import('./src/…') in index.html) and theirs, static imports and
// re-exports, followed through src/, and those two vendored ones.
function pageModules(page) {
  const found = new Set();
  const waiting = [...page.matchAll(/import\('\.\/(src\/[^']+)'\)/g)].map((match) => match[1]);
  while (waiting.length) {
    const file = waiting.shift();
    if (found.has(file)) continue;
    found.add(file);
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/gm)) {
      waiting.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1] ?? match[2])));
    }
  }
  return [...found];
}
const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map((match) => match[1]));
const modules = pageModules(html);
if (!modules.includes('src/main.js')) throw new Error('index.html no longer imports ./src/main.js: the module preloads cannot be found');
const preloads = [...modules, 'vendor/three/build/three.core.min.js', 'vendor/three/examples/jsm/loaders/UltraHDRLoader.js'].filter((file) => !preloaded.has(file)).map((file) => `<link rel="modulepreload" href="./${file}">`);
const lastPreload = html.lastIndexOf('<link rel="modulepreload"');
const afterLastPreload = html.indexOf('\n', lastPreload) + 1;
const withPreloads = `${html.slice(0, afterLastPreload)}${preloads.join('\n')}\n${html.slice(afterLastPreload)}`;
// Rewrite both the import map and module preloads to the same published file.
await writeFile(htmlPath, withPreloads.replaceAll(cdnPrefix, './vendor/three/').replaceAll('build/three.module.js', 'build/three.module.min.js'));
console.log(`[site] ${SITE_FILES.join(', ')} -> _site/; ${preloaded.size + preloads.length} module preloads`);
