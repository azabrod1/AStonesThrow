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
// Rewrite both the import map and module preloads to the same published file.
await writeFile(htmlPath, html.replaceAll(cdnPrefix, './vendor/three/').replaceAll('build/three.module.js', 'build/three.module.min.js'));
console.log(`[site] ${SITE_FILES.join(', ')} -> _site/`);
