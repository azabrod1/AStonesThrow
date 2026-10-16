| | quantity | level 12 | level 11 | level 13 | app | note |
|---|---|---|---|---|---|---|
| cavity | pinch-off, ms after contact | 110 | 109 |  | 112 | PINCH_TIME = 2.1 sqrt(R/g) on the splash clock |
| cavity | pinch-off, sqrt(R/g) after contact | 1.99 | 1.97 |  | 2.02 | Duclaux et al. 2007: 2.06 |
| cavity | pinch-off depth, R | 7.53 | 7.52 |  | 8.17 |  |
| cavity | stone's centre depth at the pinch-off, R | 13.3 | 13.2 |  | 13 |  |
| cavity | pinch depth / stone depth | 0.567 | 0.57 |  | 0.628 | Duclaux et al.: about 1/2 |
| cavity | surface closed, ms after contact |  |  |  | 134 | CLOSE_TIME = 0.4 sqrt(R/g) after the pinch |
| cavity | widest mouth (wall at the still surface), R | 3.77 | 3.31 | 2.09 | 1.45 | WIDEN = 0.45 |
| cavity | widest mouth, ms after contact | 200 | 151 | 55.8 | 59.3 |  |
| jet | above the still surface, ms after contact | 118 | 126 |  | 134 | the app's jet starts at the surface's closure |
| jet | tip speed as it emerges, m/s | 15.7 | 13 |  | 3.35 |  |
| jet | fastest tip above the surface, m/s | 24.4 | 13.1 |  | 3.35 |  |
| jet | highest tip, mm | 813 | 274 |  | 506 |  |
| jet | highest tip, ms after contact | 330 | 151 |  | 450 |  |
| jet | first tip drop, ms after contact | 120 | 136 | 43.8 | 375 |  |
| jet | first tip drop, radius mm | 2.38 | 7.8 | 3.6 | 8.64 |  |
| jet | drops of 2 mm radius or more from the jet | 46 | 1 | 3 | 28 | simulation: drops leaving the tip along the axis |
| crown | highest rim, mm above the still surface | 117 | 110 | 87.7 | 67.2 |  |
| crown | highest rim, ms after contact | 106 | 119 | 55.3 | 54.1 |  |
| crown | rim radius at the highest, mm | 76.7 | 98.6 | 17.3 | 152 | app: the sheet's farthest point from the axis |
| crown | tears (first ring over 1 ml shed from the rim), ms after contact | 26.7 | 24.4 |  | 55.8 | axisymmetric: no fingers; the rim breaks off as rings |
| crown | collapsed (rim under a quarter of its peak), ms |  |  |  | 91.8 | app: the sheet's end |
| ring | trough to crest at 0.25 m, mm | 3.75 |  |  | 4.66 | app: linear response to its splats, mean around the circle |
| ring | highest crest at 0.25 m, s after contact | 0.0857 |  |  | 1.3 |  |
| ring | wavelength at the crest at 0.25 m, cm (deep water) | 17 |  |  | 14.1 |  |
| ring | trough to crest at 0.5 m, mm | 0.48 |  |  | 2.06 | app: linear response to its splats, mean around the circle |
| ring | highest crest at 0.5 m, s after contact | 0.0917 |  |  | 2.44 |  |
| ring | wavelength at the crest at 0.5 m, cm (deep water) | 0.0039 |  |  | 15 |  |
| ring | trough to crest at 1 m, mm | 0.13 |  |  | 0.551 | app: linear response to its splats, mean around the circle |
| ring | highest crest at 1 m, s after contact | 0.177 |  |  | 4.08 |  |
| ring | wavelength at the crest at 1 m, cm (deep water) | 0.191 |  |  | 17 |  |
| ring | trough to crest at 1.5 m, mm | 0.522 |  |  | 0.202 | app: linear response to its splats, mean around the circle |
| ring | highest crest at 1.5 m, s after contact | 0.174 |  |  | 3.82 |  |
| ring | wavelength at the crest at 1.5 m, cm (deep water) | 3.15 |  |  | 45.5 |  |
| ring | trough to crest at 2 m, mm | 0.247 |  |  | 0.122 | app: linear response to its splats, mean around the circle |
| ring | highest crest at 2 m, s after contact | 0.174 |  |  | 4.95 |  |
| ring | wavelength at the crest at 2 m, cm (deep water) | 3.06 |  |  | 47.2 |  |
| stone | drag coefficient (pressure force less the head on the front) | -0.771 | 0.358 | 0.284 | 0.5 | src/rock.js; the simulation's stone follows the app's path |
| stone | open hole: drag coefficient Cd in F = Cd·½ρU²πR² + Ch·ρgh·πR² | 0.459 | 0.546 | 0.374 | 0.5 | app: Cd 0.5 and buoyancy only |
| stone | open hole: head coefficient Ch | 0.595 | 0.857 | 0.544 |  | h: depth of the centre |
