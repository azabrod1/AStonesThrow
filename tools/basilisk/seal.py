#!/usr/bin/env python3
"""The crown and the surface seal: runs of stone.c side by side, one row each,
at the same times from first contact (a figure for the README), typically the
reference's light air against real air at two resolutions.

    python3 seal.py RUN [RUN ...] --out OUT.png [--times 10,20,30,40,50]
"""
import argparse, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from analyse import read_csv, read_facets, facet_times, contact_time, stone_outline, read_parameters

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('runs', nargs='+')
parser.add_argument('--out', required=True)
parser.add_argument('--times', default='10,20,30,40,50')
arguments = parser.parse_args()
times = [float(value) for value in arguments.times.split(',')]
runs = arguments.runs
figure, axes = plt.subplots(len(runs), len(times), figsize=(1.45 * len(times), 2.9 * len(runs)), squeeze=False, sharey=True)
for row, run in enumerate(runs):
    parameters = read_parameters(run)
    stone = read_csv(os.path.join(run, 'stone.csv'))
    t0 = contact_time(stone)
    files = facet_times(run)
    for column, when in enumerate(times):
        panel = axes[row, column]
        time = t0 + when / 1000
        nearest = min(files, key=lambda item: abs(item[0] - time))
        if abs(nearest[0] - time) > 0.0011:
            panel.axis('off')
            continue
        segments = read_facets(nearest[1])
        segments = segments[(segments[:, 1] < 0.1) & (segments[:, 0] > -0.3) & (segments[:, 0] < 0.2)]
        for side in (1, -1):
            panel.plot(np.vstack([side * segments[:, 1], side * segments[:, 3]]) * 100,
                       np.vstack([segments[:, 0], segments[:, 2]]) * 100, color='#1f5fa8', linewidth=0.5)
        centre = float(np.interp(nearest[0], stone['t'], stone['stone_x']))
        r, z = stone_outline(centre, bool(parameters.get('front_only', 0)))
        panel.fill(np.concatenate([r, -r[::-1]]) * 100, np.concatenate([z, z[::-1]]) * 100, color='#7a6a58', linewidth=0)
        panel.axhline(0., color='#999999', linewidth=0.4, linestyle=':')
        panel.set_xlim(-8, 8)
        panel.set_ylim(-28, 16)
        panel.set_aspect('equal')
        panel.tick_params(labelsize=6)
        panel.set_title('%d ms' % round((nearest[0] - t0) * 1000), fontsize=8)
    axes[row, 0].set_ylabel('level %d, air %g kg/m³\nheight (cm)' % (parameters['max_level'], parameters.get('rho_air', 1.2)), fontsize=7)
figure.suptitle('The crown: real air sucks it shut over the hole; light air leaves it open at level 12, '
                'but the thinner sheet of level 13 closes anyway', fontsize=8)
figure.tight_layout(rect=(0, 0, 1, 0.97))
figure.savefig(arguments.out, dpi=110)
print('wrote', arguments.out)
