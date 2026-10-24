/**
# A stone entering a pond: the reference splash

A stone of radius R = 3 cm and density 2600 kg/m³ enters still water
vertically at 6.3 m/s. The pond is 0.8 m deep. (These are the defaults: see
"Other stones" for the arguments that change them.) The flow is computed in
axisymmetric coordinates with Basilisk: two-phase (water and air)
incompressible Navier–Stokes, a VOF interface with surface tension,
gravity through reduced.h, momentum-conserving advection, on an adaptive
quadtree.

Coordinates (axi.h): x runs along the axis, upward, with the still surface at
x = 0 and the pond's floor at x = -0.8 m; y is the distance from the axis.
The domain is a 4 m square: up to 3.2 m above the water and out to 4 m from
the axis. The floor and the far wall are free-slip walls and the sky is an
outflow. Beyond SPONGE from the axis the velocity is relaxed to rest, so the
rings are absorbed instead of coming back from the wall.

## Other stones

`radius=`, `density=`, `speed=` and `depth=` set the stone's radius (m),
density (kg/m³) and entry speed (m/s) and the pond's depth (m). The lengths
above and below are the 3 cm stone's and scale with its radius (SCALE, R over
3 cm): the domain (4 m), the sponge, the splash zone and the other regions of
the mesh, the band for the rings, the gauges and profiles, SINK and the
floor's brake; the depth does not. The output periods about the splash and the
dumps' scale with sqrt(R/g) (TIME_SCALE). So `level=` gives the same cells per
stone radius whatever the radius (12: 31, 13: 61), logged at the start and
written in parameters.txt with the depth, the domain and where the stone stops
on the floor (`floor_stop`). `rings=0` leaves out the band of fine cells
along the surface that follows the rings, for runs about the splash alone. A
run stops at `end=`; outputs that would go on past it stop there too.

## MPI

Built with -D_MPI=1 (run.sh --mpi N), the run is split over N ranks: every
sum (the force's samples, the gauges, the regions' and the drops' measures)
is reduced over them and the first rank writes the files, the axis's cells
and the facets gathered to it. One rank (or no MPI) gives the serial run to
the bit. On N ranks the Poisson solver's Gauss–Seidel sweeps visit the cells
in another order, so the solution differs within the solver's tolerance
(TOLERANCE, 1e-3), as a serial run differs when only that tolerance changes:
the reference at level 11 to 20 ms on 8 ranks is within 1.6 cells of the
serial run's interface, a serial run with TOLERANCE 0.7e-3 within 1.7. Built
with -DJACOBI=1 (an order-free smoother) as well, the 8 ranks keep to the
serial interface within 0.2 cells. With the few tens of thousands of cells a
run at level 12 has, MPI hardly pays (the 30 cm rock to 0.1 s: 12.9 s on one
rank, 11.5 s on 8): run the sweep's stones side by side, one rank each.

## The stone

The stone is a solid mask (cell fractions `stone`, face fractions
`stone_face`, recomputed geometrically every step) imposed by direct forcing.
On every face inside the mask, the face velocity that goes into the pressure
projection is set to the stone's velocity, and the acceleration field gets the
matching term, so the centred velocity follows. Inside the mask the density is
the stone's, so the projection hardly moves its interior off the rigid motion.
What fills the mask is whatever fluid the stone carried in: air, since it
starts in the air. The volume fraction is advected by the projected velocity,
which inside the mask is the stone's own, so that air rides along with it.
It is never reset, so no water is created or destroyed. To the water the stone
is therefore a rigid body filled with gas: there is no adhesion, the contact
angle is effectively 180°, a perfectly non-wetting stone, which is the "rough
stone" case where a cavity always forms. Surface tension acts on the wetted
surface as on a bubble's (2σ/R = 5 Pa against a dynamic pressure of 20 kPa:
negligible).

Only the stone's front half, below its centre, is the mask (`shape=front`,
the default; `shape=sphere` masks the whole sphere). The gas in a closed rigid
mask can pull on the water (its pressure is whatever holds the mask rigid), so
with the whole sphere a resolved water film stays on the rear half and closes
over the top, as a wetting sphere's does (at level 14, 10 ms after contact);
the half sphere's sharp rim at the equator is where the water leaves a real
non-wetting sphere at this speed, and where the app's cavity starts (R at
the stone's equator).

Its path is one of (`path=`):

* `app` (default): the app's src/rock.js path from first contact:
  dU/dt = k U² - g', with k = (3/8)(ρw/ρs)·0.5/R and g' = g (1 - ρw/ρs).
  The app's cavity follows the same path, so the two compare like for like.
* `free`: two-way coupled. The hydrodynamic force is the pressure
  integrated over a sphere 3 cells larger than the stone. The true pressure
  is rebuilt from reduced.h's dynamic pressure, so it includes the hydrostatic
  head on the stone's wetted front. The force moves the stone, together with
  its weight: m dU/dt = F - m g. The coupling is explicit, which is stable
  because the added mass is well below the stone's mass (0.5·1000 against
  2600 kg/m³).
* `constant`: constant speed.

In every mode the force is computed and logged. Near the floor the
stone is braked over its last BRAKE metres (sand) and stops FLOOR_GAP above it.

## The air

`air=` sets its density (1.2 kg/m³ by default) and `airmu=` its viscosity
(1.8e-5 Pa·s). The reference uses air=0.12.
With real air this case seals at the surface: the air rushing into the
growing cavity (0.05 m³/s through a mouth 10 cm across) sucks the crown
inward until it closes over the hole: its water reaches the axis 5 to 6 cm
up 36 ms after contact at level 12, 24 ms at level 13 (the thinner the sheet,
the sooner). Birkhoff & Isaacs' boundary between deep and surface seal,
F = (ρ/ρa)²/6400 (Aristoff & Bush 2009), is F = 108 at 1 atm, and this case
has F = 135. After a surface seal an incompressible model cannot be trusted:
the trapped air cannot expand, so the cavity becomes a closed bubble dragged
down with the stone. Air ten times lighter puts the boundary at F = 10 800
and keeps the crown open at levels 11 and 12, whose sheet stays about a
millimetre thick, so the cavity deep-seals as the app models it; at level 13
the thinner sheet still closes, about 60 ms after contact, drawn in by its
own surface tension (a water bell) and the suction left. Nothing else
depends on the air's inertia.

## Resolution

The tree is adapted on the volume fraction, the velocity and the stone's mask
with `adapt_regions()`, a copy of adapt_wavelet() whose maximum level depends
on the place (and on time). The splash zone (r < 0.3 m, under 1.2 m high:
10 and 40 radii)
gets the finest level, `level=` (13: 0.488 mm, 61 cells per stone radius;
14: 123). It coarsens outward to level 10 beyond 2.4 m. A band around the
still surface is held at level 11 out to 1.6 m and level 10 out to 2.4 m, so
the rings are resolved wherever they are measured. After `fine=` seconds the
splash zone drops to level 12, and after `late=` seconds (never by default)
to level 11, once only the rings are left to follow. The velocity is adapted only in the water and
next to it and the stone (see the adapt event; `airadapt=1` adapts it in all
the air as well).

## Outputs (in the working directory)

* `stone.csv`: every 4 steps: time, step, stone height and velocity, force,
  cells, solver iterations, water volume, water inside the mask, the water
  removed as drops and added as bubbles below the resolution, and (`cpu`) the
  wall-clock seconds since the run (or its last resumption) started.
* `gauges.csv`: every ms (2 ms after 1 s): the surface elevation at radii
  GAUGES, from the column integral of the volume fraction (exact to the
  volume).
* `axis.txt`: every 0.1 ms (0.5 ms after 0.25 s, 2 ms after 1 s): the runs
  of water along the axis (the cavity, the pinch, the jets, the tip drops).
* `regions.csv`: every 0.5 ms: the cavity open to the sky (its deepest
  point, whether it has pinched off), the crown's rim (the highest point of
  the pond's water off the axis) and the jet's tip.
* `drops.csv`: every ms: every body of water detached from the pond, with its
  volume, centroid and velocity.
* `profiles.txt`: every 5 ms from 0.1 s: the surface's elevation every 5 mm
  out to 2.4 m (the rings, whole).
* `facets/` : the interface every ms to 0.3 s, every 2 ms to 0.7 s, then
  every 10 ms.
* `dump-*` and `dump-*.stone`: restart files every 25 ms to 1 s, then every
  0.25 s. A run resumes from the file `restart` (and `restart.stone`) if it
  exists; run.sh --resume sets them up.

    ./stone [level=14] [path=app|free|constant] [end=4] [fine=0.7] [air=1.2]
            [late=] [airmu=1.8e-5] [shape=front|sphere] [airadapt=0|1]
            [radius=0.03] [density=2600] [speed=6.3] [depth=0.8] [rings=1]

Compiled with -DBODY_GRAVITY=1, gravity is a body force instead of reduced.h's
interfacial one (a check: the cavity's walls come out the same).
*/

#ifndef FILTERED
# define FILTERED 0
#endif
#include "axi.h"
#include "navier-stokes/centered.h"
#include "two-phase.h"
#ifndef CONSERVING
# define CONSERVING 1
#endif
#if CONSERVING
# include "navier-stokes/conserving.h"
#endif
#include "tension.h"
#if !BODY_GRAVITY
# include "reduced.h"
#endif
#include "tag.h"

/** ## Parameters */

double RADIUS = 0.03;       // radius=, density=, speed= and depth= change them (see "Other stones")
double RHO_STONE = 2600.;
double ENTRY_SPEED = 6.3;
double DEPTH = 0.8;
#define RHO_WATER 1000.
#define MU_WATER 1.0e-3
#define SIGMA 0.072
#define GRAVITY 9.81
/* The lengths below are the reference stone's, scaled with the radius
(SCALE), and the splash's times with sqrt(R/g) (TIME_SCALE). */
#define SCALE (RADIUS/0.03)
#define TIME_SCALE sqrt(SCALE)
#define DOMAIN (4.0*SCALE)
#define SPONGE (2.6*SCALE)  // from the axis: the sponge starts here...
#define SPONGE_RATE 10.     // ...relaxing the velocity at up to this rate (1/s) at the far wall
#define FLOOR_GAP (0.002*SCALE) // the stone stops this far above the floor...
#define BRAKE (0.015*SCALE)     // ...braked over this distance
#define F_TOL 1e-3          // adaptation tolerances: volume fraction...
#define U_TOL 0.02          // ...velocity (m/s)...
#define S_TOL 1e-3          // ...stone mask
#define FORCE_SAMPLES 360
#define SINK (2.0*SCALE)    // above the still surface: water higher than this is removed (see remove_blobs)
#ifndef MIN_BLOB
# define MIN_BLOB 3         // drops and bubbles narrower than this many cells are removed
#endif

#define STONE_MASS (RHO_STONE*4./3.*M_PI*RADIUS*RADIUS*RADIUS)

int max_level = 14;
double RHO_AIR = 1.2;       // air= and airmu= change them (see "The air" above)
double MU_AIR = 1.8e-5;
int mode = 1;               // 0 constant, 1 app (default), 2 free
bool front_only = true;     // the stone's front half (see "The stone" above)
bool air_adapt = false;     // whether the air's velocity is adapted away from the water (see the adapt event)
double end_time = 4.;
double fine_until = 0.7;
double late_after = 1e30;    // late=: after it the splash zone drops to level 11 (the rings only)
bool rings = true;           // rings=0: no band of fine cells for the rings (see "Resolution")

#define NGAUGES 8
const double GAUGES[NGAUGES] = {0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.4}; // times SCALE
// Column limits for the gauges: on cell edges of every level >= 6 (the base grid).
#define BASE_CELL (DOMAIN/64.)
#define GAUGE_LOW (-DEPTH + floor ((DEPTH - 0.1*SCALE)/BASE_CELL)*BASE_CELL)
#define GAUGE_HIGH (-DEPTH + (floor ((DEPTH - 0.1*SCALE)/BASE_CELL) + 4.)*BASE_CELL)

/** ## The stone's state */

double stone_x, stone_u, stone_force, stone_force_far;
double removed_water = 0., added_water = 0.;   // by remove_blobs (below)
double brake_speed = 0.;
bool stone_resting = false;
double contact_time = -1.;   // when its lowest point reached the still surface
scalar stone[];
face vector stone_face[];

/** Sky outflow (x = 3.2 m for the reference). */
u.n[right] = neumann(0.);
p[right] = dirichlet(0.);
pf[right] = dirichlet(0.);

/** ## Mesh levels by region */

double min_cell () { return DOMAIN/(1 << max_level); }

int max_level_at (double x, double y)
{
  int splash = t > late_after ? min(max_level, 11) : t > fine_until ? min(max_level, 12) : max_level;
  if (y < 0.3*SCALE && x < 1.2*SCALE)
    return splash;
  if (y < 0.6*SCALE && x < 1.2*SCALE)
    return min(max_level, 13);
  if (y < 1.2*SCALE && x < 1.2*SCALE)
    return min(max_level, 12);
  if (y < 2.4*SCALE)
    return min(max_level, 11);
  return min(max_level, 10);
}

int min_level_at (double x, double y)
{
  // The band follows the rings out (a little faster than the shallow-water speed sqrt(g·depth)).
  if (rings && fabs(x) < 0.025*SCALE && y < 0.2*SCALE + 3.*sqrt(DEPTH/0.8)*t) {
    if (y < 1.6*SCALE) return min(max_level, 11);
    if (y < 2.4*SCALE) return min(max_level, 10);
  }
  return 6;
}

/**
adapt_wavelet() from grid/tree-common.h, with the maximum and minimum levels
given per place by max_level_at() and min_level_at(). */

astats adapt_regions (scalar * slist, double * max)
{
  scalar * list = list_copy ({cm, fm});
  for (scalar s in all)
    list = list_add (list, s);
  boundary (list);
  scalar * listr = list_concat (slist, {cm});
  restriction (listr);
  free (listr);

  astats st = {0, 0};
  scalar * listc = NULL;
  for (scalar s in list)
    listc = list_add_depend (listc, s);

  tree->refined.n = 0;
  static const int refined = 1 << user, too_fine = 1 << (user + 1);
  foreach_cell() {
    if (is_active(cell)) {
      static const int too_coarse = 1 << (user + 2);
      if (is_leaf (cell)) {
	if (cell.flags & too_coarse) {
	  cell.flags &= ~too_coarse;
	  refine_cell (point, listc, refined, &tree->refined);
	  st.nf++;
	}
	continue;
      }
      else {
	if (cell.flags & refined) {
	  cell.flags &= ~too_coarse;
	  continue;
	}
	bool local = is_local(cell);
	if (!local)
	  foreach_child()
	    if (is_local(cell)) {
	      local = true; break;
	    }
	if (local) {
	  int i = 0;
	  static const int just_fine = 1 << (user + 3);
	  for (scalar s in slist) {
	    double emax = max[i++], sc[(1 << dimension)*s.block];
	    double * b = sc;
	    foreach_child()
	      foreach_blockf(s)
	        *b++ = s[];
	    s.prolongation (point, s);
	    b = sc;
	    foreach_child()
	      foreach_blockf(s) {
	        double e = fabs(*b - s[]);
		int lmax = max_level_at (x, y), lmin = min_level_at (x, y);
		if (e > emax && level < lmax) {
		  cell.flags &= ~too_fine;
		  cell.flags |= too_coarse;
		}
		else if ((e <= emax/1.5 || level > lmax) &&
			 !(cell.flags & (too_coarse|just_fine))) {
		  if (level > lmin)
		    cell.flags |= too_fine;
		}
		else if (!(cell.flags & too_coarse)) {
		  cell.flags &= ~too_fine;
		  cell.flags |= just_fine;
		}
		s[] = *b++;
	      }
	  }
	  foreach_child() {
	    cell.flags &= ~just_fine;
	    if (!is_leaf(cell)) {
	      cell.flags &= ~too_coarse;
	      if (level >= max_level_at (x, y))
		cell.flags |= too_fine;
	    }
	    else if (!is_active(cell))
	      cell.flags &= ~too_coarse;
	    else if (level < min_level_at (x, y)) {
	      cell.flags &= ~too_fine;
	      cell.flags |= too_coarse;
	    }
	  }
	}
      }
    }
    else
      continue;
  }
  mpi_boundary_refine (listc);

  for (int l = depth(); l >= 0; l--) {
    foreach_cell()
      if (!is_boundary(cell)) {
	if (level == l) {
	  if (!is_leaf(cell)) {
	    if (cell.flags & refined)
	      cell.flags &= ~(refined|too_fine);
	    else if (cell.flags & too_fine) {
	      if (is_local(cell) && coarsen_cell (point, listc))
		st.nc++;
	      cell.flags &= ~too_fine;
	    }
	  }
	  if (cell.flags & too_fine)
	    cell.flags &= ~too_fine;
	  else if (level > 0 && (aparent(0).flags & too_fine))
	    aparent(0).flags &= ~too_fine;
	  continue;
	}
	else if (is_leaf(cell))
	  continue;
      }
    mpi_boundary_coarsen (l, too_fine);
  }
  free (listc);

  mpi_all_reduce (st.nf, MPI_INT, MPI_SUM);
  mpi_all_reduce (st.nc, MPI_INT, MPI_SUM);
  if (st.nc || st.nf)
    mpi_boundary_update (list);
  free (list);
  return st;
}

/** ## The stone */

void stone_mask ()
{
  vertex scalar phi[];
  foreach_vertex() {
    double sphere = RADIUS - sqrt (sq(x - stone_x) + sq(y));
    phi[] = front_only ? min (sphere, stone_x - x) : sphere;
  }
  fractions (phi, stone, stone_face);
}

/** The app's stone under water (src/rock.js): quadratic drag with Cd = 0.5 and
buoyancy-reduced gravity, from first contact. */
double app_acceleration (double u, bool wet)
{
  if (!wet)
    return -GRAVITY;
  double drag = 3./8.*RHO_WATER/RHO_STONE*0.5/RADIUS;
  return - drag*u*fabs(u) - GRAVITY*(1. - RHO_WATER/RHO_STONE);
}

void advance_stone (double dt)
{
  double u0 = stone_u;
  bool wet = stone_x - RADIUS <= 0.;
  if (stone_resting)
    stone_u = 0.;
  else if (mode == 0)
    stone_u = -ENTRY_SPEED;
  else if (mode == 1) {
    // RK4 on the app's ODE (the stone moves downward, u < 0: drag is +k u²)
    double k1 = app_acceleration (stone_u, wet);
    double k2 = app_acceleration (stone_u + dt/2.*k1, wet);
    double k3 = app_acceleration (stone_u + dt/2.*k2, wet);
    double k4 = app_acceleration (stone_u + dt*k3, wet);
    stone_u += dt/6.*(k1 + 2.*k2 + 2.*k3 + k4);
  }
  else
    stone_u += dt*(stone_force/STONE_MASS - GRAVITY);

  // The floor (sand) brakes it over its last BRAKE metres.
  double stop = X0 + RADIUS + FLOOR_GAP, distance = stone_x - stop;
  if (!stone_resting && distance < BRAKE) {
    if (!brake_speed)
      brake_speed = max(fabs(stone_u), 0.05);
    double cap = brake_speed*sqrt(max(distance, 0.)/BRAKE);
    if (stone_u < -cap)
      stone_u = -cap;
    if (distance < 1e-5) {
      stone_u = 0.;
      stone_resting = true;
    }
  }
  stone_x += dt*(u0 + stone_u)/2.;
  if (contact_time < 0. && stone_x - RADIUS <= 0.)
    contact_time = t + dt;
}

/** The pressure force on the stone (upward positive), from the pressure on a
sphere `radius` around its centre. reduced.h's p is p' = p + ρ g x, so the
true pressure is p' - ρ g x. */
double pressure_force (double radius)
{
  double force = 0.;
  for (int k = 0; k < FORCE_SAMPLES; k++) {
    double theta = (k + 0.5)*M_PI/FORCE_SAMPLES;
    double xp = stone_x + radius*cos(theta), yp = radius*sin(theta);
    double pv = interpolate (p, xp, yp), fv = interpolate (f, xp, yp);
    if (pv == nodata || fv == nodata)
      continue;
#if BODY_GRAVITY
    double ptrue = pv;
#else
    double ptrue = pv - rho(fv)*GRAVITY*xp;
#endif
    force -= ptrue*cos(theta)*2.*M_PI*yp*radius*(M_PI/FORCE_SAMPLES);
  }
  return force;
}

/** ## Setup */

int main (int argc, char * argv[])
{
  for (int argument = 1; argument < argc; argument++) {
    char * value = strchr (argv[argument], '=');
    if (!value) {
      fprintf (stderr, "arguments are name=value, not '%s'\n", argv[argument]);
      return 1;
    }
    *value++ = '\0';
    char * name = argv[argument];
    if (!strcmp (name, "level")) max_level = atoi (value);
    else if (!strcmp (name, "path"))
      mode = !strcmp (value, "constant") ? 0 : !strcmp (value, "free") ? 2 : 1;
    else if (!strcmp (name, "end")) end_time = atof (value);
    else if (!strcmp (name, "fine")) fine_until = atof (value);
    else if (!strcmp (name, "late")) late_after = atof (value);
    else if (!strcmp (name, "air")) RHO_AIR = atof (value);
    else if (!strcmp (name, "airmu")) MU_AIR = atof (value);
    else if (!strcmp (name, "shape")) front_only = !strcmp (value, "front");
    else if (!strcmp (name, "airadapt")) air_adapt = atoi (value);
    else if (!strcmp (name, "radius")) RADIUS = atof (value);
    else if (!strcmp (name, "density")) RHO_STONE = atof (value);
    else if (!strcmp (name, "speed")) ENTRY_SPEED = atof (value);
    else if (!strcmp (name, "depth")) DEPTH = atof (value);
    else if (!strcmp (name, "rings")) rings = atoi (value);
    else {
      fprintf (stderr, "unknown argument '%s'\n", name);
      return 1;
    }
  }

  size (DOMAIN);
  origin (-DEPTH, 0.);
  init_grid (64);
  rho1 = RHO_WATER, rho2 = RHO_AIR;
  mu1 = MU_WATER, mu2 = MU_AIR;
  f.sigma = SIGMA;
#if !BODY_GRAVITY
  G.x = -GRAVITY;
#endif
  stone.refine = stone.prolongation = fraction_refine;
  run();
}

event init (t = 0)
{
  if (restore (file = "restart")) {
    FILE * fp = fopen ("restart.stone", "r");
    int resting;
    if (!fp || fscanf (fp, "%lf %lf %lf %lf %lf %d", &stone_x, &stone_u, &stone_force,
		       &contact_time, &brake_speed, &resting) != 6) {
      fprintf (stderr, "cannot read restart.stone\n");
      exit (1);
    }
    if (fscanf (fp, "%lf %lf", &removed_water, &added_water) != 2)
      removed_water = added_water = 0.;
    stone_resting = resting;
    fclose (fp);
    stone_mask ();
  }
  else {
    double gap = max(2.*min_cell(), 5e-4*SCALE);
    stone_x = RADIUS + gap;
    stone_u = -ENTRY_SPEED;
    stone_force = 0.;
    // Refine the splash zone's start and the surface band before setting the fields.
    for (int l = 7; l <= max_level; l++)
      refine (level < l && level < max_level_at (x, y) &&
	      ((sq(x - stone_x) + sq(y) < sq(RADIUS + 8.*L0/(1 << l))) ||
	       (fabs(x) < 4.*L0/(1 << l) && y < 2.*RADIUS + 0.05*SCALE) ||
	       level < min_level_at (x, y)));
    fraction (f, -x);
    stone_mask ();
    foreach() {
      u.x[] = stone[]*stone_u;
      u.y[] = 0.;
    }
  }
  if (pid() > 0)
    return 0;
  if (DOMAIN - DEPTH < 40.*RADIUS)
    fprintf (stderr, "warning: the sky is only %g radii above the water\n", (DOMAIN - DEPTH)/RADIUS);
  fprintf (stderr, "%g cells per stone radius (%g mm cells), domain %g m, %d ranks\n",
	   RADIUS/min_cell(), min_cell()*1000., DOMAIN, npe());
  FILE * fp = fopen ("parameters.txt", "w");
  fprintf (fp, "max_level %d\nmin_cell %g\nmode %d\nend_time %g\nfine_until %g\nlate_after %g\n"
	   "radius %g\nrho_stone %g\nentry_speed %g\nstone_start %g\nrho_air %g\nmu_air %g\nfront_only %d\nair_adapt %d\n"
	   "depth %g\ndomain %g\nrings %d\ncells_per_radius %g\nfloor_stop %g\nranks %d\n",
	   max_level, min_cell(), mode, end_time, fine_until, late_after,
	   RADIUS, RHO_STONE, ENTRY_SPEED, stone_x, RHO_AIR, MU_AIR, front_only, air_adapt,
	   DEPTH, DOMAIN, rings, RADIUS/min_cell(), X0 + RADIUS + FLOOR_GAP, npe());
  fclose (fp);
}

/** ## Every step */

/** Before the volume fraction is advected (and after dt is known), the stone
moves to the end of the step and its mask is rebuilt there. */
event vof (i++)
{
  advance_stone (dt);
  stone_mask ();
}

/** After the two-phase properties: the stone's own density inside its mask. */
event advection_term (i++)
{
  foreach_face()
    if (stone_face.x[] > 0. && fm.x[] > 1e-12) {
      double density = fm.x[]/alphav.x[];
      density = (1. - stone_face.x[])*density + stone_face.x[]*RHO_STONE;
      alphav.x[] = fm.x[]/density;
    }
  foreach()
    if (stone[] > 0.)
      rhov[] = (1. - stone[])*rhov[] + stone[]*cm[]*RHO_STONE;
}

/** The sponge beyond SPONGE from the axis. */
event acceleration (i++)
{
  face vector av = a;
#if BODY_GRAVITY
  foreach_face(x)
    av.x[] -= GRAVITY;
#endif
  foreach_face()
    if (y > SPONGE) {
      double s = SPONGE_RATE*sq((y - SPONGE)/(DOMAIN - SPONGE));
      av.x[] -= s*face_value (u.x, 0);
    }
}

/** After every acceleration term, before the projection: the faces inside the
stone take its velocity. */
event projection (i++)
{
  coord target = {stone_u, 0.};
  face vector av = a;
  foreach_face()
    if (stone_face.x[] > 0. && fm.x[] > 1e-12) {
      double forced = (1. - stone_face.x[])*uf.x[] + stone_face.x[]*fm.x[]*target.x;
      av.x[] += (forced - uf.x[])/(fm.x[]*dt);
      uf.x[] = forced;
    }
}

/** The forces are computed here, after the projection: the log (below) only
prints them, since on the first step after a restart it can come before the
solver has set the densities the pressure's boundary conditions divide by. */
event end_timestep (i++)
{
  stone_force = pressure_force (RADIUS + 3.*min_cell());
  if (i % 4 == 3)
    stone_force_far = pressure_force (RADIUS + 6.*min_cell());
}

/** A neck of air narrower than a cell is closed. When the cavity pinches
off, the water closes on the axis but leaves a thread of air a cell or two
wide along it: the bubble below is then a closed volume of incompressible
air, whose volume the stone, still moving away, keeps changing, so air must go
on flowing through the thread, at 1000 m/s and more, with a time step of a
fraction of a microsecond and a suction of 100 kPa on the bubble (real air
would choke at the speed of sound; at 1 atm it holds the bubble's volume to
within a few percent anyway). So every step, looking out from the axis: if
water (f > 0.95) comes within the first two cells and the air before it adds
up to less than one cell's worth, those cells hold a thread thinner than the
grid, and they are filled with water at the velocity of the water outside
them. Each cell decides from what it reads before any is filled. The water
added (a fraction of a millilitre at a pinch-off) is logged with the filled
bubbles. */
event close_necks (i++)
{
  scalar thread[];
  foreach() {
    thread[] = 0.;
    int column = y/Delta;         // cells from the axis
    if (column <= 1 && f[] < 0.99 && stone[] < 1e-6) {
      double air = 0.;
      int water = -1;
      for (int k = 0; k <= 2; k++) {
        double fk = f[0,k - column];
        if (fk > 0.95 && k > column) { water = k; break; }
        if (stone[0,k - column] > 1e-6) break;
        air += 1. - fk;
      }
      if (water > column && air < 1.)
        thread[] = water - column;  // how far out the water is
    }
  }
  double filled = 0.;
  foreach (reduction(+:filled))
    if (thread[] > 0.) {
      int out = thread[];
      filled += 2.*M_PI*(1. - f[])*dv();
      f[] = 1.;
      u.x[] = u.x[0,out];
      u.y[] = 0.;
    }
  added_water += filled;
}

/** Drops and bubbles narrower than MIN_BLOB cells are below the resolution:
they carry parasitic capillary currents (σ/μ_air is 4000 m/s) and set the time
step. They are removed every 5 steps, and the water removed or added is
logged (removed_water, added_water in stone.csv). */
event remove_blobs (i += 5)
{
  if (MIN_BLOB <= 0)
    return 0;
  double before = 0., after = 0.;
  foreach (reduction(+:before))
    before += 2.*M_PI*f[]*dv();
  remove_droplets (f, MIN_BLOB);
  foreach (reduction(+:after))
    after += 2.*M_PI*f[]*dv();
  removed_water += before - after;
  remove_droplets (f, MIN_BLOB, bubbles = true);
  double filled = 0.;
  foreach (reduction(+:filled))
    filled += 2.*M_PI*f[]*dv();
  added_water += filled - after;
  /* The first, needle-thin jet after the pinch-off throws drops up at 25 m/s
  and more, which would fly for seconds and set the time step all along;
  above SINK (four times the app's jet) they are removed, and the air
  they leave is stopped. */
  double sunk = 0.;
  foreach (reduction(+:sunk))
    if (x > SINK && f[] > 0.) {
      sunk += 2.*M_PI*f[]*dv();
      f[] = 0.;
      foreach_dimension()
        u.x[] = 0.;
    }
  removed_water += sunk;
}

/** The mesh follows the interface, the stone and the velocity. The
velocity counts only in the water and the stone and within two cells of
them (unless
`airadapt=1`): the air rushing into the cavity is a jet of 30 m/s with
vortices, which at the finest level would fill the whole hole with fine
cells and set a time step of a few microseconds, for a flow whose only
effect on the water (its suction on the crown, see "The air" in the
README) the light air of the reference makes small anyway. */
event adapt (i++)
{
  vector velocity[];
  foreach() {
    double wet = air_adapt;
    if (!wet)
      foreach_neighbor (2)
        if (f[] > 1e-3 || stone[] > 0.)
          wet = 1.;
    foreach_dimension()
      velocity.x[] = wet*u.x[];
  }
  adapt_regions ({f, velocity.x, velocity.y, stone}, (double[]){F_TOL, U_TOL, U_TOL, S_TOL});
}

/** ## Outputs */

event stone_log (i += 4)
{
  double water = 0., inside = 0.;
  foreach (reduction(+:water) reduction(+:inside)) {
    water += 2.*M_PI*f[]*dv();
    inside += 2.*M_PI*f[]*stone[]*dv();
  }
  if (pid() > 0)
    return 0;
  static FILE * fp = NULL;
  if (!fp) {
    fp = fopen ("stone.csv", i == 0 ? "w" : "a");
    if (i == 0)
      fprintf (fp, "t,step,dt,stone_x,stone_u,force,force_far,cells,mgp,mgpf,mgu,water_volume,water_in_stone,removed_water,added_water,cpu\n");
  }
  fprintf (fp, "%.7f,%d,%.4e,%.7f,%.6f,%.5f,%.5f,%ld,%d,%d,%d,%.12e,%.6e,%.6e,%.6e,%.1f\n",
	   t, i, dt, stone_x, stone_u, stone_force, stone_force_far, grid->tn,
	   mgp.i, mgpf.i, mgu.i, water, inside, removed_water, added_water, perf.t);
  fflush (fp);
}

void write_gauges ()
{
  double column[NGAUGES] = {0};
  foreach (serial)
    if (x - Delta/2. >= GAUGE_LOW - 1e-9 && x + Delta/2. <= GAUGE_HIGH + 1e-9)
      for (int g = 0; g < NGAUGES; g++)
	if (y - Delta/2. <= GAUGES[g]*SCALE && GAUGES[g]*SCALE < y + Delta/2.)
	  column[g] += f[]*Delta;
  mpi_all_reduce_array (column, MPI_DOUBLE, MPI_SUM, NGAUGES);
  if (pid() > 0)
    return;
  static FILE * fp = NULL;
  if (!fp) {
    fp = fopen ("gauges.csv", t == 0 ? "w" : "a");
    if (t == 0) {
      fprintf (fp, "t");
      for (int g = 0; g < NGAUGES; g++)
	fprintf (fp, ",r%g", GAUGES[g]*SCALE);
      fprintf (fp, "\n");
    }
  }
  fprintf (fp, "%.4f", t);
  for (int g = 0; g < NGAUGES; g++)
    fprintf (fp, ",%.7e", GAUGE_LOW + column[g]);
  fprintf (fp, "\n");
  fflush (fp);
}

/** The surface along a radius: the elevation every PROFILE_STEP out to
2.4 m, by the same column integral as the gauges, in `profiles.txt` (time,
then the elevations). From these the rings can be followed on by linear
theory, and their linearity checked. */
#define PROFILE_STEP (0.005*SCALE)
#define NPROFILE 480
void write_profile ()
{
  double column[NPROFILE] = {0};
  foreach (serial)
    if (x - Delta/2. >= GAUGE_LOW - 1e-9 && x + Delta/2. <= GAUGE_HIGH + 1e-9) {
      int lo = max (0, (int) ceil ((y - Delta/2.)/PROFILE_STEP - 1e-9));
      int hi = min (NPROFILE - 1, (int) ceil ((y + Delta/2.)/PROFILE_STEP - 1e-9) - 1);
      for (int k = lo; k <= hi; k++)
        column[k] += f[]*Delta;
    }
  mpi_all_reduce_array (column, MPI_DOUBLE, MPI_SUM, NPROFILE);
  if (pid() > 0)
    return;
  static FILE * fp = NULL;
  if (!fp)
    fp = fopen ("profiles.txt", "a");
  fprintf (fp, "%.4f", t);
  for (int k = 0; k < NPROFILE; k++)
    fprintf (fp, " %.5e", GAUGE_LOW + column[k]);
  fprintf (fp, "\n");
  fflush (fp);
}

/** The runs of water along the axis: a list of [bottom, top] intervals. */
typedef struct { double x, d, f; } AxisCell;
static int compare_axis (const void * a, const void * b)
{
  const AxisCell * p = a, * q = b;
  return p->x < q->x ? -1 : p->x > q->x;
}

void write_axis_runs ()
{
  int n = 0, size = 1024;
  AxisCell * cells = malloc (size*sizeof(AxisCell));
  foreach (serial)
    if (y < Delta && x < 1.5*SCALE) {
      if (n == size)
	cells = realloc (cells, (size *= 2)*sizeof(AxisCell));
      cells[n++] = (AxisCell){x, Delta, f[]};
    }
#if _MPI
  // The first rank gathers every rank's cells on the axis.
  int counts[npe()], offsets[npe()];
  int values = 3*n;
  MPI_Gather (&values, 1, MPI_INT, counts, 1, MPI_INT, 0, MPI_COMM_WORLD);
  AxisCell * all = NULL;
  if (pid() == 0) {
    int total = 0;
    for (int rank = 0; rank < npe(); rank++)
      offsets[rank] = total, total += counts[rank];
    all = malloc (max(total, 3)*sizeof(double));
    n = total/3;
  }
  MPI_Gatherv (cells, values, MPI_DOUBLE, all, counts, offsets, MPI_DOUBLE, 0, MPI_COMM_WORLD);
  free (cells);
  if (pid() > 0)
    return;
  cells = all;
#endif
  static FILE * fp = NULL;
  if (!fp)
    fp = fopen ("axis.txt", t == 0 ? "w" : "a");
  qsort (cells, n, sizeof(AxisCell), compare_axis);
  // Each cell's water sits against the wetter of its two neighbours.
  fprintf (fp, "%.5f %.6f %.6f", t, stone_x, stone_u);
  double start = nodata, end = nodata;
  for (int k = 0; k < n; k++) {
    double fk = clamp (cells[k].f, 0., 1.);
    if (fk < 1e-3) continue;
    double below = k > 0 ? cells[k - 1].f : 1., above = k < n - 1 ? cells[k + 1].f : 0.;
    double lo, hi, bottom = cells[k].x - cells[k].d/2., top = cells[k].x + cells[k].d/2.;
    if (fk > 1. - 1e-3)
      lo = bottom, hi = top;
    else if (below >= above)
      lo = bottom, hi = bottom + fk*cells[k].d;
    else
      lo = top - fk*cells[k].d, hi = top;
    if (start != nodata && lo <= end + 1e-9)
      end = hi;
    else {
      if (start != nodata)
	fprintf (fp, " %.6f %.6f", start, end);
      start = lo, end = hi;
    }
  }
  if (start != nodata)
    fprintf (fp, " %.6f %.6f", start, end);
  fprintf (fp, "\n");
  fflush (fp);
  free (cells);
}

/** The cavity, the crown's rim and the jet from the connected regions of
water and of air. */
void write_regions (bool drops_now)
{
  // Air: everything that is not water and not the stone.
  scalar air[];
  foreach()
    air[] = (f[] < 0.5 && stone[] < 0.5);
  int nair = tag (air);
  int sky = interpolate (air, X0 + 0.825*L0, 0.5*L0, linear = false);
  int above_stone = interpolate (air, stone_x + RADIUS + 3.*min_cell(), min_cell()/2., linear = false);
  double cavity_bottom = HUGE, mouth = 0., bubble_bottom = HUGE, bubble_volume = 0.;
  foreach (serial) {
    if (air[] == sky && sky && y < 0.3*SCALE && x < 0.) {
      if (x - Delta/2. < cavity_bottom)
	cavity_bottom = x - Delta/2.;
    }
    if (air[] == sky && sky && y < 0.3*SCALE && x - Delta/2. <= 0. && 0. < x + Delta/2.)
      if (y + Delta/2. > mouth)
	mouth = y + Delta/2.;
    if (above_stone && air[] == above_stone && above_stone != sky) {
      bubble_volume += 2.*M_PI*(1. - f[])*dv();
      if (x - Delta/2. < bubble_bottom)
	bubble_bottom = x - Delta/2.;
    }
  }
  mpi_all_reduce (cavity_bottom, MPI_DOUBLE, MPI_MIN);
  mpi_all_reduce (mouth, MPI_DOUBLE, MPI_MAX);
  mpi_all_reduce (bubble_bottom, MPI_DOUBLE, MPI_MIN);
  mpi_all_reduce (bubble_volume, MPI_DOUBLE, MPI_SUM);
  bool pinched = above_stone && sky && above_stone != sky;

  // Water: the pond is the region holding the deep water.
  scalar water[];
  foreach()
    water[] = f[] > 0.01;
  int nwater = tag (water);
  int pond = interpolate (water, -0.625*DEPTH, 1.0*SCALE, linear = false);
  double rim_x = -HUGE, rim_y = 0., outer = 0., tip = -HUGE;
  double vol[nwater], cx[nwater], cy[nwater], cu[nwater], cv[nwater], ymin[nwater], xmin[nwater], xmax[nwater];
  for (int j = 0; j < nwater; j++)
    vol[j] = cx[j] = cy[j] = cu[j] = cv[j] = 0., ymin[j] = xmin[j] = HUGE, xmax[j] = -HUGE;
  foreach (serial)
    if (water[] > 0) {
      int j = water[] - 1;
      if (water[] == pond) {
	if (y > RADIUS/2. && y < 0.4*SCALE && x > 0. && x + Delta/2. > rim_x)
	  rim_x = x + Delta/2., rim_y = y;
	if (y < 0.4*SCALE && x > 0.005*SCALE && y + Delta/2. > outer)
	  outer = y + Delta/2.;
	if (y < Delta && x + Delta/2. > tip)
	  tip = x + Delta/2.;
      }
      else if (drops_now) {
	double w = 2.*M_PI*f[]*dv();
	vol[j] += w, cx[j] += w*x, cy[j] += w*y, cu[j] += w*u.x[], cv[j] += w*u.y[];
	ymin[j] = min(ymin[j], y - Delta/2.);
	xmin[j] = min(xmin[j], x - Delta/2.);
	xmax[j] = max(xmax[j], x + Delta/2.);
      }
    }
#if _MPI
  // The rim is the highest point over every rank (with its distance out).
  struct { double x; int rank; } rim = {rim_x, pid()}, highest;
  MPI_Allreduce (&rim, &highest, 1, MPI_DOUBLE_INT, MPI_MAXLOC, MPI_COMM_WORLD);
  rim_x = highest.x;
  MPI_Bcast (&rim_y, 1, MPI_DOUBLE, highest.rank, MPI_COMM_WORLD);
  mpi_all_reduce (outer, MPI_DOUBLE, MPI_MAX);
  mpi_all_reduce (tip, MPI_DOUBLE, MPI_MAX);
  if (drops_now) {
    mpi_all_reduce_array (vol, MPI_DOUBLE, MPI_SUM, nwater);
    mpi_all_reduce_array (cx, MPI_DOUBLE, MPI_SUM, nwater);
    mpi_all_reduce_array (cy, MPI_DOUBLE, MPI_SUM, nwater);
    mpi_all_reduce_array (cu, MPI_DOUBLE, MPI_SUM, nwater);
    mpi_all_reduce_array (cv, MPI_DOUBLE, MPI_SUM, nwater);
    mpi_all_reduce_array (ymin, MPI_DOUBLE, MPI_MIN, nwater);
    mpi_all_reduce_array (xmin, MPI_DOUBLE, MPI_MIN, nwater);
    mpi_all_reduce_array (xmax, MPI_DOUBLE, MPI_MAX, nwater);
  }
#endif
  if (pid() > 0)
    return;
  static FILE * fp = NULL, * fd = NULL;
  if (!fp) {
    fp = fopen ("regions.csv", t == 0 ? "w" : "a");
    if (t == 0)
      fprintf (fp, "t,stone_x,cavity_bottom,mouth_radius,pinched,bubble_bottom,bubble_volume,"
	       "rim_x,rim_y,crown_outer,jet_tip,water_bodies,air_bodies\n");
  }
  if (drops_now && !fd) {
    fd = fopen ("drops.csv", t == 0 ? "w" : "a");
    if (t == 0)
      fprintf (fd, "t,volume,radius,x,y,u,v,y_min,x_min,x_max\n");
  }
  fprintf (fp, "%.5f,%.6f,%.6f,%.6f,%d,%.6f,%.6e,%.6f,%.6f,%.6f,%.6f,%d,%d\n",
	   t, stone_x, cavity_bottom == HUGE ? nodata : cavity_bottom, mouth, pinched,
	   bubble_bottom == HUGE ? nodata : bubble_bottom, bubble_volume,
	   rim_x, rim_y, outer, tip, nwater, nair);
  fflush (fp);
  if (drops_now) {
    for (int j = 0; j < nwater; j++)
      if (j + 1 != pond && vol[j] > 0.)
	fprintf (fd, "%.4f,%.6e,%.6e,%.6f,%.6f,%.4f,%.4f,%.6f,%.6f,%.6f\n", t, vol[j],
		 cbrt (3.*vol[j]/(4.*M_PI)), cx[j]/vol[j], cy[j]/vol[j], cu[j]/vol[j], cv[j]/vol[j],
		 ymin[j], xmin[j], xmax[j]);
    fflush (fd);
  }
}

void write_facets ()
{
  // Every rank writes its facets into memory; the first gathers them into the file.
  char * text = NULL;
  size_t length = 0;
  FILE * fp = open_memstream (&text, &length);
  foreach (serial)
    if (f[] > 1e-6 && f[] < 1. - 1e-6 && y < 0.6*SCALE && x < 1.5*SCALE) {
      coord n = interface_normal (point, f);
      double alpha = plane_alpha (f[], n);
      coord segment[2];
      if (facets (n, alpha, segment) == 2)
	fprintf (fp, "%.6f %.6f %.6f %.6f\n",
		 x + segment[0].x*Delta, y + segment[0].y*Delta,
		 x + segment[1].x*Delta, y + segment[1].y*Delta);
    }
  fclose (fp);
#if _MPI
  int own = length, sizes[npe()], offsets[npe()], total = 0;
  MPI_Gather (&own, 1, MPI_INT, sizes, 1, MPI_INT, 0, MPI_COMM_WORLD);
  char * all = NULL;
  if (pid() == 0) {
    for (int rank = 0; rank < npe(); rank++)
      offsets[rank] = total, total += sizes[rank];
    all = malloc (total + 1);
  }
  MPI_Gatherv (text, own, MPI_CHAR, all, sizes, offsets, MPI_CHAR, 0, MPI_COMM_WORLD);
  free (text);
  if (pid() > 0)
    return;
  text = all, length = total;
#endif
  char name[80];
  sprintf (name, "facets/t%07.4f.txt", t);
  FILE * out = fopen (name, "w");
  if (!out) {
    system ("mkdir -p facets");
    out = fopen (name, "w");
  }
  fwrite (text, 1, length, out);
  fclose (out);
  free (text);
}

void write_dump ()
{
  char name[80];
  sprintf (name, "dump-%06.3f", t);
  dump (file = name);
  if (pid() > 0)
    return;
  sprintf (name, "dump-%06.3f.stone", t);
  FILE * fp = fopen (name, "w");
  fprintf (fp, "%.12g %.12g %.12g %.12g %.12g %d %.12g %.12g\n", stone_x, stone_u, stone_force,
	   contact_time, brake_speed, stone_resting, removed_water, added_water);
  fclose (fp);
}

/** Output times: fine through the splash, coarse for the rings (output
events also cap the time step, so the late ones are sparse). */
#define UNTIL(limit) min(limit, end_time*(1. + 1e-9)) // the last output at end= is kept
event gauges_early (t = 0; t <= UNTIL(1.); t += 1e-3) write_gauges();
event gauges_late (t = 1.002; t <= end_time; t += 2e-3) write_gauges();
event axis_early (t = 0; t <= UNTIL(0.25*TIME_SCALE); t += 1e-4*TIME_SCALE) write_axis_runs();
event axis_middle (t = 0.2505*TIME_SCALE; t <= UNTIL(1.*TIME_SCALE); t += 5e-4*TIME_SCALE)
  write_axis_runs();
event axis_late (t = 1.002*TIME_SCALE; t <= end_time; t += 2e-3*TIME_SCALE) write_axis_runs();
event regions_early (t = 0; t <= UNTIL(1.*TIME_SCALE); t += 5e-4*TIME_SCALE)
  write_regions (fmod (t + 1e-9*TIME_SCALE, 1e-3*TIME_SCALE) < 2e-4*TIME_SCALE);
event regions_late (t = 1.005*TIME_SCALE; t <= end_time; t += 5e-3*TIME_SCALE) write_regions (true);
event profiles (t = 0.1; t <= end_time; t += 5e-3) write_profile();
event facets_early (t = 0; t <= UNTIL(0.3*TIME_SCALE); t += 1e-3*TIME_SCALE) write_facets();
event facets_middle (t = 0.302*TIME_SCALE; t <= UNTIL(0.7*TIME_SCALE); t += 2e-3*TIME_SCALE)
  write_facets();
event facets_late (t = 0.71*TIME_SCALE; t <= end_time; t += 1e-2*TIME_SCALE) write_facets();
event dumps_early (t = 0; t <= UNTIL(1.*TIME_SCALE); t += 0.025*TIME_SCALE) write_dump();
event dumps_late (t = 1.25*TIME_SCALE; t <= end_time; t += 0.25*TIME_SCALE) write_dump();

#if SNAPSHOTS
event snapshots (t = 0.005; t <= 0.2; t += 0.005)
{
  char name[80];
  sprintf (name, "snapshot-%.3f.txt", t);
  FILE * fp = fopen (name, "w");
  output_field ({f, u.x, u.y, p, stone}, fp, n = 600, linear = true,
		box = {{-0.20, 0.}, {0.12, 0.16}});
  fclose (fp);
}
#endif

event progress (i += 50)
{
  double fastest = 0., fastest_x = 0., fastest_y = 0., fastest_f = 0., fastest_stone = 0.;
  foreach (serial) {
    double speed = sqrt (sq(u.x[]) + sq(u.y[]));
    if (speed > fastest)
      fastest = speed, fastest_x = x, fastest_y = y, fastest_f = f[], fastest_stone = stone[];
  }
#if _MPI
  struct { double speed; int rank; } mine = {fastest, pid()}, best;
  MPI_Allreduce (&mine, &best, 1, MPI_DOUBLE_INT, MPI_MAXLOC, MPI_COMM_WORLD);
  double where[5] = {fastest, fastest_x, fastest_y, fastest_f, fastest_stone};
  MPI_Bcast (where, 5, MPI_DOUBLE, best.rank, MPI_COMM_WORLD);
  fastest = where[0], fastest_x = where[1], fastest_y = where[2];
  fastest_f = where[3], fastest_stone = where[4];
#endif
  if (pid() > 0)
    return 0;
  fprintf (stderr, "i %d t %.5f dt %.3e stone %.4f %.3f F %.2f cells %ld mgp %d mgu %d cpu %.0f"
	   " | fastest %.2f m/s at (%.4f, %.4f) f %.2f stone %.2f\n",
	   i, t, dt, stone_x, stone_u, stone_force, grid->tn, mgp.i, mgu.i, perf.t,
	   fastest, fastest_x, fastest_y, fastest_f, fastest_stone);
}

event finish (t = end_time)
{
  if (pid() == 0)
    fprintf
 (stderr, "finished at t = %g, contact at %g\n", t, contact_time);
}
