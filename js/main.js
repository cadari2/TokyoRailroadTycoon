/* =========================================================================
 * main.js — Game state factory, time progression (5 real min = 1 year,
 * monthly calendar ticks, yearly events/era checks), AI cadence,
 * visible train movement, victory check, boot & render loop.
 * The simulation half of this file is DOM-free (used by tools/smoke.js).
 * ========================================================================= */
"use strict";

const DAY_SEC = CFG.YEAR_SECONDS / CFG.DAYS_PER_YEAR;   // ≈25 real seconds per simulated month (12-month year)

// Set while fastForwardToYear() bulk-simulates history so the per-year
// autosave doesn't serialize the whole map dozens of times in a row.
let SUPPRESS_AUTOSAVE = false;

function freshState(seed) {
  return {
    seed,
    hexes: generateMap(seed),
    companies: [], stations: [], lines: [], trains: [], builds: [],
    time: { sec: 0, totalDays: 0, year: CFG.START_YEAR, day: 0, frac: 0 },
    econ: { cycle: 1, paxMult: 1, commuteFactor: 1, landBubble: 1, demandIndex: 0 },
    labor: { tightness: 0, wageMult: 1, scarcity: 0, kmLastYear: 0 },   // labor market
    _industryKmYear: 0,                                                  // industry-wide km built this year
    awardsLast: { year: CFG.START_YEAR, results: [] },                  // last ceremony's results (UI)
    events: { log: [], active: [], majors: [], unread: 0 },
    od: { dirty: true, lastAssign: -999 },
    aiRng: makeRng(seed ^ 0xabcdef1), evRng: makeRng(seed ^ 0x1234567), growthRng: makeRng(seed ^ 0x77777),
    pendingAI: [], renderDirty: true, ended: false,
  };
}

/** Start a new game. opts.aiCount (0..CFG.AI_COUNT) sets how many computer
 *  rivals will enter the market; opts.aiDifficulties[i] sets the difficulty
 *  ("easy"/"normal"/"hard") for the i-th rival, defaulting to AI.DEFAULT_DIFFICULTY. */
function newGame(seed, opts) {
  opts = opts || {};
  const st = freshState(seed);
  const rng = makeRng(seed ^ 0x55aa55);
  const player = createCompany(st, {
    name: "Tokyo Railroad Co.", color: CFG.PLAYER_COLOR, isPlayer: true,
    founded: CFG.START_YEAR, cash: CFG.START_CASH, gauge: rndPick(rng, CFG.START_GAUGES),
  });
  // computer companies enter at randomized times through Meiji & Taisho
  const aiCount = clamp(opts.aiCount ?? CFG.AI.entryWindows.length, 0, CFG.AI.entryWindows.length);
  const aiDifficulties = opts.aiDifficulties || [];
  st.pendingAI = CFG.AI.entryWindows.slice(0, aiCount).map((w, i) => ({
    year: rndInt(rng, w[0], w[1]), name: CFG.AI.names[i], color: CFG.AI.colors[i],
    difficulty: CFG.AI.DIFFICULTIES[aiDifficulties[i]] ? aiDifficulties[i] : CFG.AI.DEFAULT_DIFFICULTY,
  }));
  logEvent(st, player.name + " founded with " + fmtYen(player.cash) +
    ". Starting gauge: " + CFG.GAUGES[player.gauge].name +
    ". Lay track to the suburbs and bring Tokyo to work!");
  refreshWorkforceDerived(st);          // seed headcount / op-cost / productivity
  return st;
}

function syncClock(st) {
  st.time.year = CFG.START_YEAR + Math.floor(st.time.totalDays / CFG.DAYS_PER_YEAR);
  st.time.day = st.time.totalDays % CFG.DAYS_PER_YEAR;
  st.time.frac = (st.time.sec / DAY_SEC) % 1;
}

function onNewYear(st) {
  // Year-end levy for the closing year: property tax on all land plus a
  // lump-sum upkeep charge per station building. (Maintenance and payroll
  // are charged separately, every sim-day — see sim.js / hr.js.)
  const inflPrev = inflationOf(st.time.year - 1);
  for (const co of st.companies) {
    if (!co.alive) continue;
    let tax = 0;
    for (const i of co.land) tax += (st.hexes[i].value || landPrice(st, i));
    tax = Math.round(tax * CFG.LAND.taxYearly);
    let upkeep = 0;
    for (const s of st.stations) {
      if (s.co !== co.id || !s.alive) continue;
      upkeep += (s.isDepot ? CFG.DEPOT.yearlyMaint : CFG.STATION.yearlyMaint) * s.level * inflPrev;
    }
    upkeep = Math.round(upkeep);
    co.cash -= tax + upkeep;
    co.stats.costYear += tax + upkeep;
    co.stats.lastLevy = { tax, upkeep };
    if (co.isPlayer && tax + upkeep > 0) {
      logEvent(st, "Year-end levy: property tax " + fmtYen(tax) + " + station upkeep " + fmtYen(upkeep) + ".");
    }
  }
  for (const co of st.companies) {
    if (!co.alive) continue;
    co.stats.history.push({
      year: st.time.year - 1, cash: Math.round(co.cash),
      pax: Math.round(co.stats.paxAvg),
      profit: Math.round(co.stats.revYear - co.stats.costYear),
    });
    co.stats.revYear = 0; co.stats.costYear = 0;
    co.stats.landRevYear = 0; co.stats.commerceRevYear = 0;
  }
  // AI market entries (all present by start of Showa)
  for (let i = st.pendingAI.length - 1; i >= 0; i--) {
    const p = st.pendingAI[i];
    if (st.time.year >= p.year) {
      const rng = st.aiRng;
      const diff = CFG.AI.DIFFICULTIES[p.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
      createCompany(st, {
        name: p.name, color: p.color, isPlayer: false, founded: st.time.year,
        cash: CFG.START_CASH * inflationOf(st.time.year) * 0.9 * diff.cashMult,
        gauge: rndPick(rng, CFG.START_GAUGES), difficulty: p.difficulty,
      });
      logEvent(st, p.name + " enters the railway business" +
        (diff !== CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY] ? " (" + diff.name + ")" : "") + "!", "event");
      st.pendingAI.splice(i, 1);
    }
  }
  // workforce pass for the year ahead: labor market, AI wage policy, payroll &
  // maintenance costs, morale drift and any strikes; then the awards ceremony
  recomputeWorkforce(st);
  annualAwards(st);
  yearlyEvents(st);
  aiBuyouts(st);
  refreshTrainCars(st);
  st.renderDirty = true;                       // era palette may shift
  if (!SUPPRESS_AUTOSAVE && typeof localStorage !== "undefined") saveToLocal(st);   // autosave
  if (st.time.year > CFG.END_YEAR && !st.ended) {
    st.ended = true;
    logEvent(st, "Reiwa 10 — the era of reckoning. Final standings are in!", "major");
  }
}

/** Advance everything by exactly one simulated month: clock, events, finances, AI. */
function stepDay(st) {
  st.time.totalDays++;
  syncClock(st);
  if (st.time.day === 0) onNewYear(st);     // time.day is the month index (0 = January)
  dailyEvents(st);
  dailyTick(st);
  if (st.time.totalDays % CFG.AI.thinkDays === 0) {
    for (const co of st.companies) if (co.alive && !co.isPlayer) aiTick(st, co);
  }
}

/** Advance simulation time by dt real seconds (paused/ended handled by caller). */
function advanceSim(st, dt) {
  st.time.sec += dt;
  const target = Math.floor(st.time.sec / DAY_SEC);
  while (st.time.totalDays < target) stepDay(st);
  syncClock(st);
}

/** Calendar days until the player's nearest construction job/station finishes
 *  (raw, matching the "~X days left" figures shown in the construction queue). */
function calendarDaysToNextCompletion(st, co) {
  let min = Infinity;
  for (const job of st.builds) {
    if (job.co !== co.id) continue;
    const remCal = Math.max(0, (job.hexes.length - job.done) * job.daysPerHex - job.progress);
    min = Math.min(min, remCal);
  }
  for (const s of st.stations) {
    if (s.co !== co.id || !s.alive || !s.building) continue;
    min = Math.min(min, s.building);
  }
  return Number.isFinite(min) ? min : 0;
}

/** Simulated days to fast-forward to cover the player's nearest completion
 *  (0 if nothing is under construction). Each simulated day advances
 *  construction by CAL_DAYS_PER_SIM_DAY calendar days, so this is the
 *  calendar-day figure converted (and rounded up) to simulated-day units. */
function daysToNextCompletion(st, co) {
  const cal = calendarDaysToNextCompletion(st, co);
  if (cal <= 0) return 0;
  // construction advances at the company's build speed (understaffing/morale can
  // slow it below 1), so convert through that speed to be sure the skip lands on
  // (or just past) completion rather than a hair short.
  const speed = Math.max(0.1, (co && co._buildSpeed) || 1);
  return Math.max(1, Math.ceil(cal / (CFG.CAL_DAYS_PER_SIM_DAY * speed)));
}

/** Fast-forward the simulation by N simulated days, running all normal daily ticks
 *  (costs, revenue, AI, events) exactly as if real time had passed. */
function fastForwardDays(st, days) {
  if (days <= 0) return;
  for (let d = 0; d < days; d++) stepDay(st);
  st.time.sec = st.time.totalDays * DAY_SEC;   // keep the real-time clock in sync
  syncClock(st);
  st.renderDirty = true;
}

/** Debug "skip ahead": simulates the world day-by-day from the present up to
 *  the start of targetYear (AI rivals act, land develops, fares and prices
 *  inflate, and the player's own company keeps running exactly as if real
 *  time had passed with nobody watching) — every company's cash, land,
 *  stations and lines grow from wherever they stand today. No-op if
 *  targetYear is not after the current year. */
function fastForwardToYear(st, targetYear) {
  const days = Math.max(0, Math.round(targetYear - st.time.year)) * CFG.DAYS_PER_YEAR;
  if (days <= 0) return;
  SUPPRESS_AUTOSAVE = true;
  try { fastForwardDays(st, days); }
  finally { SUPPRESS_AUTOSAVE = false; }
  logEvent(st, "DEBUG: skipped ahead to " + st.time.year +
    ". The world — and your holdings — kept running while you were away.", "event");
  if (typeof localStorage !== "undefined") saveToLocal(st);
}

/** Move visible trains along their lines (visual engagement, not physics).
 *  Trains pause briefly at each *scheduled* stop (line._stopPos, set in
 *  buildNetwork) — expresses glide past stations they skip. Linear lines
 *  reverse and dwell at the termini; LOOP lines circulate one way, wrapping
 *  around the seam (path[0] === path[end]) without ever reversing — so odd and
 *  even trains keep running opposite directions around the circle. */
function moveTrains(st, dt) {
  for (const tr of st.trains) {
    if (!tr.alive) continue;
    const line = st.lines[tr.line];
    if (!line || !line.alive || line.path.length < 2) continue;
    if (tr._dwell > 0) { tr._dwell -= dt; continue; }      // halted at a platform
    const max = line.path.length - 1;
    const prev = tr.pos;
    let next = prev + tr.dir * CFG.TRAINS[tr.type].speed * CFG.TRAIN_VISUAL * dt;   // aesthetic scale
    // halt at the first scheduled stop reached this frame (snap to its platform)
    const stops = line._stopPos;
    if (stops && stops.length) {
      if (tr.dir > 0) {
        for (const s of stops) if (s > prev + 1e-6 && s <= next) { next = s; tr._dwell = CFG.TRAIN_DWELL_SEC; break; }
      } else {
        for (let k = stops.length - 1; k >= 0; k--) {
          const s = stops[k];
          if (s < prev - 1e-6 && s >= next) { next = s; tr._dwell = CFG.TRAIN_DWELL_SEC; break; }
        }
      }
    }
    if (line.loop) {
      // wrap around the seam, keeping the same direction (one-way circulation)
      if (next >= max) next -= max;
      else if (next < 0) next += max;
    } else {
      // reverse (and dwell) at the line ends
      if (next >= max) { next = max; tr.dir = -1; tr._dwell = CFG.TRAIN_DWELL_SEC; }
      else if (next <= 0) { next = 0; tr.dir = 1; tr._dwell = CFG.TRAIN_DWELL_SEC; }
    }
    tr.pos = next;
  }
}

/* =========================================================================
 * Browser boot (skipped under Node for headless testing)
 * ========================================================================= */
if (typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("map");
    function fit() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    let st = null, savedExists = false;
    try { st = loadFromLocal(); if (st) { console.log("Autosave loaded."); savedExists = true; } }
    catch (e) { console.warn("Autosave unreadable, starting fresh:", e); }
    if (!st) st = newGame((Math.random() * 1e9) | 0);

    const defaultSpeed = (CFG.SPEEDS.find(s => s.key === CFG.DEFAULT_SPEED) || CFG.SPEEDS[0]).mult;
    const G = window.Game = {
      st,
      ui: { mode: "inspect", tab: "Build", hover: -1, selected: -1,
            lineSel: [], lineLoop: false, selectedLine: -1, editLineId: -1, focusStation: -1,
            showOwners: true, showDemand: false, paused: false, speedMult: defaultSpeed,
            debugMode: false },
      renderer: null,
    };
    fit();
    G.renderer = makeRenderer(canvas);
    window.addEventListener("resize", fit);
    initUI(G);
    buildStartScreen(G, savedExists);
    setStatus(savedExists ? "Welcome back. Choose Continue or start a new game."
      : "Welcome to 1872. Buy land, lay track, and connect the city. (Drag/swipe to pan, wheel/pinch to zoom; ☰ Menu hides the panel.)");

    let last = performance.now(), endShown = false;
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!G.ui.paused && !G.st.ended) advanceSim(G.st, dt * (G.ui.speedMult || 1));
      moveTrains(G.st, dt);
      renderTopbar(G);
      G.renderer.drawFrame(G.st, G.ui);
      if (G.st.ended && !endShown) { endShown = true; showEndScreen(G); }
      if (G.st !== st) { st = G.st; endShown = false; }   // new game / load swapped state
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
