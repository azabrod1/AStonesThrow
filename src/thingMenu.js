// The dropdown of things to throw: the strip's chip opens it above the strip,
// a card in the settings panel's glass (src/settingsPanel.js) with a row of
// tabs over its things: Favourites, then one tab for each group (src/things.js
// thingGroups). Each thing is a pill with its picture and name, the chosen
// thing's pill ringed; a tap on a pill chooses that thing and closes the
// dropdown. At the card's head, above the tabs and ruled off from them so it
// reads as no tab's, the chosen thing stands under "Selected", in the card's
// own glass: its picture (ringed as its pill is), name and size, a star that
// makes it a favourite or unmakes it (the dropdown stays open) and an ⓘ that
// opens the settings' What to throw page, to look it over. The Favourites
// tab, empty, says to star one there. It opens on Favourites if that was the
// tab last shown and it holds something (a per-viewer convenience, in
// localStorage; the first time, Favourites if there are any), else on the
// chosen thing's group. On a touch screen the tabs are one row a finger
// scrolls sideways (index.html). The page script (index.html) builds the
// tabs, the pills and the head and says what a choice, the star and the ⓘ do
// (onChoose, onFavourite, onMore); this holds the opening, closing, the tabs,
// the tips and moving about.
//
// Every tab's panel stands in the same place (a grid of one cell, the hidden
// ones invisible but still taking room), so the card is as tall as its
// tallest panel (the largest group) whichever is shown, and the tabs do not
// jump as one goes from tab to tab.
//
// A tip (data-tip: a pill's note, what the star and the ⓘ do) shows over what
// a mouse rests on, after a moment (at once while another tip has just been
// up, as a desktop's do), and over what the keyboard's focus is on; never for
// a touch, which chooses at once. It is one element beside the card, not in
// it, so the card's edges do not cut it off, kept inside the screen.
//
// It stands in a box from under the settings button down to the strip's top
// (--strip-height, which the page keeps), its card at the box's foot: on a
// phone across the screen, on a wider one under the chip, never past the
// box's edge. Where the box is too short (a phone on its side) the panels
// scroll under the tabs, the head and the tabs held. It opens with a short
// rise, or at once for a reader who prefers reduced motion.
//
// It closes on the chip, on Escape (before Escape's glide back to the shore
// view, src/main.js), on a choice, on a press anywhere else (one on the water
// only closes it and throws nothing, as the settings do) and when the focus
// leaves it. Opened, the focus goes to the chosen pill if the tab shows it,
// else to the tab. The arrow keys go as they stand, from the head's star
// and ⓘ to the tab, then pill to pill (Left and Right, on a tab, go from
// tab to tab, showing each); Home and End go to the first and last pill;
// Enter or Space chooses. Closed by Escape or a choice, the focus goes back to the
// chip.
const OPEN_MS = 140;
const TIP_MS = 450;          // a mouse's rest before a tip shows
const TIP_WARM_MS = 600;     // and how long after one goes the next shows at once
const TIP_GAP = 6;           // points between a tip and what it is about, and the screen's edge
const TAB_KEY = 'stone-pond-thing-tab';

export class ThingMenu {
  constructor({ chip, root, card, onChoose, onFavourite, onMore }) {
    this.chip = chip;
    this.root = root;
    this.card = card;
    this.onChoose = onChoose;
    this.onFavourite = onFavourite;
    this.onMore = onMore;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    try { this.tab = localStorage.getItem(TAB_KEY); } catch { this.tab = null; }
    this.tip = Object.assign(document.createElement('div'), { className: 'thing-tip', id: 'thing-tip', hidden: true });
    this.tip.setAttribute('role', 'tooltip');
    root.append(this.tip);
    this.tipFor = null;
    this.tipTimer = 0;
    this.tipGone = -Infinity;

    card.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      const favourite = event.target.closest('[data-favourite]');
      const pill = event.target.closest('[data-value]');
      const more = event.target.closest('[data-more]');
      if (tab) this.selectTab(tab.dataset.tab, { remember: true });
      else if (favourite) {
        this.onFavourite();
        if (this.tipFor === favourite) this.showTip(favourite);   // its tip says the other way now
      } else if (pill) {
        this.hide();
        this.onChoose(pill.dataset.value);
      } else if (more) {
        this.hide({ returnFocus: false });
        this.onMore();
      }
    });
    card.addEventListener('keydown', (event) => this.key(event));
    // The focus gone somewhere else on the page (Tab, a click on another control) closes it.
    card.addEventListener('focusout', (event) => {
      if (event.target === this.tipFor) this.hideTip();
      const to = event.relatedTarget;
      if (to && !card.contains(to) && !chip.contains(to)) this.hide({ returnFocus: false });
    });
    // The tips: a mouse resting on something with one, or the keyboard's focus on it.
    card.addEventListener('pointerover', (event) => {
      const target = event.target.closest('[data-tip]');
      if (event.pointerType !== 'mouse' || !target || target === this.tipFor) return;
      clearTimeout(this.tipTimer);
      if (performance.now() - this.tipGone < TIP_WARM_MS || this.tipFor) this.showTip(target);
      else this.tipTimer = setTimeout(() => this.showTip(target), TIP_MS);
    });
    card.addEventListener('pointerout', (event) => {
      const from = event.target.closest('[data-tip]');
      if (!from || from.contains(event.relatedTarget)) return;
      clearTimeout(this.tipTimer);
      if (from === this.tipFor) this.hideTip();
    });
    card.addEventListener('pointerdown', () => { clearTimeout(this.tipTimer); this.hideTip(); });
    card.addEventListener('focusin', (event) => {
      const target = event.target.closest('[data-tip]');
      if (target && target.matches(':focus-visible')) this.showTip(target);
      else if (this.tipFor && this.tipFor !== target) this.hideTip();
    });
    // Capture, so these run before the page's own handlers: Escape closes it
    // instead of resetting the view, and a press outside it only closes it.
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.isOpen()) return;
      event.stopPropagation();
      this.hide();
    }, true);
    window.addEventListener('pointerdown', (event) => {
      if (!this.isOpen() || card.contains(event.target) || chip.contains(event.target)) return;
      this.hide({ returnFocus: false });
      if (event.target instanceof HTMLCanvasElement) { event.stopPropagation(); event.preventDefault(); }
    }, true);
    window.addEventListener('resize', () => { if (this.isOpen()) { this.place(); this.hideTip(); } });
    card.querySelector('.thing-menu-panels')?.addEventListener('scroll', () => this.hideTip(), { passive: true });
  }

  isOpen() { return !this.root.hidden; }

  tabs() { return [...this.card.querySelectorAll('[role="tab"]')]; }

  /** The tab shown, and its panel. */
  selectedTab() { return this.card.querySelector('[role="tab"][aria-selected="true"]') ?? this.tabs()[0]; }
  panel() { return this.card.querySelector('[role="tabpanel"]:not(.thing-menu-off)'); }

  /** The shown panel's pills. */
  pills() { return [...(this.panel()?.querySelectorAll('[data-value]') ?? [])]; }

  /** The head's star and ⓘ, the selected tab, then the shown panel's pills: the order they stand in, the arrow keys' order. */
  items() {
    return [...this.card.querySelectorAll('.thing-menu-now button'), this.selectedTab(), ...this.pills()].filter(Boolean);
  }

  /**
   * Shows the tab of this name (the first, if there is none such now: a group gone), its panel shown and the
   * others hidden; remembered for the next visit if `remember`, the focus moved to it if `focus`.
   */
  selectTab(name, { remember = false, focus = false } = {}) {
    const tabs = this.tabs();
    const chosen = tabs.find((tab) => tab.dataset.tab === name) ?? tabs[0];
    if (!chosen) return;
    for (const tab of tabs) {
      const selected = tab === chosen;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls'))?.classList.toggle('thing-menu-off', !selected);
    }
    this.tab = chosen.dataset.tab;
    if (remember) try { localStorage.setItem(TAB_KEY, this.tab); } catch { /* storage refused: the tab lasts this visit */ }
    chosen.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) chosen.focus({ preventScroll: true });
    this.card.querySelector('.thing-menu-panels')?.scrollTo?.({ top: 0 });
  }

  /**
   * The tab it opens on (the header): Favourites if that was the tab last shown (the first time, unless none was)
   * and it holds a pill, else the group of the chosen thing (the pill the page marks aria-current).
   */
  openingTab() {
    const favourites = this.card.querySelector('[role="tabpanel"][data-tab="favourites"]');
    if ((this.tab ?? 'favourites') === 'favourites' && favourites?.querySelector('[data-value]')) return 'favourites';
    return this.card.querySelector('[role="tabpanel"]:not([data-tab="favourites"]) [data-value][aria-current="true"]')?.closest('[role="tabpanel"]').dataset.tab;
  }

  key(event) {
    const tabs = this.tabs();
    const onTab = tabs.indexOf(document.activeElement);
    if (onTab >= 0 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      const next = { ArrowRight: onTab + 1, ArrowLeft: onTab - 1, Home: 0, End: tabs.length - 1 }[event.key];
      this.selectTab(tabs[(next + tabs.length) % tabs.length].dataset.tab, { remember: true, focus: true });
      return;
    }
    const items = this.items();
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    const first = items.indexOf(this.selectedTab()) + 1, pills = this.pills().length;   // the pills follow the tab
    const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: pills ? first : at, End: pills ? first + pills - 1 : at }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    items[(next + items.length) % items.length].focus();
  }

  /** The tip of this element over it (under it where there is no room above), inside the screen. */
  showTip(target) {
    clearTimeout(this.tipTimer);
    const text = target.dataset.tip;
    if (!text || !this.isOpen()) return;
    if (this.tipFor && this.tipFor !== target) this.tipFor.removeAttribute('aria-describedby');
    this.tipFor = target;
    this.tip.textContent = text;
    this.tip.hidden = false;
    target.setAttribute('aria-describedby', this.tip.id);
    const around = target.getBoundingClientRect();
    const width = this.tip.offsetWidth, height = this.tip.offsetHeight;
    const left = Math.min(Math.max(around.left + around.width / 2 - width / 2, TIP_GAP), window.innerWidth - width - TIP_GAP);
    const top = around.top - height - TIP_GAP >= TIP_GAP ? around.top - height - TIP_GAP : around.bottom + TIP_GAP;
    this.tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  hideTip() {
    clearTimeout(this.tipTimer);
    if (!this.tipFor) return;
    this.tipFor.removeAttribute('aria-describedby');
    this.tipFor = null;
    this.tip.hidden = true;
    this.tipGone = performance.now();
  }

  show() {
    if (this.isOpen()) return;
    this.root.hidden = false;
    this.chip.setAttribute('aria-expanded', 'true');
    this.place();
    this.selectTab(this.openingTab());
    const chosen = this.panel()?.querySelector('[data-value][aria-current="true"]') ?? this.selectedTab();
    if (chosen) {
      chosen.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      chosen.focus({ preventScroll: true });
    }
    if (!this.reduceMotion.matches && typeof this.card.animate === 'function') {
      this.card.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: OPEN_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
  }

  /** Closed; the focus back on the chip if it was in the card and `returnFocus`. */
  hide({ returnFocus = true } = {}) {
    if (!this.isOpen()) return;
    this.hideTip();
    const hadFocus = this.card.contains(document.activeElement);
    this.root.hidden = true;
    this.chip.setAttribute('aria-expanded', 'false');
    if (returnFocus && hadFocus) this.chip.focus({ preventScroll: true });
  }

  /** The card under the chip where the box is wider than it, kept inside the box. */
  place() {
    this.card.style.marginLeft = '0px';
    const box = this.root.getBoundingClientRect();
    const chip = this.chip.getBoundingClientRect();
    const room = Math.max(box.width - this.card.offsetWidth, 0);
    this.card.style.marginLeft = `${Math.min(Math.max(chip.left - box.left, 0), room)}px`;
  }
}
