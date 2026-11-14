# The birds' pictures (src/birdSprites.js draws them): photographs of real
# birds, cut out of their sky or water, scaled to the bird's size in metres
# and packed side by side, one image a kind (assets/birds/<kind>.webp, so a
# place fetches only its own birds'), with assets/birds/birds.json saying
# which image each frame is in, where it lies, its size in metres, where it
# is anchored and whose photograph it is. A kind drawn as a model
# (assets/birds/models.json, by tools/bird-models.py; src/birdMeshes.js) is
# not written: the page never fetches its pictures. Run it again to rebuild
# them all (never edit any):
#
#   python3 tools/bird-sprites.py          (numpy, scipy, Pillow with WebP, opencv-python-headless)
#
# The photographs (PHOTOS) are Wikimedia Commons files under licences that
# let them be used and changed with credit (CC BY) or freely (CC0, public
# domain); each
# frame's credit is written to birds.json (and listed in CREDITS.md). They are downloaded once into tools/.bird-photos/
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
#   With `fill`, either is made solid wherever the bird's outline closes
#   round: a white head against a pale sky keys through.
#   - 'grabcut': against a busy background (the standing heron, on rocks
#     before reeds): OpenCV's GrabCut, started from a rough outline of the
#     bird and a few strokes of what is surely bird and surely not, cut at
#     `waterline` (under its feet: what stands in the water is drawn there);
#     with `darkBelow` (a row, a brightness), only pixels darker than that are
#     bird below the row (the heron's dark toes on a pale rock).
# `crop` (a box in the 1280-pixel photo: left, top, right, bottom) cuts one
# bird out of a photo of two before it is keyed; `gain` (per channel)
# brings a photo taken in evening light to daylight, the kind's other frames'
# light, matched by the mean colour of its body's mid-tones; `darks` (a knee,
# 0-255, and a power) deepens only what is darker than the knee, a photo
# whose black head and wingtips the haze has washed grey. Each frame faces left
# (`flip` turns one that faces right) and is scaled so its box is `metres`
# wide (or tall, `measure: 'height'`), at its kind's PIXELS_PER_METRE: about
# 400 pixels across a flying bird's wings, more for the heron, seen nearest.
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
PADDING = 4               # px between frames, so a mip level never borrows a neighbour's edge
PIXELS_PER_METRE = {'heron': 380, 'herring': 330, 'kelp': 300, 'frigate': 190, 'fishEagle': 200, 'eagle': 200, 'goose': 400, 'swan': 190, 'ibis': 340, 'raven': 330}

CC_BY_2 = ('CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/')
CC_BY_3 = ('CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/')
CC_BY_4 = ('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/')
CC_BY_SA_2 = ('CC BY-SA 2.0', 'https://creativecommons.org/licenses/by-sa/2.0/')
CC0 = ('CC0', 'https://creativecommons.org/publicdomain/zero/1.0/')
PUBLIC_DOMAIN = ('Public domain', 'https://creativecommons.org/publicdomain/mark/1.0/')

# Each frame: its photo (a Commons file), its author and licence, how it is cut, whether it faces right in the photo,
# its box's size in metres and where it is anchored (a share of its box: x from its left, y from its bottom; a flying
# bird's middle, a standing one's between its feet).
PHOTOS = [
    # Standing on a rock, whole down to its toes: src/birdSprites.js draws what is under the water in the under-water
    # pass, so its legs go on down through the water to its feet on the bed. Its outline and strokes are the photo's (px
    # at 1280 wide): what is surely bird, what is surely not.
    dict(frame='heron-stand', bird='heron', file='Grey heron 2025 10 26 02.jpg', author='Alexis Lours', licence=CC_BY_4,
         cut='grabcut', metres=0.97, measure='height', anchor='feet', waterline=808, box=(470, 90, 1160), feet=[(793, 790), (908, 790)], darkBelow=(778, 100),
         outline=[(490, 150), (600, 120), (650, 100), (700, 120), (715, 200), (700, 280), (760, 290), (950, 300), (1150, 380), (1150, 440), (1000, 470),
                  (930, 480), (928, 755), (950, 765), (950, 792), (900, 798), (830, 810), (700, 808), (695, 790), (775, 762), (790, 700), (800, 480),
                  (720, 440), (650, 400), (640, 250), (630, 180), (560, 165)],
         surely=[([(520, 150), (600, 148)], 3), ([(640, 140), (680, 140)], 10), ([(680, 170), (672, 250), (668, 330), (700, 400), (760, 420)], 12),
               ([(760, 380), (1060, 380)], 40), ([(800, 340), (1000, 340)], 20), ([(822, 490), (805, 700), (794, 768)], 5), ([(902, 490), (907, 690), (908, 772)], 5),
               ([(790, 775), (706, 795)], 2), ([(792, 778), (722, 803)], 2), ([(795, 778), (800, 791)], 2),
               ([(905, 778), (822, 805)], 2), ([(912, 776), (938, 772)], 2), ([(909, 780), (913, 786)], 2)],
         notBird=[([(860, 520), (858, 752)], 12), ([(950, 525), (1120, 525)], 20), ([(800, 255), (1100, 270)], 18), ([(560, 300), (600, 460)], 20),
                 ([(550, 60), (750, 60)], 20), ([(1175, 340), (1175, 460)], 16), ([(765, 190), (765, 270)], 14), ([(760, 520), (766, 735)], 14),
                 ([(955, 560), (965, 745)], 14), ([(720, 700), (740, 760)], 14), ([(845, 770), (880, 770)], 6)]),
    dict(frame='heron-up', bird='heron', file='Ardea cinerea EM1B6250 (33380183305).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, metres=1.65, anchor=(0.55, 0.45)),
    dict(frame='heron-mid', bird='heron', file='Ardea cinerea EM1B6207 (32566003933).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, metres=1.3, anchor=(0.5, 0.55)),
    dict(frame='heron-down', bird='heron', file='Ardea cinerea EM1B1255 (41960911374).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, flip=True, metres=1.3, anchor=(0.45, 0.7)),
    dict(frame='heron-land', bird='heron', file='Ardea cinerea EM1B6259 (32537479404).jpg', author='Bengt Nyman', licence=CC_BY_2,
         cut='sky', low=20, high=48, metres=1.3, anchor=(0.45, 0.6)),
    # Kelp gulls: one photographer's, over Tierra del Fuego and the Antarctic Peninsula, under a white sky (their white
    # heads key through it: `fill`).
    dict(frame='kelp-glide', bird='kelp', file='Kelp gull half moon island 1.17.25 DSC 9790-topaz-rawdenoise.jpg', author='lwolfartist', licence=CC_BY_2,
         cut='sky', low=20, high=48, fill=True, metres=1.1, anchor=(0.45, 0.45)),
    dict(frame='kelp-up', bird='kelp', file='Kelp gull deesembocadura rio olivia DSC 3427-topaz-rawdenoise.jpg', author='lwolfartist', licence=CC_BY_2,
         cut='sky', low=20, high=48, fill=True, flip=True, metres=0.95, anchor=(0.6, 0.2)),
    dict(frame='kelp-down', bird='kelp', file='Kelp gull deesembocadura rio olivia DSC 3294-topaz-rawdenoise.jpg', author='lwolfartist', licence=CC_BY_2,
         cut='sky', low=20, high=48, fill=True, metres=1.05, anchor=(0.55, 0.6)),
    # A great frigatebird (immature) soaring over Midway Atoll, from below: banking, and coming on.
    dict(frame='frigate-glide', bird='frigate', file='Great Frigatebird ( immature) Eastern Island Midway Atoll 2019-01-07 16-16-20 (46379948975).jpg', author='Bettina Arrigoni', licence=CC_BY_2,
         cut='sky', low=35, high=80, fill=True, metres=1.9, anchor=(0.5, 0.6)),
    dict(frame='frigate-front', bird='frigate', file='Great Frigatebird ( immature) Eastern Island Midway Atoll 2019-01-07 16-22-01 (46571488854).jpg', author='Bettina Arrigoni', licence=CC_BY_2,
         cut='sky', low=35, high=80, fill=True, metres=2.2, anchor=(0.5, 0.6)),
    # Verreaux's eagle over the Walter Sisulu garden's cliffs, Gauteng: gliding, and its wings raised in a turn.
    dict(frame='eagle-glide', bird='eagle', file="Verreaux's Eagle. Black Eagle, Aquila verreauxii, at Walter Sisulu National Botanical Garden, Gauteng, South Africa (18987033114).jpg", author='Derek Keats', licence=CC_BY_2,
         cut='sky', low=35, high=80, metres=1.9, anchor=(0.45, 0.5)),
    dict(frame='eagle-up', bird='eagle', file="Verreaux's Eagle. Black Eagle, Aquila verreauxii, at Walter Sisulu National Botanical Garden, Gauteng, South Africa (19583407276).jpg", author='Derek Keats', licence=CC_BY_2,
         cut='sky', low=35, high=80, metres=1.6, anchor=(0.45, 0.45)),
    # Egyptian geese, a pair in flight over South Luangwa in the evening, each cut out of the one photo and brought to
    # daylight: wings rising, wings down.
    dict(frame='goose-mid', bird='goose', file='Egyptian goose, South Luangwa National Park (51871856029).jpg', author="I've Got It On Film!", licence=CC_BY_2,
         cut='sky', low=35, high=80, crop=(650, 260, 1150, 600), gain=(0.8, 1.02, 1.65), metres=1.1, anchor=(0.57, 0.25)),
    dict(frame='goose-down', bird='goose', file='Egyptian goose, South Luangwa National Park (51871856029).jpg', author="I've Got It On Film!", licence=CC_BY_2,
         cut='sky', low=35, high=80, crop=(180, 250, 690, 420), gain=(0.8, 1.02, 1.65), metres=1.08, anchor=(0.57, 0.3)),
    # Two Egyptian geese standing on a shore, both side on and facing right (the Pool's lawn): one upright, on its legs;
    # one resting, its head tucked in, on both. Cut by GrabCut, as the heron is, at the soles of their feet.
    dict(frame='goose-stand', bird='goose', file='Egyptian goose (1).jpg', author='The Blue Rider', licence=CC_BY_4,
         cut='grabcut', flip=True, metres=0.52, measure='height', anchor='feet', waterline=692, box=(500, 130, 1000), feet=[(805, 690)],
         outline=[(905, 145), (960, 160), (985, 215), (992, 235), (960, 230), (945, 260), (960, 330), (972, 380), (960, 450), (920, 530), (840, 545), (815, 560), (818, 660), (890, 670), (900, 690), (790, 692), (785, 560), (760, 540), (640, 520), (520, 535), (505, 515), (560, 460), (650, 390), (780, 310), (850, 300), (845, 220), (870, 160)],
         surely=[([(750, 450), (900, 450)], 40), ([(880, 200), (900, 320)], 12), ([(800, 560), (805, 670)], 6)],
         notBird=[([(560, 330), (700, 310)], 14), ([(1000, 300), (1000, 500)], 14), ([(860, 580), (940, 600)], 12), ([(550, 580), (700, 570)], 14), ([(850, 128), (950, 123)], 8)]),
    dict(frame='goose-rest', bird='goose', file='Egyptian goose (1).jpg', author='The Blue Rider', licence=CC_BY_4,
         cut='grabcut', flip=True, metres=0.33, measure='height', anchor='feet', waterline=752, box=(150, 395, 505), feet=[(325, 745), (385, 750)],
         outline=[(235, 420), (330, 405), (420, 405), (470, 425), (505, 470), (505, 530), (470, 600), (400, 630), (392, 720), (458, 735), (458, 752), (300, 752), (300, 735), (320, 720), (318, 640), (290, 620), (250, 650), (165, 660), (155, 600), (160, 560), (230, 500), (230, 460)],
         surely=[([(300, 500), (450, 500)], 40), ([(280, 450), (340, 440)], 15), ([(322, 640), (318, 720)], 5), ([(382, 640), (386, 730)], 5)],
         notBird=[([(350, 650), (352, 720)], 10), ([(180, 690), (290, 700)], 12), ([(200, 385), (450, 388)], 10), ([(480, 640), (500, 700)], 10), ([(335, 652), (372, 652)], 10), ([(340, 700), (372, 700)], 8), ([(298, 690), (311, 690)], 6), ([(290, 630), (312, 632)], 8), ([(338, 627), (370, 627)], 6), ([(250, 727), (295, 729)], 12), ([(262, 706), (297, 708)], 8), ([(245, 745), (292, 748)], 8)]),
    # Wings at the top of the stroke.
    dict(frame='goose-up', bird='goose', file='Nilgans (54254515720).jpg', author='Ralf Hüsges', licence=CC_BY_2,
         cut='sky', low=35, high=80, flip=True, metres=1.2, anchor=(0.5, 0.3)),
    # African fish eagles: gliding by (a post beside it cropped away), its wings raised, and coming on.
    dict(frame='fishEagle-glide', bird='fishEagle', file='2021 sep kenia-62 (51676976311).jpg', author='leopoldo de castro', licence=CC_BY_2,
         cut='sky', low=35, high=80, crop=(420, 0, 1280, 997), flip=True, metres=2.0, anchor=(0.45, 0.45)),
    dict(frame='fishEagle-up', bird='fishEagle', file='African fish eagle, Haliaeetus vocifer, at Chobe National Park, Botswana (32832146603).jpg', author='Derek Keats', licence=CC_BY_2,
         cut='sky', low=35, high=80, flip=True, metres=1.5, anchor=(0.55, 0.45)),
    dict(frame='fishEagle-front', bird='fishEagle', file='African fish eagle, Haliaeetus vocifer, at Lake Chivero, Harare, Zimbabwe (21908277406).jpg', author='Derek Keats', licence=CC_BY_2,
         cut='sky', low=35, high=80, metres=1.9, anchor=(0.45, 0.55)),
    # Mute swans: wings down, level and up.
    dict(frame='swan-down', bird='swan', file='After eating the family was leaving Houten - panoramio.jpg', author='Henk Mons', licence=CC_BY_3,
         cut='sky', low=20, high=48, fill=True, metres=1.9, anchor=(0.6, 0.55)),
    dict(frame='swan-mid', bird='swan', file='Banking to the Left.jpg', author='Charlie From Bristol', licence=CC_BY_2,
         cut='sky', low=20, high=48, fill=True, flip=True, metres=1.7, anchor=(0.45, 0.6)),
    dict(frame='swan-up', bird='swan', file='Mute Swan (8940930326).jpg', author='Andy Morffew', licence=CC_BY_2,
         cut='sky', low=20, high=48, fill=True, flip=True, metres=1.9, anchor=(0.45, 0.25)),
    # African sacred ibises: wings down and up (one photographer's, in a warm light), and gliding, seen from a little
    # below (one of Taiwan's feral birds, under a white sky: brought to the others' light), so a gliding flock is not
    # one wingbeat's picture over and over.
    dict(frame='ibis-glide', bird='ibis', file='Flying (16591530356).jpg', author='Charles Lam', licence=CC_BY_SA_2,
         cut='sky', low=20, high=48, fill=True, flip=True, gain=(0.92, 0.78, 0.66), darks=(110, 2.5), metres=0.95, anchor=(0.5, 0.5)),
    dict(frame='ibis-down', bird='ibis', file='Threskiornis aethiopicus (29779757897).jpg', author='Donald Hobern', licence=CC_BY_2,
         cut='sky', low=20, high=48, fill=True, flip=True, metres=0.95, anchor=(0.45, 0.55)),
    dict(frame='ibis-up', bird='ibis', file='Threskiornis aethiopicus (44667354662).jpg', author='Donald Hobern', licence=CC_BY_2,
         cut='sky', low=20, high=48, fill=True, flip=True, metres=0.95, anchor=(0.45, 0.4)),
    # Common ravens over Seedskadee, Wyoming (US Fish and Wildlife Service, public domain): gliding, wings down, up.
    dict(frame='raven-glide', bird='raven', file='Common Raven on Seedskadee NWR (22849558584).jpg', author='USFWS Mountain-Prairie', licence=PUBLIC_DOMAIN,
         cut='sky', low=35, high=80, metres=0.95, anchor=(0.35, 0.55)),
    dict(frame='raven-down', bird='raven', file='Common Raven on Seedskadee NWR (22850605113).jpg', author='USFWS Mountain-Prairie', licence=PUBLIC_DOMAIN,
         cut='sky', low=35, high=80, metres=0.9, anchor=(0.4, 0.5)),
    dict(frame='raven-up', bird='raven', file='Common Raven on Seedskadee NWR (23181911180).jpg', author='USFWS Mountain-Prairie', licence=PUBLIC_DOMAIN,
         cut='sky', low=35, high=80, metres=0.85, anchor=(0.4, 0.4)),
    dict(frame='herring-glide', bird='herring', file='Herring Gull (44562549102).jpg', author='Mike Prince', licence=CC_BY_2,
         cut='blue', low=14, high=34, metres=0.8, anchor=(0.45, 0.6)),
    dict(frame='herring-up', bird='herring', file='Gråtrut European Herring Gull (13896263568).jpg', author='Åsa Berndtsson', licence=CC_BY_2,
         cut='sky', low=18, high=45, flip=True, metres=0.8, anchor=(0.5, 0.3)),
    dict(frame='herring-front', bird='herring', file='Larus argentatus Tuileries 20180324 t144644.jpg', author='Marie-Lan Taÿ Pamart', licence=CC_BY_4,
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


def cut_from_sky(image, low, high, blue, fill=False):
    """'sky' and 'blue' (the header): the bird's alpha and its colours with the sky un-mixed from its edge; `fill`
    makes it solid wherever its outline closes round (a white head against a white sky keyed through)."""
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
    if fill:
        solid = ndimage.binary_fill_holes(ndimage.binary_closing(alpha > 0.5, iterations=2))
        alpha = np.maximum(alpha, ndimage.binary_erosion(solid, iterations=2))
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
    if 'darkBelow' in spec:   # dark toes on a pale rock: below that row only what is darker than the rock is bird
        row, brightest = spec['darkBelow']
        bird[row:] &= image[row:].mean(axis=2) < brightest
    bird = ndimage.binary_fill_holes(largest(bird))
    alpha = np.clip((ndimage.gaussian_filter(bird.astype(np.float64), 0.8) - 0.2) / 0.6, 0, 1)
    alpha[waterline:] = 0
    return alpha, image


def frame_image(spec):
    image = photo(spec['file'])
    if 'crop' in spec:
        crop_left, crop_top, crop_right, crop_bottom = spec['crop']
        image = image[crop_top:crop_bottom, crop_left:crop_right]
    if spec['cut'] == 'grabcut':
        alpha, colour = cut_grabcut(image, spec)
    else:
        alpha, colour = cut_from_sky(image, spec['low'], spec['high'], spec['cut'] == 'blue', spec.get('fill', False))
    if 'gain' in spec:
        colour = np.clip(colour * np.array(spec['gain']), 0, 255)
    if 'darks' in spec:
        knee, power = spec['darks']
        colour = np.where(colour < knee, knee * (colour / knee) ** power, colour)
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


def pack(frames):
    """Shelves, tallest first, in the narrowest power-of-two width that keeps the image no taller than it is wide:
    each frame's top left (px), and the image's size."""
    widest = max(picture.size[0] for _, picture, _, _ in frames) + 2 * PADDING
    width = 1 << int(np.ceil(np.log2(widest)))
    while True:
        order = sorted(range(len(frames)), key=lambda index: -frames[index][1].size[1])
        placed, x, y, shelf = {}, PADDING, PADDING, 0
        for index in order:
            frame_width, frame_height = frames[index][1].size
            if x + frame_width + PADDING > width:
                x, y, shelf = PADDING, y + shelf + PADDING, 0
            placed[index] = (x, y)
            x += frame_width + PADDING
            shelf = max(shelf, frame_height)
        height = 1 << int(np.ceil(np.log2(y + shelf + PADDING)))
        if height <= width:
            return placed, (width, height)
        width *= 2


def bleed(atlas):
    """Un-premultiplied colour under every pixel the bird's edge reaches into (so filtering never darkens its edge with
    the transparent black round it): each clear pixel takes its nearest bird pixel's colour."""
    pixels = np.asarray(atlas).astype(np.float64)
    clear = pixels[..., 3] < 8
    nearest = ndimage.distance_transform_edt(clear, return_distances=False, return_indices=True)
    filled = pixels[nearest[0], nearest[1]]
    filled[..., 3] = pixels[..., 3]
    return Image.fromarray(filled.astype(np.uint8))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    atlases, entries = {}, {}
    modelled = set(json.load(open(OUT / 'models.json')))
    for kind in dict.fromkeys(spec['bird'] for spec in PHOTOS if spec['bird'] not in modelled):
        frames = []
        for spec in (spec for spec in PHOTOS if spec['bird'] == kind):
            picture, metres, anchor = frame_image(spec)
            frames.append((spec, picture, metres, anchor))
            print(f"{spec['frame']}: {picture.size[0]}×{picture.size[1]} px, {metres[0]:.2f}×{metres[1]:.2f} m")
        placed, (width, height) = pack(frames)
        atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        for index, (spec, picture, metres, anchor) in enumerate(frames):
            left, top = placed[index]
            atlas.paste(picture, (left, top))
            frame_width, frame_height = picture.size
            # uv: from the image's top left, as the page samples it (uploaded unflipped, flipY false): x, y, width, height.
            entries[spec['frame']] = {
                'atlas': kind,
                'uv': [left / width, top / height, frame_width / width, frame_height / height],
                'metres': [round(metres[0], 4), round(metres[1], 4)],
                'anchor': [round(anchor[0], 4), round(anchor[1], 4)],
                'credit': {'file': spec['file'], 'author': spec['author'], 'licence': spec['licence'][0], 'licenceUrl': spec['licence'][1],
                           'source': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(spec['file'].replace(' ', '_'))},
            }
        bleed(atlas).save(OUT / f'{kind}.webp', quality=92, method=6, exact=True)
        atlases[kind] = {'file': f'{kind}.webp', 'size': [width, height]}
        print(f'{kind}.webp: {width}×{height}, {(OUT / f"{kind}.webp").stat().st_size // 1024} KB')
    json.dump({'atlases': atlases, 'frames': entries}, open(OUT / 'birds.json', 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
