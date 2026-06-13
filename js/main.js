/* =========================================================================
 * main.js — Game state factory, time progression (5 real min = 1 year,
 * day ticks, weekly holidays, yearly events/era checks), AI cadence,
 * visible train movement, victory check, boot & render loop.
 * The simulation half of this file is DOM-free (used by tools/smoke.js).
 * ========================================================================= */
"use strict";

const DAY_SEC = CFG.YEAR_SECONDS / CFG.DAYS_PER_YEAR;   // ≈43 real seconds per simulated day (7-day year)

function freshState(seed) {
  return {
    seed,
    hexes: generateMap(seed),
    companies: [], stations: [], lines: [], trains: [], builds: [],
    time: { sec: 0, totalDays: 0, year: CFG.START_YEAR, day: 0, frac: 0 },
    econ: { cycle: 1, paxMult: 1, commuteFactor: 1, landBubble: 1, demandIndex: 0 },
    events: { log: [], active: [], majors: [], unread: 0 },
    od: { dirty: true, lastAssign: -999 },
    aiRng: makeRng(seed ^ 0xabcdef1), evRng: makeRng(seed ^ 0x1234567), growthRng: makeRng(seed ^ 0x77777),
    pendingAI: [], renderDirty: true, ended: false,
  };
}

function newGame(seed) {
  const st = freshState(seed);
  const rng = makeRng(seed ^ 0x55aa55);
  const player = createCompany(st, {
    name: "Tokyo Railroad Co.", color: CFG.PLAYER_COLOR, isPlayer: true,
    founded: CFG.START_YEAR, cash: CFG.START_CASH, gauge: rndPick(rng, CFG.START_GAUGES),
  });
  // 4 computer companies enter at randomized times through Meiji & Taisho
  st.pendingAI = CFG.AI.entryWindows.map((w, i) => ({
    year: rndInt(rng, w[0], w[1]), name: CFG.AI.names[i], color: CFG.AI.colors[i],
  }));
  logEvent(st, player.name + " founded with " + fmtYen(player.cash) +
    ". Starting gauge: " + CFG.GAUGES[player.gauge].name +
    ". Lay track to the suburbs and bring Tokyo to work!");
  return st;
}

function syncClock(st) {
  st.time.year = CFG.START_YEAR + Math.floor(st.time.totalDays / CFG.DAYS_PER_YEAR);
  st.time.day = st.time.totalDays % CFG.DAYS_PER_YEAR;
  st.time.frac = (st.time.sec / DAY_SEC) % 1;
}

function onNewYear(st) {
  // Year-end levy for the closing year: property tax on all land plus a
  // lump-sum upkeep charge per station building. These are the ONLY
  // recurring costs (no track/train maintenance).
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
  }
  // AI market entries (all present by start of Showa)
  for (let i = st.pendingAI.length - 1; i >= 0; i--) {
    const p = st.pendingAI[i];
    if (st.time.year >= p.year) {
      const rng = st.aiRng;
      createCompany(st, {
        name: p.name, color: p.color, isPlayer: false, founded: st.time.year,
        cash: CFG.START_CASH * inflationOf(st.time.year) * 0.9,
        gauge: rndPick(rng, CFG.START_GAUGES),
      });
      logEvent(st, p.name + " enters the railway business!", "event");
      st.pendingAI.splice(i, 1);
    }
  }
  // fares are inflation-indexed each New Year so a fare set in Meiji stays
  // meaningful in Reiwa; players/AI still tune the relative level
  const ratio = inflationOf(st.time.year) / inflationOf(st.time.year - 1);
  if (ratio !== 1) {
    for (const l of st.lines) if (l.alive) l.fare = +(l.fare * ratio).toFixed(2);
    st.od.dirty = true;
  }
  yearlyEvents(st);
  aiBuyouts(st);
  refreshTrainCars(st);
  st.renderDirty = true;                       // era palette may shift
  if (typeof localStorage !== "undefined") saveToLocal(st);   // autosave
  if (st.time.year > CFG.END_YEAR && !st.ended) {
    st.ended = true;
    logEvent(st, "Reiwa 10 — the era of reckoning. Final standings are in!", "major");
  }
}

/** Advance everything by exactly one simulated day: clock, events, finances, AI. */
function stepDay(st) {
  st.time.totalDays++;
  syncClock(st);
  if (st.time.day === 0) onNewYear(st);
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

/** Days (simulated) until the player's nearest construction job/station finishes. */
function daysToNextCompletion(st, co) {
  let min = Infinity;
  for (const job of st.builds) {
    if (job.co !== co.id) continue;
    const remCal = Math.max(0, (job.hexes.length - job.done) * job.daysPerHex - job.progress);
    min = Math.min(min, remCal / CFG.CAL_DAYS_PER_SIM_DAY);
  }
  for (const s of st.stations) {
    if (s.co !== co.id || !s.alive || !s.building) continue;
    min = Math.min(min, s.building / CFG.CAL_DAYS_PER_SIM_DAY);
  }
  return Number.isFinite(min) ? Math.max(1, Math.ceil(min)) : 0;
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

/** Move visible trains along their lines (visual engagement, not physics). */
function moveTrains(st, dt) {
  for (const tr of st.trains) {
    if (!tr.alive) continue;
    const line = st.lines[tr.line];
    if (!line || !line.alive || line.path.length < 2) continue;
    const hexPerSec = CFG.TRAINS[tr.type].speed * CFG.TRAIN_VISUAL;   // aesthetic scale
    tr.pos += tr.dir * hexPerSec * dt;
    const max = line.path.length - 1;
    if (tr.pos >= max) { tr.pos = max; tr.dir = -1; }
    if (tr.pos <= 0) { tr.pos = 0; tr.dir = 1; }
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
    let st = null;
    try { st = loadFromLocal(); if (st) console.log("Autosave loaded."); }
    catch (e) { console.warn("Autosave unreadable, starting fresh:", e); }
    if (!st) st = newGame((Math.random() * 1e9) | 0);

    const G = window.Game = {
      st,
      ui: { mode: "inspect", tab: "Build", hover: -1, selected: -1,
            lineSel: [], showOwners: true, paused: false },
      renderer: null,
    };
    fit();
    G.renderer = makeRenderer(canvas);
    window.addEventListener("resize", fit);
    initUI(G);
    setStatus("Welcome to 1872. Buy land, lay track, and connect the city. (Drag map to pan, wheel to zoom.)");

    let last = performance.now(), endShown = false;
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!G.ui.paused && !G.st.ended) advanceSim(G.st, dt);
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
