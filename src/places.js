// Shared place data: sky, shore, water and its settings card live together.
// New places extend this registry rather than adding special cases to the page.
import { SKY_NAMES, REED_SKIES, skyShore, skyAirless } from './sky.js';

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
// (src/tropics.js); or the Reflecting Pool (`mall`), a granite-walled basin
// 618 m long (MALL_POOL), its walls, coping and lawn src/mallPool.js's, its
// water clipped to the walls, under a backdrop matte-painted from
// photographs (src/sky.js `mall`, tools/mall-backdrop.py); or Europa (`europa`), Jupiter's ice moon: the
// lake's shore in frost under a computed airless sky (src/sky.js `europa`, tools/europa-sky.py), its own
// ocean under a refrozen skin of ice, starting frozen. A place may have its own water (`water`, a key of
// WATER_CLARITIES, whatever clarity is chosen, and its card, `waterCard`),
// its own ground (`shore`, in place of its sky's), its own ice (`iceCrust`: an old frosted crust's stain colour and
// reach, src/ice.js setCrust; a lake's black ice otherwise), its own start
// (`defaultWater`, `defaultView`), its own gravity (`gravity`, m/s²; Earth's,
// 9.81, unless it says: src/gravity.js), and, at Loch Ness, something far out now
// and then (`visitor`: src/lochVisitor.js). src/main.js applyPlace puts a
// place in force once its sky has come.
// Each place's fish are
// src/fish.js's (FISH_BY_PLACE, by the place's name); its beach's ground is
// its `shore`, else its sky's (SHORE_LOOKS in src/pondFloor.js,
// setShoreLook: sand, shingle, scree...); its reeds (`reeds`, src/reeds.js)
// are its sky's (REED_SKIES) unless it says: the fresh lakes have them,
// the sea cove, the bare rock shore, the salt flat, the frozen alpine
// reservoir, Loch Ness and the lagoon none, and the Pool, the Koi pond and
// the Reflecting Pool have their own grounds; Europa none.
// A place under an airless sky (src/sky.js `airless`: Europa's) has no
// weather and no wind (placeAirless): src/main.js holds its weather clear and
// its wind calm there, whatever is chosen or asked by the page, and keeps
// the choices for the next place with air.
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
  // The Reflecting Pool: the lake's water inside the pool's granite walls (`shoreKind`, src/pondFloor.js MALL_POOL), its
  // coping and ground (`mall`, src/mallPool.js) under its own sky, a backdrop of the Mall (src/sky.js `mall`), and its
  // own still water over its blue-coated bed (since 2026).
  mall: { sky: 'mall', pool: false, reeds: false, shoreKind: 'mall', mall: true, water: 'mall', waterCard: { image: 'assets/sky/thumbs/mall.jpg', name: 'Pool water', note: 'Still over its blue bed: a mirror for the monuments' } },
  // Europa: the lake's shore and bed under Europa's sky, its beach frost (`shore`, src/pondFloor.js SHORE_LOOKS), its
  // water the ocean under the ice (WATER_CLARITIES.europa), frozen at first (`defaultWater`) and seen from water level,
  // Jupiter low ahead over the ice and in it (`defaultView`), its ice an old crust (`iceCrust`): frost nearly all over,
  // as bright as Europa's (albedo about 0.65), stained reddish-brown along bands as its lineae are, Jupiter mirrored only
  // in the bare leads between. No fish but glowing ice lanterns (src/fish.js); no birds, weather or wind over an airless
  // moon (its sky's `airless`, placeAirless), but its life above the ice (src/europaLife.js). Its own gravity
  // (`gravity`, m/s²: src/gravity.js), a seventh of Earth's: what is thrown climbs higher and falls slower.
  europa: { sky: 'europa', gravity: 1.315, pool: false, reeds: false, water: 'europa', defaultWater: 'frozen', defaultView: 'level', iceCrust: [0.72, 0.52, 0.40, 1], waterCard: { image: 'assets/sky/thumbs/europa.jpg', name: 'Europa’s ocean', note: 'Salt water kilometres deep: black under the ice' } },
};
/** Whether a place has no air (its sky's `airless`: Europa): clear and calm there, whatever the Weather and Wind settings say. */
export const placeAirless = (place) => skyAirless(PLACES[place]?.sky);
/** What a place's beach is made of (SHORE_LOOKS in src/pondFloor.js): its own `shore`, else its sky's. */
export const placeShore = (place) => PLACES[place].shore ?? skyShore(PLACES[place].sky);

/** A place's own water, or the lake clarity remembered by the viewer. */
export const waterForPlace = (place, lakeClarity) => PLACES[place].water ?? lakeClarity;
