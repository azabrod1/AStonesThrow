// Shared place data: sky, shore, water and its settings card live together.
// New places extend this registry rather than adding special cases to the page.
import { SKY_NAMES, REED_SKIES, skyShore } from './sky.js';

// The places (the Location setting): a sky (src/sky.js SKIES) and what lies
// about the water, the lake's bed and shore, or the Pool's tiled pool on its
// deck in a lawn (src/pool.js; setPooled), by Lakeside's lake and through its
// hours, so that choosing it from Lakeside loads no photo; or the Koi pond
// (`koi`), a pond in a Japanese garden under the same sky: the lake's open
// water inside a closed, irregular shore of its own (KOI_SHORE in
// src/pondFloor.js, setShoreKind; setKoiPond), stone-edged with a pebble
// beach, its own water (WATER_CLARITIES.koi) and a garden round it, out of
// reach behind a hedge (src/koiGarden.js).
// Each place's fish are
// src/fish.js's (FISH_BY_PLACE, by the place's name); its beach's ground is
// its sky's `shore` (SHORE_LOOKS in src/pondFloor.js, setShoreLook: sand,
// shingle, scree...); its reeds (`reeds`,
// src/reeds.js) are the sky's (REED_SKIES): the fresh lakes have them,
// the sea cove, the bare rock shore, the salt flat and the frozen alpine
// reservoir none, and the Pool and the Koi pond have their own grounds.
export const PLACES = {
  ...Object.fromEntries(SKY_NAMES.map((name) => [name, { sky: name, pool: false, reeds: REED_SKIES.includes(name) }])),
  swiss: { sky: 'swiss', pool: false, defaultWater: 'frozen', defaultView: 'level' },
  pool: { sky: 'lakeside', pool: true, water: 'pool', waterCard: { image: 'assets/sky/thumbs/pool.jpg', name: 'Pool water', note: 'Filtered: the tiles clear to the bottom' } },
  koi: { sky: 'garden', pool: false, koi: true, water: 'koi', waterCard: { image: 'assets/sky/thumbs/koi.jpg', name: 'Pond water', note: 'Clear and green: the koi show to the gravel' } },
  // Loch Ness: the Highlands' ridges and hours over a shingle shore without reeds (`shore`, in place of its sky's),
  // its own peat-dark water (`water`: WATER_CLARITIES.peat, whatever clarity is chosen), and, far out now and then,
  // something that comes up and goes down again (`visitor`: src/lochVisitor.js).
  loch: { sky: 'highlands', pool: false, reeds: false, shore: 'shingle', water: 'peat', visitor: true, waterCard: { image: 'assets/sky/thumbs/loch.jpg', name: 'Loch water', note: 'Peat-dark: nothing a metre down can be seen' } },
};
/** What a place's beach is made of (SHORE_LOOKS in src/pondFloor.js): its own `shore`, else its sky's. */
export const placeShore = (place) => PLACES[place].shore ?? skyShore(PLACES[place].sky);

/** A place's own water, or the lake clarity remembered by the viewer. */
export const waterForPlace = (place, lakeClarity) => PLACES[place].water ?? lakeClarity;
