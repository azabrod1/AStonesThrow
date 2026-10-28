// Foam specks: the fine bubbles a splash scatters on the surface, which pop
// away over several seconds.
//
// The raft itself is the foam map (src/spectralWater.js), which the water
// shader draws as a pattern of bubbles, lace and holes (FOAM_PATTERN in
// src/shaders/scene.js); the specks are the bits that drift out of it and
// the bubbles that land or surface away from it. Each is a point riding the
// water surface, MIN_DIAMETER to MAX_DIAMETER across (1 to 7 mm, most under
// 2: a grain, with the odd big bubble among them), living 0.8 to 3 s (most
// nearer 1: fresh water's bubbles burst within a second or two, src/splash.js
// on the foam; a bubble over BIG_DIAMETER shorter still, since the big ones
// burst first), drifting slowly outward from where it was born and downwind
// with the raft (the foam map's drift, src/spectralWater.js), wandering a
// millimetre or so, and fading quickly at the end. Surface bubbles are mostly
// clear with a bright rim, and no two catch the light alike, so a speck is a
// translucent white of its own shine, MIN_SHINE to 1 of OPACITY (most faint,
// a few bright), dimmer than the raft: a lone one is faint, a cluster of them
// reads as foam. A resolved bubble is a dome standing on the water
// (SURFACE_BUBBLE in src/shaders/scene.js, as the water draws its own
// bursting bubbles): its film nearly clear, with a window of sky mirrored on
// its top and the dark water on its limb and lower part, a faint shadow
// along its foot and the sun's glint on it, a soft spot on a small one and a
// white point on a large one (SPECK_FRAGMENT); an unresolved one a soft
// grain, its opacity following the area it really covers, with no minimum
// brightness at a distance. The splash makes them where the crown's base
// was, where the jet falls
// back, where drops land and where bubbles surface. A patch of them
// (spawnPatch) is never an even scatter: its specks gather in rafts of about
// RAFT_SPECKS (a clump of clusters of two to six within a few millimetres,
// spread over a few centimetres), a few rafts to a patch, favouring one side
// of the ring they are spawned on (LOPSIDE), with a share of strays
// (STRAYS) alone between them, so a patch is lumps with gaps, as foam
// gathers; and its rafts surface over a span the caller gives, each raft's
// specks over BIRTH_JITTER after it, so the specks come up as the air does
// rather than all in one frame. Where the foam map is dense, a raft or the
// froth over a splash's boil (up to FOAM_FROTH_GAIN times its cloud), a speck
// fades out (SPECK_VERTEX), so specks never double the foam's own bubbles.
//
// A speck's whole life is a closed form of the splash time (SPECK_VERTEX in
// src/shaders/scene.js), so the CPU writes each one once, when it is born
// (or before: a speck may be written with a birth still to come, and is not
// drawn until then), into a ring of typed arrays (the oldest slot is reused
// when the ring is full) and uploads only the slots written since the last
// frame. Per frame the cost is two uniforms and a draw of the slots in use,
// each vertex one fetch of the splash's height texture, one of the ambient
// waves' (src/ambientWaves.js), so specks ride their crests, one of each live
// ring's profile (src/rings.js, which the water carries as water.rings) and
// one of the foam map; nothing is drawn once every speck has gone. The texel
// offset is the solver's shared uniform, so a change of its grid reaches the
// specks, and so is the drift's velocity. A patch's draws come from a random
// stream of its own (seededRandom, src/spray.js), seeded by its place and
// time, so a patch shifts no other draw of the splash.
import * as THREE from 'three';
import { SPECK_VERTEX, SPECK_FRAGMENT } from './shaders/scene.js';
import { seededRandom } from './spray.js';

const CAPACITY = 8192;           // specks alive at once: a 30 cm rock leaves about 3000 over its life, so two of the biggest throws fit
const MIN_LIFE = 0.8;            // fresh water: a bubble on it bursts within a second or two (src/splash.js on the foam)
const MAX_LIFE = 3;
const LIFE_SKEW = 1.8;            // life = MIN + (MAX − MIN)·u^LIFE_SKEW: most specks go early
const MIN_DIAMETER = 0.001;       // 1 mm: a grain, under a pixel from the bank
const MAX_DIAMETER = 0.007;       // 7 mm: the odd big bubble
const DIAMETER_SKEW = 3;          // diameter = MIN + (MAX − MIN)·u^DIAMETER_SKEW: most under 2 mm, one in ten over 5
const BIG_DIAMETER = 0.004;       // a bubble over this lives shorter, by (BIG_DIAMETER / diameter)^BIG_LIFE_POWER: the big ones burst first
const BIG_LIFE_POWER = 1.5;
const MIN_SHINE = 0.3;            // a speck's own brightness, this to 1 of OPACITY...
const SHINE_SKEW = 2;             // ...as MIN_SHINE + (1 − MIN_SHINE)·u^SHINE_SKEW: most faint, a few bright
const CLUSTER_SPREAD = 0.003;     // specks of one cluster lie within this of its centre (m)
const MIN_CLUSTER = 2;
const MAX_CLUSTER = 6;
const RAFT_SPECKS = 20;           // a patch's specks gather in rafts of half to one and a half times this many (clumps with gaps between: rafts of 14 filled a ring)...
const RAFT_SPREAD = 0.18;         // ...each spread (σ) half to one and a half times this share of the ring's width about its centre: a clump, not a sprinkle
const STRAYS = 0.1;               // ...but this share of a patch lie alone, anywhere on the ring (a lone bubble on open water is rare; 0.2 sprinkled the ring)
const LOPSIDE = 0.7;              // the rafts favour one side of the ring, chosen at random: density 1 + LOPSIDE·cos(angle from it)
const BIRTH_JITTER = 0.15;        // a raft's clusters surface over this long (s) after the raft
const OPACITY = 0.6;              // a speck of full shine
const BRIGHTNESS = 0.75;          // against the raft's white
const MIN_PIXEL_SIZE = 3;         // smaller specks are drawn about this wide (CSS pixels), soft and faint

const randomRange = (random, low, high) => low + random() * (high - low);
/** A standard normal draw (Box–Muller, one of the pair). */
const randomNormal = (random) => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(random() * Math.PI * 2);
/** A speck's diameter (m): MIN_DIAMETER to MAX_DIAMETER, most small (the header). */
const speckDiameter = (random) => MIN_DIAMETER + (MAX_DIAMETER - MIN_DIAMETER) * random() ** DIAMETER_SKEW;

export class FoamSpecks {
  constructor({ water, lighting, ambientWaves, capacity = CAPACITY }) {
    this.water = water;
    this.capacity = capacity;
    this.next = 0;               // the ring slot the next speck takes
    this.used = 0;               // slots written at least once: the draw range
    this.lastDeath = -Infinity;  // splash time the last speck dies
    this.dirtyFrom = capacity;   // slots written since the last commit
    this.dirtyTo = 0;

    this.positions = new Float32Array(capacity * 3);
    this.drifts = new Float32Array(capacity * 2);
    this.timings = new Float32Array(capacity * 4);
    this.shines = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.driftAttribute = new THREE.BufferAttribute(this.drifts, 2).setUsage(THREE.DynamicDrawUsage);
    this.timingAttribute = new THREE.BufferAttribute(this.timings, 4).setUsage(THREE.DynamicDrawUsage);
    this.shineAttribute = new THREE.BufferAttribute(this.shines, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aDrift', this.driftAttribute);
    geometry.setAttribute('aTiming', this.timingAttribute);
    geometry.setAttribute('aShine', this.shineAttribute);
    this.attributes = [this.positionAttribute, this.driftAttribute, this.timingAttribute, this.shineAttribute];
    geometry.setDrawRange(0, 0);
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      vertexShader: SPECK_VERTEX,
      fragmentShader: SPECK_FRAGMENT,
      uniforms: {
        uHeight: { value: water.heightTexture },
        uFoam: { value: water.foamTexture },
        uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
        uDomainSize: { value: water.domainSize },
        uTexelOffset: water.gridUniforms?.uTexelOffset ?? { value: water.uvOffset },
        uTime: { value: 0 },
        uFoamVelocity: water.foamUniforms?.uFoamVelocity ?? { value: new THREE.Vector2() },
        uProjScale: { value: 1000 },
        uMinPixelSize: { value: MIN_PIXEL_SIZE },
        uSunDir: { value: lighting.sunDirection },
        uSunIrradiance: { value: lighting.sunIrradiance },
        uSkyAmbient: { value: lighting.skyAmbient },
        uOpacity: { value: OPACITY },
        uBrightness: { value: BRIGHTNESS },
        ...ambientWaves.uniforms(),
        ...(water.rings ? water.rings.uniforms() : {}),
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /**
   * One speck at (x, z), born at splash time `time` (which may be still to
   * come), drifting at (driftX, driftZ) m/s at first, `diameter` across
   * (drawn from `random` if not given, and held within MIN_DIAMETER and
   * MAX_DIAMETER); its life, its shine and its phase are drawn from `random`.
   */
  spawn(x, z, driftX, driftZ, time, diameter, random = Math.random) {
    diameter = diameter === undefined ? speckDiameter(random) : THREE.MathUtils.clamp(diameter, MIN_DIAMETER, MAX_DIAMETER);
    const slot = this.next;
    this.next = (slot + 1) % this.capacity;
    this.used = Math.max(this.used, slot + 1);
    let life = MIN_LIFE + (MAX_LIFE - MIN_LIFE) * random() ** LIFE_SKEW;
    if (diameter > BIG_DIAMETER) life *= (BIG_DIAMETER / diameter) ** BIG_LIFE_POWER;
    this.positions[slot * 3] = x;
    this.positions[slot * 3 + 1] = 0;
    this.positions[slot * 3 + 2] = z;
    this.drifts[slot * 2] = driftX;
    this.drifts[slot * 2 + 1] = driftZ;
    this.timings[slot * 4] = time;
    this.timings[slot * 4 + 1] = life;
    this.timings[slot * 4 + 2] = diameter;
    this.timings[slot * 4 + 3] = random() * Math.PI * 2;
    this.shines[slot] = MIN_SHINE + (1 - MIN_SHINE) * random() ** SHINE_SKEW;
    this.lastDeath = Math.max(this.lastDeath, time + life);
    this.dirtyFrom = Math.min(this.dirtyFrom, slot);
    this.dirtyTo = Math.max(this.dirtyTo, slot + 1);
  }

  /**
   * `count` specks over the ring between two radii around (x, z) (inner 0
   * for a disc), drifting outward at up to `driftSpeed` m/s: STRAYS of them
   * alone, the rest in rafts (the header), the rafts born over `span`
   * seconds from `time`. The draws come from a stream of the patch's own.
   */
  spawnPatch(x, z, innerRadius, outerRadius, count, time, driftSpeed, span = 0) {
    if (!(count > 0)) return;
    const random = seededRandom(x, z, time, count);
    const heavySide = random() * Math.PI * 2;
    const width = outerRadius - innerRadius;
    // A place on the ring: an angle favouring the heavy side (by rejection), a distance even over the ring's area.
    const ringAngle = () => {
      let angle;
      do angle = random() * Math.PI * 2;
      while (random() * (1 + LOPSIDE) > 1 + LOPSIDE * Math.cos(angle - heavySide));
      return angle;
    };
    const ringDistance = () => Math.sqrt(randomRange(random, innerRadius * innerRadius, outerRadius * outerRadius));
    let left = count;
    const strays = Math.min(left, Math.floor(count * STRAYS + random()));
    for (let stray = 0; stray < strays; stray++) {
      const angle = ringAngle(), distance = ringDistance();
      const speed = driftSpeed * randomRange(random, 0.3, 1);
      this.spawn(x + Math.cos(angle) * distance, z + Math.sin(angle) * distance, Math.cos(angle) * speed, Math.sin(angle) * speed, time + span * random(), undefined, random);
    }
    left -= strays;
    while (left > 0) {
      // A raft: its centre on the ring, its clusters spread about it as a Gaussian, drifting out together.
      const raft = Math.min(left, Math.max(1, Math.round(RAFT_SPECKS * randomRange(random, 0.5, 1.5))));
      const angle = ringAngle(), distance = ringDistance();
      const centreX = x + Math.cos(angle) * distance, centreZ = z + Math.sin(angle) * distance;
      const spread = RAFT_SPREAD * width * randomRange(random, 0.5, 1.5);
      const birth = time + span * random();
      const speed = driftSpeed * randomRange(random, 0.3, 1);
      const outX = Math.cos(angle) * speed, outZ = Math.sin(angle) * speed;
      let inRaft = raft;
      while (inRaft > 0) {
        const cluster = Math.min(inRaft, MIN_CLUSTER + Math.floor(random() * (MAX_CLUSTER - MIN_CLUSTER + 1)));
        const clusterX = centreX + spread * randomNormal(random), clusterZ = centreZ + spread * randomNormal(random);
        const clusterBirth = birth + BIRTH_JITTER * random();
        for (let speck = 0; speck < cluster; speck++) {
          const spreadAngle = random() * Math.PI * 2, spreadDistance = CLUSTER_SPREAD * Math.sqrt(random());
          this.spawn(
            clusterX + spreadDistance * Math.cos(spreadAngle), clusterZ + spreadDistance * Math.sin(spreadAngle),
            outX + randomRange(random, -0.002, 0.002), outZ + randomRange(random, -0.002, 0.002), clusterBirth, undefined, random,
          );
        }
        inRaft -= cluster;
      }
      left -= raft;
    }
  }

  /** Whether any speck was alive at the last commit. */
  get alive() { return this.points.visible; }

  /** Every speck gone at once (the splash's reset). */
  reset() {
    this.next = 0;
    this.used = 0;
    this.lastDeath = -Infinity;
    this.dirtyFrom = this.capacity;
    this.dirtyTo = 0;
    this.geometry.setDrawRange(0, 0);
    this.points.visible = false;
  }

  /** Once per simulation step: the clock, the foam map, visibility, and the upload of new specks. */
  commit(time) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uFoam.value = this.water.foamTexture;
    this.points.visible = time < this.lastDeath;
    if (this.dirtyTo <= this.dirtyFrom) return;
    const first = this.dirtyFrom, count = this.dirtyTo - this.dirtyFrom;
    for (const attribute of this.attributes) {
      attribute.addUpdateRange(first * attribute.itemSize, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, this.used);
    this.dirtyFrom = this.capacity;
    this.dirtyTo = 0;
  }

  /** Projection scale and minimum on-screen size, in render-target pixels. */
  setView(camera, height, pixelRatio) {
    this.material.uniforms.uProjScale.value = camera.projectionMatrix.elements[5] * height * 0.5;
    this.material.uniforms.uMinPixelSize.value = MIN_PIXEL_SIZE * Math.max(pixelRatio, 1);
  }

  /** Specks alive at splash time `time` (for reports; walks every slot). */
  liveCount(time) {
    let live = 0;
    for (let slot = 0; slot < this.used; slot++) {
      const age = time - this.timings[slot * 4];
      if (age >= 0 && age < this.timings[slot * 4 + 1]) live++;
    }
    return live;
  }
}
