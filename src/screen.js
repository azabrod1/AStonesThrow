// The screen: the pond out to the phone's edges, and full screen.
//
// To the edges. Elsewhere the canvas is fixed over the whole viewport
// (index.html), and viewport-fit=cover lets it run under a notch in
// landscape. Safari on an iPhone (26 on, in a tab, upright) never draws a
// fixed element behind its status bar: only the page's own scrolled content
// passes under the clock, and where a fixed element meets the top edge the
// bar is painted in one colour sampled from it (theme-color is no longer
// read). The canvas, fixed, left the status bar a dark band. So there the
// canvas is laid in the page instead (position: absolute, html.bleed),
// --bleed taller than the viewport, and the page is scrolled to its foot:
// the canvas's top lies behind the clock and its foot at the viewport's
// foot. Nothing tells a page how tall Safari's status bar is (the safe
// area's top is 0 in a tab), so the bleed is a little over the tallest
// status bar of the phone's kind (BLEED): what it holds beyond the bar is
// above the screen, a few rows drawn for nothing, where one too short would
// leave the page's background showing under the clock. The pond measures
// the canvas where it lies (getBoundingClientRect, clientWidth and
// clientHeight), so its frame takes the whole screen down to the strip, as
// on a taller phone, and a tap still throws at what is under it. The strip
// stays fixed on the viewport's foot, and Safari carries its colour down
// round the address bar. The root keeps overflow: hidden, so no finger
// scrolls the page: only this does, and it scrolls back to the foot
// whatever else moves it (a tap on the status bar scrolls to the top). Only
// upright (a phone on its side shows no status bar), never in full screen
// or opened from the Home Screen (the fixed canvas has the whole screen
// there), and if the page will not scroll to its foot the bleed is given up
// for the visit, the canvas fixed as anywhere else. refresh() moves the page
// a pixel and back: Safari takes the bar's colour afresh when the page
// scrolls, so the loading veil's dark is not kept once it is gone.
// ?bleed=N lays the canvas N CSS pixels under the top in any browser,
// upright or not (0: never), to see it in a desktop browser or to try
// another height on a phone.
//
// Full screen. The Fullscreen API on the page's root, where a page has it
// (Android, an iPad, a desktop browser): the settings' Full screen page and
// the F key. Safari on an iPhone has none for a page; there the whole screen
// is the Home Screen's (Share, then Add to Home Screen: iOS 26 opens it as a
// web app, and manifest.webmanifest asks the same of earlier ones and of
// Android), drawn under a black-translucent status bar (index.html) with the
// safe area keeping the title and the buttons clear of the clock.
const BLEED = { islandOrNotch: 64, homeButton: 24 };   // CSS px: over the tallest status bar of each (an iPhone 15's, in Safari 26: 54)
const TALLEST_HOME_BUTTON_SCREEN = 736;                 // CSS px, an iPhone 8 Plus's height: every iPhone with a notch or an island is 812 or taller
const LARGEST_ASKED_BLEED = 200;                        // CSS px, for ?bleed=

const root = document.documentElement;

function fullScreenElement() { return document.fullscreenElement ?? document.webkitFullscreenElement ?? null; }

/** Opened from the Home Screen or as an installed app: the page has the whole screen already. */
export function openedAsApp() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || (matchMedia('(display-mode: fullscreen)').matches && !fullScreenElement());
}

/** Safari itself, 26 or later, on an iPhone: not another browser on iOS (they draw bars of their own) nor a desktop site asked for. */
function iPhoneSafari() {
  const agent = navigator.userAgent;
  if (!/iPhone|iPod/.test(agent) || !/ Safari\//.test(agent) || /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(agent)) return false;
  return Number(/Version\/(\d+)/.exec(agent)?.[1] ?? 0) >= 26;
}

/** How far (CSS px) the canvas should reach under the viewport's top now; 0 for not at all. `asked`: ?bleed=, or null. */
function wantedBleed(asked) {
  if (fullScreenElement() || openedAsApp()) return 0;
  if (asked !== null) return asked;
  if (!iPhoneSafari() || !matchMedia('(orientation: portrait)').matches) return 0;
  return Math.max(screen.width, screen.height) > TALLEST_HOME_BUTTON_SCREEN ? BLEED.islandOrNotch : BLEED.homeButton;
}

/**
 * Lay the canvas under the status bar where that is the way to the screen's
 * top (the header), and keep it there through turns, resizes and full
 * screen. `asked` is the page's ?bleed= as given (a string), or null.
 * Returns `bleed` (CSS px under the top now, 0 for none) and refresh().
 */
export function reachUnderStatusBar(asked) {
  const askedBleed = asked === null ? null : Math.min(Math.max(Number(asked) || 0, 0), LARGEST_ASKED_BLEED);
  let bleed = 0;
  let givenUp = false;    // the page would not scroll to its foot: fixed for the rest of the visit
  let backToFoot = 0;     // the frame asked to scroll back, while one is
  const foot = () => Math.max(0, root.scrollHeight - window.innerHeight);
  const toFoot = () => {
    backToFoot = 0;
    if (bleed && Math.abs(window.scrollY - foot()) > 0.5) window.scrollTo(0, foot());
  };
  const apply = () => {
    const wanted = givenUp ? 0 : wantedBleed(askedBleed);
    if (wanted !== bleed) {
      bleed = wanted;
      if (bleed) root.style.setProperty('--bleed', `${bleed}px`);
      else root.style.removeProperty('--bleed');
      root.classList.toggle('bleed', bleed > 0);
    }
    if (bleed) toFoot();
    else if (window.scrollY) window.scrollTo(0, 0);
  };
  // Two frames on the page should lie at its foot, the canvas its bleed under the top; if it will not, the canvas is fixed again.
  const check = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!bleed) return;
    toFoot();
    if (foot() >= bleed / 2 && Math.abs(window.scrollY - foot()) <= 1) return;
    givenUp = true;
    console.warn(`[screen] the page would not scroll ${bleed} px under the status bar; the canvas stays fixed`);
    apply();
  }));
  const reapply = () => { apply(); check(); };
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';   // the foot is set here, not restored from a visit before
  reapply();
  window.addEventListener('resize', reapply);
  window.addEventListener('pageshow', reapply);
  matchMedia('(orientation: portrait)').addEventListener?.('change', reapply);
  document.addEventListener('fullscreenchange', reapply);
  document.addEventListener('webkitfullscreenchange', reapply);
  window.addEventListener('scroll', () => {
    if (bleed && !backToFoot) backToFoot = requestAnimationFrame(toFoot);
  }, { passive: true });
  return {
    get bleed() { return bleed; },
    /** A pixel up and back (the next frame's toFoot), so Safari samples the bar's colour again. */
    refresh() { if (bleed && foot() >= 1) window.scrollTo(0, foot() - 1); },
  };
}

/** Full screen through the Fullscreen API, where a page has it. */
export const fullScreen = {
  /** Whether this browser lets a page take the whole screen (Safari on an iPhone does not). */
  get available() {
    return Boolean((document.fullscreenEnabled ?? document.webkitFullscreenEnabled) && (root.requestFullscreen ?? root.webkitRequestFullscreen));
  },
  get active() { return fullScreenElement() !== null; },
  /**
   * Into full screen (`on`) or out of it; resolves to whether the page is in
   * it. Going in must be asked by a press or a key: the browser refuses it
   * otherwise, and this resolves false.
   */
  async set(on) {
    try {
      if (on && !fullScreenElement()) await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen());
      else if (!on && fullScreenElement()) await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
    } catch (error) {
      console.warn('[screen] full screen refused:', error);
    }
    return fullScreenElement() !== null;
  },
  /** `listener` is called whenever the page goes into full screen or comes out (this, Escape, a phone's back gesture). */
  onChange(listener) {
    document.addEventListener('fullscreenchange', listener);
    document.addEventListener('webkitfullscreenchange', listener);
  },
};
