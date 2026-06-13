/* =========================================================================
 * world.js — Companies, land ownership, A* track route planning with
 * player approval, construction queue (in-game time), stations, lines,
 * trains, trackage-rights negotiation, and company buyouts.
 * No DOM access — pure simulation. All functions take `st` (game state).
 * ========================================================================= */
"use strict";

/* ---- Companies ----------------------------------------------------------- */

function createCompany(st, opts) {
  const co = {
    id: st.companies.length,
    name: opts.name, color: opts.color,
    isPlayer: !!opts.isPlayer,
    founded: opts.founded,
    cash: opts.cash,
    gauge: opts.gauge,                 // default gauge for new construction
    elecDefault: false,                // build electrified track once unlocked
    land: [],                          // owned hex indices (plain array for save-ability)
    rights: [],                        // company ids whose track we may run on
    alive: true,
    stats: {
      pax: 0, paxAvg: 0, revToday: 0, costToday: 0,
      revYear: 0, costYear: 0, history: [],   // yearly {year, cash, pax, profit}
      frustrated: 0,
    },
    ai: opts.isPlayer ? null : { cooldown: 0, focus: null,
      difficulty: CFG.AI.DIFFICULTIES[opts.difficulty] ? opts.difficulty : CFG.AI.DEFAULT_DIFFICULTY },
  };
  st.companies.push(co);
  return co;
}

function companyTrackHexes(st, co) {
  const out = [];
  for (let i = 0; i < st.hexes.length; i++) {
    const t = st.hexes[i].track;
    if (t && t.co === co.id) out.push(i);
  }
  return out;
}

/** Rough enterprise value: cash + land + infrastructure (for buyouts). */
function companyValue(st, co) {
  let v = co.cash;
  for (const i of co.land) v += st.hexes[i].value;
  const infl = inflationOf(st.time.year);
  v += companyTrackHexes(st, co).length * CFG.TRACK.baseCost * 0.6 * infl;
  for (const s of st.stations) if (s.co === co.id && s.alive) v += CFG.STATION.baseCost * s.level * infl;
  for (const t of st.trains) if (t.co === co.id) v += CFG.TRAINS[t.type].cost * 0.5 * infl;
  return v;
}

/* ---- Land ----------------------------------------------------------------- */

/** Current land price of a hex: center proximity × development × rail demand. */
function landPrice(st, idx) {
  const h = st.hexes[idx];
  const d = hexDist(idx, hexIdx(CFG.CENTER.col, CFG.CENTER.row));
  let base = CFG.LAND.baseRural + CFG.LAND.baseCenterBonus * Math.exp(-d / CFG.LAND.centerFalloff);
  if (h.cons) base *= CFG.CONS[h.cons].valueMult * (1 + 0.4 * h.dev);
  if (h.terrain === "mountain") base *= 0.3;
  else if (h.terrain === "swamp") base *= 0.5;
  else if (CFG.TERRAIN[h.terrain].bridge) base *= 0.4;
  base *= 1 + CFG.LAND.demandValueK * st.econ.demandIndex;     // network-wide demand
  base *= st.econ.landBubble;                                  // boom/bubble cycles
  base *= h.valueBoost || 1;                                   // local growth along popular lines
  return Math.round(base * inflationOf(st.time.year));
}

function buyLand(st, co, idx) {
  const h = st.hexes[idx];
  if (h.owner !== -1) return { ok: false, msg: "Already owned." };
  const price = landPrice(st, idx);
  if (co.cash < price) return { ok: false, msg: "Not enough cash (" + fmtYen(price) + ")." };
  co.cash -= price;
  h.owner = co.id;
  h.value = price;
  co.land.push(idx);
  return { ok: true, price };
}

/** Asking price for land held by another company (null = won't sell). */
function landOfferPrice(st, buyer, idx) {
  const h = st.hexes[idx];
  if (h.owner === -1 || h.owner === buyer.id) return null;
  if (h.track || h.stations.length) return null;                // infrastructure: never for sale
  if (st.builds.some(b => b.co === h.owner && b.hexes.includes(idx))) return null;
  return Math.round((h.value || landPrice(st, idx)) * CFG.LAND.resaleMarkup);
}

/** Offer to buy a hex from another company at their asking price. */
function offerBuyLand(st, buyer, idx) {
  const h = st.hexes[idx];
  const price = landOfferPrice(st, buyer, idx);
  if (price === null) return { ok: false, msg: "The owner won't sell this parcel (infrastructure or plans on it)." };
  if (buyer.cash < price) return { ok: false, msg: "They ask " + fmtYen(price) + " — you can't afford it." };
  const seller = st.companies[h.owner];
  buyer.cash -= price;
  seller.cash += price;
  seller.land = seller.land.filter(i => i !== idx);
  h.owner = buyer.id;
  h.value = landPrice(st, idx);
  buyer.land.push(idx);
  return { ok: true, price, seller };
}

/* ---- Track planning (A*) -------------------------------------------------- */

/**
 * Suggest a track route between two hexes. Returns {path, cost, landCost, days}
 * or {err}. The path may cross unowned land (purchase is bundled into the
 * plan), reuses own existing track at near-zero cost, and avoids hexes
 * containing other companies' track or stations.
 */
function planTrack(st, co, fromIdx, toIdx) {
  if (fromIdx === toIdx) return { err: "Pick two different hexes." };
  const year = st.time.year;
  const tunnelsOk = year >= CFG.UNLOCK.tunnels;
  const W = CFG.MAP_W;
  const passable = (i) => {
    const h = st.hexes[i];
    if (h.track && h.track.co !== co.id) return false;          // foreign track blocks
    if (h.stations.length && !h.stations.some(sid => st.stations[sid].co === co.id)) {
      if (!h.track) return false;                                // foreign station hex
    }
    if (h.owner !== -1 && h.owner !== co.id) return false;       // foreign land
    if (h.terrain === "mountain" && !tunnelsOk) return false;
    return true;
  };
  if (!passable(fromIdx) || !passable(toIdx)) return { err: "Endpoint blocked (foreign land/track)." };

  const heap = makeHeap();
  const came = new Map(), gScore = new Map();
  gScore.set(fromIdx, 0);
  heap.push(hexDist(fromIdx, toIdx), fromIdx);
  while (heap.size()) {
    const [, cur] = heap.pop();
    if (cur === toIdx) break;
    const col = cur % W, row = (cur / W) | 0;
    for (let d = 0; d < 6; d++) {
      const nb = hexNeighbor(col, row, d);
      if (nb < 0 || !passable(nb)) continue;
      const h = st.hexes[nb];
      let w = CFG.TERRAIN[h.terrain].moveCost;
      if (h.track && h.track.co === co.id) w = 0.05;             // reuse own track
      const g = gScore.get(cur) + w;
      if (g < (gScore.get(nb) ?? Infinity)) {
        gScore.set(nb, g); came.set(nb, cur);
        heap.push(g + hexDist(nb, toIdx), nb);
      }
    }
  }
  if (!came.has(toIdx)) return { err: "No buildable route found." };
  const path = [toIdx];
  let cur = toIdx;
  while (cur !== fromIdx) { cur = came.get(cur); path.push(cur); }
  path.reverse();
  return Object.assign({ path }, trackPlanCost(st, co, path));
}

/** Cost & duration of building track along a hex path (skips own existing track). */
function trackPlanCost(st, co, path) {
  const year = st.time.year, infl = inflationOf(year);
  const era = eraOf(year).key;
  const elec = co.elecDefault && year >= CFG.UNLOCK.electrification;
  let cost = 0, landCost = 0, days = 0, newHexes = 0;
  for (const i of path) {
    const h = st.hexes[i];
    if (h.track && h.track.co === co.id) continue;               // already ours
    newHexes++;
    const ter = CFG.TERRAIN[h.terrain];
    let c = CFG.TRACK.baseCost * ter.buildMult * infl;
    if (elec) c *= 1 + CFG.TRACK.elecExtra;
    cost += c;
    if (h.owner === -1) landCost += landPrice(st, i);
    let dh = CFG.TRACK.daysPerHexByEra[era];
    if (ter.needsTunnel) dh *= CFG.TRACK.tunnelTimeMult;
    else if (ter.bridge) dh *= CFG.TRACK.bridgeTimeMult;
    days += dh;
  }
  return { cost: Math.round(cost), landCost: Math.round(landCost), days: Math.ceil(days), newHexes, elec };
}

/** Approve a plan: pay up-front, buy land, enqueue construction job. */
function approveTrack(st, co, plan) {
  const total = plan.cost + plan.landCost;
  if (co.cash < total) return { ok: false, msg: "Need " + fmtYen(total) + "." };
  co.cash -= total;
  const buildHexes = [];
  for (const i of plan.path) {
    const h = st.hexes[i];
    if (h.track && h.track.co === co.id) continue;
    if (h.owner === -1) { h.owner = co.id; h.value = landPrice(st, i); co.land.push(i); }
    buildHexes.push(i);
  }
  st.builds.push({
    kind: "track", co: co.id, hexes: buildHexes, done: 0,
    daysPerHex: Math.max(1, plan.days / Math.max(1, buildHexes.length)),
    progress: 0, gauge: co.gauge, elec: plan.elec,
  });
  return { ok: true };
}

/**
 * Player track building: ONE hex at a time, no auto-routing. Returns a quote
 * {cost, landCost, days} with quoteOnly:true, or executes the build (buying
 * the land if needed and enqueueing a 1-hex construction job).
 */
function buildTrackHex(st, co, idx, quoteOnly) {
  const h = st.hexes[idx];
  const year = st.time.year;
  if (h.track) return { ok: false, msg: h.track.co === co.id ? "You already have track here." : "Another company's track is here." };
  if (st.builds.some(b => b.hexes.includes(idx) && b.done === 0)) return { ok: false, msg: "Already under construction." };
  if (h.stations.length && !h.stations.some(sid => st.stations[sid].co === co.id)) return { ok: false, msg: "Another company's station is here." };
  if (h.owner !== -1 && h.owner !== co.id) return { ok: false, msg: "Owned by " + st.companies[h.owner].name + " — buy the parcel first (Inspect)." };
  const ter = CFG.TERRAIN[h.terrain];
  if (ter.needsTunnel && year < CFG.UNLOCK.tunnels) return { ok: false, msg: "Tunneling unlocks in " + CFG.UNLOCK.tunnels + "." };
  const infl = inflationOf(year);
  const elec = co.elecDefault && year >= CFG.UNLOCK.electrification;
  let cost = CFG.TRACK.baseCost * ter.buildMult * infl;
  if (elec) cost *= 1 + CFG.TRACK.elecExtra;
  cost = Math.round(cost);
  const landCost = h.owner === -1 ? landPrice(st, idx) : 0;
  let days = CFG.TRACK.daysPerHexByEra[eraOf(year).key];
  if (ter.needsTunnel) days *= CFG.TRACK.tunnelTimeMult;
  else if (ter.bridge) days *= CFG.TRACK.bridgeTimeMult;
  days = Math.ceil(days);
  if (quoteOnly) return { ok: true, quoteOnly: true, cost, landCost, days, elec };
  if (co.cash < cost + landCost) return { ok: false, msg: "Need " + fmtYen(cost + landCost) + "." };
  co.cash -= cost + landCost;
  if (h.owner === -1) { h.owner = co.id; h.value = landPrice(st, idx); co.land.push(idx); }
  st.builds.push({ kind: "track", co: co.id, hexes: [idx], done: 0, daysPerHex: days, progress: 0, gauge: co.gauge, elec });
  if (co.isPlayer) {
    logEvent(st, "Track construction started on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral + " (~" + days + " days).");
  }
  return { ok: true, cost, landCost, days };
}

/* ---- Stations ------------------------------------------------------------- */

function stationCost(st, idx) {
  return Math.round((CFG.STATION.baseCost + landPrice(st, idx) * 0.5) * 1.0);
}

function canBuildStation(st, co, idx) {
  const h = st.hexes[idx];
  if (h.owner !== co.id) return "You must own the land.";
  if (!h.track || h.track.co !== co.id) return "Needs your track on this hex.";
  if (h.stations.some(sid => st.stations[sid].co === co.id && st.stations[sid].alive)) return "You already have a station here.";
  if (h.stations.some(sid => st.stations[sid].alive) && st.time.year < CFG.UNLOCK.sharedStationHex) {
    return "Shared station hexes unlock in Late Showa (1946).";
  }
  return null;
}

function buildStation(st, co, idx) {
  const why = canBuildStation(st, co, idx);
  if (why) return { ok: false, msg: why };
  const cost = stationCost(st, idx);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  const h = st.hexes[idx];
  const s = {
    id: st.stations.length, co: co.id, hex: idx, level: 1, cars: 3,
    name: h.name || ("Sta #" + h.spiral), builtYear: st.time.year,
    board: 0, alive: true, building: CFG.STATION.buildDays,
    isDepot: false, depotAsStation: false,
  };
  st.stations.push(s);
  h.stations.push(s.id);
  st.od.dirty = true;
  if (co.isPlayer) {
    logEvent(st, "Station construction started on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
      " (~" + CFG.STATION.buildDays + " days).");
  }
  return { ok: true, station: s };
}

/** Expand station level (catchment/major-stop bonus) — pricey once established. */
function upgradeStation(st, co, sid) {
  const s = st.stations[sid];
  if (s.co !== co.id || !s.alive) return { ok: false, msg: "Not yours." };
  if (s.level >= CFG.STATION.maxLevel) return { ok: false, msg: "Already max level." };
  const age = Math.max(0, st.time.year - s.builtYear);
  const cost = Math.round(stationCost(st, s.hex) * CFG.STATION.upgradeCostMult * s.level * (1 + Math.min(1.5, age / 40)));
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost; s.level++; st.od.dirty = true;
  return { ok: true, cost };
}

/** Lengthen platform by 1 car (era-capped). Each station upgrades separately. */
function extendPlatform(st, co, sid) {
  const s = st.stations[sid];
  if (s.co !== co.id || !s.alive) return { ok: false, msg: "Not yours." };
  const cap = maxPlatformCars(st.time.year);
  if (s.cars >= cap) return { ok: false, msg: "Platform tech caps at " + cap + " cars this era." };
  const cost = Math.round(CFG.STATION.platformUpgradeCost * inflationOf(st.time.year) * (1 + s.level * 0.3));
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost; s.cars++; st.od.dirty = true;
  return { ok: true, cost };
}

/* ---- Depots -----------------------------------------------------------------
 * A depot is a rolling-stock yard: trains removed from deleted lines are
 * stored here (never scrapped) and can later be reassigned to a compatible
 * line. A depot may also double as a passenger station, but the yard eats
 * into the catchment so its commerce (pop/attraction draw) is reduced by
 * CFG.DEPOT.commerceMult.
 */

/** Cost to build a depot; `asStation` adds passenger facilities. */
function depotCost(st, idx, asStation) {
  const land = landPrice(st, idx);
  const mult = asStation ? CFG.DEPOT.landMultStation : CFG.DEPOT.landMultDepot;
  return Math.round((CFG.DEPOT.baseCost + land * mult) * inflationOf(st.time.year));
}

/** True if a station-like record (station or depot) should act as a line stop. */
function isLineStop(s) {
  return !!s && s.alive && !s.building && !(s.isDepot && !s.depotAsStation);
}

function buildDepot(st, co, idx, asStation) {
  const why = canBuildStation(st, co, idx);  // same hex eligibility as a station
  if (why) return { ok: false, msg: why };
  const cost = depotCost(st, idx, asStation);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  const h = st.hexes[idx];
  const s = {
    id: st.stations.length, co: co.id, hex: idx, level: 1, cars: 3,
    name: (h.name || ("Sta #" + h.spiral)) + " Depot", builtYear: st.time.year,
    board: 0, alive: true, building: CFG.DEPOT.buildDays,
    isDepot: true, depotAsStation: !!asStation,
  };
  st.stations.push(s);
  h.stations.push(s.id);
  st.od.dirty = true;
  if (co.isPlayer) {
    logEvent(st, (asStation ? "Depot+station" : "Depot") + " construction started on " +
      (h.name ? h.name + " " : "") + "hex #" + h.spiral + " (~" + CFG.DEPOT.buildDays + " days).");
  }
  return { ok: true, station: s };
}

/** Send a stored train to operate a compatible line (gauge & electrification). */
function assignStoredTrain(st, co, trainId, lineId) {
  const tr = st.trains[trainId];
  if (!tr || !tr.alive || !tr.stored || tr.co !== co.id) return { ok: false, msg: "Not a stored train." };
  const line = st.lines[lineId];
  if (!line || !line.alive || line.co !== co.id) return { ok: false, msg: "Bad line." };
  if (!trainTypesFor(st, co, line).includes(tr.type)) return { ok: false, msg: "Incompatible with this line (gauge/electrification)." };
  tr.stored = false; tr.line = lineId; tr.pos = Math.random() * Math.max(1, line.path.length - 1); tr.dir = 1;
  line.trains.push(tr.id);
  refreshTrainCars(st);
  st.od.dirty = true;
  return { ok: true };
}

/** Scrap a stored train for a partial refund at current-era prices. */
function scrapStoredTrain(st, co, trainId) {
  const tr = st.trains[trainId];
  if (!tr || !tr.alive || !tr.stored || tr.co !== co.id) return { ok: false, msg: "Not a stored train." };
  const refund = Math.round(CFG.TRAINS[tr.type].cost * inflationOf(st.time.year) * CFG.DEPOT.scrapRefund);
  tr.alive = false;
  co.cash += refund;
  return { ok: true, refund };
}

/* ---- Lines ----------------------------------------------------------------
 * A line is a path over connected track between two of the company's
 * stations. Track of partner companies (trackage rights) with the same
 * gauge is usable. Multiple services (local/express) can share track.
 */

/** BFS over usable track hexes for this company; returns hex path or null. */
function trackPath(st, co, fromHex, toHex) {
  const ft = st.hexes[fromHex].track;
  if (!ft) return null;
  const wantMm = CFG.GAUGES[ft.gauge].mm;          // a line runs on ONE gauge
  const usable = (i) => {
    const t = st.hexes[i].track;
    if (!t || CFG.GAUGES[t.gauge].mm !== wantMm) return false;
    return t.co === co.id || co.rights.includes(t.co);
  };
  if (!usable(fromHex) || !usable(toHex)) return null;
  const prev = new Map([[fromHex, -1]]);
  const q = [fromHex];
  while (q.length) {
    const cur = q.shift();
    if (cur === toHex) break;
    for (const nb of neighborsOf(cur)) {
      if (!prev.has(nb) && usable(nb)) { prev.set(nb, cur); q.push(nb); }
    }
  }
  if (!prev.has(toHex)) return null;
  const path = [];
  for (let cur = toHex; cur !== -1; cur = prev.get(cur)) path.push(cur);
  return path.reverse();
}

function createLine(st, co, staA, staB, type) {
  const A = st.stations[staA], B = st.stations[staB];
  if (!A || !B || A.co !== co.id || B.co !== co.id) return { ok: false, msg: "Pick two of your stations." };
  const path = trackPath(st, co, A.hex, B.hex);
  if (!path) return { ok: false, msg: "Stations not connected by usable track (check gauge/rights)." };
  // stations along the path (this company's, finished, and willing to stop —
  // depot-only facilities have no passenger platform and are skipped)
  const stationsOnPath = [];
  for (const hx of path) {
    for (const sid of st.hexes[hx].stations) {
      const s = st.stations[sid];
      if (s.co === co.id && isLineStop(s)) stationsOnPath.push(sid);
    }
  }
  if (stationsOnPath.length < 2) return { ok: false, msg: "Line needs 2+ stations." };
  const stops = {};
  stationsOnPath.forEach((sid, k) => {
    const s = st.stations[sid];
    // express defaults: stop at termini and big stations only
    stops[sid] = type === "local" || k === 0 || k === stationsOnPath.length - 1 || s.level >= 2;
  });
  const gaugeMm = CFG.GAUGES[st.hexes[path[0]].track.gauge].mm;
  const elec = path.every(hx => st.hexes[hx].track.elec);
  const line = {
    id: st.lines.length, co: co.id,
    name: co.name.split(" ")[0] + " " + (type === "local" ? "Line" : type) + " " + (st.lines.filter(l => l.co === co.id).length + 1),
    path, stations: stationsOnPath, stops, type,
    fare: +(CFG.PAX.defaultFarePerKm * inflationOf(st.time.year)).toFixed(2),
    gaugeMm, elec, trains: [],
    capacity: 0, demand: 0, served: 0, desirability: 1, alive: true,
  };
  st.lines.push(line);
  st.od.dirty = true;
  return { ok: true, line };
}

/** Delete a line. Its trains are NOT scrapped — they return to the depot
 * (stored) and can be reassigned to another compatible line later. */
function removeLine(st, co, lineId) {
  const l = st.lines[lineId];
  if (!l || l.co !== co.id) return;
  l.alive = false;
  for (const tid of l.trains) {
    const tr = st.trains[tid];
    tr.line = -1; tr.stored = true; tr.pos = 0; tr.dir = 1;
  }
  l.trains = [];
  st.od.dirty = true;
}

/** Train types this company can buy for a given line right now. */
function trainTypesFor(st, co, line) {
  const y = st.time.year, out = [];
  for (const key in CFG.TRAINS) {
    const t = CFG.TRAINS[key];
    if (y < t.from) continue;
    if (t.elec && !line.elec) continue;
    if (t.gauge && CFG.GAUGES[t.gauge].mm !== line.gaugeMm) continue;
    if (!t.gauge && line.gaugeMm === CFG.GAUGES.standard.mm && key !== "shinkansen") continue;
    out.push(key);
  }
  return out;
}

function buyTrain(st, co, lineId, type) {
  const line = st.lines[lineId];
  if (!line || line.co !== co.id || !line.alive) return { ok: false, msg: "Bad line." };
  if (!trainTypesFor(st, co, line).includes(type)) return { ok: false, msg: "Type unavailable for this line." };
  const cost = Math.round(CFG.TRAINS[type].cost * inflationOf(st.time.year));
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  // cars limited by the shortest platform among the line's stop stations
  const cars = Math.min(...line.stations.filter(s => line.stops[s]).map(s => st.stations[s].cars));
  const tr = {
    id: st.trains.length, co: co.id, line: lineId, type, cars,
    pos: Math.random() * line.path.length, dir: 1, alive: true, stored: false,
  };
  st.trains.push(tr);
  line.trains.push(tr.id);
  st.od.dirty = true;
  return { ok: true, train: tr };
}

/** Refresh car counts after platform upgrades. Stored trains (no line) are skipped. */
function refreshTrainCars(st) {
  for (const tr of st.trains) {
    if (!tr.alive || tr.stored || tr.line < 0) continue;
    const line = st.lines[tr.line];
    const stops = line.stations.filter(s => line.stops[s]);
    if (stops.length) tr.cars = Math.min(...stops.map(s => st.stations[s].cars));
  }
}

/* ---- Construction queue (daily tick) -------------------------------------- */

function processBuilds(st) {
  // one simulated day represents ~52 calendar days of construction work
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  for (let b = st.builds.length - 1; b >= 0; b--) {
    const job = st.builds[b];
    job.progress += span;
    while (job.progress >= job.daysPerHex && job.done < job.hexes.length) {
      job.progress -= job.daysPerHex;
      const i = job.hexes[job.done++];
      const h = st.hexes[i];
      const ter = CFG.TERRAIN[h.terrain];
      h.track = { co: job.co, gauge: job.gauge, elec: !!job.elec, tunnel: !!ter.needsTunnel, dmg: 0 };
      h.cons = null; h.dev = 0;        // only rails shown on rail hexes
      st.od.dirty = true;
      if (st.renderDirty !== undefined) st.renderDirty = true;
    }
    if (job.done >= job.hexes.length) {
      st.builds.splice(b, 1);
      const jco = st.companies[job.co];
      if (jco && jco.isPlayer) {
        logEvent(st, "Track construction complete: " + job.hexes.length + " km finished.");
      }
    }
  }
  // station/depot construction countdown (in calendar days)
  for (const s of st.stations) {
    if (s.alive && s.building) {
      s.building = Math.max(0, s.building - span);
      if (!s.building) {
        st.od.dirty = true;
        const sco = st.companies[s.co];
        if (sco && sco.isPlayer) {
          logEvent(st, (s.isDepot ? (s.depotAsStation ? "Depot+station" : "Depot") : "Station") +
            " opened: " + s.name + ".");
        }
      }
    }
  }
}

/* ---- Trackage rights & buyouts -------------------------------------------- */

/** Price the other company asks for running rights (one-time + flavor). */
function rightsAskingPrice(st, asker, owner) {
  const rev = Math.max(owner.stats.revYear, 5000 * inflationOf(st.time.year));
  return Math.round(rev * 0.25 + companyTrackHexes(st, owner).length * 60 * inflationOf(st.time.year));
}

function negotiateRights(st, asker, owner) {
  if (CFG.GAUGES[asker.gauge].mm !== CFG.GAUGES[owner.gauge].mm) {
    return { ok: false, msg: "Incompatible gauges — no deal possible." };
  }
  if (asker.rights.includes(owner.id)) return { ok: false, msg: "Already have rights." };
  const price = rightsAskingPrice(st, asker, owner);
  if (asker.cash < price) return { ok: false, msg: "They ask " + fmtYen(price) + " — you can't afford it." };
  asker.cash -= price; owner.cash += price;
  asker.rights.push(owner.id);
  st.od.dirty = true;
  return { ok: true, price };
}

/** Transfer everything from `target` to `buyer` at 1.2× enterprise value. */
function buyOutCompany(st, buyer, target) {
  const price = Math.round(companyValue(st, target) * 1.2);
  if (buyer.cash < price) return { ok: false, msg: "Need " + fmtYen(price) + "." };
  buyer.cash -= price;
  target.alive = false;
  for (const i of target.land) {
    st.hexes[i].owner = buyer.id;
    buyer.land.push(i);
  }
  target.land = [];
  for (const h of st.hexes) if (h.track && h.track.co === target.id) h.track.co = buyer.id;
  for (const s of st.stations) if (s.co === target.id) s.co = buyer.id;
  for (const l of st.lines) if (l.co === target.id) l.co = buyer.id;
  for (const t of st.trains) if (t.co === target.id) t.co = buyer.id;
  st.od.dirty = true;
  if (st.renderDirty !== undefined) st.renderDirty = true;
  return { ok: true, price };
}
