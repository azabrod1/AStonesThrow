"""Europa's sky (src/sky.js `europa`, the place src/places.js PLACES `europa`): a panorama computed, not photographed.

No one has stood on Europa, so its sky is drawn from what is known of it rather than stitched from photographs: no
air, so a black sky with its stars and the Milky Way by day, the Sun small (5.2 au: a fifth of the width it has from
Earth, a disc 0.1 degrees across) and white; Jupiter, 671 000 km off, 12.2 degrees across (JUPITER `radius`, its
angular radius), its belts and zones, its Great Red Spot, lit as a sphere by that sun (so as gibbous as the sun's
place makes it, its night side black against the stars), its equator through its middle as it is seen from a moon in
its equatorial plane; and ice to the horizon, under which the scene's own water and ice lie. The ground is a height
field (`terrain`) ray-marched from an eye EYE metres up on a moon of Europa's radius (its curvature hides what lies
past 2 to 3 km): a refrozen basin about the eye (the scene's own pond lies in it), its rim of rising, hummocky
plain, the double ridges Galileo photographed crossing it (two crests and a trough between, 100 to 250 m high, their
flanks stained reddish-brown, as Europa's lineae are), and to the right a field of chaos terrain, tilted plates of
crust between darker refrozen matrix. Everything is lit by the sun alone, shadows and all (no sky to fill them),
and by the sunlit ice round it (a share of the light the ground gives back, by how far a face looks down).

The frame: the file's columns run as tools/sky-probe.mjs says (azimuth 360·u from the left edge, turning right).
The sun stands at SUN `azimuth`, the scene's ahead SUN_AZIMUTH to its left (src/sky.js `europa` turns the panorama
so the sun stands sunAzimuth degrees right of ahead: change both); every other bearing below is degrees right of
ahead. The brightness is the scene's: src/sky.js scales a panorama so its sun is the scene's sun, so only ratios
matter here: Jupiter and the ice are what their albedo makes them under that sun; the stars and the Milky Way are
far brighter than they would be against sunlit ice (no eye adapted to the ice would see them), drawn as a film
draws them.

It renders the 8k panorama (8192 x 4096: the horizon strip's source, tools/sky-encode.mjs, never committed:
assets/sky/europa_8k.hdr, gitignored) and the 2k one the dome draws (assets/sky/europa_2k.hdr), the 8k's 4 x 4
means, so a star's or the sun's light is the same in both. Each 8k pixel takes one ray, and pixels at the
terrain's edges (where it meets sky, or a nearer slope a farther one) four more. Seeded (SEED): the same files
every run. Then, as for any sky:

  python3 tools/europa-sky.py
  node tools/sky-probe.mjs assets/sky/europa_2k.hdr
  node tools/sky-encode.mjs assets/sky/europa_2k.hdr --verify

About seven minutes (--draft: the 2k alone, for a look, in one); needs numpy. --preview=file.png writes a tone-mapped look
at the 2k panorama. Over its black sky the encoder's relative error reads near 100%: it measures nothing there.
"""
import argparse
import math
import os
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKY = os.path.join(ROOT, 'assets', 'sky')
SEED = 5
WIDTH, HEIGHT, DOWN = 8192, 4096, 4    # the 8k panorama, and the 2k's 4 x 4 means of it

EYE = 1.5                  # metres over the ice
MOON_RADIUS = 1560.8e3     # Europa's, metres: the horizon of an eye EYE up is 2.2 km off
SUN = {'azimuth': 200.0, 'elevation': 25.0, 'irradiance': 6.0, 'radius': 0.051, 'colour': (1.0, 0.98, 0.95)}
SUN_AZIMUTH = 110.0        # src/sky.js `europa` sunAzimuth: the sun this many degrees right of ahead
HALO = 2e-5                # the sun's glare, L = E·HALO/θ² (θ in radians) out to HALO_REACH degrees: the eye's, not an air's
HALO_REACH = 12.0
AHEAD = SUN['azimuth'] - SUN_AZIMUTH

# Jupiter: its centre (bearing, elevation, degrees), its angular radius, its axis's tilt from the sky's vertical
# (degrees, toward the right), the longitude at its middle and the Great Red Spot's (degrees).
JUPITER = {'bearing': -10.0, 'elevation': 11.0, 'radius': 6.1, 'tilt': 20.0, 'longitude': 0.0, 'spot': (-22.5, 28.0)}
# Its bands from south to north: [latitude (degrees) where a band's colour is full, its albedo (linear RGB)].
BANDS = [
    (-90, (0.36, 0.35, 0.34)), (-62, (0.46, 0.43, 0.40)), (-50, (0.58, 0.53, 0.47)), (-42, (0.66, 0.60, 0.52)),
    (-36, (0.72, 0.66, 0.56)), (-30, (0.52, 0.39, 0.28)), (-25, (0.80, 0.74, 0.62)), (-19, (0.82, 0.76, 0.64)),
    (-14, (0.48, 0.32, 0.21)), (-9, (0.55, 0.38, 0.26)), (-5, (0.86, 0.82, 0.72)), (0, (0.88, 0.84, 0.74)),
    (5, (0.84, 0.79, 0.68)), (9, (0.45, 0.30, 0.20)), (15, (0.50, 0.34, 0.23)), (19, (0.82, 0.76, 0.64)),
    (23, (0.80, 0.73, 0.60)), (27, (0.54, 0.41, 0.30)), (32, (0.76, 0.70, 0.59)), (38, (0.64, 0.57, 0.49)),
    (46, (0.60, 0.55, 0.49)), (60, (0.46, 0.44, 0.42)), (90, (0.36, 0.35, 0.35)),
]
SPOT = {'colour': (0.74, 0.34, 0.20), 'size': (11.0, 5.5)}   # the Great Red Spot's albedo and half sizes (degrees of longitude and latitude)

STARS = 14000              # drawn down to magnitude STAR_FAINTEST
STAR_FAINTEST = 7.0
STAR_ZERO = 2.4e-6         # a magnitude-0 star's light (irradiance, in the sun's units)
MILKY_WAY = {'pole': (40.0, 35.0), 'width': 11.0, 'radiance': 0.0025}   # its pole (bearing, elevation), half width (degrees)

# The ground's albedos (linear RGB): Europa's ice, and the reddish-brown of its lineae and ridge flanks.
ICE = np.array([0.80, 0.82, 0.84])
PLAIN = np.array([0.72, 0.70, 0.67])
STAIN = np.array([0.45, 0.30, 0.19])
# The basin: flat to its rim, `rim` m off (give or take `wobble`), rising `height` m over `rise` m beyond it.
BASIN = {'rim': 900.0, 'wobble': 260.0, 'height': 45.0, 'rise': 1000.0}
# The double ridges: the point of each nearest the eye (bearing, distance m), the angle of its line to the line of
# sight (degrees), its height (m), its crests' half spacing and half width (m), and its half length (m).
RIDGES = [
    (-14.0, 2700.0, 78.0, 170.0, 300.0, 290.0, 6500.0),
    (38.0, 5600.0, 64.0, 140.0, 260.0, 240.0, 7000.0),
    (-62.0, 8500.0, 40.0, 230.0, 360.0, 330.0, 9000.0),
    (150.0, 2400.0, 96.0, 150.0, 280.0, 260.0, 5000.0),
    (-125.0, 3600.0, 70.0, 120.0, 240.0, 230.0, 6000.0),
    (95.0, 4200.0, 30.0, 110.0, 220.0, 200.0, 5000.0),
]
# Lineae: stains without relief (bearing, distance m, angle to the line of sight, half width m).
LINEAE = [(-35.0, 1800.0, 60.0, 35.0), (10.0, 2300.0, 105.0, 25.0), (60.0, 1600.0, 20.0, 40.0), (-90.0, 2000.0, 85.0, 30.0),
          (130.0, 1500.0, 50.0, 30.0), (-160.0, 2500.0, 120.0, 45.0), (25.0, 4000.0, 75.0, 60.0), (-5.0, 6000.0, 95.0, 50.0)]
# Chaos terrain: its middle (bearing, distance m), its radius (m), its plates' size (m) and heights (m).
CHAOS = {'bearing': 32.0, 'distance': 3900.0, 'radius': 2300.0, 'cell': 330.0, 'heights': (25.0, 95.0), 'matrix': 12.0}
HIGHEST = 330.0            # m: nothing in the height field stands higher (the march stops above it)
BAND = (-1.2, 9.0)         # degrees of elevation the ground is marched in; below it the basin's floor


def direction(azimuth, elevation):
    """A unit vector in the panorama's frame (tools/sky-probe.mjs: phi = 2π(u − ½), u = azimuth/360)."""
    phi = math.radians(azimuth) - math.pi
    elevation = math.radians(elevation)
    return np.array([math.cos(elevation) * math.cos(phi), math.sin(elevation), math.cos(elevation) * math.sin(phi)])


def ground_point(bearing, distance):
    """Where on the ground (x, z, metres) lies a point `distance` m off at `bearing` degrees right of ahead."""
    toward = direction(AHEAD + bearing, 0.0)
    return toward[0] * distance, toward[2] * distance


def smoothstep(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


rng = np.random.default_rng(SEED)
PERMUTATION = rng.permutation(1024).astype(np.int64)


def lattice(ix, iz, salt=0):
    """A value from 0 to 1 for each integer lattice point."""
    return PERMUTATION[(PERMUTATION[(ix + salt * 59) & 1023] + iz * 7 + salt * 131) & 1023] / 1023.0


def value_noise(x, z, salt=0):
    ix, iz = np.floor(x), np.floor(z)
    fx, fz = x - ix, z - iz
    ix, iz = ix.astype(np.int64), iz.astype(np.int64)
    ux, uz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b = lattice(ix, iz, salt), lattice(ix + 1, iz, salt)
    c, d = lattice(ix, iz + 1, salt), lattice(ix + 1, iz + 1, salt)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz


def fbm(x, z, octaves, salt=0):
    total, amplitude, scale = 0.0, 0.5, 1.0
    for octave in range(octaves):
        total = total + amplitude * value_noise(x * scale + octave * 17.1, z * scale - octave * 9.3, salt + octave)
        amplitude *= 0.5
        scale *= 2.03
    return total


def line_frame(bearing, distance, angle):
    """A line on the ground through the point at (bearing, distance), at `angle` degrees to the line of sight there:
    its point, its direction and its normal (unit, x and z)."""
    x0, z0 = ground_point(bearing, distance)
    sight = math.atan2(z0, x0)
    heading = sight + math.radians(angle)
    return (x0, z0), (math.cos(heading), math.sin(heading)), (-math.sin(heading), math.cos(heading))


RIDGE_LINES = [(line_frame(bearing, distance, angle), height, spacing, width, length, index)
               for index, (bearing, distance, angle, height, spacing, width, length) in enumerate(RIDGES)]
LINEA_LINES = [(line_frame(bearing, distance, angle), width, index) for index, (bearing, distance, angle, width) in enumerate(LINEAE)]
CHAOS_CENTRE = ground_point(CHAOS['bearing'], CHAOS['distance'])
RIM_PHASES = rng.uniform(0, 2 * math.pi, 4)


def terrain(x, z, with_stain=False):
    """The ground's height (m) at (x, z), and with `with_stain` its stain (0 ice to 1 the lineae's brown) and
    whiteness (the chaos plates' fresher ice)."""
    distance = np.hypot(x, z)
    angle = np.arctan2(z, x)
    rim = BASIN['rim'] + BASIN['wobble'] * (0.5 * np.sin(3 * angle + RIM_PHASES[0]) + 0.3 * np.sin(5 * angle + RIM_PHASES[1])
                                            + 0.2 * np.sin(8 * angle + RIM_PHASES[2]))
    upland = smoothstep(rim, rim + BASIN['rise'], distance)
    height = BASIN['height'] * upland
    height = height + upland * (55.0 * (fbm(x / 900.0, z / 900.0, 3, 1) - 0.4) + 7.0 * (fbm(x / 140.0, z / 140.0, 2, 2) - 0.5))
    stain = np.zeros_like(x) if with_stain else None
    for (origin, along_unit, across_unit), ridge_height, spacing, width, half_length, index in RIDGE_LINES:
        dx, dz = x - origin[0], z - origin[1]
        across = dx * across_unit[0] + dz * across_unit[1]
        along = dx * along_unit[0] + dz * along_unit[1]
        across = across + 140.0 * np.sin(along / 1900.0 + index) + 50.0 * np.sin(along / 610.0 + 2.0 * index)
        reach = spacing + width * 1.6
        near = np.abs(across) < reach + 200.0
        if not near.any():
            continue
        crest = np.clip(1.0 - np.abs(np.abs(across) - spacing) / width, 0.0, 1.0) ** 1.5
        trough = np.clip(1.0 - np.abs(across) / spacing, 0.0, 1.0) ** 2
        ends = smoothstep(half_length, half_length * 0.7, np.abs(along))
        rise = ridge_height * (0.72 + 0.5 * value_noise(along / 1100.0, index * 3.1, 5 + index)) * ends
        profile = crest + 0.35 * trough * (1.0 - crest)
        height = height + rise * profile * (0.35 + 0.65 * upland)
        if with_stain:
            flank = smoothstep(spacing + width * 2.2, spacing + width * 0.9, np.abs(across)) * (1.0 - 0.6 * crest) * ends
            stain = np.maximum(stain, 0.85 * flank)
    chaos_dx, chaos_dz = x - CHAOS_CENTRE[0], z - CHAOS_CENTRE[1]
    inside = smoothstep(CHAOS['radius'], CHAOS['radius'] * 0.65, np.hypot(chaos_dx, chaos_dz) + 300.0 * (value_noise(x / 800.0, z / 800.0, 9) - 0.5))
    whiteness = np.zeros_like(x) if with_stain else None
    where = inside > 0
    if where.any():
        cell = CHAOS['cell']
        px, pz = x[where] / cell, z[where] / cell
        cx, cz = np.floor(px).astype(np.int64), np.floor(pz).astype(np.int64)
        first = np.full(px.shape, 1e9)
        second = np.full(px.shape, 1e9)
        nearest_x, nearest_z = np.zeros(px.shape, np.int64), np.zeros(px.shape, np.int64)
        for ox in (-1, 0, 1):
            for oz in (-1, 0, 1):
                gx, gz = cx + ox, cz + oz
                sx = gx + 0.15 + 0.7 * lattice(gx, gz, 21)
                sz = gz + 0.15 + 0.7 * lattice(gx, gz, 22)
                gap = np.hypot(px - sx, pz - sz)
                closer = gap < first
                second = np.where(closer, first, np.minimum(second, gap))
                nearest_x = np.where(closer, gx, nearest_x)
                nearest_z = np.where(closer, gz, nearest_z)
                first = np.where(closer, gap, first)
        low, high = CHAOS['heights']
        top = low + (high - low) * lattice(nearest_x, nearest_z, 23) ** 1.5
        tilt_x = 0.25 * (lattice(nearest_x, nearest_z, 24) - 0.5) * cell
        tilt_z = 0.25 * (lattice(nearest_x, nearest_z, 25) - 0.5) * cell
        plate = top + tilt_x * (px - nearest_x - 0.5) + tilt_z * (pz - nearest_z - 0.5)
        edge = (second - first) * cell
        standing = smoothstep(18.0, 70.0, edge)
        matrix = CHAOS['matrix'] * (0.6 + 0.8 * value_noise(px * 3.0, pz * 3.0, 26))
        chaos_height = matrix + (plate - matrix) * standing
        share = inside[where]
        height[where] = height[where] + share * chaos_height
        if with_stain:
            stain[where] = np.maximum(stain[where], share * 0.75 * (1.0 - standing))
            whiteness[where] = share * standing
    if with_stain:
        for (origin, along_unit, across_unit), width, index in LINEA_LINES:
            dx, dz = x - origin[0], z - origin[1]
            along = dx * along_unit[0] + dz * along_unit[1]
            across = dx * across_unit[0] + dz * across_unit[1] + 90.0 * np.sin(along / 1300.0 + index * 1.7)
            stain = np.maximum(stain, 0.7 * smoothstep(width, width * 0.3, np.abs(across)))
        stain = np.clip(stain * (0.75 + 0.5 * fbm(x / 300.0, z / 300.0, 2, 30)), 0.0, 1.0)
        return height, stain, whiteness
    return height


# The sun's disc is a tenth of a degree across, under a 2k pixel: it is set in the middle of one (SUN_PLACE), so the
# 2k panorama holds it in that pixel alone and tools/sky-probe.mjs measures all its light as the sun's.
SUN_PLACE = ((round(SUN['azimuth'] / 360 * WIDTH / DOWN - 0.5) + 0.5) * 360 / (WIDTH / DOWN),
             90 - (round((90 - SUN['elevation']) / 180 * HEIGHT / DOWN - 0.5) + 0.5) * 180 / (HEIGHT / DOWN))
SUN_DIRECTION = direction(*SUN_PLACE)
SUN_LIGHT = np.array(SUN['colour']) * SUN['irradiance']


def march(dx, dz, tan_elevation):
    """Each ray's distance (horizontal, m) to the ground, or inf where it meets none: from the eye EYE m up, the
    ground falling away by the moon's curvature, stepping by what the gap allows (no slope is steeper than 1.6)."""
    count = dx.size
    hit = np.full(count, np.inf)
    t = np.full(count, 250.0)
    previous = t.copy()
    active = np.arange(count)
    for _ in range(4000):
        if active.size == 0:
            break
        ta = t[active]
        ray_height = EYE + ta * tan_elevation[active] + ta * ta / (2 * MOON_RADIUS)
        ground = terrain(dx[active] * ta, dz[active] * ta)
        under = ray_height <= ground
        if under.any():
            lower, upper = previous[active[under]], ta[under]
            ray_dx, ray_dz, ray_tan = dx[active[under]], dz[active[under]], tan_elevation[active[under]]
            for _ in range(10):
                middle = 0.5 * (lower + upper)
                below = EYE + middle * ray_tan + middle * middle / (2 * MOON_RADIUS) <= terrain(ray_dx * middle, ray_dz * middle)
                upper = np.where(below, middle, upper)
                lower = np.where(below, lower, middle)
            hit[active[under]] = upper
        gap = ray_height - ground
        rising = tan_elevation[active] + ta / MOON_RADIUS > 0
        gone = (rising & (ray_height > HIGHEST)) | (ta > 90e3)
        keep = ~under & ~gone
        step = np.clip(gap / 1.6, 1.5, 15.0 + 0.02 * ta)
        previous[active] = ta
        t[active] = ta + step
        active = active[keep]
    return hit


def shade(x, z, t):
    """The ground's radiance at (x, z), seen from `t` m off: its albedo lit by the sun (where no ground stands
    between) and by the sunlit ground about it."""
    eps = np.maximum(1.0, 0.0015 * t)
    height, stain, whiteness = terrain(x, z, with_stain=True)
    slope_x = (terrain(x + eps, z) - terrain(x - eps, z)) / (2 * eps)
    slope_z = (terrain(x, z + eps) - terrain(x, z - eps)) / (2 * eps)
    normal = np.stack([-slope_x, np.ones_like(x), -slope_z], -1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    sunlit = np.clip(normal @ SUN_DIRECTION, 0.0, None)
    # Shadows: march toward the sun until clear of everything.
    lit = np.ones_like(x)
    candidates = np.flatnonzero(sunlit > 0)
    s = np.full(candidates.size, 2.0)
    base_height = height[candidates] + 0.3
    horizontal = math.hypot(SUN_DIRECTION[0], SUN_DIRECTION[2])
    rise = SUN_DIRECTION[1] / horizontal
    sx, sz = SUN_DIRECTION[0] / horizontal, SUN_DIRECTION[2] / horizontal
    active = np.arange(candidates.size)
    for _ in range(400):
        if active.size == 0:
            break
        along = s[active]
        index = candidates[active]
        ray_height = base_height[active] + along * rise
        ground = terrain(x[index] + sx * along, z[index] + sz * along)
        blocked = ground > ray_height
        lit[index[blocked]] = 0.0
        done = blocked | (ray_height > HIGHEST)
        s[active] = along + np.clip((ray_height - ground) / 1.6, 1.0, 40.0)
        active = active[~done]
    albedo = ICE * (1 - stain[:, None]) + STAIN * stain[:, None]
    albedo = albedo * (0.94 + 0.12 * fbm(x / 60.0, z / 60.0, 2, 40))[:, None]
    albedo = albedo + (ICE * 1.04 - albedo) * (0.5 * whiteness)[:, None]
    # The sunlit ice about a face lights it from below: its radiance times the share of the face's view that is ground.
    ground_radiance = ICE.mean() * SUN_LIGHT * SUN_DIRECTION[1] / math.pi
    light = SUN_LIGHT[None, :] * (sunlit * lit)[:, None] / math.pi + ground_radiance[None, :] * (0.5 * (1.0 - normal[:, 1]))[:, None]
    return albedo * light


def floor_radiance(x, z):
    """The basin's refrozen floor, below BAND (the scene's water hides it): level ice in the sun."""
    albedo = PLAIN[None, :] * (0.9 + 0.2 * fbm(x / 40.0, z / 40.0, 2, 50))[:, None]
    return albedo * SUN_LIGHT[None, :] * SUN_DIRECTION[1] / math.pi


# Jupiter's frame.
J_CENTRE = direction(AHEAD + JUPITER['bearing'], JUPITER['elevation'])
J_SINE = math.sin(math.radians(JUPITER['radius']))
_up = np.array([0.0, 1.0, 0.0]) - J_CENTRE * J_CENTRE[1]
_up /= np.linalg.norm(_up)
_right = np.cross(_up, J_CENTRE)   # toward the right as the eye looks at it
_right /= np.linalg.norm(_right)
_tilt = math.radians(JUPITER['tilt'])
J_AXIS = math.cos(_tilt) * _up + math.sin(_tilt) * _right
J_PRIME = -J_CENTRE - np.dot(-J_CENTRE, J_AXIS) * J_AXIS   # longitude 0: the meridian facing the eye
J_PRIME /= np.linalg.norm(J_PRIME)
J_EAST = np.cross(J_AXIS, J_PRIME)
BAND_LATITUDES = np.array([band[0] for band in BANDS], float)
BAND_COLOURS = np.array([band[1] for band in BANDS], float)


def jupiter(directions, pixel_angle):
    """Jupiter's radiance along each direction and how much of the pixel it covers (0 to 1)."""
    cosine = directions @ J_CENTRE
    angle = np.arccos(np.clip(cosine, -1.0, 1.0))
    radius = math.radians(JUPITER['radius'])
    cover = np.clip((radius - angle) / pixel_angle + 0.5, 0.0, 1.0)
    radiance = np.zeros(directions.shape)
    on = np.flatnonzero(cover > 0)
    if on.size == 0:
        return radiance, cover
    d = directions[on]
    # The ray's nearest point to the centre when it misses by a hair (the limb's pixels): taken onto the sphere.
    b = d @ J_CENTRE
    disc = np.maximum(b * b - (1.0 - J_SINE * J_SINE), 0.0)
    point = d * (b - np.sqrt(disc))[:, None]
    normal = point - J_CENTRE
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    latitude = np.degrees(np.arcsin(np.clip(normal @ J_AXIS, -1, 1)))
    longitude = np.degrees(np.arctan2(normal @ J_EAST, normal @ J_PRIME)) + JUPITER['longitude']
    # The bands, their edges stirred into eddies and festoons, and streaked along the jets.
    wobble = 1.6 * (fbm(longitude / 9.0, latitude / 2.2, 4, 60) - 0.5) + 0.6 * (fbm(longitude / 2.5, latitude / 0.8, 3, 61) - 0.5)
    stirred = latitude + wobble * (1.0 - smoothstep(55, 75, np.abs(latitude)))
    colour = np.stack([np.interp(stirred, BAND_LATITUDES, BAND_COLOURS[:, channel]) for channel in range(3)], -1)
    streaks = 1.0 + 0.10 * (fbm(longitude / 3.0, latitude * 1.6, 3, 62) - 0.5) + 0.05 * (value_noise(longitude / 0.7, latitude * 4.0, 63) - 0.5)
    colour = colour * streaks[:, None]
    # White ovals along the southern temperate belt, and the Great Red Spot in its hollow.
    spot_latitude, spot_longitude = JUPITER['spot']
    spot = ((longitude - spot_longitude) / SPOT['size'][0]) ** 2 + ((latitude - spot_latitude) / SPOT['size'][1]) ** 2
    hollow = smoothstep(2.6, 1.3, spot) * (1.0 - smoothstep(1.0, 0.75, spot))
    colour = colour * (1 - 0.25 * hollow[:, None]) + 0.25 * hollow[:, None] * np.array([0.86, 0.80, 0.70])
    red = smoothstep(1.0, 0.55, spot) * (0.85 + 0.3 * value_noise(longitude / 1.5, latitude / 1.5, 64))
    colour = colour + (np.array(SPOT['colour']) - colour) * red[:, None]
    for oval_longitude in (-35.0, -10.0, 60.0):
        oval = ((longitude - oval_longitude) / 3.0) ** 2 + ((latitude + 33.5) / 1.6) ** 2
        colour = colour + (np.array([0.88, 0.85, 0.78]) - colour) * smoothstep(1.0, 0.4, oval)[:, None]
    # Lit as a cloud deck is (Minnaert's law, k 0.85): softly darkened to the limb and the terminator.
    incidence = normal @ SUN_DIRECTION
    emergence = np.clip(-(normal * d).sum(-1), 0.05, 1.0)
    lit = np.clip(incidence, 0, None) ** 0.85 * emergence ** -0.15 * smoothstep(-0.03, 0.06, incidence)
    radiance[on] = colour * lit[:, None] * SUN_LIGHT / math.pi
    return radiance, cover


def milky_way(directions):
    pole = direction(AHEAD + MILKY_WAY['pole'][0], MILKY_WAY['pole'][1])
    latitude = np.degrees(np.arcsin(np.clip(directions @ pole, -1, 1)))
    reference = np.cross(pole, [0.0, 1.0, 0.0])
    reference /= np.linalg.norm(reference)
    other = np.cross(pole, reference)
    longitude = np.degrees(np.arctan2(directions @ other, directions @ reference))
    band = np.exp(-(latitude / MILKY_WAY['width']) ** 2)
    clouds = fbm(longitude / 6.0, latitude / 3.0, 4, 70)
    lanes = smoothstep(0.55, 0.75, fbm(longitude / 4.0, latitude / 1.6, 3, 71)) * np.exp(-(latitude / 3.5) ** 2)
    brightness = band * (0.35 + 1.3 * clouds) * (1.0 - 0.75 * lanes) * (1.0 + 1.5 * np.exp(-((longitude - 20.0) / 35.0) ** 2))
    tint = np.array([1.0, 0.95, 0.88])
    return MILKY_WAY['radiance'] * brightness[:, None] * tint


def sun_glare(directions):
    angle = np.arccos(np.clip(directions @ SUN_DIRECTION, -1, 1))
    reach = math.radians(HALO_REACH)
    glare = SUN['irradiance'] * HALO / np.maximum(angle, math.radians(SUN['radius']) * 1.5) ** 2
    glare = glare * smoothstep(reach, reach * 0.3, angle)
    return glare[:, None] * np.array(SUN['colour'])


def star_field():
    """The stars: a direction, a light (in the sun's units of irradiance) and a colour each, seeded."""
    stars = np.random.default_rng(SEED + 1)
    z = stars.uniform(-1, 1, STARS)
    phi = stars.uniform(0, 2 * math.pi, STARS)
    ring = np.sqrt(1 - z * z)
    directions = np.stack([ring * np.cos(phi), z, ring * np.sin(phi)], -1)
    # As many stars as the sky has, each magnitude about 2.8 times as many as the one brighter (log10 N ∝ 0.45 m).
    magnitude = STAR_FAINTEST + np.log10(stars.uniform(1e-9, 1, STARS)) / 0.45
    light = STAR_ZERO * 10 ** (-0.4 * np.maximum(magnitude, -1.5))
    warmth = stars.beta(2, 3, STARS)
    colour = np.stack([0.80 + 0.25 * warmth, 0.86 + 0.08 * warmth, 1.0 - 0.38 * warmth], -1)
    colour /= (colour @ np.array([0.2126, 0.7152, 0.0722]))[:, None]
    return directions, light[:, None] * colour


def pixel_directions(rows, columns, width, height):
    elevation = math.pi / 2 - (rows + 0.5) / height * math.pi
    phi = 2 * math.pi * ((columns + 0.5) / width - 0.5)
    return np.stack([np.cos(elevation) * np.cos(phi), np.sin(elevation) * np.ones_like(phi), np.cos(elevation) * np.sin(phi)], -1)


def pixel_solid_angle(row, width, height):
    return (2 * math.pi / width) * (math.pi / height) * math.cos(math.pi / 2 - (row + 0.5) / height * math.pi)


def render():
    """The 8k panorama, row block by row block: the ground in BAND, the floor below it, and above the sky."""
    image = np.zeros((HEIGHT, WIDTH, 3), np.float32)
    pixel_angle = 2 * math.pi / WIDTH
    star_directions, star_light = star_field()
    # The stars and the sun's disc, splatted onto a layer of their own: each its light over its pixels' solid angle.
    points = np.zeros((HEIGHT, WIDTH, 3), np.float32)
    elevation = np.arcsin(np.clip(star_directions[:, 1], -1, 1))
    u = (np.arctan2(star_directions[:, 2], star_directions[:, 0]) / (2 * math.pi) + 0.5) * WIDTH - 0.5
    v = (math.pi / 2 - elevation) / math.pi * HEIGHT - 0.5
    for index in range(len(u)):
        column0, row0 = math.floor(u[index]), math.floor(v[index])
        fu, fv = u[index] - column0, v[index] - row0
        for oc, orow, weight in ((0, 0, (1 - fu) * (1 - fv)), (1, 0, fu * (1 - fv)), (0, 1, (1 - fu) * fv), (1, 1, fu * fv)):
            row = min(max(row0 + orow, 0), HEIGHT - 1)
            points[row, (column0 + oc) % WIDTH] += star_light[index] * weight / pixel_solid_angle(row, WIDTH, HEIGHT)
    # The sun's disc, 16 x 16 samples a pixel about it.
    sun_u = (math.atan2(SUN_DIRECTION[2], SUN_DIRECTION[0]) / (2 * math.pi) + 0.5) * WIDTH
    sun_v = (math.pi / 2 - math.asin(SUN_DIRECTION[1])) / math.pi * HEIGHT
    sun_radius = math.radians(SUN['radius'])
    disc_radiance = np.array(SUN['colour']) * SUN['irradiance'] / (math.pi * sun_radius ** 2)
    for row in range(int(sun_v) - 4, int(sun_v) + 5):
        for column in range(int(sun_u) - 4, int(sun_u) + 5):
            offsets = (np.arange(16) + 0.5) / 16
            sub_rows, sub_columns = np.meshgrid(row + offsets - 0.5, column + offsets - 0.5, indexing='ij')
            sub = pixel_directions(sub_rows.ravel(), sub_columns.ravel(), WIDTH, HEIGHT)
            inside = np.arccos(np.clip(sub @ SUN_DIRECTION, -1, 1)) < sun_radius
            points[row, column % WIDTH] += disc_radiance * inside.mean()
    band_top = int(math.floor((90 - BAND[1]) / 180 * HEIGHT))
    band_bottom = int(math.ceil((90 - BAND[0]) / 180 * HEIGHT))
    columns = np.arange(WIDTH)
    for start in range(0, HEIGHT, 128):
        rows = np.arange(start, min(start + 128, HEIGHT))
        grid_rows, grid_columns = np.meshgrid(rows, columns, indexing='ij')
        directions = pixel_directions(grid_rows.ravel().astype(float), grid_columns.ravel().astype(float), WIDTH, HEIGHT)
        sky = milky_way(directions) + sun_glare(directions) + points[rows].reshape(-1, 3)
        radiance, cover = jupiter(directions, pixel_angle)
        sky = sky * (1 - cover[:, None]) + radiance * cover[:, None]
        image[rows] = sky.reshape(len(rows), WIDTH, 3)
    # Below the band, the floor (hidden by the scene's water).
    rows = np.arange(band_bottom, HEIGHT)
    grid_rows, grid_columns = np.meshgrid(rows, columns, indexing='ij')
    directions = pixel_directions(grid_rows.ravel().astype(float), grid_columns.ravel().astype(float), WIDTH, HEIGHT)
    reach = EYE / np.maximum(-directions[:, 1], 1e-3)
    image[rows] = floor_radiance(directions[:, 0] * reach, directions[:, 2] * reach).reshape(len(rows), WIDTH, 3)
    # The band: one ray a pixel, then four more at the ground's edges.
    rows = np.arange(band_top, band_bottom)
    started = time.time()
    centre = trace(rows[:, None] + np.zeros((1, WIDTH)), np.zeros((len(rows), 1)) + columns[None, :])
    distance, colour = centre
    hits = np.isfinite(distance)
    near = np.where(hits, distance, 1e9)
    edges = np.zeros_like(hits)
    for axis in (0, 1):
        for shift in (-1, 1):
            other_hits = np.roll(hits, shift, axis)
            other = np.roll(near, shift, axis)
            edges |= (other_hits != hits) | (hits & other_hits & (np.abs(other - near) > 0.08 * np.minimum(other, near)))
    edges[0, :] = edges[-1, :] = False
    sky = image[rows]
    composite = np.where(hits[..., None], colour, sky)
    edge_rows, edge_columns = np.nonzero(edges)
    print(f'ground: {hits.sum()} of {hits.size} pixels, {edges.sum()} at its edges ({time.time() - started:.0f} s)')
    if edge_rows.size:
        total = np.zeros((edge_rows.size, 3))
        for offset_row, offset_column in ((-0.375, -0.125), (-0.125, 0.375), (0.125, -0.375), (0.375, 0.125)):
            sub_distance, sub_colour = trace(edge_rows + rows[0] + offset_row, edge_columns + offset_column)
            total += np.where(np.isfinite(sub_distance)[:, None], sub_colour, sky[edge_rows, edge_columns])
        composite[edge_rows, edge_columns] = (composite[edge_rows, edge_columns] + total) / 5
    image[rows] = composite
    print(f'band done ({time.time() - started:.0f} s)')
    return image


def trace(rows, columns):
    """The ground's distance and radiance for each pixel position (fractional rows and columns of the 8k)."""
    shape = np.shape(rows)
    rows, columns = np.ravel(rows).astype(float), np.ravel(columns).astype(float)
    directions = pixel_directions(rows, columns, WIDTH, HEIGHT)
    horizontal = np.hypot(directions[:, 0], directions[:, 2])
    dx, dz = directions[:, 0] / horizontal, directions[:, 2] / horizontal
    tan_elevation = directions[:, 1] / horizontal
    distance = np.full(rows.size, np.inf)
    colour = np.zeros((rows.size, 3))
    # Rays that reach the basin's floor before its rim need no march.
    floor = EYE / np.maximum(-tan_elevation, 1e-9)
    on_floor = (tan_elevation < 0) & (floor < BASIN['rim'] - BASIN['wobble'] - 50)
    distance[on_floor] = floor[on_floor]
    colour[on_floor] = floor_radiance(dx[on_floor] * floor[on_floor], dz[on_floor] * floor[on_floor])
    rest = np.flatnonzero(~on_floor)
    for chunk in np.array_split(rest, max(1, rest.size // 400000)):
        hit = march(dx[chunk], dz[chunk], tan_elevation[chunk])
        found = np.isfinite(hit)
        distance[chunk] = hit
        index = chunk[found]
        colour[index] = shade(dx[index] * hit[found], dz[index] * hit[found], hit[found])
    return distance.reshape(shape), colour.reshape(shape + (3,))


def write_hdr(path, image):
    """Radiance RGBE, new-style run-length scanlines (as tools/mall-backdrop.py writes them)."""
    height, width = image.shape[:2]
    brightest = image.max(-1)
    mantissa, exponent = np.frexp(brightest)
    scale = np.where(brightest > 1e-32, mantissa * 256.0 / np.maximum(brightest, 1e-32), 0.0)
    rgbe = np.zeros((height, width, 4), np.uint8)
    rgbe[..., :3] = np.clip(image * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(brightest > 1e-32, exponent + 128, 0).astype(np.uint8)
    chunks = [f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {height} +X {width}\n'.encode()]
    header = bytes([2, 2, width >> 8, width & 255])
    for row in range(height):
        chunks.append(header)
        for channel in range(4):
            chunks.append(encode_run_length(rgbe[row, :, channel]))
    with open(path, 'wb') as file:
        file.write(b''.join(chunks))


def encode_run_length(line):
    out = bytearray()
    starts = np.flatnonzero(np.diff(np.concatenate(([-1], line.astype(np.int16)))) != 0)
    lengths = np.diff(np.concatenate((starts, [len(line)])))
    literal = []

    def flush():
        while literal:
            piece = literal[:128]
            del literal[:128]
            out.append(len(piece))
            out.extend(piece)
    for start, length in zip(starts, lengths):
        value = int(line[start])
        if length >= 4:
            flush()
            while length > 0:
                piece = min(length, 127)
                out.append(128 + piece)
                out.append(value)
                length -= piece
        else:
            literal.extend([value] * int(length))
    flush()
    return bytes(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--preview', help='write a tone-mapped PNG of the 2k panorama here')
    parser.add_argument('--draft', action='store_true', help='render the 2k alone, one ray a pixel, for a quick look (writes only the preview)')
    arguments = parser.parse_args()
    if arguments.draft and not arguments.preview:
        parser.error('--draft writes only the preview: give --preview=file.png')
    started = time.time()
    if arguments.draft:
        global WIDTH, HEIGHT, DOWN
        WIDTH, HEIGHT, DOWN = 2048, 1024, 1
    image = render()
    if arguments.draft:
        preview(image, arguments.preview)
        return
    small = image.reshape(HEIGHT // DOWN, DOWN, WIDTH // DOWN, DOWN, 3).mean(axis=(1, 3))
    write_hdr(os.path.join(SKY, 'europa_8k.hdr'), image)
    write_hdr(os.path.join(SKY, 'europa_2k.hdr'), small)
    print(f'wrote europa_8k.hdr and europa_2k.hdr ({time.time() - started:.0f} s)')
    if arguments.preview:
        preview(small, arguments.preview)


def preview(image, path):
    from PIL import Image
    mapped = image * 2.0 / (1 + image * 2.0)
    Image.fromarray((np.clip(mapped, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(path)


if __name__ == '__main__':
    main()
