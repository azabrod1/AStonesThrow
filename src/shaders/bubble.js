// GLSL for a bubble floating on the water, shared by the water's own bursting
// bubbles (freshBubbles in FOAM_PATTERN, src/shaders/scene.js), the foam
// specks (SPECK_FRAGMENT there, src/foamSpecks.js) and the bubbles rain
// leaves (src/shaders/rain.js, src/rain.js): SURFACE_BUBBLE is the dome's
// film, lighting and shade, BUBBLE_SPRITE a point sprite drawn as one. Its
// own module because the scene's shaders import the rain's.

// A bubble floating on the surface, as the water's bubbles bursting over a
// boil (freshBubbles, FOAM_PATTERN) and the foam specks (SPECK_FRAGMENT)
// both draw it, so the two kinds match side by side: a hemisphere standing
// on the water, a film a micron or so thick, nearly clear, the water
// showing through it and the sky mirrored in it. A pixel's view ray is cast
// at the dome (freshBubbles and SPECK_FRAGMENT each do the casting in their
// own frame): the film is drawn where the ray meets the dome above the
// water, and where it would meet the sphere below the water, the water
// shows (the base is cut by the water's plane, a pixel soft), so from the
// bank a bubble is a dome, round on top and foreshortened only at its
// foot, never a disc lying on the water.
// The film is a mirror and a window. Of what lies behind it, 1 − F comes
// through; F, its two faces' Fresnel reflectance, is FOAM_BUBBLE_CAP where
// its normal faces the viewer and climbs to 1 edge on, as
// F = CAP + (1 − CAP)(1 − cosθ)⁴, θ between the normal and the view (the
// exact two-face reflectance of water's 1.33, 2R/(1 + R), is 0.04, 0.11,
// 0.24 and 0.52 at 0, 60°, 70° and 80°; this gives 0.04, 0.10, 0.22 and
// 0.49). What it mirrors is the environment along the reflected ray,
// r = 2(n·v)n − v: the sky, the sky cube itself along r (src/sky.js: its
// clouds, its land at the horizon, whatever the weather made it), where r
// rises above the water's plane; where r falls, the water a little way off,
// which looks as the water behind the bubble does (what the pixel shows
// without it), except that r meets it more nearly edge on than the view
// does, so it mirrors more of the sky, the water's own Fresnel at r's
// angle less at the view's, times the sky along r turned back up
// (bubbleMirror; continuous at the horizon, where the water mirrors the
// sky whole). So the film's light is F times that, added to the 1 − F of
// what lies behind it, and nothing is ever brighter than the sky it
// mirrors. Over the dome this is not a ring: on its top, seen from the
// bank at elevation e, the ray climbs as sin(e + 2θ), so the band
// toward the limb mirrors the low sky with F at 0.2 to 0.5, a bright arc;
// at its sides r = cos2θ·v + sin2θ·(sideways) falls into the water near
// by past 45°, which looks as the water behind it does, so the sides melt
// into the water; and exactly edge on r continues along the view, the
// film shows what lies behind it, and the limb has no outline of its own.
// The cap, its normal near the viewer, mirrors the sky behind and above
// the viewer at F 0.04 to 0.1. Under an overcast sky, its zenith the
// brightest, a dome is a silvery bead, its top lit, its foot dark (the
// meniscus), as rain's bubbles on a puddle are; under a clear one it is
// clear but for a bright arc of the horizon. An earlier dome drew the
// film's rise toward the limb as an edge glow, white of the foam's light
// all round: about 1.35 times the sky's radiance on a uniform ring, which
// read as a circle drawn on the water, not a bubble.
// A pixel takes the film's mean reflectance over the span of radii it
// covers (bubbleFilm; radius r = sinθ, the ray's closest approach to the
// dome's centre, a miss being r > 1), by area, in closed form: over
// u = r² and w = 1 − sqrt(1 − u), ∫(1 − sqrt(1 − u))⁴ du = 2(w⁵/5 − w⁶/6)
// (bubbleFilmArea), so a pixel wider than the rim takes its whole rim, and
// the span's share on the sphere rounds off the limb a pixel soft. What it
// mirrors is taken at one point (bubbleMirrorRadius): its own, or for a
// pixel over the limb FOAM_BUBBLE_LIMB_SAMPLE of the way from its span's
// inner edge to the limb, where the reflectance gathers, on its own side of
// the dome; the sky there is the cube blurred over the turn of r across
// the pixel (twice the normal's: FOAM_BUBBLE_SKY_TEXELS a radian, at most
// FOAM_BUBBLE_SKY_COARSEST: a dome a few pixels across mirrors a
// hemisphere in them).
// Over the whole dome, per unit of the water's area under it, the light
// with a sky of 1 averages bubbleDomeMean(sinβ), β the view's elevation:
// the dome's screen image is the sphere's disc less what lies under the
// water, which covers (1/sinβ) times as much of the water as the screen
// shows, so a boil's domes whiten the water more the lower the view
// (0.025 from straight above, 0.15 at 17°, 0.31 at 9°, where r grazes the
// water over most of the dome). The mean is a numerical integral, fitted
// as (FOAM_BUBBLE_MEAN_FIT·(1, s, s², s³) + FOAM_BUBBLE_MEAN_FIT_QUARTIC·s⁴)/s
// over s = sinβ from 0.15 to 1 within 2% (tools/foam-probe.mjs integrates
// it and checks the fit; refit it there when any of these constants
// changes). Unresolved, a bubble takes it times the sky ahead
// (bubbleSkyAhead: the cube, at its coarsest, a little above the horizon
// straight ahead and either side of it, where a dome's arc mirrors), so
// far bubbles mirror the same sky the near ones do; the mean replaces what
// lies behind by that share, where the near ones only add the water's
// grazing share (a few per cent of the far field's light, over dark water
// less).
// Haze. A pond's bubble is no soap film: its film scatters a little light
// of its own, and carries the scum, the dust and the drops that landed on
// it, so against dark water it shows as a pale bead where a clear film
// would be lost (drawn as a clear film alone, mirroring a rainy sky's dark
// treeline, the domes vanished). So over the dome FOAM_BUBBLE_HAZE of the
// foam's white is scattered toward the viewer (bubbleHaze), all of it where
// the film mirrors the sky and FOAM_BUBBLE_HAZE_LIT of it where it mirrors
// the water, so the bead is lit on top and darker below, as the lone
// bubbles on a puddle are; a boil's bubbles, over its milk and carrying its
// scum, take up to FOAM_BUBBLE_HAZE_CLOUD more (freshBubbles). It is cover
// with white: the share of what lies behind it that the foam's white
// replaces, so it never outshines the foam. Its mean per unit of water
// under a dome is bubbleHazeMean, in closed form.
// Along the dome's foot a faint shadow (bubbleMeniscus: FOAM_BUBBLE_MENISCUS
// of the light behind, at most, over FOAM_BUBBLE_MENISCUS_WIDTH of the
// radius above the water, or a pixel if wider), where the meniscus at the
// bubble's base bends the light away: the dark line under the dome is what
// seats it in the water, though over dark water it hardly shows. Its lower
// part, where r falls into the water near by, takes FOAM_BUBBLE_UNDERSIDE
// of the light behind it (bubbleUnderside, as cover without light, by the
// share of the pixel on the dome), so over a boil's milk each dome's lower
// part is darker than the milk behind it and its top lit: a bead. The
// shade is cover, not light, so the mean leaves it out.
// The sun's glint is its mirror image on the dome: sunGlitter's lobe on the
// hit's normal, with FOAM_BUBBLE_GLINT_VARIANCE (a smooth film's slopes,
// spread by a couple of degrees as it wobbles; the raft's packed froth,
// FOAM_GLINT_VARIANCE, is ten times rougher) widened by the dome's turn
// across a pixel, so the glint is never smaller than a pixel and does not
// flicker as the bubble moves. FOAM_BUBBLE_GLINT is the film's two faces
// times π: the white beside the glint is drawn as the sun's irradiance with
// no Lambertian 1/π (src/sky.js), against which a mirror's highlight under
// the same sun is π times sunGlitter's lobe. So the glint is a soft spot on
// a bubble under some 8 pixels across, a distinct bright point from about
// 12, and on a bright one nearly white from about 25 (tuned by frames at
// the high view, the sun to the side). The cube holds the sun's disc too,
// capped (src/sky.js), as the water's own mirror image does.
export const SURFACE_BUBBLE = /* glsl */`
#define FOAM_BUBBLE_CAP 0.04               // the film's two faces' reflectance where its normal faces the viewer, climbing to 1 edge on as (1 − cosθ)⁴
#define FOAM_BUBBLE_WATER_F0 0.02          // the water's own reflectance at normal incidence (Schlick), for the water the film mirrors where r falls
#define FOAM_BUBBLE_SKY_SOFT 0.04          // the mirrored ray's upward component over which the film goes from the water's mirror to the sky's (either side of the plane)
#define FOAM_BUBBLE_SPAN_PARTS 3           // a pixel's span of radii is mirrored in this many parts, each at its own middle (bubbleSpan)
#define FOAM_BUBBLE_LIMB_SAMPLE 0.7        // a pixel over the limb takes its glint and shade this share of the way from its span's inner edge to the limb
#define FOAM_BUBBLE_SKY_TEXELS 320.0       // the sky cube's texels a radian, about (CUBE_SIZE in src/sky.js, 512, over π/2)...
#define FOAM_BUBBLE_SKY_COARSEST 6.0       // ...blurred over the mirrored ray's turn across a pixel, no further than this level (its seams are lost in a bubble's few pixels)
#define FOAM_BUBBLE_AHEAD_UP 0.25          // the sky ahead (bubbleSkyAhead) is the cube's this far above the horizon (the sine)...
#define FOAM_BUBBLE_AHEAD_SIDE 0.6         // ...straight ahead and this far either side (the tangent)
#define FOAM_BUBBLE_UNDERSIDE 0.3          // the shade of a dome's lower part, mirroring the water near by, as a share of the light behind it
#define FOAM_BUBBLE_HAZE 0.12              // the film's own scattering, with the scum and the drops it carries: this share of the foam's white over the dome where the film mirrors the sky...
#define FOAM_BUBBLE_HAZE_LIT 0.5           // ...and this much of that where it mirrors the water: a pale bead, lit on top (the header's Haze)
#define FOAM_BUBBLE_MEAN_FIT vec4(0.0478, -0.0020, -0.0423, 0.0152)   // the dome's mean light per unit of water under it, a sky of 1, (fit · (1, s, s², s³) + QUARTIC·s⁴) / s over s = sinβ (the header)
#define FOAM_BUBBLE_MEAN_FIT_QUARTIC 0.0065
#define FOAM_BUBBLE_LOWEST_VIEW 0.15       // sinβ under which the mean and a dome's reach over the water are held (the fit's range; the water there is far)
#define FOAM_BUBBLE_MENISCUS 0.15          // the meniscus's shadow along the dome's foot, as a share of the light behind...
#define FOAM_BUBBLE_MENISCUS_WIDTH 0.08    // ...over about this (radii) above the water, or a pixel if wider
#define FOAM_BUBBLE_GLINT 6.2831853        // 2π: the film's two faces, times π against the white beside it
#define FOAM_BUBBLE_GLINT_VARIANCE 0.002   // a smooth film's slope variance (2.6° rms)
// The water's reflectance where a ray meets it at this cosine (Schlick's).
float bubbleWaterFresnel(float cosine) {
  float away = 1.0 - clamp(cosine, 0.0, 1.0);
  float squared = away * away;
  return FOAM_BUBBLE_WATER_F0 + (1.0 - FOAM_BUBBLE_WATER_F0) * squared * squared * away;
}
// What the film mirrors along r, whose component up the water's normal is reflectedUp, the view's being viewUp: x, the
// share of the light behind the film that the mirrored light stands in for (the sky, where r rises); y, the share of
// the sky along r (turned back up, bubbleMirrored) that it adds: all of it where r rises, and where it falls the water
// a little way off, which mirrors the sky more than the water behind does, by its Fresnel at r's angle less the view's.
vec2 bubbleMirror(float reflectedUp, float viewUp) {
  float sky = smoothstep(-FOAM_BUBBLE_SKY_SOFT, FOAM_BUBBLE_SKY_SOFT, reflectedUp);
  float graze = max(bubbleWaterFresnel(-reflectedUp) - bubbleWaterFresnel(viewUp), 0.0);
  return vec2(sky, mix(graze, 1.0, sky));
}
// The direction the film's mirrored sky lies in: r, or where it falls into the water, its mirror image in the water's plane.
vec3 bubbleMirrored(vec3 reflected, vec3 planeNormal) {
  return reflected - 2.0 * min(dot(reflected, planeNormal), 0.0) * planeNormal;
}
// The sky along a world direction, the cube blurred over the mirrored ray's turn across a pixel (radians).
vec3 bubbleSkyAlong(samplerCube skyCube, vec3 direction, float turn) {
  return textureCubeLodEXT(skyCube, direction, clamp(log2(max(turn * FOAM_BUBBLE_SKY_TEXELS, 1.0)), 0.0, FOAM_BUBBLE_SKY_COARSEST)).rgb;
}
// The sky an unresolved bubble mirrors (the header): the cube at its coarsest a little above the horizon, straight ahead
// of the viewer (toViewer, world, from the bubble) and either side.
vec3 bubbleSkyAhead(samplerCube skyCube, vec3 toViewer) {
  vec2 ahead = -toViewer.xz / max(length(toViewer.xz), 1e-4);
  vec2 side = vec2(-ahead.y, ahead.x) * FOAM_BUBBLE_AHEAD_SIDE;
  float level = FOAM_BUBBLE_SKY_COARSEST;
  return (textureCubeLodEXT(skyCube, vec3(ahead.x, FOAM_BUBBLE_AHEAD_UP, ahead.y), level).rgb
    + textureCubeLodEXT(skyCube, vec3(ahead.x + side.x, FOAM_BUBBLE_AHEAD_UP, ahead.y + side.y), level).rgb
    + textureCubeLodEXT(skyCube, vec3(ahead.x - side.x, FOAM_BUBBLE_AHEAD_UP, ahead.y - side.y), level).rgb) / 3.0;
}
// The haze's share of the foam's white at a point of the film whose reflected ray rises reflectedUp (the header's Haze).
float bubbleHaze(float reflectedUp) {
  return FOAM_BUBBLE_HAZE * mix(FOAM_BUBBLE_HAZE_LIT, 1.0, smoothstep(-FOAM_BUBBLE_SKY_SOFT, FOAM_BUBBLE_SKY_SOFT, reflectedUp));
}
// The haze's mean per unit of the water's area under a dome, seen from an elevation whose sine is sinElevation: the
// dome's screen image is (1 + s)/2 of the sphere's disc, over 1/s as much water, and the reflected ray rises over half
// the disc at any elevation (tools/foam-probe.mjs checks it against the integral).
float bubbleHazeMean(float sinElevation) {
  float s = max(sinElevation, FOAM_BUBBLE_LOWEST_VIEW);
  return FOAM_BUBBLE_HAZE * (1.0 + FOAM_BUBBLE_HAZE_LIT * s) / (2.0 * s);
}
// The shade of the dome's lower part, where it mirrors the water near by: the share of the light behind it taken, as
// cover without light (the header).
float bubbleUnderside(float reflectedUp) {
  return FOAM_BUBBLE_UNDERSIDE * (1.0 - smoothstep(-FOAM_BUBBLE_SKY_SOFT, FOAM_BUBBLE_SKY_SOFT, reflectedUp));
}
// The dome's mean light per unit of the water's area under it, a sky of 1, seen from an elevation whose sine is
// sinElevation (the header).
float bubbleDomeMean(float sinElevation) {
  float s = max(sinElevation, FOAM_BUBBLE_LOWEST_VIEW);
  return (dot(FOAM_BUBBLE_MEAN_FIT, vec4(1.0, s, s * s, s * s * s)) + FOAM_BUBBLE_MEAN_FIT_QUARTIC * s * s * s * s) / s;
}
// ∫(1 − cosθ)⁴ du over the area u = r² from the centre, cosθ = sqrt(1 − u): over w = 1 − cosθ, 2(w⁵/5 − w⁶/6);
// nothing past the limb.
float bubbleFilmArea(float area) {
  float edgeOn = 1.0 - sqrt(1.0 - min(area, 1.0));
  float squared = edgeOn * edgeOn;
  float fifth = squared * squared * edgeOn;
  return 2.0 * (fifth / 5.0 - fifth * edgeOn / 6.0);
}
// The radius (radii) whose normal takes a pixel's glint and shade, its span's inner edge at inner: its own, or over the
// limb FOAM_BUBBLE_LIMB_SAMPLE of the way from that edge to the limb (the header).
float bubbleMirrorRadius(float radial, float inner) {
  return min(radial, mix(min(inner, 1.0), 1.0, FOAM_BUBBLE_LIMB_SAMPLE));
}
// A pixel's span of radii on a dome, inner to outer (radii, inner < 1), the pixel lying toward across (unit, square to
// the view) from the dome's centre; toViewer and the water's normal in the same frame; a pixel, in radii. In
// FOAM_BUBBLE_SPAN_PARTS parts of the span on the sphere, each its mean reflectance over its radii by area (bubbleFilm's
// closed form) times what it mirrors at its middle by area (bubbleMirror), cut at the water a pixel soft where the
// sphere's point there stands under it. shares: x the span's share on the dome above the water, y the share of the
// light behind the pixel the film's mirror stands in for, z the share of the sky it adds; reflected: the reflected ray
// of the part that adds the most, along which the caller takes the sky.
struct BubbleSpan {
  vec3 shares;
  vec3 reflected;
};
BubbleSpan bubbleSpan(float inner, float outer, vec3 across, vec3 toViewer, vec3 planeNormal, float pixel) {
  BubbleSpan span = BubbleSpan(vec3(0.0), toViewer);
  if (inner >= 1.0) return span;
  float spanArea = outer * outer - inner * inner;
  float top = min(outer, 1.0);
  float viewUp = dot(toViewer, planeNormal);
  float most = -1.0;
  for (int part = 0; part < FOAM_BUBBLE_SPAN_PARTS; part++) {
    float from = mix(inner, top, float(part) / float(FOAM_BUBBLE_SPAN_PARTS));
    float to = mix(inner, top, float(part + 1) / float(FOAM_BUBBLE_SPAN_PARTS));
    float fromArea = from * from, toArea = to * to;
    float reflectance = (FOAM_BUBBLE_CAP * (toArea - fromArea) + (1.0 - FOAM_BUBBLE_CAP) * (bubbleFilmArea(toArea) - bubbleFilmArea(fromArea))) / spanArea;
    float middle = sqrt(0.5 * (fromArea + toArea));
    float facing = sqrt(max(1.0 - middle * middle, 0.0));
    vec3 normal = middle * across + facing * toViewer;
    float cover = smoothstep(-0.5 * pixel, 0.5 * pixel, dot(normal, planeNormal));
    vec3 reflected = 2.0 * facing * normal - toViewer;
    vec2 mirror = bubbleMirror(dot(reflected, planeNormal), viewUp);
    float light = reflectance * cover * mirror.y;
    span.shares += vec3((toArea - fromArea) / spanArea * cover, reflectance * cover * mirror.x, light);
    if (light > most) { most = light; span.reflected = reflected; }
  }
  return span;
}
// The meniscus's shadow at a height above the water (radii) on the dome, a
// pixel being so many radii: a band along its foot, the share of the light
// behind it takes.
float bubbleMeniscus(float height, float pixel) {
  float band = max(FOAM_BUBBLE_MENISCUS_WIDTH, pixel);
  return FOAM_BUBBLE_MENISCUS * (1.0 - smoothstep(0.5 * band, 2.0 * band, height));
}
`;

// A point sprite drawn as a bubble (SPECK_FRAGMENT in src/shaders/scene.js,
// the rain's bubbles in src/shaders/rain.js), its sphere filling the
// sprite, centred on the water at the bubble's foot. Unresolved (its true
// size on screen, pixelSize, under BUBBLE_SPRITE_DOME_FROM pixels, whatever
// minimum it is drawn at, drawn) it is a soft grain mirroring the sky ahead
// by the share a dome averages over its disc (bubbleDomeMean,
// bubbleSkyAhead), so it is as bright far off as near. Resolved (from
// BUBBLE_SPRITE_DOME_TO) it is the dome standing on the water, as
// SURFACE_BUBBLE says: the pixel's ray, along the sprite's z, meets the
// sphere at its front (the hit's normal is the point's own position on
// it; a pixel's span runs out from there, so its mirror is its own), and the water's
// plane cuts the sphere to the dome, a pixel soft; the film there lets
// 1 − F of the water behind it through and mirrors the sky cube along the
// reflected ray (turned into the world by the view matrix's rotation,
// whose inverse is its transpose), each pixel the reflectance's mean over
// the radii from its centre out by a pixel, the span's share on the sphere
// rounding off the limb a pixel soft; a meniscus's faint shadow along the
// dome's foot and the shade of its lower part, mirroring the water
// (bubbleUnderside), both as cover without light, so over a milky boil the
// dome stands out as a bead; and the sun's glint, where the dome's normal
// is the half vector between the viewer and the sun, never smaller than a
// pixel, added as light, a film's reflectance following its thickness
// (thin-film interference), from nearly nothing to four times a single
// face's, which FOAM_BUBBLE_GLINT's two faces average. Never a flat ring
// with a hole.
// offset is the pixel in the sprite (−1 to 1 across it, y down); the frame
// vectors are the water's normal, the direction to the viewer, to the sun
// and the half vector between them, all in the sprite's frame (x right, y
// down, z toward the viewer); alpha is the sprite's own opacity (its fade
// and shine, cut by the area it really covers). Out: the light it adds
// (the mirrored sky, by alpha) and the share of what lies behind it that
// light stands in for, which the caller scales by its own opacity; the
// haze, the share of what lies behind it the foam's white replaces (the
// caller supplies the white); the shadow, cover without light; and the
// glint, light to add. The caller
// declares the view matrix (three.js gives every ShaderMaterial's fragment
// shader viewMatrix) and passes the sky cube.
export const BUBBLE_SPRITE = /* glsl */`
${SURFACE_BUBBLE}
#define BUBBLE_SPRITE_PI 3.141592653589793
#define BUBBLE_SPRITE_DOME_FROM 3.5   // pixels of true size from which a sprite starts to be drawn as a dome...
#define BUBBLE_SPRITE_DOME_TO 5.0     // ...and is one
// A vector in the sprite's frame (x right, y down, z toward the viewer) in the world's.
vec3 bubbleSpriteToWorld(vec3 spriteVector) {
  vec3 view = vec3(spriteVector.x, -spriteVector.y, spriteVector.z);
  return vec3(dot(viewMatrix[0].xyz, view), dot(viewMatrix[1].xyz, view), dot(viewMatrix[2].xyz, view));
}
void bubbleSprite(vec2 offset, float pixelSize, float drawn, vec3 planeNormal, vec3 toViewer, vec3 toSun, vec3 halfVector, vec3 sunIrradiance, float alpha, samplerCube skyCube, out vec3 light, out float loss, out float haze, out float shadow, out vec3 glint) {
  float radiusSquared = dot(offset, offset);
  float radius = sqrt(radiusSquared);
  float pixel = 2.0 / max(drawn, 1.0);   // a pixel, in radii
  float dome = smoothstep(BUBBLE_SPRITE_DOME_FROM, BUBBLE_SPRITE_DOME_TO, pixelSize);
  // The unresolved grain mirrors the sky ahead by the dome's mean share over its disc (bubbleDomeMean at the view's
  // elevation, planeNormal.z; exp(−3r²) averages (1 − e⁻³)/3 over the unit disc), and carries the haze's mean.
  float grainShape = exp(-3.0 * radiusSquared) * 3.0 / (1.0 - exp(-3.0));
  float grain = grainShape * bubbleDomeMean(planeNormal.z);
  vec3 skyAhead = bubbleSkyAhead(skyCube, bubbleSpriteToWorld(vec3(0.0, 0.0, 1.0)));
  // The pixel's ray, along the sprite's z, meets the sphere at its front, whose normal is the point itself; its height
  // above the water (radii) cuts the sphere to the dome, a pixel soft. The film over the radii from here out by a
  // pixel (bubbleSpan, its span running outward from the point), mirroring the sky along the ray of its brightest part.
  vec3 toViewerAlong = vec3(0.0, 0.0, 1.0);
  vec3 normal = vec3(offset, sqrt(max(1.0 - radiusSquared, 0.0)));
  float height = dot(normal, planeNormal);
  float cover = smoothstep(-0.5 * pixel, 0.5 * pixel, height);
  float reflectedUp = dot(2.0 * normal.z * normal - toViewerAlong, planeNormal);
  BubbleSpan film = bubbleSpan(radius, radius + pixel, vec3(offset / max(radius, 1e-4), 0.0), toViewerAlong, planeNormal, pixel);
  float limb = film.shares.x;
  vec3 sky = bubbleSkyAlong(skyCube, bubbleSpriteToWorld(bubbleMirrored(film.reflected, planeNormal)), 2.0 * pixel);
  light = alpha * mix(grain * skyAhead, film.shares.z * sky, dome);
  loss = alpha * mix(grain, film.shares.y, dome);
  haze = alpha * mix(grainShape * bubbleHazeMean(planeNormal.z), bubbleHaze(reflectedUp) * limb * (1.0 - film.shares.y), dome);
  shadow = alpha * (bubbleMeniscus(height, pixel) * cover + bubbleUnderside(reflectedUp) * limb) * dome;
  // The sun's glint on the dome.
  float nDotH = max(dot(normal, halfVector), 1e-3);
  float nDotV = max(dot(normal, toViewer), 1e-3);
  float variance = FOAM_BUBBLE_GLINT_VARIANCE + pixel * pixel;
  float cosineSquared = nDotH * nDotH;
  float distribution = exp(-(1.0 - cosineSquared) / (cosineSquared * variance)) / (BUBBLE_SPRITE_PI * variance * cosineSquared * cosineSquared);
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(toViewer, halfVector), 0.0), 5.0);
  glint = sunIrradiance * distribution * fresnel / (4.0 * nDotV) * FOAM_BUBBLE_GLINT * step(0.0, dot(normal, toSun)) * limb * dome * alpha;
}
`;
