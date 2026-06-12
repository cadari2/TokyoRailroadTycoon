/* =========================================================================
 * ai.js — Computer opponents. Simple but logical: enter the market at a
 * staggered year, build a first line through high-demand land, then grow:
 * add trains when crowded, extend toward demand, tune fares, speculate on
 * land, and buy out struggling rivals. No DOM access.
 * ========================================================================= */
"use strict";

/** Demand score of a hex neighborhood (population + attractions nearby). */
function aiDemandScore(st, idx) {
  let score = 0;
  for (const i of hexesWithin(idx, 2)) {
    const h = st.hexes[i];
    score += hexPop(h) + hexAtt(h) * 0.6;
    if (h.track || h.stations.length) score -= 200;    // avoid already-served areas
    if (h.owner !== -1) score -= 30;
  }
  // expensive central land must earn its keep — bias toward affordable demand
  score -= landPrice(st, idx) * 0.03 / inflationOf(st.time.year);
  return score;
}

/** Find a promising corridor: two well-separated high-demand hexes. */
function aiPickCorridor(st, co) {
  const rng = st.aiRng;
  let bestA = -1, bestAS = -1;
  for (let t = 0; t < 80; t++) {
    const i = rndInt(rng, 0, st.hexes.length - 1);
    if (!CFG.TERRAIN[st.hexes[i].terrain].buildable || st.hexes[i].terrain === "mountain") continue;
    if (st.hexes[i].track || st.hexes[i].owner !== -1) continue;
    const s = aiDemandScore(st, i);
    if (s > bestAS) { bestAS = s; bestA = i; }
  }
  if (bestA < 0) return null;
  let bestB = -1, bestBS = -1;
  for (let t = 0; t < 80; t++) {
    const i = rndInt(rng, 0, st.hexes.length - 1);
    const d = hexDist(i, bestA);
    if (d < 5 || d > 13) continue;
    if (st.hexes[i].track || st.hexes[i].owner !== -1 || st.hexes[i].terrain === "mountain") continue;
    const s = aiDemandScore(st, i);
    if (s > bestBS) { bestBS = s; bestB = i; }
  }
  if (bestB < 0) return null;
  return [bestA, bestB];
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
  const myLines = st.lines.filter(l => l.alive && l.co === co.id);
  const myStations = st.stations.filter(s => s.alive && s.co === co.id);
  const building = st.builds.some(b => b.co === co.id);
  const infl = inflationOf(st.time.year);

  // Phase 1: establish the first corridor
  if (!myStations.length && !building && !ai.plan) {
    const corridor = aiPickCorridor(st, co);
    if (!corridor) return;
    const plan = planTrack(st, co, corridor[0], corridor[1]);
    if (plan.err) return;
    const budget = plan.cost + plan.landCost + 2 * stationCost(st, corridor[0]) + CFG.TRAINS.steam_local.cost * infl;
    if (co.cash < budget * 1.15) return;                 // keep a buffer
    if (approveTrack(st, co, plan).ok) ai.plan = { a: corridor[0], b: corridor[1] };
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
      // and nudge fares up to ration demand
      line.fare = +(line.fare * 1.08).toFixed(2); st.od.dirty = true;
    } else if (line.capacity > 0 && line.demand / line.capacity < 0.4) {
      // empty trains → cut fares to attract riders
      const floor = CFG.PAX.defaultFarePerKm * infl * 0.5;
      if (line.fare > floor) { line.fare = +(line.fare * 0.92).toFixed(2); st.od.dirty = true; }
    }
  }

  // extend network toward new demand when rich and idle
  if (!building && myStations.length && co.cash > 60000 * infl && rnd(st.aiRng) < 0.4) {
    const from = rndPick(st.aiRng, myStations);
    let best = -1, bestS = -1;
    for (let t = 0; t < 60; t++) {
      const i = rndInt(st.aiRng, 0, st.hexes.length - 1);
      const d = hexDist(i, from.hex);
      if (d < 4 || d > 10) continue;
      if (st.hexes[i].track || st.hexes[i].terrain === "mountain") continue;
      const s = aiDemandScore(st, i);
      if (s > bestS) { bestS = s; best = i; }
    }
    if (best >= 0 && bestS > 200) {
      const plan = planTrack(st, co, from.hex, best);
      if (!plan.err && co.cash > (plan.cost + plan.landCost) * 1.4) {
        if (approveTrack(st, co, plan).ok) ai.plan = { a: from.hex, b: best };
      }
    }
  }

  // speculate: buy cheap land near own stations for rent + future value
  if (co.cash > 100000 * infl && myStations.length && rnd(st.aiRng) < 0.3) {
    const s = rndPick(st.aiRng, myStations);
    for (const i of hexesWithin(s.hex, 2)) {
      const h = st.hexes[i];
      if (h.owner === -1 && h.cons && !h.track && landPrice(st, i) < co.cash * 0.04) {
        buyLand(st, co, i);
        break;
      }
    }
  }
}

/** Yearly: AI companies may buy out struggling AI rivals. */
function aiBuyouts(st) {
  for (const buyer of st.companies) {
    if (!buyer.alive || buyer.isPlayer) continue;
    for (const target of st.companies) {
      if (!target.alive || target.isPlayer || target.id === buyer.id) continue;
      const hist = target.stats.history.slice(-3);
      const struggling = hist.length === 3 && hist.every(h => h.profit < 0);
      if (struggling && buyer.cash > companyValue(st, target) * 2.5) {
        const r = buyOutCompany(st, buyer, target);
        if (r.ok) {
          logEvent(st, buyer.name + " acquired " + target.name + " for " + fmtYen(r.price) + ".");
          return;                                        // one merger per year max
        }
      }
    }
  }
}
