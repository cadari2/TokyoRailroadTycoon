/* =========================================================================
 * tools/domsmoke.js — Boots the FULL game (render + UI + main loop) against
 * a minimal DOM stub to catch reference errors and exceptions in the
 * browser-only code paths. Simulates clicks through the core play loop:
 * mode switches, track planning, approval, station builds, line creation,
 * train purchase, panel renders, modals, save panel.
 *   Run: node tools/domsmoke.js
 * ========================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---- minimal DOM stubs ---- */
function makeCtx2d() {
  return new Proxy({}, {
    get(t, k) {
      if (k === "canvas") return { width: 800, height: 600 };
      return (...a) => undefined;
    },
    set() { return true; },
  });
}
function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(), children: [], style: {}, dataset: {},
    className: "", textContent: "", value: "", checked: false, type: "",
    width: 800, height: 600, clientWidth: 800, clientHeight: 600, files: [],
    listeners: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      // mirror DOMTokenList.toggle: with no force arg it flips the token
      toggle(c, v) { const on = v === undefined ? !this._s.has(c) : !!v; on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener(ev, fn) { (el.listeners[ev] = el.listeners[ev] || []).push(fn); },
    fire(ev, arg) { for (const fn of el.listeners[ev] || []) fn(arg || { clientX: 400, clientY: 300, target: el, preventDefault() {} }); },
    getContext: makeCtx2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    click() { el.fire("click"); },
  };
  return el;
}
const ids = {};
for (const id of ["topbar", "title", "clock", "cash", "pax", "pop", "demandBtn", "audioBtn", "debugBtn", "pauseBtn",
  "menuBtn", "main", "map", "sidebar", "tabs", "panel", "statusbar", "modal", "modalBox",
  "startScreen", "startBox"]) ids[id] = makeEl(id === "map" ? "canvas" : "div");

const documentStub = {
  getElementById: id => ids[id] || null,
  createElement: tag => makeEl(tag),
  createTextNode: t => ({ textContent: t }),
  querySelectorAll: () => [],
  activeElement: null,
  body: makeEl("body"),
  listeners: {},
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
};
let rafCb = null;
const sandbox = {
  console, Math, JSON, Date,
  document: documentStub,
  localStorage: { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
  performance: { now: () => nowMs },
  requestAnimationFrame: cb => { rafCb = cb; },
  setInterval: () => 0,
  setTimeout: fn => { fn(); return 0; },
  clearTimeout: () => {},
  Image: function () { return { set src(v) {}, onload: null, onerror: null, complete: false }; },
  // headless Audio stub: play() returns a resolved-ish thenable so audio.js's
  // .catch(() => {}) degradation path is exercised without real playback
  Audio: function (src) { return { src, loop: false, volume: 0, currentTime: 0,
    play() { return { catch() {} }; }, pause() {}, addEventListener() {}, removeEventListener() {} }; },
  Blob: function () {}, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  navigator: {},
  innerWidth: 1280, innerHeight: 800,
  Event: function (type) { this.type = type; },
};
sandbox.window = sandbox;
sandbox.window.addEventListener = (ev, fn) => { (documentStub.listeners[ev] = documentStub.listeners[ev] || []).push(fn); };
sandbox.window.dispatchEvent = ev => { for (const fn of documentStub.listeners[ev && ev.type] || []) fn(ev); return true; };
let nowMs = 0;
const ctx = vm.createContext(sandbox);

const files = ["assets/audio/manifest.js", "js/config.js", "js/util.js", "data/i18n.js", "data/machinames.js", "data/londonnames.js", "data/nycnames.js", "data/melbnames.js", "data/parisnames.js", "data/hexnames.js", "js/map.js", "js/world.js",
  "js/sim.js", "js/hr.js", "js/ai.js", "js/events.js", "js/rd.js", "js/save.js", "js/render.js", "js/audio.js", "js/ui.js", "js/main.js"];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });

let failures = 0;
function step(name, fn) {
  try { fn(); console.log("PASS  " + name); }
  catch (e) { console.log("FAIL  " + name + "  → " + e.stack.split("\n").slice(0, 3).join(" | ")); failures++; }
}
/** Find a button-like element whose textContent contains substr, searching the appended-element tree. */
function findByText(root, substr) {
  if (root.tagName === "BUTTON" && (root.textContent || "").includes(substr)) return root;
  for (const c of root.children || []) {
    const f = findByText(c, substr);
    if (f) return f;
  }
  return null;
}
/** Find all elements with the given tagName, searching the appended-element tree. */
function findAllByTag(root, tag) {
  const out = [];
  if (root.tagName === tag) out.push(root);
  for (const c of root.children || []) out.push(...findAllByTag(c, tag));
  return out;
}

step("DOMContentLoaded boot", () => {
  for (const fn of documentStub.listeners["DOMContentLoaded"]) fn();
  if (!sandbox.Game || !sandbox.Game.st) throw new Error("Game not created");
  if (ids.startScreen.classList.contains("hidden")) throw new Error("start screen should be visible on boot");
  // automatic hex naming works with data/hexnames.js (empty override) loaded
  const hx = sandbox.Game.st.hexes;
  if (hx[25 * 50 + 25].name !== "皇居 (Kokyo)") throw new Error("center hex should be named 皇居 (Kokyo), got " + hx[25 * 50 + 25].name);
  if (!hx.every(h => !!h.name)) throw new Error("every hex should have an area name");
});
step("start screen: configure rivals/difficulty and start new game", () => {
  const selects = findAllByTag(ids.startBox, "SELECT");
  // start-screen select order: [game speed, rival count, ...per-rival difficulty]
  if (selects.length < 2) throw new Error("start-screen selects (speed + AI count) not found");
  const speedSel = selects[0];
  const countSel = selects[1];
  speedSel.value = "isoge";          // 5× game speed
  countSel.value = "2";
  countSel.fire("change");

  const diffSelects = findAllByTag(ids.startBox, "SELECT").slice(2);
  if (diffSelects.length !== 2) throw new Error("expected 2 difficulty selects, got " + diffSelects.length);
  diffSelects[0].value = "easy";
  diffSelects[1].value = "hard";

  const startBtn = findByText(ids.startBox, "Start new game");
  if (!startBtn) throw new Error("'Start new game' button not found");
  const prevSt = sandbox.Game.st;
  startBtn.click();
  if (sandbox.Game.st === prevSt) throw new Error("starting a new game should replace Game.st");
  if (!ids.startScreen.classList.contains("hidden")) throw new Error("start screen should hide after starting");
  if (sandbox.Game.ui.speedMult !== 5) throw new Error("isoge speed should set speedMult=5, got " + sandbox.Game.ui.speedMult);
  vm.runInContext(`
    if (Game.st.pendingAI.length !== 2) throw new Error("expected 2 pending AI, got " + Game.st.pendingAI.length);
    if (Game.st.pendingAI[0].difficulty !== "easy") throw new Error("AI 0 difficulty should be easy");
    if (Game.st.pendingAI[1].difficulty !== "hard") throw new Error("AI 1 difficulty should be hard");
  `, ctx);
});
step("render frames (3 in-game days)", () => {
  for (let i = 0; i < 8; i++) { nowMs += 400; rafCb(nowMs); }
});
step("canvas hover + click (inspect)", () => {
  ids.map.fire("mousemove", { clientX: 400, clientY: 300, preventDefault() {} });
  ids.map.fire("mousedown", { clientX: 400, clientY: 300 });
  for (const fn of documentStub.listeners["mouseup"] || []) fn({ clientX: 400, clientY: 300, target: ids.map });
});
const G = () => sandbox.Game;
step("menu toggle hides/shows the side panel", () => {
  // boot defaults to visible on a wide screen (innerWidth 1280)
  if (documentStub.body.classList.contains("sidebar-hidden")) throw new Error("panel should start visible on desktop");
  ids.menuBtn.fire("click");
  if (!documentStub.body.classList.contains("sidebar-hidden")) throw new Error("menu toggle did not hide the panel");
  if (ids.menuBtn.textContent.indexOf("Menu") < 0) throw new Error("menu button label not updated");
  ids.menuBtn.fire("click");
  if (documentStub.body.classList.contains("sidebar-hidden")) throw new Error("menu toggle did not re-show the panel");
});
step("touch: one-finger pan moves the camera; two-finger pinch zooms", () => {
  const cam = G().renderer.cam;
  const x0 = cam.x, z0 = cam.zoom;
  // one-finger drag
  ids.map.fire("touchstart", { touches: [{ clientX: 400, clientY: 300 }], changedTouches: [{ clientX: 400, clientY: 300 }], preventDefault() {} });
  ids.map.fire("touchmove", { touches: [{ clientX: 340, clientY: 300 }], preventDefault() {} });
  ids.map.fire("touchend", { touches: [], changedTouches: [{ clientX: 340, clientY: 300 }], preventDefault() {} });
  if (cam.x === x0) throw new Error("one-finger pan did not move the camera");
  // two-finger pinch (spread apart → zoom in)
  ids.map.fire("touchstart", { touches: [{ clientX: 380, clientY: 300 }, { clientX: 420, clientY: 300 }], changedTouches: [], preventDefault() {} });
  ids.map.fire("touchmove", { touches: [{ clientX: 340, clientY: 300 }, { clientX: 460, clientY: 300 }], preventDefault() {} });
  ids.map.fire("touchend", { touches: [], changedTouches: [{ clientX: 340, clientY: 300 }], preventDefault() {} });
  if (cam.zoom === z0) throw new Error("pinch did not change the zoom");
});
step("touch: a tap (no movement) selects a hex like a click", () => {
  G().ui.mode = "inspect"; G().ui.selected = -1;
  ids.map.fire("touchstart", { touches: [{ clientX: 405, clientY: 305 }], changedTouches: [{ clientX: 405, clientY: 305 }], preventDefault() {} });
  ids.map.fire("touchend", { touches: [], changedTouches: [{ clientX: 405, clientY: 305 }], preventDefault() {} });
  if (G().ui.selected < 0) throw new Error("tap did not select a hex");
});
step("all five tabs and their sub-panels render, with stat tiles", () => {
  const layout = [["Build", ["Build"]], ["Lines", ["Lines"]], ["Money", ["Finance", "Property"]],
                  ["Company", ["R&D", "Workforce", "Rivals"]], ["System", ["Settings", "Log"]]];
  for (const [tab, subs] of layout) {
    for (const sub of subs) {
      G().ui.tab = tab;
      G().ui.subtab = G().ui.subtab || {};
      G().ui.subtab[tab] = sub;
      const before = ids.panel.children.length;
      vm.runInContext("renderPanel(Game)", ctx);
      const added = { children: ids.panel.children.slice(before) };
      const tiles = findAllByTag(added, "DIV").filter(d => (d.className || "") === "statTile");
      if (tiles.length !== 4) throw new Error("expected 4 stat tiles on " + tab + "/" + sub + ", got " + tiles.length);
      // a multi-sub parent must draw its sub-tab buttons
      if (subs.length > 1 && !findByText(added, sub)) throw new Error("sub-tab button missing: " + tab + "/" + sub);
    }
  }
  // legacy / deep-link tab names still resolve and render without throwing
  for (const legacy of ["Finance", "Property", "R&D", "Workforce", "Companies", "Log"]) {
    G().ui.tab = legacy;
    vm.runInContext("renderPanel(Game)", ctx);
  }
});
step("Settings panel exposes independent BGM and SFX volume bars", () => {
  // the two channels are controlled separately: changing one must not move the other
  vm.runInContext("setBgmVolume(0.4); setSfxVolume(0.9);", ctx);
  if (Math.abs(vm.runInContext("bgmVolume()", ctx) - 0.4) > 1e-9) throw new Error("BGM volume did not set independently");
  if (Math.abs(vm.runInContext("sfxVolume()", ctx) - 0.9) > 1e-9) throw new Error("SFX volume did not set independently");
  vm.runInContext("setSfxVolume(0);", ctx);              // muting effects leaves music untouched
  if (Math.abs(vm.runInContext("bgmVolume()", ctx) - 0.4) > 1e-9) throw new Error("changing SFX moved BGM");
  vm.runInContext("setBgmVolume(0.6); setSfxVolume(0.75);", ctx);   // restore defaults
  // the Settings panel draws a slider for each channel
  G().ui.tab = "System"; G().ui.subtab = G().ui.subtab || {}; G().ui.subtab.System = "Settings";
  const before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  const added = { children: ids.panel.children.slice(before) };
  const ranges = findAllByTag(added, "INPUT").filter(i => i.type === "range");
  if (ranges.length < 2) throw new Error("expected two audio sliders (BGM + SFX), got " + ranges.length);
});
step("language toggle switches the UI shell to Japanese and back (keys unchanged)", () => {
  if (vm.runInContext("t('tab.Build')", ctx) !== "Build") throw new Error("default language should be English");
  vm.runInContext("applyLang(Game, 'ja')", ctx);
  if (vm.runInContext("t('tab.Build')", ctx) !== "建設") throw new Error("t() did not switch to Japanese");
  // the Build tab BUTTON is relabelled, but its routing key stays English
  const [key, buildBtn] = G()._tabBtns.find(([k]) => k === "Build");
  if (key !== "Build") throw new Error("tab routing key must stay English");
  if (buildBtn.textContent !== "建設") throw new Error("tab button not relabelled, got " + buildBtn.textContent);
  // stat tiles localize: render a panel and find the Japanese "現金" (Cash) tile label
  G().ui.tab = "Build";
  const before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  const added = { children: ids.panel.children.slice(before) };
  if (!findAllByTag(added, "DIV").some(d => (d.textContent || "").includes("現金")))
    throw new Error("stat tiles were not localized to Japanese");
  if (G().ui.tab !== "Build") throw new Error("localization must not change the active tab key");
  // hex names stay bilingual regardless of language
  if (G().st.hexes[25 * 50 + 25].name !== "皇居 (Kokyo)") throw new Error("hex names should stay bilingual");
  // revert to English for the remaining steps
  vm.runInContext("applyLang(Game, 'en')", ctx);
  if (G()._tabBtns.find(([k]) => k === "Build")[1].textContent !== "Build") throw new Error("did not revert to English");
});
step("inspect click selects tile persistently", () => {
  G().ui.mode = "inspect";
  ids.map.fire("mousedown", { clientX: 410, clientY: 310 });
  for (const fn of documentStub.listeners["mouseup"] || []) fn({ clientX: 410, clientY: 310, target: ids.map });
  if (G().ui.selected < 0) throw new Error("nothing selected");
  vm.runInContext("renderPanel(Game)", ctx);   // selection box renders on every tab
});
step("track mode single click → confirm modal", () => {
  G().ui.mode = "track";
  let opened = false;
  for (const [cx, cy] of [[400, 300], [430, 310], [460, 290], [370, 320]]) {
    ids.map.fire("mousedown", { clientX: cx, clientY: cy });
    for (const fn of documentStub.listeners["mouseup"] || []) fn({ clientX: cx, clientY: cy, target: ids.map });
    if (!ids.modal.classList.contains("hidden")) { opened = true; break; }
  }
  if (!opened) throw new Error("confirm modal never opened");
  vm.runInContext("closeModal()", ctx);
});
step("build track via world API", () => {
  vm.runInContext(`
    var _p = Game.st.companies[0];
    var _i = hexIdx(28, 25);
    Game.st.hexes[_i].terrain = "grass"; Game.st.hexes[_i].track = null; Game.st.hexes[_i].owner = -1;
    var r = buildTrackHex(Game.st, _p, _i);
    if (!r.ok) throw new Error(r.msg);
  `, ctx);
});
step("build depot via Build-Depot mode → modal → API", () => {
  vm.runInContext(`
    var _iDepot = hexIdx(33, 25);
    var hd = Game.st.hexes[_iDepot];
    hd.terrain = "grass"; hd.stations = [];
    hd.owner = _p.id;
    if (!_p.land.includes(_iDepot)) _p.land.push(_iDepot);
    hd.track = { co: _p.id, gauge: _p.gauge, elec: false, tunnel: false, dmg: 0 };
    Game.ui.mode = "depot";
  `, ctx);
  const center = vm.runInContext("hexCenterIdx(_iDepot)", ctx);
  const cam = G().renderer.cam;
  const sx = (center.x - cam.x) * cam.zoom + 400;
  const sy = (center.y - cam.y) * cam.zoom + 300;
  ids.map.fire("mousedown", { clientX: sx, clientY: sy });
  for (const fn of documentStub.listeners["mouseup"] || []) fn({ clientX: sx, clientY: sy, target: ids.map });
  if (ids.modal.classList.contains("hidden")) throw new Error("Build Depot modal never opened");
  const goBtn = findByText(ids.modalBox, "Depot + station");
  if (!goBtn) throw new Error("'Depot + station' button not found in modal");
  goBtn.click();
  if (!ids.modal.classList.contains("hidden")) throw new Error("modal should close after choosing depot+station");
  vm.runInContext(`
    var depotStation = Game.st.stations[Game.st.stations.length - 1];
    if (!depotStation.isDepot || !depotStation.depotAsStation) throw new Error("depot+station not created");
    if (!depotStation.building) throw new Error("depot should be under construction");
  `, ctx);
});
step("skip-ahead completes depot construction; renders across panels", () => {
  vm.runInContext(`
    for (var _guard = 0; _guard < 5 && depotStation.building > 0; _guard++) {
      var _d = daysToNextCompletion(Game.st, _p);
      if (_d <= 0) break;
      fastForwardDays(Game.st, _d);
    }
    if (depotStation.building !== 0) throw new Error("depot still building after fast-forward (" + depotStation.building + ")");
  `, ctx);
  G().ui.selected = vm.runInContext("_iDepot", ctx);
  for (const tab of ["Build", "Lines", "Log"]) {
    G().ui.tab = tab;
    vm.runInContext("renderPanel(Game)", ctx);
  }
  // rename the station via its modal's name input
  vm.runInContext(`stationModal(Game, depotStation);`, ctx);
  const nameInputs = findAllByTag(ids.modalBox, "INPUT");
  if (!nameInputs.length) throw new Error("station rename input not found in stationModal");
  nameInputs[0].value = "My Test Depot";
  nameInputs[0].fire("change");
  vm.runInContext("closeModal();", ctx);
  vm.runInContext(`if (depotStation.name !== "My Test Depot") throw new Error("station rename did not apply: " + depotStation.name);`, ctx);
});
step("skip-ahead button fast-forwards pending construction", () => {
  vm.runInContext(`
    var _iTrack2 = hexIdx(35, 25);
    var h2 = Game.st.hexes[_iTrack2];
    h2.terrain = "grass"; h2.track = null; h2.owner = -1;
    var rTrack2 = buildTrackHex(Game.st, _p, _iTrack2);
    if (!rTrack2.ok) throw new Error(rTrack2.msg);
  `, ctx);
  G().ui.tab = "Log";
  let before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  let added = { children: ids.panel.children.slice(before) };
  let skipBtn = findByText(added, "Skip ahead");
  if (!skipBtn) throw new Error("skip-ahead button not found in Log panel");

  // each click skips to the NEXT of the player's completions; with varied build
  // times several jobs may be queued, so click until the button disappears
  // (the panel stub accumulates children across renders, so search only the
  // children added by the latest render).
  let guard = 0;
  while (skipBtn && guard++ < 30) {
    skipBtn.click();   // handler calls fastForwardDays(...) + renderPanel(G)
    before = ids.panel.children.length;
    vm.runInContext("renderPanel(Game)", ctx);
    skipBtn = findByText({ children: ids.panel.children.slice(before) }, "Skip ahead");
  }
  if (skipBtn) throw new Error("skip-ahead button should be gone once construction completes");

  vm.runInContext(`
    if (daysToNextCompletion(Game.st, _p) !== 0) throw new Error("construction still pending after skip-ahead");
    if (!Game.st.hexes[_iTrack2].track) throw new Error("track not completed after skip-ahead");
  `, ctx);
});
step("stored train renders in Lines panel; assign & sell modals work", () => {
  vm.runInContext(`
    var _trStored = { id: Game.st.trains.length, co: _p.id, line: -1, type: "steam_local", cars: 3,
      pos: 0, dir: 1, alive: true, stored: true };
    Game.st.trains.push(_trStored);
  `, ctx);
  G().ui.tab = "Lines";
  let before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  let added = { children: ids.panel.children.slice(before) };
  const assignBtn = findByText(added, "Assign to line");
  if (!assignBtn) throw new Error("'Assign to line' button not found for stored train");
  assignBtn.click();
  if (ids.modal.classList.contains("hidden")) throw new Error("assign-train modal never opened");
  vm.runInContext("closeModal()", ctx);

  before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  added = { children: ids.panel.children.slice(before) };
  const sellBtn = findByText(added, "Sell");
  if (!sellBtn) throw new Error("'Sell' button not found for stored train");
  sellBtn.click();
  if (ids.modal.classList.contains("hidden")) throw new Error("sell-confirm modal never opened");
  const confirmBtn = findByText(ids.modalBox, "Sell");
  if (!confirmBtn) throw new Error("sell-confirm button not found");
  vm.runInContext("var _cashBeforeScrap = _p.cash;", ctx);
  confirmBtn.click();
  if (!ids.modal.classList.contains("hidden")) throw new Error("modal should close after sell confirm");
  vm.runInContext(`
    if (_trStored.alive) throw new Error("stored train should be sold");
    if (!(_p.cash > _cashBeforeScrap)) throw new Error("cash should increase after sell refund");
  `, ctx);
});
step("Build panel: new station defaults & bulk station upgrades", () => {
  G().ui.tab = "Build";
  vm.runInContext(`
    _p.cash = 1e12;
    _p.stationDefaults = { cars: 3 };
    depotStation.commerce = 0; depotStation.cars = 1;
    // past the shops-tier unlock (1880) so bulk commerce has something to do
    fastForwardToYear(Game.st, 1885);
    Game.ui.bulkCarsTarget = undefined;
  `, ctx);

  let before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  let added = { children: ids.panel.children.slice(before) };

  // select order: [track gauge, station-default cars, bulk cars target]
  const selects = findAllByTag(added, "SELECT");
  if (selects.length < 3) throw new Error("expected >=3 selects in Build panel, got " + selects.length);
  const [, carDefSel] = selects;

  carDefSel.value = "1";
  carDefSel.fire("change");
  vm.runInContext(`
    if (_p.stationDefaults.cars !== 1) throw new Error("car-length default not applied: " + _p.stationDefaults.cars);
  `, ctx);

  // bulk commerce development: depotStation (commerce 0) has a tier ready to build
  before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  added = { children: ids.panel.children.slice(before) };
  const comBtn = findByText(added, "Develop (");
  if (!comBtn) throw new Error("bulk commerce-develop button not found");
  if (comBtn.disabled) throw new Error("bulk commerce-develop button unexpectedly disabled");
  vm.runInContext(`var _comCashBefore = _p.cash;`, ctx);
  comBtn.click();   // bulkBuildCommerce(...) + renderPanel
  vm.runInContext(`
    if (!(_p.cash < _comCashBefore)) throw new Error("bulk commerce-develop should charge cash");
    // commerce works are timed — fast-forward until they finish
    var _lguard = 0;
    while (Game.st.stations.some(s => s.co === _p.id && s.commerceBuilding > 0) && _lguard++ < 80)
      fastForwardDays(Game.st, daysToNextCompletion(Game.st, _p) || 1);
    if (depotStation.commerce !== 2) throw new Error("depotStation not developed to the next commerce tier: " + depotStation.commerce);
  `, ctx);

  // bulk platform-extend: depotStation (1 car) is below the platform-cap target
  before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  added = { children: ids.panel.children.slice(before) };
  const carBtn = findByText(added, "Extend");
  if (!carBtn) throw new Error("bulk platform-extend button not found");
  if (carBtn.disabled) throw new Error("bulk platform-extend button unexpectedly disabled");
  vm.runInContext(`var _carCashBefore = _p.cash;`, ctx);
  carBtn.click();   // bulkExtendPlatforms(...) + renderPanel
  vm.runInContext(`
    if (!(_p.cash < _carCashBefore)) throw new Error("bulk platform-extend should charge cash");
    var _pguard = 0;
    while (Game.st.stations.some(s => s.co === _p.id && s.platBuilding > 0) && _pguard++ < 80)
      fastForwardDays(Game.st, daysToNextCompletion(Game.st, _p) || 1);
    if (depotStation.cars !== maxPlatformCars(Game.st.time.year)) throw new Error("depotStation platform not extended: " + depotStation.cars);
  `, ctx);
});
step("loop line builder + alternating train directions", () => {
  vm.runInContext(`
    _p.cash = 1e12;
    // a filled, fully-connected block of player track (cols 10-14 × rows 30-34)
    for (var _c = 10; _c <= 14; _c++) for (var _r = 30; _r <= 34; _r++) {
      var _hi = hexIdx(_c, _r), _h = Game.st.hexes[_hi];
      _h.terrain = "grass"; _h.track = { co: _p.id, gauge: _p.gauge, elec: false, tunnel: false, dmg: 0 };
      _h.cons = null; _h.owner = _p.id; if (!_p.land.includes(_hi)) _p.land.push(_hi);
    }
    function _mkS(c, r, nm) {
      var hi = hexIdx(c, r);
      var s = { id: Game.st.stations.length, co: _p.id, hex: hi, cars: 3, name: nm,
        builtYear: Game.st.time.year, board: 50, paxDay: 50, alive: true, building: 0,
        isDepot: false, depotAsStation: false, commerce: 0, commerceBuilding: 0, commercePending: 0 };
      Game.st.stations.push(s); Game.st.hexes[hi].stations.push(s.id); return s;
    }
    var _lN = _mkS(12, 30, "LoopN"), _lE = _mkS(14, 32, "LoopE"), _lS = _mkS(12, 34, "LoopS");
    Game.ui.lineSel = [_lN.id, _lE.id, _lS.id];
  `, ctx);
  G().ui.tab = "Build"; G().ui.mode = "line"; G().ui.lineLoop = true;
  let before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  let added = { children: ids.panel.children.slice(before) };
  const buildLoopBtn = findByText(added, "Build local loop");
  if (!buildLoopBtn) throw new Error("'Build local loop' button not found in the line builder");
  buildLoopBtn.click();
  vm.runInContext(`
    var _loopLine = Game.st.lines[Game.st.lines.length - 1];
    if (!_loopLine.loop) throw new Error("created line is not flagged as a loop");
    if (_loopLine.path[0] !== _loopLine.path[_loopLine.path.length - 1]) throw new Error("loop path is not closed");
    var _lt1 = buyTrain(Game.st, _p, _loopLine.id, "steam_local");
    var _lt2 = buyTrain(Game.st, _p, _loopLine.id, "steam_local");
    if (!_lt1.ok || !_lt2.ok) throw new Error("could not buy loop trains");
    if (Game.st.trains[_lt1.train.id].dir !== 1 || Game.st.trains[_lt2.train.id].dir !== -1)
      throw new Error("loop trains did not alternate direction (got " +
        Game.st.trains[_lt1.train.id].dir + "," + Game.st.trains[_lt2.train.id].dir + ")");
  `, ctx);
});
step("Lines panel: default fare box re-prices, override pins a line", () => {
  G().ui.tab = "Lines";
  let before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  let added = { children: ids.panel.children.slice(before) };
  const numInputs = findAllByTag(added, "INPUT").filter(i => i.type === "number");
  if (!numInputs.length) throw new Error("no fare inputs in Lines panel");
  numInputs[0].value = "1.5";          // the company default-fare box is the first number input
  numInputs[0].fire("change");
  vm.runInContext(`
    if (!_p.defaultFareSet) throw new Error("default-fare flag not set by the box");
    if (Math.abs(_p.defaultFarePerKm - 1.5) > 1e-9) throw new Error("default fare not applied: " + _p.defaultFarePerKm);
    var _flw = Game.st.lines.find(l => l.alive && l.co === _p.id && !l.fareOverride);
    if (_flw && Math.abs(_flw.fare - 1.5) > 1e-9) throw new Error("non-overridden line did not follow the default");
  `, ctx);
  before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  added = { children: ids.panel.children.slice(before) };
  const overrideCb = findAllByTag(added, "INPUT").find(i => i.type === "checkbox");
  if (!overrideCb) throw new Error("per-line override checkbox not found");
  overrideCb.checked = !overrideCb.checked;
  overrideCb.fire("change");           // handler must run without error (re-prices or pins the line)
});
step("Property panel lists stations, demand & lines; Show-on-map focuses", () => {
  G().ui.tab = "Property";
  let before = ids.panel.children.length;
  vm.runInContext("renderPanel(Game)", ctx);
  const added = { children: ids.panel.children.slice(before) };
  const showBtn = findByText(added, "Show on map");
  if (!showBtn) throw new Error("Property panel missing a 'Show on map' button");
  const manageBtn = findByText(added, "Manage / Upgrade");
  if (!manageBtn) throw new Error("Property panel missing a 'Manage / Upgrade' button");
  G().ui.focusStation = -1;
  showBtn.click();
  if (G().ui.focusStation < 0) throw new Error("'Show on map' did not focus a station for line highlighting");
});
step("gauge works modal: add a parallel gauge enqueues a job", () => {
  vm.runInContext(`
    var _gp = Game.st.companies[0]; _gp.cash = 1e9;
    var _gi = hexIdx(30, 27);
    var _gh = Game.st.hexes[_gi];
    _gh.terrain = "grass"; _gh.cons = null; _gh.owner = _gp.id;
    if (!_gp.land.includes(_gi)) _gp.land.push(_gi);
    _gh.track = { co: _gp.id, gauge: _gp.gauge, elec: false, tunnel: false, dmg: 0,
      rails: [{ gauge: _gp.gauge, elec: false, building: false }] };
    var _gBuildsBefore = Game.st.builds.length;
    gaugeModal(Game, _gi);
  `, ctx);
  if (ids.modal.classList.contains("hidden")) throw new Error("gauge modal did not open");
  const addBtn = findByText(ids.modalBox, "Add ");
  if (!addBtn) throw new Error("gauge modal missing an 'Add ...' button");
  addBtn.click();
  vm.runInContext(`
    if (!Game.st.builds.some(b => b.kind === "gauge" && b.mode === "add" && b.hex === _gi))
      throw new Error("add-gauge did not enqueue a works job");
  `, ctx);
  vm.runInContext("closeModal()", ctx);
});
step("Demolish tool opens under a station (#3); Manage Station demolishes it (#2)", () => {
  vm.runInContext(`
    var _gp2 = Game.st.companies[0]; _gp2.cash = 1e9;
    var _di = hexIdx(31, 27);
    var _dh = Game.st.hexes[_di];
    _dh.terrain = "grass"; _dh.cons = null; _dh.owner = _gp2.id;
    if (!_gp2.land.includes(_di)) _gp2.land.push(_di);
    _dh.track = { co: _gp2.id, gauge: _gp2.gauge, elec: false, tunnel: false, dmg: 0,
      rails: [{ gauge: _gp2.gauge, elec: false, building: false }] };
    var _ds = { id: Game.st.stations.length, co: _gp2.id, hex: _di, cars: 3, name: "DemoTest",
      builtYear: Game.st.time.year, board: 0, boardAvg: 0, alive: true, building: 0,
      isDepot: false, depotAsStation: false, commerce: 0, commerceBuilding: 0, commercePending: 0,
      platBuilding: 0, platPending: 0 };
    Game.st.stations.push(_ds); _dh.stations.push(_ds.id);
    demolishModal(Game, _di);                 // #3: opens on a track hex with a station present
  `, ctx);
  if (ids.modal.classList.contains("hidden")) throw new Error("demolish modal did not open on a station hex (#3)");
  // the modalBox stub accumulates children across openModal calls, so every lookup
  // is scoped to just the children the latest dialog appended
  if (!findByText(ids.modalBox, "Demolish track only")) throw new Error("demolish modal missing a track-teardown button");
  vm.runInContext("closeModal()", ctx);
  const beforeSta = ids.modalBox.children.length;
  vm.runInContext("stationModal(Game, _ds);", ctx);
  const demoStaBtn = findByText({ children: ids.modalBox.children.slice(beforeSta) }, "Demolish (");
  if (!demoStaBtn) throw new Error("Manage Station missing a 'Demolish' button (#2)");
  const beforeConfirm = ids.modalBox.children.length;
  demoStaBtn.click();                          // opens a confirm dialog
  const confirm = findByText({ children: ids.modalBox.children.slice(beforeConfirm) }, "Demolish");
  if (!confirm) throw new Error("station-demolition confirm button missing");
  confirm.click();
  vm.runInContext(`
    if (!Game.st.builds.some(b => b.kind === "stationdemo" && b.sid === _ds.id))
      throw new Error("station demolition not enqueued (#2)");
  `, ctx);
  vm.runInContext("closeModal()", ctx);
});
step("fast-forward a year of frames", () => {
  for (let i = 0; i < 120; i++) { nowMs += 3000; rafCb(nowMs); }   // dt clamps at 0.1s
});
step("modal open/close", () => {
  vm.runInContext(`openModal("t", el("div","","x"), [["OK", null]])`, ctx);
  vm.runInContext("closeModal()", ctx);
});
step("end screen", () => {
  vm.runInContext("showEndScreen(Game)", ctx);
  const divs = findAllByTag(ids.modalBox, "DIV");
  const banner = divs.find(d => (d.className || "").startsWith("endBanner"));
  if (!banner) throw new Error("end screen missing victory/defeat banner");
  if (!/VICTORY|GAME OVER/.test(banner.textContent)) throw new Error("end banner text unexpected: " + banner.textContent);
  const sub = divs.find(d => d.className === "endSub");
  if (!sub || !sub.textContent.includes("years of service")) throw new Error("end screen missing era summary line");
  const rows = divs.filter(d => (d.className || "").includes("endRow"));
  const aliveCount = sandbox.Game.st.companies.filter(c => c.alive).length;
  if (rows.length !== aliveCount) throw new Error("expected " + aliveCount + " end-screen company rows, got " + rows.length);
  if (!(rows[0].className || "").includes("endRank1")) throw new Error("first-place row should carry endRank1 class");
  if (!rows[0].children.some(c => (c.textContent || "").includes("Tetsudo Shogun"))) {
    throw new Error("champion row missing rank title");
  }
  const thanks = divs.find(d => d.className === "endThanks");
  if (!thanks || !thanks.textContent.includes("Otsukaresama")) throw new Error("end screen missing thanks-for-playing line");
  vm.runInContext("closeModal()", ctx);
});
step("save/load via System actions", () => {
  vm.runInContext("saveToLocal(Game.st)", ctx);
  vm.runInContext("Game.st = loadFromLocal(); Game.st.renderDirty = true;", ctx);
  for (let i = 0; i < 5; i++) { nowMs += 400; rafCb(nowMs); }
});
step("debug mode off by default; DEBUG button stays hidden", () => {
  let before = ids.startBox.children.length;
  vm.runInContext("buildStartScreen(Game, false);", ctx);
  let added = { children: ids.startBox.children.slice(before) };

  const checkboxes = findAllByTag(added, "INPUT").filter(i => i.type === "checkbox");
  if (checkboxes.length !== 1) throw new Error("expected exactly one debug-mode checkbox, got " + checkboxes.length);
  if (checkboxes[0].checked) throw new Error("debug-mode checkbox should default to unchecked");

  const startBtn = findByText(added, "Start new game");
  if (!startBtn) throw new Error("'Start new game' button not found");
  startBtn.click();

  if (sandbox.Game.ui.debugMode !== false) throw new Error("debugMode should stay false when the checkbox was left unchecked");
  // the button is only ever gated by CSS (display:none) — same as the original,
  // pre-public-release design — so we just check visibility, not click handling.
  if (ids.debugBtn.style.display !== "none") throw new Error("DEBUG button should stay hidden when debug mode is off");
});
step("debug mode on: DEBUG button opens the time-skip modal and fast-forwards", () => {
  let before = ids.startBox.children.length;
  vm.runInContext("buildStartScreen(Game, false);", ctx);
  let added = { children: ids.startBox.children.slice(before) };

  const checkbox = findAllByTag(added, "INPUT").filter(i => i.type === "checkbox")[0];
  if (!checkbox) throw new Error("debug-mode checkbox not found");
  checkbox.checked = true;
  checkbox.fire("change");

  const startBtn = findByText(added, "Start new game");
  startBtn.click();

  if (sandbox.Game.ui.debugMode !== true) throw new Error("debugMode should be true once the checkbox was checked");
  if (ids.debugBtn.style.display === "none") throw new Error("DEBUG button should be visible once debug mode is on");

  const yearBefore = sandbox.Game.st.time.year;
  ids.debugBtn.click();
  if (ids.modal.classList.contains("hidden")) throw new Error("DEBUG button should open the time-skip modal");
  const sel = findAllByTag(ids.modalBox, "SELECT")[0];
  if (!sel) throw new Error("time-skip modal missing the target-year select");
  const targetYear = +sel.children[sel.children.length - 1].value;
  if (!(targetYear > yearBefore)) throw new Error("expected a future decade option, got " + targetYear);
  sel.value = "" + targetYear;
  const confirmBtn = findByText(ids.modalBox, "Confirm");
  if (!confirmBtn) throw new Error("time-skip modal missing Confirm button");
  confirmBtn.click();

  if (sandbox.Game.st.time.year !== targetYear) {
    throw new Error("expected to land on " + targetYear + ", got " + sandbox.Game.st.time.year);
  }
  if (!ids.modal.classList.contains("hidden")) throw new Error("time-skip modal should close after confirming");
});

step("campaign unlock chain (v0.5.6): completions + difficulty gates", () => {
  const ls = sandbox.localStorage;
  const run = code => vm.runInContext(code, ctx);
  const fresh = () => { ls._m = {}; };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

  fresh();
  expect(run('campaignUnlocked("tokyo")') === true, "Tokyo always unlocked");
  expect(run('campaignUnlocked("london")') === false, "London locked at start");
  expect(run('campaignUnlocked("nyc")') === false, "NYC locked at start");

  // completing Tokyo (easy) unlocks London, not NYC
  run('recordCompletion("tokyo", "kazoku")');
  expect(run('campaignUnlocked("london")') === true, "Tokyo completion unlocks London");
  expect(run('campaignUnlocked("nyc")') === false, "NYC still needs London");

  // completing London on easy too: both done, but zero hard completions → NYC stays locked
  run('recordCompletion("london", "zaibatsu")');
  expect(run('campaignUnlocked("nyc")') === false, "NYC needs one muzukashii+ completion");

  // replay Tokyo at muzukashii (shizoku) → NYC unlocks
  run('recordCompletion("tokyo", "shizoku")');
  expect(run('campaignUnlocked("nyc")') === true, "one hard completion unlocks NYC");
  expect(run('campaignUnlocked("melbourne")') === false, "Melbourne needs NYC + two hard");

  // complete NYC on easy: all three done but only one hard → Melbourne locked
  run('recordCompletion("nyc", "kazoku")');
  expect(run('campaignUnlocked("melbourne")') === false, "Melbourne needs TWO muzukashii+ completions");

  // a second hard completion (heimin counts as muzukashii+) → Melbourne unlocks
  run('recordCompletion("london", "heimin")');
  expect(run('campaignUnlocked("melbourne")') === true, "two hard completions unlock Melbourne");

  // legacy pre-v0.5.6 flag: an old browser with trt_london_unlocked keeps London
  fresh();
  ls.setItem("trt_london_unlocked", "1");
  expect(run('campaignUnlocked("london")') === true, "legacy London flag honored");

  // loading a save file of a locked campaign proves it earned
  fresh();
  run('unlockCampaignBySave("melbourne")');
  expect(run('campaignUnlocked("melbourne")') === true, "save-file proof unlocks");

  // v0.6: Paris is achievement-gated — 5 across at least 2 maps, any difficulty
  fresh();
  expect(run('campaignUnlocked("paris")') === false, "Paris locked at start");
  ls.setItem("trt_achievements", JSON.stringify({ tokyo: { a: 1880, b: 1881, c: 1882, d: 1883, e: 1884 } }));
  expect(run('campaignUnlocked("paris")') === false, "5 achievements on ONE map is not enough for Paris");
  ls.setItem("trt_achievements", JSON.stringify({ tokyo: { a: 1880, b: 1881, c: 1882, d: 1883 }, london: { e: 1900 } }));
  expect(run('campaignUnlocked("paris")') === true, "5 achievements across 2 maps unlock Paris");
  fresh();
});

step("v0.5.7 per-hex trackage rights: Companies-panel button enters selection mode", () => {
  vm.runInContext(`
    var _pR = Game.st.companies[0];
    var _aiR = Game.st.companies.find(c => !c.isPlayer && c.alive) ||
      createCompany(Game.st, { name: "OtherRail Co", color: "#33aa55", isPlayer: false, founded: Game.st.time.year, cash: 5e6, gauge: _pR.gauge });
    if (!_aiR.ai) _aiR.ai = { plan: null, difficulty: CFG.AI.DEFAULT_DIFFICULTY };
    window._aiRId = _aiR.id;
  `, ctx);
  G().ui.tab = "Company"; G().ui.subtab = G().ui.subtab || {}; G().ui.subtab.Company = "Rivals";
  vm.runInContext("renderPanel(Game)", ctx);
  const selBtn = findByText(ids.panel, "Select track for per-hex rights");
  if (!selBtn) throw new Error("'Select track for per-hex rights' button not found in Companies panel");
  selBtn.click();
  if (G().ui.mode !== "hexRights") throw new Error("button did not enter hexRights mode");
  if (G().ui.hexRightsTarget !== vm.runInContext("window._aiRId", ctx)) throw new Error("hexRightsTarget not set to the clicked rival");
  if (G().ui.tab !== "Build") throw new Error("entering selection mode should switch to the Build tab so the map is visible");
});
step("v0.5.7 per-hex rights: drag along connected track selects hexes; land/gap/other-owner is skipped", () => {
  vm.runInContext(`
    var _rHexA = hexIdx(40, 20), _rHexB = hexIdx(41, 20), _rHexBare = hexIdx(43, 20);
    for (const i of [_rHexA, _rHexB]) {
      const hh = Game.st.hexes[i];
      hh.terrain = "grass"; hh.stations = [];
      hh.track = { co: _aiR.id, gauge: _pR.gauge, elec: false, tunnel: false, dmg: 0,
        rails: [{ gauge: _pR.gauge, elec: false, building: false }] };
    }
    var hBare = Game.st.hexes[_rHexBare];
    hBare.terrain = "grass"; hBare.stations = []; hBare.track = null; hBare.cons = null;
  `, ctx);
  const screenOf = idx => {
    const c = vm.runInContext("hexCenterIdx(" + idx + ")", ctx);
    const cam = G().renderer.cam;
    return { x: (c.x - cam.x) * cam.zoom + 400, y: (c.y - cam.y) * cam.zoom + 300 };
  };
  const A = screenOf(vm.runInContext("_rHexA", ctx));
  const B = screenOf(vm.runInContext("_rHexB", ctx));
  const bare = screenOf(vm.runInContext("_rHexBare", ctx));
  ids.map.fire("mousedown", { clientX: A.x, clientY: A.y });
  if (G().ui.hexRightsSel.length !== 1) throw new Error("mousedown on the rival's own track should start the selection");
  // drag onto a bare hex first: must be silently skipped, not corrupt the chain
  ids.map.fire("mousemove", { clientX: bare.x, clientY: bare.y, buttons: 1 });
  if (G().ui.hexRightsSel.length !== 1) throw new Error("dragging over bare land should not extend the selection");
  // then drag onto the adjacent connected track hex: extends the chain
  ids.map.fire("mousemove", { clientX: B.x, clientY: B.y, buttons: 1 });
  if (G().ui.hexRightsSel.length !== 2) throw new Error("dragging onto adjacent connected track should extend the selection to 2");
  for (const fn of documentStub.listeners["mouseup"] || []) fn({ clientX: B.x, clientY: B.y, target: ids.map });
  vm.runInContext("renderPanel(Game)", ctx);   // the hexRights summary section must render without throwing
  const offerBtn = findByText(ids.panel, "Make offer");
  if (!offerBtn) throw new Error("'Make offer…' button not found after a non-empty selection");
});
step("v0.5.7 per-hex rights: Make offer opens a negotiation dialog and clears the selection on accept", () => {
  vm.runInContext(`
    _pR.cash = 1e8;
    // a generous anchor so the offer clears the target's reservation and is accepted immediately
    window._hexRightsAnchor = assetReservation(Game.st, _pR, "hexRights", Game.ui.hexRightsSel) * 2;
  `, ctx);
  const offerBtn = findByText(ids.panel, "Make offer");
  offerBtn.click();
  if (ids.modal.classList.contains("hidden")) throw new Error("offer dialog did not open");
  const inp = findAllByTag(ids.modalBox, "INPUT")[0];
  if (!inp) throw new Error("offer amount input not found in dialog");
  inp.value = vm.runInContext("window._hexRightsAnchor", ctx);
  const makeBtn = findByText(ids.modalBox, "Make offer");
  makeBtn.click();
  if (G().ui.hexRightsSel.length !== 0) throw new Error("accepting the offer should clear the selection (onDone callback)");
  if (G().ui.mode !== "inspect") throw new Error("accepting the offer should exit hexRights mode");
  vm.runInContext(`
    var granted = Game.st.hexes[_rHexA].track.rights && Game.st.hexes[_rHexA].track.rights.includes(_pR.id) &&
                  Game.st.hexes[_rHexB].track.rights && Game.st.hexes[_rHexB].track.rights.includes(_pR.id);
    if (!granted) throw new Error("both selected hexes should carry the player's per-hex rights after acceptance");
  `, ctx);
});

console.log(failures ? "\n" + failures + " FAILURES" : "\nDOM SMOKE PASSED");
process.exit(failures ? 1 : 0);
