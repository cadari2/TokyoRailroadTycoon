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

function freshState(seed, campaign) {
  campaign = (campaign === "london") ? "london" : "tokyo";
  return {
    seed,
    campaign,                                   // v0.5: "tokyo" | "london" (Phase 11)
    playerClass: CFG.DEFAULT_PLAYER_CLASS,      // v0.5: player's social standing (see CFG.PLAYER_CLASSES)
    hexes: generateMap(seed, campaign),
    companies: [], stations: [], lines: [], trains: [], builds: [],
    time: { sec: 0, totalDays: 0, year: CFG.START_YEAR, day: 0, frac: 0 },
    econ: { cycle: 1, paxMult: 1, commuteFactor: 1, landBubble: 1, demandIndex: 0,
            popPressure: 1, popRate: 0,         // v0.5.5 population manager (updatePopulation)
            rebuild: null, postwar: null },     // inflation drivers (major-quake reconstruction, postwar spike)
    war: null,                                  // major-war state (events.js maybeStartWar)
    labor: { tightness: 0, wageMult: 1, scarcity: 0, kmLastYear: 0 },   // labor market
    _industryKmYear: 0,                                                  // industry-wide km built this year
    awardsLast: { year: CFG.START_YEAR, results: [] },                  // last ceremony's results (UI)
    events: { log: [], active: [], majors: [], unread: 0 },
    od: { dirty: true, lastAssign: -999 },
    aiRng: makeRng(seed ^ 0xabcdef1), evRng: makeRng(seed ^ 0x1234567), growthRng: makeRng(seed ^ 0x77777),
    pendingAI: [], renderDirty: true, ended: false,
    sfxQueue: [],                               // semantic SFX names for the audio layer (audio.js)
  };
}

/** Start a new game. opts.aiCount (0..CFG.AI_COUNT) sets how many computer
 *  rivals will enter the market; opts.aiDifficulties[i] sets the difficulty
 *  ("easy"/"normal"/"hard") for the i-th rival, defaulting to AI.DEFAULT_DIFFICULTY. */
function newGame(seed, opts) {
  opts = opts || {};
  const st = freshState(seed, opts.campaign);
  const london = st.campaign === "london";
  setCurrency(london ? "£" : "¥");            // v0.5.1: all money strings follow the campaign
  const rng = makeRng(seed ^ 0x55aa55);
  const classKey = CFG.PLAYER_CLASSES[opts.playerClass] ? opts.playerClass : CFG.DEFAULT_PLAYER_CLASS;
  const cls = CFG.PLAYER_CLASSES[classKey];
  st.playerClass = classKey;
  const player = createCompany(st, {
    name: london ? "London Railway Co." : "Tokyo Railroad Co.", color: CFG.PLAYER_COLOR, isPlayer: true,
    founded: CFG.START_YEAR, cash: cls.startCash, gauge: rndPick(rng, CFG.START_GAUGES),
    playerClass: classKey,
  });
  // computer companies enter at randomized times through Meiji & Taisho
  const aiCount = clamp(opts.aiCount ?? CFG.AI.entryWindows.length, 0, CFG.AI.entryWindows.length);
  const aiDifficulties = opts.aiDifficulties || [];
  const aiNames = london ? CFG.AI.namesLondon : CFG.AI.names;   // v0.5.1: English rivals in London
  st.pendingAI = CFG.AI.entryWindows.slice(0, aiCount).map((w, i) => ({
    year: rndInt(rng, w[0], w[1]), name: aiNames[i], color: CFG.AI.colors[i],
    difficulty: CFG.AI.DIFFICULTIES[aiDifficulties[i]] ? aiDifficulties[i] : CFG.AI.DEFAULT_DIFFICULTY,
  }));
  logEvent(st, player.name + " founded with " + fmtYen(player.cash) +
    " (" + cls.name + "). Starting gauge: " + CFG.GAUGES[player.gauge].name +
    ". Lay track to the suburbs and bring " + (london ? "London" : "Tokyo") + " to work!");
  const granted = grantStartingLand(st, player, classKey, rng);
  if (granted.length) {
    logEvent(st, "Family land grants: " + granted.length + " parcel" + (granted.length === 1 ? "" : "s") +
      " deeded to the company at its founding.");
  }
  refreshWorkforceDerived(st);          // seed headcount / op-cost / productivity
  queueSfx(st, "game_start");
  return st;
}

function syncClock(st) {
  st.time.year = CFG.START_YEAR + Math.floor(st.time.totalDays / CFG.DAYS_PER_YEAR);
  st.time.day = st.time.totalDays % CFG.DAYS_PER_YEAR;
  st.time.frac = (st.time.sec / DAY_SEC) % 1;
}

/** Advance the causal price level into the new year. Called first thing in
 *  onNewYear so the year's inflation is fixed before any yen figure is read.
 *  The annual rate reads the PRIOR year's end-state (war intensity, postwar
 *  overhang, quake reconstruction, business cycle), so prices react to what
 *  actually happened — with a realistic one-year lag — rather than following
 *  a fixed historical script. See CFG.INFLATION. */
function updateInflation(st) {
  const P = CFG.INFLATION, e = st.econ, y = st.time.year;
  if (e.priceLevel === undefined) { e.priceLevel = P.base; e.priceHist = { [CFG.START_YEAR]: P.base }; }
  if (!e.priceHist) e.priceHist = { [CFG.START_YEAR]: e.priceLevel };
  if (e.priceHist[y] !== undefined) return;                 // already advanced this year
  let rate = P.driftPerYear;
  rate += P.cycleWeight * ((e.cycle || 1) - 1);
  if (st.war && st.war.active) rate += P.warWeight * (st.war.inten || 0);
  if (e.postwar && e.postwar.years > 0) {                   // postwar monetary overhang, decaying
    rate += P.postwarWeight * (e.postwar.peak || 0.5) * (e.postwar.years / P.postwarYears);
    if (--e.postwar.years <= 0) e.postwar = null;
  }
  if (e.rebuild && e.rebuild.years > 0) {                   // great-quake reconstruction pressure
    rate += P.rebuildWeight * (e.rebuild.k || 1);
    if (--e.rebuild.years <= 0) e.rebuild = null;
  }
  rate = clamp(rate, P.yearRateMin, P.yearRateMax);
  e.priceLevel = Math.max(P.base, e.priceLevel * (1 + rate));
  e.priceHist[y] = e.priceLevel;
  // keep the history bounded (only current & prior year are ever read, plus
  // founding years within the last few years) — drop anything older than ~6y
  for (const k in e.priceHist) if (y - (+k) > 6 && +k !== CFG.START_YEAR) delete e.priceHist[k];
}

/** v0.5.5 population manager: recompute the macro population trend for the
 *  new year. The yearly rate composes the era's demographic tide, the business
 *  cycle, war, great-quake reconstruction and how much rail service the region
 *  actually enjoys; it is folded into st.econ.popPressure (≈0.3..1.8), the
 *  multiplier that scales monthlyGrowth and the residential occupancy target.
 *  Good times fill the city; war and decline empty it. */
function updatePopulation(st) {
  const P = CFG.POP, e = st.econ;
  let rate = P.eraRate[eraOf(st.time.year).key] || 0;
  rate += P.cycleWeight * ((e.cycle || 1) - 1);
  if (st.war && st.war.active) rate += P.warWeight * (st.war.inten || 0);
  if (e.rebuild && e.rebuild.years > 0) rate += P.quakeWeight * (e.rebuild.k || 1);
  rate += P.railWeight * Math.min(1, (e.demandIndex || 0) / 4);
  e.popRate = rate;
  e.popPressure = clamp(1 + P.pressureK * rate, P.min, P.max);
}

function onNewYear(st) {
  updateInflation(st);          // fix this year's price level before any cost is read
  updatePopulation(st);         // macro population trend for the new year (v0.5.5)
  updateKaido(st);              // road states evolve with the era (dirt→paved→highway)
  // Year-end levy for the closing year: property tax on all land plus a
  // lump-sum upkeep charge per station building. (Maintenance and payroll
  // are charged separately, every sim-day — see sim.js / hr.js.)
  const inflPrev = inflationOf(st, st.time.year - 1);
  for (const co of st.companies) {
    if (!co.alive) continue;
    let tax = 0;
    for (const i of co.land) tax += (st.hexes[i].value || landPrice(st, i));
    tax = Math.round(tax * CFG.LAND.taxYearly);
    let upkeep = 0;
    for (const s of st.stations) {
      if (s.co !== co.id || !s.alive) continue;
      upkeep += (s.isDepot ? CFG.DEPOT.yearlyMaint : CFG.STATION.yearlyMaint) * inflPrev;
    }
    upkeep = Math.round(upkeep);
    co.stats.costYear += tax + upkeep;
    co.stats.lastLevy = { tax, upkeep };
    if (co.isPlayer && tax + upkeep > 0) {
      logEvent(st, "Year-end levy: property tax " + fmtYen(tax) + " + station upkeep " + fmtYen(upkeep) + ".");
      queueSfx(st, "tax_levied");
    }
    // Tax delinquency (v0.5): the levy (plus any carried arrears) must be paid
    // out of positive cash. What can't be paid becomes ARREARS; three
    // consecutive delinquent years force a compulsory loan, and if the credit
    // line can't cover it the company is sold out from under its owner.
    const bill = tax + upkeep + Math.round(co.taxArrears || 0);
    if (co.cash >= bill) {
      co.cash -= bill;
      if (co.taxArrears > 0 && co.isPlayer) logEvent(st, "Tax arrears cleared — the collector is satisfied.");
      co.taxArrears = 0; co.delinquentYears = 0;
    } else if (bill > 0) {
      const payable = Math.max(0, Math.min(Math.floor(co.cash), bill));
      co.cash -= payable;
      co.taxArrears = bill - payable;
      co.delinquentYears = (co.delinquentYears | 0) + 1;
      if (co.isPlayer) {
        logEvent(st, "⚠ Unpaid obligations: " + fmtYen(co.taxArrears) + " carried as arrears (year " +
          co.delinquentYears + " of 3 before the bank moves in).", "major");
        queueSfx(st, "arrears_warning");
      }
      if (co.delinquentYears >= 3) {
        const need = Math.round(co.taxArrears);
        if (availableCredit(st, co) >= need) {
          borrowLoan(st, co, need);
          co.cash -= need; co.taxArrears = 0; co.delinquentYears = 0;
          if (co.isPlayer) logEvent(st, "The " + bankName(st) + " forces a compulsory loan of " + fmtYen(need) +
            " to settle your arrears — the debt is now on your books.", "major");
        } else if (co.isPlayer) {
          st.ended = true; st.endReason = "sellout";
          queueSfx(st, "sellout");
          logEvent(st, "💀 Three years delinquent and no credit left — the bank sells your railway out from under you.", "major");
        } else {
          windUpCompany(st, co);
          queueSfx(st, "windup");
          logEvent(st, "💀 " + co.name + " is sold out — three years of unpaid taxes and an exhausted credit line.", "major");
        }
      }
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
    co.stats.landRevYear = 0; co.stats.commerceRevYear = 0; co.stats.landCostYear = 0;
  }
  // Fares are NOT inflation-indexed (v0.6): the player's fares — and the
  // company default itself — stay exactly where they were set, eroding in
  // real terms as prices rise. The Money panel warns when the default falls
  // far below the era-comfortable level and offers a one-click raise. AI
  // companies actively manage their prices, so THEIR default re-tracks the
  // era rate each year (their line-level fareAggro tuning still overrides).
  for (const co of st.companies) {
    if (!co.alive) continue;
    if (!co.isPlayer) {
      co.defaultFarePerKm = +(CFG.PAX.defaultFarePerKm * inflationOf(st, st.time.year)).toFixed(3);
    }
    for (const l of st.lines) {
      if (!l.alive || l.co !== co.id || l.fareOverride) continue;
      l.fare = companyDefaultFare(st, co);
    }
  }
  st.od.dirty = true;
  // hopeless insolvency, expressed in loan terms (v0.5): an AI whose cash PLUS
  // remaining credit headroom stays deep underwater is wound up — its rope is
  // exactly its Kangyō-Bank line, same as the player's. (AI draw on the line
  // automatically in aiTick; the tax-arrears sell-out above applies to them
  // too. The player is never wound up here — their end is the arrears spiral.)
  for (const co of st.companies) {
    if (!co.alive || co.isPlayer) continue;
    const infl = inflationOf(st, st.time.year);
    const slack = co.cash + availableCredit(st, co);
    const recent = co.stats.history.slice(-4);
    const deep = slack < -2 * CFG.START_CASH * infl;
    // an operator with running lines gets far more rope than a lineless
    // zombie — young railways legitimately spend years underwater while
    // ridership ramps, but a company with no service and no credit is done
    const hasLines = st.lines.some(l => l.alive && l.co === co.id);
    const chronic = slack < (hasLines ? -1.0 : -0.25) * CFG.START_CASH * infl &&
                    recent.length === 4 && recent.every(h => h.cash < 0);
    if (deep || chronic) {
      windUpCompany(st, co);
      queueSfx(st, "windup");
      logEvent(st, "💀 " + co.name + " is wound up — creditors seize the assets, the rails are lifted for scrap, and its charters lapse.", "major");
    }
  }
  // AI market entries (all present by start of Showa)
  for (let i = st.pendingAI.length - 1; i >= 0; i--) {
    const p = st.pendingAI[i];
    if (st.time.year >= p.year) {
      const rng = st.aiRng;
      const diff = CFG.AI.DIFFICULTIES[p.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
      // Later entrants raise MORE capital than the 1872 pioneers (×1.6): they
      // face developed-era land prices, incumbent competition, and — since the
      // v0.5 water map — bay-side corridors that need river bridging from day
      // one. Historically the Taisho suburban railways floated far larger
      // share issues than the Meiji originals.
      createCompany(st, {
        name: p.name, color: p.color, isPlayer: false, founded: st.time.year,
        cash: CFG.START_CASH * inflationOf(st, st.time.year) * 1.6 * diff.cashMult,
        gauge: rndPick(rng, CFG.START_GAUGES), difficulty: p.difficulty,
      });
      logEvent(st, p.name + " enters the railway business" +
        (diff !== CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY] ? " (" + diff.name + ")" : "") + "!", "event");
      queueSfx(st, "company_enter");
      st.pendingAI.splice(i, 1);
    }
  }
  // workforce pass for the year ahead: labor market, AI wage policy, payroll &
  // maintenance costs, morale drift and any strikes; then the awards ceremony
  recomputeWorkforce(st);
  annualAwards(st);
  yearlyEvents(st);
  aiBuyouts(st);
  for (const co of st.companies) if (co.alive && !co.isPlayer) aiResearch(st, co);   // rivals invest in R&D
  refreshTrainCars(st);
  st.renderDirty = true;                       // era palette may shift
  if (!SUPPRESS_AUTOSAVE && typeof localStorage !== "undefined") saveToLocal(st);   // autosave
  if (st.time.year > CFG.END_YEAR && !st.ended) {
    st.ended = true;
    queueSfx(st, "victory");
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
 *  (raw, matching the "~X days left" figures shown in the construction queue).
 *  With crew-limited construction (allocateCrews) this is an estimate: jobs
 *  waiting for a free crew progress slower than 1×, multi-crew corridors
 *  faster — the skip lands near, not exactly on, the completion. */
function calendarDaysToNextCompletion(st, co) {
  let min = Infinity;
  for (const job of st.builds) {
    if (job.co !== co.id) continue;
    const remCal = job.kind === "track"
      ? Math.max(0, (job.hexes.length - job.done) * job.daysPerHex - job.progress)
      : Math.max(0, job.total - job.progress);
    min = Math.min(min, remCal);
  }
  for (const s of st.stations) {
    if (s.co !== co.id || !s.alive) continue;
    for (const rem of [s.building, s.commerceBuilding, s.platBuilding, s.taishinBuilding]) {
      if (rem > 0) min = Math.min(min, rem);
    }
  }
  return Number.isFinite(min) ? min : 0;
}

/** Simulated days to fast-forward to cover the player's nearest completion
 *  (0 if nothing is under construction). Crew-aware (v0.5): instead of a raw
 *  calendar-day conversion, this REPLAYS the FIFO crew allocation
 *  (allocateCrews) day by day over a copy of the queue, so jobs waiting for a
 *  free crew and multi-crew corridors both land the skip exactly on the first
 *  real completion. Station works tick at fixed rate, independent of crews. */
function daysToNextCompletion(st, co) {
  const speed = Math.max(0.1, (co && co._buildSpeed) || 1);
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  let best = Infinity;
  for (const s of st.stations) {
    if (s.co !== co.id || !s.alive) continue;
    for (const rem of [s.building, s.commerceBuilding, s.platBuilding, s.taishinBuilding]) {
      if (rem > 0) best = Math.min(best, Math.max(1, Math.ceil(rem / (span * speed))));
    }
  }
  // civil works: simulate the same FIFO crew split processBuilds will apply
  const crews = CFG.TRACK.crewsByEra[eraOf(st.time.year).key];
  const jobs = st.builds.filter(j => j.co === co.id).map(j => j.kind === "track"
    ? { kind: "track", left: j.hexes.length - j.done, progress: j.progress, per: j.daysPerHex }
    : { kind: j.kind, rem: j.total - j.progress });
  for (let d = 1; jobs.some(j => (j.kind === "track" ? j.left > 0 : j.rem > 0)) && d < best && d < 1e5; d++) {
    let free = crews;
    for (const j of jobs) {
      const want = j.kind === "track" ? Math.max(0, j.left) : (j.rem > 0 ? 1 : 0);
      const slots = Math.min(free, want);
      free -= slots;
      if (!slots) continue;
      const work = span * speed * slots;
      if (j.kind === "track") {
        j.progress += work;
        while (j.progress >= j.per && j.left > 0) { j.progress -= j.per; j.left--; }
        if (j.left <= 0) best = Math.min(best, d);
      } else {
        j.rem -= work;
        if (j.rem <= 0) best = Math.min(best, d);
      }
    }
  }
  return Number.isFinite(best) ? best : 0;
}

/** Calendar days that actually ELAPSE on the clock when the sim skips
 *  `simDays` simulated days. Skips only land on whole simulated-day
 *  boundaries, so this can run slightly past the nearest completion's ETA —
 *  callers that show the skip size to the player should use this so the label
 *  matches how far the calendar (and every queue ETA) will actually move. */
function calendarDaysAppliedBySkip(co, simDays) {
  return simDays * CFG.CAL_DAYS_PER_SIM_DAY;
}

/** Pay down tax arrears out of cash, as much as the balance allows. Clears
 *  the delinquency counter when the arrears reach zero. Returns the amount
 *  actually paid. */
function payTaxArrears(st, co) {
  const owed = Math.round(co.taxArrears || 0);
  const pay = Math.max(0, Math.min(Math.floor(co.cash), owed));
  if (pay <= 0) return 0;
  co.cash -= pay;
  co.taxArrears = owed - pay;
  if (co.taxArrears <= 0) {
    co.taxArrears = 0; co.delinquentYears = 0;
    if (co.isPlayer) logEvent(st, "Tax arrears paid in full — the collector is satisfied and the delinquency record is wiped.");
  } else if (co.isPlayer) {
    logEvent(st, "Paid " + fmtYen(pay) + " toward tax arrears; " + fmtYen(co.taxArrears) + " still outstanding.");
  }
  return pay;
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
    // the renderer owns canvas sizing: it sets the backing store to CSS size
    // × devicePixelRatio (see makeRenderer.resize) so the map renders at the
    // display's real resolution instead of being blur-upscaled by the browser
    G.renderer = makeRenderer(canvas);
    window.addEventListener("resize", () => G.renderer.resize());
    if (typeof audioInit === "function") audioInit();      // audio (browser only; degrades gracefully)
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
      if (typeof audioTick === "function") audioTick(G);   // drain SFX queue + track era BGM
      renderTopbar(G);
      G.renderer.drawFrame(G.st, G.ui);
      if (G.st.ended && !endShown) { endShown = true; showEndScreen(G); }
      if (G.st !== st) { st = G.st; endShown = false; }   // new game / load swapped state
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
