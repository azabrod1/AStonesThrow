# The birds' pictures (src/birdSprites.js draws them): photographs of real
# birds, cut out of their sky or water, scaled to the bird's size in metres
# and packed side by side into one image, assets/birds/birds.webp, with
# assets/birds/birds.json saying where each frame lies, its size in metres,
# where it is anchored and whose photograph it is. Run it again to rebuild
# both (never edit either):
#
#   python3 tools/bird-sprites.py          (numpy, scipy, Pillow with WebP, opencv-python-headless)
#
# The photographs (PHOTOS) are Wikimedia Commons files under licences that
# let them be used and changed with credit (CC BY) or freely (CC0); each
# frame's credit is written to birds.json, and the page shows them (index.html,
# the Birds setting's note). They are downloaded once into tools/.bird-photos/
# (gitignored), at Commons' 1280-pixel rendering, slowly, as Commons asks of
# scripts.
#
# How a bird is cut out (`cut`):
#   - 'sky': against a smooth sky. The sky behind it is fitted as a smooth
#     surface (a cubic in x and y, per channel) to the pixels far from the
#     bird's colours, refitted three times; a pixel's alpha is how far it is
#     from that sky (between `low` and `high`, 0-255 RGB distance); only the
#     largest piece is kept; the sky is un-mixed from the edge's pixels.
#   - 'blue': a grey and white bird against blue sky, where a grey wing is as
#     bright as the sky: the same, by how much less blue (B − R) it is than
#     the sky behind it.
#   - 'grabcut': against a busy background (the standing heron, on rocks
#     before reeds): OpenCV's GrabCut, started from a rough outline of the
#     bird and a few strokes of what is surely bird and surely not, cut at
#     `waterline` (its legs at mid-shin, so it stands in the water to there).
# Each frame faces left (`flip` turns one that faces right) and is scaled so
# its box is `metres` wide (or tall, `measure: 'height'`), at PIXELS_PER_METRE.
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.bird-photos'
OUT = ROOT / 'assets' / 'birds'
USER_AGENT = 'AStonesThrowBirdSprites/1.0 (https://github.com/azabrod1/AStonesThrow)'
ATLAS_WIDTH = 2048
PADDING = 4               # px between frames, so a mip level never borrows a neighbour's edge
PIXELS_PER_METRE = {'heron': 380, 'gull': 330}

CC_BY_2 = ('CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/')
CC_BY_4 = ('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/')
CC0 = ('CC0', 'https://creativecommons.org/publicdomain/zero/1.0/')

# Each frame: its photo (a Commons file), its author and licence, how it is cut, whether it faces right in the photo,
# its box's size in metres and where it is anchored (a share of its box: x from its left, y from its bottom; a flying
# bird's middle, a standing one's foot at the waterline).
PHOTOS = [
    # Standing on a rock, its legs cut at mid-shin: it stands in the water to there. Its outline and strokes are the
    # photo's (px at 1280 wide): what is surely bird, what is surely not.
    dict(frame='heron-stand', bird='heron', file='Grey heron 2025 10 26 02.jpg', author='Alexis Lours', licence=CC_BY_4,
         cut='grabcut', metres=0.85, measure='height', anchor='feet', waterline=700, box=(470, 90, 1160), feet=[(818, 700), (905, 700)],
         outline=[(490, 150), (600, 120), (650, 100), (700, 120), (715, 200), (700, 280), (760, 290), (950, 300), (1150, 380), (1150, 440), (1000, 470),
                  (930, 480), (930, 700), (885, 700), (885, 490), (845, 490), (840, 700), (795, 700), (800, 480), (720, 440), (650, 400), (640, 250),
                  (630, 180), (560, 165)],
         surely=[([(520, 150), (600, 148)], 3), ([(640, 140), (680, 140)], 10), ([(680, 170), (672, 250), (668, 330), (700, 400), (760, 420)], 12),
               ([(760, 380), (1060, 380)], 40), ([(800, 340), (1000, 340)], 20), ([(822, 490), (815, 690)], 5), ([(902, 490), (907, 690)], 5)],
         notBird=[([(860, 520), (862, 690)], 12), ([(950, 525), (1120, 525)], 20), ([(800, 255), (1100, 270)], 18), ([(560, 300), (600, 460)], 20),
                 ([(550, 60), (750, 60)], 20), ([(1175, 340), (1175, 460)], 16), ([(765, 190), (765, 270)], 14), ([(760, 520), (760, 690)], 14)]),
    dict(frame='heron-up', bird='heron', file='Ardea cinerea EM1B6250 (33380183305).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, metres=1.65, anchor=(0.55, 0.45)),
    dict(frame='heron-mid', bird='heron', file='Ardea cinerea EM1B6207 (32566003933).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, metres=1.3, anchor=(0.5, 0.55)),
    dict(frame='heron-down', bird='heron', file='Ardea cinerea EM1B1255 (41960911374).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, flip=True, metres=1.3, anchor=(0.45, 0.7)),
    dict(frame='heron-land', bird='heron', file='Ardea cinerea EM1B6259 (32537479404).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, metres=1.3, anchor=(0.45, 0.6)),
    dict(frame='gull-glide', bird='gull', file='Herring Gull (44562549102).jpg', author='Mike Prince', licence=CC_BY_2,
         cut='blue', low=14, high=34, metres=0.8, anchor=(0.45, 0.6)),
    dict(frame='gull-up', bird='gull', file='Gråtrut European Herring Gull (13896263568).jpg', author='Åsa Berndtsson', licence=CC_BY_2,
         cut='sky', low=18, high=45, flip=True, metres=0.8, anchor=(0.5, 0.3)),
    dict(frame='gull-front', bird='gull', file='Larus argentatus Tuileries 20180324 t144644.jpg', author='Marie-Lan Taÿ Pamart', licence=CC_BY_4,
         cut='blue', low=14, high=34, metres=1.4, anchor=(0.5, 0.5)),
]


def commons_url(file):
    """The file's 1280-pixel rendering on Commons (or the file itself, if it is no wider)."""
    query = urllib.parse.urlencode({'action': 'query', 'titles': 'File:' + file, 'prop': 'imageinfo', 'iiprop': 'url|size', 'format': 'json'})
    request = urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + query, headers={'User-Agent': USER_AGENT})
    info = next(iter(json.load(urllib.request.urlopen(request))['query']['pages'].values()))['imageinfo'][0]
    url = info['url'].split('?')[0]
    if info['width'] <= 1280:
        return url
    head, tail = url.split('/commons/')
    return f"{head}/commons/thumb/{tail}/1280px-{url.rsplit('/', 1)[1]}"


def photo(file):
    """The photo, from the cache or (slowly) from Commons."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / file.replace('/', '_')
    if not path.exists():
        time.sleep(5)
        url = commons_url(file)
        time.sleep(5)
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        path.write_bytes(urllib.request.urlopen(request, timeout=60).read())
        print(f'  downloaded {file}')
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64)


def fit_sky(image, mask):
    """A smooth surface (a cubic in x and y) fitted, per channel, to the image's pixels under mask."""
    height, width, _ = image.shape
    ys, xs = np.mgrid[0:height, 0:width]
    u, v = xs / width - 0.5, ys / height - 0.5
    basis = np.stack([np.ones_like(u), u, v, u * u, u * v, v * v, u ** 3, v ** 3, u * u * v, u * v * v], -1)
    coefficients, *_ = np.linalg.lstsq(basis[mask][::7], image[mask][::7], rcond=None)
    return basis @ coefficients


def largest(mask):
    labels, count = ndimage.label(mask)
    if not count:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == (np.argmax(sizes) + 1)


def cut_from_sky(image, low, high, blue):
    """'sky' and 'blue' (the header): the bird's alpha and its colours with the sky un-mixed from its edge."""
    if blue:
        blueness = image[..., 2] - image[..., 0]
        background = image
        skyish = blueness > np.percentile(blueness, 40)
        for _ in range(3):
            background = fit_sky(image, skyish)
            difference = (background[..., 2] - background[..., 0]) - blueness
            skyish = difference < low * 0.6
    else:
        border = np.concatenate([image[:8].reshape(-1, 3), image[-8:].reshape(-1, 3), image[:, :8].reshape(-1, 3), image[:, -8:].reshape(-1, 3)])
        skyish = np.linalg.norm(image - np.median(border, 0), axis=-1) < 40
        for _ in range(3):
            background = fit_sky(image, skyish)
            difference = np.linalg.norm(image - background, axis=-1)
            skyish = difference < low * 0.8
    alpha = np.clip((difference - low) / (high - low), 0, 1)
    alpha *= ndimage.binary_dilation(largest(ndimage.binary_closing(alpha > 0.5, iterations=3)), iterations=4)
    unmixed = np.clip(background + (image - background) / np.maximum(alpha, 0.05)[..., None], 0, 255)
    return alpha, np.where(alpha[..., None] > 0.98, image, unmixed)


def cut_grabcut(image, spec):
    """'grabcut' (the header): OpenCV's GrabCut from the spec's outline and strokes, cut at its waterline."""
    import cv2
    height, width, _ = image.shape
    waterline = spec['waterline']
    mask = np.full((height, width), cv2.GC_BGD, np.uint8)
    left, top, right = spec['box']
    cv2.rectangle(mask, (left, top), (right, waterline), cv2.GC_PR_BGD, -1)
    cv2.fillPoly(mask, [np.array(spec['outline'], np.int32)], cv2.GC_PR_FGD)
    for value, strokes in ((cv2.GC_FGD, spec['surely']), (cv2.GC_BGD, spec['notBird'])):
        for points, thickness in strokes:
            cv2.polylines(mask, [np.array(points, np.int32)], False, int(value), thickness)
    models = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(image.astype(np.uint8), cv2.COLOR_RGB2BGR), mask, None, *models, 8, cv2.GC_INIT_WITH_MASK)
    bird = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    bird[waterline:] = False
    bird = ndimage.binary_fill_holes(largest(bird))
    alpha = np.clip((ndimage.gaussian_filter(bird.astype(np.float64), 0.8) - 0.2) / 0.6, 0, 1)
    alpha[waterline:] = 0
    return alpha, image


def frame_image(spec):
    image = photo(spec['file'])
    if spec['cut'] == 'grabcut':
        alpha, colour = cut_grabcut(image, spec)
    else:
        alpha, colour = cut_from_sky(image, spec['low'], spec['high'], spec['cut'] == 'blue')
    ys, xs = np.nonzero(alpha > 0.02)
    left, top, right, bottom = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    picture = Image.fromarray(np.dstack([colour, alpha * 255]).astype(np.uint8)).crop((left, top, right, bottom))
    anchor = spec.get('anchor')
    if anchor == 'feet':
        legs = [x for x, _ in spec['feet']]
        anchor = ((sum(legs) / len(legs) - left) / (right - left), 0.0)
    if spec.get('flip'):
        picture = picture.transpose(Image.FLIP_LEFT_RIGHT)
        anchor = (1 - anchor[0], anchor[1])
    width, height = picture.size
    box = height if spec.get('measure') == 'height' else width
    scale = spec['metres'] * PIXELS_PER_METRE[spec['bird']] / box
    picture = picture.resize((max(round(width * scale), 1), max(round(height * scale), 1)), Image.LANCZOS)
    metres = (picture.size[0] / PIXELS_PER_METRE[spec['bird']], picture.size[1] / PIXELS_PER_METRE[spec['bird']])
    return picture, metres, anchor


def main():
    frames = []
    for spec in PHOTOS:
        picture, metres, anchor = frame_image(spec)
        frames.append((spec, picture, metres, anchor))
        print(f"{spec['frame']}: {picture.size[0]}×{picture.size[1]} px, {metres[0]:.2f}×{metres[1]:.2f} m")
    # Shelves, tallest first.
    order = sorted(range(len(frames)), key=lambda index: -frames[index][1].size[1])
    placed, x, y, shelf = {}, PADDING, PADDING, 0
    for index in order:
        width, height = frames[index][1].size
        if x + width + PADDING > ATLAS_WIDTH:
            x, y, shelf = PADDING, y + shelf + PADDING, 0
        placed[index] = (x, y)
        x += width + PADDING
        shelf = max(shelf, height)
    atlasHeight = 1 << int(np.ceil(np.log2(y + shelf + PADDING)))
    atlas = Image.new('RGBA', (ATLAS_WIDTH, atlasHeight), (0, 0, 0, 0))
    entries = {}
    for index, (spec, picture, metres, anchor) in enumerate(frames):
        left, top = placed[index]
        atlas.paste(picture, (left, top))
        width, height = picture.size
        # uv: from the image's top left, as the page samples it (uploaded unflipped, flipY false): x, y, width, height.
        entries[spec['frame']] = {
            'uv': [left / ATLAS_WIDTH, top / atlasHeight, width / ATLAS_WIDTH, height / atlasHeight],
            'metres': [round(metres[0], 4), round(metres[1], 4)],
            'anchor': [round(anchor[0], 4), round(anchor[1], 4)],
            'credit': {'file': spec['file'], 'author': spec['author'], 'licence': spec['licence'][0], 'licenceUrl': spec['licence'][1],
                       'source': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(spec['file'].replace(' ', '_'))},
        }
    OUT.mkdir(parents=True, exist_ok=True)
    # Un-premultiplied colour under every pixel the bird's edge reaches into (so filtering never darkens its edge with
    # the transparent black round it): each clear pixel takes its nearest bird pixel's colour.
    pixels = np.asarray(atlas).astype(np.float64)
    clear = pixels[..., 3] < 8
    nearest = ndimage.distance_transform_edt(clear, return_distances=False, return_indices=True)
    filled = pixels[nearest[0], nearest[1]]
    filled[..., 3] = pixels[..., 3]
    Image.fromarray(filled.astype(np.uint8)).save(OUT / 'birds.webp', quality=92, method=6, exact=True)
    json.dump({'size': [ATLAS_WIDTH, atlasHeight], 'frames': entries}, open(OUT / 'birds.json', 'w'), indent=1, ensure_ascii=False)
    print(f'birds.webp: {ATLAS_WIDTH}×{atlasHeight}, {(OUT / "birds.webp").stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
