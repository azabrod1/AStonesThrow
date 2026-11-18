"""Europa's sky (src/sky.js `europa`, the place src/places.js PLACES `europa`): a panorama computed from spacecraft images.

No one has stood on Europa, so its sky is put together from what spacecraft have seen of it and of Jupiter, all of it
public domain (SOURCES; credited in CREDITS.md and credits.html):

- The ground is Conamara Chaos as Galileo saw it on its twelfth orbit (December 1997) at 9 m a pixel: the
  observation mosaic 12ESCHAOS_01 of USGS's photogrammetrically controlled Galileo mosaics (Bland et al. 2021). The
  eye stands EYE metres up on a moon of Europa's radius (its horizon 2.2 km off; relief beyond it rises over the
  skyline), in a refrozen hollow (`BASIN`, where the scene's own pond lies) among the chaos: a double ridge to the
  right, rafted plates with their ridged tops and cliffs, the darker matrix between. Its relief is the image's own,
  by photoclinometry (`relief`: a slope along the image's sun for each pixel's brightness, integrated in Fourier
  space, the drifts that albedo would build filtered out; its height set by TAN_INCIDENCE so the plates and the
  ridge stand up to some 230 m, as Conamara's do), so the shading the image holds and the shape it is drawn on
  agree. The image is laid on the ground turned so that its sun (from the east, IMAGE_SUN degrees to the north) is
  the scene's sun; its brightness is the ground's light and shade below LIGHT_SCALE pixels, and above it the relief
  is lit by the scene's sun, shadows and all (`lighting`); tinted by its albedo from frost white to the
  reddish-brown of the matrix and lineae (Galileo's clear filter has no colour). Under its 9 m pixels stand crags
  (`CRAGS`: ridged noise up to some 40 m, in fields between smoother plains, none in the hollow), which the 9 m pixels
  would hide, sunlit and shaded by their own slope; a face too steep to hold frost (`STEEP`) is bare ice, blue (`BARE`:
  NASA's colour images show the purest ice white and blue), and the shade is lit by the sunlit ice about it (`FILL`),
  blue off ice onto ice, the only light in an airless shadow. Under the crags a fractal frost (`MICRO`) carries the
  shading down to a few centimetres. Where the mosaic has no data
  (between and around its frames) each column of it is reflected into its data, and past its edges it repeats as a
  mirror does, so the ground runs on to the skyline without seams. The ground is drawn a column of the panorama at a
  time, marched outward from the eye (`render_ground`): each step's ground covers the rows between the highest so far
  and its own, by exactly how much of each it covers, so near and far, slope and silhouette are anti-aliased.
- Jupiter is Cassini's map of it (PIA07782, eleven days of December 2000) on an oblate globe (`JUPITER`: 12.2
  degrees across its equator, 11.4 pole to pole, as from Europa), its equator through its middle as from a moon in
  its plane, the Great Red Spot turned toward the eye; lit by the same sun (so as gibbous as the sun's place makes
  it, its night side black against the stars), darkened to its limb as a cloud deck is (Minnaert's law).
- The sky is black: stars (a seeded field down to magnitude STAR_FAINTEST, each in one pixel of the 8k), the Milky
  Way, and the Sun small (5.2 au: a disc 0.1 degrees across) and white.

The frame: the file's columns run as tools/sky-probe.mjs says (azimuth 360·u from the left edge, turning right).
The sun stands at SUN `azimuth`, the scene's ahead SUN_AZIMUTH to its left (src/sky.js `europa` turns the panorama
so the sun stands sunAzimuth degrees right of ahead: change both); every other bearing below is degrees right of
ahead. The brightness is the scene's: src/sky.js scales a panorama so its sun is the scene's sun, so only ratios
matter here: Jupiter and the ice are what their albedo makes them under that sun; the stars and the Milky Way are
far brighter than they would be against sunlit ice (no eye adapted to the ice would see them), drawn as a film
draws them.

It renders the 8k panorama (8192 x 4096: the horizon strip's source, tools/sky-encode.mjs, never committed:
assets/sky/europa_8k.hdr, gitignored) and the 2k one the dome draws (assets/sky/europa_2k.hdr), the 8k's 4 x 4
means. Its sources are downloaded once into tools/.europa-sources/ (gitignored; the Conamara mosaic is one member
of USGS's 1.5 GB zip, fetched by its byte range) and checked against their SHA-256. Deterministic: the same files
every run. Then, as for any sky:

  python3 tools/europa-sky.py
  node tools/sky-probe.mjs assets/sky/europa_2k.hdr
  node tools/sky-encode.mjs assets/sky/europa_2k.hdr --verify

About five or six minutes (--draft: the 2k alone, one ray a column, in about one); needs numpy and Pillow.
--preview=file.png writes a tone-mapped look at the 2k panorama. Over its black sky the encoder's relative error
reads near 100%: it measures nothing there.
"""
import argparse
import hashlib
import math
import os
import struct
import time
import urllib.request
import zlib

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKY = os.path.join(ROOT, 'assets', 'sky')
SOURCE_DIR = os.path.join(ROOT, 'tools', '.europa-sources')
USER_AGENT = 'a-stones-throw-sky-tool/1.0 (one-off download of public-domain maps)'
SEED = 5
WIDTH, HEIGHT, DOWN = 8192, 4096, 4    # the 8k panorama, and the 2k's 4 x 4 means of it

# The public-domain images it is made from: where each comes from and the SHA-256 of the file it keeps.
SOURCES = {
    # Cassini ISS, NASA/JPL/Space Science Institute: PIA07782, Cassini's best maps of Jupiter (cylindrical), 3601 x 1801,
    # as Wikimedia renders it at its standard 3840 px (3840 x 1921): Wikimedia turns automated clients away from originals
    # (HTTP 429) and asks them for its standard sizes. Its disc is some 280 pixels of the 8k: the map is ample either way.
    'jupiter': {'file': 'PIA07782_3840px.jpg',
                'url': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Jupiter_Cylindrical_Map_-_Dec_2000_PIA07782.jpg/3840px-Jupiter_Cylindrical_Map_-_Dec_2000_PIA07782.jpg',
                'sha256': 'ca4e6c0b5b86ea5d2b849820654139922230d8a0877c20c5273628198cae2898'},
    # Galileo SSI, NASA/JPL; mosaic USGS Astrogeology (Bland et al. 2021, doi:10.5066/P9VKKK7C): observation 12ESCHAOS_01,
    # Conamara Chaos at 9 m a pixel, float32 equirectangular GeoTIFF, one member of the zip (its local header's offset and
    # compressed size).
    'conamara': {'file': '12ESCHAOS_01_GalileoSSI_Equi-cog.tif',
                 'url': 'https://planetarymaps.usgs.gov/mosaic/Europa/Europa_mosaics/Europa_Mosaics_Equirectangular.zip',
                 'member': (67617322, 26253307),
                 'sha256': '9b0936d0b0d38dfc58ef883d1359ae335d43e486de98ad1dad88774bad6786d8'},
}

EYE = 1.5                  # metres over the ice
MOON_RADIUS = 1560.8e3     # Europa's, metres: the horizon of an eye EYE up is 2.2 km off
SUN = {'azimuth': 200.0, 'elevation': 25.0, 'irradiance': 6.0, 'radius': 0.051, 'colour': (1.0, 0.98, 0.95)}
SUN_AZIMUTH = 110.0        # src/sky.js `europa` sunAzimuth: the sun this many degrees right of ahead
HALO = 2e-5                # the sun's glare, L = E·HALO/θ² (θ in radians) out to HALO_REACH degrees: the eye's, not an air's
HALO_REACH = 12.0
AHEAD = SUN['azimuth'] - SUN_AZIMUTH

# Jupiter: its centre (bearing, elevation, degrees), its angular radii (equatorial and polar, degrees: 71 492 and
# 66 854 km at 671 100 km), its axis's tilt from the sky's vertical (degrees, toward the left), and the map's column (degrees
# from its left edge) at the meridian facing the eye: the Great Red Spot (134 there) 28 degrees right of it.
JUPITER = {'bearing': -10.0, 'elevation': 11.0, 'radius': 6.095, 'polar': 5.70, 'tilt': 20.0, 'meridian': 106.0,
           'albedo': 0.52, 'minnaert': 0.85}

STARS = 14000              # drawn down to magnitude STAR_FAINTEST
STAR_FAINTEST = 7.0
STAR_ZERO = 2.4e-6         # a magnitude-0 star's light (irradiance, in the sun's units)
MILKY_WAY = {'pole': (40.0, 35.0), 'width': 11.0, 'radiance': 0.0025}   # its pole (bearing, elevation), half width (degrees)

# The ground. The mosaic's pixel (m), its latitude (its x pixels are cos(latitude) of that across the ground), and
# where in it the eye stands (column, row).
PIXEL = 9.0
LATITUDE = 9.14
EYE_AT = (2041.0, 1056.0)
IMAGE_SUN = 5.0            # degrees north of east the mosaic's sun stands (its brightness spectrum's axis; shadows fall west)
TAN_INCIDENCE = 0.8        # its sun's slant, as photoclinometry takes it: sets the relief's height (plates up to ~230 m)
RELIEF_REACH = 5000.0      # m: relief longer than this is filtered out (the brightness's slow drifts are albedo)
CONTRAST = 0.8             # the image's light and shade, softened for the scene's higher sun (the image's sun is lower)
LIGHT_SCALE = 6            # pixels: finer, the image's light and shade; coarser, the relief's under the scene's sun
ICE = np.array([0.78, 0.80, 0.82])      # albedo (linear RGB): Europa's frost, a cool white (NASA: white and blue are the purest ice)
BARE = np.array([0.34, 0.60, 0.84])     # bare ice where a face is too steep to hold frost: blue, as a glacier's is
STAIN = np.array([0.52, 0.38, 0.27])    # the reddish-brown of the matrix and lineae
STEEP = (0.35, 1.0)        # slopes (rise over run) from which frost gives way to bare ice, and by which it is bare
FILL = {'share': 0.24, 'colour': np.array([0.62, 0.80, 1.0])}   # the light the sunlit ice round about throws into the shade
# (no air to light it: only the ice's own, a share of level ice's light; coloured by the ice it comes off, and again by
# the ice it falls on, so the shade is blue, as on a glacier)
# Crags over the chaos's relief, under its 9 m pixels: ridged noise, (wavelength, amplitude) m, each octave's crests the
# sharper where the coarser's are (a ridged multifractal), in fields (CRAG_FIELD m across) between smoother plains, from
# the hollow's rim outward. Its 9 m pixels hide whatever stands under them; this is what ice under a sun and in vacuum
# makes of its relief: Hobley et al. 2018 (Nature Geoscience) predict blades of ice some 15 m tall (penitentes) at
# Europa's low latitudes, Conamara's among them.
CRAGS = [(260.0, 38.0), (100.0, 17.0), (40.0, 7.5), (16.0, 3.0), (6.5, 1.4)]
CRAG_FIELD = 900.0
BASIN = {'flat': 160.0, 'rise': 520.0}  # the refrozen hollow about the eye: level to `flat` m, the chaos's own relief by `rise`
MICRO = [(7.0, 0.55), (3.1, 0.26), (1.4, 0.12), (0.62, 0.05), (0.27, 0.022)]   # frost under the image's pixels: (wavelength, amplitude) m
MICRO_REACH = 3000.0       # m: past this the frost is under a pixel
REACH = 90e3               # m: the march stops here, or once nothing farther could stand over what it has drawn
SUB = 2                    # rays across each 8k column
LOWEST = -35.0             # degrees: the march starts where the ground is this far below level; below, the hollow's floor
HIGHEST_DRAWN = 30.0       # degrees: the ground is drawn up to here (the hill toward the sun reaches 15)


def download(name):
    """The source's file, fetched once into SOURCE_DIR and checked against its SHA-256."""
    source = SOURCES[name]
    path = os.path.join(SOURCE_DIR, source['file'])
    if not os.path.exists(path):
        os.makedirs(SOURCE_DIR, exist_ok=True)
        print(f'downloading {source["url"]}' + (' (one member, by its byte range)' if 'member' in source else ''))
        headers = {'User-Agent': USER_AGENT}
        if 'member' in source:
            offset, size = source['member']
            headers['Range'] = f'bytes={offset}-{offset + 30 + 1024 + size - 1}'
        for attempt in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(source['url'], headers=headers), timeout=600) as response:
                    data = response.read()
                break
            except urllib.error.HTTPError as error:
                if error.code != 429 or attempt == 4:
                    raise
                time.sleep(30 * (attempt + 1))   # Wikimedia asks clients to back off
        if 'member' in source:
            if data[:4] != b'PK\x03\x04':
                raise SystemExit(f'{name}: no zip member at its offset (has the archive changed?)')
            method, = struct.unpack('<H', data[8:10])
            name_length, extra_length = struct.unpack('<HH', data[26:30])
            body = data[30 + name_length + extra_length:][:source['member'][1]]
            data = zlib.decompress(body, -15) if method == 8 else body
        with open(path + '.part', 'wb') as file:
            file.write(data)
        os.replace(path + '.part', path)
    with open(path, 'rb') as file:
        digest = hashlib.sha256(file.read()).hexdigest()
    if digest != source['sha256']:
        raise SystemExit(f'{path}: SHA-256 {digest}, not {source["sha256"]}: delete it to fetch it again')
    return path


def direction(azimuth, elevation):
    """A unit vector in the panorama's frame (tools/sky-probe.mjs: phi = 2π(u − ½), u = azimuth/360)."""
    phi = math.radians(azimuth) - math.pi
    elevation = math.radians(elevation)
    return np.array([math.cos(elevation) * math.cos(phi), math.sin(elevation), math.cos(elevation) * math.sin(phi)])


def smoothstep(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def blur(image, radius):
    """Three box passes each way (near enough a Gaussian of σ ≈ radius), edges held."""
    image = image.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0)] * image.ndim
            pad[axis] = (radius + 1, radius)
            summed = np.cumsum(np.pad(image, pad, mode='edge'), axis=axis)
            upper = np.take(summed, np.arange(2 * radius + 1, summed.shape[axis]), axis=axis)
            lower = np.take(summed, np.arange(0, summed.shape[axis] - 2 * radius - 1), axis=axis)
            image = (upper - lower) / (2 * radius + 1)
    return image.astype(np.float32)


# The Sun. Its disc is a tenth of a degree across, under a 2k pixel: it is set in the middle of one (SUN_PLACE), so the
# 2k panorama holds it in that pixel alone and tools/sky-probe.mjs measures all its light as the sun's.
SUN_PLACE = ((round(SUN['azimuth'] / 360 * WIDTH / DOWN - 0.5) + 0.5) * 360 / (WIDTH / DOWN),
             90 - (round((90 - SUN['elevation']) / 180 * HEIGHT / DOWN - 0.5) + 0.5) * 180 / (HEIGHT / DOWN))
SUN_DIRECTION = direction(*SUN_PLACE)
SUN_LIGHT = np.array(SUN['colour']) * SUN['irradiance']


# ---------------------------------------------------------------------------------------------------------------
# The ground: Conamara Chaos.

def load_ground():
    """The mosaic, its gaps filled; its relief (m); its brightness over its mean; its albedo's tint (0 frost to 1 stain)."""
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    data = np.array(Image.open(download('conamara')), np.float32)
    valid = np.isfinite(data) & (data > -1e30)
    rows, columns = data.shape
    # The seams between frames (a few pixels): normalised convolution.
    filled = np.where(valid, data, 0)
    for radius in (2, 4, 8):
        weight = blur(valid.astype(np.float32), radius)
        hole = ~valid & (weight > 0.35)
        filled = np.where(hole, blur(filled, radius) / np.maximum(weight, 1e-6), filled)
        valid |= hole
    # Round the frames: each column's run of data reflected, back and forth, over the rest of the column.
    has = valid.any(0)
    first = np.where(has, valid.argmax(0), 0)
    last = np.where(has, rows - 1 - valid[::-1].argmax(0), rows - 1)
    span = np.maximum(last - first, 1)
    offset = np.mod(np.arange(rows)[:, None] - first[None, :], 2 * span[None, :])
    source = first[None, :] + np.where(offset > span[None, :], 2 * span[None, :] - offset, offset)
    filled = np.where(valid, filled, filled[source, np.arange(columns)[None, :]])
    filled = np.where(has[None, :], filled, np.median(filled))
    local = blur(filled, 110)                     # a kilometre's mean: what its shading averages to
    heights = relief(filled / local)
    # Its light and shade: the image's own below LIGHT_SCALE pixels (its sun is the scene's), and above it the relief's
    # under the scene's sun, shadows and all (the image's is too faint for the relief photoclinometry makes of it).
    near = blur(filled, LIGHT_SCALE)
    brightness = (filled / near) ** CONTRAST * np.sqrt(near / np.median(filled)) * lighting(blur(heights, LIGHT_SCALE // 2))
    albedo = blur(filled, 12) / np.median(local)  # a hundred metres' mean: the albedo, its shading averaged out
    stain = 0.75 * smoothstep(1.0, 0.68, albedo)   # the darker matrix and lineae: frost all but hides some of it
    return heights, brightness.astype(np.float32), stain.astype(np.float32)


def lighting(heights):
    """The relief's light under the scene's sun over level ground's (Lambert's), and its shadows: the sun stands
    IMAGE_SUN north of the mosaic's east, so near enough along its rows, and a pixel is in shadow where any east of it
    on its row stands over the line to the sun."""
    across = PIXEL * math.cos(math.radians(LATITUDE))
    rise = SUN_DIRECTION[1]
    level = math.sqrt(1 - rise * rise)
    toward = np.array([level * math.cos(math.radians(IMAGE_SUN)), level * math.sin(math.radians(IMAGE_SUN)), rise])  # east, north, up
    east = np.gradient(heights, axis=1) / across
    north = -np.gradient(heights, axis=0) / PIXEL
    lambert = np.clip((-east * toward[0] - north * toward[1] + toward[2]) / np.sqrt(1 + east * east + north * north), 0, None) / rise
    climb = heights - np.arange(heights.shape[1])[None, :] * across * rise / level   # the height less the sun's line's
    beyond = np.maximum.accumulate(climb[:, ::-1], axis=1)[:, ::-1]
    beyond = np.concatenate([beyond[:, 1:], np.full((heights.shape[0], 1), -np.inf)], axis=1)
    lit = smoothstep(4.0, -2.0, beyond - climb)
    return lambert * (0.06 + 0.94 * lit)


def relief(shading):
    """Photoclinometry: under a low sun from +x a face's brightness over its surroundings' is 1 − tan(i)·(its slope
    toward the sun), so each pixel gives a slope; integrated along x in Fourier space (least squares, with a little
    smoothness across, which holds the rows together), relief longer than RELIEF_REACH filtered out."""
    rows, columns = shading.shape
    slope = (1.0 - shading) / TAN_INCIDENCE
    along = np.fft.rfftfreq(columns)[None, :] * 2 * np.pi
    across = np.fft.fftfreq(rows)[:, None] * 2 * np.pi
    spectrum = np.fft.rfft2(slope)
    denominator = along ** 2 + 0.15 * across ** 2
    denominator[0, 0] = 1.0
    heights = spectrum * (-1j * along) / denominator * PIXEL
    cut = 2 * np.pi * PIXEL / RELIEF_REACH
    squared = along ** 2 + across ** 2
    heights *= squared / (squared + cut ** 2)
    heights[0, 0] = 0
    return np.fft.irfft2(heights, s=(rows, columns)).astype(np.float32)


class Ground:
    """The ground about the eye: its height (m, the eye's ground at 0) and radiance at (x, z), panorama metres."""

    def __init__(self):
        self.heights, self.brightness, self.stain = load_ground()
        self.rows, self.columns = self.heights.shape
        # The image's east and north on the ground: its sun (IMAGE_SUN north of east) on the scene's.
        sun = math.atan2(SUN_DIRECTION[2], SUN_DIRECTION[0])
        east = sun + math.radians(IMAGE_SUN)
        north = east - math.pi / 2       # turning right is clockwise from above: north is a right angle left of east
        self.east = (math.cos(east), math.sin(east))
        self.north = (math.cos(north), math.sin(north))
        self.across = PIXEL * math.cos(math.radians(LATITUDE))
        level = self.sample(self.heights, *self._pixel(np.zeros(1), np.zeros(1)), cubic=True)[0]
        self.heights -= level
        self.highest = float(self.heights.max()) + 2.0 + sum(amplitude for _, amplitude in CRAGS)

    def _pixel(self, x, z):
        column = EYE_AT[0] + (x * self.east[0] + z * self.east[1]) / self.across
        row = EYE_AT[1] - (x * self.north[0] + z * self.north[1]) / PIXEL
        return column, row

    def _mirror(self, index, size):
        index = np.mod(index, 2 * size)
        return np.where(index >= size, 2 * size - 1 - index, index)

    def sample(self, grid, column, row, cubic=False):
        """`grid` at fractional pixels, mirrored past its edges: bilinear, or a cubic B-spline (smooth to its slope)."""
        base_column, base_row = np.floor(column), np.floor(row)
        fc, fr = column - base_column, row - base_row
        base_column, base_row = base_column.astype(np.int64), base_row.astype(np.int64)
        if not cubic:
            c0, c1 = self._mirror(base_column, self.columns), self._mirror(base_column + 1, self.columns)
            r0, r1 = self._mirror(base_row, self.rows), self._mirror(base_row + 1, self.rows)
            top = grid[r0, c0] * (1 - fc) + grid[r0, c1] * fc
            bottom = grid[r1, c0] * (1 - fc) + grid[r1, c1] * fc
            return top * (1 - fr) + bottom * fr

        def weights(f):
            return ((1 - f) ** 3 / 6, (3 * f ** 3 - 6 * f ** 2 + 4) / 6, (-3 * f ** 3 + 3 * f ** 2 + 3 * f + 1) / 6, f ** 3 / 6)
        column_weights, row_weights = weights(fc), weights(fr)
        total = 0.0
        for j in range(4):
            r = self._mirror(base_row + j - 1, self.rows)
            line = 0.0
            for i in range(4):
                line = line + grid[r, self._mirror(base_column + i - 1, self.columns)] * column_weights[i]
            total = total + line * row_weights[j]
        return total

    def height(self, x, z, distance):
        """The ground's height: the chaos's relief, level in the hollow about the eye, and the frost on it near."""
        column, row = self._pixel(x, z)
        height = self.sample(self.heights, column, row, cubic=True)
        height = height * smoothstep(BASIN['flat'], BASIN['rise'], np.hypot(x, z)) + self.crags(x, z, distance)
        near = distance < MICRO_REACH
        if near.any():
            height[near] += self.frost(x[near], z[near], distance[near])
        return height

    def chaos(self, x, z):
        """The chaos's relief alone (m), level in the hollow (smooth to its slope: a cubic B-spline)."""
        return self.sample(self.heights, *self._pixel(x, z), cubic=True) * smoothstep(BASIN['flat'], BASIN['rise'], np.hypot(x, z))

    def crags(self, x, z, distance):
        """The crags (CRAGS, m), each octave fading out as it falls under a pixel; none in the hollow."""
        reach = np.hypot(x, z)
        where = smoothstep(BASIN['flat'], BASIN['rise'] * 1.4, reach) * (0.25 + 0.75 * smoothstep(-0.3, 0.3, noise(x, z, CRAG_FIELD, 40)))
        pixel = distance * 2 * math.pi / (WIDTH * SUB)
        total = np.zeros_like(x)
        sharp = np.ones_like(x)
        for octave, (wavelength, amplitude) in enumerate(CRAGS):
            fade = np.clip(wavelength / np.maximum(pixel, 1e-6) / 3.0 - 1.0, 0.0, 1.0)
            crest = (1.0 - np.abs(noise(x, z, wavelength, 20 + octave))) ** 4
            total += amplitude * fade * sharp * (crest - 0.2)
            sharp = 0.35 + 0.9 * crest
        return total * where

    def frost(self, x, z, distance, gradient=False):
        """The frost's fractal relief (m), each octave fading out as it falls under a pixel; with `gradient`, its slope
        toward the sun instead."""
        total = np.zeros_like(x)
        pixel = distance * 2 * math.pi / (WIDTH * SUB)
        for octave, (wavelength, amplitude) in enumerate(MICRO):
            fade = np.clip(wavelength / np.maximum(pixel, 1e-6) / 3.0 - 1.0, 0.0, 1.0)
            if not fade.any():
                continue
            if gradient:
                step = wavelength * 0.15
                value = (noise(x + SUN_DIRECTION[0] * step, z + SUN_DIRECTION[2] * step, wavelength, octave)
                         - noise(x - SUN_DIRECTION[0] * step, z - SUN_DIRECTION[2] * step, wavelength, octave)) / (2 * step)
            else:
                value = noise(x, z, wavelength, octave)
            total += amplitude * fade * value
        return total

    def radiance(self, x, z, distance):
        """The ground's radiance: the image's light and shade under the scene's sun, tinted by its albedo, and the frost's."""
        column, row = self._pixel(x, z)
        brightness = self.sample(self.brightness, column, row)
        stain = self.sample(self.stain, column, row)
        # The crags' light and slope: the ground's normal with and without them, by differences a pixel or more across.
        step = np.maximum(distance * 2 * math.pi / (WIDTH * SUB), 1.5)
        def slope(height):
            return ((height(x + step, z) - height(x - step, z)) / (2 * step), (height(x, z + step) - height(x, z - step)) / (2 * step))
        base_x, base_z = slope(self.chaos)
        crag_x, crag_z = slope(lambda at_x, at_z: self.crags(at_x, at_z, distance))
        def lambert(along_x, along_z):
            return (-along_x * SUN_DIRECTION[0] + SUN_DIRECTION[1] - along_z * SUN_DIRECTION[2]) / np.sqrt(1 + along_x ** 2 + along_z ** 2)
        whole_x, whole_z = base_x + crag_x, base_z + crag_z
        lit = lambert(whole_x, whole_z)
        crag_light = np.clip(np.maximum(lit, 0) / np.maximum(lambert(base_x, base_z), 0.05), 0.0, 2.5)
        bare = smoothstep(STEEP[0], STEEP[1], np.hypot(whole_x, whole_z))
        frosted = ICE[None, :] * (1 - stain[:, None]) + STAIN[None, :] * stain[:, None]
        albedo = frosted * (1 - bare[:, None]) + BARE[None, :] * bare[:, None]
        # Fresh frost about the eye (the hollow refrozen): its shading lightened toward level ice.
        hollow = smoothstep(BASIN['flat'] * 1.2, BASIN['flat'] * 0.5, np.hypot(x, z))
        brightness = (brightness + (1.0 - brightness) * 0.6 * hollow) * crag_light
        horizontal = math.hypot(SUN_DIRECTION[0], SUN_DIRECTION[2])
        frost = np.ones_like(x)
        near = distance < MICRO_REACH
        if near.any():
            slope = self.frost(x[near], z[near], distance[near], gradient=True) / horizontal
            frost[near] = np.clip(1.0 + slope * horizontal / SUN_DIRECTION[1], 0.15, 2.2)
        light = brightness * frost
        facing_up = 1 / np.sqrt(1 + whole_x ** 2 + whole_z ** 2)
        fill = FILL['share'] * (0.55 + 0.45 * facing_up)
        return albedo * (light[:, None] + fill[:, None] * FILL['colour'][None, :] * albedo) * SUN_LIGHT[None, :] * SUN_DIRECTION[1] / math.pi


def noise(x, z, wavelength, salt):
    """Smooth value noise from −1 to 1 at `wavelength` m, its lattice turned so octaves do not line up."""
    angle = 0.7 + salt * 1.3
    u = (x * math.cos(angle) - z * math.sin(angle)) / wavelength + salt * 17.3
    v = (x * math.sin(angle) + z * math.cos(angle)) / wavelength - salt * 9.1
    iu, iv = np.floor(u), np.floor(v)
    fu, fv = u - iu, v - iv
    iu, iv = iu.astype(np.int64), iv.astype(np.int64)
    fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)

    def lattice(a, b):
        return LATTICE[(PERMUTATION[(a + salt * 59) & 1023] + b * 7 + salt * 131) & 1023]
    top = lattice(iu, iv) + (lattice(iu + 1, iv) - lattice(iu, iv)) * fu
    bottom = lattice(iu, iv + 1) + (lattice(iu + 1, iv + 1) - lattice(iu, iv + 1)) * fu
    return top + (bottom - top) * fv


PERMUTATION = np.random.default_rng(SEED).permutation(1024).astype(np.int64)   # the noise's hash
LATTICE = np.random.default_rng(SEED + 2).uniform(-1, 1, 1024)                 # and its values


def render_ground(ground, top_row, bottom_row):
    """The ground over rows top_row..bottom_row of the 8k: (colour sums, coverage), marched a column at a time.

    Each of SUB rays across a column steps outward from where the ground lies LOWEST degrees down; each step's ground
    is at an elevation (its height less the eye's and the moon's curvature) and covers the rows between it and the
    highest drawn so far, each by the share of it that span covers, so the column fills from the bottom up with the
    nearest ground first and every row's colour is the mean of what lies in it."""
    rows = bottom_row - top_row
    colour = np.zeros((rows * WIDTH, 3), np.float64)
    cover = np.zeros(rows * WIDTH, np.float64)
    count = WIDTH * SUB
    column = (np.arange(count) + 0.5) / SUB                     # fractional 8k columns
    phi = 2 * math.pi * (column / WIDTH - 0.5)
    dx, dz = np.cos(phi), np.sin(phi)
    pixel_column = np.floor(column).astype(np.int64)

    def row_of(elevation):
        return (math.pi / 2 - elevation) / math.pi * HEIGHT

    t = np.full(count, EYE / math.tan(math.radians(-LOWEST)))
    highest = np.full(count, row_of(math.radians(LOWEST)))      # the row (fractional) the column is filled up to
    active = np.arange(count)
    started = time.time()
    steps = 0
    while active.size:
        steps += 1
        distance = t[active]
        x, z = dx[active] * distance, dz[active] * distance
        height = ground.height(x, z, distance)
        elevation = np.arctan2(height - EYE - distance * distance / (2 * MOON_RADIUS), distance)
        row = row_of(elevation)
        seen = row < highest[active]
        if seen.any():
            index = active[seen]
            upper, lower = row[seen], highest[index]
            radiance = ground.radiance(x[seen], z[seen], distance[seen])
            first = np.floor(upper).astype(np.int64)
            last = np.ceil(lower).astype(np.int64) - 1
            spans = last - first + 1
            which = np.repeat(np.arange(index.size), spans)
            offsets = np.arange(which.size) - np.repeat(np.cumsum(spans) - spans, spans)
            pixel_row = first[which] + offsets
            share = np.minimum(lower[which], pixel_row + 1) - np.maximum(upper[which], pixel_row)
            inside = (pixel_row >= top_row) & (pixel_row < bottom_row) & (share > 0)
            flat = (pixel_row[inside] - top_row) * WIDTH + pixel_column[index][which[inside]]
            weight = share[inside] / SUB
            np.add.at(cover, flat, weight)
            for channel in range(3):
                np.add.at(colour[:, channel], flat, radiance[which[inside], channel] * weight)
            highest[index] = upper
        # Done: past REACH, or the drawn edge stands over anything the ground beyond could raise.
        reach = t[active]
        ceiling = np.arctan2(ground.highest - EYE - reach * reach / (2 * MOON_RADIUS), reach)
        done = (reach > REACH) | (row_of(ceiling) > highest[active])
        t[active] = reach + np.maximum(0.25, reach * 0.0012)
        active = active[~done]
        if steps % 1000 == 0:
            print(f'  ground: step {steps}, {active.size} rays marching ({time.time() - started:.0f} s)')
    print(f'ground: {steps} steps ({time.time() - started:.0f} s)')
    return colour.reshape(rows, WIDTH, 3), cover.reshape(rows, WIDTH)


# ---------------------------------------------------------------------------------------------------------------
# Jupiter.

J_CENTRE = direction(AHEAD + JUPITER['bearing'], JUPITER['elevation'])
_up = np.array([0.0, 1.0, 0.0]) - J_CENTRE * J_CENTRE[1]
_up /= np.linalg.norm(_up)
_left = np.cross(_up, J_CENTRE)
_left /= np.linalg.norm(_left)
_tilt = math.radians(JUPITER['tilt'])
J_AXIS = math.cos(_tilt) * _up + math.sin(_tilt) * _left
J_PRIME = -J_CENTRE - np.dot(-J_CENTRE, J_AXIS) * J_AXIS   # the meridian facing the eye
J_PRIME /= np.linalg.norm(J_PRIME)
J_EAST = np.cross(J_AXIS, J_PRIME)                         # toward the eye's right across the disc
J_EQUATOR = math.sin(math.radians(JUPITER['radius']))      # its radii, at a distance of 1
J_POLE = J_EQUATOR * math.sin(math.radians(JUPITER['polar'])) / math.sin(math.radians(JUPITER['radius']))


def load_jupiter():
    """Cassini's map in linear light, its mean scaled to Jupiter's albedo."""
    from PIL import Image
    picture = np.asarray(Image.open(download('jupiter')).convert('RGB'), np.float32) / 255.0
    linear = np.where(picture <= 0.04045, picture / 12.92, ((picture + 0.055) / 1.055) ** 2.4)
    return linear * (JUPITER['albedo'] / linear.mean())


def jupiter(directions, jupiter_map):
    """Jupiter's radiance along each direction, and whether the ray meets it."""
    # In Jupiter's frame (east, axis, toward the eye), its axis squeezed so the spheroid is a sphere of J_EQUATOR.
    squeeze = J_EQUATOR / J_POLE
    frame = np.stack([J_EAST, J_AXIS * squeeze, J_PRIME])
    origin = frame @ (-J_CENTRE)
    ray = directions @ frame.T
    a = (ray * ray).sum(-1)
    b = ray @ origin
    c = origin @ origin - J_EQUATOR ** 2
    disc = b * b - a * c
    hit = disc > 0
    radiance = np.zeros(directions.shape)
    if not hit.any():
        return radiance, hit
    t = (-b[hit] - np.sqrt(disc[hit])) / a[hit]
    point = origin[None, :] + ray[hit] * t[:, None]          # on the sphere, in squeezed coordinates
    # The spheroid's normal, back in the panorama's frame (planetographic: the normal's own latitude).
    east, axial, toward = point[:, 0], point[:, 1] / squeeze, point[:, 2]
    normal_local = np.stack([east, axial * squeeze * squeeze, toward], -1)
    normal_local /= np.linalg.norm(normal_local, axis=-1, keepdims=True)
    normal = normal_local[:, 0:1] * J_EAST + normal_local[:, 1:2] * J_AXIS + normal_local[:, 2:3] * J_PRIME
    latitude = np.arcsin(np.clip(normal_local[:, 1], -1, 1))
    longitude = np.arctan2(normal_local[:, 0], normal_local[:, 2])        # east of the meridian facing the eye
    rows, columns = jupiter_map.shape[:2]
    u = (JUPITER['meridian'] / 360.0 + longitude / (2 * math.pi)) % 1.0 * (columns - 1)
    v = (0.5 - latitude / math.pi) * (rows - 1)
    u0, v0 = np.floor(u).astype(np.int64), np.clip(np.floor(v).astype(np.int64), 0, rows - 2)
    fu, fv = (u - u0)[:, None], np.clip(v - v0, 0, 1)[:, None]
    u1 = (u0 + 1) % columns
    colour = ((jupiter_map[v0, u0] * (1 - fu) + jupiter_map[v0, u1] * fu) * (1 - fv)
              + (jupiter_map[v0 + 1, u0] * (1 - fu) + jupiter_map[v0 + 1, u1] * fu) * fv)
    # Lit as a cloud deck is (Minnaert's law): darkened to the limb and softly to the terminator.
    incidence = normal @ SUN_DIRECTION
    emergence = np.clip(-(normal * directions[hit]).sum(-1), 0.02, 1.0)
    k = JUPITER['minnaert']
    lit = np.clip(incidence, 0, None) ** k * emergence ** (k - 1) * smoothstep(-0.02, 0.05, incidence)
    radiance[hit] = colour * lit[:, None] * SUN_LIGHT / math.pi
    return radiance, hit


# ---------------------------------------------------------------------------------------------------------------
# The sky.

def milky_way(directions):
    pole = direction(AHEAD + MILKY_WAY['pole'][0], MILKY_WAY['pole'][1])
    latitude = np.degrees(np.arcsin(np.clip(directions @ pole, -1, 1)))
    reference = np.cross(pole, [0.0, 1.0, 0.0])
    reference /= np.linalg.norm(reference)
    other = np.cross(pole, reference)
    longitude = np.degrees(np.arctan2(directions @ other, directions @ reference))
    band = np.exp(-(latitude / MILKY_WAY['width']) ** 2)
    clouds = 0.5 + 0.5 * fbm(longitude / 6.0, latitude / 3.0, 4, 70)
    lanes = smoothstep(0.1, 0.5, fbm(longitude / 4.0, latitude / 1.6, 3, 71)) * np.exp(-(latitude / 3.5) ** 2)
    brightness = band * (0.35 + 1.3 * clouds) * (1.0 - 0.75 * lanes) * (1.0 + 1.5 * np.exp(-((longitude - 20.0) / 35.0) ** 2))
    return MILKY_WAY['radiance'] * brightness[:, None] * np.array([1.0, 0.95, 0.88])


def fbm(u, v, octaves, salt):
    """Fractal value noise, −1 to 1-ish, over unit wavelengths of u and v."""
    total, amplitude, scale = 0.0, 0.5, 1.0
    for octave in range(octaves):
        total = total + amplitude * noise(u * scale, v * scale, 1.0, salt + octave)
        amplitude *= 0.5
        scale *= 2.03
    return total


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
    return (2 * math.pi / width) * (math.pi / height) * np.cos(math.pi / 2 - (row + 0.5) / height * math.pi)


def render_sky():
    """The sky alone, the whole 8k: the Milky Way, the sun's glare and disc, the stars, and Jupiter."""
    image = np.zeros((HEIGHT, WIDTH, 3), np.float32)
    # The stars, each its light over its own pixel's solid angle: one 8k pixel, crisp in the strip.
    star_directions, star_light = star_field()
    elevation = np.arcsin(np.clip(star_directions[:, 1], -1, 1))
    column = np.floor((np.arctan2(star_directions[:, 2], star_directions[:, 0]) / (2 * math.pi) + 0.5) * WIDTH).astype(np.int64) % WIDTH
    row = np.clip(np.floor((math.pi / 2 - elevation) / math.pi * HEIGHT).astype(np.int64), 0, HEIGHT - 1)
    points = np.zeros((HEIGHT, WIDTH, 3), np.float32)
    np.add.at(points, (row, column), (star_light / pixel_solid_angle(row, WIDTH, HEIGHT)[:, None]).astype(np.float32))
    # The sun's disc, 16 x 16 samples a pixel about it.
    sun_u = (math.atan2(SUN_DIRECTION[2], SUN_DIRECTION[0]) / (2 * math.pi) + 0.5) * WIDTH
    sun_v = (math.pi / 2 - math.asin(SUN_DIRECTION[1])) / math.pi * HEIGHT
    sun_radius = math.radians(SUN['radius'])
    disc_radiance = np.array(SUN['colour']) * SUN['irradiance'] / (math.pi * sun_radius ** 2)
    offsets = (np.arange(16) + 0.5) / 16
    for sun_row in range(int(sun_v) - 4, int(sun_v) + 5):
        for sun_column in range(int(sun_u) - 4, int(sun_u) + 5):
            sub_rows, sub_columns = np.meshgrid(sun_row + offsets - 0.5, sun_column + offsets - 0.5, indexing='ij')
            sub = pixel_directions(sub_rows.ravel(), sub_columns.ravel(), WIDTH, HEIGHT)
            inside = np.arccos(np.clip(sub @ SUN_DIRECTION, -1, 1)) < sun_radius
            points[sun_row, sun_column % WIDTH] = 0
            points[sun_row, sun_column % WIDTH] += disc_radiance * inside.mean()
    columns = np.arange(WIDTH)
    for start in range(0, HEIGHT, 128):
        rows = np.arange(start, min(start + 128, HEIGHT))
        grid_rows, grid_columns = np.meshgrid(rows, columns, indexing='ij')
        directions = pixel_directions(grid_rows.ravel().astype(float), grid_columns.ravel().astype(float), WIDTH, HEIGHT)
        sky = milky_way(directions) + sun_glare(directions) + points[rows].reshape(-1, 3)
        image[rows] = sky.reshape(len(rows), WIDTH, 3)
    # Jupiter, 4 x 4 rays a pixel over the pixels about its disc: its limb anti-aliased, its map's detail averaged.
    jupiter_map = load_jupiter()
    reach = math.radians(JUPITER['radius'] + 0.5)
    centre_row = (math.pi / 2 - math.asin(J_CENTRE[1])) / math.pi * HEIGHT
    centre_column = (math.atan2(J_CENTRE[2], J_CENTRE[0]) / (2 * math.pi) + 0.5) * WIDTH
    half = int(math.ceil(reach / (math.pi / HEIGHT) / math.cos(math.asin(J_CENTRE[1]) + reach))) + 2
    rows = np.arange(int(centre_row) - half, int(centre_row) + half)
    columns = np.arange(int(centre_column) - half, int(centre_column) + half)
    grid_rows, grid_columns = np.meshgrid(rows, columns, indexing='ij')
    total = np.zeros(grid_rows.shape + (3,))
    covered = np.zeros(grid_rows.shape)
    for sub_row in range(4):
        for sub_column in range(4):
            directions = pixel_directions(grid_rows.ravel() + (sub_row + 0.5) / 4 - 0.5,
                                          grid_columns.ravel() + (sub_column + 0.5) / 4 - 0.5, WIDTH, HEIGHT)
            radiance, hit = jupiter(directions, jupiter_map)
            total += radiance.reshape(total.shape) / 16
            covered += hit.reshape(covered.shape) / 16
    wrapped = columns % WIDTH
    behind = image[rows[:, None], wrapped[None, :]]
    image[rows[:, None], wrapped[None, :]] = behind * (1 - covered[..., None]) + total
    return image


def render():
    """The 8k panorama: the sky, and over it the ground from LOWEST degrees up, and below that the hollow's floor."""
    started = time.time()
    image = render_sky()
    print(f'sky ({time.time() - started:.0f} s)')
    ground = Ground()
    print(f'ground loaded ({time.time() - started:.0f} s)')
    top_row = int(math.floor((90 - HIGHEST_DRAWN) / 180 * HEIGHT))
    bottom_row = int(math.ceil((90 - LOWEST) / 180 * HEIGHT)) + 1
    colour, cover = render_ground(ground, top_row, bottom_row)
    if cover[0].any():
        raise SystemExit(f'the ground reaches {HIGHEST_DRAWN} degrees up, past the rows drawn: raise HIGHEST_DRAWN')
    band = image[top_row:bottom_row]
    image[top_row:bottom_row] = (colour + band * np.clip(1 - cover, 0, 1)[..., None]).astype(np.float32)
    # Below: the floor about the eye, level, seen straight.
    rows = np.arange(bottom_row, HEIGHT)
    columns = np.arange(WIDTH)
    grid_rows, grid_columns = np.meshgrid(rows, columns, indexing='ij')
    directions = pixel_directions(grid_rows.ravel().astype(float), grid_columns.ravel().astype(float), WIDTH, HEIGHT)
    reach = EYE / np.maximum(-directions[:, 1], 1e-3)
    distance = reach * np.hypot(directions[:, 0], directions[:, 2])
    floor = ground.radiance(directions[:, 0] * reach, directions[:, 2] * reach, distance)
    image[rows] = floor.reshape(len(rows), WIDTH, 3).astype(np.float32)
    print(f'panorama ({time.time() - started:.0f} s)')
    return image


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
    parser.add_argument('--draft', action='store_true', help='render the 2k alone, one ray a column, for a quick look (writes only the preview)')
    arguments = parser.parse_args()
    if arguments.draft and not arguments.preview:
        parser.error('--draft writes only the preview: give --preview=file.png')
    started = time.time()
    if arguments.draft:
        global WIDTH, HEIGHT, DOWN, SUB
        WIDTH, HEIGHT, DOWN, SUB = 2048, 1024, 1, 1
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
