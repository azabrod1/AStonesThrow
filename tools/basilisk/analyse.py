#!/usr/bin/env python3
"""Turns a run of stone.c into the result files under results/.

    python3 analyse.py RUN [--check OTHER_RUN ...] [--app APP_JSON] [--out DIR]

RUN is the directory a run of stone.c wrote (stone.csv, gauges.csv, axis.txt,
regions.csv, drops.csv, facets/, parameters.txt). Each OTHER_RUN is the same
case at another resolution (the resolution check): its small CSV files go in
DIR/check-L<level>/, its headline numbers in summary.json under "checks", and
its curves on the plots. APP_JSON is what app-numbers.mjs
writes for the app's splash at the same case. Times in the outputs are from
first contact (the stone's lowest point at the still surface), lengths in
millimetres unless the column says otherwise, heights upward from the still
surface (negative below it).

It writes (all small): stone.csv, cavity.csv, jet.csv, jet_drops.csv,
crown.csv, rings.csv, interface.csv, summary.json, comparison.csv and
comparison.md (the simulation at each resolution against the app), and the
plots strip.png, cavity.png, jet.png, crown.png, rings.png, stone.png and,
with checks, resolution.png. The ring's rows come from the ring continued
linearly (rings.py's rings_linear.csv in DIR, written first) when it is
there, measured as rings.py measures it: a gauge's first second is the
splash's own disturbance, not the ring.
"""
import argparse, glob, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

R = 0.03
GRAVITY = 9.81
RHO_WATER = 1000.
SIGMA = 0.072
DEPTH = 0.8
TIME_UNIT = math.sqrt(R / GRAVITY)          # sqrt(R/g), 55.3 ms
NODATA = 1e29


def read_parameters(run):
    values = {}
    with open(os.path.join(run, 'parameters.txt')) as handle:
        for line in handle:
            key, value = line.split()
            values[key] = float(value)
    return values


def read_csv(path):
    return np.genfromtxt(path, delimiter=',', names=True)


def contact_time(stone):
    """When the stone's lowest point reaches the still surface."""
    bottom = stone['stone_x'] - R
    index = np.argmax(bottom <= 0.)
    if index == 0:
        return float(stone['t'][0])
    t0, t1 = stone['t'][index - 1], stone['t'][index]
    b0, b1 = bottom[index - 1], bottom[index]
    return float(t0 + (t1 - t0) * b0 / (b0 - b1))


def read_axis(run):
    """The runs of water along the axis: a list of (t, stone_x, [[bottom, top], ...])."""
    snapshots = []
    with open(os.path.join(run, 'axis.txt')) as handle:
        for line in handle:
            numbers = [float(word) for word in line.split()]
            if len(numbers) < 3:
                continue
            pairs = np.array(numbers[3:]).reshape(-1, 2) if len(numbers) > 3 else np.zeros((0, 2))
            snapshots.append((numbers[0], numbers[1], pairs))
    return snapshots


def merged(pairs, gap):
    """Runs of water on the axis closer than `gap` joined: a jet thinner than a
    cell leaves its axis cells partly full, which splits it into runs with
    gaps of a fraction of a cell."""
    joined = []
    for bottom, top in pairs:
        if joined and bottom - joined[-1][1] < gap:
            joined[-1][1] = max(joined[-1][1], top)
        else:
            joined.append([bottom, top])
    return joined


def read_facets(path):
    data = np.loadtxt(path, ndmin=2)
    return data.reshape(-1, 4) if data.size else np.zeros((0, 4))


def facet_times(run):
    files = sorted(glob.glob(os.path.join(run, 'facets', 't*.txt')))
    return [(float(os.path.basename(name)[1:-4]), name) for name in files]


def wall_radius_at(segments, height, axis_wet, reach=0.2):
    """The cavity wall's radius at a height: going out from the axis along the
    horizontal line, the first crossing of the interface into water (the
    second if the axis itself is in water there, the jet's column). Returns 0
    if the line meets no air (the hole has closed there)."""
    x0, y0, x1, y1 = segments.T
    crossing = (x0 - height) * (x1 - height) < 0
    if not np.any(crossing):
        return 0.
    share = (height - x0[crossing]) / (x1[crossing] - x0[crossing])
    radii = np.sort(y0[crossing] + share * (y1[crossing] - y0[crossing]))
    radii = radii[radii < reach]
    # Merge crossings closer than a fraction of a mm (both faces of one facet pair).
    merged = []
    for radius in radii:
        if not merged or radius - merged[-1] > 2e-4:
            merged.append(radius)
    index = 1 if axis_wet else 0
    return float(merged[index]) if len(merged) > index else 0.


def axis_is_wet(axis, time, height):
    """Whether the axis is in water at this height at the axis output nearest in time."""
    times = axis_times(axis)
    index = int(np.argmin(np.abs(times - time)))
    return any(pair[0] <= height <= pair[1] for pair in axis[index][2])


_axis_times_cache = {}
def axis_times(axis):
    key = id(axis)
    if key not in _axis_times_cache:
        _axis_times_cache[key] = np.array([snapshot[0] for snapshot in axis])
    return _axis_times_cache[key]


def dispersion_wavelength(period, depth=DEPTH):
    """Wavelength of gravity-capillary waves of this period in water of this depth."""
    omega = 2 * math.pi / period
    k = omega**2 / GRAVITY
    for _ in range(200):
        depth_term = math.tanh(k * depth)
        bottom_term = depth / math.cosh(k * depth)**2 if k * depth < 20 else 0.
        value = (GRAVITY * k + SIGMA / RHO_WATER * k**3) * depth_term - omega**2
        slope = (GRAVITY + 3 * SIGMA / RHO_WATER * k**2) * depth_term \
            + (GRAVITY * k + SIGMA / RHO_WATER * k**3) * bottom_term
        k = max(k - value / slope, 0.5 * k)
    return 2 * math.pi / k


def ring_measures(times, eta):
    """splash-probe's measures (deepest trough to highest crest, the crest's
    time, the half period around it, its deep-water wavelength) plus the
    arrival time and the finite-depth wavelength of that period."""
    crest = int(np.argmax(eta))
    before, after = crest, crest
    while before > 0 and eta[before - 1] < eta[before]:
        before -= 1
    while after < len(eta) - 1 and eta[after + 1] < eta[after]:
        after += 1
    half = 0.5 * (times[after] - times[before])
    peak = np.max(np.abs(eta))
    arrival = float(times[np.argmax(np.abs(eta) > 0.1 * peak)]) if peak > 0 else float('nan')
    # The largest local trough-to-crest: a crest and the deeper of its neighbouring troughs.
    local = 0.
    for index in range(1, len(eta) - 1):
        if eta[index] >= eta[index - 1] and eta[index] > eta[index + 1]:
            low = before_trough = eta[index]
            scan = index
            while scan > 0 and eta[scan - 1] <= eta[scan]:
                scan -= 1
            before_trough = eta[scan]
            scan = index
            while scan < len(eta) - 1 and eta[scan + 1] <= eta[scan]:
                scan += 1
            local = max(local, eta[index] - min(before_trough, eta[scan]))
    return {
        'trough_to_crest_mm': float((eta[crest] - min(0., np.min(eta))) * 1000),
        'largest_wave_mm': float(local * 1000),
        'crest_time_s': float(times[crest]),
        'half_period_s': float(half),
        'wavelength_deep_cm': float(GRAVITY * (2 * half)**2 / (2 * math.pi) * 100),
        'wavelength_cm': float(dispersion_wavelength(2 * half) * 100) if half > 0 else float('nan'),
        'arrival_s': arrival,
        'max_mm': float(np.max(eta) * 1000), 'min_mm': float(np.min(eta) * 1000),
    }


def continued_rings(path, t0):
    """rings.py's measures of the ring continued linearly (its csv, on the
    run clock) at each radius, in the units of the comparison: trough to crest
    (mm), when the highest crest passes (s from contact), its period (s) and
    wavelength (cm)."""
    import rings as continuation
    with open(path) as handle:
        radii = [float(name[len('eta_mm_at_'):-1]) for name in handle.readline().strip().split(',')[1:]]
    data = np.loadtxt(path, delimiter=',', skiprows=1, ndmin=2)
    measured = {}
    for column, radius in enumerate(radii, start=1):
        measure = continuation.ring_measures(data[:, 0] - t0, data[:, column] / 1000)
        measured['r%g' % radius] = {
            'radius_m': radius, 'trough_to_crest_mm': measure['trough_to_crest'] * 1000, 'crest_time_s': measure['crest_time'],
            'period_s': measure['period'], 'wavelength_cm': measure['wavelength'] * 100, 'source': os.path.basename(path),
        }
    return measured


def analyse(run, out, full=True):
    parameters = read_parameters(run)
    stone = read_csv(os.path.join(run, 'stone.csv'))
    t0 = contact_time(stone)
    summary = {'run': os.path.abspath(run), 'parameters': parameters, 'contact_time_s': t0}
    cell = parameters['min_cell']
    summary['cells_per_radius'] = R / cell

    # --- the stone ---------------------------------------------------------
    t = stone['t'] - t0
    depth = -stone['stone_x']
    speed = -stone['stone_u']
    force = stone['force']
    keep = t >= -0.001
    # The app's force at this speed: drag Cd 0.5 on πR² plus full buoyancy.
    app_force = 0.5 * RHO_WATER * 0.5 * math.pi * R**2 * speed**2 + RHO_WATER * GRAVITY * 4 / 3 * math.pi * R**3
    rows = []
    last = -1.
    for index in np.nonzero(keep)[0]:
        step = 0.0005 if t[index] < 0.6 else 0.005
        if t[index] - last >= step - 1e-9:
            last = t[index]
            rows.append((t[index] * 1000, depth[index] * 1000, speed[index], force[index], stone['force_far'][index], app_force[index]))
    np.savetxt(os.path.join(out, 'stone.csv'), np.array(rows), delimiter=',', fmt=['%.2f', '%.2f', '%.4f', '%.3f', '%.3f', '%.3f'],
               header='t_ms,depth_mm,speed_m_s,force_N,force_6cells_N,app_model_force_N', comments='')
    wet = (t > 0.01) & (depth > 0) & (speed > 0.3) & (t < 0.3)
    dynamic = 0.5 * RHO_WATER * speed**2 * math.pi * R**2
    head = RHO_WATER * GRAVITY * np.maximum(depth, 0) * math.pi * R**2
    summary['stone'] = {
        'entry_speed': float(speed[np.argmin(np.abs(t))]),
        'speed_at_50ms': float(np.interp(0.05, t, speed)), 'depth_at_50ms_mm': float(np.interp(0.05, t, depth) * 1000),
        'force_coefficient_median_10_300ms': float(np.median(force[wet] / dynamic[wet])) if np.any(wet) else None,
        'force_minus_head_coefficient_median_10_300ms': float(np.median((force[wet] - head[wet]) / dynamic[wet])) if np.any(wet) else None,
        'peak_force_N': float(np.max(force[keep])), 'peak_force_time_ms': float(t[keep][np.argmax(force[keep])] * 1000),
    }
    # While the hole is open the stone's back is in air at the atmosphere's
    # pressure, so the head on its front pushes it up like a piston: fit
    # F = Cd·½ρU²πR² + Ch·ρ g h πR² from 10 ms to the pinch-off (found below).
    summary['stone']['_fit_window'] = None
    stone_series = (t, depth, speed, force)
    water = stone['water_volume']
    summary['water_budget_ml'] = {
        'change': float((water[-1] - water[0]) * 1e6),
        'largest_change': float(np.max(np.abs(water - water[0])) * 1e6),
        'removed_drops': float(stone['removed_water'][-1] * 1e6) if 'removed_water' in stone.dtype.names else 0.,
        'filled_bubbles': float(stone['added_water'][-1] * 1e6) if 'added_water' in stone.dtype.names else 0.,
        'inside_stone_max': float(np.max(stone['water_in_stone']) * 1e6),
        'unaccounted': float(((water[-1] - water[0]) + (stone['removed_water'][-1] - stone['added_water'][-1] if 'removed_water' in stone.dtype.names else 0.)) * 1e6),
    }
    # stone.csv's cpu column is wall-clock time since the run (or its last resumption) started.
    summary['cost'] = {'wall_s_since_last_start': float(stone['cpu'][-1]), 'steps': int(stone['step'][-1]), 'max_cells': int(np.max(stone['cells'])),
                       'median_dt_s_first_300ms': float(np.median(stone['dt'][(t > 0) & (t < 0.3)])) if np.any((t > 0) & (t < 0.3)) else None,
                       'simulated_s': float(stone['t'][-1])}

    # --- the cavity, from the connected regions and the axis ----------------
    regions = read_csv(os.path.join(run, 'regions.csv'))
    rt = regions['t'] - t0
    bottom = regions['cavity_bottom']
    open_cavity = bottom < NODATA
    pinched = regions['pinched'] > 0.5
    axis = read_axis(run)
    # The first water on the axis between the stone's top and the surface.
    first_neck = None
    for (time, stone_x, pairs) in axis:
        top = stone_x + R
        inside = [pair for pair in pairs if pair[0] > top + 2 * cell and pair[1] < -0.002]
        if inside and time - t0 > 0.005:
            pair = min(inside, key=lambda pair: pair[0])
            first_neck = (time - t0, 0.5 * (pair[0] + pair[1]), stone_x, pair)
            break
    # A dome over the mouth: water on the axis across the still surface while air is still below it.
    first_dome = None
    for (time, stone_x, pairs) in axis:
        top = stone_x + R
        if time - t0 < 0.005:
            continue
        for pair in pairs:
            if pair[0] > -0.01 and pair[0] < 0.2 and pair[0] > top + 0.02:
                first_dome = (time - t0, 0.5 * (pair[0] + pair[1]))
                break
        if first_dome:
            break
    pinch_index = np.argmax(pinched & (rt > 0.005)) if np.any(pinched & (rt > 0.005)) else None
    sealed_index = np.argmax(~open_cavity & (rt > 0.005)) if np.any(~open_cavity & (rt > 0.005)) else None
    cavity = {}
    if pinch_index is not None:
        cavity['regions_disconnected_ms'] = float(rt[pinch_index] * 1000)
    if sealed_index is not None:
        cavity['no_open_cavity_from_ms'] = float(rt[sealed_index] * 1000)
    if first_neck:
        cavity['pinch_time_ms'] = first_neck[0] * 1000
        cavity['pinch_time_sqrt_R_g'] = first_neck[0] / TIME_UNIT
        cavity['pinch_depth_mm'] = -first_neck[1] * 1000
        cavity['pinch_depth_R'] = -first_neck[1] / R
        cavity['stone_depth_at_pinch_R'] = -first_neck[2] / R
        cavity['pinch_over_stone_depth'] = first_neck[1] / first_neck[2]
    if first_dome:
        cavity['dome_over_mouth_ms'] = first_dome[0] * 1000
        cavity['dome_height_mm'] = first_dome[1] * 1000
    # The crown's dome closing over the hole (a surface seal): the pond's own
    # water (regions.csv's jet_tip, the highest pond water on the axis, which
    # until then is the stone's underside) above the still surface before the
    # pinch-off. Loose drops on the axis do not count.
    closed = (regions['jet_tip'] > 0.002) & (rt > 0.003)
    if first_neck:
        closed &= rt < first_neck[0]
    if np.any(closed):
        index = int(np.argmax(closed))
        cavity['surface_seal_ms'] = float(rt[index] * 1000)
        cavity['surface_seal_height_mm'] = float(regions['jet_tip'][index] * 1000)
    # Any water reaching the axis above the still surface (the crown
    # converging, or broken into drops and a spike, which a coarse grid shows
    # instead of a whole dome), before the first water inside the hole.
    for (time, stone_x, pairs) in axis:
        if time - t0 < 0.003 or (first_neck and time - t0 >= first_neck[0]):
            continue
        above = [pair for pair in pairs if pair[0] > 0.002]
        if above:
            cavity['crown_reaches_axis_ms'] = (time - t0) * 1000
            cavity['crown_reaches_axis_height_mm'] = min(pair[0] for pair in above) * 1000
            break

    # The mouth (the cavity wall at the still surface) from the interface.
    rows = []
    for (time, name) in facet_times(run):
        if time - t0 < -0.0005 or time - t0 > 1.0:
            continue
        segments = read_facets(name)
        segments = segments[segments[:, 1] < 0.25]
        mouth = wall_radius_at(segments, 0., axis_is_wet(axis, time, 0.)) if len(segments) else 0.
        index = np.argmin(np.abs(rt - (time - t0)))
        rows.append(((time - t0) * 1000, mouth * 1000, -bottom[index] * 1000 if open_cavity[index] else float('nan'),
                     -regions['stone_x'][index] * 1000, int(pinched[index]), regions['bubble_volume'][index] * 1e6))
    rows = np.array(rows)
    np.savetxt(os.path.join(out, 'cavity.csv'), rows, delimiter=',', fmt=['%.1f', '%.2f', '%.2f', '%.2f', '%d', '%.3f'],
               header='t_ms,mouth_radius_mm,open_cavity_depth_mm,stone_depth_mm,stone_bubble_cut_off,stone_bubble_volume_ml', comments='')
    if len(rows):
        early = rows[(rows[:, 0] > 2) & (rows[:, 0] < 200)]
        if len(early):
            widest = early[np.argmax(early[:, 1])]
            cavity['widest_mouth_mm'] = float(widest[1])
            cavity['widest_mouth_R'] = float(widest[1] / 1000 / R)
            cavity['widest_mouth_ms'] = float(widest[0])
        # The surface closes: the open cavity shallower than R/4 (or gone) after the pinch.
        after = rows[(rows[:, 0] > (cavity.get('pinch_time_ms', 1e9))) & ((np.isnan(rows[:, 2])) | (rows[:, 2] < 0.25 * R * 1000))]
        if len(after):
            cavity['surface_closes_ms'] = float(after[0, 0])
            cavity['closure_after_pinch_sqrt_R_g'] = float((after[0, 0] - cavity['pinch_time_ms']) / 1000 / TIME_UNIT)
    summary['cavity'] = cavity

    # The stone's force while the hole is open (see above).
    t_s, depth_s, speed_s, force_s = stone_series
    end = (first_neck[0] - 0.002) if first_neck else 0.3
    window = (t_s > 0.01) & (t_s < end) & (speed_s > 0.3) & (depth_s > 0)
    del summary['stone']['_fit_window']
    if np.sum(window) > 10:
        area = math.pi * R**2
        columns = np.column_stack([0.5 * RHO_WATER * speed_s[window]**2 * area, RHO_WATER * GRAVITY * depth_s[window] * area])
        (drag, head), *_ = np.linalg.lstsq(columns, force_s[window], rcond=None)
        residual = force_s[window] - columns @ np.array([drag, head])
        summary['stone']['open_cavity_fit'] = {'window_ms': [10., end * 1000], 'drag_coefficient': float(drag), 'head_coefficient': float(head),
                                               'rms_residual_N': float(np.sqrt(np.mean(residual**2))),
                                               'note': 'F = Cd·½ρU²πR² + Ch·ρgh·πR², h the depth of the centre'}

    # --- the jet -------------------------------------------------------------
    # The column's top is the highest water on the axis still joined to the
    # pond (regions.csv's jet_tip, from the solver's own connectivity): runs on
    # the axis alone cannot tell a thread thinner than a cell from a chain of
    # drops. After the pinch-off it rises from the pinch point; when its tip
    # breaks off as a drop it falls back to the new tip.
    jet = {}
    after = (rt >= (first_neck[0] if first_neck else 1e9)) & (regions['jet_tip'] > -1)
    jt, top = rt[after], regions['jet_tip'][after]
    if len(jt) > 5:
        # The speed: a fit over 2 ms either side, along unbroken rises only (a
        # tip breaking off drops the top, which is not a speed).
        speeds = np.full(len(top), np.nan)
        for index in range(len(top)):
            window = np.nonzero(np.abs(jt - jt[index]) <= 0.002)[0]
            lo, hi = window[0], window[-1]
            steps = np.diff(top[lo:hi + 1])
            if hi - lo >= 2 and np.all(steps > -0.005):
                speeds[index] = np.polyfit(jt[lo:hi + 1], top[lo:hi + 1], 1)[0]
        # Bottom of the downward jet: the axis run holding the pinch point.
        bottoms = []
        for time in jt:
            index = int(np.argmin(np.abs(axis_times(axis) - (time + t0))))
            pairs = merged(axis[index][2], 2 * cell)
            holding = [pair for pair in pairs if pair[0] <= first_neck[1] + 0.002 and pair[1] >= first_neck[1] - 0.002]
            bottoms.append(holding[0][0] * 1000 if holding else float('nan'))
        breaks = np.nonzero(np.diff(top) < -0.01)[0]
        np.savetxt(os.path.join(out, 'jet.csv'), np.column_stack([jt * 1000, top * 1000, speeds, bottoms]),
                   delimiter=',', fmt=['%.2f', '%.2f', '%.3f', '%.2f'],
                   header='t_ms,column_top_mm,column_top_speed_m_s,downward_jet_bottom_mm', comments='')
        emerged = np.nonzero(top > 0.)[0]
        if len(emerged):
            first = emerged[0]
            jet['emerges_ms'] = float(jt[first] * 1000)
            window = (jt >= jt[first]) & (jt <= jt[first] + 0.005) & ~np.isnan(speeds)
            jet['speed_at_emergence_m_s'] = float(np.median(speeds[window])) if np.any(window) else None
            highest = int(np.argmax(top))
            jet['top_mm'] = float(top[highest] * 1000)
            jet['top_ms'] = float(jt[highest] * 1000)
            above = (top > 0.) & ~np.isnan(speeds)
            jet['fastest_tip_above_surface_m_s'] = float(np.max(speeds[above])) if np.any(above) else None
            # Speed of the column's top at a few times, for the comparison.
            jet['tip_speed_m_s_at'] = {('%d ms' % when): (float(np.nanmedian(speeds[np.abs(jt * 1000 - when) < 3]))
                                                            if np.any(~np.isnan(speeds[np.abs(jt * 1000 - when) < 3])) else None)
                                       for when in (130, 150, 200, 250, 300, 400)}
            jet['tip_breaks_ms'] = [round(float(jt[index] * 1000), 1) for index in breaks if top[index] > 0.][:20]
            # When the column is back under the still surface (the jet gone).
            gone = np.nonzero((jt > jt[highest]) & (top < 0.))[0]
            if len(gone):
                jet['back_under_surface_ms'] = float(jt[gone[0]] * 1000)
        if not np.all(np.isnan(bottoms)):
            jet['downward_jet_deepest_mm'] = float(np.nanmin(bottoms))
    # Drops on the axis above the surface: drops.csv bodies touching the axis.
    drops_path = os.path.join(run, 'drops.csv')
    tip_drops = []
    if os.path.exists(drops_path) and os.path.getsize(drops_path) > 60:
        drops = read_csv(drops_path)
        if drops.size:
            drops = np.atleast_1d(drops)
            on_axis = (drops['y_min'] < 2 * cell) & (drops['x_min'] > 0.)
            tracks = []
            for row in drops[on_axis]:
                time = row['t'] - t0
                matched = None
                for track in tracks:
                    last = track[-1]
                    dt = time - last['t']
                    if 0 < dt <= 0.0025 and abs(row['x'] - (last['x'] + last['u'] * dt)) < 0.006:
                        matched = track
                        break
                entry = {'t': time, 'x': row['x'], 'u': row['u'], 'volume': row['volume'], 'radius': row['radius']}
                if matched:
                    matched.append(entry)
                else:
                    tracks.append([entry])
            for track in tracks:
                first = track[0]
                if len(track) >= 2:
                    tip_drops.append({'appears_ms': first['t'] * 1000, 'radius_mm': float(np.median([e['radius'] for e in track])) * 1000,
                                      'height_mm': first['x'] * 1000, 'speed_m_s': first['u'], 'samples': len(track),
                                      'highest_mm': max(e['x'] for e in track) * 1000})
            tip_drops.sort(key=lambda drop: drop['appears_ms'])
            with open(os.path.join(out, 'jet_drops.csv'), 'w') as handle:
                handle.write('appears_ms,radius_mm,height_mm,speed_m_s,highest_tracked_mm\n')
                for drop in tip_drops:
                    handle.write('%.1f,%.2f,%.1f,%.3f,%.1f\n' % (drop['appears_ms'], drop['radius_mm'], drop['height_mm'], drop['speed_m_s'], drop['highest_mm']))
    jet['tip_drops'] = len(tip_drops)
    if tip_drops:
        jet['first_tip_drop'] = tip_drops[0]
        jet['tip_drop_radii_mm'] = [round(drop['radius_mm'], 2) for drop in tip_drops[:12]]
        jet['tip_drop_times_ms'] = [round(drop['appears_ms'], 1) for drop in tip_drops[:12]]
    summary['jet'] = jet

    # --- the crown ---------------------------------------------------------
    crown_rows = np.column_stack([rt * 1000, regions['rim_x'] * 1000, regions['rim_y'] * 1000, regions['crown_outer'] * 1000])
    crown_rows = crown_rows[(rt >= 0) & (rt < 0.4) & (regions['rim_x'] > -1)]
    np.savetxt(os.path.join(out, 'crown.csv'), crown_rows, delimiter=',', fmt=['%.2f', '%.2f', '%.2f', '%.2f'],
               header='t_ms,rim_height_mm,rim_radius_mm,outermost_water_above_5mm_mm', comments='')
    crown = {}
    early = crown_rows[crown_rows[:, 0] < 150]
    if len(early):
        peak = early[np.argmax(early[:, 1])]
        crown = {'peak_height_mm': float(peak[1]), 'peak_ms': float(peak[0]), 'radius_at_peak_mm': float(peak[2])}
        # It has collapsed when the rim is back under a quarter of its peak.
        fallen = early[(early[:, 0] > peak[0]) & (early[:, 1] < 0.25 * peak[1])]
        if len(fallen):
            crown['collapsed_ms'] = float(fallen[0, 0])
    if os.path.exists(drops_path) and os.path.getsize(drops_path) > 60:
        drops = np.atleast_1d(read_csv(drops_path))
        rings = drops[(drops['y_min'] > 2 * cell) & (drops['x'] > 0.) & (drops['t'] - t0 < 0.15)]
        if len(rings):
            crown['first_detached_ring_ms'] = float((np.min(rings['t']) - t0) * 1000)
            big = rings[rings['volume'] > 0.05e-6]
            if len(big):
                crown['first_ring_over_0.05ml_ms'] = float((np.min(big['t']) - t0) * 1000)
            # The sheet itself tearing (an axisymmetric sheet cannot finger, so
            # its rim breaks off whole, as rings): the first ring over 1 ml
            # after the first 10 ms, and the rings over 1 ml, as they detach.
            torn = rings[(rings['volume'] > 1e-6) & (rings['t'] - t0 > 0.01)]
            if len(torn):
                crown['first_ring_over_1ml_ms'] = float((np.min(torn['t']) - t0) * 1000)
                detached, known = [], []
                for row in torn[np.argsort(torn['t'])]:
                    if any(abs(row['volume'] - volume) < 0.02 * volume for volume in known):
                        continue
                    known.append(row['volume'])
                    detached.append({'ms': round(float((row['t'] - t0) * 1000), 1), 'ml': round(float(row['volume'] * 1e6), 2),
                                     'radius_mm': round(float(row['y'] * 1000), 1), 'height_mm': round(float(row['x'] * 1000), 1)})
                crown['rings_over_1ml'] = detached[:10]
    summary['crown'] = crown

    # --- the rings ---------------------------------------------------------
    # (Read by hand: numpy's names would drop the dots of "r0.25".)
    path = os.path.join(run, 'gauges.csv')
    with open(path) as handle:
        radii = [float(name[1:]) for name in handle.readline().strip().split(',')[1:]]
    gauges = np.loadtxt(path, delimiter=',', skiprows=1, ndmin=2)
    gt = gauges[:, 0] - t0
    ring = {}
    keep = gt >= 0
    for column, radius in enumerate(radii, start=1):
        ring['r%g' % radius] = ring_measures(gt[keep], gauges[keep, column])
        ring['r%g' % radius]['radius_m'] = radius
    # rings.csv every 5 ms
    grid = np.arange(0., gt[-1], 0.005)
    columns = [grid] + [np.interp(grid, gt[keep], gauges[keep, column]) * 1000 for column in range(1, len(radii) + 1)]
    np.savetxt(os.path.join(out, 'rings.csv'), np.column_stack(columns), delimiter=',',
               fmt=['%.3f'] + ['%.4f'] * len(radii), header='t_s,' + ','.join('eta_mm_at_%gm' % radius for radius in radii), comments='')
    summary['rings_from_gauges'] = ring
    # The ring itself: its linear continuation (rings.py) when there is one.
    continued = os.path.join(out, 'rings_linear.csv')
    if os.path.exists(continued):
        summary['rings'] = continued_rings(continued, t0)
        summary['rings_start_s'] = float(np.loadtxt(continued, delimiter=',', skiprows=1, ndmin=2)[0, 0] - t0)

    # --- the interface, every 10 ms to 0.5 s, thinned to a 2 mm grid -------
    if not full:
        with open(os.path.join(out, 'summary.json'), 'w') as handle:
            json.dump(summary, handle, indent=1, default=float)
        return summary
    lines = ['t_ms,r_mm,z_mm']
    strip = []
    for (time, name) in facet_times(run):
        when = (time - t0) * 1000
        nearest = round(when / 10) * 10
        if abs(when - nearest) > 0.51 or nearest < 0 or nearest > 500:
            continue
        segments = read_facets(name)
        segments = segments[(segments[:, 1] < 0.25) & (segments[:, 0] < 0.8)]
        middle_r = 0.5 * (segments[:, 1] + segments[:, 3]) * 1000
        middle_z = 0.5 * (segments[:, 0] + segments[:, 2]) * 1000
        cells = set()
        for r_mm, z_mm in zip(middle_r, middle_z):
            key = (int(math.floor(r_mm / 2)), int(math.floor(z_mm / 2)))
            if key in cells:
                continue
            cells.add(key)
            lines.append('%d,%.1f,%.1f' % (nearest, r_mm, z_mm))
    with open(os.path.join(out, 'interface.csv'), 'w') as handle:
        handle.write('\n'.join(lines) + '\n')
    summary['interface_points'] = len(lines) - 1

    with open(os.path.join(out, 'summary.json'), 'w') as handle:
        json.dump(summary, handle, indent=1, default=float)
    return summary


# --- the comparison with the app ---------------------------------------------

def comparison_rows(summary, app):
    """Each quantity: (group, quantity, the simulation's value in `summary`,
    the app's for the same case (app-numbers.mjs, its times shifted to first
    contact), a note)."""
    shift = app['case'].get('contactTime', 0.)
    unit = TIME_UNIT * 1000
    rows = []
    def add(group, quantity, simulated, app_value, note=''):
        rows.append((group, quantity, simulated, app_value, note))
    cavity, jet, crown, stone = (summary.get(key, {}) for key in ('cavity', 'jet', 'crown', 'stone'))
    ac = app['cavity']
    add('cavity', 'pinch-off, ms after contact', cavity.get('pinch_time_ms'), (ac['pinchTime'] - shift) * 1000, 'PINCH_TIME = 2.1 sqrt(R/g) on the splash clock')
    add('cavity', 'pinch-off, sqrt(R/g) after contact', cavity.get('pinch_time_sqrt_R_g'), (ac['pinchTime'] - shift) * 1000 / unit, 'Duclaux et al. 2007: 2.06')
    add('cavity', 'pinch-off depth, R', cavity.get('pinch_depth_R'), ac['pinchDepth'] / R)
    add('cavity', "stone's centre depth at the pinch-off, R", cavity.get('stone_depth_at_pinch_R'), ac['stoneDepthAtPinch'] / R)
    add('cavity', 'pinch depth / stone depth', cavity.get('pinch_over_stone_depth'), ac['pinchDepth'] / ac['stoneDepthAtPinch'], 'Duclaux et al.: about 1/2')
    add('cavity', 'surface closed, ms after contact', cavity.get('surface_closes_ms'), (ac['closeTime'] - shift) * 1000, 'CLOSE_TIME = 0.4 sqrt(R/g) after the pinch')
    add('cavity', 'widest mouth (wall at the still surface), R', cavity.get('widest_mouth_R'), ac['widestMouth'] / R, 'WIDEN = 0.45')
    add('cavity', 'widest mouth, ms after contact', cavity.get('widest_mouth_ms'), (ac['widestTime'] - shift) * 1000)
    aj = app['jet']
    add('jet', 'above the still surface, ms after contact', jet.get('emerges_ms'), (aj['startTime'] - shift) * 1000 if aj.get('startTime') is not None else None, "the app's jet starts at the surface's closure")
    add('jet', 'tip speed as it emerges, m/s', jet.get('speed_at_emergence_m_s'), aj.get('tipSpeed'))
    add('jet', 'fastest tip above the surface, m/s', jet.get('fastest_tip_above_surface_m_s'), aj.get('tipSpeed'))
    top = int(np.argmax(aj['top'])) if aj['top'] else None
    add('jet', 'highest tip, mm', jet.get('top_mm'), aj['top'][top] * 1000 if top is not None else None)
    add('jet', 'highest tip, ms after contact', jet.get('top_ms'), (aj['t'][top] - shift) * 1000 if top is not None else None)
    tip_drops = [drop for drop in aj['drops'] if drop['radius'] >= 0.002]
    first = jet.get('first_tip_drop')
    add('jet', 'first tip drop, ms after contact', first['appears_ms'] if first else None, (tip_drops[0]['t'] - shift) * 1000 if tip_drops else None)
    add('jet', 'first tip drop, radius mm', first['radius_mm'] if first else None, tip_drops[0]['radius'] * 1000 if tip_drops else None)
    add('jet', 'drops of 2 mm radius or more from the jet', jet.get('tip_drops'), len(tip_drops), 'simulation: drops leaving the tip along the axis')
    acr = app['crown']
    peak = int(np.argmax(acr['rimHeight'])) if acr['rimHeight'] else None
    add('crown', 'highest rim, mm above the still surface', crown.get('peak_height_mm'), acr['rimHeight'][peak] * 1000 if peak is not None else None)
    add('crown', 'highest rim, ms after contact', crown.get('peak_ms'), (acr['t'][peak] - shift) * 1000 if peak is not None else None)
    add('crown', 'rim radius at the highest, mm', crown.get('radius_at_peak_mm'), acr['reach'][peak] * 1000 if peak is not None else None, "app: the sheet's farthest point from the axis")
    add('crown', 'tears (first ring over 1 ml shed from the rim), ms after contact', crown.get('first_ring_over_1ml_ms'), (acr['breakTime'] - shift) * 1000, 'axisymmetric: no fingers; the rim breaks off as rings')
    add('crown', 'collapsed (rim under a quarter of its peak), ms', crown.get('collapsed_ms'), (acr['endTime'] - shift) * 1000, "app: the sheet's end")
    for app_ring in app['ring']['summary']:
        ring = summary.get('rings', {}).get('r%g' % app_ring['r'], {})
        # The continuation starts at 1 s, when the ring has passed 0.25 m: nothing to compare there.
        if ring.get('source') and app_ring['crestTime'] - shift < summary['rings_start_s'] + 0.3:
            continue
        add('ring', 'trough to crest at %g m (largest swing within 0.6 s), mm' % app_ring['r'], ring.get('trough_to_crest_mm'), app_ring['troughToCrest'] * 1000,
            'simulation: continued linearly from 1 s (rings_linear.md); app: src/rings.js, film off, mean around the circle')
        add('ring', 'highest crest at %g m, s after contact' % app_ring['r'], ring.get('crest_time_s'), app_ring['crestTime'] - shift)
        add('ring', 'wavelength at the crest at %g m, cm' % app_ring['r'], ring.get('wavelength_cm'), app_ring['wavelength'] * 100, 'from the period between the zero crossings around the crest')
    fit = stone.get('open_cavity_fit') or {}
    add('stone', 'drag coefficient (pressure force less the head on the front)', stone.get('force_minus_head_coefficient_median_10_300ms'), 0.5, "src/rock.js; the simulation's stone follows the app's path")
    add('stone', 'open hole: drag coefficient Cd in F = Cd·½ρU²πR² + Ch·ρgh·πR²', fit.get('drag_coefficient'), 0.5, 'app: Cd 0.5 and buoyancy only')
    add('stone', 'open hole: head coefficient Ch', fit.get('head_coefficient'), None, 'h: depth of the centre')
    return rows


def write_comparison(out, summary, app, checks=()):
    """comparison.csv: each quantity, the simulation's value (the run, then
    each check: (label, summary)), the app's, and their ratio to the run's."""
    main = comparison_rows(summary, app)
    others = [(label, comparison_rows(other, app)) for label, other in checks]
    level = int(summary['parameters']['max_level'])
    cell = lambda value: '' if value is None else ('%.4g' % value)
    with open(os.path.join(out, 'comparison.csv'), 'w') as handle:
        handle.write('group,quantity,level %d%s,app,app_over_level_%d,note\n' % (level, ''.join(',%s' % label for label, _ in others), level))
        for index, (group, quantity, simulated, app_value, note) in enumerate(main):
            ratio = app_value / simulated if simulated not in (None, 0) and app_value is not None else None
            handle.write('%s,"%s",%s%s,%s,%s,"%s"\n' % (group, quantity, cell(simulated),
                         ''.join(',%s' % cell(rows[index][2]) for _, rows in others), cell(app_value), cell(ratio), note))
    # The same as a Markdown table, for the README.
    short = lambda value: '' if value is None else ('%.3g' % value)
    with open(os.path.join(out, 'comparison.md'), 'w') as handle:
        handle.write('| | quantity | level %d%s | app | note |\n' % (level, ''.join(' | %s' % label for label, _ in others)))
        handle.write('|---|---|---%s|---|---|\n' % ('|---' * len(others)))
        for index, (group, quantity, simulated, app_value, note) in enumerate(main):
            handle.write('| %s | %s | %s%s | %s | %s |\n' % (group, quantity, short(simulated),
                         ''.join(' | %s' % short(rows[index][2]) for _, rows in others), short(app_value), note))
    return main


# --- plots --------------------------------------------------------------------

def stone_outline(centre, front_only):
    angles = np.linspace(0., 2 * math.pi, 181)
    r, z = R * np.sin(angles), centre + R * np.cos(angles)
    if front_only:
        keep = z <= centre + 1e-12
        r, z = np.append(r[keep], r[keep][0]), np.append(z[keep], z[keep][0])
    return r, z


def plot_strip(run, out, summary, times_ms, row_limits=((-30, 15), (-48, 40), (-50, 85))):
    """The interface at the given times, seven to a row, each row with its own
    height range (the cavity, the pinch-off, the jet), to scale."""
    parameters = summary['parameters']
    front = bool(parameters.get('front_only', 0))
    t0 = summary['contact_time_s']
    stone = read_csv(os.path.join(run, 'stone.csv'))
    files = facet_times(run)
    columns = 7
    rows = int(math.ceil(len(times_ms) / columns))
    limits = [row_limits[min(row, len(row_limits) - 1)] for row in range(rows)]
    half_width = 12
    heights = [high - low for low, high in limits]
    figure, axes = plt.subplots(rows, columns, figsize=(1.4 * columns, sum(heights) / (2 * half_width) * 1.4 + 0.6),
                                gridspec_kw={'height_ratios': heights}, squeeze=False)
    for index, when in enumerate(times_ms):
        row, column = divmod(index, columns)
        panel = axes[row, column]
        low, high = limits[row]
        time = t0 + when / 1000
        nearest = min(files, key=lambda item: abs(item[0] - time))
        segments = read_facets(nearest[1])
        keep = (segments[:, 1] < half_width / 100) & (segments[:, 0] > low / 100) & (segments[:, 0] < high / 100)
        segments = segments[keep]
        for side in (1, -1):
            panel.plot(np.vstack([side * segments[:, 1], side * segments[:, 3]]) * 100, np.vstack([segments[:, 0], segments[:, 2]]) * 100,
                       color='#1f5fa8', linewidth=0.5)
        centre = float(np.interp(nearest[0], stone['t'], stone['stone_x']))
        r, z = stone_outline(centre, front)
        panel.fill(np.concatenate([r, -r[::-1]]) * 100, np.concatenate([z, z[::-1]]) * 100, color='#7a6a58', linewidth=0)
        panel.axhline(0., color='#999999', linewidth=0.4, linestyle=':')
        panel.set_xlim(-half_width, half_width)
        panel.set_ylim(low, high)
        panel.set_aspect('equal')
        panel.set_title('%d ms' % round((nearest[0] - t0) * 1000), fontsize=8)
        panel.tick_params(labelsize=6)
        if column == 0:
            panel.set_ylabel('height (cm)', fontsize=7)
    for panel in list(axes.flat)[len(times_ms):]:
        panel.axis('off')
    figure.suptitle('The interface: a %g cm stone at %.1f m/s, time from contact (cm; the axis at 0)'
                    % (2 * R * 100, summary['stone']['entry_speed']), fontsize=9)
    figure.tight_layout(rect=(0, 0, 1, 0.985))
    figure.savefig(os.path.join(out, 'strip.png'), dpi=100)
    plt.close(figure)


def plot_comparisons(out, summary, app=None, checks=()):
    """checks: (label, directory) of the other resolutions' outputs."""
    load = lambda name, base=out: np.genfromtxt(os.path.join(base, name), delimiter=',', names=True)
    # The app's clock starts a substep before first contact (app-numbers.mjs): shift it.
    shift = app['case'].get('contactTime', 0.) if app else 0.
    app_ms = lambda times: (np.array(times) - shift) * 1000
    level = int(summary['parameters']['max_level'])
    label_fine = 'simulation (level %d)' % level
    def each_check(name):
        for label, base in checks:
            if os.path.exists(os.path.join(base, name)):
                yield label, load(name, base)

    # The stone and its force.
    stone = load('stone.csv')
    figure, axes = plt.subplots(1, 3, figsize=(12, 3.4))
    axes[0].plot(stone['t_ms'], stone['depth_mm'] / 10, label=label_fine)
    axes[1].plot(stone['t_ms'], stone['speed_m_s'], label=label_fine)
    axes[2].plot(stone['t_ms'], stone['force_N'], label='pressure force (simulation)', linewidth=0.8)
    axes[2].plot(stone['t_ms'], stone['app_model_force_N'], label="app's model at this speed (Cd 0.5 + buoyancy)", linewidth=0.8)
    if app:
        axes[0].plot(app_ms(app['stone']['t']), np.array(app['stone']['depth']) * 100, '--', label="app's path")
        axes[1].plot(app_ms(app['stone']['t']), app['stone']['speed'], '--', label="app's path")
    axes[0].set_ylabel('stone centre depth (cm)'); axes[1].set_ylabel('speed (m/s)'); axes[2].set_ylabel('force on the stone (N)')
    axes[2].set_ylim(0, 1.2 * max(np.percentile(stone['force_N'], 99), 1))
    for axis in axes:
        axis.set_xlabel('time from contact (ms)'); axis.set_xlim(0, 400); axis.legend(fontsize=7)
    figure.tight_layout(); figure.savefig(os.path.join(out, 'stone.png'), dpi=100); plt.close(figure)

    # The cavity.
    cavity = load('cavity.csv')
    figure, axes = plt.subplots(1, 2, figsize=(11, 3.6))
    axes[0].plot(cavity['t_ms'], cavity['mouth_radius_mm'] / (R * 1000), label=label_fine)
    axes[1].plot(cavity['t_ms'], cavity['open_cavity_depth_mm'] / (R * 1000), label=label_fine + ': open hole')
    axes[1].plot(cavity['t_ms'], cavity['stone_depth_mm'] / (R * 1000), ':', label='the stone (centre)')
    for label, other in each_check('cavity.csv'):
        axes[0].plot(other['t_ms'], other['mouth_radius_mm'] / (R * 1000), label=label, alpha=0.7, linewidth=0.8)
        axes[1].plot(other['t_ms'], other['open_cavity_depth_mm'] / (R * 1000), label=label, alpha=0.7, linewidth=0.8)
    if app:
        axes[0].plot(app_ms(app['cavity']['t']), np.array(app['cavity']['mouth']) / R, '--', label='app')
        axes[1].plot(app_ms(app['cavity']['t']), np.array(app['cavity']['holeDepth']) / R, '--', label='app: hole depth')
    pinch = summary['cavity'].get('pinch_time_ms')
    for axis in axes:
        if pinch:
            axis.axvline(pinch, color='k', linewidth=0.6, linestyle=':')
        axis.axvline(2.06 * TIME_UNIT * 1000, color='r', linewidth=0.6, linestyle='--')
        axis.set_xlabel('time from contact (ms)'); axis.set_xlim(0, 250); axis.legend(fontsize=7)
    axes[0].set_ylabel('mouth radius at the still surface (R)'); axes[1].set_ylabel('depth (R)')
    axes[0].set_title('red dashed: Duclaux et al. pinch-off 2.06 sqrt(R/g); dotted: simulated', fontsize=8)
    figure.tight_layout(); figure.savefig(os.path.join(out, 'cavity.png'), dpi=100); plt.close(figure)

    # The jet.
    if os.path.exists(os.path.join(out, 'jet.csv')):
        jet = load('jet.csv')
        figure, axes = plt.subplots(1, 2, figsize=(11, 3.6))
        axes[0].plot(jet['t_ms'], jet['column_top_mm'] / 10, label=label_fine + ': column top')
        axes[0].plot(jet['t_ms'], jet['downward_jet_bottom_mm'] / 10, label=label_fine + ': downward jet', linewidth=0.8)
        if os.path.exists(os.path.join(out, 'jet_drops.csv')):
            drops = np.atleast_1d(load('jet_drops.csv'))
            if drops.size and 'appears_ms' in drops.dtype.names:
                axes[0].scatter(drops['appears_ms'], drops['height_mm'] / 10, s=np.maximum(drops['radius_mm'], 0.5) * 8, color='k', label='tip drops (size ∝ radius)', zorder=3)
        for label, other in each_check('jet.csv'):
            axes[0].plot(other['t_ms'], other['column_top_mm'] / 10, label=label, alpha=0.7, linewidth=0.8)
        speed = jet['column_top_speed_m_s']
        axes[1].plot(jet['t_ms'], speed, label=label_fine, linewidth=0.8)
        if app and app['jet']['t']:
            axes[0].plot(app_ms(app['jet']['t']), np.array(app['jet']['top']) * 100, '--', label='app: column top')
            axes[1].axhline(app['jet'].get('tipSpeed', float('nan')), linestyle='--', color='C1', label="app's tip launch speed")
        axes[0].axhline(0, color='#999999', linewidth=0.4)
        axes[0].set_ylabel('height (cm)'); axes[1].set_ylabel('column top speed (m/s)')
        axes[1].set_ylim(-5, 30)
        for axis in axes:
            axis.set_xlabel('time from contact (ms)'); axis.set_xlim(0, 600); axis.legend(fontsize=7)
        figure.tight_layout(); figure.savefig(os.path.join(out, 'jet.png'), dpi=100); plt.close(figure)

    # The crown.
    crown = load('crown.csv')
    figure, axes = plt.subplots(1, 2, figsize=(11, 3.6))
    axes[0].plot(crown['t_ms'], crown['rim_height_mm'] / 10, label=label_fine)
    axes[1].plot(crown['t_ms'], crown['rim_radius_mm'] / 10, label=label_fine)
    for label, other in each_check('crown.csv'):
        axes[0].plot(other['t_ms'], other['rim_height_mm'] / 10, label=label, alpha=0.7, linewidth=0.8)
        axes[1].plot(other['t_ms'], other['rim_radius_mm'] / 10, label=label, alpha=0.7, linewidth=0.8)
    if app:
        axes[0].plot(app_ms(app['crown']['t']), np.array(app['crown']['rimHeight']) * 100, '--', label='app: highest point of the sheet')
        axes[1].plot(app_ms(app['crown']['t']), np.array(app['crown']['reach']) * 100, '--', label="app: the sheet's farthest point")
        for axis in axes:
            axis.axvline((app['crown']['breakTime'] - shift) * 1000, color='C2', linewidth=0.6, linestyle='--')
    axes[0].set_ylabel('rim height (cm)'); axes[1].set_ylabel('rim radius (cm)')
    for axis in axes:
        axis.set_xlabel('time from contact (ms)'); axis.set_xlim(0, 200); axis.legend(fontsize=7)
    figure.tight_layout(); figure.savefig(os.path.join(out, 'crown.png'), dpi=100); plt.close(figure)

    # The rings.
    with open(os.path.join(out, 'rings.csv')) as handle:
        radii = [float(name[len('eta_mm_at_'):-1]) for name in handle.readline().strip().split(',')[1:]]
    rings = np.loadtxt(os.path.join(out, 'rings.csv'), delimiter=',', skiprows=1, ndmin=2)
    chosen = [column for column, radius in enumerate(radii, start=1) if radius in (0.25, 0.5, 1.0, 1.5)]
    continued_path = os.path.join(out, 'rings_linear.csv')
    continued = None
    if os.path.exists(continued_path):
        with open(continued_path) as handle:
            continued_radii = [float(name[len('eta_mm_at_'):-1]) for name in handle.readline().strip().split(',')[1:]]
        continued = np.loadtxt(continued_path, delimiter=',', skiprows=1, ndmin=2)
    figure, axes = plt.subplots(len(chosen), 1, figsize=(11, 1.9 * len(chosen)), sharex=True)
    for axis, column in zip(np.atleast_1d(axes), chosen):
        radius = radii[column - 1]
        axis.plot(rings[:, 0], rings[:, column], linewidth=0.7, label=label_fine)
        if continued is not None and radius in continued_radii:
            axis.plot(continued[:, 0] - summary['contact_time_s'], continued[:, 1 + continued_radii.index(radius)], linewidth=0.7, alpha=0.8, label='simulation continued linearly from 1 s')
        if app:
            index = [abs(value - radius) < 1e-6 for value in app['ring']['r']]
            if any(index):
                eta = np.array(app['ring']['eta'][index.index(True)]) * 1000
                axis.plot(np.array(app['ring']['t']) - shift, eta, '--', linewidth=0.7, label="app (src/rings.js's ring, film off, mean around the circle)")
        axis.set_ylabel('η at %g m (mm)' % radius, fontsize=8)
        axis.legend(fontsize=7, loc='upper right')
    np.atleast_1d(axes)[-1].set_xlabel('time from contact (s)')
    figure.tight_layout(); figure.savefig(os.path.join(out, 'rings.png'), dpi=100); plt.close(figure)


def plot_resolution(runs, out, times_ms=(10, 30, 50, 70, 90, 105, 115, 130)):
    """The interface of each run (label, directory) overlaid at the same times
    from contact: what the resolution changes."""
    colours = ['#1f5fa8', '#d1495b', '#2e9e5b', '#e09f3e']
    figure, axes = plt.subplots(1, len(times_ms), figsize=(1.6 * len(times_ms), 5.2), sharey=True)
    for (label, run), colour in zip(runs, colours):
        t0 = contact_time(read_csv(os.path.join(run, 'stone.csv')))
        files = facet_times(run)
        for panel, when in zip(axes, times_ms):
            nearest = min(files, key=lambda item: abs(item[0] - (t0 + when / 1000)))
            if abs(nearest[0] - (t0 + when / 1000)) > 0.0011:
                continue
            segments = read_facets(nearest[1])
            segments = segments[(segments[:, 1] < 0.1) & (segments[:, 0] > -0.45) & (segments[:, 0] < 0.2)]
            panel.plot(np.vstack([segments[:, 1], segments[:, 3]]) * 100, np.vstack([segments[:, 0], segments[:, 2]]) * 100,
                       color=colour, linewidth=0.5)
            panel.plot([], [], color=colour, label=label)
    for panel, when in zip(axes, times_ms):
        panel.set_title('%d ms' % when, fontsize=8)
        panel.set_xlim(0, 10)
        panel.set_ylim(-45, 20)
        panel.set_aspect('equal')
        panel.tick_params(labelsize=6)
        panel.set_xlabel('r (cm)', fontsize=7)
    axes[0].set_ylabel('height (cm)', fontsize=7)
    axes[0].legend(fontsize=6, loc='lower right')
    figure.suptitle('The interface at two resolutions (time from contact)', fontsize=9)
    figure.tight_layout(rect=(0, 0, 1, 0.96))
    figure.savefig(os.path.join(out, 'resolution.png'), dpi=110)
    plt.close(figure)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('run')
    parser.add_argument('--out', default='results')
    parser.add_argument('--app')
    parser.add_argument('--check', action='append', default=[])
    arguments = parser.parse_args()
    os.makedirs(arguments.out, exist_ok=True)
    result = analyse(arguments.run, arguments.out)
    app = json.load(open(arguments.app)) if arguments.app else None
    checks = []
    result['checks'] = {}
    for other in arguments.check:
        level = int(read_parameters(other)['max_level'])
        label = 'level %d' % level
        directory = os.path.join(arguments.out, 'check-L%d' % level)
        os.makedirs(directory, exist_ok=True)
        summary = analyse(other, directory, full=False)
        os.remove(os.path.join(directory, 'summary.json'))
        result['checks'][label] = {key: summary[key] for key in ('cavity', 'jet', 'crown', 'stone', 'water_budget_ml', 'cost', 'cells_per_radius', 'contact_time_s')}
        result['checks'][label]['simulated_to_ms'] = (summary['cost']['simulated_s'] - summary['contact_time_s']) * 1000
        checks.append((label, directory))
    with open(os.path.join(arguments.out, 'summary.json'), 'w') as handle:
        json.dump(result, handle, indent=1, default=float)
    plot_strip(arguments.run, arguments.out, result,
               [0, 5, 10, 20, 30, 45, 60, 80, 100, 110, 120, 130, 140, 150, 175, 200, 250, 300, 350, 400, 500])
    plot_comparisons(arguments.out, result, app, checks)
    if arguments.check:
        level = int(result['parameters']['max_level'])
        plot_resolution([('level %d' % level, arguments.run)] + [('level %d' % int(read_parameters(other)['max_level']), other) for other in arguments.check], arguments.out)
    if app:
        check_summaries = [(label, dict(result['checks'][label], parameters={})) for label, _ in checks]
        write_comparison(arguments.out, result, app, check_summaries)
    print(json.dumps({key: result[key] for key in ('cavity', 'jet', 'crown', 'stone', 'water_budget_ml', 'cost')}, indent=1, default=float))
