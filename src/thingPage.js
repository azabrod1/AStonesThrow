// What to throw and the strip's dropdown: registry-built cards, group tabs,
// favourites, recent choices and the selected thing's details. The page supplies
// its DOM, pond and settings, and keeps the strip's sizing and throw controls.
// Importing this module does not access the DOM or start the pond.
import { THINGS, thingGroups, onThingsChange } from './things.js';
import { radioGroup } from './settingsPanel.js';
import { ThingMenu } from './thingMenu.js';
import { TabRow } from './tabs.js';

/** Whether a thing floats, including a pie whose filling may make it sink. */
export const floatsOrSinks = (properties) => (!properties.floats ? 'Sinks' : properties.alwaysFloats ? 'Floats' : 'Floats or sinks');
const lowerName = (name) => (/^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

export function createThingPage({ root, pond, settings, chip, sizeInput, applySize, followTouch, onChange }) {
  const document = root.ownerDocument ?? root;
  const chooseThing = (value) => { pond.setThing(value); onChange(); };
  // The Object page, built from the registry (src/things.js): a tab for each group over its things' cards, one
  // group shown at a time, the chosen thing's whenever it is chosen; built again whenever a thing is defined. The
  // tabs only browse: a card chooses, and the arrow keys go from card to card across the groups (radioGroup), the
  // tab following.
  const thingsRoot = root.getElementById('thing');
  const thingTabs = root.getElementById('thing-tabs');
  // The tabs (a TabRow, src/tabs.js, as the dropdown's are): the shown group's cards the ones the Tab key reaches, its
  // chosen card, as radioGroup has it, or, in a group browsed that does not hold the chosen thing, its first.
  const pageTabs = new TabRow(thingTabs, {
    key: 'group',
    hidePanel: (panel, hidden) => { panel.hidden = hidden; },
    onSelect: () => {
      for (const card of thingsRoot.querySelectorAll('[role="radio"]')) card.tabIndex = card.getAttribute('aria-checked') === 'true' ? 0 : -1;
      const shownCards = thingsRoot.querySelector('.menu-group:not([hidden])');
      if (shownCards && !shownCards.querySelector('[aria-checked="true"]')) {
        const first = shownCards.querySelector('[role="radio"]');
        if (first) first.tabIndex = 0;
      }
    },
  });
  const showThingGroup = (name) => pageTabs.select(name);
  function buildThings() {
    const groups = thingGroups();
    thingTabs.replaceChildren(...groups.map(({ name }, index) => {
      const tab = Object.assign(document.createElement('button'), { type: 'button', id: `thing-page-tab-${index}`, textContent: name, tabIndex: -1 });
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `thing-page-group-${index}`);
      tab.dataset.group = name;
      return tab;
    }));
    thingsRoot.replaceChildren(...groups.map(({ name, keys }, index) => {
      const panel = Object.assign(document.createElement('div'), { className: 'menu-group', id: `thing-page-group-${index}` });
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-labelledby', `thing-page-tab-${index}`);
      panel.dataset.group = name;
      const cards = document.createElement('div');
      cards.className = 'menu-cards';
      for (const key of keys) {
        const thing = THINGS[key];
        const card = Object.assign(document.createElement('button'), { type: 'button', className: 'menu-card', title: `${thing.name}: ${thing.note}` });
        card.setAttribute('role', 'radio');
        card.dataset.value = key;
        const picture = Object.assign(document.createElement('img'), { src: thing.look.thumbnail, alt: '', width: 80, height: 45 });
        picture.addEventListener('error', () => { picture.style.visibility = 'hidden'; });
        const words = document.createElement('span');
        words.append(Object.assign(document.createElement('b'), { textContent: thing.name }), Object.assign(document.createElement('small'), { textContent: thing.note }));
        card.append(picture, words);
        cards.append(card);
      }
      panel.append(cards);
      return panel;
    }));
  }
  // ArrowDown on a tab goes into the shown group's cards: the chosen one if it is there, else the first.
  thingTabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' || !event.target.matches('[role="tab"]')) return;
    event.preventDefault();
    const panel = thingsRoot.querySelector('.menu-group:not([hidden])');
    (panel?.querySelector('[aria-checked="true"]') ?? panel?.querySelector('[role="radio"]'))?.focus();
  });
  buildThings();
  // What to throw. A card (or an arrow key) chooses the thing and shows it above the groups, to look over: its
  // picture, size and mass, whether it floats, skips, bends or soaks, its size to set; Use (or Enter on a card)
  // goes back to the water to throw it. Favourites and the latest choices sit at the top, one tap each, and throw
  // at once. The dropdown's ⓘ opens this page from the strip's chip; the choice made, the focus goes back there.
  const FAVOURITES_KEY = 'stone-pond-favourites', RECENT_KEY = 'stone-pond-recent', RECENT_MOST = 4;
  const storedList = (key) => { try { const list = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(list) ? list.filter((name) => typeof name === 'string') : []; } catch { return []; } };
  const storeList = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage refused: the list lasts this visit */ } };
  let favourites = storedList(FAVOURITES_KEY), recent = storedList(RECENT_KEY);
  const quick = root.getElementById('thing-quick');
  const inspectSize = root.getElementById('inspect-size');
  const favouriteButton = root.getElementById('thing-favourite');
  const useButton = root.getElementById('thing-use');
  function showQuick() {
    const names = [...new Set([...favourites, ...recent])].filter((name) => THINGS[name]).slice(0, favourites.length + RECENT_MOST);
    quick.hidden = names.length === 0;
    quick.replaceChildren(...names.map((name) => {
      const thing = THINGS[name];
      const button = Object.assign(document.createElement('button'), { type: 'button', className: favourites.includes(name) ? 'favourite' : '' });
      button.dataset.value = name;
      if (name === pond.thing) button.setAttribute('aria-current', 'true');
      const picture = Object.assign(document.createElement('img'), { src: thing.look.thumbnail, alt: '', width: 40, height: 26 });
      picture.addEventListener('error', () => { picture.style.visibility = 'hidden'; });
      button.append(picture, thing.short);
      button.setAttribute('aria-label', `${thing.name}${favourites.includes(name) ? ', a favourite' : ''}`);
      return button;
    }));
  }
  const showInspected = () => {
    const thing = THINGS[pond.thing];
    const value = thing.slider ? Number(sizeInput.value) : undefined;
    const properties = thing.properties(value);
    const picture = root.getElementById('inspect-picture');
    picture.style.visibility = '';
    picture.src = thing.look.thumbnail;
    root.getElementById('inspect-name').textContent = thing.name;
    root.getElementById('inspect-stats').textContent = `${properties.text} · ${Math.round(properties.density)} kg/m\u00b3`;
    const badge = (text, has = true) => Object.assign(document.createElement('span'), { textContent: text, className: has ? '' : 'not' });
    root.getElementById('inspect-badges').replaceChildren(
      badge(floatsOrSinks(properties)),
      badge('Skips', thing.skips),
      // A frozen thing thaws before it bends; anything soft bends.
      ...(thing.water.thaws ? [badge('Thaws')] : thing.body.soft ? [badge('Bends')] : []),
      ...(thing.water.soaks ? [badge('Soaks')] : []),
    );
    inspectSize.hidden = !thing.slider;
    if (thing.slider) Object.assign(inspectSize, { min: String(thing.slider.min), max: String(thing.slider.max), step: String(thing.slider.step), value: sizeInput.value });
    inspectSize.style.setProperty('--fraction', sizeInput.style.getPropertyValue('--fraction'));
    favouriteButton.setAttribute('aria-pressed', String(favourites.includes(pond.thing)));
    favouriteButton.setAttribute('aria-label', `${thing.name}: favourite`);
    useButton.textContent = `Use ${lowerName(thing.name)}`;
  };
  root.getElementById('inspect-picture').addEventListener('error', (event) => { event.target.style.visibility = 'hidden'; });
  inspectSize.addEventListener('input', () => { sizeInput.value = inspectSize.value; applySize(); });
  followTouch(inspectSize, () => { sizeInput.value = inspectSize.value; applySize(); });
  // A favourite made, or unmade, by a star (here, or the dropdown's chosen thing's card): the other star and the dropdown's Favourites tab follow.
  function toggleFavourite(name) {
    favourites = favourites.includes(name) ? favourites.filter((kept) => kept !== name) : [...favourites, name];
    storeList(FAVOURITES_KEY, favourites);
    showQuick();
    showInspected();
    showMenuFavourites();
  }
  favouriteButton.addEventListener('click', () => toggleFavourite(pond.thing));
  const useChosen = () => {
    recent = [pond.thing, ...recent.filter((name) => name !== pond.thing)].slice(0, RECENT_MOST);
    storeList(RECENT_KEY, recent);
    showQuick();
    settings.hide();
  };
  useButton.addEventListener('click', useChosen);
  quick.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    chooseThing(button.dataset.value);
    useChosen();
  });
  thingsRoot.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.closest('[role="radio"]')) { event.preventDefault(); useChosen(); } });
  // The dropdown of things (src/thingMenu.js), built from the registry too: a tab for Favourites and one for each
  // group, each tab's panel of pills, each pill the thing's picture and name, the chosen one ringed (updateThing).
  const menuTabs = root.getElementById('thing-menu-tabs');
  const menuPanels = root.getElementById('thing-menu-panels');
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6l2.3 4.7 5.1.7-3.7 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L2.6 8l5.1-.7z"></path></svg>';
  function menuPill(key) {
    const thing = THINGS[key];
    const pill = Object.assign(document.createElement('button'), { type: 'button', className: 'thing-pill' });
    pill.dataset.value = key;
    const picture = Object.assign(document.createElement('img'), { src: thing.look.thumbnail, alt: '', width: 32, height: 24 });
    picture.addEventListener('error', () => { picture.style.visibility = 'hidden'; });
    pill.append(picture, thing.name);
    pill.dataset.tip = thing.note;
    return pill;
  }
  function pillRow(keys) {
    const row = Object.assign(document.createElement('div'), { className: 'thing-menu-pills' });
    row.append(...keys.map(menuPill));
    return row;
  }
  function buildMenu() {
    const groups = thingGroups();
    const tabs = [{ name: 'favourites', label: 'Favourites' }, ...groups.map(({ name, keys }) => ({ name, label: name, keys }))];
    menuTabs.replaceChildren(...tabs.map(({ name, label }, index) => {
      const tab = Object.assign(document.createElement('button'), { type: 'button', id: `thing-tab-${index}`, tabIndex: -1 });
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-controls', `thing-panel-${index}`);
      tab.dataset.tab = name;
      if (name === 'favourites') tab.innerHTML = STAR;
      tab.append(label);
      return tab;
    }));
    menuPanels.replaceChildren(...tabs.map(({ name, keys }, index) => {
      const panel = Object.assign(document.createElement('div'), { id: `thing-panel-${index}`, className: 'thing-menu-off' });
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `thing-tab-${index}`);
      panel.dataset.tab = name;
      if (keys) panel.append(pillRow(keys));
      return panel;
    }));
    showMenuFavourites();
    thingMenu.selectTab(thingMenu.openingTab());
  }
  // The Favourites tab's pills, or, with none, where to make one (its star on the chosen thing's card).
  function showMenuFavourites() {
    const panel = menuPanels.querySelector('[data-tab="favourites"]');
    if (!panel) return;
    const kept = favourites.filter((name) => THINGS[name] && !THINGS[name].hidden);
    if (kept.length > 0) panel.replaceChildren(pillRow(kept));
    else {
      const empty = Object.assign(document.createElement('div'), { className: 'thing-menu-empty' });
      const words = document.createElement('p');
      words.innerHTML = `<b>No favourites yet.</b> Star the selected thing above to keep it here.`;
      empty.append(words);
      panel.replaceChildren(empty);
    }
    showMenuChosen();
  }
  // The chosen thing's pills ringed, wherever they are, and its card showing it.
  function showMenuChosen() {
    for (const pill of menuPanels.querySelectorAll('[data-value]')) {
      if (pill.dataset.value === pond.thing) pill.setAttribute('aria-current', 'true');
      else pill.removeAttribute('aria-current');
    }
    showMenuThing();
  }
  // The chosen thing's card: its picture, name and size (the strip's line), its star and its ⓘ, each with its tip.
  const nowPicture = root.getElementById('thing-now-picture');
  nowPicture.addEventListener('error', () => { nowPicture.style.visibility = 'hidden'; });
  const showMenuThing = () => {
    const thing = THINGS[pond.thing];
    const called = lowerName(thing.name);
    if (!nowPicture.src.endsWith(thing.look.thumbnail.replace(/^\.\//, ''))) {
      nowPicture.style.visibility = '';
      nowPicture.src = thing.look.thumbnail;
    }
    root.getElementById('thing-now-name').textContent = thing.name;
    root.getElementById('thing-now-size').textContent = thing.properties(thing.slider ? Number(sizeInput.value) : undefined).text;
    const star = root.getElementById('thing-now-favourite');
    const favourite = favourites.includes(pond.thing);
    star.setAttribute('aria-pressed', String(favourite));
    star.setAttribute('aria-label', `${thing.name}: favourite`);
    star.dataset.tip = favourite ? `Remove the ${called} from Favourites` : `Add the ${called} to Favourites`;
    const more = root.getElementById('thing-more');
    more.setAttribute('aria-label', `More about the ${called}`);
    more.dataset.tip = `More about the ${called}`;
  };
  // The strip's chip opens the dropdown; a pill tapped there is thrown next, the star on its chosen thing's card makes it
  // a favourite, and its ⓘ opens What to throw from the chip. Pressed while What to throw is open from it, the chip closes that. A pick in the dropdown is not one
  // of What to throw's latest choices: those are for switching quickly there, which the dropdown does itself.
  const thingMenu = new ThingMenu({
    chip,
    root: root.getElementById('thing-menu'),
    card: root.getElementById('thing-menu-card'),
    onChoose: chooseThing,
    onFavourite: () => toggleFavourite(pond.thing),
    onMore: () => {
      settings.openOn('thing', chip);
      // The ⓘ is about the chosen thing: its group shown, whichever was browsed there last.
      showThingGroup(THINGS[pond.thing].group);
      thingsRoot.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    },
  });
  buildMenu();
  chip.addEventListener('click', () => {
    if (settings.isOpen()) { settings.hide(); return; }
    if (thingMenu.isOpen()) thingMenu.hide();
    else thingMenu.show();
  });
  const showThing = radioGroup(thingsRoot, chooseThing);
  onThingsChange(() => { buildThings(); buildMenu(); onChange(); });

  return {
    update() {
      showThing(pond.thing);
      settings.setValue('thing', THINGS[pond.thing].name);
      showThingGroup(THINGS[pond.thing].group);
      showMenuChosen();
      showInspected();
      showQuick();
    },
    showSize() { showInspected(); showMenuThing(); },
  };
}
