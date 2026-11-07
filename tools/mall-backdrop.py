"""The Reflecting Pool's skies (src/sky.js `mall`): 360° backdrops matte-painted from flat photographs, one an hour.

No free panorama of the Lincoln Memorial Reflecting Pool from its west end exists, so this stitches one from
freely licensed photographs on Wikimedia Commons and a pure sky from Poly Haven, as a film's matte painter would:
each photograph is set where it looks from the pool's west end (its azimuth, tilt and field of view), its own sky
cut away (a matte: sky-like pixels joined to its top, and the canopy's holes), its colour matched to the hour's
reference photograph, and its land laid over one sky, so the sky has no seams and is the light the scene is lit by.
The water below the far shore is the app's (src/mallPool.js draws the coping and the lawn out to the horizon, the
water stops at the walls), so each photograph is used from its far shore (`cut`) up; below it the far
shore's row is carried down, a blur under the horizon that the encoder blurs further (tools/sky-encode.mjs).

The elms (`elms`) are our own, not a photograph's: no photograph of the pool's sides joins another without a
seam, so the land all round is planted, as a matte painter builds a forest from cards. Five single elms (`cards`,
each its photograph, the `box` its crown stands in against its own sky, down to `clear`; `keep` polygons kept whole
and `trunk` polygons kept where they are bark, less `holes`; its trunk's `base` and its crown's `top`) are cut out
against their own skies (key_elm), then planted (plant_elms): `rows` along the pool and `groves` scattered round it,
seeded (`seed`), and drawn into the panorama farthest first, each a card stood upright where it grows, facing the
eye `eye` metres up, sized by its distance (draw_elms), matched to the hour's reference photograph's own trees
(`trees` boxes; match_tree) and hazed by its air (`haze` metres, an hour's `elmHaze`). Every photograph is then an
`over` layer: the landmarks, cropped to them and joined to the elms by quilting cuts (compose_over_elms).

The photographs (tools/mall-backdrop.json `photos`, by name, with their authors and licences; CC BY-SA asks that
they be credited where the backdrop is shown). The day's: ahead, east, down the pool to the Washington Monument;
behind, the Lincoln Memorial. The other hours' own: the Monument lit by the setting sun, the pool at night, and the
Memorial floodlit after sunset. Each may name
  crop        the share of its width used (from, to): clutter at an edge left out;
  cut         its far shore, [x, y] shares of its width and height, the land above it;
  keep        boxes whose white or brightness is land, not sky (the marble, the floodlit memorial);
  solid       polygons that are land whatever their colour: a landmark traced by hand where marble meets sky;
  clean       boxes of steps and terraces whose people are taken off them (clean_rows);
  trees       boxes of its trees, which the elms are matched to when it is an hour's reference;
  paint       lines to paint out ([[x, y], ...], width as a share of the width): a pole across the trees;
  protect     spans of its width (from, to) never copied into a gap: a landmark is never seen twice;
  yield       the degrees of its sides a gap's join may take (6; less where the photograph matters most);
  blue, lum, white, hole_blue, sky_lum, sky_above   the matte's thresholds (land_matte; sky_lum for a dusk's or a
              city night's sky, lighter than its land but neither blue nor white);
  over        laid over the other layers once their gaps are filled: inside its `shape` (polygons, shares of the
              photograph: a landmark in the hour's light), or whole, joined at its sides within `seam` degrees by
              image quilting's cut where its land and theirs agree;
  hide        boxes left to the sky (a landmark another layer shows in the hour's light).
Without elms, between photographs that do not meet, the gap is filled from both sides, each side's land copied
across into its half and the two joined where their treelines best agree (fill_gaps).

The hours (`hours`, each its own Radiance file, `file`). Each lists its `layers`, a photograph by name with what the
layer changes of it, every layer matched to the hour's `reference` photograph (its first layer's unless named) in log
light, land above the shore against land above the shore (color_match: one contrast for the three channels, or each
its own, `matchContrast: channels`, which gives sunlit leaves the sunset's gold), unless it is the reference or says
`match: false`; `adjust` grades it by hand. The day's photographs are already placed, so another hour is the day's
graded to that hour's reference, its landmarks laid over in their own light: at sunset the Monument cut out of a
photograph lit by the low sun, behind the eye the Memorial floodlit; at night
the pool's own night photograph laid over the day's graded to its dark trees. A low sun's `backlight` darkens and
greys what faces the eye toward it (the trees' shaded sides; backlight); `keepHue` and `unsky` keep a canopy's gaps
and sky-tinted edges from taking a false colour in another light.

The sky: one of Poly Haven's Qwantani pure skies (CC0) an hour, turned so its sun stands `sky.sunAzimuth` (degrees
from north, clockwise) at its own height: where the true sun stood on the hour's day at the elevation the photo's
sun has (`taken`, for tools/sky-probe.mjs --taken --at), so every hour's land lies alike. Its `gain` scales it; its
`stars`, only its stars (a city's night shows few, and none of a far town's glow); its `glow`, a city's sky glow
fitted to the reference photograph's own sky (fit_glow), or at its fitted luminance times `gain` in the `color` given
(the eye sees a city's glow dimmer and greyer than a long exposure). The land's light (`light`): a phone's photograph is
display-referred, its shadows crushed and its sky near clipping, so its land is far darker against the sky than the
land in a measured HDR (Poly Haven's lake and meadow panoramas hold their land's median luminance at 0.04 to 0.1 of
Three.js's units, about a tenth of their sky). Each pixel's luminance, from sRGB to linear, is raised to `gamma`
(below 1: the shadows opened, the marble held) and scaled so the home view's land has the median `landMedian`; or the
reference photograph's sky has the median `skyMedian`, or matches the hour's sky in the same directions
(`skyMatch`), so the land keeps the photograph's own contrast against its sky (exposure_of).

Writes assets/sky/<file>_2k.hdr for each hour (the dome's photo: run tools/sky-probe.mjs, with the hour's `taken`,
and tools/sky-encode.mjs on it) and assets/sky/<file>_8k.hdr (the horizon strip's source, gitignored as Poly
Haven's are: sky-encode cuts the strip from it), and --preview a tone-mapped look at both and eight views from the
eye, an hour's in a folder of its own. --hour builds only the hours named.

    python3 tools/mall-backdrop.py [--hour=sunset,night] [--preview=shots/mall-backdrop]

The photographs are downloaded once into tools/.mall-photos/ (gitignored). Needs numpy, scipy and Pillow.
Azimuths here are degrees from north toward east (the file's left edge is north, east a quarter across), as
the Radiance file's own columns run (tools/sky-probe.mjs: azimuth 360·u, turning right).
"""
import json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, 'tools', 'mall-backdrop.json')
CACHE = os.path.join(ROOT, 'tools', '.mall-photos')
AGENT = {'User-Agent': 'AStonesThrow-mall-backdrop/1.0 (https://github.com/azabrod1/AStonesThrow)'}
WORK_WIDTH = 3000          # pixels: each photograph is worked at this width (the 8k strip's 23 a degree, and more)
BAND = (-6.0, 32.0)        # degrees: the elevations land can reach (the rest is the pure sky alone)
KEYED = {}                 # the elm cards, keyed once for every hour
SOLID_RIM = 10             # pixels: a traced edge keyed against the sky beside it this far in (land_matte)
HEDGE = 0.2                # degrees: the land at the horizon reaches this high wherever no tree stands (compose_over_elms)
CLEAN_SPAN = 0.03          # a share of the photograph's width: clean_rows's median, wider than a group of people
CLEAR_FADE = 0.03          # an elm card's crown fades out over this share of its photograph's height above its `clear` line
SUBJECT = 1e-3             # a layer's share subject to the backlight, carried as a fourth colour channel this small (so
                           # the gap fill's cuts, which weigh every channel, never notice it)


# ---- sources ------------------------------------------------------------------------------------------------

def fetch(url, path):
    if os.path.exists(path):
        return path
    for attempt in range(6):
        try:
            time.sleep(1.5)
            data = urllib.request.urlopen(urllib.request.Request(url, headers=AGENT), timeout=120).read()
            open(path, 'wb').write(data)
            return path
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            time.sleep(15 * (attempt + 1))
    raise SystemExit(f'could not fetch {url}')


def commons_file(title):
    """A Commons file's original, downloaded once."""
    name = ''.join(character if character.isalnum() or character in '._-' else '_' for character in title[5:])
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        return path
    query = urllib.parse.urlencode(dict(action='query', titles=title, prop='imageinfo', iiprop='url', format='json'))
    info = json.loads(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + query, headers=AGENT)).read())
    url = list(info['query']['pages'].values())[0]['imageinfo'][0]['url']
    return fetch(url, path)


# ---- Radiance files -----------------------------------------------------------------------------------------

def read_hdr(path):
    data = open(path, 'rb').read()
    header_end = data.index(b'\n\n') + 2
    size_end = data.index(b'\n', header_end)
    _, height, _, width = data[header_end:size_end].split()
    height, width = int(height), int(width)
    pos = size_end + 1
    out = np.zeros((height, width, 4), np.uint8)
    for row in range(height):
        assert data[pos] == 2 and data[pos + 1] == 2, 'new-style run-length scanlines only'
        pos += 4
        for channel in range(4):
            column = 0
            while column < width:
                count = data[pos]; pos += 1
                if count > 128:
                    count -= 128
                    out[row, column:column + count, channel] = data[pos]; pos += 1
                else:
                    out[row, column:column + count, channel] = np.frombuffer(data[pos:pos + count], np.uint8); pos += count
                column += count
    exponent = out[..., 3].astype(np.int32)
    scale = np.where(exponent > 0, np.ldexp(1.0, exponent - 136), 0.0)
    return out[..., :3].astype(np.float32) * scale[..., None].astype(np.float32)


def write_hdr(path, image):
    """Radiance RGBE, new-style run-length scanlines (runs of a repeated byte, literals between)."""
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
    open(path, 'wb').write(b''.join(chunks))


def encode_run_length(line):
    out = bytearray()
    starts = np.flatnonzero(np.diff(np.concatenate(([-1], line.astype(np.int16)))) != 0)
    lengths = np.diff(np.concatenate((starts, [len(line)])))
    literal = []
    def flush():
        while literal:
            piece = literal[:128]; del literal[:128]
            out.append(len(piece)); out.extend(piece)
    for start, length in zip(starts, lengths):
        value = int(line[start])
        if length >= 4:
            flush()
            while length > 0:
                piece = min(length, 127); out.append(128 + piece); out.append(value); length -= piece
        else:
            literal.extend([value] * int(length))
    flush()
    return bytes(out)


# ---- geometry -------------------------------------------------------------------------------------------------

def directions(width, height, rows=None):
    """Unit directions of an equirect's pixel centres (x east, y up, z north), azimuth 0 at the left edge (north)."""
    rows = np.arange(height) if rows is None else rows
    azimuth = (np.arange(width) + 0.5) / width * 2 * math.pi
    elevation = math.pi / 2 - (rows + 0.5) / height * math.pi
    az, el = np.meshgrid(azimuth, elevation)
    return np.stack([np.cos(el) * np.sin(az), np.sin(el), np.cos(el) * np.cos(az)], -1).astype(np.float32)


def camera(yaw, pitch, roll=0.0):
    yaw, pitch, roll = map(math.radians, (yaw, pitch, roll))
    forward = np.array([math.cos(pitch) * math.sin(yaw), math.sin(pitch), math.cos(pitch) * math.cos(yaw)])
    right0 = np.array([math.cos(yaw), 0.0, -math.sin(yaw)])
    up0 = np.cross(forward, right0)
    right = math.cos(roll) * right0 - math.sin(roll) * up0
    up = math.sin(roll) * right0 + math.cos(roll) * up0
    return right, up, forward


def bilinear(image, across, down):
    """`image` at pixel coordinates (across, down), between its four nearest pixels."""
    height, width = image.shape[:2]
    across = np.clip(across, 0, width - 1.001); down = np.clip(down, 0, height - 1.001)
    left = across.astype(np.int32); top = down.astype(np.int32)
    right_share = (across - left)[..., None]; lower_share = (down - top)[..., None]
    return (image[top, left] * (1 - right_share) * (1 - lower_share) + image[top, left + 1] * right_share * (1 - lower_share)
            + image[top + 1, left] * (1 - right_share) * lower_share + image[top + 1, left + 1] * right_share * lower_share)


def sample_sky(sky, dirs, turn):
    """The pure sky along `dirs`, turned by `turn` (a share of the circle) about the vertical."""
    height, width = sky.shape[:2]
    azimuth = np.arctan2(dirs[..., 0], dirs[..., 2])
    elevation = np.arcsin(np.clip(dirs[..., 1], -1, 1))
    across = ((azimuth / (2 * math.pi) + turn) % 1.0) * width - 0.5
    down = (0.5 - elevation / math.pi) * height - 0.5
    left = np.floor(across).astype(np.int32); right_share = (across - left)[..., None]
    down = np.clip(down, 0, height - 1.001); top = down.astype(np.int32); lower_share = (down - top)[..., None]
    left %= width; right = (left + 1) % width   # round the circle
    return (sky[top, left] * (1 - right_share) * (1 - lower_share) + sky[top, right] * right_share * (1 - lower_share)
            + sky[top + 1, left] * (1 - right_share) * lower_share + sky[top + 1, right] * right_share * lower_share)


# ---- the photographs -------------------------------------------------------------------------------------------

def srgb_to_linear(encoded):
    return np.where(encoded <= 0.04045, encoded / 12.92, ((encoded + 0.055) / 1.055) ** 2.4).astype(np.float32)


def linear_to_srgb(linear):
    linear = np.clip(linear, 0, None)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def load_photo(spec):
    image = Image.open(commons_file(spec['commons'])).convert('RGB')
    scale = WORK_WIDTH / image.width
    if scale < 1:
        image = image.resize((WORK_WIDTH, round(image.height * scale)), Image.LANCZOS)
    return np.asarray(image, np.float32) / 255


def paint_out(photo, lines):
    """Paint out thin things (a pole) along polylines: each pixel within the line's width takes the pixel just beyond it, sideways."""
    height, width = photo.shape[:2]
    for points, line_width in lines:
        half = max(2, round(line_width * width / 2))
        mask = Image.new('L', (width, height), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).line([(across * width, down * height) for across, down in points], fill=255, width=2 * half)
        mask = np.asarray(mask) > 0
        ys, xs = np.nonzero(mask)
        source = np.clip(xs + 2 * half + 2, 0, width - 1)
        photo[ys, xs] = photo[ys, source]
        blurred = ndimage.uniform_filter(photo, size=(3, 3, 1))
        edge = ndimage.binary_dilation(mask, iterations=2) & ~ndimage.binary_erosion(mask, iterations=2)
        photo[edge] = blurred[edge]
    return photo


def clean_rows(photo, boxes):
    """People taken off steps and terraces (`clean`: boxes, shares of the photograph): what runs along a step is alike
    along its row, so each pixel is compared with its row's median over CLEAN_SPAN of the width about it, and where
    it differs (a person, or their shadow) it, and a few pixels round it, take that median: the step without them.
    Never across anything upright that belongs there (a box stops short of it)."""
    height, width = photo.shape[:2]
    span = max(3, int(CLEAN_SPAN * width)) | 1
    for x0, y0, x1, y1 in boxes:
        rows, columns = slice(int(y0 * height), int(y1 * height)), slice(int(x0 * width), int(x1 * width))
        region = photo[rows, columns]
        median = ndimage.median_filter(region, size=(1, span, 1), mode='reflect')
        odd = np.abs(region - median).max(-1) > 0.07
        # Only what stands upright: a step running a little off the row differs from its median along a thin
        # line, a person in a blob several pixels tall, so the lines are opened away (a vertical element).
        upright = ndimage.binary_opening(odd, structure=np.ones((max(5, int(0.0025 * height)), 1), bool))
        odd = ndimage.binary_dilation(upright, iterations=3)
        photo[rows, columns] = np.where(odd[..., None], median, region)
    return photo


def land_matte(photo, spec):
    """Land (1) against sky (0) above the far shore (`cut`); below it land, the far shore carried down."""
    height, width = photo.shape[:2]
    ys = (np.arange(height) + 0.5) / height
    xs = (np.arange(width) + 0.5) / width
    cut = np.interp(xs, *zip(*spec['cut']))
    above = ys[:, None] < cut[None, :]
    red, green, blue_channel = photo[..., 0], photo[..., 1], photo[..., 2]
    lum = 0.2126 * red + 0.7152 * green + 0.0722 * blue_channel
    blue = blue_channel - red
    bluish = (blue > spec.get('blue', 0.05)) & (lum > spec.get('lum', 0.45))
    white = (lum > spec.get('white', 0.9)) & (np.abs(blue_channel - red) < 0.12)
    bright = lum > spec['sky_lum'] if 'sky_lum' in spec else np.zeros_like(white)   # a dusk's or a city night's sky: lighter than its land
    for x0, y0, x1, y1 in spec.get('keep', []):
        box = (slice(int(y0 * height), int(y1 * height)), slice(int(x0 * width), int(x1 * width)))
        white[box] = False
        bright[box] = False
        bluish[box] &= blue[box] > spec.get('keep_blue', 0.12)
    # Inside a `solid` polygon (a landmark traced by hand, as a compositor rotoscopes a hero element) it is land,
    # whatever its colour: pale marble is never taken for sky, nor the sky beside it for marble.
    solid = polygons_mask(spec.get('solid', []), height, width)
    skylike = (bluish | white | bright) & above & (solid < 0.5)
    labels, _ = ndimage.label(skylike)
    touching = np.unique(labels[: max(2, height // 200)])
    sky = np.isin(labels, touching[touching > 0])
    sky |= skylike & (blue > spec.get('hole_blue', 0.12))
    if 'sky_above' in spec:
        rows = int(spec['sky_above'] * height)
        sky[:rows] |= skylike[:rows]
    sky = ndimage.binary_opening(sky, iterations=1)
    land = above & ~sky
    # What floats in the sky (a kite, a bird) is not land: keep only land joined to the far shore.
    labels, _ = ndimage.label(land)
    shore_rows = np.clip((cut * height).astype(int) - 2, 0, height - 1)
    grounded = np.unique(labels[shore_rows, np.arange(width)])
    land = np.isin(labels, grounded[grounded > 0]) | ~above
    # At a traced edge, what the polygon takes of the sky in its last few pixels goes back to the sky, so no sliver of
    # sky edges the stone: each pixel there keyed against the sky just outside it (clean_plate, from the sky the
    # matte found), as much stone as it differs from that sky.
    if solid.any():
        rim = (solid > 0) & ~ndimage.binary_erosion(solid > 0.99, iterations=SOLID_RIM)
        plate = clean_plate(photo, sky & (solid == 0), shrink=2)
        differs = np.clip((np.abs(photo - plate).max(-1) - 0.03) / 0.07, 0, 1)
        solid = np.where(rim, solid * differs, solid)
    return np.maximum(np.clip(ndimage.gaussian_filter(land.astype(np.float32), 0.7), 0, 1), solid), cut


def carry_shore_down(photo, cut):
    """Below the far shore, each column takes its shore's colour (the app's water and ground cover it; the encoder blurs it)."""
    height, width = photo.shape[:2]
    rows = np.clip((cut * height).astype(int) - 3, 0, height - 1)
    shore = photo[rows, np.arange(width)]
    below = np.arange(height)[:, None] >= rows[None, :]
    return np.where(below[..., None], shore[None, :, :], photo)


def above_shore(entry):
    """A prepared photograph's land above its far shore, but for its `keep` boxes (what is matched: below the shore is
    its colour carried down, and a landmark, floodlit or marble, is not the light its trees are in)."""
    height, width = entry['matte'].shape
    land = (entry['matte'] > 0.9) & (np.arange(height)[:, None] < entry['cut'][None, :] * height)
    for x0, y0, x1, y1 in entry['spec'].get('keep', []):
        land[int(y0 * height):int(y1 * height), int(x0 * width):int(x1 * width)] = False
    return land


def trees_of(entry):
    """A photograph's trees: its land inside its `trees` boxes (what the elm cards are matched to), else all its land
    above its far shore."""
    if 'trees' not in entry['spec']:
        return above_shore(entry)
    height, width = entry['matte'].shape
    inside = np.zeros((height, width), bool)
    for x0, y0, x1, y1 in entry['spec']['trees']:
        inside[int(y0 * height):int(y1 * height), int(x0 * width):int(x1 * width)] = True
    return inside & (entry['matte'] > 0.9)


def match_tree(linear, mine, reference, theirs, tint):
    """An elm card matched to the reference photograph's trees (`theirs`): its luminance's mean and spread in log light,
    and only `tint` of the difference in hue (each channel's mean against the luminance's), so each card keeps its
    own leaves' colour rather than all being stretched to one, and no edge despilled to grey turns purple."""
    lum, reference_lum = np.log(luminance(linear) + 1e-4), np.log(luminance(reference) + 1e-4)
    ratio = reference_lum[theirs].std() / max(lum[mine].std(), 1e-6)
    matched = np.exp((lum - lum[mine].mean()) * ratio + reference_lum[theirs].mean()) - 1e-4
    out = linear * (np.maximum(matched, 0) / np.maximum(luminance(linear), 1e-6))[..., None]
    for channel in range(3):
        mine_hue = np.log(linear[..., channel] + 1e-4)[mine].mean() - lum[mine].mean()
        their_hue = np.log(reference[..., channel] + 1e-4)[theirs].mean() - reference_lum[theirs].mean()
        out[..., channel] *= math.exp(tint * (their_hue - mine_hue))
    return np.clip(out, 0, None)


def color_match(linear, land, reference, reference_land, shared=False):
    """Each channel's land matched to the reference's (both above their far shores), its mean and spread in log light
    (as an exposure and a contrast: never below black, as a match in linear light would push the shadows). `shared`:
    one contrast for all three, the luminance's, each channel keeping its own mean, so a highlight (a gap in a canopy,
    sky-coloured) keeps its hue rather than being stretched to a false one."""
    out = linear.copy()
    if shared:
        mine_lum, theirs_lum = np.log(luminance(linear) + 1e-4), np.log(luminance(reference) + 1e-4)
        ratio = theirs_lum[reference_land].std() / max(mine_lum[land].std(), 1e-6)
        for channel in range(3):
            mine, theirs = np.log(linear[..., channel] + 1e-4), np.log(reference[..., channel] + 1e-4)
            out[..., channel] = np.exp((mine - mine[land].mean()) * ratio + theirs[reference_land].mean()) - 1e-4
        return np.clip(out, 0, None)
    for channel in range(3):
        mine, theirs = np.log(linear[..., channel] + 1e-4), np.log(reference[..., channel] + 1e-4)
        mean, spread = mine[land].mean(), mine[land].std()
        target_mean, target_spread = theirs[reference_land].mean(), theirs[reference_land].std()
        out[..., channel] = np.exp((mine - mean) * (target_spread / max(spread, 1e-6)) + target_mean) - 1e-4
    return np.clip(out, 0, None)


def project(rgba, spec, dirs):
    """The photograph's channels and weight along `dirs` (weight 0 off it, feathered at its sides)."""
    ph, pw = rgba.shape[:2]
    right, up, forward = camera(spec['yaw'], spec.get('pitch', 0.0), spec.get('roll', 0.0))
    depth = dirs @ forward.astype(np.float32)
    full_width = pw / (spec.get('crop', [0, 1])[1] - spec.get('crop', [0, 1])[0])
    focal = (full_width / 2) / math.tan(math.radians(spec['hfov']) / 2)
    offset = spec.get('crop', [0, 1])[0] * full_width
    with np.errstate(divide='ignore', invalid='ignore'):
        across = full_width / 2 + focal * (dirs @ right.astype(np.float32)) / depth
        down = ph / 2 - focal * (dirs @ up.astype(np.float32)) / depth
    if spec.get('mirror'):
        across = full_width - across
    across = across - offset
    inside = (depth > 0) & (across >= 0) & (across <= pw - 1) & (down >= 0) & (down <= ph - 1)
    sampled = bilinear(rgba, np.where(inside, across, 0), np.where(inside, down, 0))
    feather = np.clip(np.minimum(across, pw - 1 - across) / (spec.get('feather', 0.02) * pw), 0, 1)
    weight = np.where(inside, feather, 0).astype(np.float32)
    return sampled, weight


def join(left_color, left_alpha, right_color, right_alpha, low, high, per_degree):
    """Where one layer gives way to the next, (rows, columns) weights of the right one: image quilting's cut (Efros and
    Freeman), the path down the overlap [low, high) along which the two layers differ least, a column's step at most
    one pixel a row, so the seam can wind round a crown's edge or run through sky both share; crossfaded over a
    quarter of a degree (a wider crossfade between unlike land is a ghost: trees half seen through)."""
    rows, width = left_alpha.shape
    low, high = max(0, low), min(width, max(high, low + 2))
    difference = np.abs(left_color[:, low:high] - right_color[:, low:high]).sum(-1) + np.abs(left_alpha[:, low:high] - right_alpha[:, low:high])
    total = difference.copy()
    for row in range(1, rows):
        above = total[row - 1]
        best = np.minimum(above, np.minimum(np.concatenate(([np.inf], above[:-1])), np.concatenate((above[1:], [np.inf]))))
        total[row] += best
    seam = np.zeros(rows)
    column = int(np.argmin(total[-1]))
    for row in range(rows - 1, -1, -1):
        seam[row] = column
        if row:
            options = [option for option in (column - 1, column, column + 1) if 0 <= option < high - low]
            column = min(options, key=lambda option: total[row - 1, option])
    seam = ndimage.uniform_filter1d(seam, 3) + low
    blend = np.clip((np.arange(width)[None, :] - seam[:, None]) / max(2.0, per_degree / 4) + 0.5, 0, 1)
    return blend * blend * (3 - 2 * blend)


def fill_gaps(color, alpha, coverage, protected, yields):
    """Each gap between the photographs (columns where they do not fully reach at the horizon, their feathered sides
    included) filled from its two sides: the land left of it copied across into its left part, the land right of it
    into its right part (more of the same trees, never a mirror's symmetry or a stretched smear), each copy taken from
    where its land best carries on the photograph's at the join, never from a `protect`ed column (a landmark is never
    seen twice). Three
    joins (join): the left photograph to its copy, in its last few degrees (its `yield`); the copies, where both are
    land to copy; the right copy to the right photograph, in its first few degrees."""
    height, circle = alpha.shape                             # circle: the panorama's columns round the circle
    per_degree = circle / 360
    covered = coverage >= 0.999
    if covered.all():
        return color, alpha, []
    shift = int(np.flatnonzero(covered)[0])                  # start the circle at a covered column
    color = np.roll(color, -shift, 1); alpha = np.roll(alpha, -shift, 1); covered = np.roll(covered, -shift)
    protected = np.roll(protected, -shift); yields = np.roll(yields, -shift)
    premultiplied = color * alpha[..., None]
    copyable = covered & ~protected
    gaps, column = [], 0
    while column < circle:
        if not covered[column]:
            start = column
            while column < circle and not covered[column]:
                column += 1
            gaps.append((start, column))
        column += 1
    def run(column, step):                                   # copyable columns from `column` outward
        count = 0
        while copyable[(column + step * count) % circle] and count < circle // 4:
            count += 1
        return count
    out_color, out_alpha = premultiplied.copy(), alpha.copy()
    slack = int(2 * per_degree)
    for start, end in gaps:
        width = end - start
        margin_left = min(int(yields[(start - 1) % circle] * per_degree), run(start - 1, -1))
        margin_right = min(int(yields[end % circle] * per_degree), run(end, 1))
        available_left, available_right = run(start - 1, -1), run(end, 1)
        # Each copy's source: of the offsets its side's land allows (together reaching across the gap, so the copies
        # meet), the one whose land best matches the photograph's where the two are joined (image quilting's choice of
        # patch), so the copy's treeline carries on the photograph's. The side with less land to copy chooses first.
        def best_reach(side, margin, available, least):
            high = max(available - margin, least + 1)
            joined = np.arange(start - margin, start) % circle if side < 0 else np.arange(end, end + margin) % circle
            here = alpha[:, joined]
            stride = max(1, int(per_degree / 4))
            errors = [np.abs(alpha[:, (joined + side * reach) % circle] - here).sum() for reach in range(least, high, stride)]
            return least + int(np.argmin(errors)) * stride
        room_left, room_right = available_left - margin_left, available_right - margin_right
        if room_left <= room_right:
            reach_left = best_reach(-1, margin_left, available_left, max(slack, width + 2 * slack - room_right))
            reach_right = best_reach(1, margin_right, available_right, max(slack, width + 2 * slack - reach_left))
        else:
            reach_right = best_reach(1, margin_right, available_right, max(slack, width + 2 * slack - room_left))
            reach_left = best_reach(-1, margin_left, available_left, max(slack, width + 2 * slack - reach_right))
        columns = np.arange(start - margin_left, end + margin_right) % circle
        span = len(columns)
        # The middle join where both copies are copyable land: left's source before the gap, right's after it.
        seam_low = max(margin_left, margin_left + width + slack - reach_right)
        seam_high = min(margin_left + width, margin_left + reach_left - slack)
        if seam_high < seam_low:
            seam_low = seam_high = margin_left + width // 2
        photo_color, photo_alpha = premultiplied[:, columns], alpha[:, columns]
        from_left = (columns - reach_left) % circle
        from_right = (columns + reach_right) % circle
        left_color, left_alpha = premultiplied[:, from_left], alpha[:, from_left]
        right_color, right_alpha = premultiplied[:, from_right], alpha[:, from_right]
        first = join(photo_color, photo_alpha, left_color, left_alpha, 0, max(margin_left, 2), per_degree)
        middle = join(left_color, left_alpha, right_color, right_alpha, seam_low, seam_high + 1, per_degree)
        last = join(right_color, right_alpha, photo_color, photo_alpha, span - max(margin_right, 2), span, per_degree)
        fill_color = left_color * (1 - middle)[..., None] + right_color * middle[..., None]
        fill_alpha = left_alpha * (1 - middle) + right_alpha * middle
        into = first * (1 - last)                             # the fill's share: after the first join, before the last
        out_color[:, columns] = photo_color * (1 - into)[..., None] + fill_color * into[..., None]
        out_alpha[:, columns] = photo_alpha * (1 - into) + fill_alpha * into
    color = out_color / np.maximum(out_alpha[..., None], 1e-6)
    found = [(((start + shift) % circle) / circle * 360, (end - start) / circle * 360) for start, end in gaps]
    return np.roll(color, shift, 1), np.roll(out_alpha, shift, 1), found


def shape_matte(spec, height, width):
    """An `over` layer's matte: its `shape` polygons (shares of the photograph), drawn at twice the size and shrunk, so
    their edges are smooth."""
    from PIL import ImageDraw
    mask = Image.new('L', (2 * width, 2 * height), 0)
    for polygon in spec['shape']:
        ImageDraw.Draw(mask).polygon([(across * 2 * width, down * 2 * height) for across, down in polygon], fill=255)
    return np.asarray(mask.resize((width, height), Image.BOX), np.float32) / 255


# ---- the elms ------------------------------------------------------------------------------------------------

def polygons_mask(polygons, height, width):
    """Polygons (shares of an image's width and height) as a mask, drawn at twice the size and shrunk: smooth edges."""
    from PIL import ImageDraw
    mask = Image.new('L', (2 * width, 2 * height), 0)
    for polygon in polygons:
        ImageDraw.Draw(mask).polygon([(across * 2 * width, down * 2 * height) for across, down in polygon], fill=255)
    return np.asarray(mask.resize((width, height), Image.BOX), np.float32) / 255


def clean_plate(color, known, shrink=8):
    """The sky behind a tree, as a keyer's clean plate: `color` where `known` (the photograph's open sky), carried in
    under the crown by normalized convolution, the finest scale that reaches a pixel giving it (worked at 1/`shrink`)."""
    height, width = known.shape
    small_height, small_width = max(1, height // shrink), max(1, width // shrink)
    shrunk = lambda image: np.asarray(Image.fromarray(image.astype(np.float32)).resize((small_width, small_height), Image.BOX))
    small_known = shrunk(known.astype(np.float32))
    small_color = np.stack([shrunk(color[..., channel] * known) for channel in range(3)], -1)
    plate = np.zeros_like(small_color)
    filled = np.zeros(small_known.shape, bool)
    for sigma in (1, 2, 4, 8, 16, 32, 64):
        weight = ndimage.gaussian_filter(small_known, sigma)
        estimate = ndimage.gaussian_filter(small_color, (sigma, sigma, 0)) / np.maximum(weight, 1e-6)[..., None]
        take = ~filled & (weight > 0.1)
        plate[take] = estimate[take]
        filled |= take
    if not filled.all():
        plate[~filled] = small_color.sum((0, 1)) / max(small_known.sum(), 1e-6)
    grown = lambda image: np.asarray(Image.fromarray(image.astype(np.float32)).resize((width, height), Image.BILINEAR))
    return np.stack([grown(plate[..., channel]) for channel in range(3)], -1)


def key_elm(spec):
    """An elm cut out of its photograph (`elms.cards`), as a compositor's keyer cuts a subject from a clean background:
    inside its `box` and above its `clear` line (the photograph's sky behind it) each pixel's share of tree is how much
    greener (green less blue) and darker it is than the sky behind it there (clean_plate); its colour is then unmixed
    from that sky (the tree's own colour, (C − (1 − α)·S)/α, in linear light), and where it is mostly sky (a leaf's
    blurred edge) it takes the colour of the solid leaves about it, so no edge keeps the photograph's blue or white.
    Inside its `keep` polygons (its trunk, and crown hanging below `clear` in front of other things) it is tree, but for
    what is bright and grey there (a white house or the sky). Returns its straight colour, its matte, where its trunk
    meets the ground (`base`, pixels) and how many pixels its height is (to `top`)."""
    photo = load_photo(spec)
    if spec.get('paint'):
        photo = paint_out(photo, spec['paint'])
    height, width = photo.shape[:2]
    downs = ((np.arange(height) + 0.5) / height)[:, None]
    acrosses = ((np.arange(width) + 0.5) / width)[None, :]
    clear = np.interp(acrosses[0], *zip(*spec['clear']))[None, :]
    above = downs < clear
    left, top, right, bottom = spec['box']
    in_box = (acrosses >= left) & (acrosses <= right) & (downs >= top) & (downs <= bottom)
    red, green, blue = photo[..., 0], photo[..., 1], photo[..., 2]
    lum = luminance(photo)
    # The sky the plate is made from: outside the box, what is sky-coloured; inside it, only the clearly blue (the
    # crown's gaps, so the plate is the sky just there).
    saturation = photo.max(-1) - photo.min(-1)
    clearly_sky = (blue - np.maximum(green, red) > 0.1) | ((saturation < 0.05) & (lum > 0.55))   # blue, or an overcast's grey
    open_sky = above & (lum > 0.3) & np.where(in_box, clearly_sky, blue >= green - 0.03)
    plate = clean_plate(photo, open_sky)
    greener = green - blue
    darker = luminance(plate) - lum
    # Cut off above `clear` along a ragged line, as leaf clumps hang (smooth noise, up to CLEAR_FADE of the
    # photograph's height above it), so the crown cut there has no straight edge.
    clumps = ndimage.gaussian_filter(np.random.default_rng(len(spec['commons'])).uniform(size=(height // 16 + 1, width // 16 + 1)), 1.5)
    clumps = (clumps - clumps.min()) / max(clumps.max() - clumps.min(), 1e-6)
    clumps = np.asarray(Image.fromarray(clumps.astype(np.float32)).resize((width, height), Image.BILINEAR))
    ragged = clear - CLEAR_FADE * clumps
    crown = np.clip(np.maximum((greener - 0.02) / 0.08, (darker - spec.get('darker', 0.05)) / 0.2), 0, 1) * in_box * np.clip((ragged - downs) * height / 3, 0, 1)
    skyish = np.clip((lum - 0.6) / 0.15, 0, 1) * np.clip((0.12 - saturation) / 0.06, 0, 1)
    kept = polygons_mask(spec.get('keep', []), height, width) * (1 - skyish)
    # A trunk's polygon keeps only bark: grey (leaves and lawn behind it are not) and darker than a wall behind it,
    # or in deep shade; the trunk then made whole (closed, its holes filled: a lit ridge of bark is still bark).
    trunk_area = polygons_mask(spec.get('trunk', []), height, width)
    bark = np.maximum(np.clip((0.14 - saturation) / 0.06, 0, 1) * np.clip((0.55 - lum) / 0.1, 0, 1), np.clip((0.15 - lum) / 0.05, 0, 1)) * trunk_area
    whole = ndimage.binary_fill_holes(ndimage.binary_closing(bark > 0.5, iterations=6)) & (trunk_area > 0.5)
    whole = ndimage.binary_opening(whole, iterations=3)
    kept = np.maximum(kept, np.maximum(bark * trunk_area, ndimage.gaussian_filter(whole.astype(np.float32), 1.0)))
    kept *= 1 - polygons_mask(spec.get('holes', []), height, width)   # what shows between its stems
    alpha = np.maximum(crown, kept).astype(np.float32)
    linear, plate_linear = srgb_to_linear(photo), srgb_to_linear(plate)
    unmixed = np.clip((linear - (1 - alpha)[..., None] * plate_linear) / np.maximum(alpha, 0.05)[..., None], 0, 1)
    solid = (alpha > 0.9).astype(np.float32)
    around = ndimage.gaussian_filter(linear * solid[..., None], (3, 3, 0)) / np.maximum(ndimage.gaussian_filter(solid, 3), 1e-6)[..., None]
    trust = np.clip((alpha - 0.35) / 0.5, 0, 1)[..., None]
    trust = np.where(ndimage.gaussian_filter(solid, 3)[..., None] > 0.02, trust * trust * (3 - 2 * trust), 1.0)
    color = around * (1 - trust) + unmixed * trust
    # Despilled, as a blue screen's subject is: no leaf is as blue as it is green, so what blue is left is the sky's.
    color[..., 2] = np.minimum(color[..., 2], 0.9 * color[..., 1])
    # Cropped to the tree, with a border of nothing.
    rows, columns = np.nonzero(alpha > 0.01)
    first_row, last_row = max(rows.min() - 4, 0), min(rows.max() + 5, height)
    first_column, last_column = max(columns.min() - 4, 0), min(columns.max() + 5, width)
    color = np.pad(color[first_row:last_row, first_column:last_column], ((2, 2), (2, 2), (0, 0)))
    alpha = np.pad(alpha[first_row:last_row, first_column:last_column], 2)
    base = (spec['base'][0] * width - first_column + 2, spec['base'][1] * height - first_row + 2)
    return {'spec': spec, 'color': color.astype(np.float32), 'alpha': alpha, 'base': base,
            'tall': (spec['base'][1] - spec['top']) * height}


def plant_elms(settings):
    """Where the elms stand (`elms`): the `rows` along the pool (each at `z` metres from its axis, north positive, from
    `from` to `to` metres east of the eye, a tree every `spacing`, each set off by up to `jitter` along the row; a
    `missing` share of places empty, a `young` share replanted, `youngHeight` tall) and the `groves` (`count` trees
    scattered `distance` metres from the eye, never on the pool and its walks or in a row's strip, nor before the
    Lincoln Memorial). Each tree: its place (x east, z north, m), height (m), card, mirrored or not, and its
    brightness. Seeded (`seed`), so every hour plants the same trees."""
    rng = np.random.default_rng(settings['seed'])
    names = sorted(settings['cards'])
    trees = []
    def tree(x, z, height):
        trees.append({'x': float(x), 'z': float(z), 'height': float(height), 'card': names[rng.integers(len(names))],
                      'mirror': bool(rng.integers(2)), 'shade': float(rng.uniform(0.85, 1.12))})
    for row in settings['rows']:
        for place in np.arange(row['from'], row['to'], row['spacing']):
            draw = rng.uniform()
            if draw < row.get('missing', 0):
                continue
            height = rng.uniform(*row['youngHeight']) if draw > 1 - row.get('young', 0) else rng.uniform(*row['height'])
            tree(place + rng.uniform(-1, 1) * row.get('jitter', 0), row['z'] + rng.uniform(-0.5, 0.5), height)
    for grove in settings['groves']:
        planted = 0
        while planted < grove['count']:
            distance = math.sqrt(rng.uniform(grove['distance'][0] ** 2, grove['distance'][1] ** 2))   # even over the area
            azimuth = rng.uniform(0, 2 * math.pi)
            x, z = distance * math.sin(azimuth), distance * math.cos(azimuth)
            along_pool = -45 < x < 650
            if (along_pool and abs(z) < 58) or (x <= -45 and abs(z) < 75):
                continue
            tree(x, z, rng.uniform(*grove['height']))
            planted += 1
    return trees


def card_levels(color, alpha):
    """A card's premultiplied colour and matte, and each halving of it (a mip chain, so a far tree is not aliased)."""
    level = np.concatenate([color * alpha[..., None], alpha[..., None]], -1).astype(np.float32)
    levels = [level]
    while min(level.shape[:2]) > 16:
        height, width = level.shape[0] // 2 * 2, level.shape[1] // 2 * 2
        level = level[:height, :width].reshape(height // 2, 2, width // 2, 2, 4).mean((1, 3))
        levels.append(level)
    return levels


def draw_elms(cards, trees, settings, dirs, rows, width, subject):
    """The elms drawn into an equirect's `rows` (directions `dirs`), farthest first, each its card stood upright where
    it grows, facing the eye: a ray's point on the card's plane, from its base, is the card's pixel (the card's pixels
    a metre, its trunk's base to its crown's top over the tree's height), read from the mip level nearest the
    panorama's own size there. Returns the land's colour (premultiplied, its fourth channel the backlight's subject),
    its matte and its haze (each tree's share of the air between it and the eye, 1 − exp(−distance/`haze`))."""
    eye, height = settings['eye'], width // 2
    elevation = math.pi / 2 - (rows + 0.5) / height * math.pi
    color = np.zeros((len(rows), width, 4), np.float32)
    alpha = np.zeros((len(rows), width), np.float32)
    haze = np.zeros((len(rows), width), np.float32)
    pano_per_metre_at_one = width / (2 * math.pi)
    for tree in sorted(trees, key=lambda tree: -math.hypot(tree['x'], tree['z'])):
        card = cards[tree['card']]
        distance = math.hypot(tree['x'], tree['z'])
        azimuth = math.atan2(tree['x'], tree['z'])
        per_metre = card['tall'] / tree['height']
        level = int(np.clip(math.floor(math.log2(max(per_metre / (pano_per_metre_at_one / distance), 1))), 0, len(card['levels']) - 1))
        image = card['levels'][level]
        card_height, card_width = card['alpha'].shape
        reach = max(card['base'][0], card_width - card['base'][0]) / per_metre
        half = math.atan2(reach, distance) * 1.05
        low, high = math.atan2(-eye - 0.5, distance), math.atan2(card['base'][1] / per_metre - eye, distance)
        chosen_rows = np.flatnonzero((elevation >= low) & (elevation <= high))
        if not len(chosen_rows):
            continue
        first = math.floor((azimuth - half) / (2 * math.pi) * width)
        columns = np.arange(first, math.ceil((azimuth + half) / (2 * math.pi) * width) + 1) % width
        rays = dirs[np.ix_(chosen_rows, columns)]
        facing = np.array([math.sin(azimuth), 0, math.cos(azimuth)], np.float32)
        right = np.array([math.cos(azimuth), 0, -math.sin(azimuth)], np.float32)
        toward = rays @ facing
        reach_along = distance / np.maximum(toward, 1e-6)
        across = reach_along * (rays @ right)
        up = reach_along * rays[..., 1] + eye
        sign = -1 if tree['mirror'] else 1
        u = (card['base'][0] + sign * across * per_metre) / 2 ** level
        v = (card['base'][1] - up * per_metre) / 2 ** level
        level_height, level_width = image.shape[:2]
        inside = (toward > 0) & (u >= 0) & (u <= level_width - 1) & (v >= 0) & (v <= level_height - 1)
        sample = bilinear(image, np.where(inside, u, 0), np.where(inside, v, 0)) * inside[..., None]
        share = sample[..., 3]
        mist = 1 - math.exp(-distance / settings['haze']) if settings['haze'] else 0.0
        region = np.ix_(chosen_rows, columns)
        keep = 1 - share
        color[region] = np.concatenate([sample[..., :3] * tree['shade'], share[..., None] * subject], -1) + color[region] * keep[..., None]
        haze[region] = share * mist + haze[region] * keep
        alpha[region] = share + alpha[region] * keep
    return color, alpha, haze


def adjust(linear, settings):
    """A layer's own grade (`adjust`): `exposure` in stops, `saturation` about its luminance, `tint` a colour to multiply."""
    out = linear * 2.0 ** settings.get('exposure', 0.0)
    if 'saturation' in settings:
        lum = luminance(out)[..., None]
        out = lum + (out - lum) * settings['saturation']
    if 'tint' in settings:
        out = out * np.array(settings['tint'], np.float32)
    return np.clip(out, 0, None)


def prepare_photo(spec):
    """A photograph loaded, painted, cropped, its land matted (or its `shape`, for an `over` layer) and made linear."""
    photo = load_photo(spec)
    if spec.get('paint'):
        photo = paint_out(photo, spec['paint'])
    if spec.get('clean'):
        photo = clean_rows(photo, spec['clean'])
    crop = spec.get('crop', [0, 1])
    if crop != [0, 1]:
        width = photo.shape[1]
        photo = photo[:, int(crop[0] * width):int(crop[1] * width)]
        recrop = lambda across: (across - crop[0]) / (crop[1] - crop[0])
        spec = {**spec, 'cut': [[(across - crop[0]) / (crop[1] - crop[0]), down] for across, down in spec['cut']],
                'keep': [[(x0 - crop[0]) / (crop[1] - crop[0]), y0, (x1 - crop[0]) / (crop[1] - crop[0]), y1] for x0, y0, x1, y1 in spec.get('keep', [])],
                'protect': [[(x0 - crop[0]) / (crop[1] - crop[0]), (x1 - crop[0]) / (crop[1] - crop[0])] for x0, x1 in spec.get('protect', [])],
                'solid': [[[recrop(across), down] for across, down in polygon] for polygon in spec.get('solid', [])]}
    matte, cut = land_matte(photo, spec)
    for x0, y0, x1, y1 in spec.get('hide', []):
        # Left to the sky (`hide`): a landmark another layer shows in this hour's light, so no edge of this one's shows.
        height, width = matte.shape
        matte[int(y0 * height):int(y1 * height), int(x0 * width):int(x1 * width)] = 0
    entry = {'spec': spec, 'photo': photo, 'linear': srgb_to_linear(carry_shore_down(photo, cut)), 'matte': matte, 'cut': cut}
    if spec.get('shape'):
        entry['shape'] = shape_matte(spec, *photo.shape[:2])
    return entry


def backlight(dirs, settings, sun_azimuth):
    """Land toward a low sun (`backlight`): what faces the eye there is the trees' shaded side, lit by the sky alone,
    so it is darkened to `factor` straight at the sun and desaturated by `desaturate`, both easing off over `width`
    degrees either side (as (1 − apart/width)^power). Applied to the composed land by its own direction, so what a gap
    copies takes the light of where it is put; a layer lit by its own lamps (a floodlit memorial) is spared
    (`backlight: false`). Returns the darkening and the desaturation."""
    azimuth = np.degrees(np.arctan2(dirs[..., 0], dirs[..., 2])) % 360
    apart = np.abs((azimuth - sun_azimuth + 180) % 360 - 180)
    toward = np.clip(1 - apart / settings['width'], 0, 1) ** settings.get('power', 2)
    return 1 - (1 - settings['factor']) * toward, settings.get('desaturate', 0.5) * toward


def prepare(plan, hour):
    """An hour's layers (`layers`: a photograph of `photos` by name, with what the layer changes of it), each matched to
    the hour's `reference` photograph (its first layer's unless named): its land's colour in log light (color_match),
    unless the layer is the reference or says `match: false`; then its own `adjust`. Returns the base layers, the
    `over` layers (laid on top of everything, inside their `shape`) and the reference."""
    reference_name = hour.get('reference', hour['layers'][0]['photo'])
    cache = {}
    def photo(name, overrides=None):
        key = (name, json.dumps(overrides or {}, sort_keys=True))
        if key not in cache:
            cache[key] = prepare_photo({**plan['photos'][name], **(overrides or {})})
        return cache[key]
    reference = photo(reference_name)
    # What is matched: the land above each far shore, with one contrast for its three channels; or, the morning as it
    # was tuned, all the land (`matchWhole`: the shore's colour carried down below it too, which warms the side
    # photographs toward the home view's lawn) and each channel its own contrast (`matchContrast: channels`).
    land = (lambda entry: entry['matte'] > 0.9) if hour.get('matchWhole') else above_shore
    base, over = [], []
    for layer in hour['layers']:
        overrides = {key: value for key, value in layer.items() if key not in ('photo', 'match', 'adjust')}
        entry = dict(photo(layer['photo'], overrides))
        matched = layer['photo'] != reference_name and layer.get('match', True)
        if matched:
            arguments = (entry['linear'], land(entry), reference['linear'], land(reference))
            if hour.get('matchContrast') != 'channels':
                entry['linear'] = color_match(*arguments, shared=True)
            else:
                graded = color_match(*arguments)
                if 'keepHue' in hour:
                    # Each channel its own contrast gives sunlit leaves the reference's gold, but stretches the sky in
                    # a canopy's gaps and at its edges (the brightest of a tree) to a false pink: there (`keepHue`: from
                    # what luminance to what, easing in) the shared contrast, which keeps its hue.
                    low, high = hour['keepHue']
                    gap = np.clip((luminance(entry['photo']) - low) / (high - low), 0, 1)
                    graded = graded + (color_match(*arguments, shared=True) - graded) * gap[..., None]
                entry['linear'] = graded
        if 'adjust' in layer:
            entry['linear'] = adjust(entry['linear'], layer['adjust'])
        entry['backlit'] = 'backlight' in hour and layer.get('backlight', True)
        if hour.get('unsky') and matched:
            # What the matte kept as land but is mostly sky (leaves blurred against it: bright, and grey to blue rather
            # than a leaf's yellow-green) would take the hour's tint as land (pale blue to salmon): it is let through
            # as it is sky-like (`unsky`: from what luminance to what), above the shore's own row of things (tents).
            green, blue = entry['photo'][..., 1], entry['photo'][..., 2]
            low, high = hour['unsky']
            bright = np.clip((luminance(entry['photo']) - low) / (high - low), 0, 1)
            grey = np.clip((blue / np.maximum(green, 1e-3) - 0.75) / 0.15, 0, 1)
            height = entry['matte'].shape[0]
            clear = np.arange(height)[:, None] < (entry['cut'][None, :] - 0.04) * height
            entry['matte'] = entry['matte'] * (1 - bright * grey * clear)
        (over if entry['spec'].get('over') else base).append(entry)
    cards = {}
    for name, spec in plan.get('elms', {}).get('cards', {}).items():
        if name not in KEYED:
            KEYED[name] = key_elm(spec)
        card = dict(KEYED[name])
        card['color'] = match_tree(card['color'], card['alpha'] > 0.9, reference['linear'], trees_of(reference), plan['elms'].get('tint', 0.5))
        card['levels'] = card_levels(card['color'], card['alpha'])
        cards[name] = card
    return base, over, reference, cards


def luminance(color):
    return 0.2126 * color[..., 0] + 0.7152 * color[..., 1] + 0.0722 * color[..., 2]


def grade(color, light):
    """The photographs' land as radiance: each pixel's luminance raised to `light.gamma` (its hue kept), times the
    scale that brings the home view's land to `light.landMedian` (exposure_of)."""
    lum = luminance(color)
    return color * (light['scale'] * np.power(np.maximum(lum, 1e-6), light['gamma'] - 1))[..., None]


def photo_rays(spec, height, width, rows, columns):
    """Directions (as `directions`) of a prepared photograph's pixels (rows, columns of its cropped image)."""
    crop = spec.get('crop', [0, 1])
    across = crop[0] + (columns + 0.5) / width * (crop[1] - crop[0])
    if spec.get('mirror'):
        across = 1 - across
    full_width = width / (crop[1] - crop[0])
    focal = 0.5 / math.tan(math.radians(spec['hfov']) / 2)
    right, up, forward = camera(spec['yaw'], spec.get('pitch', 0.0), spec.get('roll', 0.0))
    down = (rows + 0.5) / height
    rays = right[None] * ((across - 0.5) / focal)[:, None] + up[None] * ((0.5 - down) * height / full_width / focal)[:, None] + forward[None]
    return (rays / np.linalg.norm(rays, axis=-1, keepdims=True)).astype(np.float32)


def sky_pixels(entry, step=4):
    """A sample of a photograph's own sky above its far shore: its linear colours and their directions."""
    matte, height, width = entry['matte'], *entry['matte'].shape
    rows, columns = np.mgrid[0:height:step, 0:width:step]
    shore = entry['cut'][columns] * height
    chosen = (matte[rows, columns] < 0.01) & (rows < shore - 0.01 * height)
    rows, columns = rows[chosen], columns[chosen]
    return entry['linear'][rows, columns], photo_rays(entry['spec'], height, width, rows, columns)


def exposure_of(reference, light, sky_at=None):
    """The scale of grade(): the home view's land (above its far shore, matte whole) at the median luminance
    `light.landMedian`; or the reference photograph's own sky at the median `light.skyMedian` (a night's: its land is
    mostly dark); or (`light.skyMatch`) its sky as bright as the hour's sky in the same directions, so the land keeps
    the photograph's own contrast against its sky."""
    gamma = light['gamma']
    if 'landMedian' in light:
        land = reference['matte'] > 0.99
        rows = np.arange(land.shape[0])[:, None] < (land.shape[0] * 0.5)
        lum = luminance(reference['linear'])[land & rows]
        return light['landMedian'] / float(np.median(np.power(np.maximum(lum, 1e-6), gamma)))
    colors, rays = sky_pixels(reference)
    own = float(np.median(np.power(np.maximum(luminance(colors), 1e-6), gamma)))
    target = light['skyMedian'] if 'skyMedian' in light else float(np.median(luminance(sky_at(rays))))
    return target / own


def fit_glow(entry, light, shape):
    """A city night's sky glow (`sky.glow`): brightest at the horizon and falling with elevation to `zenith` of it,
    as zenith + (1 − zenith)·exp(−elevation/`scale`°) (a city's light scattered in the air above it: Garstang's model
    has its sky a few times brighter low than overhead), its colour and brightness fitted channel by channel to the
    reference photograph's own sky, graded as its land is. So the glow keeps the photograph's colour and its
    brightness against its land; the photograph shows only its lowest few degrees, so the shape is not fitted."""
    colors, rays = sky_pixels(entry, 2)
    graded = grade(colors, light)
    profile = lambda elevation: shape['zenith'] + (1 - shape['zenith']) * np.exp(-np.maximum(elevation, 0) / shape['scale'])
    elevation = np.degrees(np.arcsin(np.clip(rays[:, 1], -1, 1)))
    weights = profile(elevation)
    level = (graded * weights[:, None]).sum(0) / (weights ** 2).sum()
    if 'color' in shape:
        # Its colour given (`color`, relative) at the fitted luminance times `gain`: the photograph's long exposure
        # shows the glow brown and bright; the eye sees it dimmer and nearly grey.
        color = np.array(shape['color'], np.float32)
        level = color * float(luminance(level)) * shape.get('gain', 1.0) / float(luminance(color))
    print(f'  glow: {np.round(level, 4)} at the horizon, fitted from {elevation.min():.1f}° to {elevation.max():.1f}°')
    return lambda dirs: (level * profile(np.degrees(np.arcsin(np.clip(dirs[..., 1], -1, 1))))[..., None]).astype(np.float32)


def sky_of(pure, turn, settings, glow=None):
    """The hour's sky along `dirs`: the pure sky turned (times `settings.gain`), and a night's glow over it."""
    gain = settings.get('gain', 1.0)
    def along(dirs):
        sky = sample_sky(pure, dirs, turn) * gain
        return sky + glow(dirs) if glow else sky
    return along


def compose(photos, over, sky, light, width, rows=None, elms=None):
    height = width // 2
    rows = np.arange(height) if rows is None else rows
    dirs = directions(width, height, rows)
    if elms:
        return compose_over_elms(over, sky, light, width, rows, dirs, elms)
    land_sum = np.zeros((*dirs.shape[:2], 4), np.float32); alpha_sum = np.zeros(dirs.shape[:2], np.float32); weight_sum = np.zeros(dirs.shape[:2], np.float32)
    horizon_row = np.argmin(np.abs(rows - height / 2))
    protected = np.zeros(width, bool); yields = np.zeros(width); strongest = np.zeros(width)
    for entry in photos:
        spec, photo_width = entry['spec'], entry['matte'].shape[1]
        protect = np.zeros(entry['matte'].shape, np.float32)
        for low, high in spec.get('protect', []):
            protect[:, int(low * photo_width):int(high * photo_width)] = 1
        backlit = np.full(entry['matte'].shape, SUBJECT if entry.get('backlit') else 0.0, np.float32)
        channels = np.concatenate([entry['linear'] * spec.get('gain', 1.0), backlit[..., None], entry['matte'][..., None], protect[..., None]], -1)
        sampled, weight = project(channels, spec, dirs)
        color, alpha = sampled[..., :4], sampled[..., 4]
        land_sum += color * (alpha * weight)[..., None]; alpha_sum += alpha * weight; weight_sum += weight
        horizon_weight = weight[horizon_row]
        protected |= (sampled[horizon_row, :, 5] > 0.01) & (horizon_weight > 0)
        mine = horizon_weight > strongest
        yields[mine] = spec.get('yield', 6.0); strongest = np.maximum(strongest, horizon_weight)
    alpha = np.clip(alpha_sum / np.maximum(weight_sum, 1e-6), 0, 1)
    color = land_sum / np.maximum(alpha_sum[..., None], 1e-6)
    color, alpha, gaps = fill_gaps(color, alpha, weight_sum[horizon_row], protected, yields)
    color, alpha, _ = lay_over(over, color, alpha, None, dirs, width, horizon_row)
    return finish(color, alpha, None, sky, light, dirs), gaps


def lay_over(over, color, alpha, haze, dirs, width, horizon_row):
    # The `over` layers, over whatever the others gave: a landmark in another light, inside its `shape`; or a whole
    # photograph (its land and its sky), joined to the rest at each side by image quilting's cut (join) within its
    # `seam` degrees, where its land and theirs agree best.
    per_degree = width / 360
    for entry in over:
        if 'shape' in entry:
            channels = np.concatenate([entry['linear'], np.zeros_like(entry['shape'])[..., None], entry['shape'][..., None]], -1)
            sampled, weight = project(channels, {**entry['spec'], 'feather': 1e-3}, dirs)
            share = (sampled[..., 4] * np.minimum(weight, 1))[..., None]
            color = color * (1 - share) + sampled[..., :4] * share
            alpha = alpha * (1 - share[..., 0]) + share[..., 0]
            if haze is not None:
                haze = haze * (1 - share[..., 0])
            continue
        backlit = np.full(entry['matte'].shape, SUBJECT if entry.get('backlit') else 0.0, np.float32)
        channels = np.concatenate([entry['linear'], backlit[..., None], entry['matte'][..., None]], -1)
        sampled, weight = project(channels, {**entry['spec'], 'feather': 1e-3}, dirs)
        inside = np.flatnonzero(weight[horizon_row] > 0)
        first, last = int(inside.min()), int(inside.max()) + 1   # (never across north: the photographs placed so)
        window = int(entry['spec'].get('seam', 4) * per_degree)
        mine_color, mine_alpha = sampled[..., :4] * sampled[..., 4:5], sampled[..., 4]
        theirs_color = color * alpha[..., None]
        into = join(theirs_color, alpha, mine_color, mine_alpha, first, first + window, per_degree)
        out_of = join(mine_color, mine_alpha, theirs_color, alpha, last - window, last, per_degree)
        share = into * (1 - out_of) * (weight > 0)
        premultiplied = theirs_color * (1 - share[..., None]) + mine_color * share[..., None]
        alpha = alpha * (1 - share) + mine_alpha * share
        color = premultiplied / np.maximum(alpha[..., None], 1e-6)
        if haze is not None:
            haze = haze * (1 - share)
    return color, alpha, haze


def finish(color, alpha, haze, sky, light, dirs):
    """The land graded to radiance (grade), backlit toward a low sun (backlight), hazed toward the sky at the horizon
    by its `haze` share (the elms': their air), and laid over the hour's sky."""
    land = grade(color[..., :3], light)
    if 'backlight' in light:
        darken, desaturate = backlight(dirs, light['backlight'], light['sunAzimuth'])
        subject = np.clip(color[..., 3] / SUBJECT, 0, 1)
        darken, desaturate = 1 - (1 - darken) * subject, desaturate * subject
        lum = luminance(land)[..., None]
        land = (lum + (land - lum) * (1 - desaturate[..., None])) * darken[..., None]
    if haze is not None:
        horizon = dirs * np.array([1, 0, 1], np.float32) + np.array([0, 0.035, 0], np.float32)
        horizon /= np.linalg.norm(horizon, axis=-1, keepdims=True)
        land = land * (1 - haze[..., None]) + sky(horizon) * haze[..., None]
    return sky(dirs) * (1 - alpha[..., None]) + land * alpha[..., None]


def compose_over_elms(over, sky, light, width, rows, dirs, elms):
    """An hour composed over its elms (draw_elms) rather than over stitched photographs: every photograph an `over`
    layer (the landmarks, cropped to them and joined to the trees by quilting cuts). Under the horizon, and HEDGE above
    it, where no tree stands, the land is the colour of what stands at the horizon in that direction (under it the
    app's own lawn covers it, to the horizon: src/shaders/scene.js MALL_GROUND_FRAGMENT)."""
    cards, trees, settings, subject = elms
    height = width // 2
    color, alpha, haze = draw_elms(cards, trees, settings, dirs, rows, width, subject)
    elevation = 90 - (rows + 0.5) / height * 180
    low = (elevation > 0) & (elevation < 3)
    if low.any():
        weight = alpha[low].sum(0)
        carried = color[low].sum(0)
        smooth = lambda values: ndimage.gaussian_filter1d(values, width / 360, axis=0, mode='wrap')
        shore = smooth(carried) / np.maximum(smooth(weight), 1e-6)[:, None]
        below = (elevation <= HEDGE)[:, None]   # and a hair above: the far hedges and shrubs no tree card fills
        open_share = np.where(below, 1 - alpha, 0)
        color = color + shore[None] * open_share[..., None]
        alpha = alpha + open_share
    straight = color / np.maximum(alpha[..., None], 1e-6)
    haze = haze / np.maximum(alpha, 1e-6)
    horizon_row = int(np.argmin(np.abs(rows - height / 2)))
    straight, alpha, haze = lay_over(over, straight, alpha, haze, dirs, width, horizon_row)
    return finish(straight, alpha, haze, sky, light, dirs), []


def preview(image, path, exposure=1.0):
    mapped = image * exposure
    mapped = mapped / (1 + 0.15 * mapped)
    Image.fromarray((np.clip(linear_to_srgb(mapped), 0, 1) * 255).astype(np.uint8)).save(path, quality=88)


def views(image, path, exposure=1.0):
    """Eight views from the eye, 75° wide, each labelled with its heading."""
    from PIL import ImageDraw
    tiles = []
    for yaw, name in [(90, 'E: home'), (45, 'NE'), (0, 'N'), (315, 'NW'), (270, 'W'), (225, 'SW'), (180, 'S'), (135, 'SE')]:
        right, up, forward = camera(yaw, 4)
        width, height = 640, 300
        focal = (width / 2) / math.tan(math.radians(75) / 2)
        gx, gy = np.meshgrid((np.arange(width) + 0.5 - width / 2) / focal, -(np.arange(height) + 0.5 - height / 2) / focal)
        rays = gx[..., None] * right + gy[..., None] * up + forward
        rays = (rays / np.linalg.norm(rays, axis=-1, keepdims=True)).astype(np.float32)
        tile = sample_sky(image, rays, 0.0) * exposure
        tile = Image.fromarray((np.clip(linear_to_srgb(tile / (1 + 0.15 * tile)), 0, 1) * 255).astype(np.uint8))
        ImageDraw.Draw(tile).text((8, 8), name, fill='white')
        tiles.append(tile)
    sheet = Image.new('RGB', (1280, 1200))
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % 2) * 640, (index // 2) * 300))
    sheet.save(path, quality=88)


def build(plan, name, hour, out_preview):
    """One hour: its sky turned so its sun stands at `sky.sunAzimuth` (degrees from north, clockwise: where the true
    sun stood then, so every hour's land lies alike), its layers composed at 2k and, in the land's band, at 8k."""
    print(f'{name}:')
    settings = hour['sky']
    pure = read_hdr(fetch(settings['url'], os.path.join(CACHE, os.path.basename(settings['url']))))
    lum = pure.mean(-1)
    if settings.get('stars'):
        # Only the stars (`stars`): the sky less its own smooth light, its airglow and a far town's dome, which under a
        # city's glow would be the wrong colour in the wrong place.
        pure = np.maximum(pure - ndimage.median_filter(pure, size=(9, 9, 1)), 0)
    sun_row, sun_column = np.unravel_index(lum.argmax(), lum.shape)
    turn = (sun_column + 0.5) / pure.shape[1] - settings['sunAzimuth'] / 360
    photos, over, reference, cards = prepare(plan, hour)
    elms = None
    if cards:
        # The hour's haze (`elmHaze`, metres; 0 none: at night the trees stand black against the city's glow, whose
        # light is scattered over kilometres, not the few hundred metres to the trees).
        planting = {**plan['elms'], 'haze': hour.get('elmHaze', plan['elms']['haze'])}
        elms = (cards, plant_elms(planting), planting, SUBJECT if 'backlight' in hour else 0.0)
    light = dict(hour['light'])
    if 'backlight' in hour:
        light.update(backlight=hour['backlight'], sunAzimuth=settings['sunAzimuth'])
    sky = sky_of(pure, turn, settings)
    light['scale'] = exposure_of(reference, light, sky)
    if settings.get('glow'):
        sky = sky_of(pure, turn, settings, fit_glow(reference, light, settings['glow']))
    print(f"  land: luminance to the power {light['gamma']}, times {light['scale']:.4g}")
    low, high = 2048, 8192
    image, gaps = compose(photos, over, sky, light, low, elms=elms)
    for start, width in gaps:
        print(f'  gap filled: {width:.1f}° from {start:.1f}°')
    file = hour['file']
    write_hdr(os.path.join(ROOT, 'assets', 'sky', f'{file}_2k.hdr'), image.astype(np.float32))
    # The 8k: the 2k grown four times, the band where the land stands drawn at 8k.
    big = np.stack([np.asarray(Image.fromarray(image[..., channel]).resize((high, high // 2), Image.BILINEAR)) for channel in range(3)], -1)
    band_rows = np.arange(int((90 - BAND[1]) / 180 * high / 2), int((90 - BAND[0]) / 180 * high / 2))
    sharp, _ = compose(photos, over, sky, light, high, band_rows, elms=elms)
    big[band_rows] = sharp
    write_hdr(os.path.join(ROOT, 'assets', 'sky', f'{file}_8k.hdr'), big.astype(np.float32))
    if out_preview:
        folder = os.path.join(out_preview, name)
        os.makedirs(folder, exist_ok=True)
        level = 0.45 / max(float(np.median(image[low // 6 - 20:low // 6 + 20, :, 1])), 1e-6)   # the sky 30° up
        preview(image, os.path.join(folder, 'pano.jpg'), level)
        preview(big[band_rows], os.path.join(folder, 'band8k.jpg'), level)
        views(big, os.path.join(folder, 'views.jpg'), level)
        print(f'  previews in {folder}')


def main():
    plan = json.load(open(PLAN))
    out_preview = next((arg.split('=', 1)[1] for arg in sys.argv[1:] if arg.startswith('--preview=')), None)
    only = next((arg.split('=', 1)[1].split(',') for arg in sys.argv[1:] if arg.startswith('--hour=')), None)
    os.makedirs(CACHE, exist_ok=True)
    for name, hour in plan['hours'].items():
        if only is None or name in only:
            build(plan, name, hour, out_preview)


if __name__ == '__main__':
    main()
