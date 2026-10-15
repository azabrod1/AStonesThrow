// Assembles the published site in _site/: what GitHub Pages serves, nothing
// else (no tools, shots or node_modules).
//
//   node tools/build-site.mjs        (npm run site)
//
// There is no build step: the page is index.html and its modules, loading
// Three.js from jsDelivr, plus the sky panorama. SITE_FILES is the whole list,
// so a new file or folder the page loads at run time must be added here, or
// the deployed page will 404 on it. tools/site-check.mjs loads _site/ under
// the Pages path to catch that before a push. .github/workflows/deploy.yml runs
// this script on every push to main.
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_FILES = ['index.html', 'src', 'assets'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDirectory = path.join(root, '_site');
await rm(siteDirectory, { recursive: true, force: true });
await mkdir(siteDirectory);
for (const entry of SITE_FILES) await cp(path.join(root, entry), path.join(siteDirectory, entry), { recursive: true });
console.log(`[site] ${SITE_FILES.join(', ')} -> _site/`);
