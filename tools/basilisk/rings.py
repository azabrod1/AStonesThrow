#!/usr/bin/env python3
"""The rings followed on by linear theory from a run's surface profiles.

    python3 rings.py RUN --start T1 [--end 6] [--out DIR]

stone.c writes the surface's elevation every 5 mm out to 2.4 m every 5 ms
(profiles.txt). Past the splash the rings are small, linear waves, so their
future is fixed by the surface's elevation and its rate of change at one
moment T1 (the Cauchy–Poisson problem): with the Hankel transforms

    A(k) = ∫ η(r, T1) J0(kr) r dr,   B(k) = ∫ ∂η/∂t(r, T1) J0(kr) r dr,

    η(r, t) = ∫ [A cos ωτ + B sin(ωτ)/ω] e^(-2νk²τ) J0(kr) k dk,   τ = t - T1,

with ω² = (gk + σk³/ρ) tanh(kh) on the pond's depth h and the viscous
damping of free surface waves. ∂η/∂t comes from the profiles 5 ms either side
of T1. It writes rings_linear.csv (η at the gauges' radii, mm, every 10 ms
from T1 to END) and rings_linear.png (against the simulated gauges where the
run reached), and prints how well the two agree where they overlap.
"""
import argparse, math, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

GRAVITY, SIGMA, RHO, NU, DEPTH = 9.81, 0.072, 1000., 1e-6, 0.8
STEP = 0.005                      # the profiles' spacing (stone.c PROFILE_STEP)
RADII = (0.25, 0.5, 0.75, 1.0, 1.5, 2.0)


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


def read_profiles(run):
    data = np.loadtxt(os.path.join(run, 'profiles.txt'), ndmin=2)
    times, eta = data[:, 0], data[:, 1:]
    order = np.argsort(times, kind='stable')
    return times[order], eta[order]


def continue_linearly(times, eta, start, end, radii, k_max=300., dk=0.25):
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
    omega = np.sqrt((GRAVITY * k + SIGMA / RHO * k**3) * np.tanh(np.minimum(k * DEPTH, 20.)))
    out_times = np.arange(t1, end + 1e-9, 0.01)
    result = np.zeros((len(out_times), len(radii)))
    weights = [bessel_j0(k * radius) * k * dk for radius in radii]
    for row, time in enumerate(out_times):
        tau = time - t1
        spectrum = (a * np.cos(omega * tau) + b * np.sin(omega * tau) / omega) * np.exp(-2 * NU * k**2 * tau)
        for column, weight in enumerate(weights):
            result[row, column] = np.sum(spectrum * weight)
    return t1, out_times, result, level


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('run')
    parser.add_argument('--start', type=float, required=True, help='T1, s on the run clock')
    parser.add_argument('--end', type=float, default=6.)
    parser.add_argument('--out', default='.')
    arguments = parser.parse_args()
    times, eta = read_profiles(arguments.run)
    t1, out_times, result, level = continue_linearly(times, eta, arguments.start, arguments.end, RADII)
    np.savetxt(os.path.join(arguments.out, 'rings_linear.csv'), np.column_stack([out_times, result * 1000]), delimiter=',',
               fmt=['%.3f'] + ['%.4f'] * len(RADII), header='t_s_run_clock,' + ','.join('eta_mm_at_%gm' % radius for radius in RADII), comments='')
    # Against the simulated gauges where they overlap.
    path = os.path.join(arguments.run, 'gauges.csv')
    with open(path) as handle:
        gauge_radii = [float(name[1:]) for name in handle.readline().strip().split(',')[1:]]
    gauges = np.loadtxt(path, delimiter=',', skiprows=1, ndmin=2)
    figure, axes = plt.subplots(len(RADII), 1, figsize=(10, 1.8 * len(RADII)), sharex=True)
    print('linear continuation from t = %.3f s (undisturbed level %.2f mm)' % (t1, level * 1000))
    for column, (axis, radius) in enumerate(zip(axes, RADII)):
        axis.plot(out_times, result[:, column] * 1000, label='linear, from %.2f s' % t1, linewidth=0.8)
        if radius in gauge_radii:
            simulated = gauges[:, 1 + gauge_radii.index(radius)] - level
            axis.plot(gauges[:, 0], simulated * 1000, label='simulated', linewidth=0.8, alpha=0.8)
            overlap = (out_times <= gauges[-1, 0])
            if np.sum(overlap) > 5:
                reference = np.interp(out_times[overlap], gauges[:, 0], simulated)
                error = np.sqrt(np.mean((result[overlap, column] - reference)**2))
                print('  r = %g m: rms difference %.3f mm over %.2f s, simulated rms %.3f mm' % (radius, error * 1000, out_times[overlap][-1] - t1, np.sqrt(np.mean(reference**2)) * 1000))
        axis.set_ylabel('η at %g m (mm)' % radius, fontsize=8)
        axis.legend(fontsize=7, loc='upper right')
    axes[-1].set_xlabel('time (s, run clock)')
    figure.tight_layout()
    figure.savefig(os.path.join(arguments.out, 'rings_linear.png'), dpi=100)


if __name__ == '__main__':
    main()
