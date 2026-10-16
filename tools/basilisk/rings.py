#!/usr/bin/env python3
"""The rings followed on by linear theory from a run's surface profiles.

    python3 rings.py RUN --start T1 [--end 8] [--out DIR] [--film]

stone.c writes the surface's elevation every 5 mm out to 2.4 m every 5 ms
(profiles.txt). Past the splash the rings are small, linear waves, so their
future is fixed by the surface's elevation and its rate of change at one
moment T1 (the Cauchy–Poisson problem): with the Hankel transforms

    A(k) = ∫ η(r, T1) J0(kr) r dr,   B(k) = ∫ ∂η/∂t(r, T1) J0(kr) r dr,

    η(r, t) = ∫ [A cos ωτ + B sin(ωτ)/ω] e^(-γτ) J0(kr) k dk,   τ = t - T1,

with ω² = (gk + σk³/ρ) tanh(kh) on the pond's depth h and γ = 2νk², the
viscous damping of free surface waves (with --film, also a surface film's
k·sqrt(νω/8), as src/rings.js damps the app's rings). ∂η/∂t comes from the
profiles 5 ms either side of T1. It writes

  - rings_linear.csv: η at the gauges' radii (mm), every 10 ms from T1 to END;
  - rings_linear.png: the same against the simulated gauges where the run
    reached;
  - rings_linear.md: at 0.5, 0.75, 1, 1.5 and 2 m, the ring's height from
    trough to crest (the largest swing within any WINDOW seconds, so that a
    slow drift of the level does not count), when its highest crest passes,
    the period around that crest (twice the time between the zero crossings
    either side of it) and its wavelength by the dispersion above; and where
    the run's gauges overlap the continuation, how well they agree (the
    continuation aligned to each gauge at T1: rms difference against the
    simulated rms about its mean, correlation, and each one's trough to
    crest), over the first second after T1 and over the whole overlap.

It prints the table too. On the run's clock, contact is at 0.31 ms.
"""
import argparse, math, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

GRAVITY, SIGMA, RHO, NU, DEPTH = 9.81, 0.072, 1000., 1e-6, 0.8
STEP = 0.005                      # the profiles' spacing (stone.c PROFILE_STEP)
RADII = (0.25, 0.5, 0.75, 1.0, 1.5, 2.0)
TABLE_RADII = (0.5, 0.75, 1.0, 1.5, 2.0)
WINDOW = 0.6                      # s: the trough to crest is the largest swing within a window this long


def bessel_j0(x):
    """J0 (Abramowitz & Stegun 9.4.1 and 9.4.3, error below 1e-7)."""
    x = np.abs(np.asarray(x, dtype=float))
    out = np.empty_like(x)
    small = x <= 3.
    y = (x[small] / 3.)**2
    out[small] = 1 + y * (-2.2499997 + y * (1.2656208 + y * (-0.3163866 + y * (0.0444479 + y * (-0.0039444 + y * 0.00021)))))
    z = 3. / x[~small]
    amplitude = 0.79788456 + z * (-0.00000077 + z * (-0.0055274 + z * (-0.00009512 + z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))))
    phase = x[~small] - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 + z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))))
    out[~small] = amplitude * np.cos(phase) / np.sqrt(x[~small])
    return out


def frequency(k):
    return np.sqrt((GRAVITY * k + SIGMA / RHO * k**3) * np.tanh(np.minimum(k * DEPTH, 20.)))


def wavelength(period):
    """The wavelength of a wave of this period by the dispersion above (Newton's method)."""
    omega = 2 * math.pi / period
    k = omega**2 / GRAVITY
    for _ in range(100):
        value = (GRAVITY * k + SIGMA / RHO * k**3) * math.tanh(k * DEPTH) - omega**2
        slope = (GRAVITY + 3 * SIGMA / RHO * k**2) * math.tanh(k * DEPTH) + (GRAVITY * k + SIGMA / RHO * k**3) * DEPTH / math.cosh(min(k * DEPTH, 50))**2
        k = max(k - value / slope, 0.5 * k)
    return 2 * math.pi / k


def read_profiles(run):
    data = np.loadtxt(os.path.join(run, 'profiles.txt'), ndmin=2)
    times, eta = data[:, 0], data[:, 1:]
    order = np.argsort(times, kind='stable')
    return times[order], eta[order]


def continue_linearly(times, eta, start, end, radii, film=False, k_max=300., dk=0.25):
    index = int(np.argmin(np.abs(times - start)))
    if index == 0 or index == len(times) - 1:
        raise SystemExit('need profiles on both sides of the start time')
    t1 = times[index]
    r = (np.arange(eta.shape[1]) * STEP)
    level = np.median(eta[index, -40:])              # the far edge: the undisturbed level
    surface = eta[index] - level
    rate = (eta[index + 1] - eta[index - 1]) / (times[index + 1] - times[index - 1])
    k = np.arange(dk, k_max, dk)
    kernel = bessel_j0(np.outer(k, r)) * r * STEP     # [k, r]
    a = kernel @ surface
    b = kernel @ rate
    omega = frequency(k)
    damping = 2 * NU * k**2 + (k * np.sqrt(NU * omega / 8) if film else 0.)
    out_times = np.arange(t1, end + 1e-9, 0.01)
    result = np.zeros((len(out_times), len(radii)))
    weights = [bessel_j0(k * radius) * k * dk for radius in radii]
    for row, time in enumerate(out_times):
        tau = time - t1
        spectrum = (a * np.cos(omega * tau) + b * np.sin(omega * tau) / omega) * np.exp(-damping * tau)
        for column, weight in enumerate(weights):
            result[row, column] = np.sum(spectrum * weight)
    return t1, out_times, result, level


def ring_measures(times, eta):
    """The trough to crest (the largest swing within WINDOW s) and where its
    window starts, the highest crest and when, the period around it and its
    wavelength."""
    step = times[1] - times[0]
    span = int(round(WINDOW / step))
    swing, window_start = 0., times[0]
    for index in range(len(times)):
        part = eta[index:index + span + 1]
        if part.max() - part.min() > swing:
            swing, window_start = part.max() - part.min(), times[index]
    crest = int(np.argmax(eta))
    before = after = crest
    while before > 0 and eta[before] > 0:
        before -= 1
    while after < len(eta) - 1 and eta[after] > 0:
        after += 1
    period = 2 * (after - before) * step
    return {'trough_to_crest': swing, 'window_start': window_start, 'crest': eta[crest], 'crest_time': times[crest],
            'period': period, 'wavelength': wavelength(period) if period > 0 else float('nan')}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('run')
    parser.add_argument('--start', type=float, required=True, help='T1, s on the run clock')
    parser.add_argument('--end', type=float, default=8.)
    parser.add_argument('--out', default='.')
    parser.add_argument('--film', action='store_true', help="also damp by a surface film's k·sqrt(νω/8), as the app's rings")
    arguments = parser.parse_args()
    times, eta = read_profiles(arguments.run)
    radii = tuple(sorted(set(RADII) | set(TABLE_RADII)))
    t1, out_times, result, level = continue_linearly(times, eta, arguments.start, arguments.end, radii, film=arguments.film)
    suffix = '_film' if arguments.film else ''
    np.savetxt(os.path.join(arguments.out, 'rings_linear%s.csv' % suffix), np.column_stack([out_times, result * 1000]), delimiter=',',
               fmt=['%.3f'] + ['%.4f'] * len(radii), header='t_s_run_clock,' + ','.join('eta_mm_at_%gm' % radius for radius in radii), comments='')
    # Against the simulated gauges where they overlap.
    path = os.path.join(arguments.run, 'gauges.csv')
    with open(path) as handle:
        gauge_radii = [float(name[1:]) for name in handle.readline().strip().split(',')[1:]]
    gauges = np.loadtxt(path, delimiter=',', skiprows=1, ndmin=2)
    damping = '2νk² and a surface film\'s k·sqrt(νω/8)' if arguments.film else '2νk²'
    lines = ['# The rings continued linearly from %.2f s (%s)' % (t1, os.path.basename(os.path.normpath(arguments.run))), '',
             'The surface at %.2f s on the run clock (contact at 0.31 ms) followed on by linear theory (rings.py), damped by %s, '
             'to %.1f s. Trough to crest: the largest swing within any %.1f s; the period: twice the time between the zero crossings '
             'either side of the highest crest; its wavelength by ω² = (gk + σk³/ρ)·tanh(kh) on h = %.1f m.' % (t1, damping, out_times[-1], WINDOW, DEPTH), '',
             '| distance | trough to crest, mm | highest crest, mm | it passes at, s | period, s | wavelength, cm |', '|---|---|---|---|---|---|']
    measures = {}
    for column, radius in enumerate(radii):
        if radius not in TABLE_RADII:
            continue
        measure = ring_measures(out_times, result[:, column])
        measures[radius] = measure
        lines.append('| %g m | %.2f | %.2f | %.2f | %.2f | %.1f |' % (radius, measure['trough_to_crest'] * 1000, measure['crest'] * 1000, measure['crest_time'], measure['period'], measure['wavelength'] * 100))
    overlap_end = min(gauges[-1, 0], out_times[-1])
    for window_end in sorted({min(t1 + 1., overlap_end), overlap_end}):
        if window_end <= t1 + 0.1:
            continue
        lines += ['', 'Against the simulated gauges from %.2f to %.2f s (the continuation aligned to each gauge at %.2f s):' % (t1, window_end, t1), '',
                  '| distance | rms difference, mm | simulated rms about its mean, mm | difference over simulated | correlation | trough to crest simulated / continued, mm |',
                  '|---|---|---|---|---|---|']
        overlap = out_times <= window_end + 1e-9
        for column, radius in enumerate(radii):
            if radius not in gauge_radii:
                continue
            simulated = gauges[:, 1 + gauge_radii.index(radius)] - level
            reference = np.interp(out_times[overlap], gauges[:, 0], simulated)
            continued = result[overlap, column] + (reference[0] - result[0, column])
            difference = np.sqrt(np.mean((continued - reference)**2))
            spread = np.sqrt(np.mean((reference - reference.mean())**2))
            correlation = np.corrcoef(reference, continued)[0, 1]
            lines.append('| %g m | %.3f | %.3f | %.0f%% | %.3f | %.2f / %.2f |' % (radius, difference * 1000, spread * 1000, 100 * difference / spread, correlation,
                                                                                (reference.max() - reference.min()) * 1000, (continued.max() - continued.min()) * 1000))
    figure, axes = plt.subplots(len(RADII), 1, figsize=(10, 1.8 * len(RADII)), sharex=True)
    for axis, radius in zip(axes, RADII):
        axis.plot(out_times, result[:, radii.index(radius)] * 1000, label='linear, from %.2f s' % t1, linewidth=0.8)
        if radius in gauge_radii:
            axis.plot(gauges[:, 0], (gauges[:, 1 + gauge_radii.index(radius)] - level) * 1000, label='simulated', linewidth=0.8, alpha=0.8)
        axis.set_ylabel('η at %g m (mm)' % radius, fontsize=8)
        axis.legend(fontsize=7, loc='upper right')
    axes[-1].set_xlabel('time (s, run clock)')
    figure.tight_layout()
    figure.savefig(os.path.join(arguments.out, 'rings_linear%s.png' % suffix), dpi=100)
    with open(os.path.join(arguments.out, 'rings_linear%s.md' % suffix), 'w') as handle:
        handle.write('\n'.join(lines) + '\n')
    print('linear continuation from t = %.3f s (undisturbed level %.2f mm)' % (t1, level * 1000))
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
