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
    const service = stationServiceLevel(st, s);
    const radius = CFG.STATION.catchment + (service >= 3 ? 1 : 0);
    for (const i of hexesWithin(s.hex, radius)) {
      const w = (1 + service * 0.5) / (1 + hexDist(i, s.hex));
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
  const edges = new Map();    // sid -> [{to, line, time, fare, dist, _vol, _ownFare, _hostFare}]
  const addEdge = (a, b, line, time, dist, ia, ib) => {
    if (!edges.has(a)) edges.set(a, []);
    // v0.5.7 trackage-rights through-fares: split the segment's km by whose
    // track each km sits on. The operator's own km price at the line's fare; a
    // host's km price at the HOST's own default fare, credited to the host. The
    // edge fare used for routing/affordability is the TRUE total the rider pays.
    const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
    let ownKm = 0; const hostKm = {};
    for (let p = lo; p < hi; p++) {
      const t = st.hexes[line.path[p + 1]] && st.hexes[line.path[p + 1]].track;
      const owner = t ? t.co : line.co;
      if (owner === line.co) ownKm++;
      else hostKm[owner] = (hostKm[owner] || 0) + 1;
    }
    const ownFare = ownKm * CFG.HEX_KM * line.fare;
    let hostFare = null, hostTotal = 0;
    for (const hid in hostKm) {
      const host = st.companies[hid];
      const f = hostKm[hid] * CFG.HEX_KM * companyDefaultFare(st, host);
      (hostFare = hostFare || {})[hid] = f;
      hostTotal += f;
    }
    edges.get(a).push({ to: b, line: line.id, time, fare: ownFare + hostTotal, dist,
      _vol: 0, _ownFare: ownFare, _hostFare: hostFare, _ia: ia, _ib: ib });
  };
  for (const line of st.lines) {
    if (!line.alive || !line.trains.length) continue;
    const speed = Math.max(...line.trains.map(t => CFG.TRAINS[st.trains[t].type].speed));
    const stops = line.stations.filter(sid => line.stops[sid] && st.stations[sid].alive && !st.stations[sid].building);
    line._speed = speed;
    line._stops = stops;
    // path indices of the served stops, ascending — drives the train animation's
    // station pauses (so trains halt only where they're scheduled to stop). A
    // station meeting the line on an adjacent hex (different gauge on its own
    // hex) maps to the nearest path hex (see stationPathPos).
    line._stopPos = stops.map(sid => stationPathPos(st, line, sid))
      .filter(i => i >= 0).sort((a, b) => a - b);
    // v0.5.9 single-track meets: where along the path opposing trains can pass
    // each other — any hex with a station (a loop in the yard) or a second
    // in-service rail of the line's gauge (true double track). Also count how
    // much of the path is still single-tracked: that fraction scales the meet
    // delay (a fully double-tracked corridor pays none).
    line._passPos = [];
    let singleN = 0;
    for (let k = 0; k < line.path.length; k++) {
      const h = st.hexes[line.path[k]];
      const railsHere = h.track ? trackRailList(h.track)
        .filter(rr => !rr.building && CFG.GAUGES[rr.gauge].mm === line.gaugeMm).length : 0;
      if (railsHere >= 2 || h.stations.length) line._passPos.push(k);
      else singleN++;
    }
    line._singleFrac = line.path.length ? singleN / line.path.length : 0;
    for (let k = 0; k + 1 < stops.length; k++) {
      const a = stops[k], b = stops[k + 1];
      const ia = stationPathPos(st, line, a), ib = stationPathPos(st, line, b);
      const dist = Math.abs(ib - ia) * CFG.HEX_KM;         // real km (v0.5.8: hex = HEX_KM km)
      const time = (dist / speed) * 60 + CFG.DWELL_MIN;   // minutes
      addEdge(a, b, line, time, dist, ia, ib);
      addEdge(b, a, line, time, dist, ia, ib);
    }
    // loop lines: close the circle with an edge from the last stop back to the
    // first (over the seam, where path[0] === path[end]). Trains circulate both
    // ways around a loop (odd/even alternate), so the edge is bidirectional.
    if (line.loop && stops.length >= 2) {
      const a = stops[stops.length - 1], b = stops[0];
      const ia = stationPathPos(st, line, a);
      const dist = ((line.path.length - 1) - ia) * CFG.HEX_KM;  // real km, last stop forward to the seam (== first stop)
      if (dist > 0) {
        const time = (dist / speed) * 60 + CFG.DWELL_MIN;
        const ib = line.path.length - 1;                  // the seam hex (== first stop's hex)
        addEdge(a, b, line, time, dist, ia, ib);
        addEdge(b, a, line, time, dist, ia, ib);
      }
    }
  }
  return edges;
}

/** Dijkstra from one station over generalized cost; returns {cost, prevEdge}.
 *  Generalized cost = fare + in-vehicle time×VoT (inflated when the line is
 *  crowded) + a wait penalty when boarding (½ headway, so frequency matters)
 *  + a transfer penalty on line changes. Crowding & wait now steer route
 *  choice — riders shun packed or infrequent lines, not just whole trips. */
function routeFrom(st, edges, src, vot, comfortW) {
  comfortW = comfortW || 0;
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
      const overload = Math.max(0, (line._load || 0) - 1);
      const crowd = 1 + CFG.PAX.crowdTimePenalty * overload;
      // discomfort: a fare-equivalent penalty for riding a packed segment, NOT
      // scaled by value-of-time, so a jammed local is unpleasant even in eras
      // when time is nearly free — nudging riders onto an emptier (pricier) express
      const comfort = comfortW * overload * e.dist;
      const nc = c + e.fare + e.time * vot * crowd + wait + transfer + comfort;
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
  const comfortFare = CFG.PAX.defaultFarePerKm * CFG.PAX.comfortFareMult * inflationOf(st, st.time.year);
  for (const line of st.lines) {
    if (!line.alive || !line.trains.length) {
      line.capacity = 0; line._load = 0; line._waitMin = 0;
      line._farePressure = (line.fare + (st.companies[line.co].serviceCharge || 0) / Math.max(1, line.path.length)) / comfortFare;
      continue;
    }
    const lenKm = line.path.length * CFG.HEX_KM;
    const stopsN = (line._stops || []).length;
    // a loop train completes its cycle by going round once (passing each stop
    // once); a linear train must run out and back (each stop twice).
    const cycleKm = line.loop ? lenKm : 2 * lenKm;
    const cycleStops = line.loop ? stopsN : stopsN * 2;
    const nTrains = line.trains.filter(id => st.trains[id] && st.trains[id].alive).length;
    // v0.5.9 single-track meets: with more than one train on a line that is
    // not fully double-tracked, opposing trains must wait for each other at
    // stations/passing loops. A linear shuttle meets each other train about
    // twice per round trip; loop trains (circulating both ways) about once.
    // The cost scales with the still-single-tracked share of the path, so
    // double-tracking buys the time back.
    const meetsPerRT = Math.max(0, nTrains - 1) * (line.loop ? 1 : 2);
    const meetDelayMin = meetsPerRT * CFG.LINK.meetDelayMin * (line._singleFrac ?? 1);
    const roundTripMin = (cycleKm / (line._speed || 35)) * 60 + cycleStops * CFG.DWELL_MIN + 10 + meetDelayMin;
    line._meetDelayMin = meetDelayMin;
    // trains idling in loops still need their crews — payroll share rises with
    // the time a round trip spends waiting (world.js svcCrewMult reads this)
    line._meetCrewMult = 1 + meetDelayMin / Math.max(1, roundTripMin - meetDelayMin);
    const tripsPerDay = Math.max(1, (CFG.SERVICE_HOURS * 60) / roundTripMin);
    line._tripsPerDay = tripsPerDay; line._nTrains = nTrains;   // v0.5.8 F1: link-load input
    let cap = 0;
    for (const tid of line.trains) {
      const tr = st.trains[tid];
      if (tr && tr.alive) cap += CFG.TRAINS[tr.type].cap * tr.cars * tripsPerDay;
    }
    const dmg = line.path.filter(i => st.hexes[i].track && st.hexes[i].track.dmg > 0).length;
    if (dmg) cap *= Math.max(0, 1 - (dmg / line.path.length) * 3);
    cap *= companyProductivity(st, st.companies[line.co]);   // morale & strikes cut effective capacity
    cap *= rndCapacityMult(st.companies[line.co]);           // IC-card faster boarding eases crowding
    cap *= svcCapacityMult(line);                            // v0.5.8 F3: rush extras / quiet-span service plan
    line.capacity = cap;
    // headway = time between successive trains passing a point
    line._waitMin = 0.5 * (roundTripMin / Math.max(1, nTrains)) * CFG.PAX.waitWeight;
    // crowding feedback is damped (half old, half new): a raw prior-round load
    // flip-flops in a period-2 cycle when a crowded line dumps its riders onto
    // a parallel one and they all come back next round — damping converges it
    const instLoad = cap > 0 ? (line.demand || 0) / cap : 0;
    line._load = 0.5 * (line._load || 0) + 0.5 * instLoad;
    line._farePressure = (line.fare + (st.companies[line.co].serviceCharge || 0) / lenKm) / comfortFare;
  }
}

/* ---- Link capacity & double-tracking (v0.5.8 F1) ---------------------------
 * Every track hex has a throughput budget (CFG.LINK.trainsPerDayPerRail per
 * in-service rail of a gauge; a second same-gauge rail — double-track,
 * world.js doubleTrackGauge — doubles it). All scheduled service through the
 * hex competes for that budget, including trackage-rights guests. Over
 * budget: the line's own capacity is capped by its worst-loaded hex, and
 * every edge crossing that hex slows down (a generalized-cost signal riders
 * already respond to, same as crowding) — no signals, no per-train blocking.
 */

/** demandedSlots[hexIdx] -> Map(gaugeMm -> round-trip train-passages/day
 *  scheduled across that hex, by every line that runs over it). */
function computeLinkDemand(st) {
  const demand = new Map();
  for (const line of st.lines) {
    if (!line.alive || !line._nTrains) continue;
    // a loop train crosses each hex once per lap; a linear train runs the
    // path twice per round trip (out and back) — mirrors precomputeLineCapacity's
    // cycleKm/cycleStops split.
    const passes = line._nTrains * line._tripsPerDay * (line.loop ? 1 : 2) * svcLinkSlotMult(line);
    if (passes <= 0) continue;
    for (const idx of line.path) {
      let m = demand.get(idx);
      if (!m) demand.set(idx, m = new Map());
      m.set(line.gaugeMm, (m.get(line.gaugeMm) || 0) + passes);
    }
  }
  return demand;
}

/** Throughput budget of hex idx for gauge mm: in-service rails of that gauge
 *  × trainsPerDayPerRail, ×stationBudgetMult if a station sits here (the
 *  throat abstraction — platforms already cap cars, so don't also meter the
 *  hex at 1× or terminals bind before platforms do). 0 if no such rail. */
function linkBudget(st, idx, mm) {
  const h = st.hexes[idx];
  if (!h.track) return 0;
  const rails = trackRailList(h.track).filter(r => !r.building && CFG.GAUGES[r.gauge].mm === mm).length;
  if (!rails) return 0;
  const mult = h.stations.length ? CFG.LINK.stationBudgetMult : 1;
  return rails * CFG.LINK.trainsPerDayPerRail * mult;
}

/** Load factor (demand/budget) of hex idx for gauge mm, cached per hex+gauge
 *  for this assignment pass. >1 means the link is over capacity. */
function computeLinkLoads(st, demand) {
  const loads = new Map();   // hexIdx -> Map(mm -> load)
  for (const [idx, byGauge] of demand) {
    const m = new Map();
    for (const [mm, slots] of byGauge) {
      const budget = linkBudget(st, idx, mm);
      m.set(mm, budget > 0 ? slots / budget : (slots > 0 ? Infinity : 0));
    }
    loads.set(idx, m);
  }
  return loads;
}

/** Apply link loads: cap each line's capacity by its worst-loaded hex, and
 *  slow down every edge that crosses an over-capacity hex. Mutates line.capacity
 *  and edge.time in place — called once per assignment pass, after
 *  precomputeLineCapacity (needs _tripsPerDay/_nTrains) and before routing. */
function applyLinkCapacity(st, edges) {
  const demand = computeLinkDemand(st);
  const loads = computeLinkLoads(st, demand);
  const L = CFG.LINK;
  const worstLoadOnPath = (line) => {
    let worst = 1;
    for (const idx of line.path) {
      const l = loads.get(idx); if (!l) continue;
      const v = l.get(line.gaugeMm);
      if (v > worst) worst = v;
    }
    return worst;
  };
  for (const line of st.lines) {
    if (!line.alive || !line._nTrains || line.capacity <= 0) continue;
    const worst = worstLoadOnPath(line);
    if (worst > 1 && isFinite(worst)) line.capacity /= worst;
    else if (!isFinite(worst)) line.capacity = 0;   // scheduled over a rail with zero budget (none in service)
  }
  for (const list of edges.values()) {
    for (const e of list) {
      const line = st.lines[e.line];
      if (!line) continue;
      let worst = 1;
      const lo = Math.min(e._ia, e._ib), hi = Math.max(e._ia, e._ib);
      for (let p = lo; p <= hi; p++) {
        const l = loads.get(line.path[p]); if (!l) continue;
        const v = l.get(line.gaugeMm);
        if (v > worst && isFinite(v)) worst = v;
      }
      if (worst > 1) e.time *= Math.pow(worst, L.overCapPenalty);
    }
  }
}

/* ---- O-D assignment ---------------------------------------------------------
 * Production-constrained (singly-constrained) gravity. Each origin's residents
 * make a bounded number of outbound rail trips per day (their *production
 * budget*, ∝ catchment population) which is distributed across reachable
 * destinations in proportion to each destination's pull (attraction ×
 * accessibility × trip-length decay) and then suppressed by logit mode share,
 * affordability and crowding. Because the budget is a per-capita rate, total
 * demand scales *linearly* with population — it can never exceed population ×
 * a small constant, unlike an unconstrained pop×attraction gravity product.
 *
 * Trips are loaded onto the chosen min-cost route. For each line this yields:
 *   line.demand — peak directional link volume (busiest segment, one way/day),
 *                 the crowding-relevant load, matched to per-direction capacity;
 *   line.board  — boardings (riders counted once per line), for ridership/pax;
 *   line.rev / line._coRev — fare revenue, split per segment by track owner.
 * Called when the network changes or every PAX.reassignDays days.
 */
function assignOD(st) {
  computeCatchments(st);
  const edges = buildNetwork(st);                 // sets line._speed, _stops
  const year = st.time.year;
  const era = eraOf(year).key;
  const vot = CFG.PAX.votByEra[era];
  const altModes = CFG.PAX.ALT_MODES[era];
  const inflNow = inflationOf(st, year);      // money leg of the alt modes is nominal
  const adoption = adoptionOf(year) * st.econ.commuteFactor;
  const comfortFare = CFG.PAX.defaultFarePerKm * CFG.PAX.comfortFareMult * inflationOf(st, year);
  const comfortBase = CFG.PAX.comfortCostPerKm * inflationOf(st, year);

  precomputeLineCapacity(st);                      // capacity/headway/load for route-choice crowding
  applyLinkCapacity(st, edges);                     // v0.5.8 F1: per-hex throughput budget caps capacity & slows crossings

  // reset accumulators (line.demand is filled from peak link volume after loading)
  for (const l of st.lines) { l.demand = 0; l.board = 0; l.rev = 0; l._coRev = {}; }
  for (const s of st.stations) { s.board = 0; s._affordSum = 0; s._affordW = 0; }

  const stas = st.stations.filter(s => s.alive && !s.building && edges.has(s.id));
  // kaidō (v0.5): a paved road / highway near a station strengthens the
  // walk/bus/car alternative there — rail loses pricing power along corridors
  for (const s of stas) s._kaidoAlt = kaidoAltMult(st, s.hex);
  for (const A of stas) {
    if (A.pop <= 0) continue;                      // no residents → no outbound trips produced
    // total per-capita production budget, split across rider segments below
    const budgetA = CFG.PAX.tripsPerCapita * A.pop * adoption * st.econ.cycle;

    // Each rider segment routes independently with its own value-of-time and
    // crowd-aversion, so an O-D's demand divides across competing routes: budget
    // riders chase the cheapest path, comfort-seekers pay for a fast, empty
    // express. The two loadings recombine on the same lines/edges below.
    for (const cls of CFG.PAX.classes) {
      const votc = vot * cls.votMult;
      const comfortW = comfortBase * cls.comfortMult;
      const destSpread = Math.max(1, CFG.PAX.destLambda * CFG.PAX.costLambda * votc);
      const budget = budgetA * cls.share;
      const { cost, prevEdge } = routeFrom(st, edges, A.id, votc, comfortW);
      // reachable destinations + their pull (attraction × accessibility × length decay)
      const dests = [];
      let wSum = 0;
      for (const B of stas) {
        if (B.id === A.id || B.att <= 0) continue;
        const gc = cost.get(B.id);
        if (gc === undefined) continue;
        const crow = hexDist(A.hex, B.hex) * CFG.HEX_KM;   // real km (v0.5.8)
        if (crow < 2) continue;
        const w = B.att * Math.exp(-gc / destSpread) * Math.exp(-crow / 25);
        if (w <= 0) continue;
        dests.push({ B, gc, crow, w });
        wSum += w;
      }
      if (!dests.length || wSum <= 0) continue;

      for (const { B, gc, crow, w } of dests) {
        const frac = w / wSum;                                     // share of this segment's budget aimed at B
        // mode share: rail generalized cost vs walking/bus/car alternative
        // cheapest competing mode's generalized cost (v0.5 explicit alt set);
        // road-bound modes ride the kaidō where one is near either endpoint
        const roadMult = Math.min(A._kaidoAlt || 1, B._kaidoAlt || 1);
        let altCost = Infinity;
        for (const m of altModes) {
          const gc = votc * (m.access + crow * m.minPerKm * (m.road ? roadMult : 1)) +
                     crow * m.yenPerKm * inflNow;
          if (gc < altCost) altCost = gc;
        }
        const share = 1 / (1 + Math.exp((gc - altCost) / Math.max(1, CFG.PAX.costLambda * votc)));
        // route fare/distance + worst desirability (crowding frustration) along it.
        // v0.5.7: routeFare is the TRUE door-to-door price — per-km fares (each
        // company's own rate on its own km) PLUS each distinct company's flat
        // service charge, paid once per company the route uses. A multi-operator
        // journey therefore prices higher, exactly like a real through-transfer.
        let routeFare = 0, routeDist = 0, desire = 1, ok = true;
        const coUsed = new Set();
        for (let cur = B.id; cur !== A.id;) {
          const pe = prevEdge.get(cur);
          if (!pe) { ok = false; break; }
          routeFare += pe.edge.fare; routeDist += pe.edge.dist;
          coUsed.add(st.lines[pe.edge.line].co);
          if (pe.edge._hostFare) for (const hid in pe.edge._hostFare) coUsed.add(+hid);
          desire = Math.min(desire, st.lines[pe.edge.line].desirability);
          cur = pe.from;
        }
        if (!ok) continue;
        for (const cid of coUsed) routeFare += (st.companies[cid].serviceCharge || 0);
        // P2 — affordability: ¥/km above the era-comfortable level erodes demand
        const farePerKm = routeDist > 0 ? routeFare / routeDist : 0;
        const over = Math.max(0, farePerKm / comfortFare - 1);
        const afford = 1 / (1 + over / CFG.PAX.affordSpread);
        // trips that actually ride rail — a suppressed slice of the segment's budget
        const trips = budget * frac * share * desire * afford;
        if (trips < 0.05) continue;
        // load route: per-segment directional volume + revenue split by owner;
        // each line the route touches gets one boarding
        const linesUsed = new Set();
        const coOnRoute = new Set();
        let cur = B.id;
        while (cur !== A.id) {
          const pe = prevEdge.get(cur);
          const line = st.lines[pe.edge.line];
          pe.edge._vol += trips;                                   // directional link volume (crowding)
          // operator earns on its own km at the line's fare…
          const ownRev = trips * pe.edge._ownFare * 2;             // round trips
          line._coRev[line.co] = (line._coRev[line.co] || 0) + ownRev;
          line.rev += ownRev;
          coOnRoute.add(line.co);
          // …each host earns on ITS km at its own rate (trackage-rights through-fare)
          if (pe.edge._hostFare) for (const hid in pe.edge._hostFare) {
            const hostRev = trips * pe.edge._hostFare[hid] * 2;
            line._coRev[hid] = (line._coRev[hid] || 0) + hostRev;
            line.rev += hostRev;
            coOnRoute.add(+hid);
          }
          linesUsed.add(line);
          cur = pe.from;
        }
        // each distinct company the journey used collects its flat service charge
        // once (credited on the route's operating line, so the sim revenue pass
        // routes it to that company's books like any other _coRev slice)
        if (coOnRoute.size) {
          const anyLine = [...linesUsed][0];
          for (const cid of coOnRoute) {
            const sc = trips * (st.companies[cid].serviceCharge || 0) * 2;
            if (sc > 0) anyLine._coRev[cid] = (anyLine._coRev[cid] || 0) + sc;
          }
        }
        for (const line of linesUsed) line.board += trips;         // boardings, once per line
        A.board += trips; B.board += trips;
        // P4 input — affordability of the rides this catchment actually makes
        const q = afford * desire;
        A._affordSum += trips * q; A._affordW += trips;
        B._affordSum += trips * q; B._affordW += trips;
      }
    }
  }

  // line.demand = peak directional link volume (busiest segment, one way/day).
  // This is the crowding-relevant load and is unit-matched to line.capacity
  // (per-direction seat-flow past a point), so demand/capacity is a true load
  // factor — no longer inflated by the number of stops on the line.
  for (const list of edges.values()) {
    for (const e of list) {
      const l = st.lines[e.line];
      if (e._vol > l.demand) l.demand = e._vol;
    }
  }

  // served fraction & next-round desirability from peak load vs capacity
  for (const line of st.lines) {
    if (!line.alive || !line.trains.length || line.capacity <= 0) {
      line.served = 0; line.servedFrac = 1; if (line.alive) line.desirability = 1; continue;
    }
    const ratio = line.demand / line.capacity;     // peak directional load factor
    const servedFrac = ratio > 1 ? 1 / ratio : 1;
    line.served = line.board * servedFrac;         // boardings actually carried
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

/* ---- Population --------------------------------------------------------------
 * The total living population of the map: every hex's residents, summed.
 * Grows over time as the engine develops land along busy, affordable lines.
 */
function totalPopulation(st) {
  let pop = 0;
  for (const h of st.hexes) pop += hexPop(h);
  return Math.round(pop);
}

/* ---- Demand field -----------------------------------------------------------
 * For every hex, the latent ridership a station there could draw: residents +
 * commerce within station catchment range, distance-weighted (the same shape
 * the catchment model uses). Drives the player-facing demand heatmap so good
 * corridors can be spotted from turn one, before any track exists. Returned
 * with its max for normalization; callers cache it (it only shifts as land
 * develops). */
function computeDemandField(st) {
  const N = st.hexes.length;
  const field = new Float32Array(N);
  let max = 1;
  const R = CFG.STATION.catchment;
  for (let i = 0; i < N; i++) {
    let d = 0;
    for (const j of hexesWithin(i, R)) {
      const h = st.hexes[j];
      d += (hexPop(h) + hexAtt(h)) / (1 + hexDist(i, j));
    }
    field[i] = d;
    if (d > max) max = d;
  }
  return { field, max };
}

/** Demand field cached on st, recomputed at most once per simulated day. */
function demandFieldCached(st) {
  if (!st._demand || st._demand.day !== st.time.totalDays) {
    const r = computeDemandField(st);
    st._demand = { field: r.field, max: r.max, day: st.time.totalDays };
  }
  return st._demand;
}

/* ---- Daily tick -------------------------------------------------------------- */

/** Each simulated month carries an averaged mix of weekdays and weekends, so
 *  its ridership is the blend of ~5 full weekdays and ~2 lighter weekend days
 *  (CFG.PAX.holidayMult) rather than a separate "holiday" step. */
function monthlyPaxFactor() {
  return (5 + 2 * CFG.PAX.holidayMult) / 7;
}

function dailyTick(st) {
  processBuilds(st);
  processResearch(st);       // advance R&D projects (rd.js)
  if (st.od.dirty || st.time.totalDays - st.od.lastAssign >= CFG.PAX.reassignDays) assignOD(st);

  // each simulated day stands for ~52 calendar days of that day-type
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  const dayMult = monthlyPaxFactor() * st.econ.paxMult;

  // Disaster repairs: damaged track only heals while its owner PAYS the
  // repair crews (¥/km/day, terrain- & inflation-scaled — CFG.DISASTER).
  // A company that can't cover a hex's bill leaves it broken, and the lines
  // across it keep losing capacity (precomputeLineCapacity) — so a major
  // disaster can spiral a cash-poor company toward insolvency instead of
  // quietly healing itself. Spend is folded into the day's operating cost.
  const inflNow = inflationOf(st, st.time.year);
  const repairSpend = new Map();                 // co id -> today's repair bill
  for (const co of st.companies) {
    if (!co.alive) continue;
    let spend = 0;
    for (let i = 0; i < st.hexes.length; i++) {
      const h = st.hexes[i];
      if (!h.track || h.track.co !== co.id || !(h.track.dmg > 0)) continue;
      const dayCost = CFG.DISASTER.repairPerKmDay * CFG.HEX_KM * CFG.TERRAIN[h.terrain].buildMult * inflNow *
                      Math.min(span, h.track.dmg);
      if (co.cash - spend < dayCost) continue;   // can't fund this hex today — it stays broken
      spend += dayCost;
      h.track.dmg = Math.max(0, h.track.dmg - span);
      if (!h.track.dmg) {
        st.od.dirty = true;
        h.track.built = st.time.year;            // rebuilt with today's techniques (seismic era factor)
      }
    }
    if (spend > 0) repairSpend.set(co.id, spend);
  }

  // v0.5.7: aggregate fare revenue by company across ALL lines FIRST, so a
  // trackage-rights host's cut (its own km + its service charge, credited via
  // line._coRev on the operator's line) lands in the host's revToday/revYear
  // stats — not just its cash. Each company's slice takes its own rev multiplier.
  const fareByCo = new Map();
  for (const line of st.lines) {
    if (!line.alive) continue;
    const frac = (line.servedFrac ?? 1) * dayMult;
    for (const cid in line._coRev || {}) {
      const co2 = st.companies[+cid];
      if (!co2 || !co2.alive) continue;
      const r = line._coRev[cid] * frac * span * rndRevMult(co2);
      fareByCo.set(+cid, (fareByCo.get(+cid) || 0) + r);
    }
  }

  for (const co of st.companies) {
    if (!co.alive) continue;
    let fareRev = fareByCo.get(co.id) || 0, pax = 0;
    let loadSum = 0, demSum = 0;                               // overwork (crowding) signal

    for (const line of st.lines) {
      if (!line.alive || line.co !== co.id) continue;
      pax += line.served * dayMult * 2;                       // round-trip journeys (per day)
      if (line.capacity > 0 && line.demand > 0) { loadSum += (line._load || 0) * line.demand; demSum += line.demand; }
    }
    // rent from developed non-rail land (the income from owned LAND, distinct
    // from fares — surfaced separately in the Finance panel). v0.5.5: rent
    // scales with each building's OCCUPANCY and type yield, and every owned
    // building owes a fixed upkeep whether or not tenants fill it — an empty
    // tower in a dead district is a real loss, not idle money.
    let landRev = 0, landCost = 0;
    for (const i of co.land) {
      landRev += parcelRentDay(st, i) * span;
      landCost += parcelUpkeepYear(st, i) * (span / 365);
    }
    // station commerce (ekinaka): footfall-driven income, fixed annual upkeep.
    // The rail+real-estate development R&D lifts commercial yield around stations.
    let commerceRev = 0;
    const comMult = rndCommerceMult(co);
    for (const s of st.stations) {
      if (s.co !== co.id || !s.alive || s.building) continue;
      const footfall = (s.board || 0) * dayMult;              // passengers through here today
      commerceRev += commerceIncomeDay(st, s, footfall) * span * comMult;
    }
    const commerceCost = commerceMaintYear(st, co) * (span / 365);
    // daily operating cost: payroll + permanent-way & rolling-stock upkeep
    // (annual figures cached yearly; charged pro-rata for this sim-day),
    // plus any disaster-repair crews paid today
    const repairCost = repairSpend.get(co.id) || 0;
    // Kangyō-Bank interest accrues monthly — one tick is one month
    const interest = co.debt > 0 ? co.debt * (co.rate || 0) / CFG.DAYS_PER_YEAR : 0;
    const opCost = (co._opCost ? co._opCost.total * (span / 365) : 0) + commerceCost + repairCost + interest + landCost;
    const rev = fareRev + landRev + commerceRev;
    co.cash += rev - opCost;
    co.stats.revToday = rev; co.stats.costToday = opCost;
    co.stats.revYear += rev; co.stats.costYear += opCost;
    // income breakdown (for the Finance panel)
    co.stats.fareRevToday = fareRev; co.stats.landRevToday = landRev; co.stats.commerceRevToday = commerceRev;
    co.stats.landCostToday = landCost;
    co.stats.landCostYear = (co.stats.landCostYear || 0) + landCost;
    co.stats.landRevYear = (co.stats.landRevYear || 0) + landRev;
    co.stats.commerceRevYear = (co.stats.commerceRevYear || 0) + commerceRev;
    co.stats.commerceCostToday = commerceCost;
    co.stats.interestToday = interest;
    co.stats.pax = pax;
    co.stats.paxAvg = co.stats.paxAvg * 0.9 + pax * 0.1;      // running average for victory
    // accumulate the day's average crowding (load-weighted) and tick down strikes
    co._crowdAccum = (co._crowdAccum || 0) + (demSum > 0 ? loadSum / demSum : 0);
    co._crowdDays = (co._crowdDays || 0) + 1;
    if (co._strikeDays > 0) {
      co._strikeDays = Math.max(0, co._strikeDays - span);
      if (co._strikeDays === 0 && co.isPlayer) {
        logEvent(st, "✔ " + co.name + " workers return — the strike is settled.", "event");
        queueSfx(st, "strike_end");
      }
    }
  }

  // per-station passengers passing through on this (most recent) simulated day:
  // boardings + alightings touching the station, scaled by the day's conditions
  for (const s of st.stations) {
    s.paxDay = (s.board || 0) * dayMult;
    // smoothed ridership (yesterday's traffic, since catchments are computed
    // before today's boardings exist) — feeds stationServiceLevel
    s.boardAvg = (s.boardAvg || 0) * 0.9 + (s.board || 0) * 0.1;
  }

  // global demand index drives land prices everywhere
  const totalPax = st.companies.reduce((a, c) => a + (c.alive ? c.stats.pax : 0), 0);
  st.econ.demandIndex = st.econ.demandIndex * 0.93 + 0.07 * Math.log10(1 + totalPax);

  monthlyGrowth(st);   // each tick spans ~7 weeks of development
  updateOccupancy(st); // tenants move in/out of owned buildings (monthly drift)
  st.totalPop = totalPopulation(st);   // map-wide living population (for the topbar)
}

/* ---- Occupancy drift (v0.5.5) -------------------------------------------------
 * Once a month (one sim tick), every company-owned rentable parcel drifts
 * toward its occupancy target (occupancyTarget, world.js): district demand ×
 * transit access × the population/economy trend ÷ nearby competing supply.
 * Parcels bought with sitting tenants and freshly completed developments
 * (opened pre-leased in proportion to district demand) both converge the same
 * way — filling on a demand-paced logistic curve and vacating linearly. A new
 * building beside a busy line fills in months; one in a dead district never
 * does, while its upkeep is owed all the same.
 */
function updateOccupancy(st) {
  const O = CFG.LAND.OCC;
  const dm = demandFieldCached(st);
  for (const co of st.companies) {
    if (!co.alive) continue;
    for (const i of co.land) {
      if (!parcelRentable(st, i)) continue;
      const h = st.hexes[i];
      const T = occupancyTarget(st, i);
      if (h.occ === undefined) { h.occ = T; continue; }
      if (h.occ < T) {
        // demand-paced logistic lease-up: fast in the fat middle, slow at the
        // extremes. Floor-guard first so a building in a revived dead district
        // can climb back off zero.
        h.occ = Math.max(h.occ, O.min);
        const dp = Math.sqrt((dm.field[i] || 0) / dm.max);   // 0..1 district hunger
        const r = O.fillBase * (0.5 + dp);
        h.occ = Math.min(T, h.occ + r * h.occ * (1 - h.occ / T));
      } else {
        // vacancies open linearly — tenants drift out at a steady clip
        h.occ = Math.max(T, h.occ + (T - h.occ) * O.vacateDrift);
      }
    }
  }
}

/* ---- Development growth -------------------------------------------------------
 * The engine (not the player) develops land: hexes near busy stations gain
 * residents/commerce, raising land values and future demand. Crowded,
 * frustrating lines grow slower. Rail hexes never develop (rails only).
 */
function monthlyGrowth(st) {
  const rng = st.growthRng;
  // v0.5.5 population manager: the macro population tide (era demographics,
  // economy, war, disasters, rail accessibility — see updatePopulation,
  // main.js) scales ALL organic development. A booming era builds fast; a
  // war-emptied or shrinking city barely grows at all.
  const pressure = st.econ.popPressure || 1;
  for (const s of st.stations) {
    if (!s.alive || s.building || !s.board) continue;
    // average desirability of lines stopping here
    let desire = 1;
    for (const l of st.lines) {
      if (l.alive && l.co === s.co && l.stops && l.stops[s.id]) desire = Math.min(desire, l.desirability);
    }
    // a built-up ekinaka makes the area itself more attractive to live/work
    // near, on top of the transit service running through it. The rail+real-
    // estate development R&D (Hankyu model) accelerates that catchment growth.
    const commerceBoost = 1 + CFG.GROWTH.commercePerLevel * effectiveCommerce(st, s);
    const devBoost = rndGrowthMult(st.companies[s.co]);
    // P4 — people locate where rail access is good AND affordable/uncrowded:
    // boardings proxy accessibility; affordQ folds in fares & crowding so
    // expensive, packed corridors attract less new housing/commerce
    const power = Math.min(1, s.board / CFG.STATION.busyBoard) * desire * (s.affordQ ?? 1) * commerceBoost * devBoost * pressure;
    if (power <= 0.02) continue;
    for (const i of hexesWithin(s.hex, CFG.STATION.catchment)) {
      const h = st.hexes[i];
      if (h.owner >= 0) continue;   // v0.5.7: company-owned land only changes through deliberate develop/redevelop
      if (h.stations.length || h.kaido) continue;   // station forecourts & the kaidō roadbed never develop
      if (!CFG.TERRAIN[h.terrain].buildable || CFG.TERRAIN[h.terrain].bridge || h.terrain === "mountain") continue;
      // v0.5.8 F7: a district beside the tracks still develops, just a
      // little slower — living next to a working railway, not erased by it.
      const trackDamp = h.track ? CFG.LAND.trackedGrowthMult : 1;
      const p = power * trackDamp * CFG.GROWTH.baseRate / (1 + hexDist(i, s.hex));
      if (rnd(rng) < p) {
        const wasBare = !h.cons || h.cons === "rice";
        if (!h.cons) h.cons = "house";
        else if (h.cons === "rice") h.cons = "house";   // v0.5: roads are the named kaidō now, growth never spawns them
        else if (h.cons === "house" && h.dev >= 3) h.cons = rnd(rng) < 0.6 ? "apartment" : "shop";
        else if (h.dev < 5) h.dev++;
        if (wasBare) h.consYear = st.time.year;          // v0.5.7: vintage clock starts at construction
        h.valueBoost = Math.min(6, (h.valueBoost || 1) * 1.03);
        if (h.owner >= 0) h.value = landPrice(st, i);
        st.renderDirty = true;
        st.od.dirty = true;
      }
    }
  }

  // v0.5.1: the roads themselves seed growth — post-town strips along the
  // kaidō (and the London turnpikes). Hexes BESIDE the road lean commercial
  // (roadside shops and inns), the next ring out leans residential; both are
  // a much weaker pull than a working station (see CFG.GROWTH.KAIDO), grow
  // stronger as the road is paved, and never densify past KAIDO.maxDev on
  // road access alone — rail still builds the real city.
  const KG = CFG.GROWTH.KAIDO;
  if (KG) {
    for (let i = 0; i < st.hexes.length; i++) {
      const road = st.hexes[i].kaido;
      if (!road) continue;
      const mult = KG.stateMult[road.state] || 1;
      for (const j of hexesWithin(i, 2)) {
        const h = st.hexes[j];
        if (h.owner >= 0) continue;   // v0.5.7: company-owned land only changes through deliberate develop/redevelop
        if (h.stations.length || h.kaido) continue;   // station forecourts & the roadbed never develop
        if (!CFG.TERRAIN[h.terrain].buildable || CFG.TERRAIN[h.terrain].bridge || h.terrain === "mountain") continue;
        const d = hexDist(i, j);
        if (d < 1) continue;
        const trackDamp = h.track ? CFG.LAND.trackedGrowthMult : 1;   // v0.5.8 F7
        if (rnd(rng) >= (d === 1 ? KG.adjRate : KG.nearRate) * mult * pressure * trackDamp) continue;
        const wasBare = !h.cons || h.cons === "rice";
        if (d === 1) {                                   // roadside: commerce-leaning
          if (!h.cons || h.cons === "rice") h.cons = rnd(rng) < 0.6 ? "shop" : "house";
          else if (h.cons === "house" && h.dev >= 2) h.cons = "shop";
          else if (h.dev < KG.maxDev) h.dev++;
          else continue;
        } else {                                         // a ring out: residential
          if (!h.cons || h.cons === "rice") h.cons = "house";
          else if (h.dev < KG.maxDev) h.dev++;
          else continue;
        }
        if (wasBare) h.consYear = st.time.year;          // v0.5.7: vintage clock starts at construction
        h.valueBoost = Math.min(6, (h.valueBoost || 1) * 1.02);
        if (h.owner >= 0) h.value = landPrice(st, j);
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
