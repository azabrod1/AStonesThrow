# The birds' models (src/birdMeshes.js builds and moves them): for each kind,
# its shape in metres and its pictures, taken from photographs of the real
# bird, written to assets/birds/<kind>-model.webp (one image a kind) and
# assets/birds/models.json. Run it again to rebuild them all (never edit
# any):
#
#   python3 tools/bird-models.py [kind ...]   (numpy, scipy, Pillow with WebP, opencv-python-headless; the kinds named,
#                                             else all)
#
# A bird is a 3D model shaped and painted from photographs (KINDS): the
# photographs are Wikimedia Commons files under licences that let them be
# used and changed with credit (CC BY) or freely (CC0, public domain),
# downloaded once into tools/.bird-photos/ (gitignored) at Commons' 1280-pixel
# rendering, and each one's credit written to models.json (and listed in
# CREDITS.md).
#
# Its parts:
#   - the body, side on: its outline traced on a side-on photograph (`outline`,
#     photo px, the bird facing right after `flip`), from the bill's tip round
#     the crown, the back (along the wing's root where a wing hides it), the
#     tail, the belly and the throat; scaled so the bill's tip to the tail's
#     tip is the kind's `length`. The picture is that photo cut to the
#     outline; models.json carries the outline's top and bottom at stations
#     along the body, which src/birdMeshes.js lofts into a round body painted
#     from the side. A crested bird's `crown` traces its skull's top under the
#     crest, from the bill's base to the nape: models.json carries its height
#     at the same stations, and the head is lofted to it, the crest above it a
#     thin fin, as a crest is (not a cone as wide as the head).
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
import sys
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
PIXELS_PER_METRE = 420    # every part's picture: about this sharp (a 2 m eagle's wing 420 px out), but a kind's own `pixelsPerMetre`
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
    # Grey heron: standing side on on a rock (cut out by GrabCut, whole down to its toes), its trunk, neck and head and
    # legs traced on it; a wing from a heron overhead (its far wing raised, spread flat to the camera).
    'heron': dict(
        length=0.92, span=1.75, standing=True,
        side=dict(file='Grey heron 2025 10 26 02.jpg', author='Alexis Lours', licence=CC_BY_4,
                  bill=(492, 148), tail=(1137, 395), hips=(856, 480),
                  # GrabCut's start (as tools/bird-sprites.py cut it): a box, an outline, strokes surely bird and surely not.
                  box=(470, 90, 1160), waterline=808, darkBelow=(778, 100),
                  outline=[(490, 150), (600, 120), (650, 100), (700, 120), (715, 200), (700, 280), (760, 290), (950, 300), (1150, 380), (1150, 440), (1000, 470),
                           (930, 480), (928, 755), (950, 765), (950, 792), (900, 798), (830, 810), (700, 808), (695, 790), (775, 762), (790, 700), (800, 480),
                           (720, 440), (650, 400), (640, 250), (630, 180), (560, 165)],
                  surely=[([(520, 150), (600, 148)], 3), ([(640, 140), (680, 140)], 10), ([(680, 170), (672, 250), (668, 330), (700, 400), (760, 420)], 12),
                          ([(760, 380), (1060, 380)], 40), ([(800, 340), (1000, 340)], 20), ([(822, 490), (805, 700), (794, 768)], 5), ([(902, 490), (907, 690), (908, 772)], 5),
                          ([(790, 775), (706, 795)], 2), ([(792, 778), (722, 803)], 2), ([(795, 778), (800, 791)], 2),
                          ([(905, 778), (822, 805)], 2), ([(912, 776), (938, 772)], 2), ([(909, 780), (913, 786)], 2)],
                  notBird=[([(860, 520), (858, 752)], 12), ([(950, 525), (1120, 525)], 20), ([(800, 255), (1100, 270)], 18), ([(560, 300), (600, 460)], 20),
                           ([(550, 60), (750, 60)], 20), ([(1175, 340), (1175, 460)], 16), ([(765, 190), (765, 270)], 14), ([(760, 520), (766, 735)], 14),
                           ([(955, 560), (965, 745)], 14), ([(720, 700), (740, 760)], 14), ([(845, 770), (880, 770)], 6)],
                  # The trunk: from where the neck leaves the breast round the back, the tail and the belly.
                  trunk=[(705, 325), (760, 298), (820, 292), (890, 296), (960, 310), (1020, 332), (1080, 358), (1130, 382), (1138, 396), (1128, 410), (1102, 428),
                         (1080, 444), (1040, 460), (1000, 470), (960, 476), (910, 482), (860, 484), (820, 480), (785, 465), (750, 448), (720, 428), (702, 400), (698, 360)],
                  # The neck's middle line from inside the breast up to the head, and on to the bill's tip; where the head begins.
                  neck=[(735, 385), (695, 360), (672, 310), (668, 260), (684, 210), (690, 175), (668, 142), (640, 140), (600, 146), (545, 148), (492, 148)],
                  nape=5,
                  # Each leg: its hip (in the body), its heel (the joint halfway down), its foot, and its toes' tips.
                  legs=[dict(hip=(822, 470), heel=(820, 605), foot=(790, 775), toes=[(730, 800), (760, 798), (835, 782)]),
                        dict(hip=(892, 470), heel=(905, 605), foot=(908, 772), toes=[(830, 802), (860, 800), (940, 774)])]),
        wing=dict(file='Ardea cinerea EM1B6250 (33380183305).jpg', author='Bengt Nyman', licence=CC_BY_2,
                  side='right', crop=(600, 80, 960, 620),
                  mask=[(636, 520), (700, 400), (760, 300), (830, 150), (862, 100), (880, 95), (902, 135), (895, 215), (875, 300), (872, 350), (855, 395),
                        (830, 455), (783, 540), (762, 582), (700, 565), (645, 548)],
                  points=[(643, 523), (760, 577), (723, 337), (868, 347)],
                  at=[(0.08, 0.06), (0.08, -0.27), (0.49, 0.06), (0.56, -0.24)],
                  low=20, high=48, gamma=1.0, gain=(1.08, 1.0, 0.9), neutral=True, upper=dict(tint=(1.0, 1.0, 1.0)), under=dict(tint=(0.9, 0.9, 0.9))),
    ),
    # Blue jay (the Reflecting Pool): its body side on, foraging on the ground (its head raised, so levelled along its
    # body: `level`; its folded wing painted out, `repaint`, the back's blue down to where the spread wing's root is and
    # the grey flank under it), its wing from above as one came in to land, wings spread (its underside made from it: a jay's
    # blue is its upper side's only, the feathers grey beneath). That photograph is CC BY-SA, so this kind's image is
    # shared so too.
    'blueJay': dict(
        length=0.28, span=0.40, pixelsPerMetre=1500,
        body=dict(file='Bluejay (Cyanocitta cristata).jpg', author='Sam', licence=CC_BY_2, flip=True, cut='outline', inset=3,
                  bill=(208, 62), tail=(1114, 494), level=[(330, 250), (870, 400)],
                  repaint=[dict(back=(445, 185), polygon=[(480, 135), (600, 190), (700, 250), (800, 312), (870, 362), (900, 392), (860, 410), (780, 398), (700, 389),
                            (620, 384), (540, 383), (470, 366), (430, 322), (430, 250), (455, 175)])],
                  outline=[(208, 62), (240, 61), (275, 64), (300, 58), (330, 52), (370, 52), (405, 62), (428, 97), (452, 131), (510, 155), (570, 195), (620, 232), (660, 258), (710, 272), (760, 298), (800, 328), (840, 358), (875, 382), (920, 400), (990, 428), (1055, 458), (1100, 480), (1114, 494), (1095, 507), (1040, 494), (970, 470), (905, 447), (850, 425), (800, 413), (745, 422), (690, 440), (640, 470), (600, 492), (556, 490), (507, 482), (466, 463), (428, 434), (397, 400), (370, 358), (345, 310), (333, 255), (322, 215), (306, 180), (290, 145), (270, 112), (252, 90), (228, 76)]),
        wing=dict(file='Blue Jay (Jim Ridley 2010.).jpg', author='Jim Ridley', licence=CC_BY_SA_4, face='upper', cut='grabcut',
                  side='right', crop=(80, 220, 410, 425),
                  mask=[(228, 236), (300, 232), (370, 236), (400, 244), (400, 262), (385, 290), (365, 320), (340, 345), (312, 362), (290, 380),
                        (260, 398), (225, 408), (185, 412), (140, 416), (100, 416), (92, 408), (110, 390), (135, 365), (150, 345), (165, 322),
                        (185, 295), (205, 268), (220, 250)],
                  points=[(225, 246), (392, 252), (168, 318), (318, 352)],
                  at=[(0.025, 0.012), (0.025, -0.063), (0.099, 0.012), (0.109, -0.055)],
                  gain=(1.0, 1.0, 1.0), under=dict(grey=0.85, tint=(0.92, 0.93, 0.97))),
        tailColour='body',
    ),
    # Northern cardinal, a male (the Reflecting Pool): side on on a branch, perched upright (levelled along its body),
    # its tail swung back into line and its head up, bill forward (`swing`), as it holds them in flight; its crest a fin
    # over its skull (`crown`); its folded wing's pale tips painted out over its rump (`repaint`); a wing raised as one landed, its underside
    # to the camera (its upper side tinted from it). That photograph is CC BY-SA, so this kind's image is shared so too.
    'cardinal': dict(
        length=0.22, span=0.29, pixelsPerMetre=1500,
        body=dict(file='Cardinalis cardinalis (northern cardinal) 2.jpg', author='James St. John', licence=CC_BY_2, flip=True, cut='outline', inset=2, gain=(0.9, 0.9, 0.92),
                  bill=(172, 216), tail=(566, 632), level=[(235, 300), (480, 455)],
                  swing=[dict(part='tail', hinge=(495, 470), turn=-33), dict(part='head', hinge=(262, 262), turn=30, blend=30)],
                  crown=[(209, 178), (222, 160), (250, 150), (280, 153), (305, 168), (337, 197)],
                  repaint=[dict(polygon=[(455, 395), (500, 410), (545, 440), (570, 470), (580, 505), (560, 510), (520, 490), (480, 470), (455, 450)])],
                  outline=[(172,216), (191,200), (209,178), (221,137), (233,99), (246,66), (259,84), (275,125), (291,153), (300,169), (337,197), (381,228), (425,259), (462,294), (487,325), (512,356), (534,387), (550,425), (562,462), (569,500), (572,550), (575,600), (566,631), (537,634), (500,569), (475,525), (459,491), (437,482), (410,476), (373,465), (346,451), (306,415), (271,377), (250,327), (242,275), (236,250), (232,232), (222,226), (200,226), (180,221)]),
        wing=dict(file='Cardinal landing - Texas (55088178980).jpg', author='Andy Morffew', licence=CC_BY_SA_4,
                  side='right', crop=(270, 140, 440, 490),
                  mask=[(410, 400), (412, 330), (410, 275), (398, 240), (380, 205), (360, 175), (340, 155), (320, 150), (300, 160), (288, 185),
                        (285, 230), (288, 280), (292, 330), (300, 380), (314, 435), (328, 475), (360, 482), (398, 445)],
                  points=[(405, 395), (325, 468), (408, 280), (295, 300)],
                  at=[(0.022, 0.010), (0.022, -0.060), (0.095, 0.010), (0.100, -0.055)],
                  cut='grabcut', gain=(0.95, 0.72, 0.7), upper=dict(tint=(1.0, 0.62, 0.6))),
        tailColour='body',
    ),
}
SIDE_PIXELS_PER_METRE = 600   # a standing bird's side picture: sharper, as it is seen near


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


def mended(image, spec, outline=None):
    """The photo with what lies across the bird painted out (OpenCV's inpainting): `mend`, strokes (points, thickness)
    over a twig or a branch; `despeckle`, inside the outline, specks brighter than their surroundings by that much
    (snowflakes on a red bird)."""
    if not spec.get('mend') and not spec.get('despeckle'):
        return image
    mask = np.zeros(image.shape[:2], np.uint8)
    for points, thickness in spec.get('mend', []):
        cv2.polylines(mask, [np.array(points, np.int32)], False, 255, thickness)
    if spec.get('despeckle') and outline is not None:
        inside = np.zeros(image.shape[:2], np.uint8)
        cv2.fillPoly(inside, [np.round(outline).astype(np.int32)], 1)
        green = image[..., 1].astype(np.float32)
        surroundings = cv2.medianBlur(image[..., 1].astype(np.uint8), 15).astype(np.float32)
        specks = (green - surroundings > spec['despeckle']) & (inside > 0)
        mask |= cv2.dilate(specks.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    painted = cv2.inpaint(cv2.cvtColor(image.astype(np.uint8), cv2.COLOR_RGB2BGR), mask, 5, cv2.INPAINT_TELEA)
    return cv2.cvtColor(painted, cv2.COLOR_BGR2RGB).astype(np.float64)


def repainted(image, spec, outline):
    """A perched bird's folded wing painted out of its body (`repaint`: patches, each a `polygon` in photo px): in
    flight the wing is spread, so what shows there is the back above and the flank below. A patch is filled from the
    bird's own pixels round it (well inside the outline, never the background past it or the fringe just inside),
    smoothly (OpenCV's inpainting on a quarter-size image, so it blends over the patch rather than streaking in from
    its edge); with a `back` (a photo point on the bird's back or mantle), each column of it instead runs from that
    colour at its top (the back, down to the wing's root) to the flank's colour just under it. Then the photo's feather
    grain is given back (fine noise at the strength of the bird's own fine detail round the patch), and the patch is
    blended in over several pixels."""
    if not spec.get('repaint'):
        return image
    height, width, _ = image.shape
    inside = np.zeros((height, width), np.uint8)
    cv2.fillPoly(inside, [np.round(outline).astype(np.int32)], 1)
    traced_inside = inside.copy()
    inside = cv2.erode(inside, np.ones((13, 13), np.uint8))   # the trace's edge may hold a little background
    result = image.copy()
    for number, entry in enumerate(spec['repaint']):
        patch = np.zeros((height, width), np.uint8)
        cv2.fillPoly(patch, [np.array(entry['polygon'], np.int32)], 1)
        known = (inside > 0) & (patch == 0)
        _, (near_rows, near_columns) = ndimage.distance_transform_edt(~known, return_indices=True)
        filled = np.where(known[..., None], image, image[near_rows, near_columns])
        small = cv2.resize(filled.astype(np.uint8), (width // 4, height // 4), interpolation=cv2.INTER_AREA)
        small_patch = cv2.dilate(cv2.resize(patch * 255, (width // 4, height // 4), interpolation=cv2.INTER_NEAREST), np.ones((3, 3), np.uint8))
        smooth = cv2.inpaint(small, small_patch, 6, cv2.INPAINT_TELEA)
        smooth = cv2.resize(smooth, (width, height), interpolation=cv2.INTER_CUBIC).astype(np.float64)
        if 'back' in entry:
            bx, by = entry['back']
            back = image[by - 4:by + 5, bx - 4:bx + 5].reshape(-1, 3).mean(axis=0)
            columns = np.flatnonzero(patch.any(axis=0))
            flanks = []
            for column in columns:   # the flank's colour under each column (the median: never a stray wing bar's tip)
                bottom = np.flatnonzero(patch[:, column]).max()
                below = [row for row in range(bottom + 3, min(bottom + 20, height)) if known[row, column]]
                flanks.append(np.median(image[below, column], axis=0) if below else smooth[bottom, column])
            flanks = ndimage.median_filter(np.array(flanks), size=(31, 1), mode='nearest')
            flanks = ndimage.uniform_filter1d(flanks, 15, axis=0, mode='nearest')
            for column, flank in zip(columns, flanks):
                rows = np.flatnonzero(patch[:, column])
                bird_rows = np.flatnonzero(traced_inside[:, column])   # its top: the back's line, where the patch passes it
                top, bottom = max(rows.min(), bird_rows.min() if len(bird_rows) else 0), rows.max()
                share = np.clip((rows - top) / max(bottom - top, 1), 0, 1)
                share = np.clip((share - 0.45) / 0.5, 0, 1)   # the back's colour down to about the wing's root
                share = share * share * (3 - 2 * share)
                smooth[rows, column] = back * (1 - share[:, None]) + flank * share[:, None]
        smooth = cv2.GaussianBlur(smooth, (0, 0), 3)
        luminance = image @ np.array([0.299, 0.587, 0.114])
        detail = luminance - ndimage.gaussian_filter(luminance, 2.5)
        ring = cv2.dilate(patch, np.ones((25, 25), np.uint8)).astype(bool) & known
        strength = 1.4826 * float(np.median(np.abs(detail[ring]))) if ring.any() else 0.0   # robust: not the edges' spikes
        grain = ndimage.gaussian_filter(np.random.default_rng(7 + number).standard_normal((height, width)), 1.0)
        grain *= strength / max(float(np.std(grain)), 1e-6)
        painted = np.clip(smooth + grain[..., None] * (smooth / np.maximum(smooth.mean(axis=-1, keepdims=True), 1)), 0, 255)
        blend = ndimage.gaussian_filter(patch.astype(np.float64), 5.0)[..., None]
        result = result * (1 - blend) + painted * blend
    return result


def tail_turned(image, spec, points):
    """A perched bird's tail and head as it holds them in flight (`swing`, each a hinge, a turn in degrees and its
    `part`: the tail behind the hinge along the body's axis, or the head ahead of it): the photo warped, blended in over a
    few pixels at the hinge, and the traced points with it."""
    for turn in spec.get('swing', []):
        image, points = swung(image, spec, points, turn)
    return image, points


def swung(image, spec, points, turn):
    """One of tail_turned's swings."""
    hinge = np.array(turn['hinge'], np.float64)
    (front_x, front_y), (back_x, back_y) = spec['level'] if 'level' in spec else (spec['bill'], spec['tail'])
    axis = np.array([back_x - front_x, back_y - front_y], np.float64)
    axis /= np.hypot(*axis)
    if turn.get('part') == 'head':   # ahead of the hinge, not behind it
        axis = -axis
    angle = np.radians(turn['turn'])
    blend = turn.get('blend', 12)
    def weight(along):
        share = np.clip(along / blend, 0, 1)
        return share * share * (3 - 2 * share)
    def rotate(offsets, angles):
        cos, sin = np.cos(angles), np.sin(angles)
        return np.stack([offsets[..., 0] * cos - offsets[..., 1] * sin, offsets[..., 0] * sin + offsets[..., 1] * cos], axis=-1)
    # The photo: each pixel behind the hinge taken from where it was before the swing.
    height, width, _ = image.shape
    columns, rows = np.meshgrid(np.arange(width, dtype=np.float64), np.arange(height, dtype=np.float64))
    offsets = np.stack([columns - hinge[0], rows - hinge[1]], axis=-1)
    along = offsets @ axis
    source = rotate(offsets, -angle * weight(along)) + hinge
    warped = cv2.remap(image.astype(np.float32), source[..., 0].astype(np.float32), source[..., 1].astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    # The points: swung likewise.
    point_offsets = np.asarray(points, np.float64) - hinge
    moved = rotate(point_offsets, angle * weight(point_offsets @ axis)) + hinge
    return warped.astype(np.float64), moved


def body_part(spec, length, pixels=PIXELS_PER_METRE):
    """The body side on: its picture (RGBA, pixels), and its outline's top and bottom along it (m)."""
    image = photo(spec['file'])
    traced = np.array(spec['outline'], np.float64)
    crown_traced = np.array(spec.get('crown', []), np.float64).reshape(-1, 2)
    image = repainted(mended(image, spec, traced), spec, traced)
    image, moved = tail_turned(image, spec, np.vstack([traced, crown_traced, [spec['bill'], spec['tail']]]))
    outline, crown, (bill_point, tail_point) = moved[:len(traced)], moved[len(traced):-2], moved[-2:]
    if spec.get('cut') == 'outline':   # not against a sky: GrabCut started from the outline (what of the ground or a
        alpha, colour = cut_traced(image, outline), image   # branch lies inside it takes the bird's nearest colour)
    else:
        alpha, colour = cut_from_sky(image, spec['low'], spec['high'])
    colour = np.clip(colour * np.array(spec.get('gain', (1.0, 1.0, 1.0))), 0, 255)
    if spec.get('flip'):
        width = image.shape[1]
        outline[:, 0] = width - 1 - outline[:, 0]
        crown[:, 0] = width - 1 - crown[:, 0]
        alpha, colour = alpha[:, ::-1], colour[:, ::-1]
    bill, tail = bill_point.copy(), tail_point.copy()
    level = np.array(spec['level'], np.float64) if 'level' in spec else np.array([bill, tail])
    if spec.get('flip'):
        bill[0], tail[0] = image.shape[1] - 1 - bill[0], image.shape[1] - 1 - tail[0]
        level[:, 0] = image.shape[1] - 1 - level[:, 0]
    # Photo px to metres: the bill's tip at x = +length/2, the tail's tip at −length/2, up the photo's up, turned so
    # the line between them is level (or `level`'s two points, front then back, the body's own axis where the head is
    # raised: the bill and the tail then set only the length, along that axis).
    axis = level[0] - level[1]
    axis /= np.hypot(*axis)
    along = bill - tail
    scale = length / abs(along @ axis)
    angle = np.arctan2(axis[1], axis[0])
    rotation = np.array([[np.cos(-angle), -np.sin(-angle)], [np.sin(-angle), np.cos(-angle)]])
    middle = (bill + tail) / 2
    def to_metres(points):
        local = (points - middle) @ rotation.T * scale
        return np.stack([local[:, 0], -local[:, 1]], axis=1)
    outline_m = to_metres(outline)
    # The picture: the photo turned level and scaled, cut to the outline.
    # Its extent: the outline's (an upright bird levelled along its body may reach past its bill's tip with its crest).
    top, bottom = outline_m[:, 1].max(), outline_m[:, 1].min()
    left, right = min(-length / 2, outline_m[:, 0].min()), max(length / 2, outline_m[:, 0].max())
    width_px = int(round((right - left) * pixels)) + 1
    height_px = int(round((top - bottom) * pixels)) + 1
    # Picture px (column, row) to photo px: metres, then back through the rotation.
    inverse = np.linalg.inv(rotation)
    columns, rows = np.meshgrid(np.arange(width_px), np.arange(height_px))
    metres_x = left + columns / pixels
    metres_y = top - rows / pixels
    local = np.stack([metres_x / scale, -metres_y / scale], axis=-1) @ inverse.T + middle
    map_x, map_y = local[..., 0].astype(np.float32), local[..., 1].astype(np.float32)
    rgba = np.dstack([colour, alpha * 255]).astype(np.float32)
    picture = cv2.remap(rgba, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    inside = np.zeros((height_px, width_px), np.uint8)
    polygon = np.stack([(outline_m[:, 0] - left) * pixels, (top - outline_m[:, 1]) * pixels], axis=1)
    cv2.fillPoly(inside, [np.round(polygon).astype(np.int32)], 1)
    inside = cv2.dilate(inside, np.ones((3, 3), np.uint8))
    if spec.get('inset'):   # the outline pulled in this many of the picture's pixels (the ground's fringe left outside)
        inside = cv2.erode(inside, np.ones((2 * spec['inset'] + 1, 2 * spec['inset'] + 1), np.uint8))
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
    # A crest (`crown`, the skull's top traced from the bill's base to the nape): at the stations it spans, how high
    # the head goes under the crest (src/birdMeshes.js lofts the head to it and the crest above it as a thin fin).
    crowns = list(tops)
    if len(crown):
        crown_m = to_metres(crown)
        crown_m = crown_m[np.argsort(crown_m[:, 0])]
        for index, x in enumerate(stations):
            if crown_m[0, 0] <= x <= crown_m[-1, 0]:
                crowns[index] = min(tops[index], float(np.interp(x, crown_m[:, 0], crown_m[:, 1])))
    extra = {'crown': [round(float(y), 4) for y in crowns]} if len(crown) else {}
    return Image.fromarray(picture.clip(0, 255).astype(np.uint8)), {
        'stations': [round(float(x), 4) for x in stations], 'top': [round(float(y), 4) for y in tops], 'bottom': [round(float(y), 4) for y in bottoms],
        'rect': [float(left), float(bottom), float(right), float(top)], **extra,
    }


def wing_part(spec, span, pixels=PIXELS_PER_METRE):
    """A wing from below, rectified flat: its picture (RGBA), its edges along the span (m), and the rect it covers."""
    image = photo(spec['file'])
    left, top, right, bottom = spec['crop']
    piece = mended(image, spec)[top:bottom, left:right]
    if spec.get('cut') == 'grabcut':   # not against a sky (grass, a lawn): GrabCut, started from the traced `mask`
        alpha, colour = cut_traced(piece, np.array(spec['mask'], np.float64) - np.array([left, top])), piece
    else:
        alpha, colour = cut_from_sky(piece, spec['low'], spec['high'])
    colour = 255 * (colour / 255) ** spec.get('gamma', 1.0)   # a backlit underwing's shadows lifted
    colour = np.clip(colour * np.array(spec['gain']), 0, 255)
    if spec.get('neutral'):   # a grey wing's sky-blue cast (its edge un-mixed from a blue sky, light bounced off it) taken out
        grey = colour.mean(axis=2, keepdims=True)
        bluish = np.clip((colour[..., 2:3] - colour[..., 0:1] - 6) / 20, 0, 1)
        colour = colour * (1 - bluish) + grey * bluish
    if 'mask' in spec:   # only the wing: what lies outside its outline (the body, the tail, the legs) cut away
        keep = np.zeros(alpha.shape, np.uint8)
        cv2.fillPoly(keep, [np.round(np.array(spec['mask'], np.float64) - np.array([left, top])).astype(np.int32)], 1)
        alpha = alpha * cv2.dilate(keep, np.ones((9, 9), np.uint8))
    points = np.array(spec['points'], np.float64) - np.array([left, top])
    at = np.array(spec['at'], np.float64)
    semispan = span / 2
    chord_front, chord_back = 0.125 * span, -0.375 * span   # the flat wing's rect: forward of the shoulder to behind it (m; an eagle's 0.25 to −0.75)
    width_px = int(round(semispan * pixels)) + 1
    height_px = int(round((chord_front - chord_back) * pixels)) + 1
    # Flat wing px: column = m out from the axis, row = m back from chord_front.
    target = np.stack([at[:, 0] * pixels, (chord_front - at[:, 1]) * pixels], axis=1)
    homography = cv2.getPerspectiveTransform(points.astype(np.float32), target.astype(np.float32))
    rgba = np.dstack([colour, alpha * 255]).astype(np.float32)
    flat = cv2.warpPerspective(rgba, homography, (width_px, height_px), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    # Only the wing: what lies inboard of the shoulder (the body) is cut away.
    root_px = int(round(at[0, 0] * pixels))
    flat[:, :root_px, 3] = 0
    # Its outline a pixel inside the cut-out's (the sky un-mixed from the edge leaves a pale fringe), solid within.
    solid = ndimage.binary_erosion(largest(flat[..., 3] > 128), iterations=2)
    flat[..., 3] = solid.astype(np.float32) * 255
    if spec.get('cut') == 'grabcut':   # GrabCut's edge holds the background a few pixels deeper: its nearest inner colour
        interior = ndimage.binary_erosion(solid, iterations=3)
        if interior.any():
            _, (near_rows, near_columns) = ndimage.distance_transform_edt(~interior, return_indices=True)
            edge = solid & ~interior
            flat[edge, :3] = flat[near_rows[edge], near_columns[edge], :3]
    # Its leading and trailing edges at stations out along the span (from the root to the tip), m forward of the
    # shoulder; past the tip, none.
    stations = np.linspace(at[0, 0], semispan, STATIONS)
    leads, trails = [], []
    for s in stations:
        column = min(int(round(s * pixels)), width_px - 1)
        rows = np.nonzero(flat[:, column, 3] > 128)[0]
        if len(rows) == 0:
            leads.append(None); trails.append(None); continue
        leads.append(round(float(chord_front - rows.min() / pixels), 4))
        trails.append(round(float(chord_front - rows.max() / pixels), 4))
    tip = max((s for s, lead in zip(stations, leads) if lead is not None), default=semispan)
    return Image.fromarray(flat.clip(0, 255).astype(np.uint8)), {
        'stations': [round(float(s), 4) for s in stations], 'lead': leads, 'trail': trails, 'tip': round(float(tip), 4),
        'rect': [0.0, chord_back, semispan, chord_front],
    }


def cut_traced(image, polygon):
    """OpenCV's GrabCut started from a traced outline: surely the bird well inside it, surely not well outside, and
    either way across its edge."""
    height, width, _ = image.shape
    inside = np.zeros((height, width), np.uint8)
    cv2.fillPoly(inside, [np.round(polygon).astype(np.int32)], 1)
    mask = np.full((height, width), cv2.GC_BGD, np.uint8)
    mask[cv2.dilate(inside, np.ones((13, 13), np.uint8)) > 0] = cv2.GC_PR_BGD
    mask[inside > 0] = cv2.GC_PR_FGD
    mask[cv2.erode(inside, np.ones((13, 13), np.uint8)) > 0] = cv2.GC_FGD
    models = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(image.astype(np.uint8), cv2.COLOR_RGB2BGR), mask, None, *models, 6, cv2.GC_INIT_WITH_MASK)
    bird = ndimage.binary_fill_holes(largest((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)))
    return np.clip((ndimage.gaussian_filter(bird.astype(np.float64), 0.7) - 0.2) / 0.6, 0, 1)


def underside(picture, under):
    """A wing's underside from its upper side's picture (`face='upper'`): greyed by `grey` (0 to 1: a jay's blue is
    on its upper side only) and tinted, its outline the same."""
    array = np.asarray(picture).astype(np.float64)
    grey = array[..., :3].mean(axis=2, keepdims=True)
    array[..., :3] = (array[..., :3] * (1 - under.get('grey', 0)) + grey * under.get('grey', 0)) * np.array(under.get('tint', (1, 1, 1)))
    return Image.fromarray(array.clip(0, 255).astype(np.uint8))


def cut_grabcut(image, spec):
    """OpenCV's GrabCut from the spec's box, outline and strokes, cut at its waterline (tools/bird-sprites.py's)."""
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
    return alpha


def side_part(spec, length):
    """A standing bird side on (the header's standing kinds): its whole picture (RGBA, SIDE_PIXELS_PER_METRE), and its
    trunk's outline, its neck's middle line and thickness, and its legs, in metres from its hips (x forward, y up)."""
    image = photo(spec['file'])
    alpha = cut_grabcut(image, spec)
    # Facing right (+x, as every model faces): a bird photographed facing left is mirrored, and its points with it.
    width = image.shape[1]
    flip = spec['bill'][0] < spec['tail'][0]
    if flip:
        image, alpha = image[:, ::-1], alpha[:, ::-1]
    mirrored = lambda points: [(width - 1 - x, y) for x, y in points] if flip else list(points)
    spec = {**spec, **{name: mirrored([spec[name]])[0] for name in ('bill', 'tail', 'hips')}, 'trunk': mirrored(spec['trunk']), 'neck': mirrored(spec['neck']),
            'legs': [{name: (mirrored(leg[name]) if name == 'toes' else mirrored([leg[name]])[0]) for name in leg} for leg in spec['legs']]}
    bill, tail, hips = (np.array(spec[name], np.float64) for name in ('bill', 'tail', 'hips'))
    scale = length / abs(bill[0] - tail[0])   # m a photo px: the bill's tip to the tail's, level
    to_metres = lambda points: np.stack([(np.asarray(points, np.float64)[..., 0] - hips[0]) * scale, -(np.asarray(points, np.float64)[..., 1] - hips[1]) * scale], axis=-1)
    ys, xs = np.nonzero(alpha > 0.02)
    left, top, right, bottom = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
    pixels = SIDE_PIXELS_PER_METRE * scale   # picture px a photo px
    size = (int(round((right - left) * pixels)), int(round((bottom - top) * pixels)))
    rgba = np.dstack([image, alpha * 255]).astype(np.uint8)[top:bottom, left:right]
    picture = Image.fromarray(rgba).resize(size, Image.LANCZOS)
    corner_low, corner_high = to_metres([left, bottom]), to_metres([right, top])
    # Solid colour under its clear pixels' edge, so the loft's and the neck's sides (which reach a little past the
    # outline) are painted with the bird's edge, not the rock's.
    array = np.asarray(picture).astype(np.float64)
    solid = array[..., 3] > 200
    _, (near_rows, near_columns) = ndimage.distance_transform_edt(~solid, return_indices=True)
    array[..., :3] = np.where(solid[..., None], array[..., :3], array[near_rows, near_columns, :3])
    picture = Image.fromarray(array.clip(0, 255).astype(np.uint8))
    # The trunk: its outline's top and bottom at stations along it.
    trunk = to_metres(spec['trunk'])
    stations = np.linspace(trunk[:, 0].min(), trunk[:, 0].max(), STATIONS)
    tops, bottoms = [], []
    for x in stations:
        crossings = [y0 + (y1 - y0) * (x - x0) / (x1 - x0) for (x0, y0), (x1, y1) in zip(trunk, np.roll(trunk, -1, axis=0)) if (x0 - x) * (x1 - x) <= 0 and x0 != x1]
        if len(crossings) < 2:
            near = trunk[np.argmin(np.abs(trunk[:, 0] - x))][1]
            crossings = [near, near]
        tops.append(max(crossings)); bottoms.append(min(crossings))
    # The neck and head: samples along the middle line, each its half-thickness across it from the cut-out (to where
    # the alpha falls below a half either way), the sample moved to the middle of that.
    line = np.array(spec['neck'], np.float64)
    lengths = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(line, axis=0).T))])
    samples = []
    nape_along = lengths[spec['nape']]
    for along in np.linspace(0, lengths[-1], 64):
        segment = min(np.searchsorted(lengths, along, side='right') - 1, len(line) - 2)
        share = (along - lengths[segment]) / (lengths[segment + 1] - lengths[segment])
        point = line[segment] + (line[segment + 1] - line[segment]) * share
        direction = (line[segment + 1] - line[segment]) / (lengths[segment + 1] - lengths[segment])
        normal = np.array([-direction[1], direction[0]])
        reach = []
        for sign in (1, -1):
            distance = 0.0
            while distance < 80:
                x, y = point + normal * sign * (distance + 0.5)
                if alpha[int(round(y)), int(round(x))] < 0.5:
                    break
                distance += 0.5
            reach.append(distance)
        middle = point + normal * (reach[0] - reach[1]) / 2
        # Inside the trunk the cut-out is solid every way: no thickness to measure (the first outside it is used).
        inside = cv2.pointPolygonTest(np.array(spec['trunk'], np.float32), (float(point[0]), float(point[1])), True) > 2
        samples.append([*to_metres(middle if not inside else point), None if inside else max((reach[0] + reach[1]) / 2, 0.5) * scale, float(along >= nape_along)])
    # Its thickness smoothed (a running median, then capped: where the neck meets the breast the cut-out takes in the
    # breast's hanging plumes too), and inside the trunk the neck's own.
    thick = np.array([np.nan if sample[2] is None else sample[2] for sample in samples])
    neck_most = np.nanpercentile(thick[: int(len(thick) * 0.6)], 35) * 1.15
    known = np.where(np.isnan(thick), neck_most, np.minimum(thick, neck_most))
    smoothed = np.array([np.median(known[max(0, index - 3): index + 4]) for index in range(len(known))])
    for sample, value in zip(samples, smoothed):
        sample[2] = float(value)
    # Its middle line smoothed too (moved to the middle of the cut-out's neck, it wavers where the outline does), its
    # ends kept.
    centres = np.array([sample[:2] for sample in samples], np.float64)
    for index in range(2, len(samples) - 2):
        samples[index][0], samples[index][1] = (float(value) for value in centres[index - 2: index + 3].mean(axis=0))
    legs, strips = [], []
    for leg in spec['legs']:
        colours = []
        # Its middle line, hip to heel to foot, each point moved across to the middle of the leg in the cut-out (a leg
        # is a few pixels wide: a point off it would paint it with what was behind it), and its half-thickness there.
        line = []
        for start, end in ((leg['hip'], leg['heel']), (leg['heel'], leg['foot'])):
            start, end = np.array(start, np.float64), np.array(end, np.float64)
            for share in np.linspace(0, 1, 9)[:-1]:   # each segment's start to before its end (the foot added after)
                point = start + (end - start) * share
                row = int(round(point[1]))
                column = int(round(point[0]))
                solid = alpha[row, max(column - 14, 0): column + 15] > 0.5
                if solid.any():
                    columns = np.nonzero(solid)[0] + max(column - 14, 0)
                    # The run of solid pixels nearest the point.
                    runs = np.split(columns, np.nonzero(np.diff(columns) > 1)[0] + 1)
                    run = min(runs, key=lambda run: min(abs(run - column)))
                    point = np.array([(run[0] + run[-1]) / 2, point[1]])
                    half = (run[-1] - run[0] + 1) / 2
                    # Its colour: the median of the run's surest pixels (its edge pixels have the rock behind in them).
                    core = run[alpha[row, run] > 0.9] if (alpha[row, run] > 0.9).any() else run
                    colours.append(np.median(image[row, core], axis=0))
                else:
                    half = 3
                    colours.append(colours[-1] if colours else np.array([90.0, 80.0, 70.0]))
                line.append([*to_metres(point), max(half, 1.5) * scale])
        line.append([*to_metres(np.array(leg['foot'], np.float64)), line[-1][2]])
        colours.append(colours[-1])
        strips.append(colours)
        legs.append({name: [round(float(value), 4) for value in to_metres(leg[name])] for name in ('hip', 'heel', 'foot')}
                    | {'toes': [[round(float(value), 4) for value in point] for point in to_metres(leg['toes'])],
                       'line': [[round(float(value), 4) for value in point] for point in line]})
    # The legs' colours, a column a leg, a band of rows a point along it (its line's), smoothed along it a little.
    rows_each = 4
    strip = np.zeros((len(strips[0]) * rows_each, 4 * len(strips), 4), np.uint8)
    for index, colours in enumerate(strips):
        colours = np.array(colours)
        colours = np.array([colours[max(0, k - 1): k + 2].mean(axis=0) for k in range(len(colours))])
        strip[:, index * 4: index * 4 + 4, :3] = np.repeat(colours, rows_each, axis=0)[:, None, :].clip(0, 255).astype(np.uint8)
    strip[..., 3] = 255
    return picture, Image.fromarray(strip), {
        'rect': [round(float(corner_low[0]), 4), round(float(corner_low[1]), 4), round(float(corner_high[0]), 4), round(float(corner_high[1]), 4)],
        'trunk': {'stations': [round(float(x), 4) for x in stations], 'top': [round(float(y), 4) for y in tops], 'bottom': [round(float(y), 4) for y in bottoms]},
        'neck': [[round(float(value), 4) for value in sample] for sample in samples],
        'legs': legs,
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
    # Only the kinds named (python3 tools/bird-models.py blueJay cardinal), the others' as they were; else all.
    wanted = set(sys.argv[1:]) or set(KINDS)
    unknown = wanted - set(KINDS)
    if unknown:
        raise SystemExit(f'no such kind: {", ".join(sorted(unknown))}')
    known = json.loads((OUT / 'models.json').read_text()) if (OUT / 'models.json').exists() else {}
    models = {}
    for kind, spec in KINDS.items():
        if kind not in wanted:
            if kind in known:
                models[kind] = known[kind]
            continue
        if spec.get('standing'):
            side_picture, legs_picture, side = side_part(spec['side'], spec['length'])
            wing_picture, wing = wing_part(spec['wing'], spec['span'])
            parts = {'side': side_picture, 'under': tinted(wing_picture, spec['wing']['under']['tint']), 'upper': tinted(wing_picture, spec['wing']['upper']['tint']), 'legs': legs_picture}
            atlas, uv = pack(parts)
            atlas = bleed(atlas)
            file = f'{kind}-model.webp'
            atlas.save(OUT / file, 'WEBP', quality=88, method=6)
            models[kind] = {'atlas': file, 'size': list(atlas.size), 'length': spec['length'], 'span': spec['span'], 'standing': True,
                            'side': side, 'wing': wing, 'uv': uv, 'credits': [credit(spec['side']), credit(spec['wing'])]}
            print(f'{kind}: {atlas.size[0]}×{atlas.size[1]}, {(OUT / file).stat().st_size // 1024} KB; wing tip {wing["tip"]} m; hips {-min(leg["foot"][1] for leg in side["legs"]):.3f} m up')
            continue
        # A small bird, seen near, sharper (`pixelsPerMetre`).
        pixels = spec.get('pixelsPerMetre', PIXELS_PER_METRE)
        body_picture, body = body_part(spec['body'], spec['length'], pixels)
        wing_picture, wing = wing_part(spec['wing'], spec['span'], pixels)
        if spec['wing'].get('face') == 'upper':   # a photograph of its upper side: the underside made from it
            under_picture, upper_picture = underside(wing_picture, spec['wing']['under']), wing_picture
        else:
            upper = spec['wing'].get('upper', {})
            under_picture, upper_picture = wing_picture, tinted(wing_picture, upper.get('tint', (0.85, 0.85, 0.85)))
        parts = {'body': body_picture, 'under': under_picture, 'upper': upper_picture, 'tail': tail_part(body_picture, body)}
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
