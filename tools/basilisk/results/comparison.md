| | quantity | level 12 | level 11 | level 13 | app | note |
|---|---|---|---|---|---|---|
| cavity | pinch-off, ms after contact | 110 | 109 |  | 110 | PINCH_TIME = 2.06 sqrt(R/g) on the splash clock, which starts a substep (4.2 ms) before contact |
| cavity | pinch-off, sqrt(R/g) after contact | 1.99 | 1.97 |  | 1.98 | Duclaux et al. 2007: 2.06 |
| cavity | pinch-off depth, R | 7.53 | 7.52 |  | 7.5 | SURFACE_HEAD = 5.25 R sets it |
| cavity | stone's centre depth at the pinch-off, R | 13.3 | 13.2 |  | 12.6 | the head on the stone while the hole is open (stone rows) |
| cavity | pinch depth / stone depth | 0.567 | 0.57 |  | 0.596 | Duclaux et al.: about 1/2 |
| cavity | surface closed, ms after contact |  |  |  | 261 | the bowl above the neck has flattened into the surface (closeTime) |
| cavity | widest mouth (wall at the still surface), R | 3.77 | 3.31 | 2.09 | 3.6 | MOUTH_WIDEST = 3.6 R for this Froude number; 3.1 R by the pinch-off (the reference: 3.1) |
| cavity | widest mouth, ms after contact | 200 | 151 | 55.8 | 211 | |
| jet | above the still surface, ms after contact | 118 | 126 |  | 129 | the needle's first material clears the still surface; the jet starts at the pinch-off |
| jet | tip speed as it emerges, m/s | 15.7 | 13 |  | 14 | |
| jet | fastest tip above the surface, m/s | 24.4 | 13.1 |  | 14 | the needle leaves at 3 times the body (0.75 of the entry speed) |
| jet | highest tip, mm | 813 | 274 |  | 695 | the column's top; its tip drops fly higher |
| jet | highest tip, ms after contact | 330 | 151 |  | 488 | |
| jet | first tip drop, ms after contact | 120 | 136 | 43.8 | 129 | |
| jet | first tip drop, radius mm | 2.38 | 7.8 | 3.6 | 3.12 | |
| jet | drops of 2 mm radius or more from the jet | 46 | 1 | 3 | 46 | simulation: drops leaving the tip along the axis |
| crown | highest rim, mm above the still surface | 117 | 110 | 87.7 | 110 | the sheet's drag time 0.085 s (CROWN_DRAG), a little shorter than this light air's fit, for real air |
| crown | highest rim, ms after contact | 106 | 119 | 55.3 | 87.5 | |
| crown | rim radius at the highest, mm | 76.7 | 98.6 | 17.3 | 82.9 | app: the sheet's highest point's distance from the axis |
| crown | tears (first ring over 1 ml shed from the rim), ms after contact | 26.7 | 24.4 |  | 91.2 | app: the sheet tears when its rim stalls; axisymmetric: no fingers, the rim breaks off as rings |
| crown | collapsed (rim under a quarter of its peak), ms |  |  |  | 148 | app: the sheet's end |
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
| stone | drag coefficient (pressure force less the head on the front) | -0.771 | 0.358 | 0.284 | 0.46 | src/rock.js; the simulation's stone follows the app's path |
| stone | open hole: drag coefficient Cd in F = Cd·½ρU²πR² + Ch·ρgh·πR² | 0.459 | 0.546 | 0.374 | 0.46 | app: Cd 0.46 and Ch 0.6 while the hole is open, buoyancy once it has pinched off |
| stone | open hole: head coefficient Ch | 0.595 | 0.857 | 0.544 | 0.6 | h: depth of the centre |
