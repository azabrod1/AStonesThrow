// The splash: droplets, bubbles, and the passes that draw the droplets as water.
//
// A stone entering water goes through stages with known timing, and the
// droplets are choreographed from them rather than solved for:
//   1. Crown: the contact line throws a little fast, fine spray, then a thin
//      sheet rises from a ring just outside the stone, biased in the direction
//      of travel (src/crown.js). Its rim thickens into a bead, goes wavy and
//      sheds drops from the crests; after a few tens of milliseconds the sheet
//      tears from the rim down into droplets carrying its local velocity.
//      A thrown stone enters obliquely, θ about 40 to 55° from vertical, and
//      once more than FAN_THRESHOLD of the entry speed is horizontal a forward
//      fan comes first: a thin fast sheet over the sector ahead, low and
//      mostly forward, tearing into fine spray (CrownSheet with `fan`), at a
//      strength growing to full at FAN_FULL.
//   2. Cavity and pinch-off: the air cavity behind the stone closes under
//      hydrostatic pressure about 2.1·sqrt(R/g) seconds after entry, almost
//      independently of entry speed (Duclaux et al. 2007). An oblique entry
//      drags the cavity forward: besides the entry splat, one or two more
//      where the stone is one and two radii down its path (R·tan θ apart, at
//      most PATH_SLOPE_CAP·R), as it gets there and weaker, stretch the
//      depression and its foam; and each runs forward by the horizontal
//      fraction (stampCavity), so the ring is stronger ahead than behind.
//   3. Worthington jet: the closure fires a narrow glassy column up
//      (src/jet.js), tip first and fastest, so it stretches as it rises. A
//      bulb at its tip pinches off into one to three large drops, then the
//      column breaks from the top down into drops about twice its local
//      radius while its slow base falls back into a mound that throws a
//      small secondary ring. After an oblique entry it leans back along the
//      stone's path by JET_LEAN·θ (at most JET_LEAN_CAP) and, from a dragged cavity,
//      is slower by JET_OBLIQUE_SLOWING times the horizontal fraction.
//   4. Bubbles entrained with the stone follow it down its path, rise and
//      burst into foam.
// Each stage also stamps the height field and the foam map. A stone falling
// straight in makes none of the oblique parts.
//
// Drops ring the water where they land, and a large one (LANDING_CROWN_RADIUS
// and up: the jet's tip and breakup drops, the crown's biggest) that has
// flown at least LANDING_CROWN_FLIGHT and falls at LANDING_CROWN_SPEED or
// more throws a small crown of its own, a CrownSheet with the drop's radius
// and speed (at most MAX_LANDING_CROWNS alive; the rest, and smaller drops,
// kick up a few droplets instead).
//
// Foam specks (src/foamSpecks.js) are the grain of the foam a splash leaves:
// a patch where the crown's base was once it has gone, one where the jet
// falls back, a few where each drop lands (by its size) and one where each
// bubble surfaces. They ride the surface for 2 to 8 s.
//
// Droplets are integrated on the CPU (a few thousand points) and rendered as
// a screen-space fluid: sphere impostors into a depth buffer, additive
// thickness, bilateral depth smoothing so neighbouring drops merge into
// sheets, then the composite pass shades them (src/shaders/fluid.js). The
// crown sheets and jet columns are meshes drawn into the same depth and
// thickness buffers (src/shaders/sheet.js), so sheets, columns and drops are
// shaded as one body of water; a column and the large drops it breaks into
// (spawned with `lens`) are shaded as clear glass. Both meshes are evaluated in
// closed form once per rendered frame (prepareFrame); at most MAX_CROWNS
// stone crowns and MAX_JETS jets live at once, and nothing is drawn for them
// when none are alive. Their costly steps (the crown's tear, the jet's
// breakup) run once per rendered frame, the frame's simulated length given by
// setFrameSeconds before its substeps.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { CrownSheet } from './crown.js';
import { JetColumn } from './jet.js';
import { FoamSpecks } from './foamSpecks.js';
import { PARTICLE_VERTEX, PARTICLE_DEPTH_FRAGMENT, PARTICLE_THICKNESS_FRAGMENT, BLUR_FRAGMENT, COMPOSITE_FRAGMENT } from './shaders/fluid.js';
import { SHEET_VERTEX, SHEET_DEPTH_FRAGMENT, SHEET_THICKNESS_FRAGMENT, COLUMN_VERTEX, COLUMN_DEPTH_FRAGMENT, COLUMN_THICKNESS_FRAGMENT } from './shaders/sheet.js';
import { BUBBLE_VERTEX, BUBBLE_FRAGMENT } from './shaders/scene.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;   // the stone size the tuning constants were set for
const MAX_CROWNS = 5;            // an older crown tears at once when another arrives
const MAX_JETS = 3;              // an older jet breaks into drops at once when another starts
const LANDING_CROWN_RADIUS = 0.004;   // drops this big throw a crown where they land...
const MAX_LANDING_CROWNS = 6;         // ...while fewer than this many are alive...
const LANDING_CROWN_FLIGHT = 0.05;    // ...if they have flown this long (s)...
const LANDING_CROWN_SPEED = 1.0;      // ...and fall this fast (m/s): not the drops a crown's torn foot drops back
const LANDING_REFERENCE = 0.0086;     // a 3 cm stone's first tip drop: the landing crown tuning size
const LANDING_BREAKUP = 40;           // its crown's breakup droplets (scaling with the drop's area)
const CROWN_SPECKS = 220;             // foam specks where a 3 cm stone's crown stood (scaling with its area)
const LANDING_SPECK_FREE = 0.003;     // a landing drop leaves a foam speck per LANDING_SPECK_STEP of radius beyond this
const LANDING_SPECK_STEP = 0.0015;
const PATH_SLOPE_CAP = 1.2;           // the stone's path under water, horizontal over vertical, at most (50°)
const FAN_THRESHOLD = 0.3;            // the forward fan needs this horizontal fraction of the entry speed...
const FAN_FULL = 0.7;                 // ...and is at full strength from this one
const FAN_DROPLETS = 300;             // drops of a 3 cm stone's fan at about 6 m/s and full strength
const JET_LEAN = 0.4;                                // the jet leans back by this fraction of the entry angle,
const JET_LEAN_CAP = THREE.MathUtils.degToRad(18);   // at most this
const OBLIQUE_IMPULSE = 1.3;          // an oblique entry's cavity splats together carry at most this times a vertical one's
const JET_OBLIQUE_SLOWING = 0.3;      // and is slower by this times the horizontal fraction

const randomRange = (lo, hi) => lo + Math.random() * (hi - lo);
const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

export class SplashSystem {
  constructor({ capacity = 16000, bubbleCapacity = 3000, environment, lighting, water, ambientWaves }) {
    this.capacity = capacity;
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.radii = new Float32Array(capacity);
    this.ages = new Float32Array(capacity);
    this.lenses = new Float32Array(capacity);   // 1 for drops drawn as glass lenses like the jet column

    this.bubbleCapacity = bubbleCapacity;
    this.bubbleCount = 0;
    this.bubblePositions = new Float32Array(bubbleCapacity * 3);
    this.bubbleVelocities = new Float32Array(bubbleCapacity * 3);
    this.bubbleSizes = new Float32Array(bubbleCapacity);
    this.bubblePhases = new Float32Array(bubbleCapacity);

    this.jets = [];      // scheduled Worthington jets
    this.columns = [];   // live jet columns
    this.crowns = [];    // live crown sheets
    this.plumes = [];    // scheduled bubble plumes
    this.wakes = [];     // scheduled cavity splats of an oblique entry
    this.time = 0;
    this.frameSeconds = 1 / 60;   // simulated length of the frame being stepped
    this.lighting = lighting;
    this.foamSpecks = new FoamSpecks({ water, lighting, ambientWaves });

    // Droplet instances.
    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute('position', quad.getAttribute('position'));
    this.instancePositions = new THREE.InstancedBufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.instanceRadii = new THREE.InstancedBufferAttribute(this.radii, 1).setUsage(THREE.DynamicDrawUsage);
    this.instanceVelocities = new THREE.InstancedBufferAttribute(this.velocities, 3).setUsage(THREE.DynamicDrawUsage);
    this.instanceLenses = new THREE.InstancedBufferAttribute(this.lenses, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iPosition', this.instancePositions);
    geometry.setAttribute('iRadius', this.instanceRadii);
    geometry.setAttribute('iVelocity', this.instanceVelocities);
    geometry.setAttribute('iLens', this.instanceLenses);
    geometry.instanceCount = 0;
    this.particleGeometry = geometry;

    const particleUniforms = () => ({
      uProjScale: { value: 1000 },
      uMinPixelRadius: { value: 1.0 },
      uStreakSeconds: { value: 0 },
      uSunDirView: { value: new THREE.Vector3() },
      uSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFullFloatInfo: { value: 1 },
    });
    this.streakSeconds = 0;
    this.depthMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_DEPTH_FRAGMENT, uniforms: particleUniforms(), depthTest: true, depthWrite: true });
    this.thicknessMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_THICKNESS_FRAGMENT, uniforms: particleUniforms(), depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
    this.particleMesh = new THREE.Mesh(geometry, this.depthMaterial);
    this.particleMesh.frustumCulled = false;
    this.particleScene = new THREE.Scene();
    this.particleScene.add(this.particleMesh);

    // Crown sheets: every crown's mesh shares these and swaps them per pass.
    const sheetUniforms = () => ({
      uSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uSunDirView: { value: new THREE.Vector3() },
    });
    // A landing crown rides the waves: the sheet's vertex shader samples the
    // splash's height field and the ambient waves (src/ambientWaves.js).
    const rideUniforms = () => ({
      uHeight: { value: water.heightTexture },
      uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
      uDomainSize: { value: water.domainSize },
      uTexelOffset: { value: water.uvOffset },
      ...ambientWaves.uniforms(),
    });
    this.sheetDepthMaterial = new THREE.ShaderMaterial({ vertexShader: SHEET_VERTEX, fragmentShader: SHEET_DEPTH_FRAGMENT, uniforms: { ...sheetUniforms(), ...rideUniforms() }, depthTest: true, depthWrite: true, side: THREE.DoubleSide });
    this.sheetThicknessMaterial = new THREE.ShaderMaterial({ vertexShader: SHEET_VERTEX, fragmentShader: SHEET_THICKNESS_FRAGMENT, uniforms: { ...sheetUniforms(), ...rideUniforms() }, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true, side: THREE.DoubleSide });
    // Jet columns, likewise.
    const columnUniforms = () => ({ ...sheetUniforms(), uProjScale: { value: 1000 }, uMinPixelRadius: { value: 1.0 }, uFullFloatInfo: { value: 1 } });
    this.columnDepthMaterial = new THREE.ShaderMaterial({ vertexShader: COLUMN_VERTEX, fragmentShader: COLUMN_DEPTH_FRAGMENT, uniforms: columnUniforms(), depthTest: true, depthWrite: true, side: THREE.DoubleSide });
    this.columnThicknessMaterial = new THREE.ShaderMaterial({ vertexShader: COLUMN_VERTEX, fragmentShader: COLUMN_THICKNESS_FRAGMENT, uniforms: columnUniforms(), depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true, side: THREE.DoubleSide });
    this.sunDirView = new THREE.Vector3();

    this.blurPass = new FullscreenPass(BLUR_FRAGMENT, {
      uDepth: { value: null },
      uFluidInfo: { value: null },
      uDirection: { value: new THREE.Vector2() },
      uProjScale: { value: 1000 },
      uBlurWorld: { value: 0.012 },
    });
    this.compositePass = new FullscreenPass(COMPOSITE_FRAGMENT, {
      uScene: { value: null },
      uFluidDepth: { value: null },
      uThickness: { value: null },
      uFluidInfo: { value: null },
      uEnvCube: { value: environment.cubeTexture },
      uInverseProjection: { value: new THREE.Matrix4() },
      uCameraWorld: { value: new THREE.Matrix4() },
      uFluidTexel: { value: new THREE.Vector2() },
      uSunDirView: { value: new THREE.Vector3() },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uAbsorb: { value: lighting.absorb },
      uExposure: { value: lighting.exposure },
      uRefract: { value: 1.4 },
      uMinPixelRadius: { value: 1.0 },
      uFluidScale: { value: 1.0 },
      uProjScale: { value: 1000 },
      uFullFloatInfo: { value: 1 },
    });

    // Bubbles.
    const bubbleGeometry = new THREE.BufferGeometry();
    this.bubblePositionAttribute = new THREE.BufferAttribute(this.bubblePositions, 3).setUsage(THREE.DynamicDrawUsage);
    this.bubbleSizeAttribute = new THREE.BufferAttribute(this.bubbleSizes, 1).setUsage(THREE.DynamicDrawUsage);
    bubbleGeometry.setAttribute('position', this.bubblePositionAttribute);
    bubbleGeometry.setAttribute('aSize', this.bubbleSizeAttribute);
    bubbleGeometry.setDrawRange(0, 0);
    this.bubbleMaterial = new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERTEX,
      fragmentShader: BUBBLE_FRAGMENT,
      uniforms: { uProjScale: { value: 1000 }, uTint: { value: new THREE.Color(0.18, 0.30, 0.34) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.bubblePoints = new THREE.Points(bubbleGeometry, this.bubbleMaterial);
    this.bubblePoints.frustumCulled = false;

    this.fluidScale = 0.5;
    this.targets = null;
  }

  // ---- choreography ----------------------------------------------------

  /** Build the splash for a stone that has just touched the water. */
  impact(info, water) {
    const { x, z, speed, velocity, radius } = info;
    const sizeFactor = radius / REFERENCE_RADIUS;
    const entrySpeed = Math.max(speed, 1.0);
    const horizontal = new THREE.Vector2(velocity.x, velocity.z);
    const horizontalFraction = Math.min(horizontal.length() / entrySpeed, 1);
    if (horizontal.lengthSq() > 1e-6) horizontal.normalize();
    const entryAngle = Math.asin(horizontalFraction);   // from vertical

    // 1. Crown. The droplet total is split between fine spray from the contact
    // line now, drops shed by the sheet's rim, and the sheet's breakup.
    const crownCount = Math.round(THREE.MathUtils.clamp(900 * sizeFactor ** 1.6 * Math.sqrt(entrySpeed / 6), 200, 4500));
    const sprayCount = Math.round(0.1 * crownCount);
    const rimCount = Math.round(0.1 * crownCount);
    for (let drop = 0; drop < sprayCount; drop++) {
      const angle = Math.random() * Math.PI * 2;
      const dirX = Math.cos(angle), dirZ = Math.sin(angle);
      const forward = (dirX * horizontal.x + dirZ * horizontal.y) * horizontalFraction;
      if (Math.random() < 0.45 * Math.max(-forward, 0)) continue;
      const ringRadius = radius * randomRange(0.9, 1.1);
      const tilt = THREE.MathUtils.degToRad(randomRange(50, 75));
      const dropSpeed = entrySpeed * randomRange(0.4, 0.9) * (1 + 0.45 * forward);
      const up = Math.cos(tilt) * dropSpeed;
      const out = Math.sin(tilt) * dropSpeed;
      this.spawnDroplet(
        x + dirX * ringRadius, 0.003, z + dirZ * ringRadius,
        dirX * out + velocity.x * 0.22, up, dirZ * out + velocity.z * 0.22,
        (0.0005 + 0.0007 * Math.random()) * sizeFactor ** 0.4,
      );
    }
    const stoneCrowns = this.crowns.filter((candidate) => !candidate.landing && !candidate.fan);
    if (stoneCrowns.length >= MAX_CROWNS) {
      const oldest = stoneCrowns[0];
      oldest.finishNow(this);
      this.retireCrown(oldest);
    }
    const crown = new CrownSheet({
      impact: info, startTime: this.time, rimDroplets: rimCount,
      breakupDroplets: crownCount - sprayCount - rimCount, material: this.sheetDepthMaterial,
    });
    this.crowns.push(crown);
    this.particleScene.add(crown.mesh);

    // The forward fan of an oblique entry: a thin, fast, low sheet ahead of
    // the crown, at a strength growing with the horizontal fraction.
    const fanStrength = THREE.MathUtils.clamp((horizontalFraction - FAN_THRESHOLD) / (FAN_FULL - FAN_THRESHOLD), 0, 1);
    if (fanStrength > 0) {
      const fanCount = Math.round(THREE.MathUtils.clamp(FAN_DROPLETS * sizeFactor ** 1.6 * Math.sqrt(entrySpeed / 6), 60, 1500) * fanStrength);
      const fan = new CrownSheet({
        impact: info, startTime: this.time, rimDroplets: Math.round(0.15 * fanCount), breakupDroplets: Math.round(0.85 * fanCount),
        material: this.sheetDepthMaterial, fan: true, strength: fanStrength,
      });
      this.crowns.push(fan);
      this.particleScene.add(fan.mesh);
    }

    // Cavity: a depression plus a downward push that launches the first ring.
    // An oblique entry drags it forward: up to two more, where the stone is
    // one and two radii down its path (k·R·tan θ ahead, θ the entry angle
    // from vertical), as it gets there, each weaker, stretch the depression
    // and its foam; and each runs forward by the horizontal fraction, so the
    // ring is stronger ahead.
    const travelX = horizontal.x * horizontalFraction;
    const travelZ = horizontal.y * horizontalFraction;
    // The wake splats share the impulse with the entry splat, so an oblique
    // entry rings at most OBLIQUE_IMPULSE times as hard as a vertical one.
    const pathSlope = Math.min(Math.tan(entryAngle), PATH_SLOPE_CAP);
    const wakeStep = radius * pathSlope;
    const sinkSpeed = Math.max(entrySpeed * Math.cos(entryAngle), 1.0);
    const wakeStrengths = [smoothstep(0.05, 0.25, horizontalFraction) * 0.8, smoothstep(0.3, 0.5, horizontalFraction) * 0.6];
    const impulseScale = Math.min(OBLIQUE_IMPULSE / (1 + wakeStrengths[0] + wakeStrengths[1]), 1);
    this.stampCavity({ x, z, radius, speed: entrySpeed, strength: impulseScale, travelX, travelZ }, water);
    wakeStrengths.forEach((strength, index) => {
      const step = index + 1;
      if (strength > 0) {
        this.wakes.push({
          x: x + horizontal.x * wakeStep * step, z: z + horizontal.y * wakeStep * step, start: this.time + (step * radius) / sinkSpeed,
          radius, speed: entrySpeed, strength: strength * impulseScale, travelX, travelZ,
        });
      }
    });

    // 2 and 3. Pinch-off then the jet, which after an oblique entry leans back
    // along the stone's path and, from a dragged cavity, rises slower.
    const pinchDelay = 2.1 * Math.sqrt(radius / GRAVITY);
    const tipSpeed = THREE.MathUtils.clamp(0.42 * entrySpeed + 0.7, 1.2, 6.0) * sizeFactor ** 0.15 * (1 - JET_OBLIQUE_SLOWING * horizontalFraction);
    this.jets.push({
      x, z, radius, start: this.time + pinchDelay,
      total: Math.round(THREE.MathUtils.clamp(220 * sizeFactor ** 1.3, 80, 1200)),
      tipSpeed, speed: entrySpeed,
      lean: Math.min(JET_LEAN * entryAngle, JET_LEAN_CAP), leanX: -horizontal.x, leanZ: -horizontal.y,
    });

    // 4. Bubbles follow the stone down its path.
    this.plumes.push({
      x, z, start: this.time, duration: 0.3,
      total: Math.round(THREE.MathUtils.clamp(110 * sizeFactor ** 2, 30, 500)),
      spawned: 0, depth: Math.min(0.55, radius * 7),
      driftX: horizontal.x * pathSlope, driftZ: horizontal.y * pathSlope,
    });
  }

  /**
   * A cavity splat: the depression and downward push that launch a ring,
   * with its foam. (travelX, travelZ), a direction times a share from 0 to 1,
   * sets that share of the depression running that way: water rising behind
   * it and sinking ahead, the vertical velocity −c·∂h/∂x of a travelling
   * wave (c the speed of waves its size), as a pair of splats either side.
   * Splats on their own ring as strongly behind as ahead, whatever their
   * layout.
   */
  stampCavity({ x, z, radius, speed, strength, travelX = 0, travelZ = 0 }, water) {
    const sigma = radius * 1.1;
    const depth = 0.3 * radius * strength;
    water.addSplat({ x, z, radius: sigma, height: -depth, velocity: -0.045 * speed * strength });
    water.addFoam({ x, z, radius: radius * 1.5, amount: 0.65 * strength });
    const travel = Math.hypot(travelX, travelZ);
    if (travel > 0) {
      const lift = 0.6 * travel * Math.sqrt(GRAVITY * sigma) * depth / sigma;   // ≈ c·depth/σ at the slope's peak
      const offsetX = (travelX / travel) * 0.8 * sigma;
      const offsetZ = (travelZ / travel) * 0.8 * sigma;
      water.addSplat({ x: x - offsetX, z: z - offsetZ, radius: 0.8 * sigma, velocity: lift, rim: 1 });
      water.addSplat({ x: x + offsetX, z: z + offsetZ, radius: 0.8 * sigma, velocity: -lift, rim: 1 });
    }
  }

  /** A big drop has landed: a crown of its own, its droplet count following the drop's area. */
  startLandingCrown(hit) {
    const breakup = Math.round(THREE.MathUtils.clamp(LANDING_BREAKUP * (hit.radius / LANDING_REFERENCE) ** 2, 6, 40));
    const crown = new CrownSheet({
      impact: { x: hit.x, z: hit.z, speed: hit.speed, velocity: { x: hit.velocityX, y: -hit.fallSpeed, z: hit.velocityZ }, radius: hit.radius },
      startTime: this.time, rimDroplets: Math.round(0.25 * breakup), breakupDroplets: breakup,
      material: this.sheetDepthMaterial, landing: true,
    });
    this.crowns.push(crown);
    this.particleScene.add(crown.mesh);
  }

  /** A crown has gone. A stone's leaves foam specks where its base stood, 0.9 to 2.2 stone radii from its centre. */
  retireCrown(crown) {
    if (!crown.landing && !crown.fan) {
      const radius = crown.radius;
      const count = Math.round(THREE.MathUtils.clamp(CROWN_SPECKS * crown.sizeFactor ** 2, 40, 900));
      this.spawnFoamSpecks(crown.centreX, crown.centreZ, 0.9 * radius, 2.2 * radius, count, 0.03);
    }
    this.particleScene.remove(crown.mesh);
    crown.dispose();
    this.crowns.splice(this.crowns.indexOf(crown), 1);
  }

  /** The cavity has pinched off: fire the column, keeping at most MAX_JETS. */
  startJet(jet, water) {
    water.addSplat({ x: jet.x, z: jet.z, radius: jet.radius * 0.6, height: 0.06 * jet.radius, velocity: 0.05 * jet.speed });
    water.addFoam({ x: jet.x, z: jet.z, radius: jet.radius * 1.0, amount: 0.35 });
    if (this.columns.length >= MAX_JETS) {
      const oldest = this.columns[0];
      oldest.finishNow(this, water);
      this.retireColumn(oldest);
    }
    const column = new JetColumn({
      x: jet.x, z: jet.z, radius: jet.radius, tipSpeed: jet.tipSpeed,
      startTime: jet.start, budget: jet.total, material: this.columnDepthMaterial,
      lean: jet.lean, leanX: jet.leanX, leanZ: jet.leanZ,
    });
    this.columns.push(column);
    this.particleScene.add(column.mesh);
  }

  retireColumn(column) {
    this.particleScene.remove(column.mesh);
    column.dispose();
    this.columns.splice(this.columns.indexOf(column), 1);
  }

  /** `count` foam specks in rafts over the ring between two radii around (x, z), drifting outward at up to `driftSpeed` m/s. */
  spawnFoamSpecks(x, z, innerRadius, outerRadius, count, driftSpeed) {
    this.foamSpecks.spawnPatch(x, z, innerRadius, outerRadius, count, this.time, driftSpeed);
  }

  /** `lens`: draw the drop as glass like the jet column it came from (unblurred, refracting). */
  spawnDroplet(x, y, z, vx, vy, vz, radius, lens = false) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx; this.velocities[i * 3 + 1] = vy; this.velocities[i * 3 + 2] = vz;
    this.radii[i] = radius;
    this.ages[i] = 0;
    this.lenses[i] = lens ? 1 : 0;
  }

  removeDroplet(i) {
    const last = --this.count;
    if (i !== last) {
      for (let c = 0; c < 3; c++) {
        this.positions[i * 3 + c] = this.positions[last * 3 + c];
        this.velocities[i * 3 + c] = this.velocities[last * 3 + c];
      }
      this.radii[i] = this.radii[last];
      this.ages[i] = this.ages[last];
      this.lenses[i] = this.lenses[last];
    }
  }

  spawnBubble(x, y, z, vx, vy, vz, size) {
    if (this.bubbleCount >= this.bubbleCapacity) return;
    const i = this.bubbleCount++;
    this.bubblePositions[i * 3] = x; this.bubblePositions[i * 3 + 1] = y; this.bubblePositions[i * 3 + 2] = z;
    this.bubbleVelocities[i * 3] = vx; this.bubbleVelocities[i * 3 + 1] = vy; this.bubbleVelocities[i * 3 + 2] = vz;
    this.bubbleSizes[i] = size;
    this.bubblePhases[i] = Math.random() * Math.PI * 2;
  }

  removeBubble(i) {
    const last = --this.bubbleCount;
    if (i !== last) {
      for (let c = 0; c < 3; c++) {
        this.bubblePositions[i * 3 + c] = this.bubblePositions[last * 3 + c];
        this.bubbleVelocities[i * 3 + c] = this.bubbleVelocities[last * 3 + c];
      }
      this.bubbleSizes[i] = this.bubbleSizes[last];
      this.bubblePhases[i] = this.bubblePhases[last];
    }
  }

  /** Advance droplets and bubbles by dt seconds, feeding the water surface. */
  update(dt, water) {
    this.time += dt;

    // Scheduled jets start their columns, and an oblique entry's cavity
    // reaches on as the stone moves along.
    for (const jet of this.jets) if (this.time >= jet.start) this.startJet(jet, water);
    this.jets = this.jets.filter((jet) => this.time < jet.start);
    for (const wake of this.wakes) if (this.time >= wake.start) this.stampCavity(wake, water);
    this.wakes = this.wakes.filter((wake) => this.time < wake.start);

    // Bubble plumes.
    for (const plume of this.plumes) {
      const phase = Math.min((this.time - plume.start) / plume.duration, 1);
      const shouldHave = Math.round(plume.total * phase);
      while (plume.spawned < shouldHave) {
        const depth = plume.depth * (0.1 + 0.9 * Math.random()) * phase;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.05 * (0.3 + depth);
        this.spawnBubble(
          plume.x + Math.cos(angle) * r + plume.driftX * depth, -depth, plume.z + Math.sin(angle) * r + plume.driftZ * depth,
          randomRange(-0.05, 0.05), randomRange(0.10, 0.32), randomRange(-0.05, 0.05),
          0.0006 + 0.0022 * Math.random() ** 2,
        );
        plume.spawned++;
      }
    }
    this.plumes = this.plumes.filter((plume) => plume.spawned < plume.total);

    // Droplets.
    const landings = [];
    for (let i = this.count - 1; i >= 0; i--) {
      const p = i * 3;
      let vx = this.velocities[p], vy = this.velocities[p + 1], vz = this.velocities[p + 2];
      const radius = this.radii[i];
      const speed = Math.hypot(vx, vy, vz);
      const drag = Math.min(0.00027 / radius * speed * dt, 0.5);
      vx -= vx * drag; vy -= vy * drag; vz -= vz * drag;
      vy -= GRAVITY * dt;
      const x = this.positions[p] + vx * dt;
      const y = this.positions[p + 1] + vy * dt;
      const z = this.positions[p + 2] + vz * dt;
      this.ages[i] += dt;
      if ((y <= 0 && vy < 0) || this.ages[i] > 6) {
        if (y <= 0 && radius > 0.0016) landings.push({ x, z, radius, fallSpeed: -vy, speed: Math.sqrt(vx * vx + vy * vy + vz * vz), velocityX: vx, velocityZ: vz, flight: this.ages[i] });
        this.removeDroplet(i);
        continue;
      }
      this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
      this.velocities[p] = vx; this.velocities[p + 1] = vy; this.velocities[p + 2] = vz;
    }

    // Falling drops ring the surface again. A big one throws a crown of its
    // own, or failing that a few secondary droplets, and each leaves a few
    // foam specks by its size.
    landings.sort((a, b) => b.radius - a.radius);
    let landingCrowns = 0;
    if (landings.length > 0) for (const crown of this.crowns) if (crown.landing) landingCrowns++;
    for (let n = 0; n < landings.length && n < 40; n++) {
      const hit = landings[n];
      const strength = Math.min(hit.radius / 0.005, 2) * Math.min(hit.fallSpeed / 4, 1.5);
      water.addSplat({ x: hit.x, z: hit.z, radius: Math.max(hit.radius * 3, 0.015), velocity: -0.22 * strength, rim: 1.6 });
      const crowned = hit.radius >= LANDING_CROWN_RADIUS && landingCrowns < MAX_LANDING_CROWNS && hit.flight >= LANDING_CROWN_FLIGHT && hit.fallSpeed >= LANDING_CROWN_SPEED;
      if (crowned) {
        this.startLandingCrown(hit);
        landingCrowns++;
      }
      if (hit.radius > 0.004) {
        water.addFoam({ x: hit.x, z: hit.z, radius: hit.radius * 3, amount: 0.05 * strength });
        const sprayCount = crowned ? 0 : Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 3) : 0;
        for (let s = 0; s < sprayCount; s++) {
          const angle = Math.random() * Math.PI * 2;
          const out = randomRange(0.2, 0.9) * Math.min(hit.fallSpeed / 3, 1.5);
          this.spawnDroplet(hit.x, 0.003, hit.z, Math.cos(angle) * out, randomRange(0.5, 1.8) * Math.min(hit.fallSpeed / 3, 1.5), Math.sin(angle) * out, hit.radius * randomRange(0.3, 0.5));
        }
      }
      const specks = Math.floor((hit.radius - LANDING_SPECK_FREE) / LANDING_SPECK_STEP + Math.random());
      if (specks > 0) this.spawnFoamSpecks(hit.x, hit.z, 0, 2 * hit.radius, specks, 0.02);
    }

    // Crown sheets shed from the rim and tear; their droplets are placed where
    // the sheet is now, so they are not integrated until the next substep.
    for (const crown of this.crowns) crown.update(this.time, dt, this);
    for (const crown of this.crowns.filter((candidate) => candidate.finished)) this.retireCrown(crown);

    // Jet columns pinch off their tips, break up and fall back, the same way.
    for (const column of this.columns) column.update(this.time, dt, this, water);
    for (const column of this.columns.filter((candidate) => candidate.finished)) this.retireColumn(column);

    // Bubbles rise, wobble and burst at the surface.
    for (let i = this.bubbleCount - 1; i >= 0; i--) {
      const p = i * 3;
      const size = this.bubbleSizes[i];
      const rise = THREE.MathUtils.clamp(size * 90, 0.08, 0.32);
      this.bubbleVelocities[p + 1] += (rise - this.bubbleVelocities[p + 1]) * Math.min(dt * 3, 1);
      const wobble = Math.sin(this.time * 9 + this.bubblePhases[i]) * 0.03;
      const x = this.bubblePositions[p] + (this.bubbleVelocities[p] + wobble) * dt;
      const y = this.bubblePositions[p + 1] + this.bubbleVelocities[p + 1] * dt;
      const z = this.bubblePositions[p + 2] + (this.bubbleVelocities[p + 2] - wobble) * dt;
      if (y >= -0.002) {
        if (Math.random() < 0.3) water.addFoam({ x, z, radius: 0.012, amount: 0.06 });
        // A surfacing bubble floats for a while as a speck its own size (2 to 4 mm across).
        this.foamSpecks.spawn(x, z, randomRange(-0.004, 0.004), randomRange(-0.004, 0.004), this.time, THREE.MathUtils.clamp(2 * size, 0.002, 0.004));
        this.removeBubble(i);
        continue;
      }
      this.bubblePositions[p] = x; this.bubblePositions[p + 1] = y; this.bubblePositions[p + 2] = z;
    }

    this.instancePositions.needsUpdate = true;
    this.instanceRadii.needsUpdate = true;
    this.instanceVelocities.needsUpdate = true;
    this.instanceLenses.needsUpdate = true;
    this.particleGeometry.instanceCount = this.count;
    this.bubblePositionAttribute.needsUpdate = true;
    this.bubbleSizeAttribute.needsUpdate = true;
    this.bubblePoints.geometry.setDrawRange(0, this.bubbleCount);
    this.foamSpecks.commit(this.time);
  }

  // ---- rendering --------------------------------------------------------

  resize(width, height, fluidScale) {
    this.fluidScale = fluidScale;
    const w = Math.max(2, Math.round(width * fluidScale));
    const h = Math.max(2, Math.round(height * fluidScale));
    if (this.targets) Object.values(this.targets).forEach((t) => t.dispose());
    this.targets = {
      depth: createFloatTarget(w, h, { type: THREE.FloatType, depth: true }),
      thickness: createFloatTarget(w, h, { format: THREE.RedFormat, type: THREE.HalfFloatType, filter: THREE.LinearFilter }),
      blurA: createFloatTarget(w, h, { format: THREE.RedFormat, type: THREE.FloatType }),
      blurB: createFloatTarget(w, h, { format: THREE.RedFormat, type: THREE.FloatType, filter: THREE.LinearFilter }),
    };
    this.fluidSize = new THREE.Vector2(w, h);
  }

  /** Bring the crown sheets and jet columns to the current time: once per rendered frame, not per substep. */
  prepareFrame() {
    for (const crown of this.crowns) crown.updateGeometry(this.time);
    for (const column of this.columns) column.updateGeometry(this.time);
  }

  setPassMaterials(particleMaterial, sheetMaterial, columnMaterial) {
    this.particleMesh.material = particleMaterial;
    for (const crown of this.crowns) crown.mesh.material = sheetMaterial;
    for (const column of this.columns) column.mesh.material = columnMaterial;
  }

  /** Draw droplets, crown sheets and jet columns over the finished scene and present the frame to the canvas (or target). */
  render(renderer, camera, sceneTarget, output = null) {
    this.prepareFrame();
    const { depth, thickness, blurA, blurB } = this.targets;
    const projScale = camera.projectionMatrix.elements[5] * this.fluidSize.y * 0.5;
    this.sunDirView.copy(this.lighting.sunDirection).transformDirection(camera.matrixWorldInverse);
    for (const material of [this.depthMaterial, this.thicknessMaterial]) {
      material.uniforms.uProjScale.value = projScale;
      material.uniforms.uStreakSeconds.value = this.streakSeconds;
    }
    // Columns and lens drops pack their normals to suit the depth target (NORMAL_PACKING).
    const fullFloatInfo = depth.texture.type === THREE.FloatType ? 1 : 0;
    for (const material of [this.columnDepthMaterial, this.columnThicknessMaterial]) material.uniforms.uProjScale.value = projScale;
    for (const material of [this.depthMaterial, this.columnDepthMaterial, this.compositePass.material]) material.uniforms.uFullFloatInfo.value = fullFloatInfo;
    for (const material of [this.depthMaterial, this.thicknessMaterial, this.sheetDepthMaterial, this.sheetThicknessMaterial, this.columnDepthMaterial, this.columnThicknessMaterial]) {
      material.uniforms.uSceneDepth.value = sceneTarget.depthTexture;
      material.uniforms.uResolution.value.copy(this.fluidSize);
      material.uniforms.uSunDirView.value.copy(this.sunDirView);
    }
    renderer.setClearColor(0x000000, 0);
    this.particleMesh.visible = this.count > 0;
    if (this.count > 0 || this.crowns.length > 0 || this.columns.length > 0) {
      this.setPassMaterials(this.depthMaterial, this.sheetDepthMaterial, this.columnDepthMaterial);
      renderer.setRenderTarget(depth);
      renderer.clear(true, true, false);
      renderer.render(this.particleScene, camera);

      this.setPassMaterials(this.thicknessMaterial, this.sheetThicknessMaterial, this.columnThicknessMaterial);
      renderer.setRenderTarget(thickness);
      renderer.clear(true, false, false);
      renderer.render(this.particleScene, camera);

      const blur = this.blurPass.material.uniforms;
      blur.uProjScale.value = projScale;
      blur.uFluidInfo.value = depth.texture;
      blur.uDepth.value = depth.texture;
      blur.uDirection.value.set(1 / this.fluidSize.x, 0);
      this.blurPass.render(renderer, blurA);
      blur.uDepth.value = blurA.texture;
      blur.uDirection.value.set(0, 1 / this.fluidSize.y);
      this.blurPass.render(renderer, blurB);
    } else {
      renderer.setRenderTarget(blurB);
      renderer.clear(true, false, false);
      renderer.setRenderTarget(thickness);
      renderer.clear(true, false, false);
    }

    const composite = this.compositePass.material.uniforms;
    composite.uScene.value = sceneTarget.texture;
    composite.uFluidDepth.value = blurB.texture;
    composite.uThickness.value = thickness.texture;
    composite.uFluidInfo.value = depth.texture;
    composite.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    composite.uCameraWorld.value.copy(camera.matrixWorld);
    composite.uFluidTexel.value.set(1 / this.fluidSize.x, 1 / this.fluidSize.y);
    composite.uSunDirView.value.copy(this.lighting.sunDirection).transformDirection(camera.matrixWorldInverse);
    composite.uExposure.value = this.lighting.exposure;
    composite.uProjScale.value = projScale;
    composite.uFluidScale.value = this.fluidScale;
    this.compositePass.render(renderer, output);
  }

  /**
   * The simulated length of the frame about to be stepped, given before its
   * substeps: the crown's tear and the jet's breakup advance once per frame,
   * and the motion streaks follow it (shutter ≈ half a frame).
   */
  setFrameSeconds(seconds) {
    this.frameSeconds = seconds;
    this.streakSeconds = seconds * 0.5;
  }

  /** After the camera's projection changes: the bubbles' and foam specks' sizes on screen. */
  updateViewUniforms(camera, height, pixelRatio) {
    this.bubbleMaterial.uniforms.uProjScale.value = camera.projectionMatrix.elements[5] * height * 0.5;
    this.foamSpecks.setView(camera, height, pixelRatio);
  }
}
