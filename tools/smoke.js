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
const files = ["js/config.js", "js/util.js", "data/machinames.js", "data/londonnames.js", "data/nycnames.js", "data/melbnames.js", "js/map.js", "js/world.js", "js/sim.js",
               "js/hr.js", "js/ai.js", "js/events.js", "js/rd.js", "js/save.js", "js/main.js"];
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
check("12-month year", CFG_get("DAYS_PER_YEAR") === 12);
function CFG_get(k) { return vm.runInContext("CFG." + k, ctx); }
check("spiral center is 0", st.hexes[25 * 50 + 25].spiral === 0);
check("player created with default-class funds", st.companies.length === 1 &&
  st.companies[0].cash === CFG_get("PLAYER_CLASSES").zaibatsu.startCash, "" + st.companies[0].cash);
check("default AI roster scheduled", st.pendingAI.length === CFG_get("AI_COUNT"), st.pendingAI.length + " scheduled");

// ---- hex names: real Shōwa-era 町名, palace centered, dense core unique ----
check("center hex named for the Imperial Palace", st.hexes[25 * 50 + 25].name === "皇居 (Kokyo)", st.hexes[25 * 50 + 25].name);

// ---- Imperial Palace grounds (center + ring up to the moat) stay dry land
// in every seed, even though water/mountains are fine elsewhere on the map ----
const _centerIdx = G("hexIdx(CFG.CENTER.col, CFG.CENTER.row)");
const _palaceRing = G(`hexesWithin(${_centerIdx}, 1)`);
check("palace grounds are grass in the starting seed",
  _palaceRing.every(i => st.hexes[i].terrain === "grass"),
  _palaceRing.map(i => st.hexes[i].terrain).join(","));
let _palaceBad = 0;
for (const seed of [4, 9, 11, 14, 20, 3, 6, 7]) {   // previously confirmed to flood the palace
  const hexes = call("generateMap", seed);
  for (const i of _palaceRing) if (hexes[i].terrain !== "grass") _palaceBad++;
}
check("palace grounds stay grass across previously-flooded seeds", _palaceBad === 0, _palaceBad + " bad hexes");
check("every hex has a place name", st.hexes.every(h => !!h.name), st.hexes.filter(h => !h.name).length + " unnamed");
const _names = st.hexes.map(h => h.name);
const _nameAt = (c, r) => st.hexes[r * 50 + c].name;
// no synthetic labels: no 丁目 block numbers
check("no name uses a 丁目 block number", !_names.some(n => n.includes("丁目")),
  _names.find(n => n.includes("丁目")) || "none");
// every displayed name is a genuine catalogued machi/district, or (on the
// sparse periphery, once a ward's pool is spent) a directional/新-prefixed
// variant of one — the only synthetic disambiguator v0.5 permits.
const _allowed = new Set(["皇居 (Kokyo)", "東京 (Tokyo)"]);
for (const g of G("TOKYO_MACHI")) for (const [k, r] of g.n) _allowed.add(k + " (" + r + ")");
for (const a of G("tokyoAreas()")) _allowed.add(a.name);
// a name is real if catalogued directly, or is <prefix>+catalogued
const _PFX = [["新", "Shin-"], ["北", "Kita-"], ["南", "Minami-"], ["東", "Higashi-"], ["西", "Nishi-"]];
const _isReal = n => {
  if (_allowed.has(n)) return true;
  const m = /^(.+) \((.+)\)$/.exec(n); if (!m) return false;
  for (const [kp, rp] of _PFX)
    if (m[1].startsWith(kp) && m[2].startsWith(rp) &&
        _allowed.has(m[1].slice(kp.length) + " (" + m[2].slice(rp.length) + ")")) return true;
  return false;
};
check("every hex name is a real catalogued place name (or a prefixed variant)",
  _names.every(_isReal), _names.find(n => !_isReal(n)) || "all real");
const KANJI_ROMAJI_RE = /^[^\x00-\x7F]+ \([A-Za-z][A-Za-z .'-]*\)$/;
check("every place name pairs kanji with romaji", [...new Set(_names)].every(n => KANJI_ROMAJI_RE.test(n)),
  [...new Set(_names)].find(n => !KANJI_ROMAJI_RE.test(n)) || "all ok");
const _holdoutNames = G("HOLDOUT_NAMES");
check("every holdout-family name pairs kanji with romaji", _holdoutNames.every(n => KANJI_ROMAJI_RE.test(n)),
  _holdoutNames.find(n => !KANJI_ROMAJI_RE.test(n)) || (_holdoutNames.length + " names ok"));
// known historical machi are present and placed sensibly
const _findHex = name => st.hexes.find(h => h.name === name);
check("historical machi present (木挽町, 大伝馬町, 須田町, 麹町)",
  ["木挽町 (Kobikicho)", "日本橋 (Nihonbashi)", "須田町 (Sudacho)", "麹町 (Kojimachi)"]
    .every(n => _allowed.has(n)) && !!_findHex("木挽町 (Kobikicho)"));
const _kobiki = _findHex("木挽町 (Kobikicho)");
check("木挽町 sits south-east of the palace (the Ginza/Kyobashi side)",
  _kobiki && _kobiki.col >= 25 && _kobiki.row >= 25, _kobiki ? _kobiki.col + "," + _kobiki.row : "missing");
// v0.5: EVERY land hex carries a unique name — no two cells alike anywhere on
// the board, on any seed (pools + directional/新 overflow guarantee it).
let _dupSeed = null, _dupName = null;
for (const seed of [424242, 1, 7, 13, 88, 2026, 99999, 31415]) {
  const hxs = call("generateMap", seed);
  const seen = new Set();
  for (const h of hxs) {
    if (seen.has(h.name)) { _dupSeed = seed; _dupName = h.name; break; }
    seen.add(h.name);
  }
  if (_dupSeed !== null) break;
}
check("no duplicate hex names on any seed", _dupSeed === null,
  _dupSeed === null ? "8 seeds all unique" : "seed " + _dupSeed + " repeats " + _dupName);
check("the board carries hundreds of distinct real machi", new Set(_names).size >= 900,
  new Set(_names).size + " distinct names");
check("west of the palace lands in a west-side machi",
  ["信濃町", "四谷", "箪笥町", "大久保", "角筈", "柏木", "渋谷", "代々木", "市谷", "若松町", "中野", "南元町", "須賀町", "新宿", "内藤"]
    .some(b => _nameAt(18, 25).includes(b)), _nameAt(18, 25));
check("due north of the palace lands in a north-side machi",
  ["本郷", "湯島", "小石川", "駒込", "白山", "春日町", "真砂町", "森川町", "千駄木", "根津"]
    .some(b => _nameAt(25, 21).includes(b)), _nameAt(25, 21));
vm.runInContext("var _nameSave = importSaveString(exportSaveString(st));", ctx);
check("hex names regenerate identically through save/load",
  G("_nameSave").hexes.every((h, i) => h.name === _names[i]));

// ---- player classes (v0.5): funds, credit terms, land grants ----
{
  const CLASSES = CFG_get("PLAYER_CLASSES");
  vm.runInContext(`
    var stKaz = newGame(111222, { aiCount: 0, playerClass: "kazoku" });
    var stHei = newGame(111222, { aiCount: 0, playerClass: "heimin" });
    var stBadCls = newGame(111222, { aiCount: 0, playerClass: "shogun" });
  `, ctx);
  const kaz = G("stKaz").companies[0], hei = G("stHei").companies[0];
  check("kazoku start cash", kaz.cash === CLASSES.kazoku.startCash, "" + kaz.cash);
  check("heimin start cash", hei.cash === CLASSES.heimin.startCash, "" + hei.cash);
  check("class recorded on state & company", G("stKaz").playerClass === "kazoku" && kaz.playerClass === "kazoku");
  check("credit terms follow the class", kaz.rate === CLASSES.kazoku.rate &&
    kaz.creditFactor === CLASSES.kazoku.creditFactor &&
    hei.rate === CLASSES.heimin.rate, kaz.rate + "/" + hei.rate);
  check("loan state starts clean", kaz.debt === 0 && kaz.taxArrears === 0 && kaz.delinquentYears === 0);
  check("unknown class falls back to default", G("stBadCls").playerClass === CFG_get("DEFAULT_PLAYER_CLASS"));
  // land grants: kazoku two plots (4–6 hexes, one near the palace), zaibatsu
  // one central plot (2–3), heimin none — all on grantable dry land
  check("kazoku holds two granted plots (4-6 hexes)", kaz.land.length >= 4 && kaz.land.length <= 6, kaz.land.length + " hexes");
  check("heimin holds no land", hei.land.length === 0, hei.land.length + " hexes");
  const zai = st.companies[0];
  check("zaibatsu holds one central plot (2-3 hexes)", zai.land.length >= 2 && zai.land.length <= 3, zai.land.length + " hexes");
  const centerI = G("hexIdx(CFG.CENTER.col, CFG.CENTER.row)");
  const kazDists = kaz.land.map(i => call("hexDist", i, centerI));
  const RINGS = CFG_get("GRANT_RINGS");
  check("kazoku has a plot near the palace and one further out",
    kazDists.some(d => d <= RINGS.palace[1] + 1) && kazDists.some(d => d >= RINGS.outer[0] - 1),
    kazDists.join(","));
  check("granted hexes are owned dry land", kaz.land.every(i => {
    const h = G("stKaz").hexes[i];
    return h.owner === 0 && !CFG_get("TERRAIN")[h.terrain].bridge && !CFG_get("TERRAIN")[h.terrain].water;
  }));
  // credit limit helper exists and scales with the class factor
  vm.runInContext("var _clKaz = creditLimitOf(stKaz, stKaz.companies[0]), _clHei = creditLimitOf(stHei, stHei.companies[0]);", ctx);
  check("credit limit positive & class-scaled", G("_clKaz") > 0 && G("_clHei") > 0 && G("_clKaz") > G("_clHei"),
    G("_clKaz") + " vs " + G("_clHei"));
  // save round-trip of the v9 fields
  vm.runInContext("var stKazRT = importSaveString(exportSaveString(stKaz));", ctx);
  const rt = G("stKazRT");
  check("class/credit fields survive save/load", rt.playerClass === "kazoku" &&
    rt.companies[0].playerClass === "kazoku" && rt.companies[0].rate === CLASSES.kazoku.rate &&
    rt.companies[0].land.length === kaz.land.length && rt.campaign === "tokyo");
  // clean break: a pre-v9 save is declined with the new-game message
  let declined = "";
  try { call("importSaveString", JSON.stringify({ v: 8, seed: 1 })); }
  catch (e) { declined = e.message; }
  check("pre-v0.5 saves are declined with a friendly message",
    declined.includes("start a new game"), declined.slice(0, 60));
}

// ---- start-screen options: AI count + per-AI difficulty ----
vm.runInContext(`
  var stCustom = newGame(13579, { aiCount: 2, aiDifficulties: ["easy", "hard"] });
  var stZero = newGame(24680, { aiCount: 0 });
  var stClamp = newGame(99999, { aiCount: 99, aiDifficulties: ["nonsense"] });
`, ctx);
check("custom AI count honored", G("stCustom").pendingAI.length === 2, "" + G("stCustom").pendingAI.length);
check("per-AI difficulty tagged on pendingAI", G("stCustom").pendingAI[0].difficulty === "easy" && G("stCustom").pendingAI[1].difficulty === "hard",
  JSON.stringify(G("stCustom").pendingAI.map(p => p.difficulty)));
check("AI count of 0 schedules no rivals", G("stZero").pendingAI.length === 0);
check("AI count clamped to roster size; bad difficulty defaults to normal (late windows default hard)",
  G("stClamp").pendingAI.length === CFG_get("AI.entryWindows").length &&
  G("stClamp").pendingAI.every(p => p.difficulty === (p.year >= CFG_get("AI.lateEntryFrom") ? "hard" : "normal")),
  G("stClamp").pendingAI.length + " " + JSON.stringify(G("stClamp").pendingAI.map(p => p.difficulty)));

// advance stCustom until both scheduled AIs have entered, then check difficulty effects
vm.runInContext(`
  for (let y = 0; y < 60 && stCustom.pendingAI.length > 0; y++) {
    stCustom.time.totalDays += 7; syncClock(stCustom); onNewYear(stCustom);
  }
  var aiEasy = stCustom.companies.find(c => c.ai && c.ai.difficulty === "easy");
  var aiHard = stCustom.companies.find(c => c.ai && c.ai.difficulty === "hard");
`, ctx);
check("both difficulty-tagged AI entered", !!G("aiEasy") && !!G("aiHard"));
check("ai.difficulty persisted on company", G("aiEasy").ai.difficulty === "easy" && G("aiHard").ai.difficulty === "hard");
check("harder AI starts with more cash (cashMult)", G("aiHard").cash > G("aiEasy").cash,
  "easy=" + Math.round(G("aiEasy").cash) + " hard=" + Math.round(G("aiHard").cash));

// difficulty round-trips through save/load
vm.runInContext(`
  var customSave = exportSaveString(stCustom); var stCustomLoaded = importSaveString(customSave);
  var aiEasyLoaded = stCustomLoaded.companies.find(c => c.ai && c.ai.difficulty === "easy");
  var aiHardLoaded = stCustomLoaded.companies.find(c => c.ai && c.ai.difficulty === "hard");
`, ctx);
check("AI difficulty round-trips through save/load", !!G("aiEasyLoaded") && !!G("aiHardLoaded"));

// ---- scripted opening: lay track ONE HEX AT A TIME along a corridor ----
vm.runInContext(`
  var p = st.companies[0];
  var A = hexIdx(28, 25), B = hexIdx(37, 23);
  for (const i of [A, B]) { st.hexes[i].terrain = "grass"; st.hexes[i].track = null; st.hexes[i].owner = -1; }
  var route = planTrack(st, p, A, B).path;   // use the AI router just to pick test hexes
  p.cash = 6e6;   // fund the mechanics script (v0.4 prices; balance itself is tools/balance.js's job)
  var cashBeforeBuild = p.cash;
  var built = 0, quoteDays = 0;
  for (const i of route) {
    const q = buildTrackHex(st, p, i, true);
    if (q.ok) { quoteDays = q.days; if (buildTrackHex(st, p, i).ok) built++; }
  }
`, ctx);
check("hex-by-hex build accepted", G("built") >= 9, G("built") + " hexes queued");
check("build quote has days/cost", G("quoteDays") > 0);
check("cash deducted", G("st").companies[0].cash < G("cashBeforeBuild"));

// ---- skip-ahead units: calendar days (queue display) vs simulated days (fast-forward) ----
vm.runInContext(`
  var calDays0 = calendarDaysToNextCompletion(st, p);
  var simDays0 = daysToNextCompletion(st, p);
  var buildSpeed0 = Math.max(0.1, p._buildSpeed || 1);
  var expCal0 = Math.min(...st.builds.filter(b => b.co === p.id)
    .map(j => j.hexes.length * j.daysPerHex - j.progress));
`, ctx);
check("calendar days remaining = least of the queued jobs' day totals (fresh jobs)",
  Math.abs(G("calDays0") - G("expCal0")) < 1e-9, G("calDays0") + " cal-days");
// The naive single-job formula (unlimited crews) is a LOWER bound on the skip
// size; daysToNextCompletion runs the real crew-limited FIFO, so when the
// cheapest queued hex isn't among the first crews it can legitimately take a
// day or two longer. Assert the skip lands in [naive, naive+2].
{
  const naive = Math.max(1, Math.ceil(G("calDays0") / (CFG_get("CAL_DAYS_PER_SIM_DAY") * G("buildSpeed0"))));
  check("skip button's simulated months ≈ ceil(calendar days / (cal-per-month × build speed)) (crew-limited FIFO, ±2)",
    G("simDays0") >= naive && G("simDays0") <= naive + 2,
    "sim=" + G("simDays0") + " naive=" + naive + " cal=" + G("calDays0") + " speed=" + G("buildSpeed0").toFixed(3));
}
check("a multi-hex job takes far more calendar days than the simulated skip count",
  G("simDays0") < G("calDays0"), "sim=" + G("simDays0") + " cal=" + G("calDays0"));

// skip ahead until every queued track job finishes (crew-limited: only
// CFG.TRACK.crewsByEra jobs progress at once, so queued hexes wait their
// turn; tunnels/bridges take longer, so loop to next completion)
vm.runInContext(`
  var guard = 0;
  while (st.builds.some(b => b.co === p.id) && guard++ < 400) fastForwardDays(st, daysToNextCompletion(st, p) || 1);
`, ctx);
check("track built", G("route").every(i => G("st").hexes[i].track), "builds left: " + G("st").builds.length);

// ---- skip-ahead correctness with several simultaneous jobs of differing
// remaining time (run on an EMPTY queue so all three fit within the era's
// construction crews and progress in parallel): the skip size must be the
// LEAST remaining among them, and every other still-pending job must drop
// by that exact same amount ----
vm.runInContext(`
  var _h1 = hexIdx(5, 5), _h2 = hexIdx(6, 5), _h3 = hexIdx(7, 5);
  for (const hi of [_h1, _h2, _h3]) { st.hexes[hi].terrain = "grass"; st.hexes[hi].track = null; st.hexes[hi].stations = []; }
  var _skipJobs = [
    { kind: "track", co: p.id, hexes: [_h1], done: 0, daysPerHex: 10, progress: 0, gauge: p.gauge, elec: false },
    { kind: "track", co: p.id, hexes: [_h2], done: 0, daysPerHex: 50, progress: 0, gauge: p.gauge, elec: false },
    { kind: "track", co: p.id, hexes: [_h3], done: 0, daysPerHex: 130, progress: 0, gauge: p.gauge, elec: false },
  ];
  for (const j of _skipJobs) st.builds.push(j);
  var _remOf = j => j.hexes.length * j.daysPerHex - j.progress;
  var _remBefore = _skipJobs.map(_remOf);
  var _calNearest = calendarDaysToNextCompletion(st, p);
  var _simSkip = daysToNextCompletion(st, p);
  var _calApplied = calendarDaysAppliedBySkip(p, _simSkip);
  fastForwardDays(st, _simSkip);
  var _nearestDone = !st.builds.includes(_skipJobs[0]);
  var _othersStillQueued = st.builds.includes(_skipJobs[1]) && st.builds.includes(_skipJobs[2]);
  // queue ETAs shown to the player are work-days ÷ build speed; each must
  // drop by exactly the skip's advertised calendar days (the calendar time
  // the clock actually advances)
  var _spd = Math.max(0.1, p._buildSpeed || 1);
  var _drop1 = (_remBefore[1] - _remOf(_skipJobs[1])) / _spd, _drop2 = (_remBefore[2] - _remOf(_skipJobs[2])) / _spd;
  var _dropMatches = Math.abs(_drop1 - _calApplied) < 1e-6 && Math.abs(_drop2 - _calApplied) < 1e-6;
  var _detail = "applied=" + _calApplied.toFixed(3) + " drop1=" + _drop1.toFixed(3) + " drop2=" + _drop2.toFixed(3);
`, ctx);
check("skip size picks the job with the least days remaining (10)",
  G("_calNearest") === 10, "" + G("_calNearest"));
check("one skip completes only the nearest job, leaving the others queued",
  G("_nearestDone") && G("_othersStillQueued"));
check("every still-pending job's displayed ETA drops by exactly the skip's applied calendar days",
  G("_dropMatches"), G("_detail"));
// resolve the synthetic jobs so they don't linger into later checks
vm.runInContext(`
  var _g = 0;
  while ((st.builds.includes(_skipJobs[1]) || st.builds.includes(_skipJobs[2])) && _g++ < 20) {
    fastForwardDays(st, daysToNextCompletion(st, p) || 1);
  }
`, ctx);
check("synthetic skip-test jobs fully resolved",
  !G("st").builds.some(b => b === G("_skipJobs")[1] || b === G("_skipJobs")[2]));

// build the two terminal stations, then skip ahead until they finish opening
vm.runInContext(`
  var rA = buildStation(st, p, A), rB = buildStation(st, p, B);
  var sguard = 0;
  while (st.stations.some(s => s.co === p.id && s.alive && s.building) && sguard++ < 60) fastForwardDays(st, daysToNextCompletion(st, p) || 1);
`, ctx);
check("stations built", G("rA").ok && G("rB").ok && !G("st").stations[0].building,
  (G("rA").msg || "") + (G("rB").msg || ""));

vm.runInContext(`var rl = createLine(st, p, rA.station.id, rB.station.id, "local");`, ctx);
check("line created", G("rl").ok, G("rl").msg);
vm.runInContext(`var rt = buyTrain(st, p, rl.line.id, "steam_local");`, ctx);
check("train bought", G("rt").ok, G("rt").msg);
vm.runInContext(`var rt2 = buyTrain(st, p, rl.line.id, "steam_local");`, ctx);
check("2nd train bought", G("rt2").ok, G("rt2").msg);

// ---- depots: cost comparison, build, and skip-ahead (fast-forward) to completion ----
vm.runInContext(`
  var depotHex = route[1];
  var costDepotOnly = depotCost(st, depotHex, false);
  var costDepotStation = depotCost(st, depotHex, true);
  var rd = buildDepot(st, p, depotHex, false);
`, ctx);
check("depot+station costs more than depot-only", G("costDepotStation") > G("costDepotOnly"));
check("depot construction started", G("rd").ok, G("rd").msg);
check("depot flagged isDepot (not depotAsStation)", G("rd").ok &&
  G("st").stations[G("rd").station.id].isDepot && !G("st").stations[G("rd").station.id].depotAsStation);

vm.runInContext(`
  var daysLeft = daysToNextCompletion(st, p);
  var dguard = 0;
  while (st.stations[rd.station.id].building > 0 && dguard++ < 40) fastForwardDays(st, daysToNextCompletion(st, p) || 1);
  var daysLeftAfter = daysToNextCompletion(st, p);
`, ctx);
check("daysToNextCompletion > 0 while depot is building", G("daysLeft") > 0, G("daysLeft") + " days");
check("skip-ahead completes the depot", G("st").stations[G("rd").station.id].building === 0);
check("daysToNextCompletion is 0 once nothing is under construction", G("daysLeftAfter") === 0, "" + G("daysLeftAfter"));

// ---- deleting a line stores its trains instead of scrapping them ----
vm.runInContext(`
  var trainA = rt.train.id, trainB = rt2.train.id, lineIdOld = rl.line.id;
  removeLine(st, p, lineIdOld);
`, ctx);
check("trains survive line deletion (not scrapped)", G("st").trains[G("trainA")].alive && G("st").trains[G("trainB")].alive);
check("trains marked stored, detached from line", G("st").trains[G("trainA")].stored && G("st").trains[G("trainA")].line === -1 &&
  G("st").trains[G("trainB")].stored && G("st").trains[G("trainB")].line === -1);
check("deleted line has no trains", G("st").lines[G("lineIdOld")].trains.length === 0);

// ---- recreate a line on the same corridor and reassign one stored train to it ----
vm.runInContext(`
  var rl2 = createLine(st, p, rA.station.id, rB.station.id, "local");
  var raAssign = assignStoredTrain(st, p, trainA, rl2.line.id);
`, ctx);
check("new line created on same corridor", G("rl2").ok, G("rl2").msg);
check("stored train reassigned to new line", G("raAssign").ok, G("raAssign").msg);
check("reassigned train active on new line", !G("st").trains[G("trainA")].stored &&
  G("st").trains[G("trainA")].line === G("rl2").line.id &&
  G("st").lines[G("rl2").line.id].trains.includes(G("trainA")));

// ---- scrap the other stored train for a partial refund ----
vm.runInContext(`
  var cashBeforeScrap = p.cash;
  var scrapRes = scrapStoredTrain(st, p, trainB);
`, ctx);
check("scrap refunds part of train cost", G("scrapRes").ok && G("scrapRes").refund > 0, JSON.stringify(G("scrapRes")));
check("scrapped train no longer alive", !G("st").trains[G("trainB")].alive);
check("cash increased by refund", Math.abs(G("st").companies[0].cash - (G("cashBeforeScrap") + G("scrapRes").refund)) < 0.01);

// ---- new features: land-price modifier, private holdouts, train resale, speed ----
vm.runInContext(`
  var _pm = CFG.LAND.priceMult, _testHex = hexIdx(30, 25);
  var _priceWith = landPrice(st, _testHex);
  CFG.LAND.priceMult = 1;
  var _priceBase = landPrice(st, _testHex);
  CFG.LAND.priceMult = _pm;
`, ctx);
check("normal-difficulty land prices raised 10% over base",
  Math.abs(G("_priceWith") / G("_priceBase") - 1.10) < 0.002, G("_priceBase") + " → " + G("_priceWith"));

vm.runInContext(`
  var _holdouts = [];
  for (var i = 0; i < st.hexes.length; i++) if (st.hexes[i].owner === -2) _holdouts.push(i);
  var _hCenterClear = st.hexes.every((h, i) => !(h.owner === -2 && hexDist(i, hexIdx(25, 25)) <= 3));
  var _hNamed = _holdouts.every(i => !!st.hexes[i].holdout);
  var _buyHoldout = _holdouts.length ? buyLand(st, p, _holdouts[0]) : { ok: true };
  var _offerHoldout = _holdouts.length ? landOfferPrice(st, p, _holdouts[0]) : null;
`, ctx);
check("some parcels are private holdouts (never sell)", G("_holdouts").length > 0, G("_holdouts").length + " holdout hexes");
check("holdouts kept clear of the immediate center", G("_hCenterClear"));
check("every holdout names its private owner", G("_hNamed"));
check("holdout refuses sale at any price (buyLand)", !G("_buyHoldout").ok, G("_buyHoldout").msg);
check("holdout has no offer price", G("_offerHoldout") === null);

vm.runInContext(`
  var _vNew = trainResaleValue(st, { type: "steam_local", bought: st.time.year });
  var _vOld = trainResaleValue(st, { type: "steam_local", bought: st.time.year - 40 });
`, ctx);
check("older rolling stock resells for less (but > 0)", G("_vOld") < G("_vNew") && G("_vOld") > 0, G("_vOld") + " < " + G("_vNew"));

vm.runInContext(`
  var _extra = buyTrain(st, p, rl2.line.id, "steam_local");
  var _cashB4Sell = p.cash;
  var _sellTr = sellTrain(st, p, _extra.train.id);
`, ctx);
check("active train sold for resale value", G("_sellTr").ok && G("_sellTr").refund > 0, JSON.stringify(G("_sellTr")));
check("sold train detached from line + cash credited",
  !G("st").lines[G("rl2").line.id].trains.includes(G("_extra").train.id) &&
  Math.abs(G("st").companies[0].cash - (G("_cashB4Sell") + G("_sellTr").refund)) < 0.01);

check("game-speed presets defined (½× / 1× / 2× / 5×)",
  ["katatsumuri", "yukkuri", "sakusaku", "isoge"].map(k => CFG_get("SPEEDS").find(s => s.key === k).mult).join(",") === "0.5,1,2,5" &&
  CFG_get("DEFAULT_SPEED") === "yukkuri");

// ---- debug mode: skip ahead to a simulated mid-game year ----
// Clone the in-progress game (player already owns land/track/stations/a
// running line) so the debug skip has real holdings to simulate, without
// disturbing `st` for later checks.
vm.runInContext(`
  var stDbg = importSaveString(exportSaveString(st));
  var dbgPlayer = stDbg.companies.find(c => c.isPlayer);
  var dbgFoundedBefore = dbgPlayer.founded;
  var dbgCashBefore = dbgPlayer.cash;
  fastForwardToYear(stDbg, 1950);
`, ctx);
check("debug skip lands exactly on the target year", G("stDbg").time.year === 1950, "" + G("stDbg").time.year);
check("debug skip does not reset the player's founding year or cash",
  G("dbgPlayer").founded === G("dbgFoundedBefore"), "" + G("dbgPlayer").founded);
check("debug skip simulates (grows) the player's own holdings while away",
  G("dbgPlayer").cash > G("dbgCashBefore"), G("dbgCashBefore") + " → " + G("dbgPlayer").cash);
check("debug skip logs a DEBUG event", G("stDbg").events.log.some(e => e.text.includes("DEBUG: skipped ahead to 1950")));
check("debug skip lets the rest of the world develop too",
  G("stDbg").companies.length > 1 &&
  G("stDbg").pendingAI.every(p => p.year > 1950),   // v0.5.6: late entrants may still be pending
  G("stDbg").companies.length + " companies, " + G("stDbg").pendingAI.length + " pending AI");

vm.runInContext(`
  var stNoop = newGame(888888, { aiCount: 0 });
  fastForwardToYear(stNoop, CFG.START_YEAR);
  fastForwardToYear(stNoop, CFG.START_YEAR - 5);
`, ctx);
check("debug skip is a no-op for a target year at/before the start",
  G("stNoop").time.totalDays === 0 && G("stNoop").time.year === CFG_get("START_YEAR"),
  "totalDays=" + G("stNoop").time.totalDays);

vm.runInContext(`var stDbgLoad = importSaveString(exportSaveString(stDbg));`, ctx);
check("debug-skip state survives a save/load round-trip",
  G("stDbgLoad").time.totalDays === G("stDbg").time.totalDays &&
  G("stDbgLoad").companies.find(c => c.isPlayer).founded === G("dbgFoundedBefore"));

// ---- station defaults + bulk commerce development ----
// Clone again so building stations / developing commerce here doesn't affect
// `st`'s cash/stations for the operations/timeline checks below.
vm.runInContext(`
  var stSD = importSaveString(exportSaveString(st));
  var pSD = stSD.companies.find(c => c.isPlayer);
  var sdBuildHex = route.find(i => !stSD.hexes[i].stations.length);
  var sdDefaultsOk = pSD.stationDefaults.cars === 3;
  var sdBaseCost = stationCost(stSD, sdBuildHex);
  var sdCostAtDefault = stationBuildCost(stSD, pSD, sdBuildHex);

  pSD.stationDefaults = { cars: 1 };
  var sdCostShorter = stationBuildCost(stSD, pSD, sdBuildHex);

  // depot+station also picks up stationDefaults; a plain depot never does
  var depotBaseAsStation = depotCost(stSD, sdBuildHex, true);
  var depotBasePlain = depotCost(stSD, sdBuildHex, false);
  var depotCostShorter = depotBuildCost(stSD, pSD, sdBuildHex, true);
  var depotCostPlain = depotBuildCost(stSD, pSD, sdBuildHex, false);

  pSD.stationDefaults = { cars: 3 };
  pSD.cash = 1e9;
  var sdBuild = buildStation(stSD, pSD, sdBuildHex);
  var sdBuiltOk = sdBuild.ok && sdBuild.station.cars === 3;
`, ctx);
check("new companies default to 3-car stations", G("sdDefaultsOk"));
check("stationBuildCost matches base cost at the 3-car default",
  G("sdCostAtDefault") === G("sdBaseCost"), G("sdCostAtDefault") + " vs " + G("sdBaseCost"));
check("shorter platform default lowers the build cost, floored at 25% of base",
  G("sdCostShorter") < G("sdBaseCost") && G("sdCostShorter") >= Math.round(G("sdBaseCost") * 0.25),
  G("sdBaseCost") + " → " + G("sdCostShorter"));
check("depotBuildCost matches depotCost for depot-only (ignores stationDefaults)",
  G("depotCostPlain") === G("depotBasePlain"));
check("depotBuildCost differs from depotCost for depot+station once defaults change",
  G("depotCostShorter") !== G("depotBaseAsStation"), G("depotBaseAsStation") + " → " + G("depotCostShorter"));
check("new station is built pre-configured to stationDefaults",
  G("sdBuiltOk"), JSON.stringify(G("sdBuild")));

vm.runInContext(`
  fastForwardToYear(stSD, 1950);
  var sdCap1950 = maxPlatformCars(stSD.time.year);
  var sIdA = rA.station.id, sIdB = rB.station.id, sIdNew = sdBuild.station.id;
  // mixed starting commerce tiers/platform lengths among the player's stations;
  // sIdB starts fully maxed out so bulkBuildCommerce must skip it
  stSD.stations[sIdA].commerce = 0; stSD.stations[sIdA].cars = 1;
  stSD.stations[sIdB].commerce = CFG.COMMERCE.levels.length - 1; stSD.stations[sIdB].cars = sdCap1950;
  stSD.stations[sIdNew].commerce = 0; stSD.stations[sIdNew].cars = sdCap1950;
  pSD.cash = 1e12;

  var comCostExpected = commerceBuildCost(stSD, stSD.stations[sIdA], nextCommerceLevel(stSD.stations[sIdA])) +
                         commerceBuildCost(stSD, stSD.stations[sIdNew], nextCommerceLevel(stSD.stations[sIdNew]));
  var comTargetTier = nextCommerceLevel(stSD.stations[sIdA]);
  var cashBeforeCom = pSD.cash;
  var bulkCom = bulkBuildCommerce(stSD, pSD);
  var comCashSpent = cashBeforeCom - pSD.cash;
  // builds are timed — while they're under way, eligible stations are excluded
  var bulkComAgain = bulkBuildCommerce(stSD, pSD);

  var carTarget = sdCap1950;
  var carCostExpected = stationPlatformUpgradeCost(stSD, stSD.stations[sIdA], carTarget);
  var cashBeforeCar = pSD.cash;
  var bulkCar = bulkExtendPlatforms(stSD, pSD, carTarget);
  var carCashSpent = cashBeforeCar - pSD.cash;
  var bulkCarAgain = bulkExtendPlatforms(stSD, pSD, carTarget);

  // fast-forward until every queued commerce build/platform extension finishes, then read results
  var uguard = 0;
  while (stSD.stations.some(s => s.co === pSD.id && (s.commerceBuilding > 0 || s.platBuilding > 0)) && uguard++ < 80)
    fastForwardDays(stSD, daysToNextCompletion(stSD, pSD) || 1);
  var afterComOk = stSD.stations[sIdA].commerce === comTargetTier && stSD.stations[sIdNew].commerce === comTargetTier &&
    stSD.stations[sIdB].commerce === CFG.COMMERCE.levels.length - 1;
  var afterCarOk = stSD.stations[sIdA].cars === carTarget;

  pSD.stationDefaults = { cars: 7 };
  var stSDLoad = importSaveString(exportSaveString(stSD));
  var pSDLoad = stSDLoad.companies.find(c => c.isPlayer);
`, ctx);
check("1950 platform cap exceeds 3 cars (room to extend)", G("sdCap1950") > 3, "" + G("sdCap1950"));
check("bulkBuildCommerce develops exactly the stations with a tier ready, for the summed cost",
  G("bulkCom").ok && G("bulkCom").count === 2 && G("bulkCom").cost === G("comCostExpected"),
  JSON.stringify(G("bulkCom")) + " expected cost " + G("comCostExpected"));
check("bulkBuildCommerce charges exactly its quoted cost", G("comCashSpent") === G("bulkCom").cost);
check("bulkBuildCommerce advances every eligible station by one commerce tier, skipping an already-maxed one",
  G("afterComOk"));
check("bulkBuildCommerce is a no-op once nothing is ready to develop",
  !G("bulkComAgain").ok && G("bulkComAgain").count === 0, JSON.stringify(G("bulkComAgain")));
check("bulkExtendPlatforms extends exactly the stations below target, for the summed per-step cost",
  G("bulkCar").ok && G("bulkCar").count === 1 && G("bulkCar").cost === G("carCostExpected"),
  JSON.stringify(G("bulkCar")) + " expected cost " + G("carCostExpected"));
check("bulkExtendPlatforms charges exactly its quoted cost", G("carCashSpent") === G("bulkCar").cost);
check("bulkExtendPlatforms lengthens the eligible station's platform to the target", G("afterCarOk"));
check("bulkExtendPlatforms is a no-op once nothing is under target",
  !G("bulkCarAgain").ok && G("bulkCarAgain").count === 0, JSON.stringify(G("bulkCarAgain")));
check("stationDefaults round-trip through save/load",
  G("pSDLoad").stationDefaults.cars === 7,
  JSON.stringify(G("pSDLoad").stationDefaults));

// v0.6: the bulk develop button levels from the bottom — only stations at the
// company's LOWEST current commerce tier step up; higher ones are left alone
vm.runInContext(`
  fastForwardToYear(stSD, 1972);         // mall tier buildable, so both could develop
  stSD.stations[sIdNew].commerce = stSD.stations[sIdA].commerce + 1;   // New a tier ahead of A
  var loTierA = Math.max(1, stSD.stations[sIdA].commerce);
  var loNewBefore = stSD.stations[sIdNew].commerce;
  var loElig = bulkCommerceEligible(stSD, pSD);
  var loBulk = bulkBuildCommerce(stSD, pSD);
  var loGuard = 0;
  while (stSD.stations.some(s => s.co === pSD.id && s.commerceBuilding > 0) && loGuard++ < 80)
    fastForwardDays(stSD, daysToNextCompletion(stSD, pSD) || 1);
  var loAOk = stSD.stations[sIdA].commerce === loTierA + 1;
  var loNewOk = stSD.stations[sIdNew].commerce === loNewBefore;
`, ctx);
check("bulkCommerceEligible reports the lowest tier and exactly its stations",
  G("loElig").tier === G("loTierA") && G("loElig").stations.length === 1,
  "tier " + G("loElig").tier + " × " + G("loElig").stations.length);
check("bulk develop only lifts lowest-tier stations; higher tiers are untouched",
  G("loBulk").ok && G("loBulk").count === 1 && G("loAOk") && G("loNewOk"),
  JSON.stringify(G("loBulk")));

// ---- run ~3 years (21 sim-days) of operations ----
vm.runInContext(`
  var paxSeen = 0, revSeen = 0;
  for (let d = 0; d < 21; d++) { ticks(1); paxSeen = Math.max(paxSeen, p.stats.pax); revSeen = Math.max(revSeen, p.stats.revToday); }
`, ctx);
check("passengers ride", G("paxSeen") > 50, G("paxSeen").toFixed(0) + " pax/day peak");
check("revenue earned", G("revSeen") > 0, "¥" + G("revSeen").toFixed(0) + "/sim-day peak");
check("year-end levy charged", (G("p").stats.lastLevy || {}).tax > 0 && G("p").stats.lastLevy.upkeep > 0,
  JSON.stringify(G("p").stats.lastLevy));
check("daily operating costs accrue (maintenance + payroll)", G("p").stats.costToday > 0,
  "¥" + G("p").stats.costToday.toFixed(0) + "/sim-day, " + (G("p")._headcount || 0) + " staff");

// monthly ridership folds in a blended weekday/weekend mix (no separate
// holiday step): the blend factor sits between the weekend ratio and a full
// weekday, so every month carries the same averaged demand.
vm.runInContext(`
  var blend = monthlyPaxFactor();
`, ctx);
check("monthly weekday/weekend blend between holiday ratio and 1",
  G("blend") > CFG_get("PAX.holidayMult") && G("blend") < 1,
  G("blend").toFixed(3) + " (holidayMult " + CFG_get("PAX.holidayMult") + ")");

// ---- fast-forward to 1930 ----
vm.runInContext(`while (st.time.year < 1930) ticks(1);`, ctx);
const st2 = G("st");
check("original rivals entered by Showa; only the late windows remain",
  st2.companies.length === 1 + CFG_get("AI_COUNT") - 2 &&
  st2.pendingAI.length === 2 && st2.pendingAI.every(p => p.year >= 1946),
  st2.companies.length + " companies, " + st2.pendingAI.length + " pending");
const aiWithTrack = st2.companies.filter(c => !c.isPlayer && call("companyTrackHexes", st2, c).length > 0).length;
check("AI built track", aiWithTrack >= 2, aiWithTrack + "/" + CFG_get("AI_COUNT") + " AI have track");
check("events fired", st2.events.log.length > 5, st2.events.log.length + " log entries");
check("era is Early Showa", call("eraOf", st2.time.year).key === "showa1");
check("player solvent", st2.companies[0].cash > 0, "cash " + Math.round(st2.companies[0].cash));
const majors = st2.events.majors;   // years of MAJOR QUAKES (per-playthrough budget)
check("major-quake budget respected mid-run", majors.length <= CFG_get("EVENTS.majorQuakeCap"), majors.join(","));

// ---- land purchase offer from another company ----
vm.runInContext(`
  var ai = st.companies.find(c => !c.isPlayer && c.alive);
  // find an AI-owned hex without infrastructure
  var parcel = ai.land.find(i => !st.hexes[i].track && !st.hexes[i].stations.length &&
    !hexHasPendingWork(st, i));
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
check("save round-trip private holdouts", st3.hexes.filter(h => h.owner === -2).length === st2.hexes.filter(h => h.owner === -2).length &&
  st3.hexes.filter(h => h.owner === -2).every(h => !!h.holdout),
  st3.hexes.filter(h => h.owner === -2).length + " holdouts");
check("save round-trip train age", st3.trains.every((t, i) => !st2.trains[i] || t.bought === (st2.trains[i].bought | 0)));
const empty = call("importSaveString", '{"v":' + CFG_get("SAVE_VERSION") + '}');
check("hostile/empty import safe", empty.companies.length === 0 && empty.hexes.length === 2500);
let badVer = false;
try { call("importSaveString", '{"v":2}'); } catch (e) { badVer = true; }
check("old save version rejected", badVer);

// ---- run loaded state to 2029 (full timeline, 7 ticks/year) ----
vm.runInContext(`st = st3; while (st.time.year <= 2028) ticks(1);`, ctx);
const stEnd = G("st");
check("reached Reiwa 10 end", stEnd.ended === true && stEnd.time.year === 2029);
check("companies survive timeline", stEnd.companies.filter(c => c.alive).length >= 1);
// Spec (v0.5): major quakes are a per-PLAYTHROUGH budget — at most
// CFG.EVENTS.majorQuakeCap over the whole run, and no two closer together
// than the minimum gap. (Replaces the old rolling-100-year-window rule.)
const m2 = [...stEnd.events.majors].sort((a, b) => a - b);
let gapOK = true;
for (let i = 0; i + 1 < m2.length; i++) if (m2[i + 1] - m2[i] < CFG_get("EVENTS.majorQuakeGapYears")) gapOK = false;
check("major-quake playthrough budget respected over full run",
  m2.length <= CFG_get("EVENTS.majorQuakeCap"), m2.join(","));
check("major quakes keep their minimum gap", gapOK, m2.join(","));

// ---- demand stays anchored to population (production-constrained gravity) ----
// People ride ~twice a day, so network ridership should be a small multiple of
// population — never the 10–37× blow-up an unconstrained pop×attraction gravity
// produced. A single line must never carry more riders than the whole city.
const popEnd = call("totalPopulation", stEnd);
let sumPaxEnd = 0, maxBoardEnd = 0;
for (const c of stEnd.companies) if (c.alive) sumPaxEnd += c.stats.pax || 0;
for (const l of stEnd.lines) if (l.alive && (l.board || 0) > maxBoardEnd) maxBoardEnd = l.board;
check("network ridership stays a believable multiple of population (≤5×)",
  popEnd > 0 && sumPaxEnd <= popEnd * 5,
  Math.round(sumPaxEnd) + " riders/day vs pop " + popEnd + " (" + (sumPaxEnd / Math.max(1, popEnd)).toFixed(2) + "×)");
check("no single line carries more riders/day than the city's population",
  maxBoardEnd * 2 < popEnd,
  "busiest " + Math.round(maxBoardEnd * 2) + " riders/day vs pop " + popEnd);

// ---- waypoint line routing, route editing, and bulk electrification ----
vm.runInContext(`
  var stL = newGame(20240601, { aiCount: 0 });
  var pL = stL.companies[0];
  pL.cash = 1e9;
  // lay a straight 8-hex run of player track on row 25 (cols 20..27)
  var rowR = 25, c0 = 20, lineHexes = [];
  for (var c = c0; c <= c0 + 7; c++) {
    var hi = hexIdx(c, rowR);
    stL.hexes[hi].track = { co: pL.id, gauge: pL.gauge, elec: false, tunnel: false, dmg: 0 };
    stL.hexes[hi].cons = null; stL.hexes[hi].owner = pL.id; pL.land.push(hi);
    lineHexes.push(hi);
  }
  function mkStation(hi, nm) {
    var s = { id: stL.stations.length, co: pL.id, hex: hi, cars: 3, name: nm,
      builtYear: stL.time.year, board: 0, alive: true, building: 0, isDepot: false, depotAsStation: false };
    stL.stations.push(s); stL.hexes[hi].stations.push(s.id); return s;
  }
  var sW = mkStation(lineHexes[0], "West");
  var sM = mkStation(lineHexes[4], "Mid");
  var sE = mkStation(lineHexes[7], "East");
  // express via just the two endpoints: Mid lies on the path but is a minor stop
  var rExp = createLineVia(stL, pL, [sW.id, sE.id], "express");
  var expMidStop = rExp.ok ? rExp.line.stops[sM.id] : null;   // capture before in-place edit
  // re-route to force Mid to be a served waypoint (mutates rExp.line in place)
  var rEdit = rExp.ok ? editLineRoute(stL, pL, rExp.line.id, [sW.id, sM.id, sE.id]) : { ok: false };
  // electrification is now an R&D capability: blocked until the tech is
  // developed/licensed, then it wires everything
  var elecEarly = bulkElectrifyTrack(stL, pL);           // no electrification R&D yet → blocked
  stL.time.year = 1910;
  if (!pL.research) pL.research = { done: [], active: null, leased: {} };
  pL.research.done.push("track_electrification");         // grant the tech
  var elecQuote = electrifyTrackCost(stL, pL);
  var elecDone = bulkElectrifyTrack(stL, pL);
  // electrification is now staged construction: the job is queued, rails are NOT
  // wired yet, and no re-quote is possible while it runs
  var elecPendingJob = stL.builds.some(b => b.kind === "electrify" && b.co === pL.id);
  var elecHexBeforeDone = stL.hexes[lineHexes[3]].track.elec;   // still steam until wired
  var elecReQuote = electrifyTrackCost(stL, pL);                 // 0 remaining — all queued
  // let ONLY the construction queue run to completion (processBuilds, not a full
  // stepDay) so the rails & lines light up without advancing population/AI/time
  // and disturbing the crowding tests that share this London state below
  var eguard = 0;
  while (stL.builds.some(b => b.kind === "electrify" && b.co === pL.id) && eguard++ < 200) processBuilds(stL);
`, ctx);
check("createLineVia builds a line through chosen waypoints", G("rExp").ok, G("rExp").msg);
check("waypoint line includes all on-path stations", G("rExp").ok && G("rExp").line.stations.length === 3,
  G("rExp").ok ? G("rExp").line.stations.length + " stations" : "");
check("express skips a non-waypoint middle station", G("expMidStop") === false);
check("editLineRoute makes a newly-added waypoint a served stop",
  G("rEdit").ok && G("rEdit").line.stops[G("sM").id] === true, G("rEdit").msg);
check("electrify blocked until the electrification tech is researched", G("elecEarly").ok === false);
check("electrify quotes a positive cost for un-wired track",
  G("elecQuote").count === 8 && G("elecQuote").cost > 0, JSON.stringify(G("elecQuote")));
check("bulkElectrifyTrack queues a staged electrification job (not instant)",
  G("elecDone").ok && G("elecDone").count === 8 && G("elecPendingJob") === true &&
  G("elecHexBeforeDone") === false, G("elecDone").msg);
check("no re-quote while electrification is under way (hexes already committed)",
  G("elecReQuote").count === 0, JSON.stringify(G("elecReQuote")));
check("electrification completes over construction time, then wires all track and its lines",
  G("stL").lines[G("rExp").line.id].elec === true &&
  G("stL").hexes[G("lineHexes")[3]].track.elec === true);

// ---- affordability: an over-the-top fare suppresses ridership (P2) ----
vm.runInContext(`
  // populate catchments: homes by West, jobs/shops by East
  function setCons(c, r, cons) { var hi = hexIdx(c, r); var h = stL.hexes[hi]; h.track = null; h.cons = cons; h.dev = 3; }
  setCons(20, 24, "apartment"); setCons(21, 24, "apartment");
  setCons(27, 24, "shop"); setCons(26, 24, "shop");
  var rTrain = buyTrain(stL, pL, rExp.line.id, "steam_local");
  stL.od.dirty = true; assignOD(stL);
  var demandCheap = stL.lines[rExp.line.id].demand;
  var fareBase = stL.lines[rExp.line.id].fare;
  stL.lines[rExp.line.id].fare = fareBase * 6;   // far above the comfortable level
  stL.od.dirty = true; assignOD(stL);
  var demandPricey = stL.lines[rExp.line.id].demand;
`, ctx);
check("ridership is positive at an affordable fare", G("demandCheap") > 0, G("demandCheap").toFixed(1));
check("affordability: a far-too-expensive fare cuts ridership",
  G("demandPricey") < G("demandCheap"), G("demandPricey").toFixed(1) + " < " + G("demandCheap").toFixed(1));

// ---- total population + per-station daily throughput ----
vm.runInContext(`
  stL.lines[rExp.line.id].fare = fareBase; stL.od.dirty = true;   // back to an affordable fare
  var popMap = totalPopulation(stL);
  dailyTick(stL);
  var westPax = stL.stations[sW.id].paxDay;
  var popCached = stL.totalPop;
`, ctx);
check("totalPopulation counts the map's residents", G("popMap") > 0, "" + G("popMap"));
check("dailyTick caches map population on st.totalPop", G("popCached") > 0, "" + G("popCached"));
check("stations report passengers/day after a simulated day", G("westPax") > 0, G("westPax").toFixed(1));

// ---- express convenience: a pricier express run alongside a local attracts
// the comfort-seeking segment even though the local is cheaper ----
vm.runInContext(`
  stL.lines[rExp.line.id].fare = fareBase;             // the all-stops "local"
  // pack dense housing around West and shops around East so the corridor is busy
  // enough to crowd a single local train (the comfort term only bites once load > 1)
  for (var _r = 22; _r <= 28; _r++) {
    for (var _cc of [19, 20, 21]) { var _hw = stL.hexes[hexIdx(_cc, _r)]; if (!_hw.track) { _hw.cons = "apartment"; _hw.dev = 5; } }
    for (var _cc2 of [26, 27, 28]) { var _he = stL.hexes[hexIdx(_cc2, _r)]; if (!_he.track) { _he.cons = "shop"; _he.dev = 5; } }
  }
  var rExpFast = createLineVia(stL, pL, [sW.id, sE.id], "express");   // same track as the local
  // force-skip Mid: by now Mid is busy enough from the local that the new ridership-aware
  // default would stop there too, but this test is about fare segmentation, not stop defaults
  if (rExpFast.ok) stL.lines[rExpFast.line.id].stops[sM.id] = false;
  var rExpFastTrain = rExpFast.ok ? buyTrain(stL, pL, rExpFast.line.id, "steam_local") : { ok: false };
  if (rExpFast.ok) { stL.lines[rExpFast.line.id].fare = fareBase * 1.8; stL.lines[rExpFast.line.id].fareOverride = true; }
  // crowding load uses the prior round, so iterate until it converges; once the
  // cheaper local is crowded, the comfort segment pays for the emptier express
  for (var _i = 0; _i < 8; _i++) { stL.od.dirty = true; assignOD(stL); }
  var localBoard = stL.lines[rExp.line.id].board;
  var localLoad = stL.lines[rExp.line.id]._load || 0;
  var expressBoard = rExpFast.ok ? stL.lines[rExpFast.line.id].board : 0;
`, ctx);
check("a parallel express line can be created over shared track", G("rExpFast").ok, G("rExpFast").msg);
check("the busy local is crowded (load > 1)", G("localLoad") > 1, "load " + G("localLoad").toFixed(2));
check("the cheaper local still carries riders", G("localBoard") > 0, G("localBoard").toFixed(1));
check("the pricier express attracts convenience demand (route split)",
  G("expressBoard") > 0, G("expressBoard").toFixed(1) + " riders on the express");

// ---- train animation halts at scheduled stops (and glides past skipped track) ----
// rExp stops at West, Mid, East (Mid added as a waypoint earlier) and carries a
// train, so its served-stop path positions are [0, 4, 7].
vm.runInContext(`
  var exLine = stL.lines[rExp.line.id];
  var exTrain = stL.trains[rTrain.train.id];
  var stopPos = exLine._stopPos || [];
  var interior = stopPos.find(p => p > 0 && p < exLine.path.length - 1);   // Mid
  // approach the interior stop moving forward; one frame should snap & dwell on it
  exTrain.pos = interior - 0.05; exTrain.dir = 1; exTrain._dwell = 0;
  moveTrains(stL, 0.1);
  var halted = exTrain._dwell > 0 && Math.abs(exTrain.pos - interior) < 1e-6;
  // mid-segment (not a stop) → keep gliding, no dwell
  exTrain.pos = 1.2; exTrain.dir = 1; exTrain._dwell = 0;
  moveTrains(stL, 0.01);
  var glided = exTrain._dwell === 0 && exTrain.pos > 1.2;
`, ctx);
check("line caches its served-stop path positions for the animation",
  G("stopPos").length === 3 && G("stopPos").every((p, i, a) => i === 0 || p > a[i - 1]), JSON.stringify(G("stopPos")));
check("train halts (dwells) when it reaches a scheduled stop", G("halted"),
  "pos " + G("exTrain").pos + " dwell " + G("exTrain")._dwell);
check("train glides past non-stop track without halting", G("glided"));

// ---- demolish track & redevelop the parcel for rent (P/feature d) ----
vm.runInContext(`
  var demoHex = lineHexes[2];                 // a track hex used by the line, no station
  var ownedBefore = pL.land.includes(demoHex);
  var rDemo = demolishAndDevelop(stL, pL, demoHex, "shop");
  var rDemoOnly = demolishTrack(stL, pL, lineHexes[5]);   // plain demolition elsewhere
  // demolition is timed now — fast-forward until both teardowns finish
  var dmguard = 0;
  while (stL.builds.some(b => b.co === pL.id && b.kind === "demolish") && dmguard++ < 80)
    fastForwardDays(stL, daysToNextCompletion(stL, pL) || 1);
  var lineAliveAfter = stL.lines[rExp.line.id].alive;
  var hexAfter = stL.hexes[demoHex];
`, ctx);
check("demolish & develop succeeds on owned track", G("rDemo").ok, G("rDemo").msg);
check("redeveloped hex loses its track and gains a shop", !G("hexAfter").track && G("hexAfter").cons === "shop");
check("redeveloped parcel stays owned (earns rent)", G("hexAfter").owner === G("pL").id && G("rDemo").rentPerYear > 0,
  "rent/yr " + G("rDemo").rentPerYear);
check("lines crossing a demolished hex are removed", G("lineAliveAfter") === false && G("rDemo").removedLines >= 1);
check("plain demolition clears track without developing", G("rDemoOnly").ok && !G("stL").hexes[G("lineHexes")[5]].track);

// ---- sell land back to the open market ----
vm.runInContext(`
  var sellHex = demoHex;                       // the redeveloped shop parcel (owned, no track)
  var cashBeforeSale = pL.cash;
  var saleVal = landSaleValue(stL, pL, sellHex);
  var rSell = sellLand(stL, pL, sellHex);
  var ownerAfterSale = stL.hexes[sellHex].owner;
  var inLandAfterSale = pL.land.includes(sellHex);
  var rSellTrack = sellLand(stL, pL, lineHexes[3]);   // still has track → must be blocked
`, ctx);
check("land sale value reflects land + improvements", G("saleVal") > 0, "" + G("saleVal"));
check("sellLand credits proceeds immediately",
  G("rSell").ok && G("rSell").proceeds === G("saleVal") &&
  Math.round(G("pL").cash - G("cashBeforeSale")) === G("saleVal"), G("rSell").msg);
check("sold parcel returns to the open market (unowned)",
  G("ownerAfterSale") === -1 && G("inLandAfterSale") === false);
check("land carrying track can't be sold", G("rSellTrack").ok === false, G("rSellTrack").msg);

// ---- demand field for the player-facing heatmap ----
vm.runInContext(`
  var df = computeDemandField(stL);
  var westDemand = df.field[lineHexes[0]];     // West hex: apartments within catchment
`, ctx);
check("demand field has a positive maximum", G("df").max > 0, "" + G("df").max);
check("demand field shows latent riders near populated hexes", G("westDemand") > 0, G("westDemand").toFixed(1));

// ---- station commerce (ekinaka): unlock gating, build, income & upkeep ----
vm.runInContext(`
  var stC = newGame(7654321, { aiCount: 0 });
  var pC = stC.companies[0];
  pC.cash = 1e9;
  // a single operating station on owned track with real footfall
  function mkStationC(c, r, nm) {
    var hi = hexIdx(c, r);
    stC.hexes[hi].track = { co: pC.id, gauge: pC.gauge, elec: false, tunnel: false, dmg: 0 };
    stC.hexes[hi].cons = null; stC.hexes[hi].owner = pC.id; pC.land.push(hi);
    var s = { id: stC.stations.length, co: pC.id, hex: hi, cars: 3, name: nm,
      builtYear: stC.time.year, board: 0, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 0, commerceBuilding: 0, commercePending: 0 };
    stC.stations.push(s); stC.hexes[hi].stations.push(s.id); return s;
  }
  var sC = mkStationC(20, 25, "Commerce Sta");
  // unlock-year gating (pure helper)
  var unlockGate = [maxCommerceLevel(1875), maxCommerceLevel(1880), maxCommerceLevel(1950),
                    maxCommerceLevel(1960), maxCommerceLevel(2000)].join(",");
  // 1872: before vending — no commerce earns; after 1876 vending is automatic
  var effPre = effectiveCommerce(stC, sC);
  stC.time.year = 1885;
  var effVending = effectiveCommerce(stC, sC);
  // can't skip tiers: shops (2) is the only thing buildable from vending
  var nxt0 = nextCommerceLevel(sC);
  var blockSkip = canBuildCommerce(stC, pC, sC, 3);
  // build shops (level 2): cash drops, construction starts, then completes
  var cashB4 = pC.cash;
  var rBuild = buildCommerce(stC, pC, sC);
  var building = sC.commerceBuilding > 0 && sC.commercePending === 2;
  var spent = cashB4 - pC.cash;
  // advance the construction queue until the works open
  for (var g = 0; g < 60 && sC.commerceBuilding > 0; g++) processBuilds(stC);
  var builtLvl = sC.commerce;
  // income scales with footfall and is 0 with no footfall
  var incZero = commerceIncomeDay(stC, sC, 0);
  var incBusy = commerceIncomeDay(stC, sC, 2000);
  var maintY = commerceMaintYear(stC, pC);
  // higher tiers gated by year: retail (3) only from 1950
  stC.time.year = 1949; var retailEarly = canBuildCommerce(stC, pC, sC, 3);
  stC.time.year = 1950; var retailOk = canBuildCommerce(stC, pC, sC, 3);
  // save/load round-trip preserves commerce
  var stCsave = importSaveString(exportSaveString(stC));
  var sCsave = stCsave.stations[sC.id];
`, ctx);
check("commerce unlock years gate buildable tiers (none→shops→retail→mall→complex)",
  G("unlockGate") === "0,2,3,4,5", G("unlockGate"));
check("no commerce earns before vending is invented", G("effPre") === 0, "" + G("effPre"));
check("vending becomes automatic once invented", G("effVending") === 1, "" + G("effVending"));
check("you upgrade one tier at a time from vending → shops", G("nxt0") === 2 && !!G("blockSkip"),
  "next=" + G("nxt0") + " skip=" + G("blockSkip"));
check("building commerce deducts cash and starts construction", G("rBuild").ok && G("building") && G("spent") > 0,
  JSON.stringify(G("rBuild")) + " spent " + G("spent"));
check("commerce construction completes to the built tier", G("builtLvl") === 2, "level " + G("builtLvl"));
check("commerce income is zero with no footfall, positive when busy",
  G("incZero") === 0 && G("incBusy") > 0, G("incZero") + " / " + G("incBusy").toFixed(1));
check("commerce maintenance is owed (fixed, demand-independent)", G("maintY") > 0, "¥" + G("maintY") + "/yr");
check("retail tier gated to its unlock year", !!G("retailEarly") && G("retailOk") === null,
  "1949=" + G("retailEarly") + " 1950=" + G("retailOk"));
check("commerce level round-trips through save/load", G("sCsave").commerce === 2, "" + G("sCsave").commerce);

// commerce income & maintenance flow through the daily finance breakdown
vm.runInContext(`
  var stF = newGame(556677, { aiCount: 0 });
  var pF = stF.companies[0];
  pF.cash = 1e9;
  function mkStationF(c, r) {
    var hi = hexIdx(c, r);
    stF.hexes[hi].track = { co: pF.id, gauge: pF.gauge, elec: false, tunnel: false, dmg: 0 };
    stF.hexes[hi].cons = null; stF.hexes[hi].owner = pF.id; pF.land.push(hi);
    var s = { id: stF.stations.length, co: pF.id, hex: hi, cars: 3, name: "F"+c,
      builtYear: stF.time.year, board: 500, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 3, commerceBuilding: 0, commercePending: 0 };
    stF.stations.push(s); stF.hexes[hi].stations.push(s.id); return s;
  }
  stF.time.year = 1955;
  var sF = mkStationF(20, 25);
  // adopt 1955's automatic industry standards up front — granting them mid-tick
  // would dirty the O-D state we're about to freeze
  processResearch(stF);
  // keep the manually-set footfall: skip the O-D reassignment (it would zero board)
  stF.od.dirty = false; stF.od.lastAssign = stF.time.totalDays;
  dailyTick(stF);
  var commRevToday = pF.stats.commerceRevToday;
  var commRevYear = pF.stats.commerceRevYear;
`, ctx);
check("station commerce income lands in the finance breakdown (today + YTD)",
  G("commRevToday") > 0 && G("commRevYear") > 0,
  "today ¥" + Math.round(G("commRevToday")) + " ytd ¥" + Math.round(G("commRevYear")));

// ---- buyout transfers in-progress construction (regression) ----
// Buying out a company while it has track still being laid must hand the
// construction jobs to the buyer; otherwise the track completes stamped with
// the defunct company's id and becomes an orphaned, undemolishable hex.
vm.runInContext(`
  var stB = newGame(13572468, { aiCount: 0 });
  var buyerB = stB.companies[0];
  buyerB.cash = 1e9;
  // founded well over BUYOUT.minYearsInBusiness years ago so the acquisition is allowed
  var targetB = createCompany(stB, { name: "Rival Rwy", color: "#888888",
    isPlayer: false, founded: stB.time.year - CFG.BUYOUT.minYearsInBusiness - 1, cash: 50000, gauge: buyerB.gauge });
  // a chronic loss-maker: distressed enough that its board is willing to sell
  targetB.stats.history = [{ year: stB.time.year - 2, profit: -1 }, { year: stB.time.year - 1, profit: -1 }, { year: stB.time.year, profit: -1 }];
  // a track hex the target is still building, on land the target owns
  var bHex = hexIdx(30, 25);
  stB.hexes[bHex].terrain = "grass"; stB.hexes[bHex].track = null;
  stB.hexes[bHex].owner = targetB.id; targetB.land.push(bHex);
  stB.builds.push({ kind: "track", co: targetB.id, hexes: [bHex], done: 0,
    daysPerHex: 100, progress: 0, gauge: targetB.gauge, elec: false });
  var rBuy = buyOutCompany(stB, buyerB, targetB);
  var buildReassigned = stB.builds.length > 0 && stB.builds.every(b => b.co === buyerB.id);
  // finish the construction queue
  for (var kB = 0; kB < 10 && stB.hexes[bHex].track === null; kB++) processBuilds(stB);
  var trkB = stB.hexes[bHex].track;
  var trackOwnerB = trkB ? trkB.co : -1;
  // the buyer (a live company) can now demolish the inherited track
  var rDemoB = demolishTrack(stB, buyerB, bHex);
`, ctx);
check("buyout reassigns in-progress construction jobs to the buyer",
  G("rBuy").ok && G("buildReassigned"), JSON.stringify(G("rBuy")));
check("inherited track completes owned by the buyer, not the defunct company",
  G("trackOwnerB") === G("buyerB").id, "track.co=" + G("trackOwnerB") + " buyer=" + G("buyerB").id);
check("buyer can demolish track that finished after the buyout", G("rDemoB").ok, G("rDemoB").msg);

// ---- buyout protection: a young company can't be acquired for 5 years ----
vm.runInContext(`
  var stBP = newGame(778899, { aiCount: 0 });
  var buyerBP = stBP.companies[0]; buyerBP.cash = 1e12;
  stBP.time.year = 1900;
  var youngBP = createCompany(stBP, { name: "Upstart Rwy", color: "#777777", isPlayer: false,
    founded: 1898, cash: 10000, gauge: buyerBP.gauge });            // 2 years in business
  var oldBP = createCompany(stBP, { name: "Veteran Rwy", color: "#666666", isPlayer: false,
    founded: 1890, cash: 10000, gauge: buyerBP.gauge });            // 10 years in business
  // struggling finances, so its board is willing to sell (holdout not in play)
  oldBP.stats.history = [{ year: 1898, profit: -1 }, { year: 1899, profit: -1 }, { year: 1900, profit: -1 }];
  var blockYoung = buyOutCompany(stBP, buyerBP, youngBP);
  var youngStillAlive = youngBP.alive;
  var reasonOld = buyoutBlockedReason(stBP, oldBP);
  var allowOld = buyOutCompany(stBP, buyerBP, oldBP);
`, ctx);
check("a railway under 5 years old can't be bought out (impossible early)",
  G("blockYoung").ok === false && /5 year/.test(G("blockYoung").msg) && G("youngStillAlive") === true, G("blockYoung").msg);
check("a railway in business 5+ years has no buyout block", G("reasonOld") === null);
check("an established (10-year) railway can still be acquired", G("allowOld").ok === true, JSON.stringify(G("allowOld")));

// ---- loop lines: closed one-way circuit, trains alternate direction ----
vm.runInContext(`
  var stLp = newGame(31415926, { aiCount: 0 });
  var pLp = stLp.companies[0]; pLp.cash = 1e12;
  // a filled block of player track (cols 24..28 × rows 22..26) — fully connected,
  // so three corner stations form a real loop (the closing leg routes back to start)
  function trk(c, r) { var hi = hexIdx(c, r); stLp.hexes[hi].track = { co: pLp.id, gauge: pLp.gauge, elec: false, tunnel: false, dmg: 0 };
    stLp.hexes[hi].cons = null; stLp.hexes[hi].owner = pLp.id; if (!pLp.land.includes(hi)) pLp.land.push(hi); return hi; }
  for (var cc = 24; cc <= 28; cc++) for (var rr = 22; rr <= 26; rr++) trk(cc, rr);
  function mkS(c, r, nm) { var hi = hexIdx(c, r);
    var s = { id: stLp.stations.length, co: pLp.id, hex: hi, cars: 3, name: nm, builtYear: stLp.time.year,
      board: 0, alive: true, building: 0, isDepot: false, depotAsStation: false, commerce: 0, commerceBuilding: 0, commercePending: 0 };
    stLp.stations.push(s); stLp.hexes[hi].stations.push(s.id); return s; }
  var sN = mkS(26,22,"North"), sE = mkS(28,24,"East"), sS = mkS(26,26,"South");
  // v0.5.1: a 3rd train on one line needs a depot — give the company a yard
  var dLp = mkS(24,22,"Yard"); dLp.isDepot = true;
  var rLoop = createLineVia(stLp, pLp, [sN.id, sE.id, sS.id], "local", true);
  var loopClosed = rLoop.ok && rLoop.line.path[0] === rLoop.line.path[rLoop.line.path.length - 1];
  var twoStationLoop = createLineVia(stLp, pLp, [sN.id, sE.id], "local", true);   // too few for a loop
  var t1 = buyTrain(stLp, pLp, rLoop.line.id, "steam_local");
  var t2 = buyTrain(stLp, pLp, rLoop.line.id, "steam_local");
  var t3 = buyTrain(stLp, pLp, rLoop.line.id, "steam_local");
  var dir1 = t1.ok && stLp.trains[t1.train.id].dir;
  var dir2 = t2.ok && stLp.trains[t2.train.id].dir;
  var dir3 = t3.ok && stLp.trains[t3.train.id].dir;
  // a one-way loop train wraps around the seam instead of reversing: a forward
  // (dir=1) train whose coordinate DECREASED must have crossed the seam
  var loopTrain = stLp.trains[t1.train.id];
  var maxPos = rLoop.line.path.length - 1;
  var startPos = maxPos - 0.01;
  loopTrain.dir = 1; loopTrain._dwell = 0; loopTrain.pos = startPos;
  moveTrains(stLp, 5);
  var wrapped = loopTrain.pos < startPos && loopTrain.dir === 1;
`, ctx);
check("createLineVia builds a closed one-way loop (path returns to start)", G("loopClosed"), G("rLoop").msg);
check("a loop needs at least 3 stations", G("twoStationLoop").ok === false, G("twoStationLoop").msg);
check("loop trains alternate direction as added (clockwise odd, counter even)",
  G("dir1") === 1 && G("dir2") === -1 && G("dir3") === 1, "dirs " + G("dir1") + "," + G("dir2") + "," + G("dir3"));
check("a loop train wraps around the seam without reversing", G("wrapped"),
  "pos " + G("loopTrain").pos + " dir " + G("loopTrain").dir);
vm.runInContext(`
  var stLpSave = importSaveString(exportSaveString(stLp));
  var loopSaved = stLpSave.lines[rLoop.line.id];
  var savedDirs = loopSaved.trains.map(id => stLpSave.trains[id].dir);
`, ctx);
check("loop line + alternating train directions survive save/load",
  G("loopSaved").loop === true &&
  G("loopSaved").path[0] === G("loopSaved").path[G("loopSaved").path.length - 1] &&
  G("savedDirs").length === 3 && G("savedDirs")[0] === 1 && G("savedDirs")[1] === -1 && G("savedDirs")[2] === 1,
  "loop=" + G("loopSaved").loop + " dirs=" + JSON.stringify(G("savedDirs")));

// ---- default fare: one knob prices all non-overridden lines ----
vm.runInContext(`
  var stDF = newGame(20250101, { aiCount: 0 });
  var pDF = stDF.companies[0];
  var l1 = stDF.lines.length; stDF.lines.push({ id: l1, co: pDF.id, name: "A", alive: true, fare: 0.25, fareOverride: false, path: [], stations: [], stops: {}, trains: [] });
  var l2 = stDF.lines.length; stDF.lines.push({ id: l2, co: pDF.id, name: "B", alive: true, fare: 0.25, fareOverride: true,  path: [], stations: [], stops: {}, trains: [] });
  var n = setCompanyDefaultFare(stDF, pDF, 0.9);
  var fareFollow = stDF.lines[l1].fare;     // not overridden → follows the default
  var fareKept = stDF.lines[l2].fare;       // overridden → keeps its own price
`, ctx);
check("setCompanyDefaultFare re-prices only non-overridden lines",
  G("n") === 1 && G("fareFollow") === 0.9 && G("fareKept") === 0.25,
  "updated " + G("n") + " follow=" + G("fareFollow") + " kept=" + G("fareKept"));
check("default fare flag round-trips through save/load", (() => {
  vm.runInContext("var stDFsave = importSaveString(exportSaveString(stDF)); var pDFsave = stDFsave.companies.find(c => c.isPlayer);", ctx);
  return G("pDFsave").defaultFareSet === true && Math.abs(G("pDFsave").defaultFarePerKm - 0.9) < 1e-9 &&
    G("stDFsave").lines[G("l2")].fareOverride === true && G("stDFsave").lines[G("l1")].loop === false;
})(), JSON.stringify({ set: G("pDFsave").defaultFareSet, fare: G("pDFsave").defaultFarePerKm }));

// ---- per-station property metrics (Property panel helpers) ----
vm.runInContext(`
  var stPM = newGame(556600, { aiCount: 0 });
  var pPM = stPM.companies[0]; pPM.cash = 1e12; stPM.time.year = 1955;
  function mkPM(c, r) { var hi = hexIdx(c, r);
    stPM.hexes[hi].track = { co: pPM.id, gauge: pPM.gauge, elec: false, tunnel: false, dmg: 0 };
    stPM.hexes[hi].cons = null; stPM.hexes[hi].owner = pPM.id; pPM.land.push(hi);
    var s = { id: stPM.stations.length, co: pPM.id, hex: hi, cars: 3, name: "P"+c, builtYear: 1950,
      board: 600, paxDay: 600, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 3, commerceBuilding: 0, commercePending: 0 };
    stPM.stations.push(s); stPM.hexes[hi].stations.push(s.id); return s; }
  var sPM = mkPM(20, 25);
  var incPM = stationCommerceIncomeYear(stPM, sPM);
  var upPM = stationUpkeepYear(stPM, sPM);
`, ctx);
check("stationCommerceIncomeYear is positive for a busy retail station", G("incPM") > 0, "¥" + G("incPM") + "/yr");
check("stationUpkeepYear includes building + commerce upkeep", G("upPM") > 0, "¥" + G("upPM") + "/yr");

// ---- multi-gauge track: add a parallel rail, regauge, and #4 adjacency ----
vm.runInContext(`
  var stG = newGame(770011, { aiCount: 0 });
  var pG = stG.companies[0]; pG.cash = 1e12; stG.time.year = 1956;   // standard & scotch available
  pG.gauge = "narrow";
  function layG(hi, gauge) {
    stG.hexes[hi].track = { co: pG.id, gauge, elec: false, tunnel: false, dmg: 0,
      rails: [{ gauge, elec: false, building: false }] };
    stG.hexes[hi].cons = null; stG.hexes[hi].owner = pG.id; pG.land.push(hi);
  }
  function staG(hi, nm) {
    var s = { id: stG.stations.length, co: pG.id, hex: hi, cars: 3, name: nm, builtYear: 1955,
      board: 0, boardAvg: 0, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 0, commerceBuilding: 0, commercePending: 0, platBuilding: 0, platPending: 0 };
    stG.stations.push(s); stG.hexes[hi].stations.push(s.id); return s;
  }
  // a narrow-gauge run on row 30, cols 10..14
  var gRow = 30, gHexes = [];
  for (var c = 10; c <= 14; c++) { var hi = hexIdx(c, gRow); layG(hi, "narrow"); gHexes.push(hi); }

  // (1) ADD a parallel standard-gauge rail to the middle hex
  var addQuote = addGauge(stG, pG, gHexes[2], "standard", true);
  var addRes = addGauge(stG, pG, gHexes[2], "standard");
  var addPending = trackHasGauge(stG.hexes[gHexes[2]].track, "standard") &&
                   !trackHasMm(stG.hexes[gHexes[2]].track, CFG.GAUGES.standard.mm); // present but not yet in service?
  // (no rail is added until completion → 'present' is false, 'in service' is false)
  var addInRailsBefore = trackHasGauge(stG.hexes[gHexes[2]].track, "standard");
  for (var i = 0; i < 12; i++) processBuilds(stG);
  var addInService = trackHasMm(stG.hexes[gHexes[2]].track, CFG.GAUGES.standard.mm);
  var addStillNarrow = trackHasMm(stG.hexes[gHexes[2]].track, CFG.GAUGES.narrow.mm);
  var railCount = trackRailList(stG.hexes[gHexes[2]].track).length;

  // (2) CHANGE (regauge) an end hex from narrow to scotch
  var chgQuote = changeGauge(stG, pG, gHexes[0], "narrow", "scotch", true);
  var chgRes = changeGauge(stG, pG, gHexes[0], "narrow", "scotch");
  var chgOutOfService = !trackHasMm(stG.hexes[gHexes[0]].track, CFG.GAUGES.narrow.mm); // narrow off at once
  for (var i = 0; i < 14; i++) processBuilds(stG);
  var chgDone = trackHasMm(stG.hexes[gHexes[0]].track, CFG.GAUGES.scotch.mm) &&
                !trackHasGauge(stG.hexes[gHexes[0]].track, "narrow");
  var chgCheaperThanAdd = chgQuote.cost < addQuote.cost;   // regauge reuses roadbed/land
`, ctx);
check("addGauge quotes a cost with no land charge", G("addQuote").ok && G("addQuote").cost > 0, JSON.stringify(G("addQuote")));
check("a newly-added gauge isn't in service until the works finish", G("addInRailsBefore") === false && G("addRes").ok);
check("added parallel gauge comes into service after construction", G("addInService") === true);
check("the original gauge still runs alongside the new one", G("addStillNarrow") === true && G("railCount") === 2, "rails=" + G("railCount"));
check("regauge takes the old rail out of service immediately", G("chgRes").ok && G("chgOutOfService") === true);
check("regauge completes to the new gauge (old gauge gone)", G("chgDone") === true);
check("regauging is cheaper than laying a fresh parallel rail", G("chgCheaperThanAdd") === true,
  "regauge " + G("chgQuote").cost + " < add " + G("addQuote").cost);

// ---- #4: a station serves a line whose gauge runs on an ADJACENT hex ----
vm.runInContext(`
  var stA = newGame(880022, { aiCount: 0 });
  var pA = stA.companies[0]; pA.cash = 1e12; stA.time.year = 1956; pA.gauge = "narrow";
  function layA(hi, gauge) {
    stA.hexes[hi].track = { co: pA.id, gauge, elec: false, tunnel: false, dmg: 0,
      rails: [{ gauge, elec: false, building: false }] };
    stA.hexes[hi].cons = null; stA.hexes[hi].owner = pA.id; pA.land.push(hi);
  }
  function staA(hi, nm) {
    var s = { id: stA.stations.length, co: pA.id, hex: hi, cars: 3, name: nm, builtYear: 1955,
      board: 0, boardAvg: 0, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 0, commerceBuilding: 0, commercePending: 0, platBuilding: 0, platPending: 0 };
    stA.stations.push(s); stA.hexes[hi].stations.push(s.id); return s;
  }
  // standard-gauge corridor on cols 11..14, plus a single narrow-only hex at col 10
  var aRow = 30;
  layA(hexIdx(10, aRow), "narrow");
  for (var c = 11; c <= 14; c++) layA(hexIdx(c, aRow), "standard");
  var sA10 = staA(hexIdx(10, aRow), "Narrow-Town");   // its OWN hex has only narrow rail
  var sA14 = staA(hexIdx(14, aRow), "Std-Town");       // on the standard corridor
  var rA = createLineVia(stA, pA, [sA10.id, sA14.id], "local");
`, ctx);
check("a line routes on standard gauge despite a narrow-only endpoint hex",
  G("rA").ok && G("rA").line.gaugeMm === CFG_get("GAUGES.standard.mm"), G("rA").ok ? G("rA").line.gaugeMm + "mm" : G("rA").msg);
check("a station accepts a line whose gauge rail is on an ADJACENT hex (#4)",
  G("rA").ok && G("rA").line.stations.includes(G("sA10").id),
  G("rA").ok ? "stations=" + JSON.stringify(G("rA").line.stations) : "");

// ---- #2: demolish a station, leaving the rail; #3: demolish track under a station ----
vm.runInContext(`
  var stD = newGame(990033, { aiCount: 0 });
  var pD = stD.companies[0]; pD.cash = 1e12; stD.time.year = 1956;
  function layD(hi) {
    stD.hexes[hi].track = { co: pD.id, gauge: "narrow", elec: false, tunnel: false, dmg: 0,
      rails: [{ gauge: "narrow", elec: false, building: false }] };
    stD.hexes[hi].cons = null; stD.hexes[hi].owner = pD.id; pD.land.push(hi);
  }
  var dHex = hexIdx(20, 30); layD(dHex);
  var sD = { id: stD.stations.length, co: pD.id, hex: dHex, cars: 3, name: "Doomed", builtYear: 1955,
    board: 0, boardAvg: 0, alive: true, building: 0, isDepot: false, depotAsStation: false,
    commerce: 0, commerceBuilding: 0, commercePending: 0, platBuilding: 0, platPending: 0 };
  stD.stations.push(sD); stD.hexes[dHex].stations.push(sD.id);
  // #3: the Demolish tool can tear up track even with a station on the hex
  var canDemoWithStation = canDemolishTrack(stD, pD, dHex, null);
  // #2: demolish the station (rail must remain)
  var sdQuote = demolishStation(stD, pD, sD.id, true);
  var sdRes = demolishStation(stD, pD, sD.id);
  for (var i = 0; i < 9; i++) processBuilds(stD);
  var stationGone = !stD.stations[sD.id].alive && stD.hexes[dHex].stations.indexOf(sD.id) < 0;
  var railRemains = !!stD.hexes[dHex].track;
`, ctx);
check("Demolish tool works on track even with a station on the hex (#3)", G("canDemoWithStation") === null,
  G("canDemoWithStation") || "allowed");
check("demolishStation quotes a cost & time, then starts", G("sdQuote").ok && G("sdQuote").cost > 0 && G("sdRes").ok);
check("station demolition removes the station (#2)", G("stationGone") === true);
check("station demolition LEAVES the rail in place (#2)", G("railRemains") === true);

// ---- save/load round-trips multi-gauge track & a pending gauge job ----
vm.runInContext(`
  var stS = newGame(110044, { aiCount: 0 });
  var pS = stS.companies[0]; pS.cash = 1e12; stS.time.year = 1956;
  function layS(hi, gauge) {
    stS.hexes[hi].track = { co: pS.id, gauge, elec: false, tunnel: false, dmg: 0,
      rails: [{ gauge, elec: false, building: false }] };
    stS.hexes[hi].cons = null; stS.hexes[hi].owner = pS.id; pS.land.push(hi);
  }
  var sHexDual = hexIdx(20, 32), sHexChg = hexIdx(21, 32);
  layS(sHexDual, "narrow"); layS(sHexChg, "narrow");
  addGauge(stS, pS, sHexDual, "standard"); for (var i = 0; i < 12; i++) processBuilds(stS);  // finish: dual-gauge hex
  changeGauge(stS, pS, sHexChg, "narrow", "scotch");                                // leave one mid-flight
  var beforeDual = trackRailList(stS.hexes[sHexDual].track).map(r => r.gauge).sort().join(",");
  var beforeJob = stS.builds.some(b => b.kind === "gauge");
  var roundS = deserializeGame(JSON.parse(exportSaveString(stS)));
  var afterDual = trackRailList(roundS.hexes[sHexDual].track).map(r => r.gauge).sort().join(",");
  var afterJob = roundS.builds.some(b => b.kind === "gauge" && b.mode === "change");
  var afterBuildingRail = trackRailList(roundS.hexes[sHexChg].track).some(r => r.building);
`, ctx);
check("dual-gauge hex survives save/load", G("beforeDual") === G("afterDual") && G("afterDual") === "narrow,standard",
  G("beforeDual") + " → " + G("afterDual"));
check("a pending regauge job + its out-of-service rail survive save/load",
  G("beforeJob") === true && G("afterJob") === true && G("afterBuildingRail") === true);

// ---- v0.5: seismic resilience & taishin retrofits ----
vm.runInContext(`
  var stT = newGame(31313);
  var pT = stT.companies[0]; pT.cash = 1e9;
  stT.time.totalDays = 12 * (1985 - 1872); syncClock(stT); dailyTick(stT);   // shin-taishin era
  var lvlNow = taishinLevel(stT.time.year);
  var hexT = hexIdx(30, 25);
  stT.hexes[hexT].terrain = "grass"; stT.hexes[hexT].track = null;
  stT.hexes[hexT].owner = -1; stT.hexes[hexT].stations = [];
  buildTrackHex(stT, pT, hexT);
  for (let g = 0; g < 200 && stT.builds.length; g++) fastForwardDays(stT, 1);
  buildStation(stT, pT, hexT);
  for (let g = 0; g < 40 && stT.stations.some(s => s.alive && s.building); g++) fastForwardDays(stT, 1);
  var staT = stT.stations[stT.stations.length - 1];
  var autoLevel = staT.taishin;
  staT.taishin = 0; staT.renewed = 1900;               // pretend it's a neglected relic
  var resOld = stationResilience(stT, staT);
  var qT = upgradeStationTaishin(stT, pT, staT.id, true);
  var rT = upgradeStationTaishin(stT, pT, staT.id);
  for (let g = 0; g < 40 && staT.taishinBuilding > 0; g++) fastForwardDays(stT, 1);
  var resNew = stationResilience(stT, staT);
  var trkBuiltBefore = stT.hexes[hexT].track.built;
  var roundT = deserializeGame(JSON.parse(exportSaveString(stT)));
  var staTL = roundT.stations[staT.id];
`, ctx);
check("new stations are built to the current seismic standard", G("autoLevel") === G("lvlNow"),
  "built " + G("autoLevel") + " vs standard " + G("lvlNow"));
check("taishin retrofit quotes a real cost & time", G("qT").ok && G("qT").cost > 0 && G("qT").days > 0,
  JSON.stringify(G("qT")));
check("retrofit completes at the current standard and renews the structure",
  G("rT").ok && G("staT").taishin === G("lvlNow") && G("staT").renewed === G("stT").time.year,
  "taishin " + G("staT").taishin + " renewed " + G("staT").renewed);
check("resilience rises after the retrofit", G("resNew") > G("resOld") + 0.2,
  G("resOld").toFixed(3) + " → " + G("resNew").toFixed(3));
check("seismic fields survive save/load (station taishin/renewed + track built year)",
  G("staTL").taishin === G("staT").taishin && G("staTL").renewed === G("staT").renewed &&
  G("roundT").hexes[G("hexT")].track.built === G("trkBuiltBefore"));

// ---- v0.5 (reworked v0.6): R&D — no date gates, funding-scaled speed,
// automatic industry standards, and licensing between companies ----
vm.runInContext(`
  var stR = newGame(31414);
  var pR = stR.companies[0]; pR.cash = 1e9;
  var lockedPrereq = canResearch(stR, pR, "regen_brake");  // pure prereq gate (needs air_brake), no year gate
  var icTooEarly = canResearch(stR, pR, "ic_card");        // ic_card now has a realistic minYear (2001)
  var openEarly = canResearch(stR, pR, "auto_gates");      // no date gate: researchable in 1872
  var autoBlocked = canResearch(stR, pR, "devmodel");      // industry standard — never researched
  var cashB4R = pR.cash;
  var rStd = startResearch(stR, pR, "steel_rails", 1);     // standard monthly fee…
  var startCharged = cashB4R - pR.cash;                    // …nothing is billed up front now
  pR.research.active = null; pR.cash = cashB4R;            // restart the same tech as a crash programme
  var rCrash = startResearch(stR, pR, "steel_rails", 2);
  var crashFund = pR.research.active ? pR.research.active.fund : 0;
  var blockedSecond = canResearch(stR, pR, "block_signal"); // one project at a time
  var cashB4Fund = pR.cash;
  for (let g = 0; g < 50 && pR.research.active; g++) fastForwardDays(stR, 1);
  var monthlyDrew = cashB4Fund - pR.cash;                  // the running monthly cost is billed as it works
  var opM = rndOpCostMult(pR);
  // licensing: a rival that developed a tech leases it to others for a fee
  var aiR = createCompany(stR, { name: "Lease Test Rail", color: "#dd4444", isPlayer: false,
    founded: stR.time.year, cash: 1e9, gauge: pR.gauge });
  aiR.research = { done: ["auto_gates"], active: null, leased: {} };
  var aiCashB4 = aiR.cash, pCashB4L = pR.cash;
  var rLease = leaseTech(stR, pR, "auto_gates", aiR);
  // automatic industry standards arrive for EVERYONE at their year
  stR.time.totalDays = 12 * (1926 - 1872); syncClock(stR);
  processResearch(stR);
  var roundR = deserializeGame(JSON.parse(exportSaveString(stR)));
`, ctx);
check("R&D keeps prereq chains (regen_brake needs air_brake) and early techs stay open",
  G("openEarly") === null && typeof G("lockedPrereq") === "string" && /air brake/i.test(G("lockedPrereq")),
  "openEarly=" + G("openEarly") + " lockedPrereq=" + G("lockedPrereq"));
check("IC card ticketing is year-gated to a realistic date (Suica era, 2001)",
  typeof G("icTooEarly") === "string" && /2001/.test(G("icTooEarly")), G("icTooEarly"));
check("industry-standard practices can't be researched", typeof G("autoBlocked") === "string");
check("R&D is a monthly cost — nothing billed up front, drawn as the lab works",
  G("startCharged") === 0 && G("monthlyDrew") > 0,
  "upfront " + G("startCharged") + ", monthly total " + Math.round(G("monthlyDrew")));
check("crash funding costs more per month (fund² burn) and runs faster",
  G("rStd").ok && G("rCrash").ok && G("crashFund") === 2 &&
  G("rCrash").fee > G("rStd").fee && Math.abs(G("rCrash").fee - 4 * G("rStd").fee) <= 2,
  "std " + G("rStd").fee + "/mo vs crash " + G("rCrash").fee + "/mo");
check("only one project can run at a time", typeof G("blockedSecond") === "string");
check("R&D completes and its effect multiplier applies",
  G("pR").research.done.includes("steel_rails") && Math.abs(G("opM") - 0.94) < 1e-9,
  "opCostMult " + G("opM"));
check("licensing is instant, pays the developer, and grants the effect",
  G("rLease").ok && G("pR").research.done.includes("auto_gates") &&
  G("aiR").cash - G("aiCashB4") === G("rLease").price &&
  G("pCashB4L") - G("pR").cash === G("rLease").price &&
  G("pR").research.leased.auto_gates === G("aiR").id,
  "price " + G("rLease").price);
check("industry standards are granted to every alive company at their year",
  G("stR").companies.filter(c => c.alive).every(c =>
    c.research.done.includes("devmodel") && c.research.done.includes("taishin_rnd")) &&
  !G("pR").research.done.includes("through_service"),
  "player done: " + G("pR").research.done.join(","));
check("research state (incl. licences and standards) survives save/load",
  G("roundR").companies[0].research.done.includes("steel_rails") &&
  G("roundR").companies[0].research.done.includes("devmodel") &&
  G("roundR").companies[0].research.leased.auto_gates === G("aiR").id);

// ---- v0.6: electrification-as-R&D, mid-project funding controls, AI licensing
// from the player, and rival rumor leaks ----
vm.runInContext(`
  var stE = newGame(70707, { aiCount: 0 });
  var pE = stE.companies[0]; pE.cash = 1e9;
  if (!pE.research) pE.research = { done: [], active: null, leased: {} };
  // electrification can't be developed before its historical arrival (minYear)
  stE.time.year = 1900;
  var elecTooEarly = canResearch(stE, pE, "track_electrification");
  stE.time.year = 1910;
  var elecOpen = canResearch(stE, pE, "track_electrification");
  var canElecBefore = canElectrify(stE, pE);
  // develop it, then the company can electrify and builds electric by default
  startResearch(stE, pE, "track_electrification", 3);
  for (let g = 0; g < 60 && pE.research.active; g++) fastForwardDays(stE, 1);
  var canElecAfter = canElectrify(stE, pE);
  var elecDefaultOn = pE.elecDefault;
  // funding controls: raise the level mid-project, then halt it
  startResearch(stE, pE, "auto_gates", 1);
  var feeStd = pE.research.active ? rndMonthlyFee("auto_gates", pE.research.active.fund, pE.research.active.stdCost) : 0;
  setResearchFunding(stE, pE, 3);
  var feeFast = pE.research.active ? rndMonthlyFee("auto_gates", pE.research.active.fund, pE.research.active.stdCost) : 0;
  var prog = researchProgress(pE);
  var halted = stopResearch(stE, pE);
  var idleAfterHalt = !pE.research.active;
  // an AI licenses the PLAYER's invention: the fee is credited to the player
  var aiE = createCompany(stE, { name: "Rival Traction Co", color: "#33aa88", isPlayer: false,
    founded: stE.time.year, cash: 1e9, gauge: pE.gauge });
  aiE.research = { done: [], active: null, leased: {} };
  var srcHasPlayer = leaseSources(stE, aiE, "track_electrification").some(c => c.isPlayer);
  var pCashB4AI = pE.cash;
  var aiLease = leaseTech(stE, aiE, "track_electrification", pE);
  var playerPaidByAI = pE.cash - pCashB4AI;
  // a rival's near-complete programme leaks a rumor into the shared log
  var aiL = createCompany(stE, { name: "Skunkworks Rwy", color: "#aa8833", isPlayer: false,
    founded: stE.time.year, cash: 1e9, gauge: pE.gauge });
  aiL.research = { done: [], active: null, leased: {} };
  startResearch(stE, aiL, "block_signal", 1);
  aiL.research.active.stdDaysLeft = researchDays("block_signal") * 0.05;   // ~95% complete
  var logLenB4 = stE.events.log.length;
  processResearch(stE);
  var leaked = !!(aiL.research.active && aiL.research.active.leaked);
  var rumorLogged = stE.events.log.slice(logLenB4).some(e => /rumor/i.test(e.text));
`, ctx);
check("electrification can't be researched before its arrival year (minYear)",
  typeof G("elecTooEarly") === "string" && G("elecOpen") === null,
  "1900=" + G("elecTooEarly") + " 1910=" + G("elecOpen"));
check("electrification R&D gates the ability to electrify track",
  G("canElecBefore") === false && G("canElecAfter") === true && G("elecDefaultOn") === true);
check("R&D funding can be raised mid-project (higher monthly fee)",
  G("feeFast") > G("feeStd"), G("feeStd") + " -> " + G("feeFast"));
check("an R&D project can be halted mid-programme",
  G("halted").ok && G("idleAfterHalt") && G("prog") >= 0);
check("AI licenses the player's invention and the fee is paid to the player",
  G("srcHasPlayer") && G("aiLease").ok && G("playerPaidByAI") === G("aiLease").price,
  "player received " + G("playerPaidByAI"));
check("a rival's near-complete programme leaks a rumor to the log",
  G("leaked") === true && G("rumorLogged") === true);

// ---- acceleration / top-speed R&D unlocks new local rolling stock ----
vm.runInContext(`
  var stT = newGame(24680, { aiCount: 0 });
  var pT = stT.companies[0]; pT.cash = 1e12;
  if (!pT.research) pT.research = { done: [], active: null, leased: {} };
  stT.time.year = 1965;
  pT.research.done = ["track_electrification"];                       // electric stock is a precondition
  var lineT = { id: 0, co: pT.id, gaugeMm: CFG.GAUGES[pT.gauge].mm, elec: true };
  var beforeHi = trainTypesFor(stT, pT, lineT).includes("emu_hiaccel");
  pT.research.done.push("hi_accel");                                  // develop high-acceleration EMUs
  var afterHi = trainTypesFor(stT, pT, lineT).includes("emu_hiaccel");
  var lightBefore = trainTypesFor(stT, pT, lineT).includes("emu_light");
  pT.research.done.push("lightweight");                              // then lightweight carbodies
  var lightAfter = trainTypesFor(stT, pT, lineT).includes("emu_light");
  // year gate on the programmes themselves (fresh company that hasn't done them)
  var freshT = createCompany(stT, { name: "Fresh Rwy", color: "#888", isPlayer: false,
    founded: 1930, cash: 1e9, gauge: pT.gauge });
  freshT.research = { done: ["track_electrification"], active: null, leased: {} };
  stT.time.year = 1940; var hiTooEarly = canResearch(stT, freshT, "hi_accel");
  stT.time.year = 1965; var hiOpen = canResearch(stT, freshT, "hi_accel");
  // the AI's tech-value heuristic ranks impactful techs above trivial ones
  var vSteel = aiTechValue(stT, pT, "steel_rails");
  var vElec = aiTechValue(stT, pT, "track_electrification");
  var vHi = aiTechValue(stT, pT, "hi_accel");
`, ctx);
check("high-performance local EMUs are locked until their tech is developed",
  G("beforeHi") === false && G("afterHi") === true && G("lightBefore") === false && G("lightAfter") === true,
  "hiaccel " + G("beforeHi") + "->" + G("afterHi") + ", light " + G("lightBefore") + "->" + G("lightAfter"));
check("acceleration/top-speed programmes are year-gated to their historical arrival",
  typeof G("hiTooEarly") === "string" && /1955/.test(G("hiTooEarly")) && G("hiOpen") === null,
  "1940=" + G("hiTooEarly") + " 1965=" + G("hiOpen"));
check("AI values transformative / stock-unlocking techs above trivial ones",
  G("vElec") > G("vSteel") && G("vHi") > G("vSteel"),
  "steel " + G("vSteel").toFixed(2) + " elec " + G("vElec").toFixed(2) + " hi " + G("vHi").toFixed(2));

// ---- buyouts: boards hold out for randomized / financial reasons ----
vm.runInContext(`
  var stH = newGame(5150, { aiCount: 0 });
  var buyerH = stH.companies[0]; buyerH.cash = 1e12;
  stH.time.year = 1910;
  // a spread of healthy, long-established, profitable rivals: most hold out
  var healthyHold = 0, healthyTotal = 12, oneRefusal = null;
  for (var iH = 0; iH < healthyTotal; iH++) {
    var cH = createCompany(stH, { name: "Healthy " + iH, color: "#4477cc", isPlayer: false,
      founded: 1890, cash: 5e6, gauge: buyerH.gauge });
    cH.stats.history = [{ year: 1908, profit: 9e5 }, { year: 1909, profit: 1e6 }, { year: 1910, profit: 1.1e6 }];
    var reasonH = buyoutHoldoutReason(stH, cH);
    if (reasonH) { healthyHold++; if (!oneRefusal) oneRefusal = buyOutCompany(stH, buyerH, cH); }
  }
  // a deeply distressed rival (chronic losses + overdrawn) always comes to the table
  var brokeH = createCompany(stH, { name: "Faltering Rwy", color: "#cc7744", isPlayer: false,
    founded: 1890, cash: -5000, gauge: buyerH.gauge });
  brokeH.stats.history = [{ year: 1908, profit: -5e5 }, { year: 1909, profit: -6e5 }, { year: 1910, profit: -7e5 }];
  var brokeWilling = buyoutHoldoutReason(stH, brokeH);
  var brokeBought = buyOutCompany(stH, buyerH, brokeH);
  // the decision is stable within a game-year (re-clickable, not re-rolled per press)
  var stableCo = stH.companies.find(c => c.alive && !c.isPlayer);
  var reA = buyoutHoldoutReason(stH, stableCo), reB = buyoutHoldoutReason(stH, stableCo);
  // distress rises as a healthy company's fortunes turn — so it grows willing over time
  var dHealthy = companyDistress(stH, stableCo);
  stableCo.stats.history = [{ year: 1908, profit: -1 }, { year: 1909, profit: -1 }, { year: 1910, profit: -1 }];
  stableCo.cash = -1;
  var dDistressed = companyDistress(stH, stableCo);
`, ctx);
check("most healthy, profitable rivals hold out against a buyout", G("healthyHold") >= 9,
  G("healthyHold") + "/12 held out");
check("a holding-out board refuses the acquisition (won't sell at any price)",
  G("oneRefusal") && G("oneRefusal").ok === false && /won't sell/.test(G("oneRefusal").msg),
  JSON.stringify(G("oneRefusal")));
check("a deeply distressed rival's board is willing to sell",
  G("brokeWilling") === null && G("brokeBought").ok === true, JSON.stringify(G("brokeBought")));
check("the holdout decision is stable within a game-year", G("reA") === G("reB"));
check("financial distress rises when a company's fortunes turn (drives willingness)",
  G("dDistressed") > G("dHealthy"), G("dHealthy").toFixed(2) + " -> " + G("dDistressed").toFixed(2));

// ---- v0.5: causal inflation reacts to war (same seed, war on vs off) ----
vm.runInContext(`
  var wcSave = CFG.EVENTS.warChance, mqSave = CFG.EVENTS.majorQuakeChance;
  function runYears(st, n) {
    for (let d = 0; d < 12 * n; d++) {
      st.time.totalDays++; syncClock(st);
      if (st.time.day === 0) onNewYear(st);
      dailyEvents(st); dailyTick(st);
    }
  }
  CFG.EVENTS.warChance = 0; CFG.EVENTS.majorQuakeChance = 0;
  var stCalm = newGame(51515); runYears(stCalm, 60);
  var calmLevel = stCalm.econ.priceLevel;
  CFG.EVENTS.warChance = 1;                                // same seed, but a war breaks out
  var stWar = newGame(51515); runYears(stWar, 60);
  var warLevel = stWar.econ.priceLevel;
  CFG.EVENTS.warChance = wcSave; CFG.EVENTS.majorQuakeChance = mqSave;
  var roundW = deserializeGame(JSON.parse(exportSaveString(stWar)));
`, ctx);
check("a calm playthrough's price level drifts modestly",
  G("calmLevel") > 1.5 && G("calmLevel") < 6, "×" + G("calmLevel").toFixed(2) + " after 60y");
check("a war visibly inflates prices vs the same calm seed",
  G("warLevel") > G("calmLevel") * 1.1,
  "calm ×" + G("calmLevel").toFixed(2) + " vs war ×" + G("warLevel").toFixed(2));
check("war happened exactly once and ended within its cap",
  G("stWar").war && G("stWar").war.happened && !G("stWar").war.active && G("stWar").war.years <= 10,
  G("stWar").war ? G("stWar").war.startYear + " for " + G("stWar").war.years + "y" : "no war");
check("war state & price level survive save/load",
  G("roundW").war && G("roundW").war.happened && G("roundW").war.peak === G("stWar").war.peak &&
  Math.abs(G("roundW").econ.priceLevel - G("stWar").econ.priceLevel) < 1e-6);

// ---- v0.5 water map: every river reaches the sea, water invariants ----
vm.runInContext(`
  var riverSeedResults = [];
  for (var _seed of [1, 2026, 90210, 424242, 31415926]) {
    var stW = newGame(_seed, { aiCount: 0 });
    var W = CFG.MAP_W, Hh = CFG.MAP_H;
    var seaN = 0, riverN = 0, lakeN = 0, badRiver = 0;
    // flood-fill: which water hexes connect (through river/sea/canal/moat/lake) to a sea hex?
    var wet = i => ["river","sea","lake","canal","moat"].includes(stW.hexes[i].terrain);
    var reach = new Set(), q = [];
    for (var i = 0; i < stW.hexes.length; i++) {
      var t = stW.hexes[i].terrain;
      if (t === "sea") { seaN++; reach.add(i); q.push(i); }
      else if (t === "river") riverN++;
      else if (t === "lake") lakeN++;
    }
    while (q.length) {
      var cur = q.pop(), cc = cur % W, rr = (cur / W) | 0;
      for (var d = 0; d < 6; d++) {
        var nb = hexNeighbor(cc, rr, d);
        if (nb >= 0 && wet(nb) && !reach.has(nb)) { reach.add(nb); q.push(nb); }
      }
    }
    for (var i = 0; i < stW.hexes.length; i++)
      if (stW.hexes[i].terrain === "river" && !reach.has(i)) badRiver++;
    riverSeedResults.push({ seed: _seed, seaN, riverN, lakeN, badRiver });
  }
`, ctx);
{
  const rs = G("riverSeedResults");
  check("Tokyo Bay carved in every seed (sea hexes present)", rs.every(r => r.seaN > 30),
    rs.map(r => r.seed + ":" + r.seaN).join(" "));
  check("rivers exist in every seed", rs.every(r => r.riverN > 50),
    rs.map(r => r.seed + ":" + r.riverN).join(" "));
  check("every river hex drains to the sea (5 seeds)", rs.every(r => r.badRiver === 0),
    rs.map(r => r.seed + ":" + r.badRiver + " orphaned").join(" "));
}

// ---- v0.5 reclamation lifecycle & causeway/bridge pricing ----
vm.runInContext(`
  var stR = newGame(424242, { aiCount: 0 });
  var pR = stR.companies[0]; pR.cash = 5e6;
  var seaIdx = stR.hexes.findIndex(h => h.terrain === "sea");
  var riverIdx = stR.hexes.findIndex(h => h.terrain === "river");
  var seaPrice = landPrice(stR, seaIdx);
  var buySea = buyLand(stR, pR, seaIdx);
  var reclaimRiver = reclaimLand(stR, pR, riverIdx);         // rivers can never be filled
  var quote = reclaimLand(stR, pR, seaIdx, true);
  var startR = reclaimLand(stR, pR, seaIdx);
  var jobR = stR.builds.find(b => b.kind === "reclaim");
  var midTerrain = null;
  if (jobR) {
    for (var d = 0; d < 5; d++) processBuilds(stR);          // a few days in…
    midTerrain = stR.hexes[seaIdx].terrain;                  // …still water mid-fill
    for (var d = 0; d < quote.days * 4 && stR.builds.some(b => b.kind === "reclaim"); d++) processBuilds(stR);
  }
  var doneTerrain = stR.hexes[seaIdx].terrain;
  var doneOwner = stR.hexes[seaIdx].owner;
  var roundRec = deserializeGame(JSON.parse(exportSaveString(stR)));
  // station on a river (bridge) costs the trestle premium over the same station on grass
  var grassIdx = stR.hexes.findIndex(h => h.terrain === "grass" && !h.dev && h.owner === -1);
  var costGrass = stationCost(stR, grassIdx), costRiver = stationCost(stR, riverIdx);
`, ctx);
check("open water has zero land value & can't be bought",
  G("seaPrice") === 0 && G("buySea").ok === false, "price " + G("seaPrice"));
check("rivers can't be reclaimed", G("reclaimRiver").ok === false, G("reclaimRiver").msg);
check("sea reclamation quotes era cost & duration",
  G("quote").ok && G("quote").cost > 0 && G("quote").days > 100,
  G("quote").ok ? Math.round(G("quote").cost) + " yen, " + G("quote").days + "d" : G("quote").msg);
check("reclamation starts: paid, lot claimed, job queued",
  G("startR").ok && G("jobR") && G("stR").hexes[G("seaIdx")].owner === 0, G("startR").msg);
check("mid-fill the hex is still water", G("midTerrain") === "sea", "" + G("midTerrain"));
check("finished reclamation turns sea into buildable grass",
  G("doneTerrain") === "grass" && G("doneOwner") === 0, G("doneTerrain"));
check("reclaimed hex survives save/load",
  G("roundRec").hexes[G("seaIdx")].terrain === "grass" && G("roundRec").hexes[G("seaIdx")].owner === 0);
check("station on a bridge hex costs the trestle premium",
  G("costRiver") > G("costGrass") * (CFG_get("STATION.bridgeMult") - 0.2),
  Math.round(G("costRiver")) + " vs " + Math.round(G("costGrass")) + " on grass");

// ---- v0.5 kaidō corridors: 4 named routes, rights, era evolution ----
vm.runInContext(`
  var stK = newGame(424242, { aiCount: 0 });
  var pK = stK.companies[0]; pK.cash = 5e6;
  var kRoutes = {};
  var kIsolated = 0, kGov = 0, kBadOwner = 0;
  for (var i = 0; i < stK.hexes.length; i++) {
    var h = stK.hexes[i];
    if (!h.kaido) continue;
    kRoutes[h.kaido.route] = (kRoutes[h.kaido.route] || 0) + 1;
    if (!neighborsOf(i).some(nb => stK.hexes[nb].kaido)) kIsolated++;
    if (h.owner === -3) kGov++;
    else if (h.owner !== -1 && h.owner !== -2) kBadOwner++;   // gen-time cons never own the road
  }
  var kIdx = stK.hexes.findIndex(h => h.kaido && h.owner === -3 && !CFG.TERRAIN[h.terrain].bridge);
  var kBuy = buyLand(stK, pK, kIdx);
  var rightsQ = kaidoRightsCost(stK, kIdx);
  var quoteK = buildTrackHex(stK, pK, kIdx, true);           // rights bundled into the quote
  var buildK = buildTrackHex(stK, pK, kIdx);
  var gotRights = hasKaidoRights(stK.hexes[kIdx], pK.id);
  var roundK = deserializeGame(JSON.parse(exportSaveString(stK)));
  var rightsSurvive = hasKaidoRights(roundK.hexes[kIdx], pK.id);
  // era evolution: dirt in Meiji, paving spreads by 1952, expressway core by 1970
  var st1952 = newGame(424242, { aiCount: 0 }); st1952.time.totalDays = (1952 - 1872) * 12; syncClock(st1952); updateKaido(st1952);
  var st1970 = newGame(424242, { aiCount: 0 }); st1970.time.totalDays = (1970 - 1872) * 12; syncClock(st1970); updateKaido(st1970);
  function stateNear(st2, dLo, dHi) {   // most-advanced kaidō state in a distance band
    var c = hexIdx(CFG.CENTER.col, CFG.CENTER.row), rank = { dirt: 0, paved: 1, highway: 2 }, best = "dirt";
    for (var i = 0; i < st2.hexes.length; i++) {
      var h = st2.hexes[i];
      if (!h.kaido) continue;
      var d = hexDist(i, c);
      if (d >= dLo && d <= dHi && rank[h.kaido.state] > rank[best]) best = h.kaido.state;
    }
    return best;
  }
  var meijiState = stateNear(stK, 0, 99);
  var s1952near = stateNear(st1952, 0, 8), s1970near = stateNear(st1970, 0, 8);
  var altNear = kaidoAltMult(st1970, kIdx);
`, ctx);
check("all four kaidō generated with real length",
  ["tokaido", "koshu", "nikko", "oshu"].every(r => (G("kRoutes")[r] || 0) >= 10), JSON.stringify(G("kRoutes")));
check("no isolated kaidō hex; road land is government-held",
  G("kIsolated") === 0 && G("kGov") > 50 && G("kBadOwner") === 0,
  G("kIsolated") + " isolated, " + G("kGov") + " gov-owned");
check("kaidō land can never be bought", G("kBuy").ok === false, G("kBuy").msg);
check("track across the kaidō bundles crossing rights into the quote",
  G("quoteK").ok && G("quoteK").landCost === G("rightsQ") && G("rightsQ") > 0,
  "rights " + G("rightsQ") + ", quote landCost " + (G("quoteK").landCost || "?"));
check("building across grants persistent rights (hex stays government)",
  G("buildK").ok && G("gotRights") && G("stK").hexes[G("kIdx")].owner === -3);
check("crossing rights survive save/load", G("rightsSurvive") === true);
check("kaidō are all dirt in Meiji", G("meijiState") === "dirt", G("meijiState"));
check("paving reaches the inner corridor by 1952", G("s1952near") === "paved", G("s1952near"));
check("expressway core by 1970", G("s1970near") === "highway", G("s1970near"));
check("a nearby highway strengthens the non-rail alternative",
  G("altNear") < 1, "altMult " + G("altNear"));

// ---- v0.5 loans & bankruptcy: credit cap, interest math, arrears spiral ----
vm.runInContext(`
  var stB = newGame(424242, { aiCount: 0 });
  var pB = stB.companies[0];
  var limB = creditLimitOf(stB, pB);
  var overAsk = borrowLoan(stB, pB, limB * 10);            // ask far beyond the cap
  var capHeld = pB.debt === limB && availableCredit(stB, pB) === 0;
  var deniedMore = borrowLoan(stB, pB, 1000).ok;           // line exhausted
  // interest: one tick = one month at rate/12 of principal
  var cashBefore = pB.cash;
  var expectInt = pB.debt * pB.rate / CFG.DAYS_PER_YEAR;
  dailyTick(stB);
  var gotInt = stB.companies[0].stats.interestToday;
  var repayHalf = repayLoan(stB, pB, Math.round(pB.debt / 2));
  var debtAfterRepay = pB.debt;
  var roundB = deserializeGame(JSON.parse(exportSaveString(stB)));
  // 3-year arrears spiral → sell-out: land generates a tax bill the player
  // can never pay (no cash), and the line is pre-exhausted so the compulsory
  // loan can't save them
  var stS = newGame(424242, { aiCount: 0 });
  var pS = stS.companies[0];
  pS.cash = 0; pS.debt = creditLimitOf(stS, pS) + 1e7;     // hopelessly over-borrowed
  var spiral = [];
  for (var y = 0; y < 3; y++) { stS.time.totalDays += 12; syncClock(stS); onNewYear(stS); pS.cash = 0; spiral.push(pS.delinquentYears); }
  var soldOut = stS.ended && stS.endReason === "sellout";
  // …and the same spiral WITH credit ends in a compulsory loan instead
  var stC = newGame(424242, { aiCount: 0 });
  var pC = stC.companies[0];
  pC.cash = 0;                                             // broke but with a clean credit line
  for (var y = 0; y < 3; y++) { stC.time.totalDays += 12; syncClock(stC); onNewYear(stC); if (y < 2) pC.cash = 0; }
  var compulsory = !stC.ended && pC.debt > 0 && pC.taxArrears === 0;
`, ctx);
check("borrowing is capped at the credit limit", G("capHeld") && G("overAsk").ok,
  "debt " + G("pB").debt + " = limit " + G("limB"));
check("an exhausted line refuses further credit", G("deniedMore") === false);
check("interest accrues monthly at rate/12", Math.abs(G("gotInt") - G("expectInt")) < 1,
  G("gotInt").toFixed(0) + " vs expected " + G("expectInt").toFixed(0));
check("repayment reduces principal", G("repayHalf").ok && G("debtAfterRepay") < G("limB"));
check("debt & credit terms survive save/load",
  G("roundB").companies[0].debt === G("debtAfterRepay") &&
  G("roundB").companies[0].rate === G("pB").rate);
check("3 delinquent years with no credit → sell-out game over",
  G("soldOut") && G("spiral")[2] >= 3, "delinquent years: " + G("spiral").join(","));
check("3 delinquent years WITH credit → compulsory loan, game continues",
  G("compulsory"), "debt " + G("pC").debt + ", arrears " + G("pC").taxArrears + ", ended " + G("stC").ended);

// ---- v0.5 explicit alternative modes: era progression & monopoly cap ----
vm.runInContext(`
  function altBest(era, crow, votc, roadMult, infl) {
    var best = Infinity;
    for (const m of CFG.PAX.ALT_MODES[era]) {
      var gc = votc * (m.access + crow * m.minPerKm * (m.road ? roadMult : 1)) + crow * m.yenPerKm * infl;
      if (gc < best) best = gc;
    }
    return best;
  }
  // per-km effective alt cost (time-equivalent) across eras at a 10-hex trip
  var effByEra = {};
  for (const [era, votc, infl] of [["meiji",0.15,1],["taisho",0.3,1.4],["showa1",0.6,2.5],
                                   ["showa2",6,30],["heisei",22,90],["reiwa",26,100]]) {
    effByEra[era] = altBest(era, 10, votc, 1, infl) / (10 * votc);   // ≈ min/km equivalent
  }
  // highway cheapens the car alternative (roadMult 0.72 vs 1) in late eras
  var carEraGap = altBest("showa2", 10, 6, 1, 30) - altBest("showa2", 10, 6, 0.72, 30);
  var meijiGap = altBest("meiji", 10, 0.15, 0.72, 1) - 0;   // sanity only
`, ctx);
{
  const eff = G("effByEra");
  check("alt generalized cost falls across eras (walk→bus→car)",
    eff.meiji > eff.showa1 && eff.showa1 > eff.showa2 && eff.showa2 >= eff.reiwa,
    Object.entries(eff).map(([k, v]) => k + ":" + v.toFixed(1)).join(" "));
  check("effective curve near the tuned v0.4 targets (18/16/14/9/8/8 ±35%)",
    Math.abs(eff.meiji / 18 - 1) < 0.35 && Math.abs(eff.taisho / 16 - 1) < 0.35 &&
    Math.abs(eff.showa1 / 14 - 1) < 0.35 && Math.abs(eff.showa2 / 9 - 1) < 0.35 &&
    Math.abs(eff.heisei / 8 - 1) < 0.35 && Math.abs(eff.reiwa / 8 - 1) < 0.35,
    Object.entries(eff).map(([k, v]) => k + ":" + v.toFixed(1)).join(" "));
  check("a highway visibly cheapens the late-era car alternative",
    G("carEraGap") > 0, "gap " + G("carEraGap").toFixed(1) + " yen-equivalent");
}
// monopoly cap: with the SAME corridor, jacking the fare far above comfort
// collapses ridership (riders defect to the alternative) — reuses stL from the
// affordability block above where demandPricey << demandCheap was asserted.
check("monopoly fares stay capped by the alternative (riders defect, not vanish)",
  G("demandPricey") < G("demandCheap") * 0.75,
  G("demandPricey").toFixed(0) + " vs " + G("demandCheap").toFixed(0));

// ---- v0.5 fare de-indexing & crew-aware skip ----
vm.runInContext(`
  var stF = newGame(424242, { aiCount: 0 });
  var pF = stF.companies[0];
  stF.lines.push({ id: 0, co: pF.id, name: "pinned", alive: true, fare: 0.25, fareOverride: true,
    path: [], stations: [], stops: {}, trains: [], demand: 0, capacity: 0, desirability: 1 });
  stF.lines.push({ id: 1, co: pF.id, name: "follower", alive: true, fare: 0.06, fareOverride: false,
    path: [], stations: [], stops: {}, trains: [], demand: 0, capacity: 0, desirability: 1 });
  // v0.6: the default fare is NEVER inflation-indexed — even before the player
  // touches it, it stays at the founding-year rate until changed by hand
  var foundingDefault = pF.defaultFarePerKm;
  for (var y0 = 0; y0 < 3; y0++) { stF.time.totalDays += 12; syncClock(stF); onNewYear(stF); }
  var unsetDefaultAfterYears = pF.defaultFarePerKm;
  setCompanyDefaultFare(stF, pF, 0.31);            // pinned company default
  stF.lines[1].fareOverride = false;
  for (var y = 0; y < 5; y++) { stF.time.totalDays += 12; syncClock(stF); onNewYear(stF); }
  var pinnedFare = stF.lines[0].fare, pinnedDefault = pF.defaultFarePerKm, followerFare = stF.lines[1].fare;
  // crew-aware skip: queue (crews + 2) one-hex civil jobs; the naive per-job
  // estimate says total/progress days, the crew-aware figure must cover the
  // queue tail that waits for a free crew
  var stQ = newGame(424242, { aiCount: 0 });
  var pQ = stQ.companies[0]; pQ.cash = 1e9;
  var crewsNow = CFG.TRACK.crewsByEra[eraOf(stQ.time.year).key];
  var qJobs = crewsNow + 2;
  var qHexes = [];
  for (var i = 0; i < stQ.hexes.length && qHexes.length < qJobs; i++) {
    var h = stQ.hexes[i];
    if (h.owner === -1 && !h.track && !h.stations.length && !h.kaido && st.hexes[i] &&
        CFG.TERRAIN[h.terrain].buildable && h.terrain === "grass" && !isNationalLand(i)) qHexes.push(i);
  }
  for (const i of qHexes) buildTrackHex(stQ, pQ, i);
  var queued = stQ.builds.filter(b => b.co === pQ.id).length;
  var skipDays = daysToNextCompletion(stQ, pQ);
  var perJobDays = stQ.builds[0].daysPerHex / CFG.CAL_DAYS_PER_SIM_DAY;
  // fast-forward exactly skipDays: the FIRST job must be done, and with more
  // jobs than crews the LAST job must still be pending (it was waiting)
  for (var d = 0; d < skipDays; d++) processBuilds(stQ);
  var doneAfterSkip = queued - stQ.builds.filter(b => b.co === pQ.id).length;
`, ctx);
check("pinned line fare stays exactly where set across years (no re-indexing)",
  G("pinnedFare") === 0.25 && G("pinnedDefault") === 0.31, G("pinnedFare") + " / " + G("pinnedDefault"));
check("the untouched default fare never rises with inflation (v0.6)",
  G("unsetDefaultAfterYears") === G("foundingDefault"),
  G("foundingDefault") + " → " + G("unsetDefaultAfterYears"));
check("a line following the company default tracks the default itself",
  G("followerFare") === 0.31, "" + G("followerFare"));   // follows the (pinned) company default
check("crew-aware skip lands on the first real completion",
  G("queued") >= 3 && G("skipDays") >= 1 && G("doneAfterSkip") >= 1 && G("doneAfterSkip") < G("queued"),
  G("queued") + " queued, skip " + G("skipDays") + "d → " + G("doneAfterSkip") + " done");

// ---- Phase 8: sound hooks — semantic SFX queued at key player moments ----
vm.runInContext(`
  var stSfx = newGame(20260707, { aiCount: 1 });
  var pSfx = stSfx.companies.find(c => c.isPlayer);
  stSfx.awardsLast = { year: 1872, results: [] };
  function drainSfx() { var q = (stSfx.sfxQueue || []).slice(); stSfx.sfxQueue = []; return q; }
  var sfxStart = (stSfx.sfxQueue || []).includes("game_start");   // fresh game announces itself
  drainSfx();
  borrowLoan(stSfx, pSfx, 50000); var sfxLoan = drainSfx();
  repayLoan(stSfx, pSfx, 10000);  var sfxRepay = drainSfx();
  // grant the player a parcel, then sell it back to the market
  var freeHex = stSfx.hexes.findIndex(h => h.owner === -1 && !h.track && !h.stations.length && CFG.TERRAIN[h.terrain].buildable);
  stSfx.hexes[freeHex].owner = pSfx.id; pSfx.land.push(freeHex);
  sellLand(stSfx, pSfx, freeHex); var sfxSell = drainSfx();
  grantAward(stSfx, pSfx, "Best Employer", {});                 var sfxGood = drainSfx();
  grantAward(stSfx, pSfx, "Worst Employer", { bad: true });      var sfxBad  = drainSfx();
  grantAward(stSfx, pSfx, "Milestone — First 10 stations", {});  var sfxMile = drainSfx();
  // a rival (not the player) winning an award must stay silent for the player
  createCompany(stSfx, { name: "Rival Rail", color: "#888", isPlayer: false, founded: 1872, cash: 500000, gauge: CFG.START_GAUGES[0] });
  var aiCo = stSfx.companies.find(c => !c.isPlayer);
  grantAward(stSfx, aiCo, "Best Employer", {});                  var sfxAi = drainSfx();
`, ctx);
check("a fresh game queues game_start", G("sfxStart"));
check("borrowing queues loan_drawn", G("sfxLoan").includes("loan_drawn"), G("sfxLoan").join(","));
check("repaying queues loan_repaid", G("sfxRepay").includes("loan_repaid"), G("sfxRepay").join(","));
check("selling land queues land_sold", G("sfxSell").includes("land_sold"), G("sfxSell").join(","));
check("a good award queues award_good", G("sfxGood").includes("award_good"), G("sfxGood").join(","));
check("a bad award queues award_bad", G("sfxBad").includes("award_bad"), G("sfxBad").join(","));
check("a milestone queues milestone", G("sfxMile").includes("milestone"), G("sfxMile").join(","));
check("a rival's award stays silent for the player", G("sfxAi").length === 0, G("sfxAi").join(","));

// ---- Phase 11: London campaign ----
vm.runInContext(`
  var stLon = newGame(51863, { aiCount: 3, campaign: "london" });
  var cIdx = 25 * 50 + 25;
  var lonNames = stLon.hexes.map(h => h.name);
  var lonUnique = new Set(lonNames).size;
  var lonRivers = stLon.hexes.filter(h => h.terrain === "river").length;
  var lonSea = stLon.hexes.filter(h => h.terrain === "sea").length;
  var lonNumbered = lonNames.filter(n => /^London \\d+$/.test(n)).length;
  var lonAscii = lonNames.every(n => /^[\\x00-\\x7F]+$/.test(n));   // Latin-only, no kanji
  var seismicRnd = canResearch(stLon, stLon.companies[0], "taishin_rnd");
  // advance ~50 years headlessly: the game must run and never log an earthquake
  function ticksL(n) {
    for (let d = 0; d < n; d++) {
      stLon.time.totalDays++; syncClock(stLon);
      if (stLon.time.day === 0) onNewYear(stLon);
      dailyEvents(stLon); dailyTick(stLon);
      for (const co of stLon.companies) if (co.alive && !co.isPlayer) aiTick(stLon, co);
    }
  }
  ticksL(60 * 12);
  // actual quake events always say "earthquake"; the 1924 building-code
  // revision merely MENTIONS "post-quake" and must not count as one
  var lonQuakes = stLon.events.log.filter(e => /earthquake/i.test(e.text)).length;
  var lonPlayerAlive = stLon.companies[0].alive;
  var lonTaishinAuto = stLon.companies[0].research.done.includes("taishin_rnd");
  var lonDevAuto = stLon.companies[0].research.done.includes("devmodel");
`, ctx);
check("London game flags its campaign", G("stLon").campaign === "london");
check("London centre is Westminster (Parliament), un-buyable public land",
  G("stLon").hexes[G("cIdx")].name === "Westminster (Parliament)" && G("stLon").hexes[G("cIdx")].owner === -2,
  G("stLon").hexes[G("cIdx")].name + " owner " + G("stLon").hexes[G("cIdx")].owner);
// v0.5.3: London has NO sea (the estuary is beyond the map) — the Thames
// itself spans the map west edge to east edge
check("London has a Thames and no sea (v0.5.3 geography)",
  G("lonRivers") > 20 && G("lonSea") === 0, "rivers " + G("lonRivers") + " sea " + G("lonSea"));
check("every London hex has a unique Latin-only place name",
  G("lonUnique") === 2500 && G("lonNumbered") === 0 && G("lonAscii"),
  G("lonUnique") + " unique, " + G("lonNumbered") + " numbered, ascii=" + G("lonAscii"));
check("historic London districts are present (Mayfair, Soho, Southwark)",
  ["Mayfair", "Soho", "Southwark"].every(n => G("lonNames").includes(n)));
check("monarch eras display for London (Victorian → Carolean)",
  G("eraDisplayName(stLon, 1872)") === "Victorian" && G("eraDisplayName(stLon, 2025)") === "Carolean" &&
  G("eraDisplayName(stLon, 1905)") === "Edwardian");
check("earthquakes are disabled in the London campaign", G("majorQuakeAllowed(stLon)") === false);
check("seismic R&D is off the board in London", typeof G("seismicRnd") === "string");
check("the seismic industry standard is never auto-granted in London (other standards are)",
  !G("lonTaishinAuto") && G("lonDevAuto"));
check("no earthquake ever fires across ~60 London years", G("lonQuakes") === 0, G("lonQuakes") + " quake log lines");
check("a London game runs the decades without the player collapsing", G("lonPlayerAlive"));
// save/load preserves the campaign and regenerates the London (not Tokyo) map
vm.runInContext(`
  var lonSave = importSaveString(exportSaveString(stLon));
`, ctx);
check("London save round-trips its campaign and map",
  G("lonSave").campaign === "london" &&
  G("lonSave").hexes[G("cIdx")].name === "Westminster (Parliament)" &&
  G("lonSave").hexes.filter(h => h.terrain === "river").length === G("lonRivers"),
  G("lonSave").campaign);

// ---- v0.5.1: London roads, English names, £ currency ----
vm.runInContext(`
  var lonRoadHexes = stLon.hexes.filter(h => h.kaido);
  var lonRouteKeys = [...new Set(lonRoadHexes.map(h => h.kaido.route))];
  var lonKeysOk = lonRouteKeys.length && lonRouteKeys.every(k => ["gnr","watling","bath","dover","portsmouth"].includes(k));
  var lonRouteNames = lonRouteKeys.map(k => CFG.KAIDO.ROUTES[k].name);
  var lonHoldouts = stLon.hexes.filter(h => h.owner === -2 && h.holdout).map(h => h.holdout);
  var lonHoldoutsAscii = lonHoldouts.length > 0 && lonHoldouts.every(n => /^[\\x00-\\x7F]+$/.test(n));
  var lonRivalsEnglish = stLon.companies.slice(1).every(c => CFG.AI.namesLondon.includes(c.name)) &&
                         stLon.companies.length > 1;
  // south-bank roads: at least one road hex lies below the Thames row band
  var lonSouthRoad = lonRoadHexes.some(h => h.kaido.route === "dover" || h.kaido.route === "portsmouth");
`, ctx);
check("London has government roads (turnpikes) like the Tokyo kaidō",
  G("lonKeysOk") && G("lonRoadHexes").length > 20,
  G("lonRoadHexes").length + " road hexes: " + G("lonRouteNames").join(" / "));
check("London roads include the south-bank Dover/Portsmouth routes", G("lonSouthRoad"));
check("London holdout landowners have English names", G("lonHoldoutsAscii"),
  (G("lonHoldouts")[0] || "none"));
check("London rivals carry English company names", G("lonRivalsEnglish"),
  G("stLon").companies.slice(1).map(c => c.name).join(", "));
vm.runInContext(`
  var stCurT = newGame(9, { aiCount: 0 });                            var curTok = fmtYen(10);
  var stCurL = newGame(9, { aiCount: 0, campaign: "london" });        var curLon = fmtYen(10);
  var stCurBack = importSaveString(exportSaveString(stCurT));         var curBack = fmtYen(10);
`, ctx);
check("a Tokyo game prices in ¥", G("curTok") === "¥10", G("curTok"));
check("a London game prices in £", G("curLon") === "£10", G("curLon"));
check("loading a Tokyo save switches the currency back to ¥", G("curBack") === "¥10", G("curBack"));

// ---- v0.5.1: water invariants — sea reaches the map edge, every river
// reaches the sea (confluences allowed), channels never 2 hexes wide ----
vm.runInContext(`
  function waterCheck(state) {
    const hx = state.hexes;
    const edge = i => { const c = i % 50, r = (i / 50) | 0; return c === 0 || c === 49 || r === 0 || r === 49; };
    const seaEdge = hx.some((h, i) => h.terrain === "sea" && edge(i));
    let orphans = 0, triangles = 0;
    const seen = new Set();
    for (let i = 0; i < hx.length; i++) {
      if (hx[i].terrain !== "river" || seen.has(i)) continue;
      const comp = [i]; seen.add(i); let wet = false;
      for (let q = 0; q < comp.length; q++) for (const nb of neighborsOf(comp[q])) {
        if (hx[nb].terrain === "sea") wet = true;
        if (hx[nb].terrain === "river" && !seen.has(nb)) { seen.add(nb); comp.push(nb); }
      }
      if (!wet) orphans++;
    }
    for (let i = 0; i < hx.length; i++) {
      if (hx[i].terrain !== "river") continue;
      const rnb = neighborsOf(i).filter(j => j > i && hx[j].terrain === "river");
      for (let a = 0; a < rnb.length; a++) for (let b = a + 1; b < rnb.length; b++) {
        if (neighborsOf(rnb[a]).includes(rnb[b])) triangles++;
      }
    }
    return { seaEdge, orphans, triangles };
  }
  var waterSeeds = [11, 222, 3333, 44444, 424242];
  var waterRes = waterSeeds.map(s => waterCheck(newGame(s, { aiCount: 0 })));
  var waterLon = waterCheck(stLon);
  var waterAllEdge = waterRes.every(r => r.seaEdge);
  var waterAllWet = waterRes.every(r => r.orphans === 0);
  var waterAllThin = waterRes.every(r => r.triangles === 0);
`, ctx);
check("the sea reaches the map edge in every tested Tokyo seed", G("waterAllEdge"),
  JSON.stringify(G("waterRes").map(r => r.seaEdge)));
check("every Tokyo river reaches the sea (no landlocked channels)", G("waterAllWet"),
  JSON.stringify(G("waterRes").map(r => r.orphans)));
check("no Tokyo river is wider than one hex", G("waterAllThin"),
  JSON.stringify(G("waterRes").map(r => r.triangles)));
// London (v0.5.3): no sea — the Thames drains off the EAST map edge instead,
// entering at the west edge, one connected channel, never 2 hexes wide
vm.runInContext(`
  var thamesWest = stLon.hexes.some(h => h.terrain === "river" && h.col === 0);
  var thamesEast = stLon.hexes.some(h => h.terrain === "river" && h.col === 49);
`, ctx);
check("the Thames spans the London map west edge to east edge",
  G("thamesWest") && G("thamesEast"), "west " + G("thamesWest") + " east " + G("thamesEast"));
check("the Thames stays one hex wide", G("waterLon").triangles === 0,
  JSON.stringify(G("waterLon")));

// ---- v0.5.1: depots gate fleet size; deleting a line without one sells the trains ----
vm.runInContext(`
  var stD = newGame(777, { aiCount: 0 });
  var pD = stD.companies[0];
  pD.cash = 1e9;
  function fabStation(hex, name) {
    var s = { id: stD.stations.length, co: pD.id, hex, cars: 3, name, builtYear: 1872,
      board: 0, boardAvg: 0, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 0, commerceBuilding: 0, commercePending: 0, platBuilding: 0, platPending: 0,
      renewed: 1872, taishin: 0, taishinBuilding: 0, taishinPending: 0 };
    stD.stations.push(s); stD.hexes[hex].stations.push(s.id);
    return s;
  }
  function fabLine(a, b, path) {
    var l = { id: stD.lines.length, co: pD.id, name: a.name + "-" + b.name, path,
      stations: [a.id, b.id], stops: {}, type: "local", loop: false, fare: 1, fareOverride: false,
      gaugeMm: CFG.GAUGES[pD.gauge].mm, elec: false, trains: [],
      capacity: 0, demand: 0, board: 0, served: 0, desirability: 1, alive: true };
    l.stops[a.id] = true; l.stops[b.id] = true;
    stD.lines.push(l);
    return l;
  }
  var sA = fabStation(100, "A"), sB = fabStation(102, "B");
  var lAB = fabLine(sA, sB, [100, 101, 102]);
  var tType = trainTypesFor(stD, pD, lAB)[0];
  var bd1 = buyTrain(stD, pD, lAB.id, tType);
  var bd2 = buyTrain(stD, pD, lAB.id, tType);
  var bd3 = buyTrain(stD, pD, lAB.id, tType);        // must hit the no-depot cap
  // deleting a second 1-train line with NO depot sells the stock automatically
  var sC = fabStation(200, "C"), sE = fabStation(202, "E");
  var lCE = fabLine(sC, sE, [200, 201, 202]);
  buyTrain(stD, pD, lCE.id, tType);
  var cashBeforeDel = pD.cash;
  var delNoDepot = removeLine(stD, pD, lCE.id);
  var soldGotPaid = pD.cash > cashBeforeDel;
  var storedAfterSale = stD.trains.filter(t => t.alive && t.stored && t.co === pD.id).length;
  // build a depot: owned land carrying own track
  var depHex = -1;
  for (let i = 0; i < stD.hexes.length && depHex < 0; i++) {
    const h = stD.hexes[i];
    if (h.owner === -1 && CFG.TERRAIN[h.terrain].buildable && !h.kaido && !h.stations.length && !h.track && h.terrain === "grass") depHex = i;
  }
  stD.hexes[depHex].owner = pD.id; pD.land.push(depHex);
  stD.hexes[depHex].track = { co: pD.id, gauge: pD.gauge, elec: false, tunnel: false, dmg: 0,
    rails: [{ gauge: pD.gauge, elec: false, building: false }], built: 1872 };
  var rDep = buildDepot(stD, pD, depHex, false);
  if (rDep.ok) stD.stations[rDep.station.id].building = 0;    // fast-complete the yard
  var hasDep = companyHasDepot(stD, pD);
  var bd4 = buyTrain(stD, pD, lAB.id, tType);                 // 3rd train now allowed
  // moving a train to the depot WITHOUT deleting the line
  var storeR = storeTrain(stD, pD, lAB.trains[0]);
  var lineStillAlive = lAB.alive && lAB.trains.length === 2;
  var storedNow = stD.trains.filter(t => t.alive && t.stored && t.co === pD.id).length;
  // deleting a line WITH a depot stores its trains
  var delWithDepot = removeLine(stD, pD, lAB.id);
  var storedFinal = stD.trains.filter(t => t.alive && t.stored && t.co === pD.id).length;
`, ctx);
check("two trains fit on a line without a depot", G("bd1").ok && G("bd2").ok);
check("the third train is refused without a depot", !G("bd3").ok && /depot/i.test(G("bd3").msg || ""), G("bd3").msg);
check("deleting a line with no depot sells its trains for cash", G("delNoDepot").sold === 1 && G("soldGotPaid") &&
  G("storedAfterSale") === 0, JSON.stringify(G("delNoDepot")));
check("a finished yard counts as a depot", G("rDep").ok && G("hasDep"));
check("with a depot the fleet can grow past the cap", G("bd4").ok, G("bd4").msg);
check("a running train can be pulled into the depot without deleting the line",
  G("storeR").ok && G("lineStillAlive") && G("storedNow") === 1);
check("deleting a line with a depot stores its trains", G("delWithDepot").stored === 2 && G("storedFinal") === 3,
  JSON.stringify(G("delWithDepot")) + " stored " + G("storedFinal"));

// ---- v0.5.1: the kaidō itself seeds growth (commerce beside it, houses a ring out) ----
vm.runInContext(`
  var stK = newGame(888, { aiCount: 0 });
  var kaidoNear = new Set();
  for (let i = 0; i < stK.hexes.length; i++) {
    if (!stK.hexes[i].kaido) continue;
    for (const j of hexesWithin(i, 2)) if (!stK.hexes[j].kaido) kaidoNear.add(j);
  }
  function devScore() {
    let s = 0;
    for (const j of kaidoNear) { const h = stK.hexes[j]; if (h.cons) s += 1 + h.dev; }
    return s;
  }
  var kBefore = devScore();
  for (let m = 0; m < 240; m++) monthlyGrowth(stK);   // 20 years of months, no stations at all
  var kAfter = devScore();
`, ctx);
check("roadside land develops along the kaidō without any rail service",
  G("kAfter") > G("kBefore"), G("kBefore") + " → " + G("kAfter"));

// ---- v0.5.1: pre-v10 saves are declined (map generation changed) ----
vm.runInContext(`
  var v9Rejected = false;
  try { importSaveString(JSON.stringify({ v: 9, seed: 1 })); } catch (e) { v9Rejected = true; }
`, ctx);
check("a v9 save is declined with the map-change message", G("v9Rejected"));

// ---- v0.5.6: NYC & Melbourne campaigns (registry, maps, saves) ----
vm.runInContext(`
  var stNyc = newGame(60466, { aiCount: 3, campaign: "nyc" });
  var curNyc = fmtYen(10);
  var stMel = newGame(60467, { aiCount: 3, campaign: "melbourne" });
  var curMel = fmtYen(10);
  var nycWater = waterCheck(stNyc);
  var melWater = waterCheck(stMel);
  var nycRoads = new Set(); for (const h of stNyc.hexes) if (h.kaido) nycRoads.add(h.kaido.route);
  var melRoads = new Set(); for (const h of stMel.hexes) if (h.kaido) melRoads.add(h.kaido.route);
  var nycNamesAscii = stNyc.hexes.every(h => !h.name || /^[\\x20-\\x7E\\u2019]+$/.test(h.name));
  var melNamesAscii = stMel.hexes.every(h => !h.name || /^[\\x20-\\x7E\\u2019]+$/.test(h.name));
  var nycNoMountain = stNyc.hexes.every(h => h.terrain !== "mountain");
  var melNoMountain = stMel.hexes.every(h => h.terrain !== "mountain");
  var nycRivals = stNyc.pendingAI.every(p => CFG.AI.namesNYC.includes(p.name));
  var melRivals = stMel.pendingAI.every(p => CFG.AI.namesMelb.includes(p.name));
  var nycBack = importSaveString(exportSaveString(stNyc));
  var nycRoundTrip = nycBack.campaign === "nyc" &&
    nycBack.hexes.every((h, i) => h.terrain === stNyc.hexes[i].terrain);
  var melBack = importSaveString(exportSaveString(stMel));
  var melRoundTrip = melBack.campaign === "melbourne" &&
    melBack.hexes.every((h, i) => h.terrain === stMel.hexes[i].terrain);
  var nycOldRejected = false;
  try { importSaveString(JSON.stringify({ v: 11, seed: 1, campaign: "nyc" })); }
  catch (e) { nycOldRejected = true; }
  var unknownCampaignTokyo = importSaveString(JSON.stringify(Object.assign(
    JSON.parse(exportSaveString(stCurT)), { campaign: "atlantis" }))).campaign === "tokyo";
  var eraNyc = eraDisplayName(stNyc, 1980);
  var eraMel = eraDisplayName(stMel, 1900);
`, ctx);
check("an NYC game flags its campaign and prices in $", G("stNyc").campaign === "nyc" && G("curNyc") === "$10", G("curNyc"));
check("a Melbourne game prices in £ (pre-1966)", G("stMel").campaign === "melbourne" && G("curMel") === "£10", G("curMel"));
check("NYC harbor reaches the map edge; rivers drain and stay 1 hex wide",
  G("nycWater").seaEdge && G("nycWater").orphans === 0 && G("nycWater").triangles === 0, JSON.stringify(G("nycWater")));
check("Port Phillip Bay reaches the map edge; the Yarra drains and stays 1 hex wide",
  G("melWater").seaEdge && G("melWater").orphans === 0 && G("melWater").triangles === 0, JSON.stringify(G("melWater")));
check("NYC has its four post roads", ["broadway", "bostonpost", "kingshwy", "albanypost"].every(r => G("nycRoads").has(r)),
  [...G("nycRoads")].join(","));
check("Melbourne has its five arterials", ["sydneyrd", "stkilda", "dandenong", "geelong", "heidelberg"].every(r => G("melRoads").has(r)),
  [...G("melRoads")].join(","));
check("NYC hex names are Latin script", G("nycNamesAscii"));
check("Melbourne hex names are Latin script", G("melNamesAscii"));
check("no mountains outside Tokyo (NYC/Melbourne cap at hills)", G("nycNoMountain") && G("melNoMountain"));
check("NYC rivals draw from the NYC roster", G("nycRivals"));
check("Melbourne rivals draw from the Melbourne roster", G("melRivals"));
check("NYC save round-trips campaign and terrain", G("nycRoundTrip"));
check("Melbourne save round-trips campaign and terrain", G("melRoundTrip"));
check("a pre-v12 NYC save is declined", G("nycOldRejected"));
check("an unknown campaign key falls back to Tokyo on load", G("unknownCampaignTokyo"));
check("NYC 1980 shows the sitting US president (Carter)", G("eraNyc") === "Carter", G("eraNyc"));
check("Melbourne 1900 shows the Land Bust era", G("eraMel") === "Land Bust", G("eraMel"));

// ---- v0.5.6: late AI entrants ("second wind") ----
vm.runInContext(`
  var stLate = newGame(777, { aiCount: 8 });
  var lateEntries = stLate.pendingAI.filter(p => p.year >= 1946);
  var lateAllHard = lateEntries.every(p => p.difficulty === "hard");
`, ctx);
check("late entry windows produce postwar entrants", G("lateEntries").length === 2,
  JSON.stringify(G("lateEntries").map(p => p.year)));
check("late entrants default to the hard AI profile", G("lateAllHard"));

// ---- v0.5.7: growth freeze on company-owned land (§8a) ----
vm.runInContext(`
  var stFz = newGame(9182);
  var pFz = stFz.companies[0];
  // put a busy station down and buy a nearby bare grass hex, then run years
  var stnHex = hexIdx(25, 25);
  stFz.hexes[stnHex].terrain = "grass"; stFz.hexes[stnHex].cons = null; stFz.hexes[stnHex].dev = 0;
  var ownHex = hexIdx(26, 25);
  stFz.hexes[ownHex].terrain = "grass"; stFz.hexes[ownHex].cons = null; stFz.hexes[ownHex].dev = 0; stFz.hexes[ownHex].track = null;
  stFz.hexes[ownHex].owner = pFz.id; pFz.land.push(ownHex);
  var consBefore = stFz.hexes[ownHex].cons, devBefore = stFz.hexes[ownHex].dev;
  for (var y = 0; y < 20; y++) { for (var m = 0; m < 12; m++) { stFz.time.totalDays++; syncClock(stFz); if (stFz.time.day===0) onNewYear(stFz); dailyEvents(stFz); dailyTick(stFz); } }
`, ctx);
check("§8a company-owned land does not spawn/densify on its own",
  G("stFz").hexes[G("ownHex")].cons === G("consBefore") && G("stFz").hexes[G("ownHex")].dev === G("devBefore"),
  "cons=" + G("stFz").hexes[G("ownHex")].cons + " dev=" + G("stFz").hexes[G("ownHex")].dev);

// ---- v0.5.7: building vintage & aging upkeep (§3) ----
vm.runInContext(`
  var stV = newGame(5511);
  // a fresh house built this year vs a very old one nearby
  var young = hexIdx(20, 20), old = hexIdx(21, 20);
  for (const i of [young, old]) { stV.hexes[i].terrain="grass"; stV.hexes[i].cons="house"; stV.hexes[i].dev=2; stV.hexes[i].owner=stV.companies[0].id; stV.companies[0].land.push(i); }
  stV.hexes[young].consYear = stV.time.year;
  stV.hexes[old].consYear = stV.time.year - 80;
  var upYoung = parcelUpkeepYear(stV, young), upOld = parcelUpkeepYear(stV, old);
  var mA = upkeepAgeMult(stV, young), mB = upkeepAgeMult(stV, old);
`, ctx);
check("§3.6 an old un-renovated building costs more upkeep than a fresh one",
  G("upOld") > G("upYoung") && G("mB") > G("mA"), "young×" + G("mA").toFixed(2) + " old×" + G("mB").toFixed(2));
check("§3.6 aging upkeep multiplier is capped", G("mB") <= G("CFG.LAND.VINT.upkeepCap") + 1e-9);

// ---- v0.5.7: negotiable deals (§8c) ----
vm.runInContext(`
  var stD = newGame(7788);
  // hand-make a second (AI) company that owns a bare hex
  var pD = stD.companies[0];
  var aiCo = createCompany(stD, { name:"Rival KK", color:"#cc4444", isPlayer:false, founded:stD.time.year, cash:5e6, gauge:"narrow" });
  aiCo.ai = { plan:null, difficulty: CFG.AI.DEFAULT_DIFFICULTY };
  var dHex = hexIdx(30, 30);
  stD.hexes[dHex].terrain="grass"; stD.hexes[dHex].cons=null; stD.hexes[dHex].dev=0; stD.hexes[dHex].track=null;
  stD.hexes[dHex].owner = aiCo.id; aiCo.land.push(dHex); stD.hexes[dHex].value = landPrice(stD, dHex);
  pD.cash = 1e8;
  var reserve = assetReservation(stD, pD, "hex", dHex);
  var lowball = makeOffer(stD, pD, aiCo, "hex", dHex, Math.round(reserve*0.3));
  var coolBlocked = makeOffer(stD, pD, aiCo, "hex", dHex, Math.round(reserve*1.5));  // cooldown from the rejection
  // wait out the cooldown, then a fair offer transfers the hex
  stD.deals = [];
  var fair = makeOffer(stD, pD, aiCo, "hex", dHex, Math.round(reserve*1.2));
`, ctx);
check("§8c a lowball offer is rejected (and may insult)", G("lowball").ok && !G("lowball").accepted);
check("§8c a fair offer at/above reservation transfers the hex to the buyer",
  G("fair").accepted === true && G("stD").hexes[G("dHex")].owner === G("pD").id,
  "owner=" + G("stD").hexes[G("dHex")].owner + " buyer=" + G("pD").id);

// ---- v0.5.7: per-hex trackage rights let a path cross a rival's track (§8b/§8c) ----
vm.runInContext(`
  var stR = newGame(4242);
  var pR = stR.companies[0];
  var aiR = createCompany(stR, { name:"OtherRail", color:"#44aa44", isPlayer:false, founded:stR.time.year, cash:5e6, gauge:"narrow" });
  var mm = CFG.GAUGES.narrow.mm;
  // a straight 3-hex rival track corridor
  var corridor = [hexIdx(10,10), hexIdx(11,10), hexIdx(12,10)];
  for (const i of corridor) { stR.hexes[i].terrain="grass"; stR.hexes[i].track = { co: aiR.id, gauge:"narrow", elec:false, tunnel:false, dmg:0, rails:[{gauge:"narrow",elec:false,building:false}] }; }
  var pathBefore = trackPath(stR, pR, corridor[0], corridor[2], mm);
  // grant player per-hex rights over the middle hex only — not enough to path end-to-end yet,
  // grant all three to path through
  var grant = executeDeal(stR, pR, aiR, "hexRights", corridor, 1);
  var pathAfter = trackPath(stR, pR, corridor[0], corridor[2], mm);
`, ctx);
check("§8b without rights a company cannot path over a rival's track", G("pathBefore") === null);
check("§8c per-hex trackage rights let the path cross exactly the granted hexes",
  Array.isArray(G("pathAfter")) && G("pathAfter").length === 3);

// ---- v0.5.7: save round-trips the new state (deck, deals, consYear, serviceCharge, track.rights) ----
vm.runInContext(`
  var stS = newGame(31337);
  stS.companies[0].serviceCharge = 1.75; stS.companies[0].serviceChargeSet = true;
  var svHex = hexIdx(15,15);
  stS.hexes[svHex].terrain="grass"; stS.hexes[svHex].cons="shop"; stS.hexes[svHex].dev=2; stS.hexes[svHex].consYear = 1901;
  stS.hexes[svHex].owner = stS.companies[0].id; stS.companies[0].land.push(svHex);
  stS.hexes[svHex].value = landPrice(stS, svHex);
  var trHex = hexIdx(16,15);
  stS.hexes[trHex].terrain="grass"; stS.hexes[trHex].track = { co: stS.companies[0].id, gauge:"narrow", elec:false, tunnel:false, dmg:0, rails:[{gauge:"narrow",elec:false,building:false}], rights:[0] };
  stS.events.deck.pandemic.count = 1; stS.events.deck.pandemic.lastYear = 1918;
  stS.deals.push({ asker:0, target:0, kind:"hex", key: svHex, offer: 1000, counter: 0, year: stS.time.year, state:"open" });
  var loaded = importSaveString(exportSaveString(stS));
`, ctx);
check("§7 serviceCharge round-trips", Math.abs(G("loaded").companies[0].serviceCharge - 1.75) < 1e-6);
check("§7 building vintage (consYear) round-trips", G("loaded").hexes[G("svHex")].consYear === 1901);
check("§7 per-hex track rights round-trip",
  Array.isArray(G("loaded").hexes[G("trHex")].track.rights) && G("loaded").hexes[G("trHex")].track.rights.includes(0));
check("§7 hazard-deck history round-trips", G("loaded").events.deck.pandemic.count === 1 && G("loaded").events.deck.pandemic.lastYear === 1918);
check("§7 negotiable-deal state round-trips", G("loaded").deals.length === 1 && G("loaded").deals[0].kind === "hex");
check("§1 attractiveness state present after load", !!G("loaded").econ.attract && Number.isFinite(G("loaded").econ.attract.overall));

// ---- v0.5.7: hazard deck & attractiveness stay finite over a full AI-only run ----
vm.runInContext(`
  var stMC = newGame(20260718);
  while (stMC.time.year <= CFG.END_YEAR) { for (var m=0;m<12;m++){ stMC.time.totalDays++; syncClock(stMC); if(stMC.time.day===0) onNewYear(stMC); dailyEvents(stMC); dailyTick(stMC); for (const co of stMC.companies) if (co.alive && !co.isPlayer) aiTick(stMC, co); } }
  var e = stMC.econ;
  var finite = [e.cycle,e.landBubble,e.commuteFactor,e.popPressure,e.attract.overall,e.priceLevel].every(Number.isFinite);
  var deckOk = stMC.events.deck.pandemic.count <= CFG.EVENTS.DECK.pandemic.cap && stMC.events.deck.bubble.count <= CFG.EVENTS.DECK.bubble.cap;
`, ctx);
check("§5.5 econ fields stay finite over a full 1872–2028 run", G("finite"));
check("§2 hazard-deck caps are respected over a full run", G("deckOk"));

console.log("\nFinal standings:");
for (const c of stEnd.companies.filter(c => c.alive)) {
  console.log("  " + c.name + ": cash " + Math.round(c.cash) + ", avg pax/day " + Math.round(c.stats.paxAvg));
}

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
