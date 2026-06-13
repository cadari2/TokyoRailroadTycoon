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
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
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
for (const id of ["topbar", "title", "clock", "cash", "pax", "pauseBtn", "main", "map",
  "sidebar", "tabs", "panel", "statusbar", "modal", "modalBox", "startScreen", "startBox"]) ids[id] = makeEl(id === "map" ? "canvas" : "div");

const documentStub = {
  getElementById: id => ids[id] || null,
  createElement: tag => makeEl(tag),
  createTextNode: t => ({ textContent: t }),
  querySelectorAll: () => [],
  activeElement: null,
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
  Image: function () { return { set src(v) {}, onload: null, onerror: null, complete: false }; },
  Blob: function () {}, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  navigator: {},
};
sandbox.window = sandbox;
sandbox.window.addEventListener = (ev, fn) => { (documentStub.listeners[ev] = documentStub.listeners[ev] || []).push(fn); };
let nowMs = 0;
const ctx = vm.createContext(sandbox);

const files = ["js/config.js", "js/util.js", "data/hexnames.js", "js/map.js", "js/world.js",
  "js/sim.js", "js/ai.js", "js/events.js", "js/save.js", "js/render.js", "js/ui.js", "js/main.js"];
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
  if (hx[25 * 50 + 25].name !== "皇居") throw new Error("center hex should be named 皇居, got " + hx[25 * 50 + 25].name);
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
step("all panels render", () => {
  for (const tab of ["Build", "Lines", "Finance", "Companies", "Log", "System"]) {
    G().ui.tab = tab;
    vm.runInContext("renderPanel(Game)", ctx);
  }
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
  const skipBtn = findByText(added, "Skip ahead");
  if (!skipBtn) throw new Error("skip-ahead button not found in Log panel");

  before = ids.panel.children.length;
  skipBtn.click();   // handler calls fastForwardDays(...) + renderPanel(G)
  added = { children: ids.panel.children.slice(before) };
  if (findByText(added, "Skip ahead")) throw new Error("skip-ahead button should be gone once construction completes");

  vm.runInContext(`
    if (daysToNextCompletion(Game.st, _p) !== 0) throw new Error("construction still pending after skip-ahead");
    if (!Game.st.hexes[_iTrack2].track) throw new Error("track not completed after skip-ahead");
  `, ctx);
});
step("stored train renders in Lines panel; assign & scrap modals work", () => {
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
  const scrapBtn = findByText(added, "Scrap");
  if (!scrapBtn) throw new Error("'Scrap' button not found for stored train");
  scrapBtn.click();
  if (ids.modal.classList.contains("hidden")) throw new Error("scrap-confirm modal never opened");
  const confirmBtn = findByText(ids.modalBox, "Scrap");
  if (!confirmBtn) throw new Error("scrap-confirm button not found");
  vm.runInContext("var _cashBeforeScrap = _p.cash;", ctx);
  confirmBtn.click();
  if (!ids.modal.classList.contains("hidden")) throw new Error("modal should close after scrap confirm");
  vm.runInContext(`
    if (_trStored.alive) throw new Error("stored train should be scrapped");
    if (!(_p.cash > _cashBeforeScrap)) throw new Error("cash should increase after scrap refund");
  `, ctx);
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
  vm.runInContext("closeModal()", ctx);
});
step("save/load via System actions", () => {
  vm.runInContext("saveToLocal(Game.st)", ctx);
  vm.runInContext("Game.st = loadFromLocal(); Game.st.renderDirty = true;", ctx);
  for (let i = 0; i < 5; i++) { nowMs += 400; rafCb(nowMs); }
});

console.log(failures ? "\n" + failures + " FAILURES" : "\nDOM SMOKE PASSED");
process.exit(failures ? 1 : 0);
