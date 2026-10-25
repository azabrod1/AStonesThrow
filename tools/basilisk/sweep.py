#!/usr/bin/env python3
"""Tabulates a sweep of stone.c runs (stones of several sizes and speeds):
what each one's cavity and Worthington jet do, for the app (src/jet.js and
src/splash.js interpolate the table).

    python3 sweep.py RUN [RUN ...] [--out assets/jet/sweep.json] [--csv DIR]

Each RUN is a directory a run of stone.c wrote, with any radius=, speed=,
depth= and air=. Times are from first contact (the stone's lowest point at
the still surface), heights upward from the still surface. For every run:

- the pinch-off: when the air over the stone is first cut off from the sky
  (regions.csv's `pinched`), how deep the neck is then (the water on the
  axis just under the bowl still open above it), the stone's depth, and
  whether the stone was already on the floor (braked to rest at
  `floor_stop`);
- the seal: `surface` if no air under the surface is open to the sky then
  (the crown closed over the hole; its time is when the pond's water first
  stood on the axis above the surface), `floor` if the stone was on the
  floor first, `deep` otherwise (`none` if the hole never closed). After a
  surface seal the incompressible air cannot follow the trapped cavity, so
  that run's jet is not the clean jet;
- the jet: when the joined column (regions.csv's jet_tip, the highest pond
  water on the axis) clears the surface and how fast its top rises through
  it (a line through its last outputs under it, short of any jump),
  its highest and when, when it is back under, and the highest any of its
  drops gets;
- the column's radius at the still surface over time (from facets/: the
  first crossing of the interface going out from the axis while the axis is
  in water there; the bowl's wall is the next): the thread first, then the
  cone the bowl's collapse builds under it once the bowl has filled; and,
  from one to three sqrt(R/g) after it emerges, the medians of its radius
  two radii up (its body) and half a radius up (its base), and from two to
  six units after it the medians of its radius five radii up (its middle)
  and ten (its thread); and how high the joined column stands half a unit
  to six after it emerges;
- its drops: bodies of water on the axis above the surface after the
  pinch-off (drops.csv), tracked from output to output, each with the median
  of its radius: the first, the radii's percentiles and the radius by water
  (half their water is in bigger drops); the water removed
  as drops narrower than stone.c's MIN_BLOB cells after the pinch-off (the
  grid's floor on drop size, 1.2 cells or so in radius) is given too;
- the volumes: the bowl left above the neck at the pinch-off (the open
  cavity above the pinch depth, from facets/) and the most water the jet
  holds above the still surface at once (the column, from facets/, and its
  drops), and their ratio.

`--out` writes them as JSON (assets/jet/sweep.json, for the probes) and the
same object as a module beside it (sweep.js, which src/jet.js imports: a
bare JSON import needs a browser from 2024): never edit either by hand.
`--csv DIR` writes each run's column radius over time.
"""
import argparse, json, math, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from analyse import read_parameters, read_csv, read_axis, merged, read_facets, facet_times, NODATA

GRAVITY = 9.81
REFERENCE_RADIUS = 0.03     # the app's reference stone (src/jet.js): its gains are 1
NORMAL_SPEED = 6.2          # m/s: a throw at normal power enters at about this; the table holds such throws' gains


def crossings(segments, height, reach):
    """The interface's crossings of the horizontal line at a height, from the
    axis out to `reach`, those closer than 1e-4 of each other merged."""
    x0, y0, x1, y1 = segments.T
    crossing = (x0 - height) * (x1 - height) < 0
    if not np.any(crossing):
        return []
    share = (height - x0[crossing]) / (x1[crossing] - x0[crossing])
    radii = np.sort(y0[crossing] + share * (y1[crossing] - y0[crossing]))
    out = []
    for radius in radii[radii < reach]:
        if not out or radius - out[-1] > 1e-4:
            out.append(float(radius))
    return out


def wet_on_axis(pairs, height):
    return any(bottom <= height <= top for bottom, top in pairs)


def measure(run):
    parameters = read_parameters(run)
    radius = parameters['radius']
    speed = parameters['entry_speed']
    cell = parameters['min_cell']
    unit = math.sqrt(radius / GRAVITY)          # sqrt(R/g)
    stone = read_csv(os.path.join(run, 'stone.csv'))
    bottom = stone['stone_x'] - radius
    index = int(np.argmax(bottom <= 0.))
    t0 = float(np.interp(0., [bottom[index], bottom[index - 1]], [stone['t'][index], stone['t'][index - 1]])) if index > 0 else float(stone['t'][0])
    result = {
        'name': os.path.basename(os.path.normpath(run)), 'radius': radius, 'speed': speed,
        'air': parameters['rho_air'], 'depth': parameters.get('depth', 0.8),
        'froude': speed**2 / (GRAVITY * radius), 'cells_per_radius': radius / cell,
        'simulated_to': float(stone['t'][-1] - t0),
    }

    # The floor: the stone at rest on it (stone.c brakes it to floor_stop).
    floor_stop = parameters.get('floor_stop', -parameters.get('depth', 0.8) + radius + 0.002)
    resting = np.nonzero((stone['stone_x'] <= floor_stop + 1e-6) & (stone['stone_u'] == 0.))[0]
    floor_time = float(stone['t'][resting[0]] - t0) if len(resting) else None

    # The hole closes: the air over the stone is first cut off from the sky
    # (regions.csv's `pinched`). A deep seal leaves the bowl above the neck
    # open to the sky then; after a surface seal no air under the surface is.
    axis = read_axis(run)
    regions = read_csv(os.path.join(run, 'regions.csv'))
    rt = regions['t'] - t0
    cut = np.nonzero((regions['pinched'] > 0.5) & (rt > 0.1 * unit))[0]
    neck = None
    surface_seal = None
    if len(cut):
        row = cut[0]
        open_bottom = regions['cavity_bottom'][row]
        # The pond's water on the axis above the still surface before then: the crown closing over the hole.
        dome = np.nonzero((regions['jet_tip'] > radius / 15) & (rt > 0.05 * unit) & (rt <= rt[row]))[0]
        if open_bottom >= NODATA or open_bottom > -radius / 4:
            surface_seal = float(rt[dome[0]]) if len(dome) else float(rt[row])
        time = regions['t'][row]
        _, stone_x, pairs = axis[int(np.argmin(np.abs(np.array([snapshot[0] for snapshot in axis]) - time)))]
        # The neck: the water on the axis just under the open bowl's floor.
        below = [pair for pair in pairs if pair[1] < open_bottom + cell and pair[0] > stone_x + radius + 2 * cell]
        depth = -0.5 * sum(max(below, key=lambda pair: pair[1])) if below and open_bottom < NODATA else -min(open_bottom, 0.)
        neck = {'time': float(rt[row]), 'depth': float(depth), 'stone_depth': -float(regions['stone_x'][row])}
    if surface_seal is not None:
        seal = 'surface'
    elif neck is None:
        seal = 'none'
    elif floor_time is not None and floor_time < neck['time']:
        seal = 'floor'
    else:
        seal = 'deep'

    result['seal'] = seal
    result['surface_seal_time'] = surface_seal
    result['floor_time'] = floor_time
    if neck:
        result['pinch'] = {'time': neck['time'], 'depth': neck['depth'], 'stone_depth': neck['stone_depth'],
                           'time_units': neck['time'] / unit, 'depth_radii': neck['depth'] / radius,
                           'stone_on_floor_first': floor_time is not None and floor_time < neck['time']}
    if not neck:
        return result

    # The joined column's top after the pinch-off.
    after = (rt >= neck['time']) & (regions['jet_tip'] > -1)
    jt, top = rt[after], regions['jet_tip'][after]
    jet = {}
    emerged = np.nonzero(top > 0.)[0]
    if len(emerged):
        first = emerged[0]
        jet['emerges'] = float(jt[first])
        # The top's speed through the surface: a line through its last six
        # outputs under three radii deep and up to a radius over, short of its
        # first jump (the rising column joining water already on the axis, a
        # needle's earlier drops).
        hi = first
        if first > 0 and top[first] - top[first - 1] > radius / 2:
            hi = first - 1     # it emerges by joining water over the surface: its rise up to there
        else:
            while hi + 1 < len(top) and top[hi + 1] < radius and 0 < top[hi + 1] - top[hi] < radius / 2:
                hi += 1
        lo = hi
        while lo > 0 and lo > hi - 6 and top[lo - 1] > -3 * radius and top[lo - 1] < top[lo]:
            lo -= 1
        jet['emerge_speed'] = float(np.polyfit(jt[lo:hi + 1], top[lo:hi + 1], 1)[0]) if hi > lo else None

        highest = int(np.argmax(top))
        jet['top'] = float(top[highest])
        jet['top_time'] = float(jt[highest])
        gone = np.nonzero((jt > jt[highest]) & (top < 0.))[0]
        jet['back_under'] = float(jt[gone[0]]) if len(gone) else None

    # Its drops: bodies on the axis above the surface after the pinch-off.
    drops_path = os.path.join(run, 'drops.csv')
    tracks = []
    highest_drop = None
    if os.path.exists(drops_path) and os.path.getsize(drops_path) > 60:
        drops = np.atleast_1d(read_csv(drops_path))
        on_axis = (drops['y_min'] < 2 * cell) & (drops['x_min'] > 0.) & (drops['t'] - t0 >= neck['time'])
        for row in drops[on_axis]:
            time = row['t'] - t0
            entry = {'t': time, 'x': row['x'], 'u': row['u'], 'radius': row['radius'], 'top': row['x_max']}
            for track in tracks:
                last = track[-1]
                gap = time - last['t']
                if 0 < gap <= 0.05 * unit and abs(row['x'] - (last['x'] + last['u'] * gap)) < 0.2 * radius:
                    track.append(entry)
                    break
            else:
                tracks.append([entry])
        if np.any(on_axis):
            highest_drop = float(np.max(drops['x_max'][on_axis]))
    jet['drops_highest'] = highest_drop
    # How high the joined column stands half a unit and one unit after it emerges.
    if 'emerges' in jet:
        jet['top_at_units'] = {str(units): float(np.interp(jet['emerges'] + units * unit, jt, top)) for units in (0.5, 1, 2, 4, 6)}
    sizes = [(track[0]['t'], float(np.median([entry['radius'] for entry in track]))) for track in tracks if len(track) >= 2]
    sizes.sort()
    removed = stone['removed_water']
    at_pinch = float(np.interp(neck['time'] + t0, stone['t'], removed))
    drops_summary = {'count': len(sizes), 'unresolved_water': float(removed[-1] - at_pinch)}
    if sizes:
        radii = np.array([size for _, size in sizes])
        # The radius by water: half the drops' water is in bigger drops than it.
        order = np.argsort(radii)
        water_share = np.cumsum(radii[order]**3) / np.sum(radii**3)
        drops_summary['radius_by_water_p50'] = float(radii[order][int(np.searchsorted(water_share, 0.5))])
        drops_summary.update({'first_time': sizes[0][0], 'first_radius': sizes[0][1],
                              'radius_p10': float(np.percentile(radii, 10)), 'radius_p50': float(np.percentile(radii, 50)),
                              'radius_p90': float(np.percentile(radii, 90)), 'water': float(np.sum(4 / 3 * math.pi * radii**3))})
    result['drops'] = drops_summary

    # The bowl at the pinch-off and the column over time, from the interface.
    reach = 12 * radius
    times = np.array([snapshot[0] for snapshot in axis])
    column = []
    bowl_volume = None
    most_water = (0., None)
    drop_rows = np.atleast_1d(read_csv(drops_path)) if highest_drop is not None else None
    for (time, name) in facet_times(run):
        age = time - t0
        if age < neck['time'] - 1e-9:
            continue
        segments = read_facets(name)
        if not len(segments):
            continue
        pairs = merged(axis[int(np.argmin(np.abs(times - time)))][2], 2 * cell)
        if bowl_volume is None:
            # The open cavity above the pinch depth: its wall's radius, slice by slice.
            heights = np.arange(-neck['depth'], 0., cell)
            volume = 0.
            for height in heights:
                found = crossings(segments, height, reach)
                if wet_on_axis(pairs, height):
                    found = found[1:]
                if found:
                    volume += math.pi * found[0]**2 * cell
            bowl_volume = volume
        found = crossings(segments, 0., reach)
        wet = wet_on_axis(pairs, 0.)
        surface_radius = found[0] if wet and found else 0.
        bowl_wall = (found[1] if wet else found[0]) if len(found) > (1 if wet else 0) else 0.
        # The water above the still surface on the axis, joined to it.
        water = 0.
        joined_top = 0.
        for bottom_run, top_run in pairs:
            if bottom_run <= 0. <= top_run:
                joined_top = top_run
        for height in np.arange(0.5 * cell, joined_top, cell):
            hit = crossings(segments, height, reach)
            if hit:
                water += math.pi * hit[0]**2 * cell
        loose = 0.
        if drop_rows is not None:
            near = (np.abs(drop_rows['t'] - time) < 1e-6) & (drop_rows['y_min'] < 2 * cell) & (drop_rows['x_min'] > 0.)
            loose = float(np.sum(drop_rows['volume'][near]))
        if water + loose > most_water[0]:
            most_water = (water + loose, age)
        # The column's radius half a radius and two radii up (its base and its body).
        # (A third of a cell off: a height on a cell's edge meets the facets only at their ends.)
        low, high, middle, thread = (crossings(segments, height * radius + cell / 3, reach) if wet_on_axis(pairs, height * radius + cell / 3) else []
                                     for height in (0.5, 2., 5., 10.))
        column.append((age, surface_radius, bowl_wall, water, low[0] if low else 0., high[0] if high else 0., thread[0] if thread else 0., middle[0] if middle else 0.))
    result['volumes'] = {'bowl': bowl_volume, 'jet_most': most_water[0], 'jet_most_time': most_water[1],
                         'share': most_water[0] / bowl_volume if bowl_volume else None}
    column = np.array(column)
    result['column_series'] = column
    if len(column) and 'emerges' in jet:
        def radius_at(age):
            near = column[np.argmin(np.abs(column[:, 0] - age))]
            return float(near[1])
        start = jet['emerges']
        window = column[(column[:, 0] >= start) & (column[:, 0] <= start + 0.5 * unit) & (column[:, 1] > 0)]
        jet['surface_radius'] = {
            'median_first_half_unit': float(np.median(window[:, 1])) if len(window) else None,
            'at_units_after_emerging': {str(units): radius_at(start + units * unit) for units in (0.1, 0.25, 0.5, 1, 2, 4)},
            'at_top': radius_at(jet['top_time']),
        }
        # Its body and base: the medians, from one to three units after it emerges, of its radius two radii and half a radius up.
        later = column[(column[:, 0] >= start + unit) & (column[:, 0] <= start + 3 * unit)]
        body, base = later[later[:, 5] > 0, 5], later[later[:, 4] > 0, 4]
        jet['body_radius'] = float(np.median(body)) if len(body) else None
        jet['base_radius'] = float(np.median(base)) if len(base) else None
        # Its middle and its thread: the medians, from two to six units after it emerges, of its radius five and ten radii up.
        upper = column[(column[:, 0] >= start + 2 * unit) & (column[:, 0] <= start + 6 * unit)]
        middle, thread = upper[upper[:, 7] > 0, 7], upper[upper[:, 6] > 0, 6]
        jet['middle_radius'] = float(np.median(middle)) if len(middle) else None
        jet['thread_radius'] = float(np.median(thread)) if len(thread) else None
    result['jet'] = jet
    return result


def fit_table(results):
    """The app's gains (jet-fit.mjs) for every run of a deep seal that went on
    past its jet's top, and the table: by stone size, its normal throw's (the
    run nearest NORMAL_SPEED), the reference stone's being 1."""
    rows = []
    for result in results:
        jet, radius = result.get('jet', {}), result['radius']
        unit = math.sqrt(radius / GRAVITY)
        if result['seal'] != 'deep' or radius <= REFERENCE_RADIUS * 1.01 or not jet.get('body_radius') or 'top' not in jet:
            continue
        if result['simulated_to'] < jet['top_time'] + 2 * unit:
            continue
        rows.append({'name': result['name'], 'radius': radius, 'speed': result['speed'], 'depth': result['depth'], 'body': jet['body_radius'] / radius,
                     'middle': (jet.get('middle_radius') or 0.) / radius, 'thread': (jet.get('thread_radius') or 0.) / radius, 'top': jet['top'] / radius})
    if not rows:
        return [], [{'radius': REFERENCE_RADIUS, 'column': 1., 'thread': 1., 'needle': 1., 'runs': []}]
    here = os.path.dirname(os.path.abspath(__file__))
    done = subprocess.run(['node', os.path.join(here, 'jet-fit.mjs')], input=json.dumps({'rows': rows}), capture_output=True, text=True, check=True)
    fits = json.loads(done.stdout)['fits']
    table = [{'radius': REFERENCE_RADIUS, 'column': 1., 'thread': 1., 'needle': 1., 'run': None}]
    for radius in sorted({fit['radius'] for fit in fits}):
        normal = min((fit for fit in fits if fit['radius'] == radius), key=lambda fit: abs(fit['runs'][0]['speed'] - NORMAL_SPEED))
        table.append({'radius': radius, 'column': normal['column'], 'thread': normal['thread'], 'needle': normal['needle'], 'run': normal['runs'][0]['name']})
    return fits, table


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('runs', nargs='+')
    parser.add_argument('--out')
    parser.add_argument('--csv')
    arguments = parser.parse_args()
    results = []
    for run in arguments.runs:
        result = measure(run)
        series = result.pop('column_series', None)
        if arguments.csv and series is not None and len(series):
            os.makedirs(arguments.csv, exist_ok=True)
            np.savetxt(os.path.join(arguments.csv, result['name'] + '_column.csv'), series, delimiter=',', fmt='%.5f',
                       header='t_s,column_radius_at_surface_m,bowl_wall_at_surface_m,column_water_above_surface_m3,radius_half_R_up_m,radius_2R_up_m,radius_10R_up_m,radius_5R_up_m', comments='')
        results.append(result)
    results.sort(key=lambda result: (result['radius'], result['speed'], result['air']))
    fits, table = fit_table(results)
    text = json.dumps({'source': 'tools/basilisk/sweep.py from stone.c runs (tools/basilisk/README.md); do not edit',
                       'table': table, 'fits': fits, 'runs': results}, indent=1, default=float)
    if arguments.out:
        os.makedirs(os.path.dirname(os.path.abspath(arguments.out)), exist_ok=True)
        with open(arguments.out, 'w') as handle:
            handle.write(text + '\n')
        with open(os.path.splitext(arguments.out)[0] + '.js', 'w') as handle:
            handle.write('// Written by tools/basilisk/sweep.py beside sweep.json: the same table as a module. Do not edit.\n')
            handle.write('export default ' + text + ';\n')
    else:
        print(text)


if __name__ == '__main__':
    main()
