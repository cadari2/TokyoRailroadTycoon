/* =========================================================================
 * tools/blight.js — Fast headless checks for v0.6.1 trackside blight, the
 * elevated-viaduct upgrade, and the save/load fixes that shipped with them.
 *   Run: node tools/blight.js
 * ========================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, JSON, Date, window: undefined });
const files = ["js/config.js", "js/util.js", "data/machinames.js", "data/londonnames.js", "data/nycnames.js", "data/melbnames.js", "data/parisnames.js", "js/map.js", "js/world.js", "js/sim.js",
               "js/hr.js", "js/ai.js", "js/events.js", "js/rd.js", "js/commissions.js", "js/save.js", "js/main.js"];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
const G = src => vm.runInContext(src, ctx);

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  [" + detail + "]" : ""));
  if (!ok) failures++;
}

G(`
  var st = newGame(777, { aiCount: 0 });
  var p = st.companies[0];
  p.cash = 1e9;
  // a straight east-west corridor of surface track on row 30, cols 10..20
  var row = 30, corridor = [];
  for (let c = 10; c <= 20; c++) corridor.push(hexIdx(c, row));
  function layTrack(i, n) {
    const h = st.hexes[i];
    h.terrain = "grass";
    const rails = []; for (let k = 0; k < n; k++) rails.push({ gauge: "narrow", elec: false, building: false });
    h.track = { co: p.id, gauge: "narrow", elec: false, tunnel: false, dmg: 0, built: 1872, rails };
  }
  for (const i of corridor) layTrack(i, 1);
  st._blight = null;
  var onLine = hexBlight(st, hexIdx(15, row));
  var beside = hexBlight(st, hexIdx(15, row - 1));
  var far = hexBlight(st, hexIdx(15, row - 4));
`);
check("surface track blights its own hex", G("onLine") > 0.5, G("onLine").toFixed(2));
check("neighbours feel a lighter share", G("beside") > 0 && G("beside") < G("onLine"), G("beside").toFixed(2));
check("blight doesn't reach 4 hexes away", G("far") === 0, "" + G("far"));
check("homes beside a single line stay below the decline threshold", G("beside") < G("CFG.BLIGHT.declineAt"),
  G("beside").toFixed(2) + " < " + G("CFG.BLIGHT.declineAt"));

// a dense grid: every other row carries track → interior hexes cross the threshold
G(`
  for (let r = 26; r <= 34; r += 2) for (let c = 10; c <= 20; c++) layTrack(hexIdx(c, r), 2);
  for (let r = 26; r <= 34; r++) for (const c of [10, 13, 16, 19]) layTrack(hexIdx(c, r), 2);
  // a (synthetic) line running over every grid hex, so the grid counts as in service
  var gridPath = []; for (let r = 26; r <= 34; r++) for (let c = 10; c <= 20; c++) if (st.hexes[hexIdx(c, r)].track) gridPath.push(hexIdx(c, r));
  st.lines.push({ alive: true, trains: [0], path: gridPath, _fake: true });
  st._blight = null;
  var gridMax = 0; for (let r = 26; r <= 34; r++) for (let c = 10; c <= 20; c++) if (!st.hexes[hexIdx(c, r)].track) gridMax = Math.max(gridMax, hexBlight(st, hexIdx(c, r)));
`);
check("a rail grid pushes the homes between its lines past the decline threshold", G("gridMax") > G("CFG.BLIGHT.declineAt"), G("gridMax").toFixed(2));

// decline: unowned homes inside the grid lose development over time
G(`
  var homes = [];
  for (let r = 27; r <= 33; r += 2) for (const c of [11, 12, 14, 15, 17, 18]) {
    const i = hexIdx(c, r), h = st.hexes[i];
    if (h.track) continue;
    h.cons = "apartment"; h.dev = 5; h.owner = -1; homes.push(i);
  }
  var devBefore = homes.reduce((a, i) => a + st.hexes[i].dev, 0);
  for (let m = 0; m < 60; m++) blightDecline(st);
  var devAfter = homes.reduce((a, i) => a + st.hexes[i].dev, 0);
`);
check("rail-locked homes lose residents", G("devAfter") < G("devBefore"), G("devBefore") + " → " + G("devAfter"));

// growth damping & occupancy: a blighted home lets worse than an untouched one
G(`
  var qi = hexIdx(40, 10), bi = hexIdx(15, 29);
  for (const i of [qi, bi]) { const h = st.hexes[i]; h.cons = "house"; h.dev = 3; h.owner = p.id; h.terrain = "grass"; }
  var occBlight = occupancyTarget(st, bi), blBi = hexBlight(st, bi);
  st._blight.field[bi] = 0;
  var occQuiet = occupancyTarget(st, bi);
  st.lines = st.lines.filter(l => !l._fake); st._blight = null;
`);
check("blight lowers home occupancy target", G("blBi") > 0 && G("occBlight") < G("occQuiet"),
  G("occQuiet").toFixed(3) + " → " + G("occBlight").toFixed(3) + " (blight " + G("blBi").toFixed(2) + ")");

// viaducts: gated by year, cost money, finish over time, cut blight
G(`
  var gate = canElevate(st, p, hexIdx(15, row));
  st.time.totalDays = (1915 - CFG.START_YEAR) * CFG.DAYS_PER_YEAR; syncClock(st);
  var vq = elevateTrack(st, p, hexIdx(15, row), true);
  var cashBefore = p.cash;
  var vr = elevateTrack(st, p, hexIdx(15, row));
  var dupe = elevateTrack(st, p, hexIdx(15, row), true);
  st._blight = null;
  var blightBefore = hexBlight(st, hexIdx(15, row));
  var guard = 0;
  while (st.builds.some(b => b.kind === "elevate") && guard++ < 200) { st.time.totalDays++; syncClock(st); processBuilds(st); }
  st._blight = null;
  var blightAfter = hexBlight(st, hexIdx(15, row));
`);
check("viaducts are year-gated", !!G("gate"), G("gate"));
check("viaduct quote", G("vq").ok && G("vq").cost > 0 && G("vq").days > 0, JSON.stringify(G("vq")));
check("viaduct build charges cash", G("vr").ok && G("p").cash < G("cashBefore"));
check("no double-booking a viaduct hex", !G("dupe").ok, G("dupe").msg);
check("viaduct completes", G("st").hexes[G("hexIdx(15, row)")].track.elevated === true, "guard " + G("guard"));
check("viaduct cuts blight", G("blightAfter") < G("blightBefore"), G("blightBefore").toFixed(2) + " → " + G("blightAfter").toFixed(2));
check("viaduct upkeep costs more than surface track", (() => {
  G(`var mA = trackMaintYear(st, p); st.hexes[hexIdx(16, row)].track.elevated = true; var mB = trackMaintYear(st, p); st.hexes[hexIdx(16, row)].track.elevated = false;`);
  return G("mB") > G("mA");
})());

// save/load: elevated flag, buildings beside the rail, pending tunnel job flags
G(`
  var tH = hexIdx(15, 30);
  st.hexes[tH].cons = "shop"; st.hexes[tH].dev = 3;
  st.builds.push({ kind: "track", co: p.id, hexes: [hexIdx(22, 22)], done: 0, daysPerHex: 50, progress: 0,
                   gauge: "narrow", elec: true, tunnel: true, doubleTrack: true, undergroundRights: false });
  st.builds.push({ kind: "elevate", co: p.id, hex: hexIdx(12, 30), total: 100, progress: 10 });
  var st2 = importSaveString(exportSaveString(st));
  var tj = st2.builds.find(b => b.kind === "track");
  var ej = st2.builds.find(b => b.kind === "elevate");
`);
check("elevated flag survives save/load", G("st2").hexes[G("hexIdx(15, row)")].track.elevated === true);
check("a building beside the rail survives save/load", G("st2").hexes[G("tH")].cons === "shop" && G("st2").hexes[G("tH")].dev === 3,
  G("st2").hexes[G("tH")].cons + " dev " + G("st2").hexes[G("tH")].dev);
check("pending tunnel job keeps tunnel/double-track flags", !!G("tj") && G("tj").tunnel && G("tj").doubleTrack);
check("pending viaduct job survives save/load", !!G("ej") && G("ej").hex === G("hexIdx(12, 30)"));

// daily tick still runs cleanly with all of this in place
G(`for (let d = 0; d < 24; d++) { st.time.totalDays++; syncClock(st); if (st.time.day === 0) onNewYear(st); dailyEvents(st); dailyTick(st); }`);
check("daily ticks run with blight active", true);

console.log(failures ? failures + " FAILURE(S)" : "ALL BLIGHT CHECKS PASSED");
process.exit(failures ? 1 : 0);
