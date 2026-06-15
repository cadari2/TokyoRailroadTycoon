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

/** Dijkstra from one station over generalized cost; returns {cost, prevEdge}.
 *  Generalized cost = fare + in-vehicle time×VoT (inflated when the line is
 *  crowded) + a wait penalty when boarding (½ headway, so frequency matters)
 *  + a transfer penalty on line changes. Crowding & wait now steer route
 *  choice — riders shun packed or infrequent lines, not just whole trips. */
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
      const line = st.lines[e.line];
      const boarding = prevLine.get(cur) !== e.line;                 // entering a new line (incl. from source)
      const wait = boarding ? (line._waitMin || 0) * vot : 0;
      const transfer = (prevLine.get(cur) !== -1 && boarding) ? CFG.TRANSFER_MIN * vot : 0;
      const crowd = 1 + CFG.PAX.crowdTimePenalty * Math.max(0, (line._load || 0) - 1);
      const nc = c + e.fare + e.time * vot * crowd + wait + transfer;
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

/** Per-line capacity, service headway and current crowding load — computed
 *  before O-D assignment so route choice can react to crowding/frequency.
 *  _load uses last round's demand (0 on the first pass; converges daily). */
function precomputeLineCapacity(st) {
  const comfortFare = CFG.PAX.defaultFarePerKm * CFG.PAX.comfortFareMult * inflationOf(st.time.year);
  for (const line of st.lines) {
    if (!line.alive || !line.trains.length) {
      line.capacity = 0; line._load = 0; line._waitMin = 0;
      line._farePressure = line.fare / comfortFare;
      continue;
    }
    const lenKm = line.path.length;
    const stopsN = (line._stops || []).length;
    const roundTripMin = (2 * lenKm / (line._speed || 35)) * 60 + stopsN * 2 * CFG.DWELL_MIN + 10;
    const nTrains = line.trains.filter(id => st.trains[id] && st.trains[id].alive).length;
    const tripsPerDay = Math.max(1, (CFG.SERVICE_HOURS * 60) / roundTripMin);
    let cap = 0;
    for (const tid of line.trains) {
      const tr = st.trains[tid];
      if (tr && tr.alive) cap += CFG.TRAINS[tr.type].cap * tr.cars * tripsPerDay;
    }
    const dmg = line.path.filter(i => st.hexes[i].track && st.hexes[i].track.dmg > 0).length;
    if (dmg) cap *= Math.max(0, 1 - (dmg / line.path.length) * 3);
    line.capacity = cap;
    // headway = time between successive trains passing a point
    line._waitMin = 0.5 * (roundTripMin / Math.max(1, nTrains)) * CFG.PAX.waitWeight;
    line._load = cap > 0 ? (line.demand || 0) / cap : 0;          // prior round's load
    line._farePressure = line.fare / comfortFare;
  }
}

/* ---- O-D assignment ---------------------------------------------------------
 * Gravity demand between station pairs, logit mode-share against the era's
 * non-rail alternative, loaded onto the chosen min-cost route. Sets per-line
 * demand and per-company potential revenue. Called when the network changes
 * or every PAX.reassignDays days.
 */
function assignOD(st) {
  computeCatchments(st);
  const edges = buildNetwork(st);                 // sets line._speed, _stops
  const year = st.time.year;
  const era = eraOf(year).key;
  const vot = CFG.PAX.votByEra[era];
  const altPerKm = CFG.PAX.altPerKmByEra[era];
  const adoption = adoptionOf(year) * st.econ.commuteFactor;
  const comfortFare = CFG.PAX.defaultFarePerKm * CFG.PAX.comfortFareMult * inflationOf(year);
  const destSpread = Math.max(1, CFG.PAX.destLambda * CFG.PAX.costLambda * vot);

  precomputeLineCapacity(st);                      // capacity/headway/load for route-choice crowding

  // reset accumulators
  for (const l of st.lines) { l.demand = 0; l.rev = 0; l._coRev = {}; }
  for (const s of st.stations) { s.board = 0; s._affordSum = 0; s._affordW = 0; }

  const stas = st.stations.filter(s => s.alive && !s.building && edges.has(s.id));
  for (const A of stas) {
    const { cost, prevEdge } = routeFrom(st, edges, A.id, vot);
    // reachable destinations + accessibility weights (for competitive choice)
    const dests = [];
    let wSum = 0, attSum = 0;
    for (const B of stas) {
      if (B.id === A.id) continue;
      const gc = cost.get(B.id);
      if (gc === undefined) continue;
      const crow = hexDist(A.hex, B.hex);
      if (crow < 2) continue;
      const access = Math.exp(-gc / destSpread);
      dests.push({ B, gc, crow, access });
      wSum += B.att * access; attSum += B.att;
    }
    if (!dests.length || attSum <= 0) continue;
    const meanAccess = wSum / attSum;              // attraction-weighted mean accessibility

    for (const { B, gc, crow, access } of dests) {
      // gravity base: residents of A heading to jobs/shops at B (the reverse
      // flow is generated when B is the origin, preserving total scale)
      let base = CFG.PAX.gravityK * (A.pop * B.att) / 100;
      base *= Math.exp(-crow / 25);                              // trip-length decay
      // P3 — destination competition: a destination easier to reach than the
      // average reachable one wins share; harder/farther/pricier ones lose it
      const compete = clamp(access / Math.max(1e-9, meanAccess), 0.15, 4);
      // mode share: rail generalized cost vs walking/bus/car alternative
      const altCost = crow * altPerKm * vot + crow * 0.1;
      const share = 1 / (1 + Math.exp((gc - altCost) / Math.max(1, CFG.PAX.costLambda * vot)));
      // route fare/distance + worst desirability (crowding frustration) along it
      let routeFare = 0, routeDist = 0, desire = 1, ok = true;
      for (let cur = B.id; cur !== A.id;) {
        const pe = prevEdge.get(cur);
        if (!pe) { ok = false; break; }
        routeFare += pe.edge.fare; routeDist += pe.edge.dist;
        desire = Math.min(desire, st.lines[pe.edge.line].desirability);
        cur = pe.from;
      }
      if (!ok) continue;
      // P2 — affordability: ¥/km above the era-comfortable level erodes demand
      const farePerKm = routeDist > 0 ? routeFare / routeDist : 0;
      const over = Math.max(0, farePerKm / comfortFare - 1);
      const afford = 1 / (1 + over / CFG.PAX.affordSpread);
      const trips = base * compete * share * adoption * st.econ.cycle * desire * afford;
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
      // P4 input — affordability of the rides this catchment actually makes,
      // used to slow development where commuting is expensive/crowded
      const q = afford * desire;
      A._affordSum += trips * q; A._affordW += trips;
      B._affordSum += trips * q; B._affordW += trips;
    }
  }

  // served fraction & next-round desirability from the new demand vs capacity
  for (const line of st.lines) {
    if (!line.alive || !line.trains.length || line.capacity <= 0) {
      line.served = 0; line.servedFrac = 1; if (line.alive) line.desirability = 1; continue;
    }
    const ratio = line.demand / line.capacity;
    const servedFrac = ratio > 1 ? 1 / ratio : 1;
    line.served = line.demand * servedFrac;
    line.servedFrac = servedFrac;
    const over = Math.min(1, Math.max(0, ratio - 1));
    line.desirability = clamp(1 - CFG.PAX.crowdDesirePenalty * over, 0.3, 1);
  }
  // P4 — per-station ride quality (affordability × uncrowdedness) for growth
  for (const s of st.stations) {
    s.affordQ = s._affordW > 0 ? clamp(s._affordSum / s._affordW, 0.2, 1) : (s.affordQ ?? 1);
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
    // P4 — people locate where rail access is good AND affordable/uncrowded:
    // boardings proxy accessibility; affordQ folds in fares & crowding so
    // expensive, packed corridors attract less new housing/commerce
    const power = Math.min(1, s.board / 400) * desire * (s.affordQ ?? 1);
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
