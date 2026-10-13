// WGSL for drawing the FLIP experiment (flip/src/fluidRenderer.js).
//
// Passes, in order:
//   scene          ray-cast backdrop: sky, sand floor, the stone; colour and view depth
//   particleDepth  sphere impostors into a view-depth texture with a depth test
//   thickness      the same impostors, chord lengths summed additively
//   blur           depth-aware blur of the particle depth, one axis per pass
//   composite      water shading from the blurred depth and thickness, over the scene
// All colour is linear radiance until the composite tone-maps it.

export const RENDER_COMMON = /* wgsl */`
struct RenderUniforms {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  inverseView: mat4x4<f32>,
  cameraPosition: vec3<f32>, particleRadius: f32,
  sunDirection: vec3<f32>, blurRadius: f32,
  stoneCentre: vec3<f32>, stoneRadius: f32,
  boxSize: vec3<f32>, waterLevel: f32,
  viewport: vec2<f32>, focal: vec2<f32>,
  blurDirection: vec2<f32>, thicknessScale: f32, stoneActive: f32,
  debugView: f32, sliceZ: f32, sliceHalfWidth: f32, padding2: f32,
};
@group(0) @binding(0) var<uniform> uniforms: RenderUniforms;

const NO_DEPTH: f32 = 1e9;

struct FullscreenOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };

@vertex fn fullscreenVertex(@builtin(vertex_index) index: u32) -> FullscreenOutput {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index & 2u) * 2 - 1);
  var output: FullscreenOutput;
  output.position = vec4<f32>(x, y, 0.0, 1.0);
  output.uv = vec2<f32>(x, y) * 0.5 + 0.5;
  return output;
}

// View-space ray direction for a pixel: uv in [0,1] with y up, z = -1.
fn viewRay(uv: vec2<f32>) -> vec3<f32> {
  let ndc = uv * 2.0 - 1.0;
  return vec3<f32>(ndc.x / uniforms.focal.x, ndc.y / uniforms.focal.y, -1.0);
}

// Reconstruct a view-space position from a pixel and its view depth.
fn viewPosition(uv: vec2<f32>, depth: f32) -> vec3<f32> {
  return viewRay(uv) * depth;
}

fn skyColour(direction: vec3<f32>) -> vec3<f32> {
  let up = clamp(direction.y, -1.0, 1.0);
  let horizon = vec3<f32>(0.78, 0.86, 0.95);
  let zenith = vec3<f32>(0.22, 0.42, 0.78);
  let ground = vec3<f32>(0.34, 0.31, 0.26);
  let sky = mix(horizon, zenith, pow(max(up, 0.0), 0.6));
  let below = mix(horizon, ground, min(-up * 4.0, 1.0));
  let sunGlow = pow(max(dot(direction, uniforms.sunDirection), 0.0), 64.0) * 0.5;
  return select(below, sky, up >= 0.0) + sunGlow;
}

fn tonemap(colour: vec3<f32>) -> vec3<f32> {
  let mapped = (colour * (2.51 * colour + 0.03)) / (colour * (2.43 * colour + 0.59) + 0.14);
  return pow(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));
}
`;

export const SCENE_SHADER = RENDER_COMMON + /* wgsl */`
struct SceneOutput { @location(0) colour: vec4<f32>, @location(1) depth: f32 };

fn raySphere(origin: vec3<f32>, direction: vec3<f32>, centre: vec3<f32>, radius: f32) -> f32 {
  let offset = origin - centre;
  let b = dot(offset, direction);
  let c = dot(offset, offset) - radius * radius;
  let discriminant = b * b - c;
  if (discriminant < 0.0) { return -1.0; }
  let t = -b - sqrt(discriminant);
  return select(-1.0, t, t > 0.0);
}

@fragment fn sceneFragment(input: FullscreenOutput) -> SceneOutput {
  let rayView = normalize(viewRay(input.uv));
  let direction = normalize((uniforms.inverseView * vec4<f32>(rayView, 0.0)).xyz);
  let origin = uniforms.cameraPosition;
  var colour = skyColour(direction);
  var distanceAlong = NO_DEPTH;

  // Sand floor at y = 0, with a faint 10 cm grid outside the tank for scale.
  if (direction.y < 0.0) {
    let t = -origin.y / direction.y;
    let hit = origin + direction * t;
    let inside = hit.x >= 0.0 && hit.x <= uniforms.boxSize.x && hit.z >= 0.0 && hit.z <= uniforms.boxSize.z;
    let sand = vec3<f32>(0.60, 0.53, 0.39);
    let grain = 0.92 + 0.08 * fract(sin(dot(floor(hit.xz * 400.0), vec2<f32>(12.9898, 78.233))) * 43758.5453);
    let gridLine = max(step(fract(hit.x * 10.0), 0.03), step(fract(hit.z * 10.0), 0.03));
    let outside = sand * 0.85 * (1.0 - 0.12 * gridLine);
    let lit = max(dot(vec3<f32>(0.0, 1.0, 0.0), uniforms.sunDirection), 0.0) * 0.9 + 0.35;
    colour = select(outside, sand * grain, inside) * lit;
    distanceAlong = t;
  }

  if (uniforms.stoneActive > 0.5) {
    let t = raySphere(origin, direction, uniforms.stoneCentre, uniforms.stoneRadius);
    if (t > 0.0 && t < distanceAlong) {
      let hit = origin + direction * t;
      let normal = normalize(hit - uniforms.stoneCentre);
      let diffuse = max(dot(normal, uniforms.sunDirection), 0.0) * 0.8 + 0.3;
      let speck = 0.85 + 0.15 * fract(sin(dot(floor(normal.xy * 24.0 + normal.z * 7.0), vec2<f32>(4.1, 9.7))) * 1234.5);
      colour = vec3<f32>(0.36, 0.33, 0.30) * diffuse * speck;
      distanceAlong = t;
    }
  }

  var output: SceneOutput;
  output.colour = vec4<f32>(colour, 1.0);
  // View depth is the distance along the camera axis, not along the ray.
  output.depth = select(NO_DEPTH, distanceAlong * (-rayView.z), distanceAlong < NO_DEPTH);
  return output;
}
`;

export const PARTICLE_SHADER = RENDER_COMMON + /* wgsl */`
@group(1) @binding(0) var<storage, read> positions: array<vec4<f32>>;

struct ParticleOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) corner: vec2<f32>,
  @location(1) viewCentre: vec3<f32>,
};

// One quad per particle, built from the vertex index, facing the camera in view space.
@vertex fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instance: u32) -> ParticleOutput {
  let cornerIndex = vertexIndex % 6u;
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
  let corner = corners[cornerIndex];
  let worldPosition = positions[instance].xyz;
  // Debug slice: particles beyond sliceZ are moved behind the camera.
  if (abs(worldPosition.z - uniforms.sliceZ) > uniforms.sliceHalfWidth) {
    var hidden: ParticleOutput;
    hidden.position = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    return hidden;
  }
  let viewCentre = (uniforms.view * vec4<f32>(worldPosition, 1.0)).xyz;
  let viewCorner = viewCentre + vec3<f32>(corner * uniforms.particleRadius, 0.0);
  var output: ParticleOutput;
  output.position = uniforms.projection * vec4<f32>(viewCorner, 1.0);
  output.corner = corner;
  output.viewCentre = viewCentre;
  return output;
}

struct DepthOutput { @builtin(frag_depth) depth: f32, @location(0) viewDepth: f32 };

@fragment fn particleDepthFragment(input: ParticleOutput) -> DepthOutput {
  let radial = dot(input.corner, input.corner);
  if (radial > 1.0) { discard; }
  let bulge = sqrt(1.0 - radial);
  let viewPoint = input.viewCentre + vec3<f32>(input.corner, bulge) * uniforms.particleRadius;
  let clip = uniforms.projection * vec4<f32>(viewPoint, 1.0);
  var output: DepthOutput;
  output.depth = clip.z / clip.w;
  output.viewDepth = -viewPoint.z;
  return output;
}

// Debug view: the raw particles, coloured by height relative to the still
// water level (deep blue below, through blue to red at 10 cm above).
struct ColourOutput { @builtin(frag_depth) depth: f32, @location(0) colour: vec4<f32> };

@fragment fn particleColourFragment(input: ParticleOutput) -> ColourOutput {
  let radial = dot(input.corner, input.corner);
  if (radial > 1.0) { discard; }
  let bulge = sqrt(1.0 - radial);
  let viewPoint = input.viewCentre + vec3<f32>(input.corner, bulge) * uniforms.particleRadius;
  let clip = uniforms.projection * vec4<f32>(viewPoint, 1.0);
  let worldY = (uniforms.inverseView * vec4<f32>(viewPoint, 1.0)).y;
  let above = (worldY - uniforms.waterLevel) / 0.1;
  let surface = vec3<f32>(0.15, 0.45, 0.9);
  var colour = mix(vec3<f32>(0.03, 0.08, 0.25), surface, clamp(1.0 + above * 4.0, 0.0, 1.0));
  if (above > 0.0) { colour = mix(surface, vec3<f32>(1.0, 0.15, 0.05), clamp(above, 0.0, 1.0)); }
  var output: ColourOutput;
  output.depth = clip.z / clip.w;
  output.colour = vec4<f32>(colour * (0.55 + 0.45 * bulge), 1.0);
  return output;
}

@fragment fn thicknessFragment(input: ParticleOutput) -> @location(0) f32 {
  let radial = dot(input.corner, input.corner);
  if (radial > 1.0) { discard; }
  return 2.0 * sqrt(1.0 - radial) * uniforms.particleRadius * uniforms.thicknessScale;
}
`;

export const BLUR_SHADER = RENDER_COMMON + /* wgsl */`
@group(1) @binding(0) var depthTexture: texture_2d<f32>;

// Depth-aware blur along one axis. The footprint is blurRadius metres at the
// pixel's depth; samples more than that far away in depth are ignored, which
// keeps separate drops separate while merging neighbours into sheets.
@fragment fn blurFragment(input: FullscreenOutput) -> @location(0) f32 {
  let pixel = vec2<i32>(input.position.xy);
  let centreDepth = textureLoad(depthTexture, pixel, 0).r;
  if (centreDepth >= NO_DEPTH * 0.5) { return centreDepth; }
  let pixelRadius = clamp(uniforms.blurRadius * uniforms.focal.y * uniforms.viewport.y * 0.5 / centreDepth, 1.0, 24.0);
  let taps = i32(ceil(pixelRadius));
  let step = vec2<i32>(uniforms.blurDirection);
  var sum = 0.0;
  var weightSum = 0.0;
  for (var tap = -taps; tap <= taps; tap++) {
    let samplePixel = clamp(pixel + step * tap, vec2<i32>(0), vec2<i32>(uniforms.viewport) - 1);
    let depth = textureLoad(depthTexture, samplePixel, 0).r;
    if (depth >= NO_DEPTH * 0.5) { continue; }
    let spatial = f32(tap) / pixelRadius;
    let range = (depth - centreDepth) / uniforms.blurRadius;
    let weight = exp(-2.0 * spatial * spatial - 2.0 * range * range);
    sum += depth * weight;
    weightSum += weight;
  }
  return sum / max(weightSum, 1e-6);
}
`;

export const COMPOSITE_SHADER = RENDER_COMMON + /* wgsl */`
@group(1) @binding(0) var sceneColour: texture_2d<f32>;
@group(1) @binding(1) var sceneDepth: texture_2d<f32>;
@group(1) @binding(2) var fluidDepth: texture_2d<f32>;
@group(1) @binding(3) var thicknessTexture: texture_2d<f32>;
@group(1) @binding(4) var linearSampler: sampler;

fn fluidPosition(pixel: vec2<i32>) -> vec3<f32> {
  let clamped = clamp(pixel, vec2<i32>(0), vec2<i32>(uniforms.viewport) - 1);
  let depth = textureLoad(fluidDepth, clamped, 0).r;
  let uv = (vec2<f32>(clamped) + 0.5) / uniforms.viewport;
  return viewPosition(vec2<f32>(uv.x, 1.0 - uv.y), depth);
}

@fragment fn compositeFragment(input: FullscreenOutput) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(input.position.xy);
  let background = textureLoad(sceneColour, pixel, 0).rgb;
  let backgroundDepth = textureLoad(sceneDepth, pixel, 0).r;
  let depth = textureLoad(fluidDepth, pixel, 0).r;
  let debugView = i32(uniforms.debugView);
  if (debugView == 1) { return vec4<f32>(vec3<f32>(fract(depth * 4.0)), 1.0); }
  if (debugView == 2) { return vec4<f32>(vec3<f32>(textureLoad(thicknessTexture, pixel, 0).r * 4.0), 1.0); }
  if (debugView == 3) { return vec4<f32>(tonemap(background), 1.0); }
  if (depth >= NO_DEPTH * 0.5 || depth > backgroundDepth) {
    return vec4<f32>(tonemap(background), 1.0);
  }

  // Normal from the smaller depth difference on each side, so edges stay crisp.
  let centre = fluidPosition(pixel);
  let right = fluidPosition(pixel + vec2<i32>(1, 0)) - centre;
  let left = centre - fluidPosition(pixel - vec2<i32>(1, 0));
  let down = fluidPosition(pixel + vec2<i32>(0, 1)) - centre;
  let up = centre - fluidPosition(pixel - vec2<i32>(0, 1));
  let tangentX = select(right, left, abs(left.z) < abs(right.z));
  let tangentY = select(down, up, abs(up.z) < abs(down.z));
  var normalView = normalize(cross(tangentX, -tangentY));
  if (normalView.z < 0.0) { normalView = -normalView; }

  let viewDirection = normalize(-centre);
  let normalWorld = normalize((uniforms.inverseView * vec4<f32>(normalView, 0.0)).xyz);
  let viewWorld = normalize((uniforms.inverseView * vec4<f32>(viewDirection, 0.0)).xyz);
  let thickness = textureLoad(thicknessTexture, pixel, 0).r;

  // Refraction: shift the background sample by the normal, more for thicker water.
  let shift = normalView.xy * vec2<f32>(1.0, -1.0) * clamp(thickness * 6.0, 0.0, 1.0) * 0.06;
  let refractedUv = clamp(input.uv * vec2<f32>(1.0, -1.0) + vec2<f32>(0.0, 1.0) + shift, vec2<f32>(0.0), vec2<f32>(1.0));
  var refracted = textureSampleLevel(sceneColour, linearSampler, refractedUv, 0.0).rgb;
  let absorption = exp(-thickness * vec3<f32>(6.0, 2.2, 1.2));
  let scatter = vec3<f32>(0.08, 0.26, 0.30) * (1.0 - exp(-thickness * 5.0));
  let body = refracted * absorption + scatter;

  let cosine = max(dot(normalWorld, viewWorld), 0.0);
  let fresnel = 0.02 + 0.98 * pow(1.0 - cosine, 5.0);
  let reflected = skyColour(reflect(-viewWorld, normalWorld));
  let halfVector = normalize(uniforms.sunDirection + viewWorld);
  let specular = pow(max(dot(normalWorld, halfVector), 0.0), 320.0) * 6.0;

  // Thin water (spray, the crown's rim) goes white: light scatters out of it.
  let thinness = 1.0 - smoothstep(0.0, 0.012, thickness);
  let water = mix(body, reflected, fresnel) + specular + thinness * 0.3;
  let coverage = smoothstep(0.0, 0.004, thickness);
  let colour = mix(background, water, coverage);
  return vec4<f32>(tonemap(colour), 1.0);
}
`;
