# The probe over Europa as a picture (src/europaSceneryMeshes.js draws it):
# NASA/JPL's rendering of Europa Clipper (PIA20025, "Europa Mission
# Spacecraft - Artist's Rendering", 2016; public domain, by way of Wikimedia
# Commons), cut out already (its background is transparent), cropped to the
# craft, scaled and written as assets/europa/clipper.webp, with
# assets/europa/clipper.json saying its size in pixels and metres, where its
# body is in it, and whose it is (CREDITS.md and credits.html credit it).
# Run it again to rebuild them (never edit either):
#
#   python3 tools/europa-probe.py          (numpy, scipy, Pillow with WebP)
#
# The rendering is of the design of 2016: four panels a wing where the craft
# that flew has five, its radar antennas upright off the wings' ends. It
# shows the arrays' cells and the dish from in front and a little below, as
# the eye sees a craft whose arrays face a sun behind it (src/europaScenery.js:
# the sun stands behind the level view's right). Its width is the arrays'
# tip to tip, scaled to the flown craft's 30.5 m (SPAN); its height in
# proportion. BODY is the middle of the craft's body in the source's pixels,
# where the scenery's pose puts it. Its source is fetched once into
# tools/.europa-sources/ (gitignored) and checked against its SHA-256.
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / 'tools' / '.europa-sources'
OUT = ROOT / 'assets' / 'europa'
USER_AGENT = 'AStonesThrowEuropaProbe/1.0 (https://github.com/azabrod1/AStonesThrow)'
SOURCE = {
    'file': 'Europa_Clipper_spacecraft_model_1920.png',
    'url': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Europa_Clipper_spacecraft_model.png/1920px-Europa_Clipper_spacecraft_model.png',
    'sha256': 'dfb2bbd46c44acd9f550138e6ab428d59c4278a75d07535a9e8d8912eb833976',
}
CREDIT = {
    'title': "PIA20025: Europa Mission Spacecraft - Artist's Rendering",
    'author': 'NASA/JPL-Caltech',
    'licence': 'Public domain',
    'source': 'https://commons.wikimedia.org/wiki/File:Europa_Clipper_spacecraft_model.png',
}
SPAN = 30.5          # m: Europa Clipper's arrays tip to tip (NASA), the picture's width
WIDTH = 1024         # pixels: the picture's width (the probe is some 6° across; zoomed to 8°, most of a phone's width)
BODY = (800, 700)    # the body's middle, in the source's pixels
PAD = 4              # pixels of clear round the craft


def download():
    path = SOURCE_DIR / SOURCE['file']
    if not path.exists():
        SOURCE_DIR.mkdir(parents=True, exist_ok=True)
        print(f'downloading {SOURCE["url"]}')
        for attempt in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(SOURCE['url'], headers={'User-Agent': USER_AGENT}), timeout=120) as response:
                    data = response.read()
                break
            except urllib.error.HTTPError as error:
                if error.code != 429 or attempt == 4:
                    raise
                time.sleep(30 * (attempt + 1))   # Wikimedia asks clients to back off
        path.write_bytes(data)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SOURCE['sha256']:
        raise SystemExit(f'{path}: SHA-256 {digest}, not {SOURCE["sha256"]} (has the source changed?)')
    return Image.open(path).convert('RGBA')


def bleed(picture):
    """Un-premultiplied colour under every clear pixel (so filtering never darkens the craft's edge with the
    transparent black round it): each takes its nearest opaque pixel's colour (tools/bird-sprites.py's)."""
    pixels = np.asarray(picture).astype(np.float64)
    clear = pixels[..., 3] < 8
    nearest = ndimage.distance_transform_edt(clear, return_distances=False, return_indices=True)
    filled = pixels[nearest[0], nearest[1]]
    filled[..., 3] = pixels[..., 3]
    return Image.fromarray(filled.astype(np.uint8))


def main():
    source = download()
    alpha = np.asarray(source)[..., 3]
    rows, columns = np.nonzero(alpha > 8)
    left, right = max(columns.min() - PAD, 0), min(columns.max() + 1 + PAD, source.width)
    top, bottom = max(rows.min() - PAD, 0), min(rows.max() + 1 + PAD, source.height)
    cropped = source.crop((left, top, right, bottom))
    scale = WIDTH / cropped.width
    height = round(cropped.height * scale)
    picture = bleed(cropped.resize((WIDTH, height), Image.LANCZOS))
    OUT.mkdir(parents=True, exist_ok=True)
    picture.save(OUT / 'clipper.webp', quality=90, method=6, exact=True)
    metres = SPAN / (right - left - 2 * PAD) * (right - left)   # the arrays' tips are the craft's left and right
    entry = {
        'file': 'clipper.webp', 'pixels': [WIDTH, height],
        'metres': [round(metres, 3), round(metres * height / WIDTH, 3)],
        'body': [round((BODY[0] - left) / (right - left), 4), round((BODY[1] - top) / (bottom - top), 4)],   # from the top left, shares of its size
        'credit': CREDIT,
    }
    (OUT / 'clipper.json').write_text(json.dumps(entry, indent=2) + '\n')
    print(f'clipper.webp: {WIDTH}×{height}, {(OUT / "clipper.webp").stat().st_size // 1024} KB; {entry["metres"][0]}×{entry["metres"][1]} m')


if __name__ == '__main__':
    main()
