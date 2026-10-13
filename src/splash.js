// The splash: droplets, bubbles, and the passes that draw the droplets as water.
//
// A stone entering water goes through stages with known timing, and the
// droplets are choreographed from them rather than solved for:
//   1. Crown: on entry a thin sheet is flung up and out from the contact ring
//      and shatters into droplets, biased in the direction of travel.
//   2. Cavity and pinch-off: the air cavity behind the stone closes under
//      hydrostatic pressure about 2.1·sqrt(R/g) seconds after entry, almost
//      independently of entry speed (Duclaux et al. 2007).
//   3. Worthington jet: the closure fires a narrow column straight up, tip
//      first and fastest, which breaks into large drops that fall back and
//      splash again.
//   4. Bubbles entrained with the stone rise and burst into foam.
// Each stage also stamps the height field and the foam map.
//
// Droplets are integrated on the CPU (a few thousand points) and rendered as
// a screen-space fluid: sphere impostors into a depth buffer, additive
// thickness, bilateral depth smoothing so neighbouring drops merge into
// sheets, then the composite pass shades them (src/shaders/fluid.js).
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { PARTICLE_VERTEX, PARTICLE_DEPTH_FRAGMENT, PARTICLE_THICKNESS_FRAGMENT, BLUR_FRAGMENT, COMPOSITE_FRAGMENT } from './shaders/fluid.js';
import { BUBBLE_VERTEX, BUBBLE_FRAGMENT } from './shaders/scene.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;   // the stone size the tuning constants were set for

const randomRange = (lo, hi) => lo + Math.random() * (hi - lo);

export class SplashSystem {
  constructor({ capacity = 16000, bubbleCapacity = 3000, environment, lighting }) {
    this.capacity = capacity;
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.radii = new Float32Array(capacity);
    this.ages = new Float32Array(capacity);

    this.bubbleCapacity = bubbleCapacity;
    this.bubbleCount = 0;
    this.bubblePositions = new Float32Array(bubbleCapacity * 3);
    this.bubbleVelocities = new Float32Array(bubbleCapacity * 3);
    this.bubbleSizes = new Float32Array(bubbleCapacity);
    this.bubblePhases = new Float32Array(bubbleCapacity);

    this.jets = [];      // scheduled Worthington jets
    this.plumes = [];    // scheduled bubble plumes
    this.time = 0;
    this.lighting = lighting;

    // Droplet instances.
    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute('position', quad.getAttribute('position'));
    this.instancePositions = new THREE.InstancedBufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.instanceRadii = new THREE.InstancedBufferAttribute(this.radii, 1).setUsage(THREE.DynamicDrawUsage);
    this.instanceVelocities = new THREE.InstancedBufferAttribute(this.velocities, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iPosition', this.instancePositions);
    geometry.setAttribute('iRadius', this.instanceRadii);
    geometry.setAttribute('iVelocity', this.instanceVelocities);
    geometry.instanceCount = 0;
    this.particleGeometry = geometry;

    const particleUniforms = () => ({
      uProjScale: { value: 1000 },
      uMinPixelRadius: { value: 1.0 },
      uStreakSeconds: { value: 0 },
      uSunDirView: { value: new THREE.Vector3() },
      uSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    });
    this.streakSeconds = 0;
    this.depthMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_DEPTH_FRAGMENT, uniforms: particleUniforms(), depthTest: true, depthWrite: true });
    this.thicknessMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_THICKNESS_FRAGMENT, uniforms: particleUniforms(), depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
    this.particleMesh = new THREE.Mesh(geometry, this.depthMaterial);
    this.particleMesh.frustumCulled = false;
    this.particleScene = new THREE.Scene();
    this.particleScene.add(this.particleMesh);

    this.blurPass = new FullscreenPass(BLUR_FRAGMENT, {
      uDepth: { value: null },
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

    // 1. Crown.
    const crownCount = Math.round(THREE.MathUtils.clamp(900 * sizeFactor ** 1.6 * Math.sqrt(entrySpeed / 6), 200, 4500));
    for (let i = 0; i < crownCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dirX = Math.cos(angle), dirZ = Math.sin(angle);
      const forward = (dirX * horizontal.x + dirZ * horizontal.y) * horizontalFraction;
      if (Math.random() < 0.45 * Math.max(-forward, 0)) continue;
      const ringRadius = radius * randomRange(0.95, 1.25);
      const tilt = THREE.MathUtils.degToRad(randomRange(22, 58));
      const dropSpeed = entrySpeed * (0.22 + 0.42 * Math.random() ** 1.6) * (1 + 0.4 * forward);
      const up = Math.cos(tilt) * dropSpeed;
      const out = Math.sin(tilt) * dropSpeed;
      this.spawnDroplet(
        x + dirX * ringRadius, 0.004, z + dirZ * ringRadius,
        dirX * out + velocity.x * 0.22, up, dirZ * out + velocity.z * 0.22,
        (0.0012 + 0.0036 * Math.random() ** 2) * sizeFactor ** 0.4,
      );
    }

    // Cavity: a depression plus a downward push that launches the first ring.
    water.addSplat({ x, z, radius: radius * 1.1, height: -0.3 * radius, velocity: -0.045 * entrySpeed });
    water.addFoam({ x, z, radius: radius * 1.5, amount: 0.65 });

    // 2 and 3. Pinch-off then the jet.
    const pinchDelay = 2.1 * Math.sqrt(radius / GRAVITY);
    const tipSpeed = THREE.MathUtils.clamp(0.42 * entrySpeed + 0.7, 1.2, 6.0) * sizeFactor ** 0.15;
    this.jets.push({
      x, z, radius, start: this.time + pinchDelay,
      duration: 0.08 * Math.sqrt(sizeFactor),
      total: Math.round(THREE.MathUtils.clamp(220 * sizeFactor ** 1.3, 80, 1200)),
      spawned: 0, tipSpeed, speed: entrySpeed, started: false,
    });

    // 4. Bubbles follow the stone down.
    this.plumes.push({
      x, z, start: this.time, duration: 0.3,
      total: Math.round(THREE.MathUtils.clamp(110 * sizeFactor ** 2, 30, 500)),
      spawned: 0, depth: Math.min(0.55, radius * 7),
    });
  }

  spawnDroplet(x, y, z, vx, vy, vz, radius) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx; this.velocities[i * 3 + 1] = vy; this.velocities[i * 3 + 2] = vz;
    this.radii[i] = radius;
    this.ages[i] = 0;
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

    // Scheduled jets.
    for (const jet of this.jets) {
      if (this.time < jet.start) continue;
      if (!jet.started) {
        jet.started = true;
        water.addSplat({ x: jet.x, z: jet.z, radius: jet.radius * 0.6, height: 0.06 * jet.radius, velocity: 0.05 * jet.speed });
        water.addFoam({ x: jet.x, z: jet.z, radius: jet.radius * 1.0, amount: 0.35 });
      }
      const phase = Math.min((this.time - jet.start) / jet.duration, 1);
      const shouldHave = Math.round(jet.total * phase);
      const sizeFactor = jet.radius / REFERENCE_RADIUS;
      while (jet.spawned < shouldHave) {
        const tau = jet.spawned / jet.total;
        const speed = jet.tipSpeed * (1 - 0.68 * tau) * randomRange(0.92, 1.08);
        const spread = jet.radius * 0.4 * (0.35 + 0.65 * tau);
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        const lateral = speed * 0.10;
        this.spawnDroplet(
          jet.x + Math.cos(angle) * r, 0.01, jet.z + Math.sin(angle) * r,
          randomRange(-lateral, lateral), speed, randomRange(-lateral, lateral),
          (0.005 + 0.009 * Math.random() * (1 - 0.5 * tau)) * sizeFactor ** 0.5,
        );
        jet.spawned++;
      }
    }
    this.jets = this.jets.filter((jet) => jet.spawned < jet.total);

    // Bubble plumes.
    for (const plume of this.plumes) {
      const phase = Math.min((this.time - plume.start) / plume.duration, 1);
      const shouldHave = Math.round(plume.total * phase);
      while (plume.spawned < shouldHave) {
        const depth = plume.depth * (0.1 + 0.9 * Math.random()) * phase;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.05 * (0.3 + depth);
        this.spawnBubble(
          plume.x + Math.cos(angle) * r, -depth, plume.z + Math.sin(angle) * r,
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
        if (y <= 0 && radius > 0.0016) landings.push({ x, z, radius, speed: -vy });
        this.removeDroplet(i);
        continue;
      }
      this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
      this.velocities[p] = vx; this.velocities[p + 1] = vy; this.velocities[p + 2] = vz;
    }

    // Falling drops ring the surface again, with a few secondary droplets.
    landings.sort((a, b) => b.radius - a.radius);
    for (let n = 0; n < landings.length && n < 40; n++) {
      const hit = landings[n];
      const strength = Math.min(hit.radius / 0.005, 2) * Math.min(hit.speed / 4, 1.5);
      water.addSplat({ x: hit.x, z: hit.z, radius: Math.max(hit.radius * 3, 0.015), velocity: -0.22 * strength, rim: 1.6 });
      if (hit.radius > 0.004) {
        water.addFoam({ x: hit.x, z: hit.z, radius: hit.radius * 3, amount: 0.05 * strength });
        const sprayCount = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 3) : 0;
        for (let s = 0; s < sprayCount; s++) {
          const angle = Math.random() * Math.PI * 2;
          const out = randomRange(0.2, 0.9) * Math.min(hit.speed / 3, 1.5);
          this.spawnDroplet(hit.x, 0.003, hit.z, Math.cos(angle) * out, randomRange(0.5, 1.8) * Math.min(hit.speed / 3, 1.5), Math.sin(angle) * out, hit.radius * randomRange(0.3, 0.5));
        }
      }
    }

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
        this.removeBubble(i);
        continue;
      }
      this.bubblePositions[p] = x; this.bubblePositions[p + 1] = y; this.bubblePositions[p + 2] = z;
    }

    this.instancePositions.needsUpdate = true;
    this.instanceRadii.needsUpdate = true;
    this.instanceVelocities.needsUpdate = true;
    this.particleGeometry.instanceCount = this.count;
    this.bubblePositionAttribute.needsUpdate = true;
    this.bubbleSizeAttribute.needsUpdate = true;
    this.bubblePoints.geometry.setDrawRange(0, this.bubbleCount);
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

  /** Draw droplets over the finished scene and present the frame to the canvas (or target). */
  render(renderer, camera, sceneTarget, output = null) {
    const { depth, thickness, blurA, blurB } = this.targets;
    const projScale = camera.projectionMatrix.elements[5] * this.fluidSize.y * 0.5;
    for (const material of [this.depthMaterial, this.thicknessMaterial]) {
      material.uniforms.uProjScale.value = projScale;
      material.uniforms.uSceneDepth.value = sceneTarget.depthTexture;
      material.uniforms.uResolution.value.copy(this.fluidSize);
      material.uniforms.uStreakSeconds.value = this.streakSeconds;
      material.uniforms.uSunDirView.value.copy(this.lighting.sunDirection).transformDirection(camera.matrixWorldInverse);
    }
    renderer.setClearColor(0x000000, 0);
    if (this.count > 0) {
      this.particleMesh.material = this.depthMaterial;
      renderer.setRenderTarget(depth);
      renderer.clear(true, true, false);
      renderer.render(this.particleScene, camera);

      this.particleMesh.material = this.thicknessMaterial;
      renderer.setRenderTarget(thickness);
      renderer.clear(true, false, false);
      renderer.render(this.particleScene, camera);

      const blur = this.blurPass.material.uniforms;
      blur.uProjScale.value = projScale;
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
    this.compositePass.render(renderer, output);
  }

  /** Motion streak length follows how much world time the frame covers (shutter ≈ half a frame). */
  setFrameSeconds(seconds) { this.streakSeconds = seconds * 0.5; }

  updateBubbleUniforms(camera, height) {
    this.bubbleMaterial.uniforms.uProjScale.value = camera.projectionMatrix.elements[5] * height * 0.5;
  }
}
