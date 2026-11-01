// What the thing in the loch (src/lochVisitor.js) does to the water, for
// WATER_FRAGMENT (src/shaders/scene.js): the slope it adds to the surface's
// normal and the foam it churns, all in closed form from a handful of
// uniforms the visitor sets each frame. Nothing here moves the drawn surface
// (the sheet out there is flat): the waves are in the shading, as the
// rings' are far out, and the visitor's own meshes are cut at the still
// water's level, which is where the surface is drawn.
//
// Three kinds of wave, each the linear theory of deep water (ω² = g k; the
// loch is two hundred metres deep, so tanh(kD) is 1 for every wave here):
//
// - The Kelvin wake of a source moving at speed U along a straight course
//   (uVisitorSource: where the moving disturbance is, its heading;
//   uVisitorWake). By stationary phase, the waves at a point b behind the
//   source and y to its side are those whose crests travel at angle θ to
//   the course with tan(α) = tan θ / (1 + 2 tan² θ), α = atan(|y| / b):
//   two of them inside the cusp line (tan α < 1/√8, 19.47°), the transverse
//   wave (θ < 35.26°) and the diverging one, none outside. With t = tan θ,
//   2 tan(α) t² − t + tan(α) = 0, so t = (1 ± √(1 − 8 tan² α)) / (4 tan α),
//   whose two roots multiply to ½. Each has wavenumber k = g / (U² cos² θ)
//   and phase k (b cos θ − |y| sin θ), whose gradient is the wave vector.
//   Its height falls as 1 / √b and rises toward the cusp, where the two
//   merge (as (1 − 8 tan² α)^(−¼), capped: an Airy front), and a source at
//   depth d under the surface raises a wave of wavenumber k only as e^(−kd)
//   (the depth below the visitor's body, and the body's own size, so the
//   short diverging waves near the track fade first). The energy at a point
//   left the source τ = b / (U (1 − cos² θ / 2)) ago (its group velocity,
//   half the phase's, relative to the moving source): the wake there is as
//   strong as the source was then (uVisitorEnvelope), so it grows out
//   behind something surfacing and lingers, then thins, after it has gone
//   under.
// - The rings a breach or a dive throws out (uVisitorRings): the
//   Cauchy–Poisson waves of an impulse of size a at the surface, after time
//   t at distance r, η ∝ (g t² / r³) sin(g t² / 4r): long waves lead and
//   short ones trail, each at wavenumber k = g t² / 4r² (its group velocity
//   carries it r in t), the impulse's size cutting the short ones (e^(−(ka)²)).
//   Where the phase is under a radian or two (the front, the far reach) the
//   asymptotic form does not hold and the ring fades in.
// - Where the body breaks the surface (uVisitorContacts, each a capsule
//   along the course as long as the piece out of the water, uVisitorSpans):
//   the water heaped before its front and drawn down behind its back, a
//   dipole as wide as the body there and as high as it pushes; and the
//   short ripples its waterline sheds as it goes and bobs, rings running
//   out from the capsule's outline at their own speed (capillary-gravity,
//   ω² = g k + σ k³ / ρ, a wavelength of CONTACT_RIPPLE), dying out over a
//   metre or two, on the visitor's clock (uVisitorReach.w).
//
// Each wave is filtered by the pixel's footprint on the water (acrossX,
// acrossY), as the rings' and the ripples' are: what is finer than a pixel
// is averaged away, and its slope variance goes to the glitter's roughness
// and spreads the mirror (WATER_FRAGMENT: the sky cube blurred over twice
// its rms slope and climbing by as much, as the ice's frost is), so a wake
// too fine to resolve (from the shore, far out, a wavelength of a metre is
// less than a pixel deep) still shows as a V of paler, duller water across
// the far shore's image, as a wake far out on a lake does.
//
// Foam: churned round each contact and trailing behind it, and over a
// breach's first seconds, added to the water's own foam as lace that thins
// as it pops (FOAM_PATTERN draws it).
//
// Cost: nothing while uVisitorOn is 0 (away from the loch, and between
// sightings), and while it is 1 nothing outside uVisitorReach, a circle the
// visitor sets each frame round all its waves can have reached (visitorNear).
export const VISITOR_CONTACTS = 4;
export const VISITOR_RINGS = 4;

export const VISITOR_WATER = /* glsl */`
#define VISITOR_CONTACTS ${VISITOR_CONTACTS}
#define VISITOR_RINGS ${VISITOR_RINGS}
#define VISITOR_GRAVITY 9.81
#define VISITOR_RING_SIZE 0.4      // m: a breach's or a dive's impulse, about a body's girth
#define CONTACT_RIPPLE 0.32        // m: the ripples' wavelength where the body breaks the surface
#define CONTACT_RIPPLE_REACH 1.4   // m: how far out they die by e

/** The offset from a contact's capsule (its middle \`offset\` away, its half-length \`span\` along \`heading\`): along the course past its ends, and across. */
vec2 visitorCapsule(vec2 offset, vec2 heading, float span) {
  float along = dot(offset, heading);
  return vec2(sign(along) * max(abs(along) - span, 0.0), dot(offset, vec2(-heading.y, heading.x)));
}
uniform float uVisitorOn;                          // 1 while anything of it is on the water, else 0
uniform vec4 uVisitorSource;                       // the moving source: x, z; its heading x, z (unit)
uniform vec4 uVisitorWake;                         // its speed U (m/s), the wake's height scale (m at 1 m behind), its depth (m), its size (m)
uniform vec4 uVisitorEnvelope;                     // how strongly it made waves, by seconds ago: 0 before .x, 1 from .y, 1 until .z, 0 by .w
uniform vec4 uVisitorContacts[VISITOR_CONTACTS];   // where it breaks the surface: x, z, half-width (m), height pushed up (m; 0 none)
uniform vec4 uVisitorRings[VISITOR_RINGS];         // a breach's or a dive's rings: x, z, age (s), strength (m³; 0 none)
uniform vec4 uVisitorSpans;                        // each contact's half-length along the course (m), one a component
uniform vec4 uVisitorReach;                        // a circle round everything above, x, z and radius (m): none of it beyond; w its clock (s)

/** Whether \`point\` is where any of it reaches (uVisitorReach): the water shader pays for it only there. */
bool visitorNear(vec2 point) {
  vec2 offset = point - uVisitorReach.xy;   // uVisitorReach.w is its clock, not a reach
  return uVisitorOn > 0.5 && dot(offset, offset) < uVisitorReach.z * uVisitorReach.z;
}

/** How strongly the source made waves \`ago\` seconds ago (uVisitorEnvelope). */
float visitorStrengthAgo(float ago) {
  vec4 times = uVisitorEnvelope;
  return (1.0 - smoothstep(times.y, max(times.x, times.y + 1e-3), ago)) * smoothstep(times.w, max(times.z, times.w + 1e-3), ago);
}

/** A wave of height \`height\`, phase \`phase\` and wave vector \`waveVector\` (world xz): its slope, filtered by the footprint, and the variance filtered away (z). */
vec3 visitorWave(float height, float phase, vec2 waveVector, vec2 acrossX, vec2 acrossY) {
  float spread = length(vec2(dot(waveVector, acrossX), dot(waveVector, acrossY)));
  float kept = exp(-0.5 * spread * spread);
  float steepness = height * length(waveVector);
  return vec3(-height * sin(phase) * waveVector * kept, 0.5 * steepness * steepness * (1.0 - kept * kept));
}

/** The Kelvin wake's slope at \`point\` and the variance the footprint averages away (z). */
vec3 visitorKelvin(vec2 point, vec2 acrossX, vec2 acrossY) {
  float speed = max(uVisitorWake.x, 0.2);
  vec2 heading = uVisitorSource.zw;
  vec2 sideways = vec2(-heading.y, heading.x);
  vec2 offset = point - uVisitorSource.xy;
  float behind = -dot(offset, heading);
  float side = dot(offset, sideways);
  float across = abs(side);
  if (behind < 0.05) return vec3(0.0);
  float tanAlpha = max(across / behind, 1e-4);
  float discriminant = 1.0 - 8.0 * tanAlpha * tanAlpha;
  if (discriminant <= 0.0) return vec3(0.0);
  float root = sqrt(discriminant);
  float baseNumber = VISITOR_GRAVITY / (speed * speed);
  float cusp = min(pow(discriminant, -0.25), 3.0) * smoothstep(0.0, 0.04, discriminant);
  float height = uVisitorWake.y * cusp / sqrt(max(behind, 0.5));
  float sinkDepth = uVisitorWake.z + 0.35 * uVisitorWake.w;
  vec3 result = vec3(0.0);
  float transverseTan = 2.0 * tanAlpha / (1.0 + root);
  for (int branch = 0; branch < 2; branch++) {
    float tanTheta = branch == 0 ? transverseTan : 0.5 / transverseTan;
    float cosSquared = 1.0 / (1.0 + tanTheta * tanTheta);
    float cosTheta = sqrt(cosSquared);
    float sinTheta = tanTheta * cosTheta;
    float waveNumber = baseNumber / cosSquared;
    float ago = behind / (speed * (1.0 - 0.5 * cosSquared));
    float strength = visitorStrengthAgo(ago) * exp(-waveNumber * sinkDepth);
    if (strength < 1e-4) continue;
    float phase = waveNumber * (behind * cosTheta - across * sinTheta);
    vec2 waveVector = waveNumber * (cosTheta * -heading - sinTheta * sign(side) * sideways);
    result += visitorWave(height * strength, phase, waveVector, acrossX, acrossY);
  }
  return result;
}

/** A breach's or a dive's rings at \`point\` (uVisitorRings): their slope and the variance averaged away (z). */
vec3 visitorRings(vec2 point, vec2 acrossX, vec2 acrossY) {
  vec3 result = vec3(0.0);
  for (int index = 0; index < VISITOR_RINGS; index++) {
    vec4 ring = uVisitorRings[index];
    if (ring.w <= 0.0 || ring.z <= 0.0) continue;
    vec2 offset = point - ring.xy;
    float radius = max(length(offset), 0.3);
    float timeSquared = ring.z * ring.z;
    float phase = VISITOR_GRAVITY * timeSquared / (4.0 * radius);
    float waveNumber = phase / radius;
    float cut = waveNumber * VISITOR_RING_SIZE;
    float height = ring.w * VISITOR_GRAVITY * timeSquared / (4.0 * radius * radius * radius) * exp(-cut * cut) * smoothstep(0.8, 3.0, phase);
    if (height < 1e-5) continue;
    result += visitorWave(height, phase + 1.5707963, -waveNumber * offset / radius, acrossX, acrossY);
  }
  return result;
}

/** Where the body breaks the surface (uVisitorContacts): the water heaped before each piece and drawn down behind it, and the ripples it sheds. */
vec3 visitorContacts(vec2 point, vec2 acrossX, vec2 acrossY) {
  vec2 heading = uVisitorSource.zw;
  vec2 sideways = vec2(-heading.y, heading.x);
  float footprint = max(length(acrossX), length(acrossY));
  float rippleNumber = 6.2831853 / CONTACT_RIPPLE;
  float rippleRate = sqrt(VISITOR_GRAVITY * rippleNumber + 7.3e-5 * rippleNumber * rippleNumber * rippleNumber);
  vec3 result = vec3(0.0);
  for (int index = 0; index < VISITOR_CONTACTS; index++) {
    vec4 contact = uVisitorContacts[index];
    if (contact.w <= 0.0) continue;
    float span = uVisitorSpans[index];
    vec2 capsule = visitorCapsule(point - contact.xy, heading, span);
    float width = contact.z;
    float fromCapsule = length(capsule);
    if (fromCapsule > width * 4.0 + CONTACT_RIPPLE_REACH * 4.0) continue;
    // The heap and the trough: a dipole about the capsule.
    float along = capsule.x / width, side = capsule.y / width;
    float bell = exp(-0.5 * (along * along + 0.6 * side * side));
    float kept = exp(-0.5 * (footprint / width) * (footprint / width));
    vec2 slope = contact.w / width * bell * ((1.0 - along * along) * heading - 0.6 * along * side * sideways);
    float steepness = length(slope);
    result += vec3(slope * kept, 0.5 * steepness * steepness * (1.0 - kept * kept));
    // The ripples, out from the waterline (the capsule's outline, \`width\` from its line).
    float beyond = fromCapsule - width * 0.9;
    if (beyond > 0.0) {
      vec2 outward = capsule.x * heading + capsule.y * sideways;
      outward /= max(fromCapsule, 1e-4);
      float height = (0.12 * contact.w + 0.0015) * exp(-beyond / CONTACT_RIPPLE_REACH) * smoothstep(0.0, 0.06, beyond);
      result += visitorWave(height, rippleNumber * beyond - rippleRate * uVisitorReach.w, rippleNumber * outward, acrossX, acrossY);
    }
  }
  return result;
}

/** All the visitor does to the slope at \`point\`: its x and z, and the variance averaged away. */
vec3 visitorSlope(vec2 point, vec2 acrossX, vec2 acrossY) {
  return visitorKelvin(point, acrossX, acrossY) + visitorRings(point, acrossX, acrossY) + visitorContacts(point, acrossX, acrossY);
}

/** The foam it churns at \`point\`: hugging each contact's waterline and trailing behind it, and over a breach's first seconds. */
float visitorFoam(vec2 point) {
  vec2 heading = uVisitorSource.zw;
  vec2 sideways = vec2(-heading.y, heading.x);
  float foam = 0.0;
  for (int index = 0; index < VISITOR_CONTACTS; index++) {
    vec4 contact = uVisitorContacts[index];
    if (contact.w <= 0.0) continue;
    vec2 offset = visitorCapsule(point - contact.xy, heading, uVisitorSpans[index]);
    float width = contact.z;
    float behind = -offset.x, side = offset.y;
    float churn = min(contact.w * 1.5, 0.5);   // the foam map is logarithmic (FOAM_PATTERN): half cover at 0.1, none under 0.01
    // A collar along the waterline (the outline, \`width\` out), thickest at the bow; and a wash over the body's own patch.
    float fromLine = abs(length(offset) - width);
    float collar = exp(-0.5 * fromLine * fromLine / (0.18 * 0.18 * width * width)) * (0.6 + 0.4 * smoothstep(-width, width, -behind))
      + 0.4 * exp(-0.5 * dot(offset, offset) / (1.2 * 1.2 * width * width));
    float trailWidth = width * (0.7 + 0.1 * max(behind, 0.0));
    float trail = behind > 0.0 ? exp(-behind / (1.5 + 3.0 * width)) * exp(-0.5 * side * side / (trailWidth * trailWidth)) : 0.0;
    foam += churn * (0.4 * collar + 0.05 * trail);
  }
  for (int index = 0; index < VISITOR_RINGS; index++) {
    vec4 ring = uVisitorRings[index];
    if (ring.w <= 0.0 || ring.z <= 0.0) continue;
    vec2 offset = point - ring.xy;
    float spread = 0.9 + 0.35 * ring.z;
    foam += min(ring.w * 0.15, 0.06) * exp(-ring.z / 2.0) * exp(-0.5 * dot(offset, offset) / (spread * spread));
  }
  return min(foam, 0.12);
}
`;
