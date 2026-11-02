// A row of tabs (role="tablist"): each a button with role="tab", its name in a data attribute (data-tab, or the
// one `key` names) and its panel named by aria-controls. One tab is selected at a time: aria-selected, the only
// one the Tab key reaches (tabIndex 0), scrolled into the row's view (the row alone, sideways: reveal); its panel
// shown and the others hidden by `hidePanel` (the caller's own way: the attribute `hidden`, or a class that keeps
// their room). A click on a tab selects it; on a tab, Left and Right go to the next and the one before (wrapping),
// Home and End to the first and last, the focus going with them. What else a key does (going down into a panel) is
// the caller's own, on the row's keydown after this one's: this one prevents the default of every key it takes.
//
// With a `storageKey` the tab a viewer last picked (a click or a key, not one shown for them) is remembered in
// localStorage for the next visit, a per-viewer convenience; `last` is the tab shown last, from storage at first.
// Both the dropdown of things (src/thingMenu.js) and What to throw's groups (src/thingPage.js) are one of these, so the
// two rows go alike.
export class TabRow {
  constructor(tablist, { hidePanel, onSelect = () => {}, storageKey = null, key = 'tab' }) {
    this.tablist = tablist;
    this.hidePanel = hidePanel;
    this.onSelect = onSelect;
    this.storageKey = storageKey;
    this.key = key;
    this.last = null;
    if (storageKey) try { this.last = localStorage.getItem(storageKey); } catch { /* storage refused: nothing remembered */ }
    tablist.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab && tablist.contains(tab)) this.select(tab.dataset[key], { remember: true });
    });
    tablist.addEventListener('keydown', (event) => {
      const tabs = this.tabs();
      const at = tabs.indexOf(event.target);
      const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (at < 0 || next === undefined) return;
      event.preventDefault();
      this.select(tabs[(next + tabs.length) % tabs.length].dataset[key], { remember: true, focus: true });
    });
  }

  tabs() { return [...this.tablist.querySelectorAll('[role="tab"]')]; }

  /** The tab selected (the first, before any is). */
  selected() { return this.tablist.querySelector('[role="tab"][aria-selected="true"]') ?? this.tabs()[0] ?? null; }

  /**
   * Selects the tab of this name (the first, if there is none such now: a group gone) and shows its panel;
   * remembered for the next visit if `remember` and the row has a storage key, the focus moved to it if `focus`.
   */
  select(name, { remember = false, focus = false } = {}) {
    const tabs = this.tabs();
    const chosen = tabs.find((tab) => tab.dataset[this.key] === name) ?? tabs[0];
    if (!chosen) return;
    for (const tab of tabs) {
      const selected = tab === chosen;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) this.hidePanel(panel, !selected);
    }
    this.last = chosen.dataset[this.key];
    if (remember && this.storageKey) try { localStorage.setItem(this.storageKey, this.last); } catch { /* storage refused: the tab lasts this visit */ }
    this.reveal(chosen);
    if (focus) chosen.focus({ preventScroll: true });
    this.onSelect(this.last);
  }

  /**
   * The tab scrolled into the row's view, sideways only, clear of the row's own padding (so the first tab, revealed,
   * lies where it does unscrolled). scrollIntoView would scroll every box round it too: a choice made low in a long
   * group (What to throw, on a phone on its side) selects its group's tab again, and the settings page would scroll
   * back up to the tabs, the card just pressed jumping away under the finger.
   */
  reveal(tab) {
    const row = this.tablist.getBoundingClientRect(), box = tab.getBoundingClientRect(), style = getComputedStyle(this.tablist);
    const left = row.left + (parseFloat(style.paddingLeft) || 0), right = row.right - (parseFloat(style.paddingRight) || 0);
    if (box.left < left) this.tablist.scrollLeft -= left - box.left;
    else if (box.right > right) this.tablist.scrollLeft += box.right - right;
  }
}
