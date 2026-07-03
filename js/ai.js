/* =========================================================================
 * ai.js — Computer opponents. Expansion is demand-driven: the AI reads the
 * same per-hex latent-demand field the player's heatmap uses and discounts
 * it by how well each area is ALREADY served (by itself, a rival, or the
 * player), so it lays track toward high-demand, underserved corridors and
 * leaves saturated ones alone. Difficulty (per company, set on the start
 * screen — see CFG.AI.DIFFICULTIES) controls starting capital, cash
 * discipline, appetite, fare/wage aggression, search depth (decision
 * quality), willingness to contest served corridors, and how quickly it
 * reacts to rivals' visible construction. No DOM access.
 * ========================================================================= */
"use strict";

/* ---- Demand & service signals ----------------------------------------------
 * Demand: demandFieldCached(st) — for every hex, the latent ridership a
 * station there could draw (residents + commerce in catchment range,
 * distance-weighted). Shared with the player-facing heatmap, so AI and
 * player read the same map.
 * Coverage: how much of that latent demand nearby stations already serve.
 * A station's coverage quality falls when its lines are overcrowded (those
 * riders are frustrated and winnable) and is minimal when it has no
 * service at all. Difficulty's rivalDiscount shrinks how much of a RIVAL's
 * coverage the AI respects: an aggressive AI treats a competitor's busy
 * corridor as beatable rather than off-limits.
 */

/** Service quality of one station for coverage purposes (0..1). */
function aiStationQuality(st, s) {
  if (!s || !s.alive || s.building || (s.isDepot && !s.depotAsStation)) return 0;
  const load = stationPeakLoad(st, s.id);
  if (load <= 0) return 0.3;                                  // no trains stop here: riders up for grabs
  return clamp(1 - 0.5 * Math.max(0, load - 1), 0.4, 1);      // overcrowding erodes real coverage
}

/** Per-hex service coverage (0..1+) from co's point of view: every operating
 *  station splashes quality/(1+dist) over its catchment. Own stations count
 *  in full (don't cannibalize yourself); rivals' at (1 − rivalDiscount). */
function aiCoverageField(st, co, rivalDiscount) {
  const cov = new Float32Array(st.hexes.length);
  for (const s of st.stations) {
    const q = aiStationQuality(st, s);
    if (!q) continue;
    const mult = s.co === co.id ? 1 : 1 - rivalDiscount;
    if (mult <= 0) continue;
    for (const j of hexesWithin(s.hex, CFG.STATION.catchment)) {
      cov[j] += (q * mult) / (1 + hexDist(j, s.hex));
    }
  }
  return cov;
}

/** True if the AI could plant a corridor endpoint (station site) here. */
function aiBuildableTarget(st, co, idx) {
  const h = st.hexes[idx];
  if (h.track || h.stations.length) return false;
  const ter = CFG.TERRAIN[h.terrain];
  if (!ter.buildable || ter.bridge || h.terrain === "mountain") return false;
  if (h.owner !== -1 && h.owner !== co.id) return false;      // rivals' land & holdouts (-2)
  if (isNationalLand(idx)) return false;
  return true;
}

/** The AI's shortlist of expansion targets, best first: hexes ranked by
 *  underserved demand (latent demand × service gap), with a land-price drag
 *  (dear central parcels must earn their keep) and a small jitter so several
 *  AIs deciding the same month don't all pile onto one hex. `accept` filters
 *  candidates (e.g. to a distance ring). Difficulty's breadth caps how many
 *  finalists are fully scored and returned — the "decision quality" knob. */
function aiScoredTargets(st, co, diff, accept) {
  const dm = demandFieldCached(st);
  const cov = aiCoverageField(st, co, diff.rivalDiscount);
  const out = [];
  for (let i = 0; i < st.hexes.length; i++) {
    const gap = 1 - cov[i];
    if (gap <= 0.15) continue;                                // already well-served: not a target
    const base = dm.field[i] * gap;
    if (base <= 0) continue;
    if (accept && !accept(i)) continue;
    if (!aiBuildableTarget(st, co, i)) continue;
    out.push({ idx: i, base });
  }
  out.sort((a, b) => b.base - a.base);
  const deep = out.slice(0, Math.max(12, diff.breadth * 3));
  const infl = inflationOf(st.time.year);
  for (const t of deep) {
    t.score = (t.base - landPrice(st, t.idx) * 0.03 / infl) * (0.92 + 0.16 * rnd(st.aiRng));
  }
  deep.sort((a, b) => b.score - a.score);
  const picked = deep.filter(t => t.score > 0).slice(0, diff.breadth);
  return picked;
}

/** Mean load (demand/capacity) across an AI's running lines — its appetite for
 *  reach should follow how busy what it already owns is. */
function aiAvgLineLoad(st, co) {
  let load = 0, n = 0;
  for (const l of st.lines) {
    if (!l.alive || l.co !== co.id || l.capacity <= 0) continue;
    load += l.demand / l.capacity; n++;
  }
  return n ? load / n : 0;
}

/** A corridor is only as good as the track that reaches it: reject plans
 *  whose A* path wanders far beyond the crow-flies distance (a 26-hex detour
 *  to a hex 6 away is a monument, not a railway — it would take decades to
 *  open and bankrupt the company first). */
function aiPlanAcceptable(plan, a, b) {
  if (!plan || plan.err) return false;
  return plan.path.length <= hexDist(a, b) * 1.6 + 2;
}

/** First corridor: two well-separated high-value underserved hexes, chosen by
 *  demand MINUS what the track between them actually costs (so a cheap direct
 *  corridor beats a marginally hotter pair separated by rivers and rivals). */
function aiPickCorridor(st, co, diff) {
  const anchors = aiScoredTargets(st, co, diff);
  const infl = inflationOf(st.time.year);
  let best = null;
  for (let k = 0; k < Math.min(3, anchors.length); k++) {
    const a = anchors[k];
    const partners = aiScoredTargets(st, co, diff, i => {
      const d = hexDist(i, a.idx);
      return d >= 5 && d <= 13;
    });
    for (const p of partners.slice(0, 4)) {
      const plan = planTrack(st, co, a.idx, p.idx);
      if (!aiPlanAcceptable(plan, a.idx, p.idx)) continue;
      const value = a.score + p.score - (plan.cost + plan.landCost) * 0.02 / infl;
      if (value > 0 && (!best || value > best.value)) best = { a: a.idx, b: p.idx, plan, value };
    }
    if (best) break;                       // anchors are best-first; a workable pair at this anchor wins
  }
  return best;
}

/** React to a rival's visible push: hexes any rival is laying track on right
 *  now (the construction queue is public — cranes are visible). If one of this
 *  AI's own best targets sits beside that work and is still within reach of
 *  its network, it races the rival there. Gated per-think by reactChance, so
 *  reaction speed scales with difficulty instead of being uniform. */
function aiContestTarget(st, co, diff, scored, myStations) {
  if (!diff.reactChance || rnd(st.aiRng) >= diff.reactChance) return -1;
  const rivalHexes = [];
  for (const b of st.builds) {
    if (b.co === co.id || b.kind !== "track" || !b.hexes) continue;
    const rival = st.companies[b.co];
    if (!rival || !rival.alive) continue;
    for (let k = b.done; k < b.hexes.length; k++) rivalHexes.push(b.hexes[k]);
  }
  if (!rivalHexes.length) return -1;
  for (const t of scored) {
    if (!rivalHexes.some(h => hexDist(h, t.idx) <= 3)) continue;
    if (!myStations.some(s => { const d = hexDist(s.hex, t.idx); return d >= 3 && d <= 12; })) continue;
    return t.idx;
  }
  return -1;
}

function aiStationAt(st, co, idx) {
  const h = st.hexes[idx];
  if (h.owner === -1) {
    if (!buyLand(st, co, idx).ok) return null;
  } else if (h.owner !== co.id) return null;
  const r = buildStation(st, co, idx);
  return r.ok ? r.station : null;
}

/** One AI decision pass (called every CFG.AI.thinkDays). */
function aiTick(st, co) {
  if (!co.alive || co.isPlayer) return;
  const ai = co.ai;
  const diff = CFG.AI.DIFFICULTIES[ai.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
  const myLines = st.lines.filter(l => l.alive && l.co === co.id);
  const myStations = st.stations.filter(s => s.alive && s.co === co.id);
  const building = st.builds.some(b => b.co === co.id);
  const infl = inflationOf(st.time.year);

  // Phase 1: establish the first corridor
  if (!myStations.length && !building && !ai.plan) {
    const corridor = aiPickCorridor(st, co, diff);
    if (!corridor) return;
    const plan = corridor.plan;
    const budget = plan.cost + plan.landCost + 2 * stationCost(st, corridor.a) + CFG.TRAINS.steam_local.cost * infl;
    if (co.cash < budget * diff.bufferMult) return;      // keep a buffer (smaller for harder AI)
    if (approveTrack(st, co, plan).ok) ai.plan = { a: corridor.a, b: corridor.b };
    return;
  }
  // Phase 2: track done → stations → line → train
  if (ai.plan && !building) {
    const ha = st.hexes[ai.plan.a], hb = st.hexes[ai.plan.b];
    if (ha.track && hb.track && ha.track.co === co.id && hb.track.co === co.id) {
      const sa = ha.stations.map(i => st.stations[i]).find(s => s.co === co.id && s.alive) || aiStationAt(st, co, ai.plan.a);
      const sb = hb.stations.map(i => st.stations[i]).find(s => s.co === co.id && s.alive) || aiStationAt(st, co, ai.plan.b);
      if (sa && sb && !sa.building && !sb.building) {
        const r = createLine(st, co, sa.id, sb.id, "local");
        if (r.ok) {
          const types = trainTypesFor(st, co, r.line);
          if (types.length) buyTrain(st, co, r.line.id, types[0]);
          ai.plan = null;
        }
      }
    }
    return;
  }

  // Phase 3: grow
  for (const line of myLines) {
    // crowded → add a train (passengers are frustrated and demand suffers)
    if (line.capacity > 0 && line.demand / line.capacity > 1.1) {
      const types = trainTypesFor(st, co, line);
      if (types.length) {
        const best = types[types.length - 1];
        if (co.cash > CFG.TRAINS[best].cost * infl * 3) { buyTrain(st, co, line.id, best); return; }
      }
      // and nudge fares up to ration demand (harder AI leans harder on price)
      line.fare = +(line.fare * (1 + 0.08 * diff.fareAggro)).toFixed(2); line.fareOverride = true; st.od.dirty = true;
    } else if (line.capacity > 0 && line.demand / line.capacity < 0.4) {
      // empty trains → cut fares to attract riders
      const floor = CFG.PAX.defaultFarePerKm * infl * 0.5;
      if (line.fare > floor) { line.fare = +(line.fare * (1 - 0.08 * diff.fareAggro)).toFixed(2); line.fareOverride = true; st.od.dirty = true; }
    }
  }

  // Extend the network only when the existing one earns it: lines must be busy
  // (reach should chase real demand, not empty land) and appetite tapers as the
  // network grows, so AIs build a spine instead of carpeting the map. The far
  // end of a new branch is chosen from the underserved-demand shortlist — the
  // exception is CONTESTING: a difficulty-gated reaction to a rival visibly
  // building into a corridor this AI also wants, which skips the busy-lines
  // gate (you can't wait for your own trains to fill up while the player
  // fences off the best suburb).
  const AI = CFG.AI;
  const trackKm = companyTrackHexes(st, co).length;
  const sizeBrake = 1 / (1 + trackKm / AI.trackSoftCap);      // → 0 as the network sprawls
  const wantOrganic = myLines.length && aiAvgLineLoad(st, co) > AI.expandLoadThresh &&
    rnd(st.aiRng) < AI.expandChance * diff.expandMult * sizeBrake;
  const mayExpand = !building && myStations.length > 0 && co.cash > AI.expandCashGate * infl;
  if (mayExpand && (wantOrganic || diff.reactChance > 0)) {
    const myStationHexes = myStations.filter(s => !s.isDepot || s.depotAsStation);
    const scored = aiScoredTargets(st, co, diff, i =>
      myStationHexes.some(s => { const d = hexDist(s.hex, i); return d >= 4 && d <= 10; }));
    let target = aiContestTarget(st, co, diff, scored, myStationHexes);
    if (target < 0 && wantOrganic) {
      for (const t of scored) {
        if (t.base < AI.expandMinScore) continue;
        target = t.idx; break;                               // scored is best-first
      }
    }
    if (target >= 0) {
      // branch from the nearest own stations that give a sane (non-detour) route
      const froms = myStationHexes
        .filter(s => hexDist(s.hex, target) >= 3)
        .sort((x, y) => hexDist(x.hex, target) - hexDist(y.hex, target))
        .slice(0, 2);
      for (const from of froms) {
        const plan = planTrack(st, co, from.hex, target);
        if (!aiPlanAcceptable(plan, from.hex, target)) continue;
        if (co.cash > (plan.cost + plan.landCost) * (diff.bufferMult + 0.25)) {
          if (approveTrack(st, co, plan).ok) { ai.plan = { a: from.hex, b: target }; break; }
        }
      }
    }
  }

  // speculate: buy cheap land near own stations for rent + future value
  if (co.cash > 100000 * infl && myStations.length && rnd(st.aiRng) < 0.3 * diff.expandMult) {
    const s = rndPick(st.aiRng, myStations);
    for (const i of hexesWithin(s.hex, 2)) {
      const h = st.hexes[i];
      if (h.owner === -1 && h.cons && !h.track && landPrice(st, i) < co.cash * 0.04) {
        buyLand(st, co, i);
        break;
      }
    }
  }

  // real estate: turn idle (line-less) track into rent-earning property —
  // a railroad doesn't leave infrastructure it isn't using fallow
  if (!building && co.cash > 80000 * infl && rnd(st.aiRng) < 0.15 * diff.expandMult) {
    for (const i of companyTrackHexes(st, co)) {
      const h = st.hexes[i];
      if (h.stations.some(sid => st.stations[sid] && st.stations[sid].alive)) continue;
      if (linesUsingHex(st, i).length) continue;            // never tear up track a line uses
      const q = redevelopCost(st, co, i, "shop");
      if (co.cash > q.total * 2) { demolishAndDevelop(st, co, i, "shop"); break; }
    }
  }

  // liquidity: when short on cash, sell off the most expendable owned parcel
  // (idle & far from the network first; developed rent-earners only as a last
  // resort) back to the open market to stay solvent
  if (co.cash < 30000 * infl) {
    let plain = -1, plainFar = -1, dev = -1, devFar = -1;
    for (const i of co.land) {
      const h = st.hexes[i];
      if (h.track || h.stations.length) continue;            // can't sell infrastructure
      let d = Infinity;
      for (const s of myStations) d = Math.min(d, hexDist(i, s.hex));
      const developed = h.cons && h.cons !== "rice";
      if (developed) { if (d > devFar) { devFar = d; dev = i; } }
      else { if (d > plainFar) { plainFar = d; plain = i; } }
    }
    const sellIdx = plain >= 0 ? plain : (co.cash < 0 ? dev : -1);
    if (sellIdx >= 0) sellLand(st, co, sellIdx);
  }

  // develop station commerce & extend platforms when flush
  if (!building && myStations.length && co.cash > 50000 * infl && rnd(st.aiRng) < 0.3 * diff.expandMult) {
    const eligible = myStations.filter(isLineStop);
    const lowCommerce = eligible.filter(s => commerceEligible(s) && s.commerceBuilding <= 0 &&
      nextCommerceLevel(s) && !canBuildCommerce(st, co, s, nextCommerceLevel(s)));
    const lowPlatform = eligible.filter(s => s.cars < maxPlatformCars(st.time.year));
    if (lowCommerce.length && (!lowPlatform.length || rnd(st.aiRng) < 0.5)) {
      const s = rndPick(st.aiRng, lowCommerce);
      const cost = commerceBuildCost(st, s, nextCommerceLevel(s));
      if (co.cash > cost * diff.bufferMult) buildCommerce(st, co, s);
    } else if (lowPlatform.length) {
      const s = rndPick(st.aiRng, lowPlatform);
      const cost = stationPlatformUpgradeCost(st, s, s.cars + 1);
      if (co.cash > cost * diff.bufferMult) extendPlatform(st, co, s.id);
    }
  }
}

/** Yearly: AI companies may buy out struggling AI rivals. */
function aiBuyouts(st) {
  for (const buyer of st.companies) {
    if (!buyer.alive || buyer.isPlayer) continue;
    const diff = CFG.AI.DIFFICULTIES[buyer.ai.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
    for (const target of st.companies) {
      if (!target.alive || target.isPlayer || target.id === buyer.id) continue;
      const hist = target.stats.history.slice(-3);
      const struggling = hist.length === 3 && hist.every(h => h.profit < 0);
      // a railway still building its first line isn't "struggling", it's
      // pre-revenue: payroll losses during construction don't make it prey
      // (unless it's actually insolvent). Without this, slow Meiji builds
      // meant every late entrant was swallowed before its first train ran.
      const preRevenue = !st.lines.some(l => l.alive && l.co === target.id) && target.cash > 0;
      // harder AI is more willing to spend cash on an acquisition
      if (struggling && !preRevenue && buyer.cash > companyValue(st, target) * (3.5 - diff.expandMult)) {
        const r = buyOutCompany(st, buyer, target);
        if (r.ok) {
          logEvent(st, buyer.name + " acquired " + target.name + " for " + fmtYen(r.price) + ".");
          return;                                        // one merger per year max
        }
      }
    }
  }
}
