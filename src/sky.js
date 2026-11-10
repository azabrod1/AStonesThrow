// The sky: a photographed panorama on a dome, and the environment maps
// derived from it.
//
// The sky is an equirectangular HDRI from Poly Haven (CC0) in assets/sky/,
// drawn on a dome (a large box on layer 1, so the mirror pass sees it) at the
// far plane. Its measurements, in assets/sky/<name>.json, come from
// tools/sky-probe.mjs: the sun's direction in the file's frame, its
// irradiance, and the sky's mean radiance; for a place's hours (below) also
// what lights it, the true sun's position and where north is in the file.
// SKIES lists the places (the Location setting's choices, src/main.js), each with
// its hours (the Time setting's) and how it is turned; the environment loads
// one to start and another whenever load() is called (Switching, below).
//
// The photo. The page loads each panorama as a JPEG gain map,
// assets/sky/<name>_2k.jpg (Swiss Alps' _4k.jpg), a tenth to a thirtieth of
// the Radiance file (<name>_2k.hdr) it is encoded from: tools/sky-encode.mjs
// writes it, matched to the arithmetic of Three.js's UltraHDRLoader, which
// decodes it here to the half floats the Radiance file gave, the sun's disc
// and all (decodePanorama). The site publishes only the JPEGs; the Radiance
// files stay the source, which tools/sky-probe.mjs measures. The decode takes
// a little longer than the Radiance file's parse did (90 ms against 55 on an
// M5 Max, 300 against 215 slowed four times), for seconds of download saved.
//
// Places and hours. Four places are one photograph. Lakeside and Mesas were
// each photographed from one spot through the day (Poly Haven's 2024 series
// by Greg Zaal and Jarod Guest, on the shore of a dammed lake in South Africa
// and on a hill above it 350 m away; Lakeside's afternoon is their 2019
// panorama, from the same rock, its sun at 14:41 local time to 0.1°), so each
// of their hours is a panorama of the same land at another time, and the
// land keeps still while the sun moves (Orientation).
// Highlands uses five Kiara photographs (2016); Desert oasis uses Rogland's
// golden hour and two nights (2023). Harbour is four of Zaal and Guest's
// from a small harbour on Sterkfontein Dam: a morning and a golden hour of
// one day in 2024 from one spot, and a 2019 sunset and dusk from within
// 60 m of it, aligned on the flat-topped hills across the water (--band 0°
// to 4°, the dusk's in 1° to 5°, and the least sure: 3.3σ). The 2019 time
// stamps are wrong; the sunset's clock is read from its sun's height (a
// glow through haze, so the probe calls its light 'none' and the scene's
// sun is dark), the dusk's estimated from its glow. Wooded lake is one
// photograph, Radków's lake under the Table Mountains (2025). The Reflecting
// Pool's three hours are stitched from photographs (tools/mall-backdrop.py), one
// September day's, each sky's sun turned to where the true sun stood then. Their rock ridges are aligned using the
// probe's --band option: Kiara's lower valley from -15° to -5°, Rogland's
// skyline from 0° to 18°. Small viewpoint changes in Kiara remain in nearby
// rocks. Its sunrise/sunset are lit by the measured sun; their camera times
// are approximate, so they use skyline north rather than solar-position north.
//
// Orientation. The dome samples the panorama by direction as Three.js's
// equirect lookup does (equirectUv: u = atan(z, x)/2π + ½), with the x of the
// direction negated first when the entry is `mirrored` (the photo flipped left
// for right, to put better scenery in front), then turned about the vertical
// by the angle that puts the photo's sun at `sunAzimuth`, the scene's choice.
// The sun's elevation is the photo's; sunDirection is built from the two.
// A place with hours turns its `facing` hour so; every other hour is turned
// by that angle plus the difference of the two files' norths (sky-probe's
// north: from the true sun at the photo's time and place, or from lining the
// skyline up with another hour's), so the land lies where it lay in the
// facing hour and the hour's sun, or where it would be when it is down,
// stands where it stood that day against the land.
//
// The sun's colour. The scene's sun keeps the luminance of sunBalance (src/
// main.js), the irradiance it was balanced with under BALANCE_FILE, and takes
// the colour of the photo's sun relative to that sky's: so under the meadow
// it is sunBalance, and at sunrise as orange against it as the photo's sun is
// against the meadow's (lighting.sunIrradiance, filled in place).
//
// Brightness. The dome is scaled by the ratio of the scene's sun luminance to
// the photo's measured sun irradiance, so the photo's own ratio of sky to sun
// carries over, times
// SKY_EXPOSURE. That constant is π: the scene's diffuse shaders (floor, foam,
// specks) light a white surface facing the sun to sunIrradiance, without the
// Lambertian 1/π, so sunIrradiance is π times a physical irradiance in the
// units of the sky's radiance. Measured without it, the sky at the top of the
// home view came out a tenth as bright as the old Preetham sky and the
// reflected sky in the middle distance a fifth; with it, the ambient radiance
// of a test panorama (Poly Haven's Belfast Farmhouse, not shipped) landed
// within 7% of the hand-tuned constant the scene was balanced with,
// (0.26, 0.34, 0.46); Meadow 2's is 1.4 times that. skyAmbient, the
// cosine-weighted mean sky radiance that the foam, specks, floor and spray
// use, is the measured value on the same scale.
// The sun's light reaches the scene through the directional light and the
// analytic highlights, not through the environment: a sun disc thousands of
// times brighter than the sky would poison every blurred level of the
// prefiltered map and overflow the half-float cube, so the dome's radiance is
// capped at RADIANCE_CAP times the mean sky radiance (scaled down to keep
// its hue). Only a sun low ahead is in the home view's direct sight, where
// the cap leaves the photo's white disc and its starburst; the others' only
// in the mirror image and the cube.
//
// Light by the hour. Poly Haven exposes each panorama to be looked at, as an
// eye adapted to its light would see it: the sunlit hours of a series share
// one exposure (their suns measure within 8% of one another from 20° to 50°
// up, and at sunset, through nine air masses, 0.41 of noon's, as a clear,
// dry sky of 0.12 optical depths per air mass would leave it), and the
// dawn's and the dusk's are brought up to about a day's
// brightness. So a place's `anchor` hour (a sunlit one) takes the brightness
// of a single photograph, above, and every other hour keeps its file's
// brightness against the anchor's, times the light of its hour against the
// anchor's, softened as an eye adapted to each sees it (adaptedLight):
// illuminance(), the light on level ground under a clear sky with the true
// sun at the hour's elevation (no moon), to the 1 − ADAPTATION, and below
// the rods' threshold to the 1 − ROD_ADAPTATION further. The eye adapts
// most of the way, not all: twilight and night come out darker than the
// photograph shows them, about 2.7 stops under the day, dark but never
// black (at 4 to 5 stops under, as they were first set, they were a dark
// grey photograph on a phone). Where the true sun is down
// (sky-probe's light 'none') the sky is all the light, and the scene's sun
// is dark, low where the true one is; where the moon lights the photo
// ('moon') it is the scene's sun, its light a full moon's, MOON_DIMMING
// times the sun's at its elevation. Below NIGHT_VISION_LIGHT[0] the eye's
// rods take over from its cones, alone by NIGHT_VISION_LIGHT[1] (a full
// moon low in the sky): lighting.night, from 0 to 1 between the two in the
// logarithm of the light, mixes the picture towards what rods see, drawn
// as a moonlit blue that keeps some of the cones' colour (NIGHT_VISION in
// src/shaders/fluid.js). Not every series shares one exposure: an hour's
// `exposure` (stops) brings up one whose light reads too dim for its hour,
// chosen from home-view frames, as a camera's exposure compensation would
// (sun, sky and land together). Highlands' noon has it: against its sky the
// photo's sun measures twice Mesas' noon's (15.5 to 7.3, its disc integrated,
// no halo), its hills and low sky two to three times darker, and its sunset's
// sun 1.5 times its noon's, so its hours were exposed one by one; as a
// single photograph it came out a dusk, darker than its own sunset. That
// factor and the hour's are the environment's `level` (1 for a single
// photograph and an anchor, but for an `exposure`): the deep water's colour
// (src/main.js), a radiance lit by what falls on the water, takes it, and so
// does the cube's ground hemisphere.
//
// Weather (setWeather; the Weather setting, src/main.js). Rain comes under
// cloud: `cover` of it (0 to 1) takes that share of the sun's direct light
// away and turns the dome's sky toward the cloud's: its luminance evened out
// about the clear sky's mean (to the power 1 − OVERCAST_FLATTEN, so the sun
// and its glow sink), greyed to OVERCAST_TINT, and scaled to the cloud's
// brightness. The photo's land (darker than its sky) keeps its colour, but
// for its blue (far water's reflected sky, the far haze), and is dimmed as the light on it is (the cloud's over
// the clear hour's), or its trees would go as grey and pale as the cloud,
// and the grass by the pond, which takes their colour (PHOTO_LAND in
// src/shaders/scene.js), with them. The cloud's brightness is all the
// light of the clear hour (its sky's and its sun's on level ground) times
// the weather's `light` (a rain cloud's share of a clear day's light),
// softened as the hours' light is (adaptedLight: under the rods' threshold,
// at night, the eye makes up more of what the cloud takes). The scene's ambient
// sky goes the same way, and the environment's level, the deep water's
// light, with it. The rain's haze fades what lies d metres off by
// 1 − exp(−3d/visibility) toward HAZE_BRIGHTNESS of the cloud: the water
// (HAZE in src/shaders/scene.js) by its distance, the dome by the distance
// a ray climbs out of the rain (HAZE_LAYER over the sine of its elevation),
// at most LAND_DISTANCE, where the photo's land stands. Snow's haze is
// brighter (the weather's `hazeBrightness`, over HAZE_BRIGHTNESS): its
// flakes scatter the cloud's light back as white as they are, where rain's
// drops let it through. A fog is the haze with no cloud over it, in a layer
// of its own depth (`hazeLayer`, for HAZE_LAYER): the dome's sky shows
// through it overhead and the photo's sun as a pale disc; the haze takes
// the sun's direct light along its path through the layer (at most
// LAND_DISTANCE) and gives it back as cloud does, its `light` of the clear
// hour's (`shade`, in applyWeather: cloud's cover and the haze's share
// together; under rain's and snow's full cover it is the cover). The haze
// also reaches Three.js's own materials (the stones, the things) as the
// main scene's FogExp2 (`fog`), its chunks made HAZE's, and the grass by
// the pond reads the land as it was before the haze (`landCube`: the
// cube's LAND_LEVEL, captured once without the haze and copied before the
// hazed capture; with no haze the cube itself). A clear sky leaves
// everything as it was.
//
// Lightning (setFlash; src/lightning.js says when and how bright): a flash
// multiplies the dome's light, the scene's ambient sky and the haze's colour
// by its level, each frame, from what the weather set (the cube and the
// prefiltered map are not captured again: the drops and the stones miss
// it); a bolt is drawn on the dome (boltLight in DOME_FRAGMENT), a jagged
// line from its top's elevation, where the cloud's base is, to the horizon,
// a few octaves of straight-segment noise wide, as bright as the bolt asks
// against the cloud, and faded where the photo is darker than its sky, where
// its land stands in front of the bolt.
//
// Asset requests time out after 30 seconds without progress; the current sky
// stays until all replacement assets arrive. Initial calibration loads in parallel.
//
// Starting. createEnvironment returns at once, its first sky still on its
// way (firstLoad): the dome, the cube and the prefiltered map exist from the
// start, captured once from the empty dome (the sun straight up, dark), so
// every material made while the photo downloads takes the maps it will keep,
// at their final sizes, and the capture's programs are built meanwhile
// (src/main.js builds the pond and warms its programs up before it awaits
// firstLoad). The page may have asked for the photo before any module ran
// (index.html's early fetch, src/loadAsset.js takes it over); each load
// lists what it fetched (`assets`), for the page to ask for first next time.
//
// Switching. load(place, hour) fetches the photo and its measurements, then
// in one frame swaps the dome's texture and uniforms, fills lighting's sun
// and sky vectors in place, captures the cube and the prefiltered map again
// into the same targets (every material holding them keeps them) and frees
// the old photo. Nothing new is compiled: the dome, the capture's ground and
// the PMREM generator live as long as the environment. Until the photo has
// arrived the old sky stays, whole. The photo (0.2 to 0.8 MB) is most of the
// wait: prefetch(place, hour) fetches an hour's photo and measurements ahead
// without showing them (src/main.js prefetchHours: the hours either side of
// the one asked for, while the Time of day page is open), at most PREFETCHED
// kept, so its load waits only on the decode (decodePanorama).
// A caller's AbortSignal cancels an obsolete download, a prefetched one it
// has taken over too; it is checked again before decoding, after it and
// before changing any lighting. A prefetch let go (more than PREFETCHED) is aborted.
//
// The panorama and a water-coloured hemisphere below the horizon (the photo's
// own ground there would light drops and stones green from below; GROUND,
// times the level) are rendered once into a cube map that the droplets
// reflect, and a prefiltered copy lights the stones.
//
// Horizon. The 2k photo gives the dome 5.7 pixels a degree, and a desktop
// at the home view's 48° or a phone's three pixels a CSS pixel sees 20 to
// 50 a degree, so the land on the skyline is a blur. Over the band about
// the horizon (HORIZON_STRIP, below: 17° up to 3° down, where the
// land stands; higher where a sky's land stands higher, stripAbove) the dome draws the hour's horizon strip instead: the same
// band of the 8k photo (23 pixels a degree), its own JPEG gain map
// (tools/sky-encode.mjs), which the page fetches once the panorama is up
// and decodes on the GPU (src/horizonStrip.js: no JavaScript over its
// pixels, so no hitch in play), fading into the panorama HORIZON_EDGE
// inside the band's edges. The strip is the photo's own pixels at the
// panorama's radiance, so the dome's scale, cap, cloud and haze apply to it
// as to the rest; the cube captures take it too. A strip that fails to
// come, or comes after another hour was asked for, leaves the panorama
// whole; the page waits for none of it (horizonReady is for the tools).
//
// Insets. Zoomed in on a landmark the strip's 23 pixels a degree are soft
// again (the Washington Monument at a 10° field of view is a few of its
// pixels across). A sky may name windows (`insets`: the Reflecting Pool's
// Monument and Lincoln Memorial) drawn from an atlas of their own at the
// photographs' own resolution (perDegree, 57 to 96), the hour's
// assets/sky/<file>_insets.jpg (tools/mall-backdrop.py renders it,
// tools/sky-encode.mjs encodes it as the strip is), fetched after the strip
// and decoded once on the GPU when it comes (INSET_DECODE_PASS: the loader's
// arithmetic, as the strip's) into half floats with mip levels, which the
// dome reads in one trilinear lookup a pixel (INSET_SAMPLE). A window may
// cross north, its azimuths running past 360 (insetLayout). Each window fades in over
// INSET_EDGE inside its edges, and out again where a screen pixel spans
// INSET_FINEST to INSET_COARSEST of its texels (a home view's, a cube
// capture's), where the strip, fine enough there, shows alone. The atlas is a
// sky's windows side by side (insetLayout); horizonBytes counts it with the
// strip. Its decoding program is built the first time a sky with insets
// comes, and its coded textures are let go once it has run.
//
// Backdrop. A photo taken among near trees (the garden's: its hedges, its
// hill and its stairs a few dozen metres off) is no horizon: drawn
// infinitely far, it meets the ground the scene draws in a hard line under a
// band of whatever the photo shows below its horizon, and from a raised eye
// that ground runs on flat to the horizon. Such a sky names a `backdrop`, a
// sphere (centre, radius) the photo is projected onto from its centre, as
// an HDRI backdrop is (Unreal's HDRI Backdrop, Three.js's GroundedSkybox):
// the dome finds where the eye's ray leaves the sphere and looks the photo
// up along the direction from the centre to there (uBackdrop), so its land
// shifts with the eye as land that far off would. The centre stands on the
// ground under the shore view's eye, so the photo's horizon lies where the
// sphere meets the ground: its land stands on the place's own ground, which
// ends there (src/pondFloor.js koiLandGeometry), and nothing under its
// horizon (blurred by the encoder, and often the photographer's own hedge)
// is ever shown; the home view sees it as before, 2° lower. Ground projection
// (the GroundedSkybox's floor) was tried and left: the garden's photographer
// stood among hedges, whose feet it smeared across the lawn. An eye outside
// the sphere sees the photo as ever. The cube's captures, from inside, take
// it too; the mirror's eye, under the water, sees the sphere's reflection.
//
// Near land. The water mirrors the dome's land as it mirrors the sky, as if
// it stood at infinity: spread down the water by the ripples' whole turn
// (spreadMirror in src/shaders/scene.js). Where the photographer's own shore
// stands near and rises over the horizon (Lakeside's: a spit of shale and
// gums from straight ahead round to the left, some 20 m off), its image so
// spread is a flat band of its average under the skyline, where real water
// mirrors a bank that near almost sharply. A sky may list such land
// (`nearLand`: each stretch's compass bearings, degrees from north toward
// east, the land's ends NEAR_LAND_EDGE inside them, and its distance in
// metres, read from the photo by where the land's foot stands below its
// horizon from a tripod about 1.6 m up), and the water spreads what the dome
// shows on those bearings as a near thing's image, by 1 − d/D of the sky's
// (d the water's distance, D the land's), and not at all past it, where the
// dome's horizon stands for the land's foot. Each hour turns the bearings
// by its own file's `north` (sky-probe's: every hour of a place with near
// land needs one), so a place lists its land once; nearLandUniforms holds
// them turned into the scene, as the dome is (atan(z, x) of the bearing),
// for the water's shader (src/waterSurface.js). The land is still drawn at
// infinity: the water runs under it to the horizon, as everywhere.
//
// Memory. The panorama's pixels are dropped from the CPU once they are on the
// GPU (nothing uploads it again), and the strip's ImageBitmaps are closed
// once its textures are. The captures need no depth buffer: the
// ground hemisphere is drawn after the dome, over it. The droplets sample the
// cube at its first and second mip levels (src/shaders/fluid.js), so it stays
// CUBE_SIZE; the stones (roughness 0.92) read only the prefiltered map's
// blurriest levels, so it is made from a capture of PREFILTER_SIZE, a
// sixteenth of the memory of one from the droplets' cube. createEnvironment
// reports its render targets and the panorama's bytes for the memory
// estimate (src/main.js).
import * as THREE from 'three';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { loadAsset, dropEarlyAssets } from './loadAsset.js';
import { decodeHorizonStrip, HORIZON_DECODE, INSET_DECODE_PASS, INSET_SAMPLE } from './horizonStrip.js';

// The orientation was chosen from home-view frames (mirrored: the photo
// flipped left for right; sunAzimuth, degrees right of straight ahead, would
// put the sun elsewhere than the scene's own place for it). Lakeside as photographed puts
// its wooded shore on the left, mirrored the view is open water to a low far
// shore. Swiss Alps uses Lago d'Isola at 4K, mirrored and facing the snowy
// ridge across the lake, with the sun to the right. The sunrise's sun, 5° up,
// stands in the
// home view's top right, a dead branch in the water just left of it, either
// way round. Of the
// places with hours, Lakeside keeps its afternoon as it was, its sun ahead
// to the right, so its sunrise is behind the eye, over the water on the
// right (turn round to see it), as it was that morning; Mesas faces its
// moonrise, east, so its dawn, sunrise and moon stand ahead and its
// afternoon and sunset to the left and behind. Between the two, every hour
// has its light ahead at one of them. Mesas' Night panorama (18:43, the sun
// 13° down) is left out: its sky is a haze of the towns' light. Each panorama is 0.2 to 0.8 MB, fetched only
// when chosen (Swiss Alps is 1.8 MB at 4K, for its detailed ridgeline). An hour's `clock` is its local time (sky-probe's taken).
// `anchor` and `facing` (Light by the hour, Orientation) are the first hour
// unless named. `defaultHour` may choose a starting view independently of
// the lighting anchor. `reeds`: cattails stand in its shallows (src/reeds.js,
// PLACES in src/places.js): the fresh lakes with a soft shore; a sea cove, a
// bare rock shore, a salt flat and a frozen alpine reservoir have none.
// `shore` names what its beach is made of (SHORE_LOOKS in src/pondFloor.js;
// Lakeside's sand when unnamed), chosen from the land in its photo. New locations face their cove opening, sunset ridge
// or low desert skyline, chosen in rendered home and water-level views;
// Harbour faces the flat hills across the water with its golden hour's sun
// path on it, Wooded lake its wooded hill, the sun 60° to the left, where
// the eye's own side of the lake and the houses stay out of the frame.
const SKIES = {
  cove: { shore: 'shingle', salt: true, sunAzimuth: 15, hours: { morning: { file: 'secluded_beach', label: 'Morning' } } },
  desert: {
    shore: 'gravel',
    anchor: 'sunset',
    facing: 'sunset',
    sunAzimuth: 30,
    hours: {
      moonlight: { file: 'rogland_moonlit_night', label: 'Moonlight', clock: '05:33' },
      sunset: { file: 'rogland_sunset', label: 'Golden hour', clock: '17:31' },
      night: { file: 'rogland_clear_night', label: 'Starlight', clock: '21:22' },
    },
  },
  harbour: {
    reeds: true,
    salt: true,
    shore: 'earth',
    anchor: 'morning',
    facing: 'golden',
    defaultHour: 'golden',
    hours: {
      morning: { file: 'small_harbour_morning', label: 'Morning', clock: '09:33' },
      golden: { file: 'small_harbour_sunset', label: 'Golden hour', clock: '16:51' },
      sunset: { file: 'small_harbor_01', label: 'Sunset', clock: '17:04' },
      dusk: { file: 'small_harbor_02', label: 'Dusk', clock: '17:50' },
    },
  },
  highlands: {
    reeds: true,
    shore: 'peat',
    anchor: 'noon',
    facing: 'sunset',
    defaultHour: 'sunset',
    sunAzimuth: -25,
    hours: {
      dawn: { file: 'kiara_1_dawn', label: 'Dawn', clock: '06:20' },
      sunrise: { file: 'kiara_2_sunrise', label: 'Sunrise', clock: '07:03' },
      noon: { file: 'kiara_5_noon', label: 'Noon', clock: '12:15', exposure: 1.5 },
      sunset: { file: 'kiara_8_sunset', label: 'Sunset', clock: '17:34' },
      dusk: { file: 'kiara_9_dusk', label: 'Dusk', clock: '17:55' },
    },
  },
  lakeside: {
    reeds: true,
    anchor: 'afternoon',
    facing: 'afternoon',
    // The photographer's spit (Near land): its shale and gums, their feet 2° to 5° under the horizon, from file
    // azimuth 72° to 190° in the afternoon's file (north 263°); then, past dead trunks standing in the water, the gums
    // of its far point to 207°, their feet 0.5° to 1° under.
    nearLand: [{ compass: [166, 290], distance: 20 }, { compass: [284, 307], distance: 100 }],
    hours: {
      dawn: { file: 'lakeside_dawn', label: 'Dawn', clock: '06:27' },
      sunrise: { file: 'lakeside_sunrise', label: 'Sunrise', clock: '06:58' },
      afternoon: { file: 'lakeside', label: 'Afternoon', clock: '14:41' },
      night: { file: 'lakeside_night', label: 'Night', clock: '19:51' },
    },
  },
  mesas: {
    shore: 'salt',
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
  swiss: { shore: 'scree', mirrored: true, sunAzimuth: 45, hours: { midday: { file: 'lago_disola', resolution: '4k', label: 'Midday' } } },
  wooded: { reeds: true, shore: 'turf', sunAzimuth: -60, hours: { morning: { file: 'radkow_lake', label: 'Late morning', clock: '11:11' } } },
  // The Koi pond's own (src/places.js PLACES `koi`), no place of its own (`ownPlace`): Ninomaru Teien, the garden of
  // Nagoya Castle, in April's afternoon light through its trees (`shadedSun`: its sun behind leaves, the light on
  // level ground the balance's, most of it the sky's). Its trees, hedges and hill stand near: a backdrop (Backdrop).
  garden: { ownPlace: false, shadedSun: true, sunAzimuth: 100, backdrop: { centre: [0, 0, 2.45], radius: 35 }, hours: { afternoon: { file: 'ninomaru_teien', label: 'Afternoon', clock: '15:09' } } },
  // The Polynesian lagoon's own (src/places.js PLACES `lagoon`), no place of its own: a pure sky (Poly Haven's Kloofendal
  // 48d Partly Cloudy, its land taken out), deep blue with trade-wind cumulus along the horizon and the sun 48° up, as
  // a South Pacific midday is; the land under it is the beach's own (src/tropics.js: the palms, the motus, the high
  // island). The sun behind the eye's right, as the lagoon photographs best: the shallows lit through, no glare. Its
// light on level ground is 1.6 times the balance's (its sky alone two thirds of its sun's, against a fifth to two
// fifths in the other photographs): exposed as an eye adapted half the way sees it (`adapt`, below).
  lagoon: { ownPlace: false, salt: true, adapt: 0.5, sunAzimuth: 145, hours: { midday: { file: 'kloofendal_48d_partly_cloudy_puresky', label: 'Midday', clock: '13:44' } } },
  // The Reflecting Pool's own (src/places.js PLACES `mall`), no place of its own: a backdrop matte-painted from
  // photographs of the Mall on Wikimedia Commons over Poly Haven's Qwantani mid-morning pure sky
  // (tools/mall-backdrop.py, its plan tools/mall-backdrop.json with the photographs' authors and licences): ahead, east,
  // the pool's far end and the Washington Monument as photographed from its west end; behind, the Lincoln Memorial; the
  // elm rows either side, planted from photographs of single elms. In the morning the sun stands 40° right of ahead, in the south-east. The nearest elms stand
  // 37 m off with their crowns up to 30° high, so its horizon strip reaches that high (`stripAbove`), not 17°. The
  // Washington Monument and the Lincoln Memorial are drawn sharper still, from their photographs' own pixels (`insets`,
  // Insets): `azimuth` degrees from north toward east as the panorama's columns run (360·u), `elevation` degrees,
  // `perDegree` pixels a degree, about the photograph's own (the Monument's 96, the Memorial's 57).
  // Its hours are one September day's (tools/mall-backdrop.json `hours`, each its sky turned so its sun stands where the
  // true sun stood then, so their land lies alike): at sunset the sun is behind the Lincoln Memorial and the eye in its
  // shade (light 'none'), the Monument glowing down the pool; at night the monuments are floodlit under the city's glow,
  // and the hour's light never falls below `lit`. The pool runs 618 m ahead, so its far walls and lawn stand in the
  // same air as the backdrop's elms (`air`, lighting.air: what lies d metres off fades toward `horizon` by
  // 1 − exp(−d/`distance`), as tools/mall-backdrop.py hazes the elms by the plan's `elms.haze`: change both).
  // `horizon` is the hour's pure sky 2° up toward the far end, east (azimuths 75° to 105°), in its panorama's own
  // units, as the tool takes it; at night the elms are not hazed, nor is the pool.
  mall: {
    ownPlace: false,
    sunAzimuth: 40,
    stripAbove: 30,
    insets: [
      { name: 'monument', azimuth: [86, 95], elevation: [-0.5, 10], perDegree: 96 },
      { name: 'memorial', azimuth: [259, 283], elevation: [-1, 12.5], perDegree: 57 },
    ],
    hours: {
      morning: { file: 'mall', label: 'Late morning', clock: '10:38', air: { distance: 6000, horizon: [0.700, 0.752, 0.781] } },
      sunset: { file: 'mall_sunset', label: 'Sunset', clock: '18:32', air: { distance: 6000, horizon: [1.172, 1.054, 0.966] } },
      night: { file: 'mall_night', label: 'Night', clock: '21:30', lit: 6 },
    },
  },
};
/** A sky's backdrop (Backdrop, above): { centre: [x, y, z], radius } (m), or null where its land stands far off. */
export const skyBackdrop = (name) => SKIES[name]?.backdrop ?? null;
/**
 * A sky's near land (Near land) into `vectors` (nearLandUniforms), turned into the scene as the dome turns the hour's
 * file (`north`, its rotation and mirror: DOME_FRAGMENT's lookup): each stretch's centre (atan(z, x), radians), half
 * width (radians), distance (m) and edge (radians), and half width 0 past the list, or for a file with no north.
 */
function setNearLand(vectors, land = [], north, rotation, mirror) {
  vectors.forEach((vector, index) => {
    const stretch = north === undefined ? undefined : land[index];
    if (!stretch) { vector.set(0, 0, 0, 0); return; }
    const [from, to] = stretch.compass;
    const width = (((to - from) % 360) + 360) % 360;
    const lookup = THREE.MathUtils.degToRad(north + from + width / 2) - Math.PI;   // the dome's azimuth there: panoramaUv.x = lookup / 2π + 0.5
    const turned = lookup - rotation;                                             // atan(z, x · mirror)
    vector.set(mirror > 0 ? turned : Math.PI - turned, THREE.MathUtils.degToRad(width / 2), stretch.distance, THREE.MathUtils.degToRad(NEAR_LAND_EDGE));
  });
}
/** The skies that are each a place of their own (the Location setting's lakes; the Koi pond takes the garden's). */
/** What a sky's beach is made of (`shore` above): a name of SHORE_LOOKS (src/pondFloor.js), 'sand' when unnamed. */
export const skyShore = (name) => SKIES[name]?.shore ?? 'sand';
/** The skies whose shallows have reeds (`reeds` above). */
export const REED_SKIES = Object.keys(SKIES).filter((name) => SKIES[name].reeds);
/** The skies whose water is the sea (`salt`): a stone's foam lasts on it (src/splash.js setSalt). */
export const SALT_SKIES = Object.keys(SKIES).filter((name) => SKIES[name].salt);
export const SKY_NAMES = Object.keys(SKIES).filter((name) => SKIES[name].ownPlace !== false);
export const DEFAULT_SKY = 'lakeside';   // an open lake to a far shore, as the Lake water is
/** A place's hours in the order of the day: their names, labels and local times (clock, 'hh:mm', or undefined for a lone photograph). */
export const skyHours = (place) => Object.entries(SKIES[place]?.hours ?? {}).map(([name, { label, clock }]) => ({ name, label, clock }));
/** The hour load() shows: the requested one, else a curated starting hour or the lighting anchor. */
export function resolveHour(place, hour) {
  const known = SKIES[Object.hasOwn(SKIES, place ?? '') ? place : DEFAULT_SKY];
  return Object.hasOwn(known.hours, hour ?? '') ? hour : known.defaultHour ?? known.anchor ?? Object.keys(known.hours)[0];
}
const clockMinutes = (clock) => { const [hours, minutes] = clock.split(':').map(Number); return hours * 60 + minutes; };
/** The place's hour whose local time is nearest `clock` ('hh:mm'; round the day), or undefined if it has no clocks or there is no clock. */
export function nearestHour(place, clock) {
  if (!/^\d{2}:\d{2}$/.test(clock ?? '')) return undefined;
  const wanted = clockMinutes(clock);
  const apart = (other) => { const difference = Math.abs(clockMinutes(other) - wanted); return Math.min(difference, 1440 - difference); };
  return skyHours(place).filter((hour) => hour.clock).sort((first, second) => apart(first.clock) - apart(second.clock))[0]?.name;
}
const BALANCE_FILE = 'meadow_2';  // retained calibration, even though Meadow is no longer a location
const SKY_EXPOSURE = Math.PI;   // see Brightness above
const RADIANCE_CAP = 30;       // times the mean sky radiance
const DOME_SIZE = 20000;       // metres, edge of the box
const CUBE_SIZE = 512;         // the droplets' cube, per face
const PREFETCHED = 2;          // panoramas fetched ahead and kept until loaded (prefetch): an hour's two neighbours, 0.2 to 0.8 MB each
const PREFILTER_SIZE = 128;    // the capture the stones' prefiltered map is made from, per face
const LAND_LEVEL = 3;          // the cube's mip level the grass reads the land at (PHOTO_LAND in src/shaders/scene.js)...
const LAND_CUBE_SIZE = CUBE_SIZE >> LAND_LEVEL;   // ...and that level's size: the land before the haze, copied from it
const GROUND = [0.10, 0.17, 0.20];   // the cube's ground hemisphere: the pond as the drops see it, under a sunlit sky
const ADAPTATION = 0.8;        // how far the eye adapts to an hour's light (Light by the hour)...
const ROD_ADAPTATION = 0.98;   // ...and, below NIGHT_VISION_LIGHT[0], its rods (adaptedLight)
const DOWN_SUN_ELEVATION = 1;  // degrees: where the scene's dark sun stands while the true one is down
const HORIZON_EDGE = 0.5;      // degrees inside the strip's band over which it fades into the panorama
const NEAR_LAND_SECTORS = 2;   // the most stretches of near land a sky lists (Near land; the water's uNearLand)
const NEAR_LAND_EDGE = 3;      // degrees inside a stretch's bearings over which its land fades in
const INSET_EDGE = 0.25;       // degrees inside an inset's window over which it fades into the strip
export const INSET_COUNT = 2;  // windows a sky may have (`insets`): the dome's uniform arrays
const OVERCAST_TINT = [0.95, 0.99, 1.07];   // a rain cloud's grey, a little blue, at about unit luminance
const HAZE_BRIGHTNESS = 0.6;   // rain's haze against the cloud's mean: an overcast's horizon is under half its zenith (CIE)
const HAZE_LAYER = 1000;       // metres: the rain's and the snow's depth, which a ray climbing out of it crosses (a fog's is its own)
const LAND_DISTANCE = 400;     // metres: where the photo's land is taken to stand (its near trees and its far shore alike)

// The haze for Three.js's own materials (the stones and the things, src/rock.js; the aim's marker and arc): the
// main scene's FogExp2 (environment.fog), its chunks made HAZE's (src/shaders/scene.js), 1 − exp(−density·distance)
// by the distance to the eye rather than the view depth. Its density is 0 but in haze, which leaves the colour as it
// was; the scene keeps it always, so no weather changes a program.
THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = length( mvPosition.xyz );');
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
  'float fogFactor = 1.0 - exp( - fogDensity * vFogDepth );',
);
// The light on level ground under a clear sky (illuminance): the sun's, through
// SUN_DEPTH optical depths per air mass (Kasten and Young's), outside the
// atmosphere SUN_OUTSIDE; the sky's, SKY_LIGHT[0] + SKY_LIGHT[1]·sin(h)^0.6
// (lux), about 14 klx with the sun high and 0.8 klx at sunset; and once the
// sun is down, TWILIGHT, interpolated in the logarithm: the usual values at
// sunset and at the ends of civil, nautical and astronomical twilight. Each
// is good to perhaps a factor of two, and only their ratios to one another
// are used, softened by ADAPTATION.
const SUN_OUTSIDE = 127000;    // lux
const SUN_DEPTH = 0.2;         // a clear sky's optical depth for sunlight, per air mass
const SKY_LIGHT = [800, 15000];   // lux
const TWILIGHT = [[0, 800], [-6, 3.9], [-12, 0.009], [-18, 0.00075]];   // [sun's elevation (degrees), lux]
const MOON_DIMMING = 400000;   // the full moon's light against the sun's at the same elevation (14 magnitudes)
const NIGHT_VISION_LIGHT = [10, 0.03];   // lux: the rods begin to take over from the cones; the rods see alone

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/** The light on level ground (lux) under a clear, moonless sky with the true sun at `elevation` degrees. */
export function illuminance(elevation) {
  if (elevation >= 0) {
    const sine = Math.sin(THREE.MathUtils.degToRad(elevation));
    const airMass = 1 / (sine + 0.50572 * (elevation + 6.07995) ** -1.6364);
    return SUN_OUTSIDE * Math.exp(-SUN_DEPTH * airMass) * sine + SKY_LIGHT[0] + SKY_LIGHT[1] * sine ** 0.6;
  }
  for (let index = 1; index < TWILIGHT.length; index++) {
    const [upperElevation, upperLight] = TWILIGHT[index - 1];
    const [lowerElevation, lowerLight] = TWILIGHT[index];
    if (elevation >= lowerElevation) {
      const along = (upperElevation - elevation) / (upperElevation - lowerElevation);
      return upperLight * (lowerLight / upperLight) ** along;
    }
  }
  return TWILIGHT[TWILIGHT.length - 1][1];
}

/** What lights a panorama (sky-probe's light; a lone photograph's sun). */
const lightOf = (measurement) => measurement.light ?? 'sun';
/**
 * How bright an hour's light looks to an eye adapted to it, in arbitrary
 * units: the light (lux) to the 1 − ADAPTATION; below NIGHT_VISION_LIGHT[0],
 * where the rods take over and adapt further, to the 1 − ROD_ADAPTATION
 * from there. So the starlit night shows its land, its reflections and its
 * stars, 2.8 stops under the day, where the cones' adaptation alone would
 * leave it 5.2 under, black; moonrise and moonlight come out a little
 * brighter (2.7), and twilight 5° down brighter again (2.6), so the hours
 * keep their order. Both constants were chosen from frames of the hours.
 */
function adaptedLight(lux) {
  const rodsFrom = NIGHT_VISION_LIGHT[0];
  return lux >= rodsFrom ? lux ** (1 - ADAPTATION) : rodsFrom ** (1 - ADAPTATION) * (lux / rodsFrom) ** (1 - ROD_ADAPTATION);
}

/**
 * The light on level ground at a panorama's hour (lux): the true sun's or
 * its twilight's (illuminance), and where the moon lights the photo, a full
 * moon's at its elevation besides, the sun's light MOON_DIMMING times dimmer.
 * A city's night never falls below its own lamps' and sky glow's (`lit`, an
 * hour's lux: the Reflecting Pool's floodlit monuments and lamp-lit walks),
 * so its eye keeps its cones and its colours, as a starlit lake's does not.
 */
function hourLight(measurement, lit = 0) {
  const sunLight = illuminance(measurement.solar?.elevation ?? measurement.sun.elevation);
  return Math.max(lit, lightOf(measurement) === 'moon' ? sunLight + illuminance(measurement.sun.elevation) / MOON_DIMMING : sunLight);
}

const DOME_VERTEX = /* glsl */`
varying vec3 vDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vDirection = worldPosition.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  gl_Position.z = gl_Position.w;   // on the far plane: everything else is in front
}
`;

const DOME_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D uPanorama;
uniform float uMirror;         // 1, or -1 to flip the photo left for right
uniform float uRotation;       // radians added to the azimuth before the lookup
uniform float uScale;
uniform float uRadianceCap;
uniform float uOvercast;       // the cloud's cover, 0 to 1 (Weather, below)
uniform float uSkyMean;        // the clear dome's mean radiance (luminance), which cloud evens the sky toward
uniform float uOvercastScale;  // the overcast dome's brightness against the clear one's
uniform float uOvercastLand;   // the light on the land under the cloud against the clear hour's
uniform vec3 uOvercastTint;    // the cloud's colour, at unit luminance
uniform vec3 uHazeColor;       // the rain's haze (HAZE in src/shaders/scene.js)
uniform float uHazeDensity;
uniform float uFlash;          // the sky's light under lightning, against its own (1 with none)
uniform vec4 uBolt;            // a bolt: its bearing (radians from −Z toward +X), its top's elevation, its brightness against the cloud (0: none), a seed
uniform float uHorizonEdge;    // radians inside the strip's band over which it fades into the panorama (Horizon)
uniform vec4 uInsetWindow[${INSET_COUNT}];   // each inset's window: u from and to (the panorama's, its azimuth over 360°; from = to: none), the elevation (radians) of its top and of its bottom
uniform vec4 uInsetPlace[${INSET_COUNT}];    // its place in the atlas: x, y, width, height (texels)
uniform float uInsetEdge;      // radians inside a window over which its inset fades in (Insets)
uniform vec4 uBackdrop;        // the backdrop's centre (xyz) and radius (w; 0: none), metres (Backdrop)
varying vec3 vDirection;
${HORIZON_DECODE}
${INSET_SAMPLE}
#define INSET_FINEST 2.5       // texels a screen pixel spans where an inset starts to give way to the strip...
#define INSET_COARSEST 3.5     // ...and where it is gone (Insets)
#define OVERCAST_FLATTEN 0.6   // the luminance's power about the mean that cloud takes away: the sun and its glow sink, the shade lifts
uniform float uHazeLayer;      // metres: the haze's depth, which a ray climbing out of it crosses (Weather, above)
#define LAND_DISTANCE ${LAND_DISTANCE.toFixed(1)}
#define BOLT_WIDTH 0.0012      // radians: a bolt's core
#define BOLT_GLOW 0.015        // radians: the rain it lights about it
#define BOLT_GLOW_SHARE 0.04
float boltHash(float point) { return fract(sin(point * 127.1) * 43758.5453); }
// Noise of straight segments between random points: a jagged line.
float boltNoise(float point) {
  float cell = floor(point);
  return mix(boltHash(cell), boltHash(cell + 1.0), point - cell) - 0.5;
}
// The bolt's light in a direction, against the cloud's mean; land is 1 where the photo shows land.
float boltLight(vec3 direction, float land) {
  float elevation = asin(clamp(direction.y, -1.0, 1.0));
  if (elevation < 0.0 || elevation > uBolt.y) return 0.0;
  float along = elevation / uBolt.y;   // 0 at the ground, 1 at the cloud
  float wander = 0.0, amplitude = 0.25 * uBolt.y, frequency = 4.0;
  for (int octave = 0; octave < 5; octave++) {
    wander += amplitude * boltNoise(along * frequency + uBolt.w + float(octave) * 17.3);
    amplitude *= 0.5;
    frequency *= 2.2;
  }
  float bearing = atan(direction.x, -direction.z);
  float offset = mod(bearing - uBolt.x - wander + PI, 2.0 * PI) - PI;
  offset *= cos(elevation);
  float core = exp(-pow(offset / BOLT_WIDTH, 2.0));
  float glow = BOLT_GLOW_SHARE * exp(-pow(offset / BOLT_GLOW, 2.0));
  return uBolt.z * (core + glow) * (1.0 - land) * smoothstep(1.0, 0.85, along);
}
void main() {
  vec3 direction = normalize(vDirection);
  if (uBackdrop.w > 0.0) {
    // Where the ray leaves the backdrop's sphere, seen from its centre (Backdrop); from outside it, as ever.
    vec3 fromCentre = cameraPosition - uBackdrop.xyz;
    float along = dot(fromCentre, direction), inside = uBackdrop.w * uBackdrop.w - dot(fromCentre, fromCentre);
    if (inside > 0.0) direction = normalize(fromCentre + (sqrt(along * along + inside) - along) * direction);
  }
  float azimuth = atan(direction.z, direction.x * uMirror) + uRotation;
  float elevation = asin(clamp(direction.y, -1.0, 1.0));
  vec2 panoramaUv = vec2(azimuth / (2.0 * PI) + 0.5, elevation / PI + 0.5);
  vec3 radiance = texture2D(uPanorama, panoramaUv).rgb;
  // Inside an inset's window, the inset (Insets), faded in from its edges, and out where a screen pixel spans so many of
  // its texels that the strip is fine enough there. The footprint is taken here, where every pixel takes it.
  float pixelAngle = max(length(dFdx(direction)), length(dFdy(direction)));
  vec3 inset = vec3(0.0);
  float insetShare = 0.0;
  if (uInsetSize.x > 0.0) {
    float across = fract(panoramaUv.x);
    for (int index = 0; index < ${INSET_COUNT}; index++) {
      vec4 window = uInsetWindow[index];
      float offset = fract(across - window.x), span = fract(window.y - window.x);   // round the turn: a window may cross north
      float inside = min(min(offset, span - offset) * 2.0 * PI, min(window.z - elevation, elevation - window.w));
      if (inside <= 0.0) continue;
      vec4 place = uInsetPlace[index];
      vec2 perRadian = place.zw / vec2(span * 2.0 * PI, window.z - window.w);
      vec2 footprint = pixelAngle * perRadian * vec2(1.0 / max(cos(elevation), 0.05), 1.0);
      insetShare = smoothstep(0.0, uInsetEdge, inside) * (1.0 - smoothstep(INSET_FINEST, INSET_COARSEST, max(footprint.x, footprint.y)));
      if (insetShare <= 0.0) break;
      vec2 position = place.xy + vec2(offset, window.z - elevation) * perRadian * vec2(2.0 * PI, 1.0);
      inset = insetRadiance(position, footprint, place);
      break;
    }
  }
  if (uHorizonBand.x > 0.0 && insetShare < 1.0) {
    // Inside the strip's band, the strip (Horizon), faded in from the band's edges.
    float inside = min(uHorizonBand.z - elevation, elevation - uHorizonBand.w);
    if (inside > 0.0) {
      vec2 stripUv = vec2(panoramaUv.x, (uHorizonBand.z - elevation) / (uHorizonBand.z - uHorizonBand.w));
      radiance = mix(radiance, horizonRadiance(stripUv), smoothstep(0.0, uHorizonEdge, inside));
    }
  }
  radiance = mix(radiance, inset, insetShare);
  radiance *= uScale;
  float brightest = max(radiance.r, max(radiance.g, radiance.b));
  radiance *= min(1.0, uRadianceCap / max(brightest, 1e-6));
  float photoLevel = max(dot(radiance, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  // The photo's land: darker than its sky. Under cloud it keeps its detail, dimmed as the light on it is, and its blue
  // goes grey: the sky's blue reflected in far water and the far haze are the sky's light, which cloud greys.
  float land = 1.0 - smoothstep(0.25, 0.9, photoLevel / uSkyMean);
  if (uOvercast > 0.0) {
    vec3 grey = photoLevel * pow(photoLevel / uSkyMean, -OVERCAST_FLATTEN) * uOvercastTint;
    vec3 sky = mix(radiance, grey, uOvercast) * mix(1.0, uOvercastScale, uOvercast);
    float blueness = (radiance.b - max(radiance.r, radiance.g)) / photoLevel;
    vec3 shaded = mix(radiance, photoLevel * uOvercastTint, smoothstep(0.0, 0.25, blueness) * uOvercast) * mix(1.0, uOvercastLand, uOvercast);
    radiance = mix(sky, shaded, land);
  }
  radiance *= uFlash;
  if (uBolt.z > 0.0) radiance += boltLight(direction, 1.0 - smoothstep(0.4, 0.8, photoLevel / uSkyMean)) * uSkyMean * mix(1.0, uOvercastScale, uOvercast) * vec3(0.85, 0.9, 1.0);
  if (uHazeDensity > 0.0) radiance = mix(radiance, uHazeColor, 1.0 - exp(-uHazeDensity * min(uHazeLayer / max(direction.y, 1e-4), LAND_DISTANCE)));
  gl_FragColor = vec4(radiance, 1.0);
}
`;

const measurementUrl = (file) => new URL(`../assets/sky/${file}.json`, import.meta.url).href;
const panoramaFile = ({ file, resolution = '2k' }) => `${file}_${resolution}.jpg`;   // an hour's panorama (The photo)
const panoramaUrl = (name) => new URL(`../assets/sky/${name}`, import.meta.url).href;
/** The hour's horizon strip (HORIZON_STRIP), fetched after its panorama is up (Horizon). */
const horizonUrl = (file) => new URL(`../assets/sky/${file}_horizon.jpg`, import.meta.url).href;
/** The hour's insets (Insets), fetched after its strip. */
const insetsUrl = (file) => new URL(`../assets/sky/${file}_insets.jpg`, import.meta.url).href;

// The strip's band: cut by tools/sky-encode.mjs from Poly Haven's `source`
// panorama, from `above` degrees over the horizon to `below` under it, its
// rows (horizonRows, for a source `sourceHeight` rows tall) padded below to
// a multiple of the JPEG's block; the page reads the band's edges back from
// the strip's size the same way, so the two never disagree. A sky whose land
// stands higher reaches higher (its `stripAbove`, degrees: the Reflecting
// Pool's near elms, stripAbove).
export const HORIZON_STRIP = { source: '8k', above: 17, below: 3 };
const HORIZON_BLOCK = 8;
const skyOfFile = (file) => Object.values(SKIES).find((entry) => Object.values(entry.hours ?? {}).some((hour) => hour.file === file));
/** How high over the horizon (degrees) the strip of the hour whose file is `file` reaches: its sky's `stripAbove`, or HORIZON_STRIP's. */
export function stripAbove(file) {
  return skyOfFile(file)?.stripAbove ?? HORIZON_STRIP.above;
}

// The insets' atlas (Insets): each window of a sky's `insets` its
// perDegree's pixels across and down, rounded up to INSET_BLOCK (the JPEG's
// colour block, so no block holds two windows), side by side from the left,
// the atlas as tall as the tallest. tools/mall-backdrop.py renders each
// window into its place (assets/sky/<file>_insets.hdr), tools/sky-encode.mjs
// encodes it, and the dome reads it back by the same layout. A window's
// azimuths run from the first to the second, less than a turn apart: one
// across north runs past 360 ([350, 370]), never back round ([350, 10]),
// since the tool and this layout take its width as their difference.
const INSET_BLOCK = 16;
/** The insets of the hour whose file is `file`: its sky's `insets`, or none. */
export const skyInsets = (file) => skyOfFile(file)?.insets ?? [];
/** The atlas of `insets`: { width, height, places: [{ x, y, width, height }] } in texels. */
export function insetLayout(insets) {
  if (insets.length > INSET_COUNT) throw new Error(`A sky may have at most ${INSET_COUNT} insets`);
  for (const { name, azimuth, elevation } of insets) {
    if (!(azimuth[1] > azimuth[0] && azimuth[1] - azimuth[0] < 360)) throw new Error(`The ${name} inset's azimuths [${azimuth}] must rise by less than a turn: across north, run past 360 ([350, 370])`);
    if (!(elevation[1] > elevation[0])) throw new Error(`The ${name} inset's elevations [${elevation}] must rise`);
  }
  let atlasOffsetX = 0;
  const places = insets.map(({ azimuth, elevation, perDegree }) => {
    const blocks = (degrees) => Math.ceil((degrees * perDegree) / INSET_BLOCK) * INSET_BLOCK;
    const place = { x: atlasOffsetX, y: 0, width: blocks(azimuth[1] - azimuth[0]), height: blocks(elevation[1] - elevation[0]) };
    atlasOffsetX += place.width;
    return place;
  });
  return { width: atlasOffsetX, height: Math.max(0, ...places.map((place) => place.height)), places };
}
export function horizonRows(sourceHeight, aboveDegrees = HORIZON_STRIP.above) {
  const above = Math.round((aboveDegrees / 180) * sourceHeight);
  const below = Math.round((HORIZON_STRIP.below / 180) * sourceHeight);
  return { above, below: below + ((HORIZON_BLOCK - ((above + below) % HORIZON_BLOCK)) % HORIZON_BLOCK) };
}
const fetchMeasurement = (file) => loadAsset(measurementUrl(file));

/**
 * A panorama's half floats ({ data, width, height, type }) from its JPEG gain
 * map (The photo, above). UltraHDRLoader.parse (three 0.183.2) answers by
 * callback, and once its JPEGs are decoding it can fail only by throwing
 * inside a promise no caller holds; its _applyGainmapToSDR is handed this
 * promise's reject instead, so a broken file fails the load rather than
 * leaving it waiting. A file that is no gain map at all throws at once.
 */
function decodePanorama(buffer) {
  return new Promise((resolve, reject) => {
    const loader = new UltraHDRLoader().setDataType(THREE.HalfFloatType);
    const applyGainMap = loader._applyGainmapToSDR;
    if (typeof applyGainMap === 'function') {
      loader._applyGainmapToSDR = (metadata, base, gainMap, onSuccess) => applyGainMap.call(loader, metadata, base, gainMap, onSuccess, (error) => reject(error instanceof Error ? error : new Error(String(error))));
    }
    loader.parse(buffer, resolve);
  });
}

/**
 * Build the environment and start loading its first sky (firstLoad, which
 * resolves once it is shown; until then the maps hold the empty dome).
 * @param renderer the WebGLRenderer
 * @param options.name a key of SKIES (others fall back to DEFAULT_SKY), and options.hour one of its hours (others fall back to its anchor)
 * @param options.sunAzimuth radians from straight ahead (−Z) toward the right (+X), unless the sky sets its own
 * @param options.sunBalance the scene's sun irradiance under BALANCE_FILE (RGB Vector3)
 * @param options.lighting its sunDirection, sunIrradiance and skyAmbient (Vector3s) are filled in place by every load
 * @returns {{ sky, cubeTexture, envTexture, name, hour, level, targets, panoramaBytes, horizonBytes, horizonReady, assets, firstLoad, load }}
 */
export function createEnvironment(renderer, { name, hour, sunAzimuth, sunBalance, lighting }) {
  // The haze's colour and density, shared with every material that hazes (HAZE in src/shaders/scene.js).
  const hazeUniforms = { uHazeColor: { value: new THREE.Vector3() }, uHazeDensity: { value: 0 } };
  const nearLandUniforms = { uNearLand: { value: Array.from({ length: NEAR_LAND_SECTORS }, () => new THREE.Vector4()) } };   // Near land
  const sky = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: {
        uPanorama: { value: null },
        uMirror: { value: 1 },
        uRotation: { value: 0 },
        uScale: { value: 1 },
        uRadianceCap: { value: 1 },
        uOvercast: { value: 0 },
        uSkyMean: { value: 1 },
        uOvercastScale: { value: 1 },
        uOvercastLand: { value: 1 },
        uOvercastTint: { value: new THREE.Vector3(...OVERCAST_TINT) },
        uFlash: { value: 1 },
        uBolt: { value: new THREE.Vector4() },
        uHorizon: { value: null },
        uHorizonGain: { value: null },
        uHorizonMeta: { value: new THREE.Vector2() },
        uHorizonBand: { value: new THREE.Vector4() },
        uHorizonEdge: { value: THREE.MathUtils.degToRad(HORIZON_EDGE) },
        uInset: { value: null },
        uInsetSize: { value: new THREE.Vector2() },
        uInsetWindow: { value: Array.from({ length: INSET_COUNT }, () => new THREE.Vector4()) },
        uInsetPlace: { value: Array.from({ length: INSET_COUNT }, () => new THREE.Vector4()) },
        uInsetEdge: { value: THREE.MathUtils.degToRad(INSET_EDGE) },
        uBackdrop: { value: new THREE.Vector4() },
        uHazeLayer: { value: HAZE_LAYER },
        ...hazeUniforms,
      },
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.scale.setScalar(DOME_SIZE);
  sky.frustumCulled = false;
  sky.renderOrder = 1;   // after the opaque scene, so the depth test skips it under the water
  const domeUniforms = sky.material.uniforms;

  // Under the horizon the photo shows its own ground; for the cube, cover it
  // with a dark water-coloured hemisphere, as the pond would look from the drops.
  // Drawn after the dome (which is at the far plane), so no depth buffer is needed.
  // The capture draws its own mesh of the dome's geometry and material: the
  // dome itself belongs to the scene.
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(...GROUND), side: THREE.BackSide }),
  );
  ground.position.y = 0.3;
  ground.renderOrder = 2;
  const captureDome = new THREE.Mesh(sky.geometry, sky.material);
  captureDome.scale.setScalar(DOME_SIZE);
  captureDome.frustumCulled = false;
  captureDome.renderOrder = 1;
  const captureScene = new THREE.Scene();
  captureScene.add(captureDome, ground);
  const cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const prefilterSource = new THREE.WebGLCubeRenderTarget(PREFILTER_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const cubeCameras = [cubeTarget, prefilterSource].map((target) => {
    const cubeCamera = new THREE.CubeCamera(0.5, 50000, target);
    cubeCamera.position.set(0, 1.15, 0);
    return cubeCamera;
  });
  // The land before the haze (the grass's, PHOTO_LAND in src/shaders/scene.js): in haze the cube is captured once
  // without it and its LAND_LEVEL copied into landTarget, before the hazed capture; with none the grass reads the
  // cube itself. The copy's program is compiled here, under the loading veil.
  const landTarget = new THREE.WebGLCubeRenderTarget(LAND_CUBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const landCamera = new THREE.CubeCamera(0.1, 10, landTarget);
  const landCopy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vDirection;\nvoid main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform samplerCube uCube;\nvarying vec3 vDirection;\nvoid main() { gl_FragColor = vec4(textureCubeLodEXT(uCube, normalize(vDirection), ${LAND_LEVEL.toFixed(1)}).rgb, 1.0); }`,
    uniforms: { uCube: { value: cubeTarget.texture } },
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  }));
  const landCopyScene = new THREE.Scene();
  landCopy.frustumCulled = false;
  landCopyScene.add(landCopy);
  landCamera.update(renderer, landCopyScene);
  const landCube = { value: cubeTarget.texture };   // shared uniform objects (src/pondFloor.js createShore)
  const landLevel = { value: LAND_LEVEL };
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  // Each measurement is fetched once: a place's hours all read its anchor's and its facing hour's.
  const measurements = new Map();
  const measurementOf = (file) => {
    if (!measurements.has(file)) measurements.set(file, fetchMeasurement(file).catch((error) => { measurements.delete(file); throw error; }));
    return measurements.get(file);
  };
  // Start the calibration and panorama together, avoiding a network waterfall.
  const balancePromise = measurementOf(BALANCE_FILE);
  const balanceLuminance = luminance(sunBalance.toArray());
  // Panoramas fetched ahead (prefetch), by file, each its download and the controller that aborts it, at most
  // PREFETCHED of them, the oldest let go (aborted) first. A load takes its own out, its signal then aborting that
  // download too, or fetches it afresh if fetching it ahead failed.
  const prefetched = new Map();
  const fetchPanorama = (file, signal) => loadAsset(panoramaUrl(file), 'arrayBuffer', { signal });
  function takePanorama(file, signal) {
    const ahead = prefetched.get(file);
    prefetched.delete(file);
    if (!ahead) return fetchPanorama(file, signal);
    if (signal?.aborted) ahead.controller.abort(signal.reason);
    else signal?.addEventListener('abort', () => ahead.controller.abort(signal.reason), { once: true });
    return ahead.download.catch(() => fetchPanorama(file, signal));
  }

  const fog = new THREE.FogExp2(0x000000, 0);   // the haze for the main scene's built-in materials (above)
  const environment = { sky, cubeTexture: cubeTarget.texture, envTexture: null, name: null, hour: null, level: 1, hazeUniforms, nearLandUniforms, fog, landCube, landLevel, targets: [], panoramaBytes: 0, horizonBytes: 0, horizonReady: Promise.resolve(), assets: [], firstLoad: null, load, prefetch, setWeather, setFlash };

  // The horizon strip (Horizon): the hour's, fetched once its panorama is up; the last asked for wins.
  let horizonRequest = 0;
  let insetTarget = null;   // the decoded atlas (Insets)
  function clearHorizon() {
    for (const name of ['uHorizon', 'uHorizonGain']) {
      domeUniforms[name].value?.dispose();
      domeUniforms[name].value = null;
    }
    insetTarget?.dispose();
    insetTarget = null;
    domeUniforms.uInset.value = null;
    domeUniforms.uHorizonBand.value.set(0, 0, 0, 0);
    domeUniforms.uInsetSize.value.set(0, 0);
    environment.horizonBytes = 0;
  }
  const gainMapTexture = (image, format, wrap) => {
    const made = new THREE.Texture(image);
    made.format = format;
    made.colorSpace = THREE.NoColorSpace;   // the bytes as coded: the shader decodes them
    made.minFilter = made.magFilter = THREE.NearestFilter;   // each texel with its own gain (horizonRadiance)
    made.generateMipmaps = false;
    made.flipY = false;   // row 0 is the top
    made.wrapS = wrap;
    made.needsUpdate = true;
    made.onUpdate = () => { image.close(); };   // on the GPU now: free the bitmap
    return made;
  };
  const gainMapMeta = ({ weight, gainMapMin, gainMapMax }) => [weight * gainMapMin, weight * (gainMapMax - gainMapMin)];
  // The atlas's decoding (INSET_DECODE_PASS), built when insets first come: a quad over the target, its own camera.
  let insetDecoder = null;
  function decodeInsetAtlas(atlas) {
    insetDecoder ??= (() => {
      const material = new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}',
        fragmentShader: INSET_DECODE_PASS,
        uniforms: { uInsetBase: { value: null }, uInsetGain: { value: null }, uInsetMeta: { value: new THREE.Vector2() } },
        depthTest: false,
        depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      const scene = new THREE.Scene();
      scene.add(quad);
      return { material, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    })();
    const base = gainMapTexture(atlas.base, THREE.RGBAFormat, THREE.ClampToEdgeWrapping);
    const gain = gainMapTexture(atlas.gain, THREE.RedFormat, THREE.ClampToEdgeWrapping);
    const target = new THREE.WebGLRenderTarget(atlas.width, atlas.height, {
      type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    const uniforms = insetDecoder.material.uniforms;
    uniforms.uInsetBase.value = base;
    uniforms.uInsetGain.value = gain;
    uniforms.uInsetMeta.value.set(...gainMapMeta(atlas.metadata));
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(insetDecoder.scene, insetDecoder.camera);   // (three makes the target's mip levels after it)
    renderer.setRenderTarget(previous);
    uniforms.uInsetBase.value = uniforms.uInsetGain.value = null;
    base.dispose();
    gain.dispose();
    return target;
  }
  // The hour's insets (Insets), their windows from the sky's `insets` and their places from the atlas's layout.
  async function loadInsets(file, request, signal) {
    const insets = skyInsets(file);
    if (!insets.length) return;
    const atlas = await decodeHorizonStrip(await loadAsset(insetsUrl(file), 'arrayBuffer', { signal }));
    const layout = insetLayout(insets);
    if (request !== horizonRequest || atlas.width !== layout.width || atlas.height !== layout.height) {
      atlas.base.close(); atlas.gain.close();
      if (request === horizonRequest) throw new Error(`the atlas is ${atlas.width} × ${atlas.height}, its layout ${layout.width} × ${layout.height}`);
      return;
    }
    insetTarget = decodeInsetAtlas(atlas);
    domeUniforms.uInset.value = insetTarget.texture;
    insets.forEach(({ azimuth, elevation }, index) => {
      const { x: atlasX, y: atlasY, width, height } = layout.places[index];
      domeUniforms.uInsetWindow.value[index].set(azimuth[0] / 360, azimuth[1] / 360, THREE.MathUtils.degToRad(elevation[1]), THREE.MathUtils.degToRad(elevation[0]));
      domeUniforms.uInsetPlace.value[index].set(atlasX, atlasY, width, height);
    });
    for (let index = insets.length; index < INSET_COUNT; index++) domeUniforms.uInsetWindow.value[index].set(0, 0, 0, 0);
    domeUniforms.uInsetSize.value.set(atlas.width, atlas.height);
    environment.horizonBytes += Math.round(atlas.width * atlas.height * 8 * 4 / 3);   // half floats, and their mip levels
  }
  async function loadHorizon(file, signal) {
    const request = ++horizonRequest;
    clearHorizon();
    try {
      const strip = await decodeHorizonStrip(await loadAsset(horizonUrl(file), 'arrayBuffer', { signal }));
      if (request !== horizonRequest) { strip.base.close(); strip.gain.close(); return; }
      domeUniforms.uHorizon.value = gainMapTexture(strip.base, THREE.RGBAFormat, THREE.RepeatWrapping);   // the azimuth wraps
      domeUniforms.uHorizonGain.value = gainMapTexture(strip.gain, THREE.RedFormat, THREE.RepeatWrapping);
      domeUniforms.uHorizonMeta.value.set(...gainMapMeta(strip.metadata));
      // The band's elevations from the strip's size (horizonRows: the encoder's rows), a row's height at the source's resolution.
      const rows = horizonRows(strip.width / 2, stripAbove(file));
      const rowHeight = Math.PI / (strip.width / 2);
      domeUniforms.uHorizonBand.value.set(strip.width, strip.height, rows.above * rowHeight, -rows.below * rowHeight);
      environment.horizonBytes = strip.width * strip.height * 5;
    } catch (error) {
      if (request === horizonRequest && !signal?.aborted) console.warn(`The horizon strip of ${file} did not load; the panorama stands alone.`, error);
      return;
    }
    try {
      await loadInsets(file, request, signal);
    } catch (error) {
      if (request === horizonRequest && !signal?.aborted) console.warn(`The insets of ${file} did not load; the strip stands alone.`, error);
    }
  }
  // The hour's light under a clear sky (load), which the weather covers (applyWeather).
  const clear = { sun: new THREE.Vector3(), sky: new THREE.Vector3(), air: new THREE.Vector3(), airDensity: 0, lux: 1, level: 1 };
  let weather = { cover: 0, light: 1, visibility: Infinity, hazeBrightness: HAZE_BRIGHTNESS, hazeLayer: HAZE_LAYER };

  /**
   * Load a sky (a key of SKIES; others fall back to DEFAULT_SKY) at one of
   * its hours (others fall back to its anchor) and make it the scene's, all
   * at once when it has arrived.
   */
  async function load(requestedPlace, requestedHour, { signal } = {}) {
    const skyName = Object.hasOwn(SKIES, requestedPlace ?? '') ? requestedPlace : DEFAULT_SKY;
    const place = SKIES[skyName];
    const firstHour = Object.keys(place.hours)[0];
    const anchorFile = place.hours[place.anchor ?? firstHour].file;
    const facingFile = place.hours[place.facing ?? firstHour].file;
    const hourName = resolveHour(skyName, requestedHour);
    const entry = place.hours[hourName];
    const { file } = entry;
    const arrivals = Promise.all([
      measurementOf(file),
      measurementOf(anchorFile),
      measurementOf(facingFile),
      takePanorama(panoramaFile(entry), signal),
      balancePromise,
    ]);
    dropEarlyAssets();   // the page's early fetches this load has not taken: not this sky's
    const [measurement, anchor, facing, buffer, balance] = await arrivals;
    signal?.throwIfAborted();
    // Decode only after every asset succeeded, so a failed measurement cannot
    // orphan a decoded panorama. The texture is set as the sky was drawn from
    // the Radiance files (HDRLoader.load's settings: no mipmaps, linear
    // filtering, rows flipped), not as UltraHDRLoader.load sets its own.
    const decoded = await decodePanorama(buffer);
    signal?.throwIfAborted();
    const panorama = new THREE.DataTexture(decoded.data, decoded.width, decoded.height, THREE.RGBAFormat, decoded.type);
    panorama.colorSpace = THREE.LinearSRGBColorSpace;
    panorama.minFilter = panorama.magFilter = THREE.LinearFilter;
    panorama.generateMipmaps = false;
    panorama.flipY = true;
    panorama.needsUpdate = true;
    panorama.wrapS = THREE.RepeatWrapping;   // the azimuth wraps; no seam at u = 0
    const panoramaBytes = panorama.image.data.byteLength;
    panorama.onUpdate = () => { panorama.image.data = null; };   // on the GPU now: free the CPU copy

    // The turn: the facing hour's sun at the scene's azimuth, every other
    // hour by the same turn and its north's difference (Orientation).
    const mirror = place.mirrored ? -1 : 1;
    const azimuth = place.sunAzimuth === undefined ? sunAzimuth : THREE.MathUtils.degToRad(place.sunAzimuth);
    const facingElevation = THREE.MathUtils.degToRad(facing.sun.elevation);
    const facingSun = new THREE.Vector3(Math.cos(facingElevation) * Math.sin(azimuth), Math.sin(facingElevation), -Math.cos(facingElevation) * Math.cos(azimuth));
    const [facingSunX, , facingSunZ] = facing.sun.direction;
    const facingRotation = Math.atan2(facingSunZ, facingSunX) - Math.atan2(facingSun.z, facingSun.x * mirror);
    const rotation = file === facingFile ? facingRotation : facingRotation + THREE.MathUtils.degToRad(measurement.north - facing.north);
    // The sun: the photo's, or where the true one is when it is down, at
    // DOWN_SUN_ELEVATION; the file's direction turned into the scene's.
    const sunlit = lightOf(measurement) !== 'none';   // the sun or the moon
    if (file === facingFile) lighting.sunDirection.copy(facingSun);
    else {
      const fileAzimuth = sunlit ? Math.atan2(measurement.sun.direction[2], measurement.sun.direction[0]) : THREE.MathUtils.degToRad(measurement.north + measurement.solar.azimuth) - Math.PI;
      const elevation = THREE.MathUtils.degToRad(sunlit ? measurement.sun.elevation : Math.max(measurement.solar.elevation, DOWN_SUN_ELEVATION));
      const sceneAzimuth = fileAzimuth - rotation;
      lighting.sunDirection.set(mirror * Math.cos(sceneAzimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(sceneAzimuth) * Math.cos(elevation));
    }

    // The brightness: the anchor's as a single photograph's, the hour's
    // light against the anchor's (Light by the hour).
    // A sun seen through leaves (`shadedSun`: the garden's) measures dim against its sky: such a photograph is
    // exposed instead so that its light on level ground, its sun's and its sky's together, is the balance's, its sun
    // keeping its own small share of it (so the floor's caustics are faint, as in shade).
    const levelLight = (measured) => luminance(measured.sunIrradiance) * Math.max(Math.sin(THREE.MathUtils.degToRad(measured.sun.elevation)), 0) + Math.PI * luminance(measured.skyRadiance);
    const balanceScale = (balanceLuminance / luminance(balance.sunIrradiance)) * SKY_EXPOSURE;
    // A sky far brighter on level ground than the balance's (`adapt`: the lagoon's midday, its sun high among bright
    // cumulus) is exposed as an eye adapted that share of the way to it sees it, sun and sky together.
    const adapted = place.adapt ? (levelLight(balance) / levelLight(anchor)) ** place.adapt : 1;
    const anchorScale = place.shadedSun ? balanceScale * levelLight(balance) / levelLight(anchor) : (balanceLuminance / luminance(anchor.sunIrradiance)) * SKY_EXPOSURE * adapted;
    const level = (file === anchorFile ? 1 : adaptedLight(hourLight(measurement, entry.lit)) / adaptedLight(hourLight(anchor, place.hours[place.anchor ?? firstHour].lit))) * 2 ** (entry.exposure ?? 0);
    const scale = anchorScale * level;
    if (sunlit) {
      const sunColour = new THREE.Vector3().fromArray(measurement.sunIrradiance).divide(new THREE.Vector3().fromArray(balance.sunIrradiance)).multiply(sunBalance);
      // The photo's sun on the dome's scale (sunIrradiance is π times a physical irradiance: SKY_EXPOSURE): the
      // balance's at its anchor hour, a shaded sun's (shadedSun) its own small share.
      const sunLuminance = luminance(measurement.sunIrradiance) * scale / SKY_EXPOSURE;
      clear.sun.copy(sunColour.multiplyScalar(sunLuminance / luminance(sunColour.toArray())));
    } else {
      clear.sun.set(0, 0, 0);
    }
    clear.sky.fromArray(measurement.skyRadiance).multiplyScalar(scale);
    if (entry.air) clear.air.fromArray(entry.air.horizon).multiplyScalar(scale);
    else clear.air.set(0, 0, 0);
    clear.airDensity = entry.air ? 1 / entry.air.distance : 0;
    clear.lux = hourLight(measurement, entry.lit);
    clear.level = level;

    const previous = domeUniforms.uPanorama.value;
    domeUniforms.uPanorama.value = panorama;
    domeUniforms.uMirror.value = mirror;
    domeUniforms.uRotation.value = rotation;
    setNearLand(nearLandUniforms.uNearLand.value, place.nearLand, measurement.north, rotation, mirror);
    const backdrop = skyBackdrop(skyName);
    domeUniforms.uBackdrop.value.set(...(backdrop?.centre ?? [0, 0, 0]), backdrop?.radius ?? 0);
    domeUniforms.uScale.value = scale;
    domeUniforms.uRadianceCap.value = RADIANCE_CAP * luminance(clear.sky.toArray());
    applyWeather();
    previous?.dispose();
    environment.horizonReady = loadHorizon(file, signal);   // the strip follows the panorama; a superseded load's is dropped

    const assets = [panoramaUrl(panoramaFile(entry)), ...new Set([file, anchorFile, facingFile, BALANCE_FILE].map(measurementUrl))];
    Object.assign(environment, { name: skyName, hour: hourName, panoramaBytes, assets });
    return skyName;
  }

  /**
   * Fetch a place's hour ahead of its load (Switching, above): its panorama
   * and its measurements, so that loading it waits on nothing. Nothing is
   * decoded or shown; the hour shown, one unknown and one already fetched
   * ahead are passed over.
   */
  function prefetch(requestedPlace, requestedHour) {
    const entry = Object.hasOwn(SKIES, requestedPlace ?? '') ? SKIES[requestedPlace].hours[requestedHour] : undefined;
    if (!entry) return;
    const file = panoramaFile(entry);
    if (prefetched.has(file) || (environment.name === requestedPlace && environment.hour === requestedHour)) return;
    measurementOf(entry.file).catch(() => {});
    const controller = new AbortController();
    const ahead = { download: fetchPanorama(file, controller.signal), controller };
    ahead.download.catch(() => { if (prefetched.get(file) === ahead) prefetched.delete(file); });
    prefetched.set(file, ahead);
    for (const [oldestFile, oldest] of prefetched) {
      if (prefetched.size <= PREFETCHED) break;
      oldest.controller.abort();
      prefetched.delete(oldestFile);
    }
  }

  /**
   * The weather over the sky: `cover` (0 clear to 1 overcast), the light
   * that reaches the ground under it against a clear sky's (`light`), and
   * the rain's, the snow's or the fog's `visibility` (metres; Infinity for
   * none), its haze's brightness against the cloud's (`hazeBrightness`) and
   * its depth (`hazeLayer`, metres). Applied at once, the cube and the
   * prefiltered map captured again (Weather, above); the weather already
   * over it changes nothing.
   */
  function setWeather({ cover = 0, light = 1, visibility = Infinity, hazeBrightness = HAZE_BRIGHTNESS, hazeLayer = HAZE_LAYER } = {}) {
    if (cover === weather.cover && light === weather.light && visibility === weather.visibility && hazeBrightness === weather.hazeBrightness && hazeLayer === weather.hazeLayer) return;
    weather = { cover, light, visibility, hazeBrightness, hazeLayer };
    applyWeather();
  }

  /** The lighting of the hour (clear) under the weather; then the cube and the prefiltered map. */
  function applyWeather() {
    const { cover, light, visibility, hazeBrightness, hazeLayer } = weather;
    const sunSine = Math.max(lighting.sunDirection.y, 0);
    const hazeDensity = Number.isFinite(visibility) ? 3 / visibility : 0;
    // What reaches the ground of the sun's direct light: what the cloud leaves, through the haze along the sun's path
    // (as the dome's, at most LAND_DISTANCE). The rest, `shade`, the cloud's or the haze's light gives back.
    const sunThrough = Math.exp(-hazeDensity * Math.min(hazeLayer / Math.max(sunSine, 1e-4), LAND_DISTANCE));
    const shade = 1 - (1 - cover) * sunThrough;
    // The clear hour's light on level ground, in the sky's units: the sky's
    // (π times its mean radiance) and the sun's (sunIrradiance over π, the
    // SKY_EXPOSURE convention). Under cloud all of it comes from the cloud.
    const clearLight = Math.PI * luminance(clear.sky.toArray()) + luminance(clear.sun.toArray()) * sunSine / SKY_EXPOSURE;
    // The cloud lets `light` of the hour's light through, seen by an eye adapted to it.
    const lux = clear.lux * (shade > 0 ? 1 - shade + shade * light : 1);
    const cloudLuminance = clearLight * adaptedLight(clear.lux * light) / adaptedLight(clear.lux) / Math.PI;
    lighting.sunIrradiance.copy(clear.sun).multiplyScalar(1 - shade);
    lighting.skyAmbient.copy(clear.sky).lerp(new THREE.Vector3(...OVERCAST_TINT).multiplyScalar(cloudLuminance), shade);
    const weatherLevel = shade > 0 ? (Math.PI * luminance(lighting.skyAmbient.toArray()) + luminance(lighting.sunIrradiance.toArray()) * sunSine / SKY_EXPOSURE) / clearLight : 1;
    const level = clear.level * weatherLevel;
    const rodsFrom = Math.log10(NIGHT_VISION_LIGHT[0]);
    lighting.night = THREE.MathUtils.smoothstep(rodsFrom - Math.log10(lux), 0, rodsFrom - Math.log10(NIGHT_VISION_LIGHT[1]));
    ground.material.color.setRGB(GROUND[0] * level, GROUND[1] * level, GROUND[2] * level);
    domeUniforms.uOvercast.value = cover;
    domeUniforms.uSkyMean.value = luminance(clear.sky.toArray());
    domeUniforms.uOvercastScale.value = cloudLuminance / Math.max(luminance(clear.sky.toArray()), 1e-9);
    domeUniforms.uOvercastLand.value = Math.PI * cloudLuminance / Math.max(clearLight, 1e-9);
    hazeUniforms.uHazeDensity.value = hazeDensity;
    domeUniforms.uHazeLayer.value = hazeLayer;
    fog.density = hazeDensity;
    hazeUniforms.uHazeColor.value.copy(lighting.skyAmbient).multiplyScalar(hazeBrightness);
    // The hour's clear air (`air`), under cloud the cloud's horizon.
    if (lighting.air) {
      const air = clear.air.clone().lerp(hazeUniforms.uHazeColor.value, shade);
      lighting.air.set(air.x, air.y, air.z, clear.airDensity);
    }

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    if (hazeDensity > 0) {
      hazeUniforms.uHazeDensity.value = 0;
      cubeCameras[0].update(renderer, captureScene);
      landCamera.update(renderer, landCopyScene);
      hazeUniforms.uHazeDensity.value = hazeDensity;
    }
    landCube.value = hazeDensity > 0 ? landTarget.texture : cubeTarget.texture;
    landLevel.value = hazeDensity > 0 ? 0 : LAND_LEVEL;
    for (const cubeCamera of cubeCameras) cubeCamera.update(renderer, captureScene);
    renderer.autoClear = previousAutoClear;
    envTarget = pmrem.fromCubemap(prefilterSource.texture, envTarget);
    Object.assign(environment, { envTexture: envTarget.texture, level, targets: [cubeTarget, prefilterSource, envTarget, landTarget] });
    unlit.ambient.copy(lighting.skyAmbient);
    unlit.haze.copy(hazeUniforms.uHazeColor.value);
    setFlash(flash.level, flash.bolt);
  }

  // What the weather set, before a flash multiplies it (setFlash).
  const unlit = { ambient: new THREE.Vector3(), haze: new THREE.Vector3() };
  const flash = { level: 1, bolt: null };
  /**
   * Lightning (src/lightning.js): the sky's light times `level` (1 for none),
   * and a bolt ({ bearing, top, brightness, seed }; null or a brightness of 0
   * for none) drawn on the dome. Each frame; nothing is captured again.
   */
  function setFlash(level, bolt = null) {
    flash.level = level;
    flash.bolt = bolt;
    domeUniforms.uFlash.value = level;
    lighting.skyAmbient.copy(unlit.ambient).multiplyScalar(level);
    hazeUniforms.uHazeColor.value.copy(unlit.haze).multiplyScalar(level);
    fog.color.setRGB(hazeUniforms.uHazeColor.value.x, hazeUniforms.uHazeColor.value.y, hazeUniforms.uHazeColor.value.z);
    if (bolt && bolt.brightness > 0) domeUniforms.uBolt.value.set(bolt.bearing, bolt.top, bolt.brightness, bolt.seed);
    else domeUniforms.uBolt.value.z = 0;
  }

  // The empty dome's capture (Starting): the maps, at their sizes, before any photo.
  lighting.sunDirection.set(0, 1, 0);
  applyWeather();
  environment.firstLoad = load(name, hour);
  return environment;
}
