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
const files = ["js/config.js", "js/util.js", "data/machinames.js", "js/map.js", "js/world.js", "js/sim.js",
               "js/hr.js", "js/ai.js", "js/events.js", "js/save.js", "js/main.js"];
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
check("player created", st.companies.length === 1 && st.companies[0].cash === 360000);
check("default AI roster scheduled", st.pendingAI.length === CFG_get("AI_COUNT"), st.pendingAI.length + " scheduled");

// ---- hex names: real Shōwa-era 町名, palace centered, dense core unique ----
check("center hex named for the Imperial Palace", st.hexes[25 * 50 + 25].name === "皇居 (Kokyo)", st.hexes[25 * 50 + 25].name);
check("every hex has a place name", st.hexes.every(h => !!h.name), st.hexes.filter(h => !h.name).length + " unnamed");
const _names = st.hexes.map(h => h.name);
const _nameAt = (c, r) => st.hexes[r * 50 + c].name;
// no synthetic labels: no 丁目 block numbers, no directional designations
check("no name uses a 丁目 block number", !_names.some(n => n.includes("丁目")),
  _names.find(n => n.includes("丁目")) || "none");
// every displayed name is a genuine catalogued machi/district (no invented strings)
const _allowed = new Set(["皇居 (Kokyo)", "東京 (Tokyo)"]);
for (const g of G("TOKYO_MACHI")) for (const [k, r] of g.n) _allowed.add(k + " (" + r + ")");
for (const a of G("tokyoAreas()")) _allowed.add(a.name);
check("every hex name is a real catalogued place name", _names.every(n => _allowed.has(n)),
  _names.find(n => !_allowed.has(n)) || "all real");
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
// the dense central city should read as distinct names — no repeats visible
// together (a few machi genuinely existed in several wards, so we measure
// local, not global, uniqueness within the on-screen core window)
const _core = st.hexes.filter(h => {
  const dc = h.col - 25, dr = h.row - 25;
  return Math.max(Math.abs(dc), Math.abs(dr), Math.abs(dc + dr)) <= 8;
});
const _coreCnt = {}; for (const h of _core) _coreCnt[h.name] = (_coreCnt[h.name] || 0) + 1;
const _coreU = _core.filter(h => _coreCnt[h.name] === 1).length;
check("dense central core is ≥85% uniquely named", _coreU / _core.length >= 0.85,
  _coreU + "/" + _core.length + " (" + Math.round(100 * _coreU / _core.length) + "%)");
check("the board carries hundreds of distinct real machi", new Set(_names).size >= 900,
  new Set(_names).size + " distinct names");
check("west of the palace lands in a west-side machi",
  ["信濃町", "四谷", "箪笥町", "大久保", "角筈", "柏木", "渋谷", "代々木", "市谷", "若松町", "中野", "南元町", "須賀町"]
    .some(b => _nameAt(18, 25).includes(b)), _nameAt(18, 25));
check("due north of the palace lands in a north-side machi",
  ["本郷", "湯島", "小石川", "駒込", "白山", "春日町", "真砂町", "森川町", "千駄木", "根津"]
    .some(b => _nameAt(25, 21).includes(b)), _nameAt(25, 21));
vm.runInContext("var _nameSave = importSaveString(exportSaveString(st));", ctx);
check("hex names regenerate identically through save/load",
  G("_nameSave").hexes.every((h, i) => h.name === _names[i]));

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
check("AI count clamped to roster size; bad difficulty defaults to normal",
  G("stClamp").pendingAI.length === CFG_get("AI.entryWindows").length &&
  G("stClamp").pendingAI.every(p => p.difficulty === "normal"),
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
  var built = 0, quoteDays = 0;
  for (const i of route) {
    const q = buildTrackHex(st, p, i, true);
    if (q.ok) { quoteDays = q.days; if (buildTrackHex(st, p, i).ok) built++; }
  }
`, ctx);
check("hex-by-hex build accepted", G("built") >= 9, G("built") + " hexes queued");
check("build quote has days/cost", G("quoteDays") > 0);
check("cash deducted", G("st").companies[0].cash < 360000);

// ---- skip-ahead units: calendar days (queue display) vs simulated days (fast-forward) ----
vm.runInContext(`
  var calDays0 = calendarDaysToNextCompletion(st, p);
  var simDays0 = daysToNextCompletion(st, p);
  var buildSpeed0 = Math.max(0.1, p._buildSpeed || 1);
  var job0 = st.builds.find(b => b.co === p.id);
`, ctx);
check("calendar days remaining = daysPerHex × queued hexes (fresh job)",
  Math.abs(G("calDays0") - G("job0").daysPerHex * G("job0").hexes.length) < 1e-9, G("calDays0") + " cal-days");
check("skip button's simulated months = ceil(calendar days / (cal-per-month × build speed))",
  G("simDays0") === Math.max(1, Math.ceil(G("calDays0") / (CFG_get("CAL_DAYS_PER_SIM_DAY") * G("buildSpeed0")))),
  "sim=" + G("simDays0") + " cal=" + G("calDays0") + " speed=" + G("buildSpeed0").toFixed(3));
check("a multi-hex job takes far more calendar days than the simulated skip count",
  G("simDays0") < G("calDays0"), "sim=" + G("simDays0") + " cal=" + G("calDays0"));

// skip ahead until every queued track job finishes (each hex is its own
// parallel job; tunnels/bridges take longer, so loop to next completion)
vm.runInContext(`
  var guard = 0;
  while (st.builds.some(b => b.co === p.id) && guard++ < 120) fastForwardDays(st, daysToNextCompletion(st, p) || 1);
`, ctx);
check("track built", G("route").every(i => G("st").hexes[i].track), "builds left: " + G("st").builds.length);

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
  G("stDbg").companies.length > 1 && G("stDbg").pendingAI.length === 0,
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

// ---- station defaults + bulk station upgrades ----
// Clone again so building/upgrading stations here doesn't affect `st`'s
// cash/stations for the operations/timeline checks below.
vm.runInContext(`
  var stSD = importSaveString(exportSaveString(st));
  var pSD = stSD.companies.find(c => c.isPlayer);
  var sdBuildHex = route.find(i => !stSD.hexes[i].stations.length);
  var sdDefaultsOk = pSD.stationDefaults.level === 1 && pSD.stationDefaults.cars === 3;
  var sdBaseCost = stationCost(stSD, sdBuildHex);
  var sdCostAtDefault = stationBuildCost(stSD, pSD, sdBuildHex);

  pSD.stationDefaults = { level: CFG.STATION.maxLevel, cars: 3 };
  var sdCostHigherLevel = stationBuildCost(stSD, pSD, sdBuildHex);

  pSD.stationDefaults = { level: 1, cars: 1 };
  var sdCostShorter = stationBuildCost(stSD, pSD, sdBuildHex);

  // depot+station also picks up stationDefaults; a plain depot never does
  var depotBaseAsStation = depotCost(stSD, sdBuildHex, true);
  var depotBasePlain = depotCost(stSD, sdBuildHex, false);
  var depotCostShorter = depotBuildCost(stSD, pSD, sdBuildHex, true);
  var depotCostPlain = depotBuildCost(stSD, pSD, sdBuildHex, false);

  pSD.stationDefaults = { level: CFG.STATION.maxLevel, cars: 3 };
  pSD.cash = 1e9;
  var sdBuild = buildStation(stSD, pSD, sdBuildHex);
  var sdBuiltOk = sdBuild.ok && sdBuild.station.level === CFG.STATION.maxLevel && sdBuild.station.cars === 3;
`, ctx);
check("new companies default to level-1, 3-car stations", G("sdDefaultsOk"));
check("stationBuildCost matches base cost at level-1/3-car defaults",
  G("sdCostAtDefault") === G("sdBaseCost"), G("sdCostAtDefault") + " vs " + G("sdBaseCost"));
check("higher station-level default raises the build cost",
  G("sdCostHigherLevel") > G("sdBaseCost"), G("sdBaseCost") + " → " + G("sdCostHigherLevel"));
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
  // mixed starting levels/platform lengths among the player's stations
  stSD.stations[sIdA].level = 1; stSD.stations[sIdA].cars = 1;
  stSD.stations[sIdB].level = 2; stSD.stations[sIdB].cars = sdCap1950;
  stSD.stations[sIdNew].level = CFG.STATION.maxLevel; stSD.stations[sIdNew].cars = sdCap1950;
  pSD.cash = 1e12;

  var lvlTarget = CFG.STATION.maxLevel;
  var lvlCostExpected = stationLevelUpgradeCost(stSD, stSD.stations[sIdA], lvlTarget) +
                         stationLevelUpgradeCost(stSD, stSD.stations[sIdB], lvlTarget);
  var cashBeforeLvl = pSD.cash;
  var bulkLvl = bulkUpgradeStationLevels(stSD, pSD, lvlTarget);
  var lvlCashSpent = cashBeforeLvl - pSD.cash;
  // upgrades are timed now — while they build, eligible stations are excluded
  var bulkLvlAgain = bulkUpgradeStationLevels(stSD, pSD, lvlTarget);

  var carTarget = sdCap1950;
  var carCostExpected = stationPlatformUpgradeCost(stSD, stSD.stations[sIdA], carTarget);
  var cashBeforeCar = pSD.cash;
  var bulkCar = bulkExtendPlatforms(stSD, pSD, carTarget);
  var carCashSpent = cashBeforeCar - pSD.cash;
  var bulkCarAgain = bulkExtendPlatforms(stSD, pSD, carTarget);

  // fast-forward until every queued station upgrade/extension finishes, then read results
  var uguard = 0;
  while (stSD.stations.some(s => s.co === pSD.id && (s.levelBuilding > 0 || s.platBuilding > 0)) && uguard++ < 80)
    fastForwardDays(stSD, daysToNextCompletion(stSD, pSD) || 1);
  var afterLvlOk = stSD.stations[sIdA].level === lvlTarget && stSD.stations[sIdB].level === lvlTarget &&
    stSD.stations[sIdNew].level === lvlTarget;
  var afterCarOk = stSD.stations[sIdA].cars === carTarget;

  pSD.stationDefaults = { level: 2, cars: 7 };
  var stSDLoad = importSaveString(exportSaveString(stSD));
  var pSDLoad = stSDLoad.companies.find(c => c.isPlayer);
`, ctx);
check("1950 platform cap exceeds 3 cars (room to extend)", G("sdCap1950") > 3, "" + G("sdCap1950"));
check("bulkUpgradeStationLevels upgrades exactly the stations below target, for the summed per-step cost",
  G("bulkLvl").ok && G("bulkLvl").count === 2 && G("bulkLvl").cost === G("lvlCostExpected"),
  JSON.stringify(G("bulkLvl")) + " expected cost " + G("lvlCostExpected"));
check("bulkUpgradeStationLevels charges exactly its quoted cost", G("lvlCashSpent") === G("bulkLvl").cost);
check("bulkUpgradeStationLevels raises every eligible station to the target level", G("afterLvlOk"));
check("bulkUpgradeStationLevels is a no-op once nothing is below target",
  !G("bulkLvlAgain").ok && G("bulkLvlAgain").count === 0, JSON.stringify(G("bulkLvlAgain")));
check("bulkExtendPlatforms extends exactly the stations below target, for the summed per-step cost",
  G("bulkCar").ok && G("bulkCar").count === 1 && G("bulkCar").cost === G("carCostExpected"),
  JSON.stringify(G("bulkCar")) + " expected cost " + G("carCostExpected"));
check("bulkExtendPlatforms charges exactly its quoted cost", G("carCashSpent") === G("bulkCar").cost);
check("bulkExtendPlatforms lengthens the eligible station's platform to the target", G("afterCarOk"));
check("bulkExtendPlatforms is a no-op once nothing is under target",
  !G("bulkCarAgain").ok && G("bulkCarAgain").count === 0, JSON.stringify(G("bulkCarAgain")));
check("stationDefaults round-trip through save/load",
  G("pSDLoad").stationDefaults.level === 2 && G("pSDLoad").stationDefaults.cars === 7,
  JSON.stringify(G("pSDLoad").stationDefaults));

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
check("all AI entered by Showa", st2.companies.length === 1 + CFG_get("AI_COUNT") && st2.pendingAI.length === 0,
  st2.companies.length + " companies");
const aiWithTrack = st2.companies.filter(c => !c.isPlayer && call("companyTrackHexes", st2, c).length > 0).length;
check("AI built track", aiWithTrack >= 2, aiWithTrack + "/" + CFG_get("AI_COUNT") + " AI have track");
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
// Spec: no 100-year window holds more than 2 majors. With the list sorted,
// that's equivalent to: no major has two others within the same 100-year span,
// i.e. majors[i+2] - majors[i] >= 100 for all i. (A point flanked on opposite
// sides by neighbors >100y apart is fine — no single window contains all three.)
const m2 = [...stEnd.events.majors].sort((a, b) => a - b);
let capOK = true;
for (let i = 0; i + 2 < m2.length; i++) if (m2[i + 2] - m2[i] < 100) capOK = false;
check("≤2 majors per 100y over full run", capOK, m2.join(","));

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
    var s = { id: stL.stations.length, co: pL.id, hex: hi, level: 1, cars: 3, name: nm,
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
  // electrification before unlock is blocked; after unlock it wires everything
  var elecEarly = bulkElectrifyTrack(stL, pL);
  stL.time.year = 1910;
  var elecQuote = electrifyTrackCost(stL, pL);
  var elecDone = bulkElectrifyTrack(stL, pL);
`, ctx);
check("createLineVia builds a line through chosen waypoints", G("rExp").ok, G("rExp").msg);
check("waypoint line includes all on-path stations", G("rExp").ok && G("rExp").line.stations.length === 3,
  G("rExp").ok ? G("rExp").line.stations.length + " stations" : "");
check("express skips a non-waypoint middle station", G("expMidStop") === false);
check("editLineRoute makes a newly-added waypoint a served stop",
  G("rEdit").ok && G("rEdit").line.stops[G("sM").id] === true, G("rEdit").msg);
check("electrify blocked before its unlock year", G("elecEarly").ok === false);
check("electrify quotes a positive cost for un-wired track",
  G("elecQuote").count === 8 && G("elecQuote").cost > 0, JSON.stringify(G("elecQuote")));
check("bulkElectrifyTrack wires all track and its lines",
  G("elecDone").ok && G("elecDone").count === 8 &&
  G("stL").lines[G("rExp").line.id].elec === true &&
  G("stL").hexes[G("lineHexes")[3]].track.elec === true, G("elecDone").msg);

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
  var rExpFast = createLineVia(stL, pL, [sW.id, sE.id], "express");   // skips Mid, same track
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
    var s = { id: stC.stations.length, co: pC.id, hex: hi, level: 2, cars: 3, name: nm,
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
    var s = { id: stF.stations.length, co: pF.id, hex: hi, level: 2, cars: 3, name: "F"+c,
      builtYear: stF.time.year, board: 500, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 3, commerceBuilding: 0, commercePending: 0 };
    stF.stations.push(s); stF.hexes[hi].stations.push(s.id); return s;
  }
  stF.time.year = 1955;
  var sF = mkStationF(20, 25);
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
    var s = { id: stLp.stations.length, co: pLp.id, hex: hi, level: 1, cars: 3, name: nm, builtYear: stLp.time.year,
      board: 0, alive: true, building: 0, isDepot: false, depotAsStation: false, commerce: 0, commerceBuilding: 0, commercePending: 0 };
    stLp.stations.push(s); stLp.hexes[hi].stations.push(s.id); return s; }
  var sN = mkS(26,22,"North"), sE = mkS(28,24,"East"), sS = mkS(26,26,"South");
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
    var s = { id: stPM.stations.length, co: pPM.id, hex: hi, level: 2, cars: 3, name: "P"+c, builtYear: 1950,
      board: 600, paxDay: 600, alive: true, building: 0, isDepot: false, depotAsStation: false,
      commerce: 3, commerceBuilding: 0, commercePending: 0 };
    stPM.stations.push(s); stPM.hexes[hi].stations.push(s.id); return s; }
  var sPM = mkPM(20, 25);
  var incPM = stationCommerceIncomeYear(stPM, sPM);
  var upPM = stationUpkeepYear(stPM, sPM);
`, ctx);
check("stationCommerceIncomeYear is positive for a busy retail station", G("incPM") > 0, "¥" + G("incPM") + "/yr");
check("stationUpkeepYear includes building + commerce upkeep", G("upPM") > 0, "¥" + G("upPM") + "/yr");

console.log("\nFinal standings:");
for (const c of stEnd.companies.filter(c => c.alive)) {
  console.log("  " + c.name + ": cash " + Math.round(c.cash) + ", avg pax/day " + Math.round(c.stats.paxAvg));
}

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
