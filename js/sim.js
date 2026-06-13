/* =========================================================================
 * sim.js — The economic heart: passenger origin–destination simulation,
 * generalized-cost route choice over the service network, capacity and
 * crowding, daily finance, and development/land-value growth along
 * popular lines. No DOM access.
 * ========================================================================= */
"use strict";

/* ---- Catchments ------------------------------------------------------------
 * Each station draws population & attractions from hexes within radius 2,
 * weighted by 1/(1+dist) and split between overlapping stations (bigger
 * stations pull a larger share). Origins and destinations therefore come
 * from concrete hex buildings, not abstractions.
 */
function computeCatchments(st) {
  const claims = new Map();   // hexIdx -> [{sid, w}]
  for (const s of st.stations) {
    if (!s.alive || s.building) continue;
    s.pop = 0; s.att = 0;
    if (s.isDepot && !s.depotAsStation) continue;   // pure depot: no passenger catchment
    const radius = CFG.STATION.catchment + (s.level >= 3 ? 1 : 0);
    for (const i of hexesWithin(s.hex, radius)) {
      const w = (1 + s.level * 0.5) / (1 + hexDist(i, s.hex));
      if (!claims.has(i)) claims.set(i, []);
      claims.get(i).push({ sid: s.id, w });
    }
  }
  for (const [i, list] of claims) {
    const h = st.hexes[i];
    const pop = hexPop(h), att = hexAtt(h);
    if (!pop && !att) continue;
    const tot = list.reduce((a, c) => a + c.w, 0);
    for (const c of list) {
      const s = st.stations[c.sid], share = c.w / tot;
      const prox = 1 / (1 + hexDist(i, s.hex) * 0.4);
      // depot-as-station: yard/maintenance facilities reduce commerce draw
      const mult = s.isDepot ? CFG.DEPOT.commerceMult : 1;
      s.pop += pop * share * prox * mult;
      s.att += att * share * prox * mult;
    }
  }
}

/* ---- Service network --------------------------------------------------------
 * Nodes: operating stations. Edges: consecutive *stop* stations on each line
 * that has trains. Edge cost = fare + travelTime × value-of-time. A transfer
 * (changing line) costs TRANSFER_MIN extra.
 */
function buildNetwork(st) {
  const edges = new Map();    // sid -> [{to, line, time, fare, dist}]
  const addEdge = (a, b, line, time, fare, dist) => {
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a).push({ to: b, line: line.id, time, fare, dist });
  };
  for (const line of st.lines) {
    if (!line.alive || !line.trains.length) continue;
    const speed = Math.max(...line.trains.map(t => CFG.TRAINS[st.trains[t].type].speed));
    const stops = line.stations.filter(sid => line.stops[sid] && st.stations[sid].alive && !st.stations[sid].building);
    line._speed = speed;
    line._stops = stops;
    for (let k = 0; k + 1 < stops.length; k++) {
      const a = stops[k], b = stops[k + 1];
      const ia = line.path.indexOf(st.stations[a].hex), ib = line.path.indexOf(st.stations[b].hex);
      const dist = Math.abs(ib - ia);                     // hex = 1 km
      const time = (dist / speed) * 60 + CFG.DWELL_MIN;   // minutes
      const fare = dist * line.fare;
      addEdge(a, b, line, time, fare, dist);
      addEdge(b, a, line, time, fare, dist);
    }
  }
  return edges;
}

/** Dijkstra from one station over generalized cost; returns {cost, prevEdge}. */
function routeFrom(st, edges, src, vot) {
  const cost = new Map([[src, 0]]);
  const prevEdge = new Map();
  const prevLine = new Map([[src, -1]]);
  const heap = makeHeap();
  heap.push(0, src);
  while (heap.size()) {
    const [c, cur] = heap.pop();
    if (c > (cost.get(cur) ?? Infinity)) continue;
    const out = edges.get(cur);
    if (!out) continue;
    for (const e of out) {
      const transfer = prevLine.get(cur) !== -1 && prevLine.get(cur) !== e.line ? CFG.TRANSFER_MIN * vot : 0;
      const line = st.lines[e.line];
      const nc = c + e.fare + e.time * vot + transfer + (2 - line.desirability) * 0; // desirability handled in demand
      if (nc < (cost.get(e.to) ?? Infinity)) {
        cost.set(e.to, nc);
        prevEdge.set(e.to, { from: cur, edge: e });
        prevLine.set(e.to, e.line);
        heap.push(nc, e.to);
      }
    }
  }
  return { cost, prevEdge };
}

/* ---- O-D assignment ---------------------------------------------------------
 * Gravity demand between station pairs, logit mode-share against the era's
 * non-rail alternative, loaded onto the chosen min-cost route. Sets per-line
 * demand and per-company potential revenue. Called when the network changes
 * or every PAX.reassignDays days.
 */
function assignOD(st) {
  computeCatchments(st);
  const edges = buildNetwork(st);
  const year = st.time.year;
  const era = eraOf(year).key;
  const vot = CFG.PAX.votByEra[era];
  const altPerKm = CFG.PAX.altPerKmByEra[era];
  const adoption = adoptionOf(year) * st.econ.commuteFactor;

  // reset accumulators
  for (const l of st.lines) { l.demand = 0; l.rev = 0; l._coRev = {}; }
  for (const s of st.stations) s.board = 0;

  const stas = st.stations.filter(s => s.alive && !s.building && edges.has(s.id));
  for (const A of stas) {
    const { cost, prevEdge } = routeFrom(st, edges, A.id, vot);
    for (const B of stas) {
      if (B.id <= A.id) continue;
      const gc = cost.get(B.id);
      if (gc === undefined) continue;
      const crow = hexDist(A.hex, B.hex);
      if (crow < 2) continue;
      // gravity base: residents at A heading to jobs/shops at B, and vice versa
      let base = CFG.PAX.gravityK * (A.pop * B.att + B.pop * A.att) / 100;
      base *= Math.exp(-crow / 25);                              // trip-length decay
      // mode share: rail generalized cost vs walking/bus/car alternative
      const altCost = crow * altPerKm * vot + crow * 0.1;
      const share = 1 / (1 + Math.exp((gc - altCost) / Math.max(1, CFG.PAX.costLambda * vot)));
      // average desirability (crowding frustration) of lines on the route
      let desire = 1, nseg = 0;
      for (let cur = B.id; cur !== A.id;) {
        const pe = prevEdge.get(cur);
        if (!pe) { desire = 0; break; }
        desire = Math.min(desire, st.lines[pe.edge.line].desirability);
        nseg++; cur = pe.from;
      }
      const trips = base * share * adoption * st.econ.cycle * desire;
      if (trips < 0.05) continue;
      // load route: directional demand + revenue split by segment owner
      let cur = B.id;
      while (cur !== A.id) {
        const pe = prevEdge.get(cur);
        const line = st.lines[pe.edge.line];
        line.demand += trips;
        const segRev = trips * pe.edge.fare * 2;                 // round trips
        line._coRev[line.co] = (line._coRev[line.co] || 0) + segRev;
        line.rev += segRev;
        cur = pe.from;
      }
      A.board += trips; B.board += trips;
    }
  }

  // capacity & crowding per line (per direction, per weekday)
  for (const line of st.lines) {
    if (!line.alive || !line.trains.length) { line.capacity = 0; line.served = 0; continue; }
    const lenKm = line.path.length;
    const stopsN = (line._stops || []).length;
    const roundTripMin = (2 * lenKm / (line._speed || 35)) * 60 + stopsN * 2 * CFG.DWELL_MIN + 10;
    const tripsPerDay = Math.max(1, (CFG.SERVICE_HOURS * 60) / roundTripMin);
    let cap = 0;
    for (const tid of line.trains) {
      const tr = st.trains[tid];
      if (tr.alive) cap += CFG.TRAINS[tr.type].cap * tr.cars * tripsPerDay;
    }
    // damaged track throttles the whole line
    const dmg = line.path.filter(i => st.hexes[i].track && st.hexes[i].track.dmg > 0).length;
    if (dmg) cap *= Math.max(0, 1 - (dmg / line.path.length) * 3);
    line.capacity = cap;
    const ratio = cap > 0 ? line.demand / cap : Infinity;
    const servedFrac = ratio > 1 ? 1 / ratio : 1;
    line.served = line.demand * servedFrac;
    line.servedFrac = servedFrac;
    // overcrowding frustrates passengers → less desirable next round
    const over = Math.min(1, Math.max(0, ratio - 1));
    line.desirability = clamp(1 - CFG.PAX.crowdDesirePenalty * over, 0.3, 1);
  }
  st.od.lastAssign = st.time.totalDays;
  st.od.dirty = false;
}

/* ---- Daily tick -------------------------------------------------------------- */

function isHoliday(st) {
  const dow = st.time.totalDays % 7;
  return dow === 5 || dow === 6;          // every 6th & 7th day
}

function dailyTick(st) {
  processBuilds(st);
  if (st.od.dirty || st.time.totalDays - st.od.lastAssign >= CFG.PAX.reassignDays) assignOD(st);

  // each simulated day stands for ~52 calendar days of that day-type
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  const dayMult = (isHoliday(st) ? CFG.PAX.holidayMult : 1) * st.econ.paxMult;

  // damaged track heals over (calendar) time; no repair charges
  for (const h of st.hexes) {
    if (h.track && h.track.dmg > 0) {
      h.track.dmg = Math.max(0, h.track.dmg - span);
      if (!h.track.dmg) st.od.dirty = true;
    }
  }

  for (const co of st.companies) {
    if (!co.alive) continue;
    let rev = 0, pax = 0;

    for (const line of st.lines) {
      if (!line.alive || line.co !== co.id) continue;
      const frac = (line.servedFrac ?? 1) * dayMult;
      pax += line.served * dayMult * 2;                       // round-trip journeys (per day)
      for (const cid in line._coRev || {}) {
        const r = line._coRev[cid] * frac * span;
        if (+cid === co.id) rev += r;
        else { st.companies[cid].cash += r; }                 // rights partner's cut
      }
    }
    // rent from developed non-rail land (running costs are levied at year end)
    for (const i of co.land) {
      const h = st.hexes[i];
      if (!h.track && !h.stations.length && h.cons && h.cons !== "rice") {
        const v = h.value || landPrice(st, i);
        rev += v * CFG.LAND.rentPerDay * span * (0.5 + 0.25 * h.dev);
      }
    }
    co.cash += rev;
    co.stats.revToday = rev; co.stats.costToday = 0;
    co.stats.revYear += rev;
    co.stats.pax = pax;
    co.stats.paxAvg = co.stats.paxAvg * 0.9 + pax * 0.1;      // running average for victory
  }

  // global demand index drives land prices everywhere
  const totalPax = st.companies.reduce((a, c) => a + (c.alive ? c.stats.pax : 0), 0);
  st.econ.demandIndex = st.econ.demandIndex * 0.93 + 0.07 * Math.log10(1 + totalPax);

  monthlyGrowth(st);   // each tick spans ~7 weeks of development
}

/* ---- Development growth -------------------------------------------------------
 * The engine (not the player) develops land: hexes near busy stations gain
 * residents/commerce, raising land values and future demand. Crowded,
 * frustrating lines grow slower. Rail hexes never develop (rails only).
 */
function monthlyGrowth(st) {
  const rng = st.growthRng;
  for (const s of st.stations) {
    if (!s.alive || s.building || !s.board) continue;
    // average desirability of lines stopping here
    let desire = 1;
    for (const l of st.lines) {
      if (l.alive && l.co === s.co && l.stops && l.stops[s.id]) desire = Math.min(desire, l.desirability);
    }
    const power = Math.min(1, s.board / 400) * desire;
    if (power <= 0.02) continue;
    for (const i of hexesWithin(s.hex, CFG.STATION.catchment)) {
      const h = st.hexes[i];
      if (h.track || h.stations.length) continue;
      if (!CFG.TERRAIN[h.terrain].buildable || CFG.TERRAIN[h.terrain].bridge || h.terrain === "mountain") continue;
      const p = power * 0.06 / (1 + hexDist(i, s.hex));
      if (rnd(rng) < p) {
        if (!h.cons) h.cons = "house";
        else if (h.cons === "rice") h.cons = rnd(rng) < 0.8 ? "house" : "road";
        else if (h.cons === "house" && h.dev >= 3) h.cons = rnd(rng) < 0.6 ? "apartment" : "shop";
        else if (h.dev < 5) h.dev++;
        h.valueBoost = Math.min(6, (h.valueBoost || 1) * 1.03);
        if (h.owner >= 0) h.value = landPrice(st, i);
        st.renderDirty = true;
        st.od.dirty = true;
      }
    }
  }
}

/* ---- Day-phase helper (visuals: rush hours, day/night) ----------------------- */
function dayPhase(frac) {
  let cur = CFG.DAY_PHASES[0];
  for (const p of CFG.DAY_PHASES) if (frac >= p.from) cur = p;
  return cur;
}
