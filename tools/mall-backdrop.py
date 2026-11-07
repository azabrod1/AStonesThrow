"""The Reflecting Pool's sky (src/sky.js `mall`): a 360° backdrop matte-painted from flat photographs.

No free panorama of the Lincoln Memorial Reflecting Pool from its west end exists, so this stitches one from
freely licensed photographs on Wikimedia Commons and a pure sky from Poly Haven, as a film's matte painter would:
each photograph is set where it looks from the pool's west end (its azimuth, tilt and field of view), its own sky
cut away (a matte: sky-like pixels joined to its top, and the canopy's holes), its colour matched to the home
view's, and its land laid over one sky, so the sky has no seams and is the light the scene is lit by. The water
below the far shore is the app's (src/mallPool.js draws the coping and the ground out to the first elm row, the
water stops at the walls), so each photograph is used from its far shore (`cut`) up; below it the far shore's
row is carried down, a blur under the horizon that the encoder blurs further (tools/sky-encode.mjs GROUND_FROM).

The photographs (tools/mall-backdrop.json `photos`, with their authors and licences;
CC BY-SA asks that they be credited where the backdrop is shown): ahead, east, down the pool to the Washington Monument; behind, the Lincoln Memorial; to the south the
elm rows across the water, and to the north the same photograph mirrored (no photograph of the north elms has
their crowns and sky in frame). Each may name
  crop        the share of its width used (from, to): clutter at an edge left out;
  cut         its far shore, [x, y] shares of its width and height, the land above it;
  keep        boxes whose white is land, not cloud (the marble);
  paint       lines to paint out ([[x, y], ...], width as a share of the width): a pole across the trees;
  protect     spans of its width (from, to) never copied into a gap: a landmark is never seen twice;
  yield       the degrees of its sides a gap's join may take (6; less where the photograph matters most);
  blue, lum, white, hole_blue, sky_above   the matte's thresholds (land_matte).
Between photographs that do not meet, the gap is filled from both sides, each side's land copied across into
its half and the two joined where their treelines best agree: more of the same trees, never a stretched smear
(fill_gaps).

The sky: Poly Haven's qwantani_mid_morning_puresky (CC0), turned so its sun stands `sky.sunAzimuth` (degrees
from north, clockwise) at its own height (40°). The land's light (`light`): a phone's photograph is display-
referred, its shadows crushed and its sky near clipping, so its land is far darker against the sky than the land in
a measured HDR (Poly Haven's lake and meadow panoramas hold their land's median luminance at 0.04 to 0.1 of
Three.js's units, about a tenth of their sky). Each pixel's luminance, from sRGB to linear, is raised to `gamma`
(below 1: the shadows opened, the marble held) and scaled so the home view's land has the median `landMedian`.

Writes assets/sky/mall_2k.hdr (the dome's photo: run tools/sky-probe.mjs and tools/sky-encode.mjs on it)
and assets/sky/mall_8k.hdr (the horizon strip's source, gitignored as Poly Haven's are: sky-encode cuts
the strip from it), and --preview a tone-mapped look at both and eight views from the eye.

    python3 tools/mall-backdrop.py [--preview=shots/mall-backdrop]

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
    name = ''.join(c if c.isalnum() or c in '._-' else '_' for c in title[5:])
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


def bilinear(image, u, v):
    h, w = image.shape[:2]
    u = np.clip(u, 0, w - 1.001); v = np.clip(v, 0, h - 1.001)
    u0 = u.astype(np.int32); v0 = v.astype(np.int32)
    fu = (u - u0)[..., None]; fv = (v - v0)[..., None]
    return (image[v0, u0] * (1 - fu) * (1 - fv) + image[v0, u0 + 1] * fu * (1 - fv)
            + image[v0 + 1, u0] * (1 - fu) * fv + image[v0 + 1, u0 + 1] * fu * fv)


def sample_sky(sky, dirs, turn):
    """The pure sky along `dirs`, turned by `turn` (a share of the circle) about the vertical."""
    h, w = sky.shape[:2]
    azimuth = np.arctan2(dirs[..., 0], dirs[..., 2])
    elevation = np.arcsin(np.clip(dirs[..., 1], -1, 1))
    u = ((azimuth / (2 * math.pi) + turn) % 1.0) * w - 0.5
    v = (0.5 - elevation / math.pi) * h - 0.5
    u0 = np.floor(u).astype(np.int32); fu = (u - u0)[..., None]
    v = np.clip(v, 0, h - 1.001); v0 = v.astype(np.int32); fv = (v - v0)[..., None]
    u0 %= w; u1 = (u0 + 1) % w
    return (sky[v0, u0] * (1 - fu) * (1 - fv) + sky[v0, u1] * fu * (1 - fv) + sky[v0 + 1, u0] * (1 - fu) * fv + sky[v0 + 1, u1] * fu * fv)


# ---- the photographs -------------------------------------------------------------------------------------------

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def linear_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def load_photo(spec):
    image = Image.open(commons_file(spec['commons'])).convert('RGB')
    scale = WORK_WIDTH / image.width
    if scale < 1:
        image = image.resize((WORK_WIDTH, round(image.height * scale)), Image.LANCZOS)
    return np.asarray(image, np.float32) / 255


def paint_out(photo, lines):
    """Paint out thin things (a pole) along polylines: each pixel within the line's width takes the pixel just beyond it, sideways."""
    h, w = photo.shape[:2]
    for points, width in lines:
        half = max(2, round(width * w / 2))
        mask = Image.new('L', (w, h), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).line([(x * w, y * h) for x, y in points], fill=255, width=2 * half)
        mask = np.asarray(mask) > 0
        ys, xs = np.nonzero(mask)
        source = np.clip(xs + 2 * half + 2, 0, w - 1)
        photo[ys, xs] = photo[ys, source]
        blurred = ndimage.uniform_filter(photo, size=(3, 3, 1))
        edge = ndimage.binary_dilation(mask, iterations=2) & ~ndimage.binary_erosion(mask, iterations=2)
        photo[edge] = blurred[edge]
    return photo


def land_matte(photo, spec):
    """Land (1) against sky (0) above the far shore (`cut`); below it land, the far shore carried down."""
    h, w = photo.shape[:2]
    ys = (np.arange(h) + 0.5) / h
    xs = (np.arange(w) + 0.5) / w
    cut = np.interp(xs, *zip(*spec['cut']))
    above = ys[:, None] < cut[None, :]
    r, g, b = photo[..., 0], photo[..., 1], photo[..., 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    blue = b - r
    bluish = (blue > spec.get('blue', 0.05)) & (lum > spec.get('lum', 0.45))
    white = (lum > spec.get('white', 0.9)) & (np.abs(b - r) < 0.12)
    for x0, y0, x1, y1 in spec.get('keep', []):
        box = (slice(int(y0 * h), int(y1 * h)), slice(int(x0 * w), int(x1 * w)))
        white[box] = False
        bluish[box] &= blue[box] > spec.get('keep_blue', 0.12)
    skylike = (bluish | white) & above
    labels, _ = ndimage.label(skylike)
    touching = np.unique(labels[: max(2, h // 200)])
    sky = np.isin(labels, touching[touching > 0])
    sky |= skylike & (blue > spec.get('hole_blue', 0.12))
    if 'sky_above' in spec:
        rows = int(spec['sky_above'] * h)
        sky[:rows] |= skylike[:rows]
    sky = ndimage.binary_opening(sky, iterations=1)
    land = above & ~sky
    # What floats in the sky (a kite, a bird) is not land: keep only land joined to the far shore.
    labels, _ = ndimage.label(land)
    shore_rows = np.clip((cut * h).astype(int) - 2, 0, h - 1)
    grounded = np.unique(labels[shore_rows, np.arange(w)])
    land = np.isin(labels, grounded[grounded > 0]) | ~above
    return np.clip(ndimage.gaussian_filter(land.astype(np.float32), 0.7), 0, 1), cut


def carry_shore_down(photo, cut):
    """Below the far shore, each column takes its shore's colour (the app's water and ground cover it; the encoder blurs it)."""
    h, w = photo.shape[:2]
    rows = np.clip((cut * h).astype(int) - 3, 0, h - 1)
    shore = photo[rows, np.arange(w)]
    below = np.arange(h)[:, None] >= rows[None, :]
    return np.where(below[..., None], shore[None, :, :], photo)


def color_match(linear, matte, reference, reference_matte):
    """Each channel's land matched to the home view's, its mean and spread in log light (as an exposure and a
    contrast: never below black, as a match in linear light would push the shadows)."""
    out = linear.copy()
    land, reference_land = matte > 0.9, reference_matte > 0.9
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
        u = full_width / 2 + focal * (dirs @ right.astype(np.float32)) / depth
        v = ph / 2 - focal * (dirs @ up.astype(np.float32)) / depth
    if spec.get('mirror'):
        u = full_width - u
    u = u - offset
    inside = (depth > 0) & (u >= 0) & (u <= pw - 1) & (v >= 0) & (v <= ph - 1)
    sampled = bilinear(rgba, np.where(inside, u, 0), np.where(inside, v, 0))
    feather = np.clip(np.minimum(u, pw - 1 - u) / (spec.get('feather', 0.02) * pw), 0, 1)
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
            options = [c for c in (column - 1, column, column + 1) if 0 <= c < high - low]
            column = min(options, key=lambda c: total[row - 1, c])
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
    h, w = alpha.shape
    per_degree = w / 360
    covered = coverage >= 0.999
    if covered.all():
        return color, alpha, []
    shift = int(np.flatnonzero(covered)[0])                  # start the circle at a covered column
    color = np.roll(color, -shift, 1); alpha = np.roll(alpha, -shift, 1); covered = np.roll(covered, -shift)
    protected = np.roll(protected, -shift); yields = np.roll(yields, -shift)
    premultiplied = color * alpha[..., None]
    copyable = covered & ~protected
    gaps, column = [], 0
    while column < w:
        if not covered[column]:
            start = column
            while column < w and not covered[column]:
                column += 1
            gaps.append((start, column))
        column += 1
    def run(column, step):                                   # copyable columns from `column` outward
        count = 0
        while copyable[(column + step * count) % w] and count < w // 4:
            count += 1
        return count
    out_color, out_alpha = premultiplied.copy(), alpha.copy()
    slack = int(2 * per_degree)
    for start, end in gaps:
        width = end - start
        margin_left = min(int(yields[(start - 1) % w] * per_degree), run(start - 1, -1))
        margin_right = min(int(yields[end % w] * per_degree), run(end, 1))
        available_left, available_right = run(start - 1, -1), run(end, 1)
        # Each copy's source: of the offsets its side's land allows (together reaching across the gap, so the copies
        # meet), the one whose land best matches the photograph's where the two are joined (image quilting's choice of
        # patch), so the copy's treeline carries on the photograph's. The side with less land to copy chooses first.
        def best_reach(side, margin, available, least):
            high = max(available - margin, least + 1)
            joined = np.arange(start - margin, start) % w if side < 0 else np.arange(end, end + margin) % w
            here = alpha[:, joined]
            stride = max(1, int(per_degree / 4))
            errors = [np.abs(alpha[:, (joined + side * reach) % w] - here).sum() for reach in range(least, high, stride)]
            return least + int(np.argmin(errors)) * stride
        room_left, room_right = available_left - margin_left, available_right - margin_right
        if room_left <= room_right:
            reach_left = best_reach(-1, margin_left, available_left, max(slack, width + 2 * slack - room_right))
            reach_right = best_reach(1, margin_right, available_right, max(slack, width + 2 * slack - reach_left))
        else:
            reach_right = best_reach(1, margin_right, available_right, max(slack, width + 2 * slack - room_left))
            reach_left = best_reach(-1, margin_left, available_left, max(slack, width + 2 * slack - reach_right))
        columns = np.arange(start - margin_left, end + margin_right) % w
        span = len(columns)
        # The middle join where both copies are copyable land: left's source before the gap, right's after it.
        seam_low = max(margin_left, margin_left + width + slack - reach_right)
        seam_high = min(margin_left + width, margin_left + reach_left - slack)
        if seam_high < seam_low:
            seam_low = seam_high = margin_left + width // 2
        photo_color, photo_alpha = premultiplied[:, columns], alpha[:, columns]
        from_left = (columns - reach_left) % w
        from_right = (columns + reach_right) % w
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
    found = [(((start + shift) % w) / w * 360, (end - start) / w * 360) for start, end in gaps]
    return np.roll(color, shift, 1), np.roll(out_alpha, shift, 1), found


def prepare(plan):
    photos = []
    for spec in plan['photos']:
        photo = load_photo(spec)
        if spec.get('paint'):
            photo = paint_out(photo, spec['paint'])
        crop = spec.get('crop', [0, 1])
        if crop != [0, 1]:
            w = photo.shape[1]
            photo = photo[:, int(crop[0] * w):int(crop[1] * w)]
            spec = {**spec, 'cut': [[(x - crop[0]) / (crop[1] - crop[0]), y] for x, y in spec['cut']],
                    'keep': [[(x0 - crop[0]) / (crop[1] - crop[0]), y0, (x1 - crop[0]) / (crop[1] - crop[0]), y1] for x0, y0, x1, y1 in spec.get('keep', [])],
                    'protect': [[(x0 - crop[0]) / (crop[1] - crop[0]), (x1 - crop[0]) / (crop[1] - crop[0])] for x0, x1 in spec.get('protect', [])]}
        matte, cut = land_matte(photo, spec)
        photos.append({'spec': spec, 'photo': photo, 'linear': srgb_to_linear(carry_shore_down(photo, cut)), 'matte': matte})
    reference = photos[0]
    for entry in photos[1:]:
        if entry['spec'].get('match', True):
            entry['linear'] = color_match(entry['linear'], entry['matte'], reference['linear'], reference['matte'])
    return photos


def luminance(color):
    return 0.2126 * color[..., 0] + 0.7152 * color[..., 1] + 0.0722 * color[..., 2]


def grade(color, light):
    """The photographs' land as radiance: each pixel's luminance raised to `light.gamma` (its hue kept), times the
    scale that brings the home view's land to `light.landMedian` (exposure_of)."""
    lum = luminance(color)
    return color * (light['scale'] * np.power(np.maximum(lum, 1e-6), light['gamma'] - 1))[..., None]


def exposure_of(reference, light):
    """The scale under which the home view's land (above its far shore, matte whole) has the median luminance `light.landMedian`."""
    land = reference['matte'] > 0.99
    rows = np.arange(land.shape[0])[:, None] < (land.shape[0] * 0.5)
    lum = luminance(reference['linear'])[land & rows]
    return light['landMedian'] / float(np.median(np.power(np.maximum(lum, 1e-6), light['gamma'])))


def compose(photos, sky, turn, light, width, rows=None):
    height = width // 2
    rows = np.arange(height) if rows is None else rows
    dirs = directions(width, height, rows)
    land_sum = np.zeros(dirs.shape, np.float32); alpha_sum = np.zeros(dirs.shape[:2], np.float32); weight_sum = np.zeros(dirs.shape[:2], np.float32)
    horizon_row = np.argmin(np.abs(rows - height / 2))
    protected = np.zeros(width, bool); yields = np.zeros(width); strongest = np.zeros(width)
    for entry in photos:
        spec, photo_width = entry['spec'], entry['matte'].shape[1]
        protect = np.zeros(entry['matte'].shape, np.float32)
        for low, high in spec.get('protect', []):
            protect[:, int(low * photo_width):int(high * photo_width)] = 1
        channels = np.concatenate([entry['linear'] * spec.get('gain', 1.0), entry['matte'][..., None], protect[..., None]], -1)
        sampled, weight = project(channels, spec, dirs)
        color, alpha = sampled[..., :3], sampled[..., 3]
        land_sum += color * (alpha * weight)[..., None]; alpha_sum += alpha * weight; weight_sum += weight
        horizon_weight = weight[horizon_row]
        protected |= (sampled[horizon_row, :, 4] > 0.01) & (horizon_weight > 0)
        mine = horizon_weight > strongest
        yields[mine] = spec.get('yield', 6.0); strongest = np.maximum(strongest, horizon_weight)
    alpha = np.clip(alpha_sum / np.maximum(weight_sum, 1e-6), 0, 1)
    color = land_sum / np.maximum(alpha_sum[..., None], 1e-6)
    color, alpha, gaps = fill_gaps(color, alpha, weight_sum[horizon_row], protected, yields)
    land = grade(color, light)
    sky_part = sample_sky(sky, dirs, turn)
    return sky_part * (1 - alpha[..., None]) + land * alpha[..., None], gaps


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


def main():
    plan = json.load(open(PLAN))
    out_preview = next((arg.split('=', 1)[1] for arg in sys.argv[1:] if arg.startswith('--preview=')), None)
    os.makedirs(CACHE, exist_ok=True)
    sky_path = fetch(plan['sky']['url'], os.path.join(CACHE, os.path.basename(plan['sky']['url'])))
    sky = read_hdr(sky_path)
    lum = sky.mean(-1)
    sun_row, sun_column = np.unravel_index(lum.argmax(), lum.shape)
    turn = (sun_column + 0.5) / sky.shape[1] - plan['sky']['sunAzimuth'] / 360
    photos = prepare(plan)
    light = {**plan['light'], 'scale': exposure_of(photos[0], plan['light'])}
    print(f"land: luminance to the power {light['gamma']}, times {light['scale']:.3f}")
    low, high = 2048, 8192
    image, gaps = compose(photos, sky, turn, light, low)
    for start, width in gaps:
        print(f'gap filled: {width:.1f}° from {start:.1f}°')
    name = plan['name']
    write_hdr(os.path.join(ROOT, 'assets', 'sky', f'{name}_2k.hdr'), image.astype(np.float32))
    # The 8k: the 2k grown four times, the band where the land stands drawn at 8k.
    big = np.stack([np.asarray(Image.fromarray(image[..., c]).resize((high, high // 2), Image.BILINEAR)) for c in range(3)], -1)
    band_rows = np.arange(int((90 - BAND[1]) / 180 * high / 2), int((90 - BAND[0]) / 180 * high / 2))
    sharp, _ = compose(photos, sky, turn, light, high, band_rows)
    big[band_rows] = sharp
    write_hdr(os.path.join(ROOT, 'assets', 'sky', f'{name}_8k.hdr'), big.astype(np.float32))
    if out_preview:
        os.makedirs(out_preview, exist_ok=True)
        level = 0.45 / max(float(np.median(image[low // 6 - 20:low // 6 + 20, :, 1])), 1e-6)   # the sky 30° up
        preview(image, os.path.join(out_preview, 'pano.jpg'), level)
        preview(big[band_rows], os.path.join(out_preview, 'band8k.jpg'), level)
        views(big, os.path.join(out_preview, 'views.jpg'), level)
        print(f'previews in {out_preview}')


if __name__ == '__main__':
    main()
