// The sky's places and their hours (SKIES; src/sky.js draws them), which
// hour is shown for what is asked (resolveHour, nearestHour), and each hour's
// panorama: assets/sky/<file>_2k.jpg, a JPEG gain map that
// tools/sky-encode.mjs writes from the Radiance file beside it, fetched with
// loadAsset's deadlines (src/loadAsset.js). Nothing here needs Three.js.
//
// The first sky starts at once. Its panorama is most of what the page
// downloads, and the modules that draw it take a while to come, so
// index.html's head runs startFirstPanorama, which needs only this module
// and loadAsset: it starts downloading the hour the page will open on, and
// the environment's first load of that file takes the download
// (fetchPanorama) instead of starting another. firstChoice reads that hour
// as src/main.js does (its placeAndHour and the first place and hour: a
// twin, change both): ?sky, else the place last chosen on this device
// ('sunrise', the old Sunrise sky, is Lakeside at sunrise), and ?time, else
// the place's hour nearest the time of day last chosen. A wrong guess costs
// only the download it started: the environment fetches what it is asked
// for. A failed early download fails that first load, as its own download
// failing would (src/main.js offers Retry). It is a fetch held here, not a
// <link rel="preload">: WebKit's fetch() does not take a preload, and
// downloads it again (measured in Playwright's WebKit).
import { loadAsset } from './loadAsset.js';

// The orientation was chosen from home-view frames (mirrored: the photo
// flipped left for right; sunAzimuth, degrees right of straight ahead, would
// put the sun elsewhere than the scene's own place for it). Meadow 2 mirrored
// puts tall trees on the left with sky between the crowns; as photographed
// the whole view ahead is a wall of foliage. Lakeside as photographed puts
// its wooded shore on the left, mirrored the view is open water to a low far
// shore. Lago d'Isola mirrored looks down the valley at the snowy peaks, as
// photographed into a wall of pines. The sunrise's sun, 5° up, stands in the
// home view's top right, a dead branch in the water just left of it, either
// way round. The open sky (clouds only) looks alike either way. Of the
// places with hours, Lakeside keeps its afternoon as it was, its sun ahead
// to the right, so its sunrise is behind the eye, over the water on the
// right (turn round to see it), as it was that morning; Mesas faces its
// moonrise, east, so its dawn, sunrise and moon stand ahead and its
// afternoon and sunset to the left and behind. Between the two, every hour
// has its light ahead at one of them. Mesas' Night panorama (18:43, the sun
// 13° down) is left out: its sky is a haze of the towns' light. Each
// panorama is 0.2 to 0.6 MB, fetched only when chosen. An hour's `clock` is
// its local time (sky-probe's taken). `anchor` and `facing` (src/sky.js's
// Light by the hour and Orientation) are the first hour unless named.
export const SKIES = {
  lakeside: {
    anchor: 'afternoon',
    facing: 'afternoon',
    hours: {
      dawn: { file: 'lakeside_dawn', label: 'Dawn', clock: '06:27' },
      sunrise: { file: 'lakeside_sunrise', label: 'Sunrise', clock: '06:58' },
      afternoon: { file: 'lakeside', label: 'Afternoon', clock: '14:41' },
      night: { file: 'lakeside_night', label: 'Night', clock: '19:51' },
    },
  },
  mesas: {
    anchor: 'afternoon',
    facing: 'moonrise',
    hours: {
      dawn: { file: 'qwantani_dawn', label: 'Dawn', clock: '06:28' },
      sunrise: { file: 'qwantani_sunrise', label: 'Sunrise', clock: '06:43' },
      morning: { file: 'qwantani_morning', label: 'Morning', clock: '08:09' },
      'mid-morning': { file: 'qwantani_mid_morning', label: 'Mid-morning', clock: '10:05' },
      noon: { file: 'qwantani_noon', label: 'Noon', clock: '12:18' },
      afternoon: { file: 'qwantani_afternoon', label: 'Afternoon', clock: '14:04' },
      'late-afternoon': { file: 'qwantani_late_afternoon', label: 'Late afternoon', clock: '16:04' },
      sunset: { file: 'qwantani_sunset', label: 'Sunset', clock: '17:09' },
      dusk: { file: 'qwantani_dusk_1', label: 'Dusk', clock: '17:47' },
      twilight: { file: 'qwantani_dusk_2', label: 'Twilight', clock: '18:06' },
      moonrise: { file: 'qwantani_moonrise', label: 'Moonrise', clock: '19:41' },
      moonlight: { file: 'qwantani_moon_noon', label: 'Moonlight', clock: '21:06' },
    },
  },
  meadow: { mirrored: true, hours: { afternoon: { file: 'meadow_2', label: 'Afternoon' } } },
  alpine: { mirrored: true, hours: { midday: { file: 'lago_disola', label: 'Midday' } } },
  open: { hours: { midday: { file: 'kloofendal_48d_partly_cloudy_puresky', label: 'Midday' } } },
};
export const SKY_NAMES = Object.keys(SKIES);
export const DEFAULT_SKY = 'lakeside';   // an open lake to a far shore, as the Lake water is
/** A place's hours in the order of the day: their names, labels and local times (clock, 'hh:mm', or undefined for a lone photograph). */
export const skyHours = (place) => Object.entries(SKIES[place]?.hours ?? {}).map(([name, { label, clock }]) => ({ name, label, clock }));
/** The hour load() shows for a place asked for at `hour`: that one if the place has it, else its anchor. */
export function resolveHour(place, hour) {
  const known = SKIES[Object.hasOwn(SKIES, place ?? '') ? place : DEFAULT_SKY];
  return Object.hasOwn(known.hours, hour ?? '') ? hour : known.anchor ?? Object.keys(known.hours)[0];
}
const clockMinutes = (clock) => { const [hours, minutes] = clock.split(':').map(Number); return hours * 60 + minutes; };
/** The place's hour whose local time is nearest `clock` ('hh:mm'; round the day), or undefined if it has no clocks or there is no clock. */
export function nearestHour(place, clock) {
  if (!/^\d{2}:\d{2}$/.test(clock ?? '')) return undefined;
  const wanted = clockMinutes(clock);
  const apart = (other) => { const difference = Math.abs(clockMinutes(other) - wanted); return Math.min(difference, 1440 - difference); };
  return skyHours(place).filter((hour) => hour.clock).sort((first, second) => apart(first.clock) - apart(second.clock))[0]?.name;
}

const SKY_STORAGE_KEY = 'stone-pond-sky';     // src/main.js's: the Location setting's last choice
const TIME_STORAGE_KEY = 'stone-pond-time';   // src/main.js's: the local time ('hh:mm') of the hour last chosen

const panoramaUrl = (file) => new URL(`../assets/sky/${file}_2k.jpg`, import.meta.url);
let early = null;   // { file, download }: the first sky's, until the first load

/** The place and hour the page opens on, read as src/main.js reads them (the header: a twin). */
function firstChoice() {
  const parameters = new URLSearchParams(window.location.search);
  const stored = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
  const place = parameters.get('sky') ?? stored(SKY_STORAGE_KEY);
  if (place === 'sunrise') return ['lakeside', 'sunrise'];
  return [place, parameters.get('time') ?? nearestHour(place, stored(TIME_STORAGE_KEY))];
}

/** Start downloading the panorama the page opens on (index.html's head; the header). */
export function startFirstPanorama() {
  try {
    const [place, hour] = firstChoice();
    const known = Object.hasOwn(SKIES, place ?? '') ? place : DEFAULT_SKY;
    const { file } = SKIES[known].hours[resolveHour(known, hour)];
    const download = loadAsset(panoramaUrl(file), 'arrayBuffer');
    download.catch(() => {});   // reported by the load that takes it, not as unhandled
    early = { file, download };
  } catch {
    // Nothing started: the environment downloads the sky itself.
  }
}

/** A panorama's bytes (an ArrayBuffer): for the first load, the download started for it if it is this file's; else a new one. */
export function fetchPanorama(file) {
  const started = early;
  early = null;   // the first load takes it or leaves it: never a stale download later
  return started?.file === file ? started.download : loadAsset(panoramaUrl(file), 'arrayBuffer');
}
