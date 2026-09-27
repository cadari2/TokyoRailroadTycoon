/* =========================================================================
 * tools/rdtree.js — Headless checks for the v0.6.2 R&D additions: every tech
 * sits in a branch, prerequisites resolve, and each new tech's effect is
 * actually felt by the system it claims to change.
 *   Run: node tools/rdtree.js
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

check("every tech belongs to a known branch",
  G(`Object.keys(RND_TECHS).every(k => RND_BRANCHES[RND_TECHS[k].branch])`));
check("every prerequisite exists and no tech is its own ancestor", G(`
  Object.keys(RND_TECHS).every(k => {
    const seen = new Set(); let cur = RND_TECHS[k].prereq;
    while (cur) { if (!RND_TECHS[cur] || seen.has(cur) || cur === k) return false; seen.add(cur); cur = RND_TECHS[cur].prereq; }
    return true;
  })`));
check("a prerequisite never unlocks later than the tech that needs it", G(`
  Object.keys(RND_TECHS).every(k => { const t = RND_TECHS[k], q = t.prereq && RND_TECHS[t.prereq];
    return !q || (q.minYear || 0) <= (t.minYear || 9999); })`));
check("every tech has positive AI value", G(`(() => { const st = newGame(5, { aiCount: 1 });
  const co = st.companies[0]; return Object.keys(RND_TECHS).every(k => aiTechValue(st, co, k) > 0); })()`));

G(`
  var st = newGame(4242, { aiCount: 0 });
  var p = st.companies[0];
  p.cash = 1e12;
  st.time.year = 1970;
  var row = 30, corridor = [];
  for (let c = 10; c <= 20; c++) corridor.push(hexIdx(c, row));
  for (const i of corridor) {
    const h = st.hexes[i]; h.terrain = "grass";
    h.track = { co: p.id, gauge: "narrow", elec: false, tunnel: false, dmg: 0, built: 1900,
                rails: [{ gauge: "narrow", elec: false, building: false }] };
  }
  st._blight = null;
  var b0 = hexBlight(st, hexIdx(15, row));
  var v0 = viaductCost(st, hexIdx(15, row));
  p.research.done.push("steel_rails", "cwr");
  st._blight = null;
  var b1 = hexBlight(st, hexIdx(15, row));
  p.research.done.push("pc_viaduct");
  var v1 = viaductCost(st, hexIdx(15, row));
  st.hexes[hexIdx(15, row)].track.elevated = true;
  var srcPC = trackBlightSource(st, hexIdx(15, row), new Set());
  p.research.done.splice(p.research.done.indexOf("pc_viaduct"), 1);
  var srcPlain = trackBlightSource(st, hexIdx(15, row), new Set());
  p.research.done.push("pc_viaduct");
`);
check("welded rail cuts trackside blight", G("b1") < G("b0") * 0.8, G("b0").toFixed(2) + " → " + G("b1").toFixed(2));
check("PC girders cut viaduct cost by ~30%", Math.abs(G("v1 / v0") - 0.7) < 0.01, G("v0") + " → " + G("v1"));
check("PC-girder viaducts blight less than a plain viaduct",
  Math.abs(G("srcPC / srcPlain") - 0.7) < 0.01, G("srcPlain").toFixed(3) + " → " + G("srcPC").toFixed(3));

// tunnels: shield tunnelling cuts bored-tunnel cost and time
G(`
  var path = []; for (let c = 22; c <= 26; c++) path.push(hexIdx(c, 12));
  for (const i of path) { st.hexes[i].track = null; }
  p.research.done.push("track_electrification");
  var t0 = trackPlanCost(st, p, path, { tunnel: true });
  p.research.done.push("shield_tbm");
  var t1 = trackPlanCost(st, p, path, { tunnel: true });
  var s0 = trackPlanCost(st, p, path, {});
`);
check("shield tunnelling cuts bored-tunnel cost", G("t1.cost") < G("t0.cost") * 0.8, G("t0.cost") + " → " + G("t1.cost"));
check("shield tunnelling shortens tunnel works", G("t1.days") < G("t0.days"), G("t0.days") + " → " + G("t1.days"));
check("surface track cost is unaffected by tunnelling R&D", G("s0.cost") === G("trackPlanCost(st, p, path, {}).cost"));

// wide doors: shorter dwell → faster effective speed over a stopping pattern
G(`
  var line = { co: p.id, path: corridor, stations: [1,2,3,4,5,6], _stops: [1,2,3,4,5,6] };
  var e0 = lineEffectiveSpeed(st, line, "emu_local");
  p.research.done.push("hi_accel", "wide_door");
  var e1 = lineEffectiveSpeed(st, line, "emu_local");
`);
check("wide-door cars raise effective line speed", G("e1") > G("e0") * 1.03, G("e0").toFixed(1) + " → " + G("e1").toFixed(1) + " km/h");

// save/load keeps the new techs
G(`
  var st2 = deserializeGame(JSON.parse(JSON.stringify(serializeGame(st))));
  var kept = ["cwr", "pc_viaduct", "shield_tbm", "wide_door"].every(k => researchDone(st2.companies[0], k));
`);
check("new techs survive save/load", G("kept"));

console.log(failures ? "\n" + failures + " R&D TREE FAILURE(S)" : "\nALL R&D TREE CHECKS PASSED");
process.exit(failures ? 1 : 0);
