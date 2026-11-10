// Writes the Birds section of CREDITS.md and credits.html from the credit records the bird tools write
// (assets/birds/birds.json, by tools/bird-sprites.py; assets/birds/models.json, by tools/bird-models.py): every
// photograph a shipped bird image is cut or painted from, by kind, the kinds in the order of the places they live at
// (src/birds.js BIRDS_BY_PLACE). Rerun it whenever either tool is rerun; never edit the section by hand.
//
//   node tools/bird-credits.mjs           (rewrites both files' sections)
//   node tools/bird-credits.mjs --check   (fails if either is not as it would write it)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIRDS_BY_PLACE, BIRD_KINDS } from '../src/birds.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sprites = JSON.parse(await readFile(path.join(root, 'assets/birds/birds.json'), 'utf8'));
const models = JSON.parse(await readFile(path.join(root, 'assets/birds/models.json'), 'utf8'));

// Each kind's credits: its model's first, then its pictures' frames, each photograph once.
const creditsByKind = new Map();
const add = (kind, credit) => {
  const list = creditsByKind.get(kind) ?? [];
  if (!list.some((known) => known.source === credit.source)) list.push(credit);
  creditsByKind.set(kind, list);
};
for (const [kind, model] of Object.entries(models)) for (const credit of model.credits) add(kind, credit);
for (const [frame, { credit }] of Object.entries(sprites.frames)) add(frame.split('-')[0], credit);

// Where each kind lives, by place, in BIRDS_BY_PLACE's order, each place by its Location card's name (index.html).
const page = await readFile(path.join(root, 'index.html'), 'utf8');
const placeNames = Object.fromEntries([...page.matchAll(/class="menu-card" role="radio" data-value="([a-z]+)"[^>]*>.*?<b>([^<]+)<\/b>/g)].map(([, value, name]) => [value, name]));
const placesByKind = new Map();
for (const [place, groups] of Object.entries(BIRDS_BY_PLACE)) {
  for (const { kind } of groups) {
    const label = placeNames[place] ?? place;
    const list = placesByKind.get(kind) ?? [];
    if (!list.includes(label)) list.push(label);
    placesByKind.set(kind, list);
  }
}
const kinds = [...placesByKind.keys()].filter((kind) => creditsByKind.has(kind));
const missing = [...placesByKind.keys()].filter((kind) => !creditsByKind.has(kind));
if (missing.length) throw new Error(`no credits recorded for ${missing.join(', ')}`);

const title = (credit) => credit.file.replace(/\.[a-z]+$/i, '');
const shows = (kind) => `${BIRD_KINDS[kind].name} (${placesByKind.get(kind).join(', ')})`;
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const INTRO = 'The birds are photographs of real ones from Wikimedia Commons, cut out of their backgrounds and resized, or for the 3D birds painted onto their models (`tools/bird-sprites.py`, `tools/bird-models.py`; this section is written by `tools/bird-credits.mjs` from the credits they record).';

const markdownRows = kinds.flatMap((kind) => creditsByKind.get(kind).map((credit) => `| ${shows(kind)} | [${title(credit)}](${credit.source}) | ${credit.author} | [${credit.licence}](${credit.licenceUrl}) |`));
const markdown = ['## Birds', '', INTRO, '', '| Shows | Photograph | Author | Licence |', '|---|---|---|---|', ...markdownRows, ''].join('\n');

const htmlIntro = escape(INTRO).replace(/`([^`]+)`/g, '<code>$1</code>');
const htmlRows = kinds.flatMap((kind) => creditsByKind.get(kind).map((credit) => `<tr><td>${escape(shows(kind))}</td><td><a href="${escape(credit.source)}">${escape(title(credit))}</a></td><td>${escape(credit.author)}</td><td><a href="${escape(credit.licenceUrl)}">${escape(credit.licence)}</a></td></tr>`));
const html = ['<h2>Birds</h2>', `<p>${htmlIntro}</p>`, '<div class="table"><table>', '<tr><th>Shows</th><th>Photograph</th><th>Author</th><th>Licence</th></tr>', ...htmlRows, '</table></div>', ''].join('\n');

// The section goes before Skies; one already there is replaced.
const place = (text, section, heading, next) => {
  const start = text.indexOf(heading);
  if (start >= 0) {
    const end = text.indexOf(next, start + heading.length);
    return text.slice(0, start) + section + text.slice(end);
  }
  const before = text.indexOf(next);
  if (before < 0) throw new Error(`no ${next} to put the birds before`);
  return text.slice(0, before) + section + text.slice(before);
};
const check = process.argv.includes('--check');
let stale = false;
for (const [file, section, heading, next] of [['CREDITS.md', `${markdown}\n`, '## Birds', '## Skies'], ['credits.html', html, '<h2>Birds</h2>', '<h2>Skies</h2>']]) {
  const full = path.join(root, file);
  const text = await readFile(full, 'utf8');
  const written = place(text, section, heading, next);
  if (written === text) continue;
  if (check) { console.log(`${file}: its Birds section is not as tools/bird-credits.mjs writes it`); stale = true; } else { await writeFile(full, written); console.log(`wrote ${file}`); }
}
if (stale) process.exit(1);
console.log(`${kinds.length} kinds, ${kinds.reduce((sum, kind) => sum + creditsByKind.get(kind).length, 0)} photographs`);
