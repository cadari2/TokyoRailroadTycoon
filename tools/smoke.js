/* =========================================================================
 * tools/smoke.js — Headless smoke test (Node). Plays a scripted opening
 * (buy land → lay track hex-by-hex → stations → line → train), then
 * fast-forwards decades verifying passengers, revenue, the year-end cost
 * levy, AI entry, events, era progression, land purchase offers, and
 * save/load round-trip. The simulated year is one 7-day week.
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
// advance N simulated days
vm.runInContext(`
  function ticks(n) {
    for (let d = 0; d < n; d++) {
      st.time.totalDays++; syncClock(st);
      if (st.time.day === 0) onNewYear(st);
      dailyEvents(st); dailyTick(st);
      for (const co of st.companies) if (co.alive && !co.isPlayer) aiTick(st, co);
    }
  }
`, ctx);

// ---- new game ----
vm.runInContext("var st = newGame(424242);", ctx);
const st = G("st");
check("map generated", st.hexes.length === 2500);
check("7-day year", CFG_get("DAYS_PER_YEAR") === 7);
function CFG_get(k) { return vm.runInContext("CFG." + k, ctx); }
check("spiral center is 0", st.hexes[25 * 50 + 25].spiral === 0);
check("player created", st.companies.length === 1 && st.companies[0].cash === 400000);
check("4 AI scheduled", st.pendingAI.length === 4);

// ---- scripted opening: lay track ONE HEX AT A TIME along a corridor ----
vm.runInContext(`
  var p = st.companies[0];
  var A = hexIdx(28, 25), B = hexIdx(37, 23);
  for (const i of [A, B]) { st.hexes[i].terrain = "grass"; st.hexes[i].track = null; st.hexes[i].owner = -1; }
  var route = planTrack(st, p, A, B).path;   // use the AI router just to pick test hexes
  var built = 0, quoteDays = 0;
  for (const i of route) {
    const q = buildTrackHex(st, p, i, true);
    if (q.ok) { quoteDays = q.days; if (buildTrackHex(st, p, i).ok) built++; }
  }
`, ctx);
check("hex-by-hex build accepted", G("built") >= 9, G("built") + " hexes queued");
check("build quote has days/cost", G("quoteDays") > 0);
check("cash deducted", G("st").companies[0].cash < 400000);
vm.runInContext("ticks(4);", ctx);   // 4 sim-days ≈ 208 calendar days
check("track built", G("route").every(i => G("st").hexes[i].track), "builds left: " + G("st").builds.length);

vm.runInContext(`var rA = buildStation(st, p, A), rB = buildStation(st, p, B); ticks(3);`, ctx);
check("stations built", G("rA").ok && G("rB").ok && !G("st").stations[0].building,
  (G("rA").msg || "") + (G("rB").msg || ""));

vm.runInContext(`var rl = createLine(st, p, rA.station.id, rB.station.id, "local");`, ctx);
check("line created", G("rl").ok, G("rl").msg);
vm.runInContext(`var rt = buyTrain(st, p, rl.line.id, "steam_local");`, ctx);
check("train bought", G("rt").ok, G("rt").msg);

// ---- run ~3 years (21 sim-days) of operations ----
vm.runInContext(`
  var paxSeen = 0, revSeen = 0;
  for (let d = 0; d < 21; d++) { ticks(1); paxSeen = Math.max(paxSeen, p.stats.pax); revSeen = Math.max(revSeen, p.stats.revToday); }
`, ctx);
check("passengers ride", G("paxSeen") > 50, G("paxSeen").toFixed(0) + " pax/day peak");
check("revenue earned", G("revSeen") > 0, "¥" + G("revSeen").toFixed(0) + "/sim-day peak");
check("year-end levy charged", (G("p").stats.lastLevy || {}).tax > 0 && G("p").stats.lastLevy.upkeep > 0,
  JSON.stringify(G("p").stats.lastLevy));
check("daily costs are zero (no maintenance)", G("p").stats.costToday === 0);

// holiday ridership lower than workday
vm.runInContext(`
  // align to a workday then a holiday and compare pax
  while (st.time.day !== 2) ticks(1);
  var workPax = p.stats.pax;
  while (st.time.day !== 5) ticks(1);
  var holPax = p.stats.pax;
`, ctx);
check("holiday ridership lower", G("holPax") < G("workPax"), G("holPax").toFixed(0) + " < " + G("workPax").toFixed(0));

// ---- fast-forward to 1930 ----
vm.runInContext(`while (st.time.year < 1930) ticks(1);`, ctx);
const st2 = G("st");
check("all 4 AI entered by Showa", st2.companies.length === 5 && st2.pendingAI.length === 0);
const aiWithTrack = st2.companies.filter(c => !c.isPlayer && call("companyTrackHexes", st2, c).length > 0).length;
check("AI built track", aiWithTrack >= 2, aiWithTrack + "/4 AI have track");
check("events fired", st2.events.log.length > 5, st2.events.log.length + " log entries");
check("era is Early Showa", call("eraOf", st2.time.year).key === "showa1");
check("player solvent", st2.companies[0].cash > 0, "cash " + Math.round(st2.companies[0].cash));
const majors = st2.events.majors;
check("major event cap respected", majors.filter(y => st2.time.year - y < 100).length <= 2, majors.join(","));

// ---- land purchase offer from another company ----
vm.runInContext(`
  var ai = st.companies.find(c => !c.isPlayer && c.alive);
  // find an AI-owned hex without infrastructure
  var parcel = ai.land.find(i => !st.hexes[i].track && !st.hexes[i].stations.length &&
    !st.builds.some(b => b.hexes.includes(i)));
  var askPrice = parcel !== undefined ? landOfferPrice(st, p, parcel) : null;
  var offerRes = parcel !== undefined ? offerBuyLand(st, p, parcel) : { ok: false, msg: "no parcel" };
`, ctx);
if (G("parcel") !== undefined && G("parcel") !== null) {
  check("offer price quoted at markup", G("askPrice") > 0);
  check("offer accepted, land transferred", G("offerRes").ok && G("st").hexes[G("parcel")].owner === 0, G("offerRes").msg);
} else check("offer test (no AI parcel available — skipped)", true);
vm.runInContext(`
  var infraParcel = -1;
  for (let i = 0; i < st.hexes.length; i++) {
    const h = st.hexes[i];
    if (h.track && h.owner >= 0 && !st.companies[h.owner].isPlayer) { infraParcel = i; break; }
  }
  var refusal = infraParcel >= 0 ? landOfferPrice(st, p, infraParcel) : null;
`, ctx);
check("infrastructure land not for sale", G("refusal") === null);

// ---- save / load round-trip ----
vm.runInContext(`var saveStr = exportSaveString(st); var st3 = importSaveString(saveStr);`, ctx);
const st3 = G("st3");
check("save round-trip companies", st3.companies.length === st2.companies.length);
check("save round-trip cash", Math.abs(st3.companies[0].cash - Math.round(st2.companies[0].cash)) < 1);
check("save round-trip track", call("companyTrackHexes", st3, st3.companies[0]).length ===
  call("companyTrackHexes", st2, st2.companies[0]).length);
check("save round-trip lines/trains", st3.lines.length === st2.lines.length && st3.trains.length === st2.trains.length);
const empty = call("importSaveString", '{"v":2}');
check("hostile/empty import safe", empty.companies.length === 0 && empty.hexes.length === 2500);
let badVer = false;
try { call("importSaveString", '{"v":1}'); } catch (e) { badVer = true; }
check("old save version rejected", badVer);

// ---- run loaded state to 2029 (full timeline, 7 ticks/year) ----
vm.runInContext(`st = st3; while (st.time.year <= 2028) ticks(1);`, ctx);
const stEnd = G("st");
check("reached Reiwa 10 end", stEnd.ended === true && stEnd.time.year === 2029);
check("companies survive timeline", stEnd.companies.filter(c => c.alive).length >= 1);
const m2 = stEnd.events.majors;
let capOK = true;
for (const y of m2) if (m2.filter(z => Math.abs(z - y) < 100).length > 2) capOK = false;
check("≤2 majors per 100y over full run", capOK, m2.join(","));
console.log("\nFinal standings:");
for (const c of stEnd.companies.filter(c => c.alive)) {
  console.log("  " + c.name + ": cash " + Math.round(c.cash) + ", avg pax/day " + Math.round(c.stats.paxAvg));
}

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
