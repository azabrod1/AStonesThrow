// Shared place data: sky, shore, water and its settings card live together.
// New places extend this registry rather than adding special cases to the page.
import { SKY_NAMES, REED_SKIES, skyShore } from './sky.js';

// The places (the Location setting): a sky (src/sky.js SKIES) and what lies
// about the water, the lake's bed and shore, or the Pool's tiled pool on its
// deck in a lawn (`pool`, src/pool.js), by Lakeside's lake and through its
// hours, so that choosing it from Lakeside loads no photo; or another shore
// round the lake's open water (`shoreKind`: src/pondFloor.js setShoreKind,
// and LAKE_BED's uShoreKind, its GLSL twin): the Koi pond (`koi`), a pond in
// a Japanese garden under the same sky, a closed, irregular shore of its own
// (KOI_SHORE), stone-edged with a pebble beach and a garden round it, out of
// reach behind a hedge (src/koiGarden.js), its ground running out to where
// its sky's photo stands as a backdrop (src/sky.js Backdrop), its water's
// sheet only past its shore (src/main.js KOI_SHEET_REACH); or the Polynesian lagoon
// (`tropics`), the lake's beach running out along a lagoon's (LAGOON_SHORE)
// under its palms, with motus across the water and a high island beyond
// (src/tropics.js). A place may have its own water (`water`, a key of
// WATER_CLARITIES, whatever clarity is chosen, and its card, `waterCard`),
// its own ground (`shore`, in place of its sky's), its own start
// (`defaultWater`, `defaultView`), and, at Loch Ness, something far out now
// and then (`visitor`: src/lochVisitor.js). src/main.js applyPlace puts a
// place in force once its sky has come.
// Each place's fish are
// src/fish.js's (FISH_BY_PLACE, by the place's name); its beach's ground is
// its `shore`, else its sky's (SHORE_LOOKS in src/pondFloor.js,
// setShoreLook: sand, shingle, scree...); its reeds (`reeds`, src/reeds.js)
// are its sky's (REED_SKIES) unless it says: the fresh lakes have them,
// the sea cove, the bare rock shore, the salt flat, the frozen alpine
// reservoir, Loch Ness and the lagoon none, and the Pool and the Koi pond
// have their own grounds.
export const PLACES = {
  ...Object.fromEntries(SKY_NAMES.map((name) => [name, { sky: name, pool: false, reeds: REED_SKIES.includes(name) }])),
  swiss: { sky: 'swiss', pool: false, defaultWater: 'frozen', defaultView: 'level' },
  pool: { sky: 'lakeside', pool: true, water: 'pool', waterCard: { image: 'assets/sky/thumbs/pool.jpg', name: 'Pool water', note: 'Filtered: the tiles clear to the bottom' } },
  koi: { sky: 'garden', pool: false, koi: true, shoreKind: 'koi', water: 'koi', waterCard: { image: 'assets/sky/thumbs/koi.jpg', name: 'Pond water', note: 'Clear and green: the koi show to the gravel' } },
  // The Polynesian lagoon: its own pure sky over white coral sand (`shore`), the lagoon's shore (`shoreKind`) and its
  // scenery (`tropics`), and its own clear turquoise water.
  lagoon: { sky: 'lagoon', pool: false, reeds: false, shore: 'coral', shoreKind: 'lagoon', water: 'lagoon', tropics: true, waterCard: { image: 'assets/sky/thumbs/lagoon.jpg', name: 'Lagoon water', note: 'Clear and turquoise over white coral sand' } },
  // Loch Ness: the Highlands' ridges and hours over a shingle shore without reeds (`shore`, in place of its sky's),
  // its own peat-dark water (`water`: WATER_CLARITIES.peat, whatever clarity is chosen), and, far out now and then,
  // something that comes up and goes down again (`visitor`: src/lochVisitor.js).
  loch: { sky: 'highlands', pool: false, reeds: false, shore: 'shingle', water: 'peat', visitor: true, waterCard: { image: 'assets/sky/thumbs/loch.jpg', name: 'Loch water', note: 'Peat-dark: nothing a metre down can be seen' } },
};
/** What a place's beach is made of (SHORE_LOOKS in src/pondFloor.js): its own `shore`, else its sky's. */
export const placeShore = (place) => PLACES[place].shore ?? skyShore(PLACES[place].sky);

/** A place's own water, or the lake clarity remembered by the viewer. */
export const waterForPlace = (place, lakeClarity) => PLACES[place].water ?? lakeClarity;
