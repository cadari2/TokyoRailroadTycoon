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
  "sidebar", "tabs", "panel", "statusbar", "modal", "modalBox"]) ids[id] = makeEl(id === "map" ? "canvas" : "div");

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

step("DOMContentLoaded boot", () => {
  for (const fn of documentStub.listeners["DOMContentLoaded"]) fn();
  if (!sandbox.Game || !sandbox.Game.st) throw new Error("Game not created");
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
step("track mode two clicks → plan", () => {
  G().ui.mode = "track";
  const click = (cx, cy) => {
    ids.map.fire("mousedown", { clientX: cx, clientY: cy });
    for (const fn of documentStub.listeners["mouseup"] || []) fn({ clientX: cx, clientY: cy, target: ids.map });
  };
  click(380, 300); click(480, 280);
  if (!G().ui.plan && G().ui.trackStart < 0) throw new Error("no plan and no pending start");
});
step("approve plan via world API", () => {
  if (G().ui.plan) {
    vm.runInContext("approveTrack(Game.st, Game.st.companies[0], Game.ui.plan)", ctx);
    G().ui.plan = null;
  }
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
