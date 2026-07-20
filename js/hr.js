/* =========================================================================
 * hr.js — The workforce layer: headcount, payroll, morale, the labor
 * market, strikes, and the annual awards ceremony. Pure simulation, no DOM.
 *
 * Design: owning and running a network now costs money every day —
 * permanent-way & rolling-stock maintenance plus payroll. Wages are a
 * player-controlled dial (co.wageLevel) measured against a prevailing wage
 * that rises with the era and a tight labor market. Pay and overwork move
 * morale, which feeds back into service capacity, construction speed and
 * strike risk. A year-end ceremony recognizes the best and worst operators.
 * ========================================================================= */
"use strict";

/* ---- Headcount & maintenance ---------------------------------------------- */

/** Total people this company employs, derived from the network it runs. */
function companyHeadcount(st, co) {
  const H = CFG.HR;
  const km = companyTrackKm(st, co);
  let stationTiers = 0;
  for (const s of st.stations) if (s.co === co.id && s.alive && !s.building) stationTiers += 1 + effectiveCommerce(st, s);
  let cars = 0;
  for (const t of st.trains) if (t.co === co.id && t.alive && !t.stored) cars += t.cars;
  return Math.round(km * H.staffPerKm + stationTiers * H.staffPerStationTier +
                    cars * H.staffPerCar + H.hqBase + km * H.hqPerKm);
}

/** Annual permanent-way maintenance: per-km, dearer on hard terrain (tunnels /
 *  bridges) and electrified track (catenary). Idle track still bleeds cash. */
function trackMaintYear(st, co) {
  const M = CFG.MAINTENANCE, infl = inflationOf(st, st.time.year);
  let c = 0;
  for (let i = 0; i < st.hexes.length; i++) {
    const t = st.hexes[i].track;
    if (!t || t.co !== co.id) continue;
    let baseK = M.trackPerKmYear * CFG.HEX_KM * CFG.TERRAIN[st.hexes[i].terrain].buildMult;
    if (t.tunnel) baseK *= CFG.TUNNELS.upkeepMult;
    // every rail on the hex is permanent way to maintain (a parallel second
    // gauge roughly doubles the per-km upkeep); catenary costs extra per rail
    for (const rail of trackRailList(t)) c += rail.elec ? baseK * (1 + M.trackElecExtra) : baseK;
  }
  return c * infl;
}

/** Annual rolling-stock maintenance: a share of each train's current-era
 *  price, scaled by car count and rising with age. Depot-stored stock costs
 *  a reduced share — so hoarding old trains is not free. */
function trainMaintYear(st, co) {
  const M = CFG.MAINTENANCE, infl = inflationOf(st, st.time.year);
  let c = 0;
  for (const tr of st.trains) {
    if (!tr.alive || tr.co !== co.id) continue;
    const age = Math.max(0, st.time.year - (tr.bought ?? st.time.year));
    const ageMult = Math.min(M.trainAgeMax, 1 + M.trainAgePerYear * age);
    let m = CFG.TRAINS[tr.type].cost * M.trainMaintFrac * (tr.cars / 3) * ageMult;
    if (tr.stored) m *= M.storedTrainMult;
    c += m;
  }
  return c * infl;
}

/* ---- Labor market --------------------------------------------------------- */

/** Prevailing annual wage per head: a Meiji base, inflation-indexed and
 *  scaled by how tight the labor market is right now. */
function prevailingWageYear(st) {
  const mult = st.labor ? st.labor.wageMult : 1;
  return CFG.HR.baseWage * inflationOf(st, st.time.year) * mult;
}

/** Recompute the labor market for the year ahead. Tightness rises with the
 *  era's structural scarcity, economic booms, and how much track the whole
 *  industry built last year (everyone hiring at once). Resets the industry
 *  build counter. */
function updateLaborMarket(st) {
  const H = CFG.HR, era = eraOf(st.time.year).key;
  const scarcity = H.scarcityByEra[era] ?? 0.4;
  const boom = H.boomTightness * Math.max(0, st.econ.cycle - 1);
  const kmLastYear = st._industryKmYear || 0;
  const expand = H.expandTightnessK * clamp(kmLastYear / 300, 0, 1);
  const tightness = scarcity + boom + expand;
  const wageMult = clamp(1 + H.tightnessWageK * Math.max(0, tightness - H.tightnessNeutral),
                         H.wageMultMin, H.wageMultMax);
  st.labor = { tightness: +tightness.toFixed(3), wageMult: +wageMult.toFixed(3), scarcity, kmLastYear };
  st._industryKmYear = 0;
}

/** Make sure st.labor exists (e.g. right after a load or new game). */
function ensureLabor(st) {
  if (!st.labor || typeof st.labor.wageMult !== "number") updateLaborMarket(st);
}

/* ---- Morale & productivity ------------------------------------------------ */

/** Set co._productivity (capacity/service) and co._buildSpeed (construction)
 *  from current morale and how far the company underpays the going wage. */
function computeProductivity(st, co) {
  const H = CFG.HR, wageMult = st.labor ? st.labor.wageMult : 1;
  const morale = co.morale ?? H.moraleDefault;
  const understaff = Math.max(0, wageMult - (co.wageLevel ?? 1));   // can't match the market → short-staffed
  const moraleProd = H.prodAtZero + (H.prodAtFull - H.prodAtZero) * morale;
  co._productivity = clamp(moraleProd * (1 - H.understaffProd * understaff), 0.55, H.prodAtFull);
  co._buildSpeed = clamp(1 - H.understaffBuild * understaff, 0.5, 1) * (0.85 + 0.15 * morale);
}

/** Effective productivity multiplier on a company's line capacity right now,
 *  including any active strike. Used by the capacity model in sim.js. */
function companyProductivity(st, co) {
  if (!co) return 1;
  let p = co._productivity ?? 1;
  if (co._strikeDays > 0) p *= CFG.HR.strikeCapMult;
  return p;
}

/** Drift morale toward a target set by pay (vs. the going wage) and overwork
 *  (crowded trains + breakneck expansion, both accumulated over the year),
 *  then refresh productivity and reset the yearly accumulators. */
function updateMorale(st, co) {
  const H = CFG.HR, wageMult = st.labor ? st.labor.wageMult : 1;
  // pay satisfaction: your wage relative to the prevailing rate
  const rel = (co.wageLevel ?? 1) / Math.max(0.5, wageMult);
  const payScore = clamp(0.5 + (rel - 1) * H.payScoreSlope, 0, 1);
  // overwork: sustained crowding plus how aggressively the company expanded
  const avgLoad = co._crowdDays ? co._crowdAccum / co._crowdDays : 0;
  const overwork = Math.max(0, avgLoad - H.overworkThreshold) * H.overworkWeight
                 + (co._kmYear || 0) * H.expandFatiguePerKm;
  const workScore = clamp(1 - overwork, 0.05, 1);
  const target = clamp(0.12 + 0.55 * payScore + 0.33 * workScore, 0, 1);
  co.morale = clamp((co.morale ?? H.moraleDefault) + (target - (co.morale ?? H.moraleDefault)) * H.moraleDrift, 0, 1);
  co.stats.morale = co.morale;
  computeProductivity(st, co);
  co._crowdAccum = 0; co._crowdDays = 0; co._kmYear = 0;
}

/** A company-scoped walkout when morale is low (more likely in militant
 *  eras). Cuts that company's effective capacity for a spell — underpaying
 *  to save money is a gamble, not free cash. */
function maybeStrike(st, co) {
  const H = CFG.HR;
  if ((co.morale ?? 1) >= H.strikeMoraleFloor) return;
  if (co._strikeDays > 0) return;                       // already out
  const militancy = H.strikeMilitancyByEra[eraOf(st.time.year).key] ?? 0.5;
  const risk = clamp(H.strikeRiskK * militancy * (H.strikeMoraleFloor - co.morale), 0, 0.9);
  if (rnd(st.evRng) < risk) {
    co._strikeDays = H.strikeDays;
    co.morale = clamp(co.morale - 0.05, 0, 1);
    logEvent(st, "⚠ " + co.name + " workers walk out over low pay and overwork — service crippled for ~" +
      H.strikeDays + " days. Raise wages to settle it.", co.isPlayer ? "major" : "event");
    if (co.isPlayer) queueSfx(st, "strike_start");
  }
}

/* ---- Per-year recompute (called from onNewYear) --------------------------- */

/** Recompute one company's headcount, operating cost and productivity from
 *  the present network and wage policy. Cheap enough to call when the player
 *  drags the wage slider. */
function recomputeCompanyOp(st, co) {
  ensureLabor(st);
  const wage = prevailingWageYear(st);
  co._headcount = companyHeadcount(st, co);
  // Service-pattern crew cost, approximated company-wide as the km-weighted
  // average of each line's crew multiplier (headcount isn't tracked per line).
  // v0.5.9.2 removed peak/off-peak roster multipliers; single-track meet
  // delays are still reflected through svcCrewMult(l).
  let svcKm = 0, svcWeighted = 0;
  for (const l of st.lines) {
    if (!l.alive || l.co !== co.id) continue;
    const km = l.path.length * CFG.HEX_KM;
    svcKm += km; svcWeighted += km * svcCrewMult(l);
  }
  const svcMult = svcKm > 0 ? svcWeighted / svcKm : 1;
  // R&D lowers running costs: automatic gates / IC cards trim payroll;
  // regenerative braking & VVVF trim traction & permanent-way running cost.
  const payroll = Math.round(co._headcount * wage * (co.wageLevel ?? 1) * rndPayrollMult(co) * svcMult);
  const opMult = rndOpCostMult(co);
  const track = Math.round(trackMaintYear(st, co) * opMult);
  const train = Math.round(trainMaintYear(st, co) * opMult);
  co._opCost = { payroll, track, train, total: payroll + track + train };
  computeProductivity(st, co);
  return co._opCost;
}

/* ---- Achievements (v0.6) ----------------------------------------------------
 * Cross-game goals persisted in localStorage (survive New Game), keyed by
 * campaign: { tokyo: { golden_spike: 1874, ... }, london: {...} }. The same
 * tests run on every map; per-campaign titles come from CFG.ACHIEVEMENTS[].
 * perCampaign. Earning 5 achievements across 2+ maps unlocks Paris.
 */
const ACH_KEY = "trt_achievements";

function readAchievements() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(ACH_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function writeAchievements(obj) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(ACH_KEY, JSON.stringify(obj)); }
  catch (e) { /* ignore */ }
}
/** Totals for unlock rules: overall count + number of maps with ≥1. */
function achievementTotals() {
  const all = readAchievements();
  let count = 0, maps = 0;
  for (const k in all) {
    const n = Object.keys(all[k] || {}).length;
    if (n > 0) { maps++; count += n; }
  }
  return { count, maps };
}
/** Campaign-flavored title for an achievement definition. */
function achTitle(def, campaignKey) {
  return (def.perCampaign && def.perCampaign[campaignKey]) || def.title;
}

/** One predicate per achievement key; all take (st, p) for the player co. */
const ACH_TESTS = {
  golden_spike: (st, p) => st.lines.some(l => l.alive && l.co === p.id &&
    l.trains.some(id => st.trains[id] && st.trains[id].alive)),
  ten_stations: (st, p) => st.stations.filter(s => s.alive && s.co === p.id && !s.building).length >= 10,
  iron_web: (st, p) => companyTrackHexes(st, p).length * CFG.HEX_KM >= 25,
  crush_hour: (st, p) => (p.stats.paxAvg || 0) >= 50000,
  double_tracked: (st, p) => st.hexes.filter(h => h.track && h.track.co === p.id &&
    trackRailList(h.track).filter(r => !r.building).length >= 2).length >= 10,
  sparks_effect: (st, p) => st.lines.some(l => l.alive && l.co === p.id && l.elec),
  going_underground: (st, p) => st.lines.some(l => l.alive && l.co === p.id &&
    l.path.some(i => st.hexes[i].track && st.hexes[i].track.tunnel) &&
    l.stations.some(sid => st.stations[sid] && st.stations[sid].underground) && l.trains.length),
  express_service: (st, p) => st.lines.some(l => l.alive && l.co === p.id &&
    l.svc && l.svc.pattern === "skip_stop"),
  timetabler: (st, p) => st.lines.some(l => l.alive && l.co === p.id &&
    l.trains.length >= 4 && (l._waitMin || 0) <= 8),
  through_service: (st, p) => st.companies.some(c => c.alive && c.id !== p.id &&
    p.rights.includes(c.id) && c.rights.includes(p.id)),
  empire_builder: (st, p) => st.companies.some(c => !c.alive && c.absorbedBy === p.id),
  landlord: (st, p) => p.land.length >= 100,
  ekimae_mogul: (st, p) => st.stations.filter(s => s.alive && s.co === p.id && (s.commerce | 0) >= 1).length >= 5,
  magnate: (st, p) => companyValue(st, p) >= 2e6 * inflationOf(st, st.time.year),
  survivor: (st, p) => p.alive && (st.events.majors || []).length > 0,
  grand_loop: (st, p) => st.lines.some(l => l.alive && l.co === p.id && l.loop &&
    l.stations.length >= 8 && l.trains.length),
  landmark_line: (st, p) => {
    const marks = [];
    for (let i = 0; i < st.hexes.length; i++) if (st.hexes[i].landmark) marks.push(i);
    const near = (hex, idxs, d) => idxs.some(m => hexDist(hex, m) <= d);
    if (marks.length) {
      return st.stations.some(s => s.alive && s.co === p.id && !s.building && near(s.hex, marks, 2));
    }
    // maps without landmark hexes (NYC, Melbourne): a waterfront station counts
    return st.stations.some(s => s.alive && s.co === p.id && !s.building &&
      neighborsOf(s.hex).some(n => { const t = st.hexes[n].terrain; return t === "river" || t === "sea"; }));
  },
};

/** Run every not-yet-earned achievement test for the player; persist and
 *  announce anything newly unlocked. Cheap — called monthly + on new year. */
function checkAchievements(st) {
  const p = st.companies.find(c => c.isPlayer);
  if (!p || !p.alive) return;
  const campaign = campaignOf(st).key;
  const all = readAchievements();
  const mine = all[campaign] = all[campaign] || {};
  let dirty = false;
  for (const def of CFG.ACHIEVEMENTS) {
    if (mine[def.key]) continue;
    const test = ACH_TESTS[def.key];
    let hit = false;
    try { hit = !!(test && test(st, p)); } catch (e) { /* never let a test kill the sim */ }
    if (hit) {
      mine[def.key] = st.time.year;
      dirty = true;
      logEvent(st, "🏆 Achievement unlocked: " + achTitle(def, campaign) + " — " + def.desc, "major");
      queueSfx(st, "award");
    }
  }
  if (dirty) writeAchievements(all);
}

/** v0.6: per-line profit & loss estimate (per day). Revenue is the operator's
 *  own cut of the line's fare take at the last O-D assignment (trackage-rights
 *  hosts keep their slice). Costs apportion the company's cached yearly
 *  operating budget across its lines: payroll by crew-weighted route-km, track
 *  upkeep by route-km, rolling-stock upkeep by fleet share. An estimate for
 *  the Lines panel — the Finance panel remains the company-level truth. */
function linePnlDay(st, line) {
  const co = st.companies[line.co];
  const revDay = ((line._coRev || {})[line.co] || 0) * (line.servedFrac ?? 1);
  let costDay = 0;
  if (co && co._opCost) {
    let kmSum = 0, crewSum = 0, fleetSum = 0;
    for (const l of st.lines) {
      if (!l.alive || l.co !== co.id) continue;
      const km = l.path.length * CFG.HEX_KM;
      kmSum += km; crewSum += km * svcCrewMult(l);
      fleetSum += l.trains.filter(id => st.trains[id] && st.trains[id].alive).length;
    }
    const km = line.path.length * CFG.HEX_KM;
    const nTr = line.trains.filter(id => st.trains[id] && st.trains[id].alive).length;
    const payroll = crewSum > 0 ? co._opCost.payroll * (km * svcCrewMult(line)) / crewSum : 0;
    const track = kmSum > 0 ? co._opCost.track * km / kmSum : 0;
    const train = fleetSum > 0 ? co._opCost.train * nTr / fleetSum : 0;
    costDay = (payroll + track + train) / 365;
  }
  return { revDay, costDay, netDay: revDay - costDay };
}

/** Refresh derived workforce figures for every company WITHOUT drifting
 *  morale or resetting accumulators (used after load / on new game). */
function refreshWorkforceDerived(st) {
  ensureLabor(st);
  for (const co of st.companies) {
    if (!co.alive) { co._opCost = null; continue; }
    recomputeCompanyOp(st, co);
  }
}

/** The full yearly workforce pass: set the market, let the AI react with its
 *  wage policy, recompute costs, drift morale, and roll the strike dice. */
function recomputeWorkforce(st) {
  updateLaborMarket(st);
  for (const co of st.companies) {
    if (!co.alive) { co._opCost = null; continue; }
    if (!co.isPlayer) aiSetWage(st, co);          // rivals match the market (leaner if harder)
    recomputeCompanyOp(st, co);
    updateMorale(st, co);                          // drift + productivity + reset accumulators
    maybeStrike(st, co);
  }
}

/** AI wage policy: pay close to the prevailing wage, a touch leaner the
 *  harder the difficulty (so tough rivals run a small morale/strike risk). */
function aiSetWage(st, co) {
  const diff = CFG.AI.DIFFICULTIES[co.ai && co.ai.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
  const target = (st.labor ? st.labor.wageMult : 1) * (1.05 - 0.07 * diff.fareAggro);
  co.wageLevel = clamp(target, CFG.HR.wageLevelMin, CFG.HR.wageLevelMax);
}

/* ---- Annual awards ceremony ----------------------------------------------- */

/** Friendly morale band label for the UI. */
function moraleLabel(m) {
  if (m >= 0.8) return "Thriving";
  if (m >= 0.62) return "Content";
  if (m >= 0.45) return "Restless";
  if (m >= 0.3) return "Unhappy";
  return "Furious";
}

/** Award one company a recognition (logs it, pays a modest prize, nudges
 *  morale & reputation). Records it for the Workforce panel. */
function grantAward(st, co, label, opts) {
  opts = opts || {};
  if (opts.cash) co.cash += opts.cash;
  if (opts.morale) co.morale = clamp((co.morale ?? CFG.HR.moraleDefault) + opts.morale, 0, 1);
  if (opts.reputation) co.reputation = clamp((co.reputation ?? 0.5) + opts.reputation, 0, 1);
  st.awardsLast.results.push({ label, co: co.id, name: co.name, cash: opts.cash || 0, bad: !!opts.bad });
  logEvent(st, (opts.bad ? "🚩 " : "🏅 ") + label + ": " + co.name +
    (opts.cash ? " (+" + fmtYen(opts.cash) + ")" : ""), co.isPlayer ? "event" : "info");
  if (co.isPlayer)
    queueSfx(st, opts.bad ? "award_bad" : /^Milestone/.test(label) ? "milestone" : "award_good");
}

/** One-time milestone, awarded the first time a company qualifies. */
function checkMilestone(st, co, key, label) {
  if (!co.awards) co.awards = [];
  if (co.awards.includes(key)) return;
  co.awards.push(key);
  const cash = Math.round(CFG.AWARDS.milestoneCash * inflationOf(st, st.time.year));
  grantAward(st, co, "Milestone — " + label, { cash, reputation: CFG.AWARDS.reputationStep });
}

/** Year-end ceremony: superlative awards across all live companies plus
 *  one-time milestones. Reads the year just closed. */
function annualAwards(st) {
  const A = CFG.AWARDS;
  st.awardsLast = { year: st.time.year - 1, results: [] };
  const alive = st.companies.filter(c => c.alive);
  if (!alive.length) return;
  const infl = inflationOf(st, st.time.year);
  const prize = co => Math.round(Math.min(A.cashCap * infl, Math.max(0, co.stats.history.length
    ? (co.stats.history[co.stats.history.length - 1].profit > 0
        ? co.stats.history[co.stats.history.length - 1].profit : 0) : 0) * A.cashFrac + A.cashCap * infl * 0.15));

  const trackKm = co => companyTrackKm(st, co);
  const best = (fn) => alive.reduce((a, c) => fn(c) > fn(a) ? c : a, alive[0]);
  const worst = (fn) => alive.reduce((a, c) => fn(c) < fn(a) ? c : a, alive[0]);

  // --- superlatives ---
  const happiest = best(c => c.morale ?? 0);
  grantAward(st, happiest, "Best Employee Satisfaction", { cash: prize(happiest), morale: A.moraleBonus, reputation: A.reputationStep });

  if (alive.length >= A.minCompaniesForWorst) {
    const grumpiest = worst(c => c.morale ?? 1);
    if (grumpiest.id !== happiest.id && (grumpiest.morale ?? 1) < A.worstMoraleCeiling) {
      grantAward(st, grumpiest, "Worst Employer", { bad: true, morale: -A.moralePenalty, reputation: -A.reputationStep });
    }
  }

  const biggest = best(trackKm);
  if (trackKm(biggest) > 0) grantAward(st, biggest, "Largest Network (" + trackKm(biggest) + " km)", { cash: prize(biggest), reputation: A.reputationStep });

  const busiest = best(c => c.stats.paxAvg || 0);
  if ((busiest.stats.paxAvg || 0) > 0) grantAward(st, busiest, "Most Passengers Carried", { cash: prize(busiest), reputation: A.reputationStep });

  const richest = best(c => (c.stats.history.length ? c.stats.history[c.stats.history.length - 1].profit : -Infinity));
  const richProfit = richest.stats.history.length ? richest.stats.history[richest.stats.history.length - 1].profit : 0;
  if (richProfit > 0) grantAward(st, richest, "Most Profitable", { cash: prize(richest), reputation: A.reputationStep });

  // --- one-time milestones ---
  for (const co of alive) {
    if (trackKm(co) >= 100) checkMilestone(st, co, "km100", "First 100 km of rail");
    if (co.cash >= 1e6 * infl) checkMilestone(st, co, "millionaire", "One million yen in the bank");
    if (st.stations.filter(s => s.co === co.id && s.alive && !s.building).length >= 10)
      checkMilestone(st, co, "sta10", "Ten stations open");
    if (st.hexes.some(h => h.track && h.track.co === co.id && trackRailList(h.track).some(r => r.elec)))
      checkMilestone(st, co, "electric", "First electrified line");
    if (st.trains.some(t => t.alive && t.co === co.id && t.type === "shinkansen"))
      checkMilestone(st, co, "shinkansen", "Shinkansen service launched");
    if ((co.morale ?? 0) >= 0.9) checkMilestone(st, co, "happyhouse", "A workforce that loves its railroad");
  }
}
