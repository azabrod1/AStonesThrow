// The settings panel: the button at the top right and the card it opens
// under it, laid out as the Moon app's ☰ menu is (azabrod1/moon,
// PlanetariumMenuPanel). The root page lists the settings in groups, each
// row an icon, its name over a line on what it sets, where it stands and a
// chevron; a row opens that setting's page, whose ‹ button comes back. A page
// holds the choices (a row of buttons, a slider, or pictured cards) and a line
// on what the chosen one means. The markup is in index.html; the page script
// (there too) wires each choice to the pond and calls setValue with what it
// shows.
//
// A page change slides, 220 ms on transform and opacity, the old page out
// and the new one in from the side it is going to (back the other way), as
// Web Animations with both keyframes spelled out, so a page measured while
// hidden never snaps; the panel's outline takes the new page's height at
// once. The leaving page is taken out of flow for the slide. A reader who
// prefers reduced motion gets the pages swapped outright. Focus never
// scrolls the panel: the incoming page is still off to the side when its
// back button takes focus.
//
// Closing it resets it to the root, so it always opens on the list. It
// closes on the button, on Escape (before Escape's glide back to the shore
// view, src/main.js) and on a press anywhere else; a press on the water then only
// closes it, it does not throw a stone.
const ROOT_PAGE = 'root';
const SLIDE_MS = 220;
const SLIDE_SAFETY_MS = SLIDE_MS + 120;

export class SettingsPanel {
  constructor({ button, panel }) {
    this.button = button;
    this.panel = panel;
    this.currentPage = ROOT_PAGE;
    this.opener = null;        // the row that opened the current page, for the keyboard's way back
    this.generation = 0;       // bumped by every navigation, so a superseded slide settles nothing
    this.settleTimer = null;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    button.addEventListener('click', () => (this.isOpen() ? this.hide() : this.show()));
    panel.addEventListener('click', (event) => {
      const tier = event.target.closest('.menu-tier');
      if (tier) {
        this.opener = tier;
        this.navigate(tier.dataset.open, true);
        return;
      }
      if (event.target.closest('.menu-back')) this.back();
    });
    // Capture, so these run before the page's own handlers: Escape closes the
    // panel instead of resetting the view, and a press outside it only closes it.
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.isOpen()) return;
      event.stopPropagation();
      this.hide();
      this.button.focus({ preventScroll: true });
    }, true);
    window.addEventListener('pointerdown', (event) => {
      if (!this.isOpen() || this.panel.contains(event.target) || this.button.contains(event.target)) return;
      this.hide();
      if (event.target instanceof HTMLCanvasElement) { event.stopPropagation(); event.preventDefault(); }
    }, true);
  }

  isOpen() { return !this.panel.hidden; }

  show() {
    if (this.isOpen()) return;
    this.resetToRoot();
    this.panel.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
  }

  hide() {
    if (!this.isOpen()) return;
    this.panel.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.resetToRoot();
  }

  /** The value a root row shows on its right ("Pond", "Auto · High"). */
  setValue(page, text) {
    const value = this.panel.querySelector(`.menu-tier[data-open="${page}"] .menu-tier-value`);
    if (value) value.textContent = text;
  }

  back() {
    const opener = this.opener;
    this.navigate(ROOT_PAGE, false);
    opener?.focus({ preventScroll: true });
  }

  pageElement(page) { return this.panel.querySelector(`.menu-page[data-page="${page}"]`); }

  navigate(to, forward) {
    const next = this.pageElement(to);
    if (!next || to === this.currentPage) return;
    const from = this.pageElement(this.currentPage);
    this.currentPage = to;
    this.generation += 1;
    const generation = this.generation;
    next.hidden = false;   // before anything in it takes focus
    this.panel.scrollTop = 0;
    if (from && !this.reduceMotion.matches && typeof next.animate === 'function') {
      from.classList.add('menu-page-leaving');
      this.panel.style.overflowY = 'hidden';
      const away = forward ? '-100%' : '100%';
      const fromSide = forward ? '100%' : '-100%';
      const options = { duration: SLIDE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' };
      from.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${away})`, opacity: 0 }], options);
      const enter = next.animate([{ transform: `translateX(${fromSide})`, opacity: 0 }, { transform: 'none', opacity: 1 }], options);
      enter.finished.then(() => this.settle(generation), () => {});
      window.clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => this.settle(generation), SLIDE_SAFETY_MS);
    } else {
      this.settle(generation);
    }
    if (to !== ROOT_PAGE) next.querySelector('.menu-back')?.focus({ preventScroll: true });
  }

  resetToRoot() {
    this.currentPage = ROOT_PAGE;
    this.opener = null;
    this.generation += 1;
    this.settle();
  }

  /** The end of a slide, or a reset: only the current page shown, every slide cancelled, the panel scrolling again. */
  settle(generation) {
    if (generation !== undefined && generation !== this.generation) return;
    window.clearTimeout(this.settleTimer);
    this.settleTimer = null;
    for (const page of this.panel.querySelectorAll('.menu-page')) {
      for (const animation of page.getAnimations?.() ?? []) animation.cancel();
      page.classList.remove('menu-page-leaving');
      page.hidden = page.dataset.page !== this.currentPage;
    }
    this.panel.style.removeProperty('overflow-y');
    this.panel.scrollTop = 0;
    this.panel.scrollLeft = 0;
  }
}

/**
 * Wire a group of radio buttons (role="radio", data-value) in `root`:
 * clicking one calls onChoose with its value. Returns show(value), which
 * marks that one checked. The buttons are found each time, so `root`'s may
 * be built again (the Object page's, as things are defined).
 */
export function radioGroup(root, onChoose) {
  const radios = () => [...root.querySelectorAll('[role="radio"]')];
  const show = (value) => {
    for (const button of radios()) {
      const checked = button.dataset.value === value;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
  };
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[role="radio"]');
    if (!button || !root.contains(button)) return;
    onChoose(button.dataset.value);
  });
  // Arrow keys move the choice, as a radio group's do.
  root.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const buttons = radios();
    const index = buttons.indexOf(document.activeElement);
    const next = buttons[(Math.max(index, 0) + step + buttons.length) % buttons.length];
    next.focus();
    onChoose(next.dataset.value);
  });
  return show;
}
