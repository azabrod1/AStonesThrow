# The birds' models (src/birdMeshes.js builds and moves them): for each kind,
# its shape in metres and its pictures, taken from photographs of the real
# bird, written to assets/birds/<kind>-model.webp (one image a kind) and
# assets/birds/models.json. Run it again to rebuild them all (never edit
# any):
#
#   python3 tools/bird-models.py          (numpy, scipy, Pillow with WebP, opencv-python-headless)
#
# A bird is a 3D model shaped and painted from photographs (KINDS): the
# photographs are Wikimedia Commons files under licences that let them be
# used and changed with credit (CC BY) or freely (CC0, public domain),
# downloaded once into tools/.bird-photos/ (gitignored) at Commons' 1280-pixel
# rendering, and each one's credit written to models.json (index.html shows
# them, under the Birds setting).
#
# Its parts:
#   - the body, side on: its outline traced on a side-on photograph (`outline`,
#     photo px, the bird facing right after `flip`), from the bill's tip round
#     the crown, the back (along the wing's root where a wing hides it), the
#     tail, the belly and the throat; scaled so the bill's tip to the tail's
#     tip is the kind's `length`. The picture is that photo cut to the
#     outline; models.json carries the outline's top and bottom at stations
#     along the body, which src/birdMeshes.js lofts into a round body painted
#     from the side.
#   - a wing, from below: four points on a photograph's wing (`points`: the
#     shoulder's leading edge, the root's trailing edge, the wrist's leading
#     edge and the trailing edge where the hand begins) and where they lie on
#     the flat wing (`at`: m out from the body's axis and m forward of the
#     shoulder), which rectify it (a homography: a gliding wing is nearly
#     flat, so this undoes the photo's foreshortening); its outline is the
#     cut-out's (the primaries' slots and the trailing edge's feathers in its
#     alpha), and models.json carries its leading and trailing edges at
#     stations along the span. The upper side is another photo's, or this one
#     tinted (`upper`).
#   - the tail, a fan: its colour the body photo's at the tail.
# Each is cut out of its sky as tools/bird-sprites.py cuts a bird (a smooth
# fit of the sky, refitted; the alpha its distance from it), brought to a
# common light (`gamma`, then `gain` per channel) and packed with the others into the
# kind's image, padded and bled so its mip levels never borrow a neighbour's
# edge.
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.bird-photos'
OUT = ROOT / 'assets' / 'birds'
USER_AGENT = 'AStonesThrowBirdSprites/1.0 (https://github.com/azabrod1/AStonesThrow)'
PADDING = 6
PIXELS_PER_METRE = 420    # every part's picture: about this sharp (a 2 m eagle's wing 420 px out)
STATIONS = 48             # the outlines' samples along the body and the span

CC_BY_2 = ('CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/')
CC_BY_3 = ('CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/')
CC_BY_4 = ('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/')
CC_BY_SA_4 = ('CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/')
CC0 = ('CC0', 'https://creativecommons.org/publicdomain/zero/1.0/')
PUBLIC_DOMAIN = ('Public domain', 'https://creativecommons.org/publicdomain/mark/1.0/')

KINDS = {
    # African fish eagle: body side on over Chobe (its near wing hides its back: the outline runs along the wing's
    # root), its left wing from below and in front over Lake Chivero.
    'fishEagle': dict(
        length=0.72, span=2.0,
        body=dict(file='African fish eagle, Haliaeetus vocifer, at Chobe National Park, Botswana (32832146603).jpg', author='Derek Keats', licence=CC_BY_2,
                  bill=(1046, 497), tail=(285, 528),
                  outline=[(1046, 497), (1030, 470), (990, 440), (950, 425), (900, 412), (850, 398), (800, 386), (760, 400), (700, 432), (640, 448),
                           (560, 455), (480, 458), (420, 452), (330, 446), (300, 470), (285, 528), (300, 585), (380, 598), (450, 600), (520, 612),
                           (590, 640), (650, 632), (705, 612), (750, 572), (820, 548), (900, 538), (960, 522), (1010, 510), (1040, 505)],
                  low=20, high=48, gain=(1.0, 1.0, 1.0)),
        wing=dict(file='African fish eagle, Haliaeetus vocifer, at Lake Chivero, Harare, Zimbabwe (21313291203).jpg', author='Derek Keats', licence=CC_BY_2,
                  side='right', crop=(630, 240, 1260, 560),
                  points=[(636, 378), (700, 522), (1005, 333), (1100, 447)],
                  at=[(0.09, 0.10), (0.09, -0.34), (0.60, 0.11), (0.74, -0.27)],
                  low=20, high=48, gamma=0.72, gain=(1.75, 1.5, 1.45), upper=dict(tint=(0.92, 0.86, 0.84))),
        tailColour='body',
    ),
}


def commons_url(file):
    query = urllib.parse.urlencode({'action': 'query', 'titles': f'File:{file}', 'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': 1280, 'format': 'json'})
    request = urllib.request.Request(f'https://commons.wikimedia.org/w/api.php?{query}', headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request) as response:
        page = next(iter(json.load(response)['query']['pages'].values()))
    return page['imageinfo'][0]['thumburl']


def photo(file):
    """A Commons photograph at 1280 px wide, downloaded once (slowly, as Commons asks of scripts)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / file
    if not path.exists():
        request = urllib.request.Request(commons_url(file), headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(request) as response:
            path.write_bytes(response.read())
        time.sleep(2)
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64)


def fit_sky(image, mask):
    """A cubic in x and y per channel, fitted to the pixels in `mask`: the sky behind the bird."""
    height, width, _ = image.shape
    ys, xs = np.nonzero(mask)
    pick = np.linspace(0, len(xs) - 1, min(len(xs), 20000)).astype(int)
    u, v = xs[pick] / width, ys[pick] / height
    basis = np.stack([u ** i * v ** j for i in range(4) for j in range(4 - i)], axis=1)
    gu, gv = np.meshgrid(np.arange(width) / width, np.arange(height) / height)
    full = np.stack([gu ** i * gv ** j for i in range(4) for j in range(4 - i)], axis=-1)
    sky = np.zeros_like(image)
    for channel in range(3):
        coefficients, *_ = np.linalg.lstsq(basis, image[ys[pick], xs[pick], channel], rcond=None)
        sky[..., channel] = full @ coefficients
    return sky


def largest(mask):
    labels, count = ndimage.label(mask)
    if count == 0:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == (1 + int(np.argmax(sizes)))


def cut_from_sky(image, low, high):
    """The bird's alpha against a smooth sky (the header), and its colour with the sky un-mixed from its edge."""
    luminance = image.mean(axis=2)
    sky_mask = luminance > np.percentile(luminance, 40)
    for _ in range(3):
        sky = fit_sky(image, sky_mask)
        distance = np.sqrt(((image - sky) ** 2).sum(axis=2))
        sky_mask = distance < low
    alpha = np.clip((distance - low) / (high - low), 0, 1)
    alpha *= largest(alpha > 0.5) | (ndimage.binary_dilation(largest(alpha > 0.5), iterations=3) & (alpha > 0))
    safe = np.maximum(alpha, 0.05)[..., None]
    colour = np.clip((image - sky * (1 - safe)) / safe, 0, 255)
    return alpha, colour


def body_part(spec, length):
    """The body side on: its picture (RGBA, PIXELS_PER_METRE), and its outline's top and bottom along it (m)."""
    image = photo(spec['file'])
    alpha, colour = cut_from_sky(image, spec['low'], spec['high'])
    colour = np.clip(colour * np.array(spec['gain']), 0, 255)
    outline = np.array(spec['outline'], np.float64)
    if spec.get('flip'):
        width = image.shape[1]
        outline[:, 0] = width - 1 - outline[:, 0]
        alpha, colour = alpha[:, ::-1], colour[:, ::-1]
    bill, tail = np.array(spec['bill'], np.float64), np.array(spec['tail'], np.float64)
    if spec.get('flip'):
        bill[0], tail[0] = image.shape[1] - 1 - bill[0], image.shape[1] - 1 - tail[0]
    # Photo px to metres: the bill's tip at x = +length/2, the tail's tip at −length/2, up the photo's up, turned so
    # the line between them is level.
    along = bill - tail
    scale = length / np.hypot(*along)
    angle = np.arctan2(along[1], along[0])
    rotation = np.array([[np.cos(-angle), -np.sin(-angle)], [np.sin(-angle), np.cos(-angle)]])
    middle = (bill + tail) / 2
    def to_metres(points):
        local = (points - middle) @ rotation.T * scale
        return np.stack([local[:, 0], -local[:, 1]], axis=1)
    outline_m = to_metres(outline)
    # The picture: the photo turned level and scaled, cut to the outline.
    top, bottom = outline_m[:, 1].max(), outline_m[:, 1].min()
    left, right = -length / 2, length / 2
    width_px = int(round((right - left) * PIXELS_PER_METRE)) + 1
    height_px = int(round((top - bottom) * PIXELS_PER_METRE)) + 1
    # Picture px (column, row) to photo px: metres, then back through the rotation.
    inverse = np.linalg.inv(rotation)
    columns, rows = np.meshgrid(np.arange(width_px), np.arange(height_px))
    metres_x = left + columns / PIXELS_PER_METRE
    metres_y = top - rows / PIXELS_PER_METRE
    local = np.stack([metres_x / scale, -metres_y / scale], axis=-1) @ inverse.T + middle
    map_x, map_y = local[..., 0].astype(np.float32), local[..., 1].astype(np.float32)
    rgba = np.dstack([colour, alpha * 255]).astype(np.float32)
    picture = cv2.remap(rgba, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    inside = np.zeros((height_px, width_px), np.uint8)
    polygon = np.stack([(outline_m[:, 0] - left) * PIXELS_PER_METRE, (top - outline_m[:, 1]) * PIXELS_PER_METRE], axis=1)
    cv2.fillPoly(inside, [np.round(polygon).astype(np.int32)], 1)
    inside = cv2.dilate(inside, np.ones((3, 3), np.uint8))
    # Solid inside its outline (the loft is closed): where the photo's bird is faint there (a white tail against a pale
    # sky), its nearest solid pixel's colour.
    solid = picture[..., 3] > 160
    if solid.any():
        _, (near_rows, near_columns) = ndimage.distance_transform_edt(~solid, return_indices=True)
        picture[..., :3] = np.where(solid[..., None], picture[..., :3], picture[near_rows, near_columns, :3])
    picture[..., 3] = np.where(inside > 0, 255, 0)
    # The outline's top and bottom at stations from the tail's tip to the bill's.
    stations = np.linspace(left, right, STATIONS)
    tops, bottoms = [], []
    for x in stations:
        crossings = []
        for (x0, y0), (x1, y1) in zip(outline_m, np.roll(outline_m, -1, axis=0)):
            if (x0 - x) * (x1 - x) <= 0 and x0 != x1:
                crossings.append(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
        if len(crossings) < 2:
            near = outline_m[np.argmin(np.abs(outline_m[:, 0] - x))][1]
            crossings = [near, near]
        tops.append(max(crossings)); bottoms.append(min(crossings))
    return Image.fromarray(picture.clip(0, 255).astype(np.uint8)), {
        'stations': [round(float(x), 4) for x in stations], 'top': [round(float(y), 4) for y in tops], 'bottom': [round(float(y), 4) for y in bottoms],
        'rect': [float(left), float(bottom), float(right), float(top)],
    }


def wing_part(spec, span):
    """A wing from below, rectified flat: its picture (RGBA), its edges along the span (m), and the rect it covers."""
    image = photo(spec['file'])
    left, top, right, bottom = spec['crop']
    piece = image[top:bottom, left:right]
    alpha, colour = cut_from_sky(piece, spec['low'], spec['high'])
    colour = 255 * (colour / 255) ** spec.get('gamma', 1.0)   # a backlit underwing's shadows lifted
    colour = np.clip(colour * np.array(spec['gain']), 0, 255)
    points = np.array(spec['points'], np.float64) - np.array([left, top])
    at = np.array(spec['at'], np.float64)
    semispan = span / 2
    chord_front, chord_back = 0.25, -0.75   # the flat wing's rect: forward of the shoulder to behind it (m)
    width_px = int(round(semispan * PIXELS_PER_METRE)) + 1
    height_px = int(round((chord_front - chord_back) * PIXELS_PER_METRE)) + 1
    # Flat wing px: column = m out from the axis, row = m back from chord_front.
    target = np.stack([at[:, 0] * PIXELS_PER_METRE, (chord_front - at[:, 1]) * PIXELS_PER_METRE], axis=1)
    homography = cv2.getPerspectiveTransform(points.astype(np.float32), target.astype(np.float32))
    rgba = np.dstack([colour, alpha * 255]).astype(np.float32)
    flat = cv2.warpPerspective(rgba, homography, (width_px, height_px), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    # Only the wing: what lies inboard of the shoulder (the body) is cut away.
    root_px = int(round(at[0, 0] * PIXELS_PER_METRE))
    flat[:, :root_px, 3] = 0
    # Its outline a pixel inside the cut-out's (the sky un-mixed from the edge leaves a pale fringe), solid within.
    solid = ndimage.binary_erosion(largest(flat[..., 3] > 128), iterations=2)
    flat[..., 3] = solid.astype(np.float32) * 255
    # Its leading and trailing edges at stations out along the span (from the root to the tip), m forward of the
    # shoulder; past the tip, none.
    stations = np.linspace(at[0, 0], semispan, STATIONS)
    leads, trails = [], []
    for s in stations:
        column = min(int(round(s * PIXELS_PER_METRE)), width_px - 1)
        rows = np.nonzero(flat[:, column, 3] > 128)[0]
        if len(rows) == 0:
            leads.append(None); trails.append(None); continue
        leads.append(round(float(chord_front - rows.min() / PIXELS_PER_METRE), 4))
        trails.append(round(float(chord_front - rows.max() / PIXELS_PER_METRE), 4))
    tip = max((s for s, lead in zip(stations, leads) if lead is not None), default=semispan)
    return Image.fromarray(flat.clip(0, 255).astype(np.uint8)), {
        'stations': [round(float(s), 4) for s in stations], 'lead': leads, 'trail': trails, 'tip': round(float(tip), 4),
        'rect': [0.0, chord_back, semispan, chord_front],
    }


def tinted(picture, tint):
    array = np.asarray(picture).astype(np.float64)
    array[..., :3] *= np.array(tint)
    return Image.fromarray(array.clip(0, 255).astype(np.uint8))


def tail_part(body_picture, body):
    """The tail fan's colour: the body's picture at the tail, stretched over a square."""
    left, bottom, right, top = body['rect']
    array = np.asarray(body_picture)
    width = array.shape[1]
    strip = array[:, : max(4, int(width * 0.12))]
    rows = np.nonzero(strip[..., 3].max(axis=1) > 128)[0]
    strip = strip[rows.min(): rows.max() + 1] if len(rows) else strip
    return Image.fromarray(strip).resize((96, 96), Image.LANCZOS)


def pack(parts):
    """Shelf-pack the parts into the smallest power-of-two square-ish image; their rects in uv (from the top left)."""
    order = sorted(parts, key=lambda name: -parts[name].size[1])
    for width in (256, 512, 1024, 2048):
        x = y = shelf = 0
        placed = {}
        fits = True
        for name in order:
            w, h = parts[name].size
            if w + 2 * PADDING > width:
                fits = False; break
            if x + w + 2 * PADDING > width:
                x, y = 0, y + shelf
                shelf = 0
            placed[name] = (x + PADDING, y + PADDING)
            x += w + 2 * PADDING
            shelf = max(shelf, h + 2 * PADDING)
        height = y + shelf
        if fits and height <= width:
            height = 1 << (height - 1).bit_length()
            atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            for name, (px, py) in placed.items():
                atlas.paste(parts[name], (px, py))
            uv = {name: [px / width, py / height, parts[name].size[0] / width, parts[name].size[1] / height] for name, (px, py) in placed.items()}
            return atlas, uv
    raise RuntimeError('the parts do not fit 2048 px')


def bleed(atlas):
    """The colour runs on under clear pixels, so a mip level's edge never darkens."""
    array = np.asarray(atlas).astype(np.float64)
    alpha = array[..., 3] > 8
    if not alpha.any():
        return atlas
    _, (rows, columns) = ndimage.distance_transform_edt(~alpha, return_indices=True)
    filled = array[rows, columns]
    filled[..., 3] = array[..., 3]
    return Image.fromarray(filled.astype(np.uint8))


def credit(spec):
    file = spec['file']
    return {'file': file, 'author': spec['author'], 'licence': spec['licence'][0], 'licenceUrl': spec['licence'][1],
            'source': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(file.replace(' ', '_'))}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    models = {}
    for kind, spec in KINDS.items():
        body_picture, body = body_part(spec['body'], spec['length'])
        wing_picture, wing = wing_part(spec['wing'], spec['span'])
        upper = spec['wing'].get('upper', {})
        upper_picture = tinted(wing_picture, upper.get('tint', (0.85, 0.85, 0.85)))
        parts = {'body': body_picture, 'under': wing_picture, 'upper': upper_picture, 'tail': tail_part(body_picture, body)}
        atlas, uv = pack(parts)
        atlas = bleed(atlas)
        file = f'{kind}-model.webp'   # beside tools/bird-sprites.py's pictures (assets/birds/<kind>.webp)
        atlas.save(OUT / file, 'WEBP', quality=88, method=6)
        models[kind] = {
            'atlas': file, 'size': list(atlas.size), 'length': spec['length'], 'span': spec['span'],
            'body': body, 'wing': wing, 'uv': uv,
            'credits': [credit(spec['body']), credit(spec['wing'])],
        }
        print(f'{kind}: {atlas.size[0]}×{atlas.size[1]}, {(OUT / file).stat().st_size // 1024} KB; wing tip {wing["tip"]} m')
    (OUT / 'models.json').write_text(json.dumps(models, indent=1))


if __name__ == '__main__':
    main()
