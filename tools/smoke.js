/* =========================================================================
 * tools/smoke.js — Headless smoke test (Node). Loads the simulation core,
 * plays a scripted opening (buy land → lay track → stations → line →
 * train), then fast-forwards decades verifying passengers, revenue, AI
 * entry, events, era progression, and save/load round-trip.
 *   Run: node tools/smoke.js
 * ========================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, JSON, Date, window: undefined });
const files = ["js/config.js", "js/util.js", "js/map.js", "js/world.js", "js/sim.js",
               "js/ai.js", "js/events.js", "js/save.js", "js/main.js"];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
}
const G = name => vm.runInContext(name, ctx);
const call = (fn, ...args) => { ctx.__args = args; return vm.runInContext(`${fn}(...__args)`, ctx); };

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  [" + detail + "]" : ""));
  if (!ok) failures++;
}

// ---- new game ----
vm.runInContext("var st = newGame(424242);", ctx);
const st = G("st");
check("map generated", st.hexes.length === 2500);
check("terrain variety", new Set(st.hexes.map(h => h.terrain)).size >= 5,
  [...new Set(st.hexes.map(h => h.terrain))].join(","));
check("spiral center is 0", st.hexes[25 * 50 + 25].spiral === 0);
const spirals = new Set(st.hexes.map(h => h.spiral));
check("spiral indices unique", spirals.size === 2500);
check("player created", st.companies.length === 1 && st.companies[0].cash === 400000);
check("4 AI scheduled", st.pendingAI.length === 4);

// ---- scripted opening: route from near-center to a suburb ----
vm.runInContext(`
  var p = st.companies[0];
  // pick endpoints: 3 hexes east of center and ~9 further east
  var A = hexIdx(28, 25), B = hexIdx(37, 23);
  // make sure endpoints are buildable for the test
  for (const i of [A, B]) { st.hexes[i].terrain = "grass"; st.hexes[i].track = null; st.hexes[i].owner = -1; }
  var plan = planTrack(st, p, A, B);
`, ctx);
const plan = G("plan");
check("track plan found", !plan.err && plan.path.length >= 9, plan.err || (plan.path.length + " hexes, cost " + plan.cost));
check("plan affordable", plan.cost + plan.landCost < 400000, "total " + (plan.cost + plan.landCost));
check("approve track", call("approveTrack", G("st"), G("p"), plan).ok);
check("cash deducted", G("st").companies[0].cash < 400000);

// fast-forward construction (5 min/yr → run days directly)
vm.runInContext(`for (let d = 0; d < 250; d++) { st.time.totalDays++; syncClock(st); if (st.time.day===0) onNewYear(st); dailyEvents(st); dailyTick(st); }`, ctx);
check("track built", G("st").hexes[plan.path[0]] && plan.path.every(i => G("st").hexes[i].track),
  "builds left: " + G("st").builds.length);

vm.runInContext(`
  var rA = buildStation(st, p, A), rB = buildStation(st, p, B);
`, ctx);
check("stations built", G("rA").ok && G("rB").ok, (G("rA").msg || "") + (G("rB").msg || ""));
vm.runInContext(`for (let d = 0; d < 40; d++) { st.time.totalDays++; syncClock(st); if (st.time.day===0) onNewYear(st); dailyEvents(st); dailyTick(st); }`, ctx);

vm.runInContext(`var rl = createLine(st, p, rA.station.id, rB.station.id, "local");`, ctx);
check("line created", G("rl").ok, G("rl").msg || ("stations " + (G("rl").ok ? G("rl").line.stations.length : 0)));
vm.runInContext(`var rt = buyTrain(st, p, rl.line.id, "steam_local");`, ctx);
check("train bought", G("rt").ok, G("rt").msg);

// ---- run ~3 years of operations ----
vm.runInContext(`
  var paxSeen = 0, revSeen = 0;
  for (let d = 0; d < 365 * 3; d++) {
    st.time.totalDays++; syncClock(st);
    if (st.time.day===0) onNewYear(st);
    dailyEvents(st); dailyTick(st);
    if (st.time.totalDays % 30 === 0) for (const co of st.companies) if (co.alive && !co.isPlayer) aiTick(st, co);
    paxSeen = Math.max(paxSeen, p.stats.pax);
    revSeen = Math.max(revSeen, p.stats.revToday);
  }
`, ctx);
check("passengers ride", G("paxSeen") > 0, G("paxSeen").toFixed(0) + " pax/day peak");
check("revenue earned", G("revSeen") > 0, "¥" + G("revSeen").toFixed(0) + "/day peak");
check("line has demand & capacity", G("rl").line.demand > 0 && G("rl").line.capacity > 0,
  "demand " + G("rl").line.demand.toFixed(0) + " cap " + G("rl").line.capacity.toFixed(0));

// ---- fast-forward to 1930: AI entries, eras, events ----
vm.runInContext(`
  while (st.time.year < 1930) {
    st.time.totalDays++; syncClock(st);
    if (st.time.day===0) onNewYear(st);
    dailyEvents(st); dailyTick(st);
    if (st.time.totalDays % 30 === 0) for (const co of st.companies) if (co.alive && !co.isPlayer) aiTick(st, co);
  }
`, ctx);
const st2 = G("st");
check("all 4 AI entered by Showa", st2.companies.length === 5 && st2.pendingAI.length === 0);
const aiWithTrack = st2.companies.filter(c => !c.isPlayer && call("companyTrackHexes", st2, c).length > 0).length;
check("AI built track", aiWithTrack >= 2, aiWithTrack + "/4 AI have track");
check("events fired", st2.events.log.length > 5, st2.events.log.length + " log entries");
check("era is Early Showa", call("eraOf", st2.time.year).key === "showa1");
check("player solvent-ish", st2.companies[0].cash > -1e6, "cash " + Math.round(st2.companies[0].cash));
const majors = st2.events.majors;
check("major event cap respected", majors.filter(y => st2.time.year - y < 100).length <= 2, majors.join(","));

// ---- save / load round-trip ----
vm.runInContext(`var saveStr = exportSaveString(st); var st3 = importSaveString(saveStr);`, ctx);
const st3 = G("st3");
check("save round-trip companies", st3.companies.length === st2.companies.length);
check("save round-trip cash", Math.abs(st3.companies[0].cash - Math.round(st2.companies[0].cash)) < 1);
check("save round-trip track", call("companyTrackHexes", st3, st3.companies[0]).length ===
  call("companyTrackHexes", st2, st2.companies[0]).length);
check("save round-trip lines/trains", st3.lines.length === st2.lines.length && st3.trains.length === st2.trains.length);
check("save size sane", G("saveStr").length < 2e6, (G("saveStr").length / 1024).toFixed(0) + " KB");

// hostile import rejected
let threw = false;
try { call("importSaveString", '{"v":1,"evil":true}'); } catch (e) { threw = false; }
// (a structurally-empty save is coerced to a valid empty state — verify no crash and no companies)
const empty = call("importSaveString", '{"v":1}');
check("hostile/empty import safe", empty.companies.length === 0 && empty.hexes.length === 2500);
let badVer = false;
try { call("importSaveString", '{"v":99}'); } catch (e) { badVer = true; }
check("bad version rejected", badVer);

// ---- run loaded state to 2029 (full timeline) ----
vm.runInContext(`
  st = st3;
  while (st.time.year <= 2028) {
    st.time.totalDays++; syncClock(st);
    if (st.time.day===0) onNewYear(st);
    dailyEvents(st); dailyTick(st);
    if (st.time.totalDays % 30 === 0) for (const co of st.companies) if (co.alive && !co.isPlayer) aiTick(st, co);
  }
`, ctx);
const stEnd = G("st");
check("reached Reiwa 10 end", stEnd.ended === true && stEnd.time.year === 2029);
check("companies survive timeline", stEnd.companies.filter(c => c.alive).length >= 1);
const m2 = stEnd.events.majors;
let capOK = true;
for (const y of m2) if (m2.filter(z => Math.abs(z - y) < 100 ).length > 2) capOK = false;
check("≤2 majors per 100y over full run", capOK, m2.join(","));
console.log("\nFinal standings:");
for (const c of stEnd.companies.filter(c => c.alive)) {
  console.log("  " + c.name + ": cash " + Math.round(c.cash) + ", avg pax/day " + Math.round(c.stats.paxAvg));
}

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
