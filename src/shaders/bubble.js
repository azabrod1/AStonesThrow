// GLSL for a bubble floating on the water, shared by the water's own bursting
// bubbles (freshBubbles in FOAM_PATTERN, src/shaders/scene.js), the foam
// specks (SPECK_FRAGMENT there, src/foamSpecks.js) and the bubbles rain
// leaves (src/shaders/rain.js, src/rain.js): SURFACE_BUBBLE is the dome's
// film, lighting and shade, BUBBLE_SPRITE a point sprite drawn as one. Its
// own module because the scene's shaders import the rain's.

// A bubble floating on the surface, as the water's bubbles bursting over a
// boil (freshBubbles, FOAM_PATTERN) and the foam specks (SPECK_FRAGMENT)
// both draw it, so the two kinds match side by side: a hemisphere standing
// on the water, its film nearly clear, the water showing through it, and
// the sky mirrored on its top. A pixel's view ray is cast at the dome
// (freshBubbles and SPECK_FRAGMENT each do the casting in their own frame):
// the film is drawn where the ray meets the dome above the water, and
// where it would meet the sphere below the water, the water shows (the base
// is cut by the water's plane, a pixel soft), so from the bank a bubble is
// a dome, round on top and foreshortened only at its foot, never a disc
// lying on the water. The film's white at the hit is the sky's Fresnel
// reflection off it, which climbs toward grazing incidence, times what the
// film mirrors there. The Fresnel rises as g(θ) = (1 − cosθ)², cosθ the
// dome's normal toward the viewer, from FOAM_BUBBLE_CAP_WHITE where the
// normal faces the viewer to FOAM_BUBBLE_EDGE_WHITE at the limb, the film
// seen edge on. A film's own two-face Fresnel falls faster, nearer
// (1 − cosθ)⁴ (0.11 at 60° where the square gives 0.28), but at that power
// the rim of a bubble 10 to 20 pixels across came out too faint to read in
// frames; the square was tuned by them. What the film mirrors (bubbleSky)
// is the environment along the reflected ray, reflect(−v, m): the sky,
// whole, where that ray rises (FOAM_BUBBLE_SKY_FROM to FOAM_BUBBLE_SKY_TO
// of its upward component, a soft horizon), brightest at the horizon and
// falling to FOAM_BUBBLE_ZENITH of that at the zenith
// (FOAM_BUBBLE_ZENITH_FROM to FOAM_BUBBLE_ZENITH_TO of the upward
// component), as a clear sky's radiance does, and the water behind the
// bubble where it falls, which sends back FOAM_BUBBLE_WATER_MIRROR of what
// the sky does (its own mirror of the sky, and the boil's milk); and the
// film seen edge on glows with the sky whatever lies behind it (a film's
// edge glows against anything: light from the whole sky, caught in the
// film where it runs along the view, and the bright ring of the meniscus
// at its foot), so the limb keeps its thin bright line. The two parts of
// the white take the two (bubbleWhite): the cap's own white, even over
// the film, mirrors the window of sky or the water by the reflected ray;
// the Fresnel's rise toward the limb, which lies across the view and
// mirrors what is straight behind it, the water, except that it glows
// edge on, the glow rising as the Fresnel does, so the rise's white is
// (1 − cosθ)⁴·(mirror + (1 − mirror)(1 − cosθ)⁴): 0.12 at 73°, 0.25 at
// 78°, 0.51 at 84°. Kept apart, each has its exact mean over a pixel's
// span (bubbleFilm): the cap's white mirrors the window at the pixel's own
// hit, since the window changes slowly across the dome, and the rise's two
// powers both integrate in closed form, so a pixel wider than a bubble
// takes its whole rim as the rim is, grazing, rather than at its centre's
// cosθ (taking the rim at the centre's cosθ lit it all as a window, 13%
// too white where the bubbles start to fade, and an edge glow that was a
// smoothstep of cosθ at the rise's mean cosθ lost 12% there, by Jensen,
// both in tools/foam-probe.mjs). So the dome's top wears a faint window of sky, its lower
// part the dark water, and its limb a thin bright line, round on top: a
// clear thing standing on the water, which reads as a bubble, where the
// flat disc this replaced, a ring of even white lying on the water, read
// as a drawn circle. The Fresnel's fourth power was chosen over the square
// by frames of a dome: seen from the bank, half of a dome's face has its
// normal 60° or more from the viewer, where the square gave 0.28 and made
// the upper half of every dome an opaque white bead, a pearl, not a
// bubble; the fourth power gives 0.06 there, so the film is clear but at
// its limb (0.24 at 75°, 0.67 at 85°). Three quarters of its white lies in
// the outer 8% of the radius, under a pixel until a bubble is some 25
// pixels across, so a pixel takes the profile's mean over the span of
// radii it covers (bubbleFilm; radius r = sinθ, the ray's closest approach
// to the dome's centre, a miss being r > 1), by area, in closed form: over
// u = r² and w = 1 − sqrt(1 − u), ∫(1 − sqrt(1 − u))⁴ du = 2(w⁵/5 − w⁶/6)
// (bubbleFilmArea; the whole cap's mean is 2(1/5 − 1/6) = 1/15, where the
// square's was 1/6). The rim never thins below a pixel and keeps its
// light, spread over it, and the span's share on the sphere rounds off the
// limb. The mirrored environment is taken at the pixel's own hit, since it
// changes slowly across the dome. Over the whole dome, per unit of the
// water's area under it, the white averages bubbleDomeMean(sinβ), β the
// view's elevation: the dome's screen image is the sphere's disc less what
// lies under the water, which covers (1/sinβ) times as much of the water
// as the screen shows, so a boil's domes whiten the water more the lower
// the view (0.06 of the edge white from straight above, 0.12 at 20°; the
// flat disc this replaced averaged 0.2 at any view). The mean is a
// numerical integral, fitted as (FOAM_BUBBLE_MEAN_FIT·(1, s, s², s³) +
// FOAM_BUBBLE_MEAN_FIT_QUARTIC·s⁴)/s over s = sinβ from 0.15 to 1 within
// 2% (tools/foam-probe.mjs integrates it and checks the fit; refit it
// there when any of these constants changes). Pixels whose spans are
// centred on them, each a mean by area, keep that mean: summed over a
// bubble, every bit of its film is counted once whatever the pixel's size,
// so a field of them drawn at a footprint whitens on average as one
// point-sampled does, while the bubbles are wider than a pixel; one smaller
// loses some (the pixels by its centre average it over a span wider than
// it): where freshBubbles starts to fade them, a few per cent of the
// field's white (tools/foam-probe.mjs).
// Along the dome's foot a faint shadow (bubbleMeniscus: FOAM_BUBBLE_MENISCUS
// of the light behind, at most, over FOAM_BUBBLE_MENISCUS_WIDTH of the
// radius above the water, or a pixel if wider), where the meniscus at the
// bubble's base bends the light away: the dark line under the dome is what
// seats it in the water, though over dark water it hardly shows.
// The sky's fall toward the zenith and the underside's shade are what make
// a small dome read as a sphere: seen from the bank (some 30° up), the
// reflected ray rises over nearly the whole of a dome's visible face, so
// with the sky mirrored even a dome 10 to 15 pixels across read as a flat,
// evenly grey disc with a highlight. With the fall, the band of it that
// mirrors the sky low down is brightest and its top, mirroring the
// zenith, dimmer; and its lower part, where the reflected ray falls and
// the film mirrors the dark water ahead (one less bubbleSkyWindow), takes
// FOAM_BUBBLE_UNDERSIDE of the light behind it (bubbleUnderside, as cover
// without light, like the meniscus's shadow, by the share of the pixel on
// the dome), so over the milky boil each dome's lower part is darker than
// the foam behind it; over dark water it hardly shows. The shade is cover,
// not white, so the mean white (bubbleDomeMean) leaves it out; the zenith's
// fall is in it.
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
// the high view, the sun to the side).
export const SURFACE_BUBBLE = /* glsl */`
#define FOAM_BUBBLE_EDGE_WHITE 1.0         // a bubble's edge, its film seen edge on, mirroring whole what lies behind it...
#define FOAM_BUBBLE_CAP_WHITE 0.05         // ...from this where its normal faces the viewer, as (1 − cosθ)⁴: a film's two faces at normal incidence, the water showing through
#define FOAM_BUBBLE_WATER_MIRROR 0.35      // what the water behind a bubble sends back, against the sky's 1: its own mirror of the sky, and the boil's milk
#define FOAM_BUBBLE_SKY_FROM -0.15         // the mirrored ray's upward component over which the film goes from mirroring the water...
#define FOAM_BUBBLE_SKY_TO 0.35            // ...to mirroring the sky: a soft horizon (a sharp one drew a hard line across every dome from the bank, a cup)
#define FOAM_BUBBLE_ZENITH 0.45            // the sky's radiance mirrored from the zenith, against the horizon's 1...
#define FOAM_BUBBLE_ZENITH_FROM 0.15       // ...falling from the horizon's over this upward component of the mirrored ray...
#define FOAM_BUBBLE_ZENITH_TO 0.9          // ...to the zenith's over this
#define FOAM_BUBBLE_UNDERSIDE 0.3          // the shade of a dome's lower part, mirroring the water, as a share of the light behind it
#define FOAM_BUBBLE_MEAN_FIT vec4(0.0430, -0.0826, 0.3562, -0.5324)   // the dome's mean white per unit of water under it, (fit · (1, s, s², s³) + QUARTIC·s⁴) / s over s = sinβ (the header)
#define FOAM_BUBBLE_MEAN_FIT_QUARTIC 0.2770
#define FOAM_BUBBLE_LOWEST_VIEW 0.15       // sinβ under which the mean and a dome's reach over the water are held (the fit's range; the water there is far)
#define FOAM_BUBBLE_MENISCUS 0.15          // the meniscus's shadow along the dome's foot, as a share of the light behind...
#define FOAM_BUBBLE_MENISCUS_WIDTH 0.08    // ...over about this (radii) above the water, or a pixel if wider
#define FOAM_BUBBLE_GLINT 6.2831853        // 2π: the film's two faces, times π against the white beside it
#define FOAM_BUBBLE_GLINT_VARIANCE 0.002   // a smooth film's slope variance (2.6° rms)
// The share of the sky, against the water, in what the film mirrors where the reflected ray's upward component is
// reflectedUp: a soft horizon.
float bubbleSkyWindow(float reflectedUp) {
  return smoothstep(FOAM_BUBBLE_SKY_FROM, FOAM_BUBBLE_SKY_TO, reflectedUp);
}
// What the cap's white mirrors there, against the horizon sky's 1: the water, or the sky, bright at the horizon and
// falling to FOAM_BUBBLE_ZENITH at the zenith.
float bubbleSky(float reflectedUp) {
  float skyRadiance = mix(1.0, FOAM_BUBBLE_ZENITH, smoothstep(FOAM_BUBBLE_ZENITH_FROM, FOAM_BUBBLE_ZENITH_TO, reflectedUp));
  return mix(FOAM_BUBBLE_WATER_MIRROR, skyRadiance, bubbleSkyWindow(reflectedUp));
}
// The shade of the dome's lower part, where it mirrors the water ahead: the share of the light behind it taken, as
// cover without light (the header).
float bubbleUnderside(float reflectedUp) {
  return FOAM_BUBBLE_UNDERSIDE * (1.0 - bubbleSkyWindow(reflectedUp));
}
// The dome's mean white per unit of the water's area under it, seen from an elevation whose sine is sinElevation (the header).
float bubbleDomeMean(float sinElevation) {
  float s = max(sinElevation, FOAM_BUBBLE_LOWEST_VIEW);
  return (dot(FOAM_BUBBLE_MEAN_FIT, vec4(1.0, s, s * s, s * s * s)) + FOAM_BUBBLE_MEAN_FIT_QUARTIC * s * s * s * s) / s;
}
// ∫(1 − cosθ)⁴ du and ∫(1 − cosθ)⁸ du over the area u = r² from the centre, cosθ = sqrt(1 − u): over w = 1 − cosθ,
// 2(w⁵/5 − w⁶/6) and 2(w⁹/9 − w¹⁰/10); nothing past the limb.
vec2 bubbleFilmArea(float area) {
  float edgeOn = 1.0 - sqrt(1.0 - min(area, 1.0));
  float fourth = edgeOn * edgeOn * edgeOn * edgeOn;
  float fifth = fourth * edgeOn;
  float ninth = fifth * fourth;
  return 2.0 * vec2(fifth / 5.0 - fifth * edgeOn / 6.0, ninth / 9.0 - ninth * edgeOn / 10.0);
}
// Over the radii from inner to outer (in radii, inner < outer), by area: x
// the share of them on the cap, y the cap's own white over the span
// (FOAM_BUBBLE_CAP_WHITE where the film is), z the Fresnel's rise toward
// the limb over it with what it mirrors, the water and the edge's glow.
vec3 bubbleFilm(float inner, float outer) {
  float innerArea = inner * inner, outerArea = outer * outer;
  float span = outerArea - innerArea;
  float onCap = (min(outerArea, 1.0) - min(innerArea, 1.0)) / span;
  vec2 rise = (bubbleFilmArea(outerArea) - bubbleFilmArea(innerArea)) / span;
  float mirrored = mix(rise.y, rise.x, FOAM_BUBBLE_WATER_MIRROR);
  return vec3(onCap, FOAM_BUBBLE_CAP_WHITE * onCap, (FOAM_BUBBLE_EDGE_WHITE - FOAM_BUBBLE_CAP_WHITE) * mirrored);
}
// The film's white over a pixel's span (bubbleFilm) where its reflected ray rises reflectedUp: the cap's white mirrors
// the window of sky or the water, the Fresnel's rise what bubbleFilm gave it.
float bubbleWhite(vec3 film, float reflectedUp) {
  return film.y * bubbleSky(reflectedUp) + film.z;
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
// minimum it is drawn at, drawn) it is a soft grain carrying the white a
// dome averages over its disc (bubbleDomeMean), so it is as white far off
// as near. Resolved (from BUBBLE_SPRITE_DOME_TO) it is the dome standing on
// the water, as SURFACE_BUBBLE says: the pixel's ray, along the sprite's
// z, meets the sphere at its front (the hit's normal is the point's own
// position on it), and the water's plane cuts the sphere to the dome, a
// pixel soft; the film there is nearly clear, mirroring the sky on its top
// and the water on its limb and lower part, each pixel the Fresnel's mean
// over the radii from its centre out by a pixel, the span's share on the
// sphere rounding off the limb a pixel soft; a meniscus's faint shadow
// along the dome's foot and the shade of its lower part, mirroring the
// water (bubbleUnderside), both as cover without light, so over a milky
// boil the dome stands out as a sphere; and the sun's glint, where the
// dome's normal is the half vector between the viewer and the sun, never
// smaller than a pixel, added as light, not as cover, a film's reflectance
// following its thickness (thin-film interference), from nearly nothing to
// four times a single face's, which FOAM_BUBBLE_GLINT's two faces average.
// Never a flat ring with a hole.
// offset is the pixel in the sprite (−1 to 1 across it, y down); the frame
// vectors are the water's normal, the direction to the viewer, to the sun
// and the half vector between them, all in the sprite's frame (x right, y
// down, z toward the viewer); alpha is the sprite's own opacity (its fade
// and shine, cut by the area it really covers). Out: the white's shape,
// which the caller scales by its light and opacity; the shadow, cover
// without light; and the glint, light to add.
export const BUBBLE_SPRITE = /* glsl */`
${SURFACE_BUBBLE}
#define BUBBLE_SPRITE_PI 3.141592653589793
#define BUBBLE_SPRITE_DOME_FROM 3.5   // pixels of true size from which a sprite starts to be drawn as a dome...
#define BUBBLE_SPRITE_DOME_TO 5.0     // ...and is one
void bubbleSprite(vec2 offset, float pixelSize, float drawn, vec3 planeNormal, vec3 toViewer, vec3 toSun, vec3 halfVector, vec3 sunIrradiance, float alpha, out float shape, out float shadow, out vec3 glint) {
  float radiusSquared = dot(offset, offset);
  float radius = sqrt(radiusSquared);
  float pixel = 2.0 / max(drawn, 1.0);   // a pixel, in radii
  float dome = smoothstep(BUBBLE_SPRITE_DOME_FROM, BUBBLE_SPRITE_DOME_TO, pixelSize);
  // The unresolved grain carries the dome's mean white over its disc (bubbleDomeMean at the view's elevation,
  // planeNormal.z; exp(−3r²) averages (1 − e⁻³)/3 over the unit disc).
  float grain = exp(-3.0 * radiusSquared) * bubbleDomeMean(planeNormal.z) * 3.0 / (1.0 - exp(-3.0));
  // The pixel's ray, along the sprite's z, meets the sphere at its front, whose normal is the point itself; its height
  // above the water (radii) cuts the sphere to the dome, a pixel soft, and the reflected ray's rise is what the film mirrors.
  vec3 normal = vec3(offset, sqrt(max(1.0 - radiusSquared, 0.0)));
  float height = dot(normal, planeNormal);
  float cover = smoothstep(-0.5 * pixel, 0.5 * pixel, height);
  float reflectedUp = 2.0 * normal.z * height - planeNormal.z;
  // The film over the radii from here out by a pixel: x its share on the sphere (the limb), the rest its white's parts.
  vec3 film = bubbleFilm(radius, radius + pixel);
  float limb = film.x * cover;
  shape = mix(grain, bubbleWhite(film, reflectedUp) * cover, dome);
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
