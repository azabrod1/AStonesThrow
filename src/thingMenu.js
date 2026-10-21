// The dropdown of things to throw: the strip's chip opens it above the strip,
// a card in the settings panel's glass (src/settingsPanel.js) listing every
// thing under its group (src/things.js thingGroups), each a pill with its
// picture and name, the chosen one ringed. A tap on a pill chooses that thing
// and closes it; its foot opens the settings' What to throw page, to look the
// chosen thing over. The page script (index.html) builds the pills and says
// what a choice and the foot do (onChoose, onMore); this holds the opening,
// closing and moving about.
//
// It stands in a box from under the settings button down to the strip's top
// (--strip-height, which the page keeps), its card at the box's foot: on a
// phone across the screen, on a wider one under the chip, never past the
// box's edge. Where the box is too short (a phone on its side) the card
// scrolls. It opens with a short rise, or at once for a reader who prefers
// reduced motion.
//
// It closes on the chip, on Escape (before Escape's glide back to the shore
// view, src/main.js), on a choice, on a press anywhere else (one on the water
// only closes it and throws nothing, as the settings do) and when the focus
// leaves it. Opened, the focus goes to the chosen pill; the arrow keys move
// it from pill to pill and to the foot, Home and End to the first and last,
// and Enter or Space chooses. Closed by Escape or a choice, the focus goes
// back to the chip.
const OPEN_MS = 140;

export class ThingMenu {
  constructor({ chip, root, card, onChoose, onMore }) {
    this.chip = chip;
    this.root = root;
    this.card = card;
    this.onChoose = onChoose;
    this.onMore = onMore;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    card.addEventListener('click', (event) => {
      const item = event.target.closest('[role="menuitemradio"], [role="menuitem"]');
      if (!item || !card.contains(item)) return;
      if (item.dataset.value) {
        this.hide();
        this.onChoose(item.dataset.value);
      } else {
        this.hide({ returnFocus: false });
        this.onMore();
      }
    });
    card.addEventListener('keydown', (event) => {
      const items = this.items();
      const at = items.indexOf(document.activeElement);
      const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[event.key];
      if (next === undefined || items.length === 0) return;
      event.preventDefault();
      items[(next + items.length) % items.length].focus();
    });
    // The focus gone somewhere else on the page (Tab, a click on another control) closes it.
    card.addEventListener('focusout', (event) => {
      const to = event.relatedTarget;
      if (to && !card.contains(to) && !chip.contains(to)) this.hide({ returnFocus: false });
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
    window.addEventListener('resize', () => { if (this.isOpen()) this.place(); });
  }

  isOpen() { return !this.root.hidden; }

  /** The pills, then the foot, in the order the arrow keys go. */
  items() { return [...this.card.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')]; }

  show() {
    if (this.isOpen()) return;
    this.root.hidden = false;
    this.chip.setAttribute('aria-expanded', 'true');
    this.place();
    const chosen = this.card.querySelector('[aria-checked="true"]') ?? this.items()[0];
    if (chosen) {
      chosen.scrollIntoView({ block: 'nearest' });
      chosen.focus({ preventScroll: true });
    }
    if (!this.reduceMotion.matches && typeof this.card.animate === 'function') {
      this.card.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: OPEN_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
  }

  /** Closed; the focus back on the chip if it was in the card and `returnFocus`. */
  hide({ returnFocus = true } = {}) {
    if (!this.isOpen()) return;
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
