// Foam specks: the fine bubbles a splash scatters on the surface, which pop
// away over several seconds.
//
// The raft itself is the foam map (src/spectralWater.js), which the water
// shader draws as a pattern of bubbles, lace and holes (FOAM_PATTERN in
// src/shaders/scene.js); the specks are the bits that drift out of it and
// the bubbles that land or surface away from it. Each is a point riding the
// water surface, 2 to 4 mm across (most nearer 2), living 0.8 to 3 s (most
// nearer 1: fresh water's bubbles burst within a second or two, src/splash.js
// on the foam), drifting slowly outward from where it was born and downwind with
// the raft (the foam map's drift, src/spectralWater.js), wandering a
// millimetre or so, and fading quickly at the end. Surface bubbles are mostly
// clear with a bright rim, so a speck is a translucent white, dimmer than the
// raft: a lone one is faint, a cluster of them reads as foam. Their discs
// project onto the mean water plane, so a low view sees ellipses, and their
// opacity follows projected area with no minimum brightness at a distance.
// Resolved bubbles have clear centres and bright rims. The splash
// makes them where the crown's base was, where the jet falls back, where
// drops land and where bubbles surface, in clusters of two to six a few
// millimetres across, so a patch reads as foam rather than as an even scatter
// of snow. Where the foam map is dense a speck fades out (SPECK_VERTEX), so
// specks never double the raft's own bubbles.
//
// A speck's whole life is a closed form of the splash time (SPECK_VERTEX in
// src/shaders/scene.js), so the CPU writes each one once, when it is born,
// into a ring of typed arrays (the oldest slot is reused when the ring is
// full) and uploads only the slots written since the last frame. Per frame
// the cost is two uniforms and a draw of the slots in use, each vertex one
// fetch of the splash's height texture, one of the ambient waves'
// (src/ambientWaves.js), so specks ride their crests, one of each live ring's
// profile (src/rings.js, which the water carries as water.rings) and one of
// the foam map; nothing is drawn once every speck has gone. The texel offset
// is the solver's shared uniform, so a change of its grid reaches the
// specks, and so is the drift's velocity.
import * as THREE from 'three';
import { SPECK_VERTEX, SPECK_FRAGMENT } from './shaders/scene.js';

const CAPACITY = 8192;           // specks alive at once: a 30 cm rock leaves about 3000 over its life, so two of the biggest throws fit
const MIN_LIFE = 0.8;            // fresh water: a bubble on it bursts within a second or two (src/splash.js on the foam)
const MAX_LIFE = 3;
const LIFE_SKEW = 1.8;            // life = MIN + (MAX − MIN)·u^LIFE_SKEW: most specks go early
const MIN_DIAMETER = 0.002;
const MAX_DIAMETER = 0.004;
const CLUSTER_SPREAD = 0.003;     // specks of one cluster lie within this of its centre (m)
const MIN_CLUSTER = 2;
const MAX_CLUSTER = 6;
const OPACITY = 0.5;
const BRIGHTNESS = 0.75;          // against the raft's white
const MIN_PIXEL_SIZE = 2.5;       // smaller specks are drawn this wide (CSS pixels), soft and faint

const randomRange = (low, high) => low + Math.random() * (high - low);

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
    const geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.driftAttribute = new THREE.BufferAttribute(this.drifts, 2).setUsage(THREE.DynamicDrawUsage);
    this.timingAttribute = new THREE.BufferAttribute(this.timings, 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aDrift', this.driftAttribute);
    geometry.setAttribute('aTiming', this.timingAttribute);
    this.attributes = [this.positionAttribute, this.driftAttribute, this.timingAttribute];
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

  /** One speck at (x, z), born at splash time `time`, drifting at (driftX, driftZ) m/s at first. */
  spawn(x, z, driftX, driftZ, time, diameter = MIN_DIAMETER + (MAX_DIAMETER - MIN_DIAMETER) * Math.random() ** 2) {
    const slot = this.next;
    this.next = (slot + 1) % this.capacity;
    this.used = Math.max(this.used, slot + 1);
    const life = MIN_LIFE + (MAX_LIFE - MIN_LIFE) * Math.random() ** LIFE_SKEW;
    this.positions[slot * 3] = x;
    this.positions[slot * 3 + 1] = 0;
    this.positions[slot * 3 + 2] = z;
    this.drifts[slot * 2] = driftX;
    this.drifts[slot * 2 + 1] = driftZ;
    this.timings[slot * 4] = time;
    this.timings[slot * 4 + 1] = life;
    this.timings[slot * 4 + 2] = diameter;
    this.timings[slot * 4 + 3] = Math.random() * Math.PI * 2;
    this.lastDeath = Math.max(this.lastDeath, time + life);
    this.dirtyFrom = Math.min(this.dirtyFrom, slot);
    this.dirtyTo = Math.max(this.dirtyTo, slot + 1);
  }

  /**
   * `count` specks in clusters over the ring between two radii around (x, z)
   * (inner 0 for a disc), drifting outward at up to `driftSpeed` m/s.
   */
  spawnPatch(x, z, innerRadius, outerRadius, count, time, driftSpeed) {
    let left = count;
    while (left > 0) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(randomRange(innerRadius * innerRadius, outerRadius * outerRadius));
      const outX = Math.cos(angle), outZ = Math.sin(angle);
      const centreX = x + outX * distance, centreZ = z + outZ * distance;
      const speed = driftSpeed * randomRange(0.3, 1);
      const cluster = Math.min(left, MIN_CLUSTER + Math.floor(Math.random() * (MAX_CLUSTER - MIN_CLUSTER + 1)));
      for (let speck = 0; speck < cluster; speck++) {
        const spreadAngle = Math.random() * Math.PI * 2, spreadDistance = CLUSTER_SPREAD * Math.sqrt(Math.random());
        this.spawn(
          centreX + spreadDistance * Math.cos(spreadAngle), centreZ + spreadDistance * Math.sin(spreadAngle),
          outX * speed + randomRange(-0.002, 0.002), outZ * speed + randomRange(-0.002, 0.002), time,
        );
      }
      left -= cluster;
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
