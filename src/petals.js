// Loose rose petals: what a bouquet (src/things.js 'roses') sheds as it is
// flung from the hand and as it strikes the water, the ice, the deck or
// another thing.
//
// A petal is a small cupped red shell, 2 to 3.5 cm long (PETAL), a few
// hundredths of a gram: it falls as a leaf does, its drag far above its
// weight, so it soon falls at no more than TERMINAL (about a metre a second
// in Earth's air: a rose petal's, measured, is 0.6 to 1.2), swinging from
// side to side as it goes (`sway`) and turning over and over, and drifts
// with the wind; it is flung off at a share of what flung it (the throw's
// speed, the splash's kick) and the air takes that from it within a tenth of
// a second or two (DRAG_SECONDS). Where there is no air (Europa:
// src/air.js) it flies as anything does, under the place's gravity
// (src/gravity.js). Come down on the water it floats, flat, slowing to a
// stop (WATER_DRAG_SECONDS) and drifting downwind (at a wall's foot it
// stays). It is worked out on still water and lifted as it is drawn by the
// water's height under it, a gale's sea and the ripples and rings on it, as
// the floaters ride them (LIFT_FROM); falling, it stops at a wall's foot; on
// the ice, the deck or the land it lies where it fell, and afloat again if a
// hole opens under it. It is in no mirror image: a few centimetres of red,
// it would have the mirror drawn again as it drifts. After its LIFE it shrinks away (FADE_SECONDS), as anything that
// goes in src/main.js does; no more than CAPACITY are about at once, the
// oldest giving way.
//
// It is scenery, as the fish are: it never touches the splash or the
// physics. Its state changes only in the physics steps (`shed`, `step`,
// called from src/main.js simulate's loop), and its draws come from a
// stream of its own (seededRandom, src/spray.js), never Math.random, so a
// seeded throw sheds alike at any frame rate; `drawAt` draws each petal
// between its last two steps, once a frame. All of them are one instanced
// mesh (one draw, its program compiled under the loading veil with the
// rest, src/main.js warmUp), each its own size, shade and turn.
import * as THREE from 'three';
import { GRAVITY, EARTH_GRAVITY } from './gravity.js';
import { AIR_DENSITY, EARTH_AIR } from './air.js';
import { seededRandom } from './spray.js';
import { FLOATER_WATER } from './shaders/scene.js';
import { ROSE_PETAL_COLOURS, petalOutline } from './thingMeshes.js';

const CAPACITY = 320;
const PETAL = { length: [0.02, 0.034], width: 0.8, cup: 0.25, rows: 9, columns: 7 };   // m long; its width a share of its length, its cup a share of its width
const TERMINAL = [0.7, 1.15];       // m/s: how fast a petal falls in Earth's air, each its own
const DRAG_SECONDS = 0.12;          // how soon the air takes a flung petal's speed (its relaxation time)
const SWAY = { speed: [0.25, 0.6], rate: [3, 7] };   // its swing from side to side as it falls: m/s, rad/s
const TUMBLE = [4, 14];             // rad/s it turns over as it falls
const WATER_DRAG_SECONDS = 1.5;     // how soon the water stops a floating petal
const WIND_SHARE = { air: 0.8, water: 0.04 };   // the share of the wind's drift it falls with, and floats with
const SETTLE_SECONDS = 0.25;        // how soon it lies flat, come down
const SETTLED = 8;                  // after this many SETTLE_SECONDS it lies flat, turning no more
const LIFE = [25, 45];              // s it lies or floats before it goes
const FADE_SECONDS = 2.5;
const AIR = 0, FLOAT = 1, LYING = 2;
// Its petals are worked out on still water and lifted as drawn by the water's height under each (a gale's sea, the
// solver's ripples, the wind's, the rings: as the floaters ride it, FLOATER_WATER and galeHeight): afloat all of it,
// falling over the water a share that grows from none LIFT_FROM over the still surface (no crest reaches higher) to all
// of it at the surface, lying on the ground, or falling over it, none.
const LIFT_FROM = 1.2;
const WALL = 0.02;   // m: ground higher than this over the water is a wall's top (the Pool's deck, the Reflecting Pool's coping): a petal afloat stays at its foot
const UP = new THREE.Vector3(0, 1, 0);
const SEED = 0x9e7a15;
const turning = new THREE.Quaternion();   // a step's turn of a falling petal
/** A draw from `[least, most]` by `random` (0 to 1). */
const within = ([least, most], random) => least + (most - least) * random();

export class Petals {
  /**
   * `envTexture`, the environment map things are lit by (src/rock.js makeMaterial's); `water`, the water's ride
   * uniforms (src/waterSurface.js rideUniforms: its gale's, solver's, wind's and rings'), by which its petals on the
   * water ride it as drawn.
   */
  constructor({ envTexture = null, water = null } = {}) {
    this.random = seededRandom(SEED);
    this.petals = [];
    this.wind = { x: 0, z: 0 };
    this.mesh = new THREE.InstancedMesh(petalGeometry(), new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.88, metalness: 0, envMap: envTexture, envMapIntensity: 0.8,   // velvety: matte (the environment its light as much as its sheen)
    }), CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage);
    // Each petal's share of the water's lift (LIFT_FROM): 1 afloat, growing to it as it falls near the water, 0 lying.
    this.lift = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute('aWaterLift', this.lift);
    if (water) {
      const material = this.mesh.material;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, water);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${FLOATER_WATER}\nattribute float aWaterLift;`).replace('#include <project_vertex>', `
          vec4 mvPosition = vec4(transformed, 1.0);
          mvPosition = instanceMatrix * mvPosition;
          // Lifted on the water as drawn by its height under the petal's middle (its share of it, aWaterLift): a gale's
          // sea, and on it the solver's ripples, the wind's and the rings, as a floater rides them.
          if (aWaterLift > 0.0) {
            vec2 middle = instanceMatrix[3].xz;
            float height = floaterWaterHeight(middle);
            if (uGaleMetresPerUnit > 0.0) height += galeHeight(middle);
            mvPosition.y += aWaterLift * height;
          }
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      };
      material.customProgramCacheKey = () => 'petals';
    }
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;   // they spread wider than any bounds it keeps
    this.mesh.name = 'petals';
    this.scratch = { matrix: new THREE.Matrix4(), position: new THREE.Vector3(), turn: new THREE.Quaternion(), scale: new THREE.Vector3(), color: new THREE.Color() };
  }

  /** The wind's drift (m/s, toward x, z): the rain's and the snow's (src/main.js applyWind). */
  setWind(direction, speed) {
    const length = Math.hypot(direction[0], direction[1]) || 1;
    this.wind = { x: (direction[0] / length) * speed, z: (direction[1] / length) * speed };
  }

  /**
   * `count` petals let go from about `at` ({ x, y, z }), spread over `spread`
   * (m) of it, moving at `velocity` ({ x, y, z }) and flung `kick` (m/s) more
   * every way, up the more: a throw's few, a splash's handful (src/main.js).
   */
  shed({ at, spread, velocity, kick, count }) {
    const random = this.random;
    this.shuffled = true;
    for (let index = 0; index < count; index++) {
      if (this.petals.length >= CAPACITY) this.petals.shift();
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6.3, random() * 6.3, random() * 6.3));
      const out = new THREE.Vector3(random() - 0.5, random() * 0.8 + 0.2, random() - 0.5).normalize();
      const position = new THREE.Vector3(at.x + spread * (random() - 0.5), at.y + spread * 0.5 * random(), at.z + spread * (random() - 0.5));
      const flung = kick * (0.4 + 0.6 * random());
      const tumbleAxis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      const shade = 0.85 + 0.3 * random();
      this.petals.push({
        state: AIR, position, previous: position.clone(), turn, previousTurn: turn.clone(),
        velocity: new THREE.Vector3(velocity.x + out.x * flung, velocity.y + out.y * flung, velocity.z + out.z * flung),
        size: within(PETAL.length, random),
        terminal: within(TERMINAL, random),
        sway: within(SWAY.speed, random), swayRate: within(SWAY.rate, random), swayPhase: random() * 6.3, swayHeading: random() * 6.3,
        tumbleAxis, tumble: within(TUMBLE, random),
        // Come down, it lies its cup up or (a third of them) over, turned as it fell.
        overGround: null,   // whether the ground was under it at its last step (null before its first)
        rest: new THREE.Quaternion().setFromAxisAngle(UP, random() * 6.3).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), random() < 0.33 ? Math.PI : 0)),
        color: [shade, shade * (0.9 + 0.2 * random()), shade],
        age: 0, still: 0, life: within(LIFE, random), gone: 0,
      });
    }
  }

  /**
   * One physics step of `seconds`: each petal falls, floats or lies, and
   * goes once its life is out. `groundAt(x, z)` is the ground's height there
   * (the ice's top, the deck's, the land's; a floating shard's is none) or
   * null over open water, whose surface is at 0 (a gale's sea lifts them as
   * drawn). `groundChanged`: the ground may have gone from under what lies
   * on it (a hole opened in the ice), so lying petals look again.
   */
  step(seconds, groundAt, groundChanged = false) {
    const air = AIR_DENSITY > 0;
    // Its fall in thinner air or under another gravity: as fast as its weight and drag balance.
    const fallScale = air ? Math.sqrt((GRAVITY / EARTH_GRAVITY) * (EARTH_AIR / AIR_DENSITY)) : 0;
    const settle = Math.min(seconds / SETTLE_SECONDS, 1);
    for (const petal of this.petals) {
      petal.previous.copy(petal.position);
      petal.previousTurn.copy(petal.turn);
      petal.age += seconds;
      const { position, velocity } = petal;
      if (petal.state === AIR) {
        if (air) {
          // It leans toward its fall, the wind's drift and its sway: the air's drag, far more than its weight.
          const swing = petal.sway * Math.sin(petal.swayRate * petal.age + petal.swayPhase);
          const towardX = this.wind.x * WIND_SHARE.air + swing * Math.cos(petal.swayHeading), towardZ = this.wind.z * WIND_SHARE.air + swing * Math.sin(petal.swayHeading);
          const share = 1 - Math.exp(-seconds / DRAG_SECONDS);
          velocity.x += (towardX - velocity.x) * share;
          velocity.y += (-petal.terminal * fallScale - velocity.y) * share;
          velocity.z += (towardZ - velocity.z) * share;
        } else velocity.y -= GRAVITY * seconds;
        const fromX = position.x, fromZ = position.z;
        position.addScaledVector(velocity, seconds);
        petal.turn.premultiply(turning.setFromAxisAngle(petal.tumbleAxis, petal.tumble * seconds));
        let ground = groundAt(position.x, position.z);
        if (ground !== null && ground > WALL && petal.overGround === false && position.y < ground) {
          // Below a wall's top (the Pool's deck, the Reflecting Pool's coping) it does not pass through: it falls on at its foot.
          position.x = fromX; position.z = fromZ;
          velocity.x = 0; velocity.z = 0;
          ground = groundAt(position.x, position.z);
        }
        petal.overGround = ground !== null;   // over land, the ice or the deck: no lift from the water as drawn
        const floor = ground ?? 0;
        if (position.y <= floor) {
          position.y = floor;
          petal.state = ground === null ? FLOAT : LYING;
          velocity.y = 0;
          velocity.x *= 0.3; velocity.z *= 0.3;
          if (petal.state === LYING) velocity.set(0, 0, 0);
        }
        continue;
      }
      // Turned to lie flat over SETTLE_SECONDS or so, then simply lying so.
      if (petal.still < SETTLE_SECONDS * SETTLED) petal.turn.slerp(petal.rest, settle);
      else if (petal.still - seconds < SETTLE_SECONDS * SETTLED) petal.turn.copy(petal.rest);
      petal.still += seconds;
      if (petal.state === FLOAT) {
        const share = 1 - Math.exp(-seconds / WATER_DRAG_SECONDS);
        velocity.x += (this.wind.x * WIND_SHARE.water - velocity.x) * share;
        velocity.z += (this.wind.z * WIND_SHARE.water - velocity.z) * share;
        const fromX = position.x, fromZ = position.z;
        position.x += velocity.x * seconds;
        position.z += velocity.z * seconds;
        const ground = groundAt(position.x, position.z);
        if (ground !== null && ground > WALL) {
          // At a wall's foot (the Pool's, the Reflecting Pool's coping): it stays there, on the water.
          position.x = fromX; position.z = fromZ;
          velocity.set(0, 0, 0);
          position.y = 0;
        } else if (ground !== null) {
          // Drifted onto the ice's edge or a shelving shore, it lies there.
          petal.state = LYING; position.y = ground; velocity.set(0, 0, 0);
        } else position.y = 0;
      } else if (groundChanged && groundAt(position.x, position.z) === null) {
        // The ice it lay on is a hole now: it is afloat in it.
        petal.state = FLOAT;
        position.y = 0;
      }
      if (petal.still > petal.life) petal.gone += seconds;
    }
    if (this.petals.some((petal) => petal.gone >= FADE_SECONDS)) {
      this.petals = this.petals.filter((petal) => petal.gone < FADE_SECONDS);
      this.shuffled = true;
    }
  }

  /** Each petal drawn `share` of the way from its step before to its last (src/main.js simulate, once a frame). */
  drawAt(share) {
    const { matrix, position, turn, scale, color } = this.scratch;
    const mesh = this.mesh;
    this.petals.forEach((petal, index) => {
      position.lerpVectors(petal.previous, petal.position, share);
      position.y += 0.0015;   // its cup's foot just over what it lies on
      turn.slerpQuaternions(petal.previousTurn, petal.turn, share);
      scale.setScalar(petal.size * (1 - THREE.MathUtils.smoothstep(petal.gone, 0, FADE_SECONDS)));
      mesh.setMatrixAt(index, matrix.compose(position, turn, scale));
      if (this.shuffled) mesh.setColorAt(index, color.setRGB(...petal.color));
      this.lift.array[index] = petal.state === FLOAT ? 1 : petal.state === LYING || petal.overGround ? 0 : THREE.MathUtils.clamp(1 - position.y / LIFT_FROM, 0, 1);
    });
    mesh.count = this.petals.length;
    mesh.visible = mesh.count > 0;
    if (mesh.count > 0) { mesh.instanceMatrix.needsUpdate = true; this.lift.needsUpdate = true; }
    // Each petal's shade only when the list has changed (shed, gone): its slots move then.
    if (this.shuffled && mesh.count > 0) mesh.instanceColor.needsUpdate = true;
    this.shuffled = false;
  }

  /**
   * A few petals lying at (x, z), drawn, from a stream of their own: the warm-up's (src/main.js warmUp), so their
   * program is built under the loading veil; its clearing of the pond (clear) takes them.
   */
  warmUp(x, z) {
    const random = this.random;
    this.random = seededRandom(SEED + 1);
    this.shed({ at: { x, y: 0.05, z }, spread: 0.1, velocity: { x: 0, y: 0, z: 0 }, kick: 0, count: 3 });
    for (const petal of this.petals) { petal.state = LYING; petal.position.y = petal.previous.y = 0; }
    this.random = random;
    this.drawAt(1);
  }

  /** Every petal gone at once (the pond cleared: a new place, the warm-up's end), their stream from its start. */
  clear() {
    this.random = seededRandom(SEED);
    this.petals = [];
    this.shuffled = true;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** Whether any petal is still falling (src/main.js keeps the frame rate up while one is: its idle cap). */
  get falling() { return this.petals.some((petal) => petal.state === AIR); }
}

/**
 * One petal, a unit long (+x from its claw at the origin), cupped about its
 * length (its edges up, +y), a rounded fan wider toward its tip; a single
 * surface, drawn from both sides, coloured dark at its claw to crimson.
 */
function petalGeometry() {
  const { width, cup, rows, columns } = PETAL;
  const positions = [], colors = [], indices = [];
  const { claw, red, rim } = ROSE_PETAL_COLOURS;   // the bloom's own (src/thingMeshes.js rosePetals)
  const color = new THREE.Color();
  for (let row = 0; row <= rows; row++) {
    const along = row / rows;
    const half = (width / 2) * petalOutline(along);   // an outer petal's outline, as on the bloom
    for (let column = 0; column <= columns; column++) {
      const across = -1 + (2 * column) / columns;
      positions.push(along, cup * width * across * across * Math.sin(Math.PI * Math.min(along * 1.2, 1)) - 0.08 * along * along, across * half);
      color.copy(claw).lerp(red, Math.min(along / 0.3, 1)).lerp(rim, 0.3 * Math.max(0, (along - 0.8) / 0.2));
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const first = row * (columns + 1) + column, above = first + columns + 1;
      indices.push(first, above, above + 1, first, above + 1, first + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // About its middle, so it turns about it as it falls.
  geometry.translate(-0.5, 0, 0);
  return geometry;
}
