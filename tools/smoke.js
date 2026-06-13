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
check("player created", st.companies.length === 1 && st.companies[0].cash === 360000);
check("4 AI scheduled", st.pendingAI.length === 4);

// ---- hex area names: every hex named, palace centered, rough Tokyo layout ----
check("center hex named for the Imperial Palace", st.hexes[25 * 50 + 25].name === "皇居 (Kokyo)", st.hexes[25 * 50 + 25].name);
check("every hex has an area name", st.hexes.every(h => !!h.name), st.hexes.filter(h => !h.name).length + " unnamed");
const _districts = new Set(st.hexes.map(h => h.name));
check("map covered by many distinct districts", _districts.size >= 30, _districts.size + " districts");
const _areas = G("TOKYO_AREAS");
const _offsets = new Set(_areas.map(a => a.dc + "," + a.dr));
check("no two districts placed on the same hex", _offsets.size === _areas.length, _areas.length + " areas / " + _offsets.size + " unique cells");
const KANJI_ROMAJI_RE = /^[^\x00-\x7F]+ \([A-Za-z][A-Za-z .'-]*\)$/;
check("every district name pairs kanji with romaji", [..._districts].every(n => KANJI_ROMAJI_RE.test(n)),
  [..._districts].find(n => !KANJI_ROMAJI_RE.test(n)) || (_districts.size + " districts ok"));
const _holdoutNames = G("HOLDOUT_NAMES");
check("every holdout-family name pairs kanji with romaji", _holdoutNames.every(n => KANJI_ROMAJI_RE.test(n)),
  _holdoutNames.find(n => !KANJI_ROMAJI_RE.test(n)) || (_holdoutNames.length + " names ok"));
const _nameAt = (c, r) => st.hexes[r * 50 + c].name;
check("west of the palace lands in a west-side ward",
  ["新宿 (Shinjuku)", "四ツ谷 (Yotsuya)", "中野 (Nakano)", "代々木 (Yoyogi)", "市ヶ谷 (Ichigaya)"].includes(_nameAt(18, 25)), _nameAt(18, 25));
check("due north of the palace lands in a north-side ward",
  ["本郷 (Hongo)", "神田 (Kanda)", "湯島 (Yushima)", "小石川 (Koishikawa)", "上野 (Ueno)"].includes(_nameAt(25, 21)), _nameAt(25, 21));
vm.runInContext("var _nameSave = importSaveString(exportSaveString(st));", ctx);
check("hex names regenerate identically through save/load",
  G("_nameSave").hexes[25 * 50 + 25].name === "皇居 (Kokyo)" && G("_nameSave").hexes.every(h => !!h.name));

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
  var job0 = st.builds.find(b => b.co === p.id);
`, ctx);
check("calendar days remaining = daysPerHex × queued hexes (fresh job)",
  Math.abs(G("calDays0") - G("job0").daysPerHex * G("job0").hexes.length) < 1e-9, G("calDays0") + " cal-days");
check("skip button's simulated days = ceil(calendar days / CAL_DAYS_PER_SIM_DAY)",
  G("simDays0") === Math.max(1, Math.ceil(G("calDays0") / CFG_get("CAL_DAYS_PER_SIM_DAY"))),
  "sim=" + G("simDays0") + " cal=" + G("calDays0") + " ratio=" + CFG_get("CAL_DAYS_PER_SIM_DAY"));
check("a multi-hex job takes far more calendar days than the simulated skip count",
  G("simDays0") < G("calDays0"), "sim=" + G("simDays0") + " cal=" + G("calDays0"));

vm.runInContext("ticks(4);", ctx);   // 4 sim-days ≈ 208 calendar days
check("track built", G("route").every(i => G("st").hexes[i].track), "builds left: " + G("st").builds.length);

vm.runInContext(`var rA = buildStation(st, p, A), rB = buildStation(st, p, B); ticks(3);`, ctx);
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
  fastForwardDays(st, daysLeft);
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
  var afterLvlOk = stSD.stations[sIdA].level === lvlTarget && stSD.stations[sIdB].level === lvlTarget &&
    stSD.stations[sIdNew].level === lvlTarget;
  var bulkLvlAgain = bulkUpgradeStationLevels(stSD, pSD, lvlTarget);

  var carTarget = sdCap1950;
  var carCostExpected = stationPlatformUpgradeCost(stSD, stSD.stations[sIdA], carTarget);
  var cashBeforeCar = pSD.cash;
  var bulkCar = bulkExtendPlatforms(stSD, pSD, carTarget);
  var carCashSpent = cashBeforeCar - pSD.cash;
  var afterCarOk = stSD.stations[sIdA].cars === carTarget;
  var bulkCarAgain = bulkExtendPlatforms(stSD, pSD, carTarget);

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
check("save round-trip private holdouts", st3.hexes.filter(h => h.owner === -2).length === st2.hexes.filter(h => h.owner === -2).length &&
  st3.hexes.filter(h => h.owner === -2).every(h => !!h.holdout),
  st3.hexes.filter(h => h.owner === -2).length + " holdouts");
check("save round-trip train age", st3.trains.every((t, i) => !st2.trains[i] || t.bought === (st2.trains[i].bought | 0)));
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
