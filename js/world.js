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
    stationDefaults: { cars: 3 },      // platform length applied to newly built stations
    // company-wide default fare (¥/km) applied to every line that hasn't opted
    // out (line.fareOverride). Until the player sets it explicitly it tracks the
    // era-comfortable rate, so new lines are always sensibly priced.
    defaultFarePerKm: opts.defaultFarePerKm ?? +(CFG.PAX.defaultFarePerKm * inflationOf(opts.founded)).toFixed(3),
    defaultFareSet: !!opts.defaultFareSet,
    land: [],                          // owned hex indices (plain array for save-ability)
    rights: [],                        // company ids whose track we may run on
    alive: true,
    // ---- workforce / HR ----
    wageLevel: opts.wageLevel ?? CFG.HR.wageLevelDefault,   // wage vs. the prevailing rate
    morale: opts.morale ?? CFG.HR.moraleDefault,            // 0..1 employee satisfaction
    reputation: opts.reputation ?? 0.5,                     // 0..1 public/employer standing
    awards: [],                        // one-time milestone keys earned
    stats: {
      pax: 0, paxAvg: 0, revToday: 0, costToday: 0,
      revYear: 0, costYear: 0, history: [],   // yearly {year, cash, pax, profit}
      frustrated: 0, morale: opts.morale ?? CFG.HR.moraleDefault,
    },
    // transient per-year accumulators / derived figures (not serialized)
    _opCost: null, _headcount: 0, _productivity: 1, _buildSpeed: 1,
    _crowdAccum: 0, _crowdDays: 0, _kmYear: 0, _strikeDays: 0,
    ai: opts.isPlayer ? null : { cooldown: 0, focus: null,
      difficulty: CFG.AI.DIFFICULTIES[opts.difficulty] ? opts.difficulty : CFG.AI.DEFAULT_DIFFICULTY },
  };
  st.companies.push(co);
  return co;
}

/** True if a hex is Imperial Household / national land (the Kokyo, its
 *  grounds and moat). Derived from CENTER, so it needs no per-hex flag and
 *  survives save/load. National land can never be bought or built on — lines
 *  must route around the palace, exactly as they do in Tokyo. */
function isNationalLand(idx) {
  return hexDist(idx, hexIdx(CFG.CENTER.col, CFG.CENTER.row)) <= CFG.LAND.palaceRadius;
}

function companyTrackHexes(st, co) {
  const out = [];
  for (let i = 0; i < st.hexes.length; i++) {
    const t = st.hexes[i].track;
    if (t && t.co === co.id) out.push(i);
  }
  return out;
}

/* ---- Track rails (multiple gauges per hex) --------------------------------
 * A hex's `track` carries one or more parallel RAILS, each with its own gauge
 * and electrification (`track.rails = [{gauge, elec, building}]`). Trains never
 * run between rails of different gauge — only alongside each other on the hex.
 * `track.gauge`/`track.elec` mirror the first rail for backward compatibility
 * (rendering, save, the inspector). A rail with `building:true` is under
 * construction (being added or regauged) and carries NO service yet.
 */

/** All rails on a hex's track. Tolerates legacy/hand-built track objects that
 *  have only `gauge`/`elec` and no `rails` array (treated as a single rail). */
function trackRailList(t) {
  if (!t) return [];
  if (t.rails && t.rails.length) return t.rails;
  return [{ gauge: t.gauge, elec: !!t.elec, building: false }];
}
/** Re-sync `track.gauge`/`track.elec` to the first rail (call after any rail
 *  mutation) and guarantee a `rails` array exists. */
function normalizeTrack(t) {
  if (!t) return t;
  if (!t.rails || !t.rails.length) t.rails = trackRailList(t).map(r => ({ gauge: r.gauge, elec: !!r.elec, building: !!r.building }));
  t.gauge = t.rails[0].gauge;
  t.elec = !!t.rails[0].elec;
  return t;
}
/** The in-service rail of a given gauge-mm on this track, or null (skips rails
 *  still under construction). */
function trackRailMm(t, mm) {
  for (const r of trackRailList(t)) if (!r.building && CFG.GAUGES[r.gauge].mm === mm) return r;
  return null;
}
/** True if the track carries an in-service rail of this gauge-mm. */
function trackHasMm(t, mm) { return !!trackRailMm(t, mm); }
/** True if the track has a rail of this gauge KEY in ANY state (incl. building). */
function trackHasGauge(t, gauge) { return trackRailList(t).some(r => r.gauge === gauge); }

/** The hex a station uses to meet a line of gauge-mm: its own hex if that hex
 *  carries an in-service rail of the gauge, otherwise an adjacent hex that
 *  does (so a station accepts trains from any gauge of rail on adjacent
 *  hexes). Returns the hex index, or -1 if no such rail is at or beside it. */
function stationGaugeAnchor(st, s, mm) {
  if (trackHasMm(st.hexes[s.hex].track, mm)) return s.hex;
  for (const nb of neighborsOf(s.hex)) if (trackHasMm(st.hexes[nb].track, mm)) return nb;
  return -1;
}

/** Rough enterprise value: cash + land + infrastructure (for buyouts). */
function companyValue(st, co) {
  let v = co.cash;
  for (const i of co.land) v += st.hexes[i].value;
  const infl = inflationOf(st.time.year);
  v += companyTrackHexes(st, co).length * CFG.TRACK.baseCost * 0.6 * infl;
  for (const s of st.stations) if (s.co === co.id && s.alive) v += CFG.STATION.baseCost * (1 + effectiveCommerce(st, s)) * infl;
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
  if (d === 0) base *= CFG.LAND.palaceMult;                    // the Imperial Palace itself — not really for sale
  else if (d <= CFG.LAND.palaceRadius) base *= CFG.LAND.palaceRingMult;  // palace grounds & moat
  base *= 1 + CFG.LAND.demandValueK * st.econ.demandIndex;     // network-wide demand
  base *= st.econ.landBubble;                                  // boom/bubble cycles
  base *= h.valueBoost || 1;                                   // local growth along popular lines
  base *= CFG.LAND.priceMult;                                  // global purchase-price modifier
  return Math.round(base * inflationOf(st.time.year));
}

function buyLand(st, co, idx) {
  const h = st.hexes[idx];
  if (isNationalLand(idx)) return { ok: false, msg: "Imperial Household grounds — national land, never for sale. Route around the palace." };
  if (h.owner === -2) return { ok: false, msg: (h.holdout || "The owner") + " refuses to sell — not at any price." };
  if (h.owner !== -1) return { ok: false, msg: "Already owned." };
  const price = landPrice(st, idx);
  if (co.cash < price) return { ok: false, msg: "Not enough cash (" + fmtYen(price) + ")." };
  co.cash -= price;
  h.owner = co.id;
  h.value = price;
  co.land.push(idx);
  return { ok: true, price };
}

/** Asking price for land held by another company (null = won't sell).
 *  Unowned (-1) and private holdouts (-2) are not for sale through this path. */
function landOfferPrice(st, buyer, idx) {
  const h = st.hexes[idx];
  if (isNationalLand(idx)) return null;
  if (h.owner < 0 || h.owner === buyer.id) return null;
  if (h.track || h.stations.length) return null;                // infrastructure: never for sale
  if (st.builds.some(b => b.co === h.owner && buildTouchesHex(b, idx))) return null;
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

/** Net proceeds from selling a parcel back to the open market, or null if it
 *  can't be sold (not owned by co, or carries infrastructure). Reflects the
 *  current value of the land AND any improvements on it. */
function landSaleValue(st, co, idx) {
  const h = st.hexes[idx];
  if (h.owner !== co.id) return null;
  if (h.track || h.stations.some(sid => st.stations[sid] && st.stations[sid].alive)) return null;
  return Math.round((h.value || landPrice(st, idx)) * CFG.LAND.sellFrac);
}

/** Sell an owned parcel back to the open market, crediting the proceeds
 *  immediately. The land (with any improvements) becomes unowned and can be
 *  bought again by anyone. Infrastructure must be cleared first. */
function sellLand(st, co, idx) {
  const h = st.hexes[idx];
  if (h.owner !== co.id) return { ok: false, msg: "You don't own this parcel." };
  if (h.track) return { ok: false, msg: "Demolish the track here before selling." };
  if (h.stations.some(sid => st.stations[sid] && st.stations[sid].alive)) return { ok: false, msg: "Remove the station here before selling." };
  const proceeds = Math.round((h.value || landPrice(st, idx)) * CFG.LAND.sellFrac);
  co.cash += proceeds;
  co.land = co.land.filter(i => i !== idx);
  h.owner = -1;
  h.value = landPrice(st, idx);                 // reverts to a market parcel
  st.renderDirty = true;
  if (co.isPlayer) logEvent(st, "Sold " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
    " on the open market for " + fmtYen(proceeds) + ".");
  return { ok: true, proceeds };
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
    if (isNationalLand(i)) return false;                         // palace grounds: never buildable
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
      else if (!co.isPlayer && hasNeighborTrack(st, nb, co.id, cur)) {
        w += CFG.AI.parallelTrackPenalty;   // AI avoids laying new track beside its own lines
      }
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
    // built-up parcels cost & take more (demolition, compensation, city works)
    const urbanCost = 1 + CFG.TRACK.devCostPerLevel * (h.dev || 0);
    const urbanTime = 1 + CFG.TRACK.devTimePerLevel * (h.dev || 0);
    let c = CFG.TRACK.baseCost * ter.buildMult * urbanCost * infl;
    if (elec) c *= 1 + CFG.TRACK.elecExtra;
    cost += c;
    if (h.owner === -1) landCost += landPrice(st, i);
    let dh = CFG.TRACK.daysPerHexByEra[era] * urbanTime;
    if (ter.needsTunnel) dh *= CFG.TRACK.tunnelTimeMult;
    else if (ter.bridge) dh *= CFG.TRACK.bridgeTimeMult;
    days += dh;
  }
  return { cost: Math.round(cost), landCost: Math.round(landCost), days: Math.ceil(days), newHexes, elec };
}

/** True if hex `idx` (excluding `exclude`) has any neighbor carrying
 *  company `coId`'s track. Used to steer AI-planned routes away from
 *  running parallel/adjacent to their own existing lines (see planTrack). */
function hasNeighborTrack(st, idx, coId, exclude) {
  const col = idx % CFG.MAP_W, row = (idx / CFG.MAP_W) | 0;
  for (let d = 0; d < 6; d++) {
    const nb = hexNeighbor(col, row, d);
    if (nb < 0 || nb === exclude) continue;
    const h = st.hexes[nb];
    if (h.track && h.track.co === coId) return true;
  }
  return false;
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
  if (isNationalLand(idx)) return { ok: false, msg: "You can't build on the Imperial Palace grounds — route around them." };
  if (h.track) return { ok: false, msg: h.track.co === co.id ? "You already have track here." : "Another company's track is here." };
  if (hexHasPendingWork(st, idx)) return { ok: false, msg: "Already under construction." };
  if (h.stations.length && !h.stations.some(sid => st.stations[sid].co === co.id)) return { ok: false, msg: "Another company's station is here." };
  if (h.owner === -2) return { ok: false, msg: (h.holdout || "A private landowner") + " owns this hex and won't sell — route around it." };
  if (h.owner !== -1 && h.owner !== co.id) return { ok: false, msg: "Owned by " + st.companies[h.owner].name + " — buy the parcel first (Inspect)." };
  const ter = CFG.TERRAIN[h.terrain];
  if (ter.needsTunnel && year < CFG.UNLOCK.tunnels) return { ok: false, msg: "Tunneling unlocks in " + CFG.UNLOCK.tunnels + "." };
  const infl = inflationOf(year);
  const elec = co.elecDefault && year >= CFG.UNLOCK.electrification;
  // built-up parcels cost & take more (demolition, compensation, city works)
  let cost = CFG.TRACK.baseCost * ter.buildMult * (1 + CFG.TRACK.devCostPerLevel * (h.dev || 0)) * infl;
  if (elec) cost *= 1 + CFG.TRACK.elecExtra;
  cost = Math.round(cost);
  const landCost = h.owner === -1 ? landPrice(st, idx) : 0;
  let days = CFG.TRACK.daysPerHexByEra[eraOf(year).key] * (1 + CFG.TRACK.devTimePerLevel * (h.dev || 0));
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

/* ---- Gauge works (add / change a rail on existing track) -------------------
 * A hex's track can carry more than one gauge of rail. You can ADD a parallel
 * rail of a new gauge (≈ the price of fresh track, but no land to buy — you
 * already own the parcel) or CHANGE an existing rail to another gauge
 * (regauging: cheap materials since the roadbed and land are reused, but slow
 * and labour-heavy, and the rail carries no service until the work is done).
 * Trains never run between rails of different gauge — only alongside.
 */

/** Gauge keys that could be added to / converted on this hex's track right now
 *  (available this era and not already present on the hex). */
function addableGauges(st, idx) {
  const t = st.hexes[idx].track;
  return gaugesAvailable(st.time.year).filter(g => !trackHasGauge(t, g));
}

/** Calendar days for a gauge job on this hex (terrain- & era-scaled). */
function gaugeWorkDays(st, idx, mode) {
  const ter = CFG.TERRAIN[st.hexes[idx].terrain];
  let days = CFG.TRACK.daysPerHexByEra[eraOf(st.time.year).key];
  if (ter.needsTunnel) days *= CFG.TRACK.tunnelTimeMult;
  else if (ter.bridge) days *= CFG.TRACK.bridgeTimeMult;
  days *= mode === "change" ? CFG.TRACK.regaugeTimeMult : CFG.TRACK.addGaugeTimeMult;
  return Math.ceil(days);
}

/** Yen cost of a gauge job on this hex (no land — the parcel is already owned).
 *  Adding a rail ≈ fresh track; regauging is a cheaper fraction (reused roadbed). */
function gaugeWorkCost(st, co, idx, mode, elec) {
  const ter = CFG.TERRAIN[st.hexes[idx].terrain];
  let cost = CFG.TRACK.baseCost * ter.buildMult * inflationOf(st.time.year);
  if (elec) cost *= 1 + CFG.TRACK.elecExtra;
  if (mode === "change") cost *= CFG.TRACK.regaugeCostMult;
  return Math.round(cost);
}

/** Add a parallel rail of `gauge` to track you own on idx. Trains can't cross
 *  between the rails, but lines of each gauge can run alongside on the hex.
 *  Returns a {quoteOnly} estimate or enqueues the works. */
function addGauge(st, co, idx, gauge, quoteOnly) {
  const h = st.hexes[idx];
  if (!h.track || h.track.co !== co.id) return { ok: false, msg: "You need your own track here first." };
  if (!CFG.GAUGES[gauge]) return { ok: false, msg: "Unknown gauge." };
  if (!gaugesAvailable(st.time.year).includes(gauge)) return { ok: false, msg: CFG.GAUGES[gauge].name + " isn't available until " + CFG.UNLOCK.stdGauge + "." };
  if (trackHasGauge(h.track, gauge)) return { ok: false, msg: "This hex already has " + CFG.GAUGES[gauge].name + " rail." };
  if (hexHasPendingWork(st, idx)) return { ok: false, msg: "This hex already has works under way." };
  const elec = co.elecDefault && st.time.year >= CFG.UNLOCK.electrification;
  const cost = gaugeWorkCost(st, co, idx, "add", elec);
  const days = gaugeWorkDays(st, idx, "add");
  if (quoteOnly) return { ok: true, quoteOnly: true, cost, days, elec };
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  st.builds.push({ kind: "gauge", co: co.id, hex: idx, mode: "add", gauge, fromGauge: null,
    elec, total: Math.max(1, days), progress: 0 });
  if (co.isPlayer) logEvent(st, "Adding " + CFG.GAUGES[gauge].name + " rail alongside hex #" + h.spiral + " (~" + days + " days).");
  return { ok: true, cost, days };
}

/** Convert an existing in-service rail (fromGauge) on idx to toGauge. The rail
 *  goes out of service immediately (it's being torn up and realigned) — any
 *  lines running on that gauge through this hex are removed — and comes back at
 *  the new gauge when the works finish. Returns a {quoteOnly} estimate or
 *  enqueues the works. */
function changeGauge(st, co, idx, fromGauge, toGauge, quoteOnly) {
  const h = st.hexes[idx];
  if (!h.track || h.track.co !== co.id) return { ok: false, msg: "You need your own track here first." };
  if (!CFG.GAUGES[fromGauge] || !CFG.GAUGES[toGauge]) return { ok: false, msg: "Unknown gauge." };
  if (fromGauge === toGauge) return { ok: false, msg: "That rail is already this gauge." };
  if (!gaugesAvailable(st.time.year).includes(toGauge)) return { ok: false, msg: CFG.GAUGES[toGauge].name + " isn't available until " + CFG.UNLOCK.stdGauge + "." };
  if (trackHasGauge(h.track, toGauge)) return { ok: false, msg: "This hex already has " + CFG.GAUGES[toGauge].name + " rail." };
  const rail = trackRailList(h.track).find(r => r.gauge === fromGauge && !r.building);
  if (!rail) return { ok: false, msg: "No running " + CFG.GAUGES[fromGauge].name + " rail to convert here." };
  if (hexHasPendingWork(st, idx)) return { ok: false, msg: "This hex already has works under way." };
  const cost = gaugeWorkCost(st, co, idx, "change", rail.elec);
  const days = gaugeWorkDays(st, idx, "change");
  if (quoteOnly) return { ok: true, quoteOnly: true, cost, days };
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  // the rail stops carrying service at once — tear up lines that used this gauge here
  normalizeTrack(h.track);
  const railNow = h.track.rails.find(r => r.gauge === fromGauge && !r.building);
  if (railNow) railNow.building = true;
  normalizeTrack(h.track);
  let removed = 0;
  for (const l of linesUsingHexGauge(st, idx, CFG.GAUGES[fromGauge].mm)) { removeLine(st, st.companies[l.co], l.id); removed++; }
  st.builds.push({ kind: "gauge", co: co.id, hex: idx, mode: "change", gauge: toGauge, fromGauge,
    elec: rail.elec, total: Math.max(1, days), progress: 0 });
  st.od.dirty = true; st.renderDirty = true;
  if (co.isPlayer) logEvent(st, "Regauging hex #" + h.spiral + ": " + CFG.GAUGES[fromGauge].name + " → " +
    CFG.GAUGES[toGauge].name + " (~" + days + " days, no service until done" +
    (removed ? ", " + removed + " line(s) removed" : "") + ").");
  return { ok: true, cost, days, removedLines: removed };
}

/** Apply a finished gauge job: an added rail comes into service; a converted
 *  rail switches to its new gauge and resumes service. */
function finishGaugeWork(st, job) {
  const h = st.hexes[job.hex];
  const co = st.companies[job.co];
  if (!h.track) return;                              // track was demolished meanwhile
  normalizeTrack(h.track);
  if (job.mode === "add") {
    if (!trackHasGauge(h.track, job.gauge))
      h.track.rails.push({ gauge: job.gauge, elec: !!job.elec, building: false });
  } else {                                           // change: flip the out-of-service rail to its new gauge
    const rail = h.track.rails.find(r => r.gauge === job.fromGauge && r.building) ||
                 h.track.rails.find(r => r.building);
    if (rail) { rail.gauge = job.gauge; rail.elec = !!job.elec; rail.building = false; }
  }
  normalizeTrack(h.track);
  st.od.dirty = true; st.renderDirty = true;
  if (co && co.isPlayer) {
    logEvent(st, (job.mode === "add" ? "New " + CFG.GAUGES[job.gauge].name + " rail in service on hex #"
      : "Regauging complete on hex #") + h.spiral + (job.mode === "add" ? "." :
      " — now " + CFG.GAUGES[job.gauge].name + "."), "event");
  }
}

/* ---- Stations ------------------------------------------------------------- */

function stationCost(st, idx) {
  return Math.round((CFG.STATION.baseCost + landPrice(st, idx) * 0.5) * 1.0);
}

/** Calendar days to build a new station in the current era. */
function stationBuildDays(st) {
  return CFG.STATION.buildDaysByEra[eraOf(st.time.year).key];
}

function canBuildStation(st, co, idx) {
  const h = st.hexes[idx];
  if (h.owner !== co.id) return "You must own the land.";
  if (!h.track || h.track.co !== co.id) return "Needs your track on this hex.";
  if (h.stations.some(sid => st.stations[sid].co === co.id && st.stations[sid].alive)) return "You already have a station here.";
  if (h.stations.some(sid => st.stations[sid].alive) && st.time.year < CFG.UNLOCK.sharedStationHex) {
    return "Shared station hexes unlock in Late Showa (1946).";
  }
  if (hexHasPendingWork(st, idx)) return "This hex is being demolished — wait for it to clear.";
  return null;
}

/** Extra one-time cost of building a new station pre-configured to this
 *  company's stationDefaults instead of the baseline 3-car station. Mirrors
 *  the per-step pricing of extendPlatform, so building "pre-extended" never
 *  undercuts extending after the fact. Shorter defaults can lower the price
 *  but never below a quarter of the base cost. */
function stationDefaultsExtra(st, co, baseCost) {
  const cars = co.stationDefaults.cars;
  const perCar = Math.round(CFG.STATION.platformUpgradeCost * inflationOf(st.time.year));
  const extra = (cars - 3) * perCar;
  return Math.max(extra, Math.round(baseCost * 0.25) - baseCost);
}

/** Total cost to build a new station on idx, including this company's
 *  configured station defaults (platform level / length). */
function stationBuildCost(st, co, idx) {
  const base = stationCost(st, idx);
  return base + stationDefaultsExtra(st, co, base);
}

function buildStation(st, co, idx) {
  const why = canBuildStation(st, co, idx);
  if (why) return { ok: false, msg: why };
  const cost = stationBuildCost(st, co, idx);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  const h = st.hexes[idx];
  const s = {
    id: st.stations.length, co: co.id, hex: idx,
    cars: co.stationDefaults.cars,
    name: h.name || ("Sta #" + h.spiral), builtYear: st.time.year,
    board: 0, boardAvg: 0, alive: true, building: stationBuildDays(st),
    isDepot: false, depotAsStation: false,
    commerce: 0, commerceBuilding: 0, commercePending: 0,
    platBuilding: 0, platPending: 0,
  };
  st.stations.push(s);
  h.stations.push(s.id);
  st.od.dirty = true;
  if (co.isPlayer) {
    logEvent(st, "Station construction started on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
      " (~" + stationBuildDays(st) + " days).");
  }
  return { ok: true, station: s, cost };
}

/** Cost to lengthen a single station's platform toward targetCars
 *  (era-capped), summing each +1 step's price (same formula as extendPlatform). */
function stationPlatformUpgradeCost(st, s, targetCars) {
  const cap = maxPlatformCars(st.time.year);
  const target = clamp(targetCars, 1, cap);
  const perCar = Math.round(CFG.STATION.platformUpgradeCost * inflationOf(st.time.year) * (1 + effectiveCommerce(st, s) * 0.3));
  return Math.max(0, target - s.cars) * perCar;
}

/** Calendar days to lengthen a platform from `fromCars` to `toCars`. */
function platformUpgradeDays(fromCars, toCars) {
  return CFG.STATION.platformDaysPerCar * Math.max(0, toCars - fromCars);
}
/** Cars a station's platform will reach once any pending extension completes. */
function effectiveStationCars(s) { return s.platPending || s.cars; }

/** Lengthen platform by 1 car (era-capped). The work takes time; the station
 *  keeps running and its trains lengthen when it completes. */
function extendPlatform(st, co, sid) {
  const s = st.stations[sid];
  if (s.co !== co.id || !s.alive) return { ok: false, msg: "Not yours." };
  if (s.platBuilding > 0) return { ok: false, msg: "A platform extension is already under way here." };
  const cap = maxPlatformCars(st.time.year);
  const target = s.cars + 1;
  if (target > cap) return { ok: false, msg: "Platform tech caps at " + cap + " cars this era." };
  const cost = stationPlatformUpgradeCost(st, s, target);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  s.platPending = target;
  s.platBuilding = platformUpgradeDays(s.cars, target);
  if (co.isPlayer) logEvent(st, "Platform extension started at " + s.name +
    " → " + target + "-car (~" + Math.ceil(s.platBuilding) + " days).");
  return { ok: true, cost, days: s.platBuilding };
}

/** Start a platform extension to targetCars (era-capped) on every eligible
 *  station (excluding any already extending), charging the combined cost in one
 *  go. All-or-nothing. Each station keeps running until its work completes. */
function bulkExtendPlatforms(st, co, targetCars) {
  const cap = maxPlatformCars(st.time.year);
  const target = clamp(targetCars, 1, cap);
  const eligible = st.stations.filter(s => s.co === co.id && isLineStop(s) && s.platBuilding <= 0 && s.cars < target);
  if (!eligible.length) return { ok: false, msg: "No stations under " + target + " cars.", count: 0, cost: 0 };
  const cost = eligible.reduce((sum, s) => sum + stationPlatformUpgradeCost(st, s, target), 0);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + ".", count: eligible.length, cost };
  co.cash -= cost;
  for (const s of eligible) { s.platPending = target; s.platBuilding = platformUpgradeDays(s.cars, target); }
  if (co.isPlayer) logEvent(st, "Platform extension to " + target + "-car started at " + eligible.length +
    " station" + (eligible.length === 1 ? "" : "s") + ".");
  return { ok: true, count: eligible.length, cost };
}

/* ---- Station commerce (ekinaka) -------------------------------------------
 * A station can be developed into a business in its own right: vending (auto
 * from 1876), then paid tiers of shops → retail concourse → shopping mall →
 * integrated station city. Income scales with footfall and the economic cycle;
 * maintenance is a fixed annual lump that climbs steeply with level, so high
 * tiers are a gamble that only pays off on busy hubs.
 */

/** Whether this station-like record can host paying commerce at all (open,
 *  passenger-serving — pure rolling-stock depots have no concourse). */
function commerceEligible(s) {
  return !!s && s.alive && !s.building && !(s.isDepot && !s.depotAsStation);
}

/** The commerce tier currently EARNING at a station: the highest of its built
 *  level and the automatic vending tier (once vending exists). 0 for a hex with
 *  no passenger commerce. A tier still under construction doesn't earn yet. */
function effectiveCommerce(st, s) {
  if (!commerceEligible(s)) return 0;
  let lvl = s.commerce || 0;
  if (st.time.year >= CFG.COMMERCE.vendingYear && lvl < 1) lvl = 1;   // vending is automatic
  return lvl;
}

/** A station's overall service quality — the single continuous score that
 *  replaces the old build-a-level system. It blends how much commerce has
 *  been developed here (investment: 0..5 tiers) with how busy the station
 *  actually is (yesterday's smoothed boardings), so a major hub's bigger
 *  catchment and express-stop priority come from real ridership as much as
 *  from money spent: a packed but undeveloped stop and a quiet shopping
 *  mall each get partway there, but the best service needs both. Every
 *  operating station has a baseline of 1; commerce tier contributes up to
 *  +2, ridership up to +1. */
function stationServiceLevel(st, s) {
  if (!s.alive || s.building) return 0;
  const commerceComponent = (effectiveCommerce(st, s) / 5) * 2;
  const ridershipComponent = clamp((s.boardAvg || 0) / CFG.STATION.busyBoard, 0, 1);
  return 1 + commerceComponent + ridershipComponent;
}

/** The next commerce tier a player could build here, or 0 if maxed/ineligible. */
function nextCommerceLevel(s) {
  const cur = Math.max(1, (s.commerce || 0));   // vending (1) is the floor you upgrade from
  return cur + 1 <= CFG.COMMERCE.levels.length - 1 ? cur + 1 : 0;
}

/** Itemized cost to build commerce `level` at station s (build price + a share
 *  of the hex's land value, both inflation-indexed). */
function commerceBuildCost(st, s, level) {
  const spec = commerceSpec(level);
  if (!spec) return 0;
  const infl = inflationOf(st.time.year);
  const land = st.hexes[s.hex].value || landPrice(st, s.hex);
  return Math.round(spec.buildCost * infl + land * spec.landShare);
}

/** Why commerce `level` can't be built at s right now, or null if it can. */
function canBuildCommerce(st, co, s, level) {
  if (!s || s.co !== co.id || !s.alive) return "Not your station.";
  if (!commerceEligible(s)) return "This facility has no passenger concourse.";
  if (s.commerceBuilding > 0) return "Commerce works already under construction here.";
  const spec = commerceSpec(level);
  if (!spec) return "No such commerce tier.";
  if (level <= (s.commerce || 0)) return "Already developed to this tier.";
  if (level !== Math.max(1, s.commerce || 0) + 1) return "Develop one tier at a time.";
  if (st.time.year < spec.from) return spec.name + " becomes possible in " + spec.from + ".";
  return null;
}

/** Begin constructing the next commerce tier at station s. Pays up front and
 *  starts a (long) construction countdown; income/maint switch over on
 *  completion in processBuilds(). */
function buildCommerce(st, co, s) {
  const level = nextCommerceLevel(s);
  const why = canBuildCommerce(st, co, s, level);
  if (why) return { ok: false, msg: why };
  const cost = commerceBuildCost(st, s, level);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  const spec = commerceSpec(level);
  co.cash -= cost;
  s.commercePending = level;
  s.commerceBuilding = spec.buildDays;
  st.od.dirty = true;
  if (co.isPlayer) {
    logEvent(st, "Commerce works started at " + s.name + ": " + spec.name +
      " (~" + spec.buildDays + " days, " + fmtYen(cost) + ").");
  }
  return { ok: true, cost, level };
}

/** Develop the next commerce tier at every eligible station (this company's,
 *  excluding pure depots and any already building) that has one available
 *  this era, charging the combined cost in one go. All-or-nothing: if the
 *  company can't afford the full bill, nothing starts. Each station keeps
 *  running, and — unlike platform extensions — each only ever advances ONE
 *  tier per call, since commerce must be developed one step at a time. */
function bulkBuildCommerce(st, co) {
  const eligible = st.stations.filter(s => s.co === co.id && commerceEligible(s) && s.commerceBuilding <= 0 &&
    nextCommerceLevel(s) && !canBuildCommerce(st, co, s, nextCommerceLevel(s)));
  if (!eligible.length) return { ok: false, msg: "No stations have a commerce tier ready to develop.", count: 0, cost: 0 };
  const cost = eligible.reduce((sum, s) => sum + commerceBuildCost(st, s, nextCommerceLevel(s)), 0);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + ".", count: eligible.length, cost };
  co.cash -= cost;
  for (const s of eligible) {
    const level = nextCommerceLevel(s);
    const spec = commerceSpec(level);
    s.commercePending = level;
    s.commerceBuilding = spec.buildDays;
  }
  st.od.dirty = true;
  if (co.isPlayer) logEvent(st, "Commerce works started at " + eligible.length +
    " station" + (eligible.length === 1 ? "" : "s") + ".");
  return { ok: true, count: eligible.length, cost };
}

/** Per-CALENDAR-DAY commerce income at a station (footfall × per-pax spend ×
 *  era price level × demand cycle). 0 if nothing earns here. The fixed
 *  maintenance (commerceMaintYear) is owed whether or not this is positive. */
function commerceIncomeDay(st, s, footfall) {
  const lvl = effectiveCommerce(st, s);
  const spec = commerceSpec(lvl);
  if (!spec) return 0;
  const infl = inflationOf(st.time.year);
  // demand swing: booms lift discretionary spend, slumps cut it
  const cycle = 1 + CFG.COMMERCE.demandSwing * ((st.econ.cycle || 1) - 1);
  return Math.max(0, footfall) * spec.incomePerPax * infl * Math.max(0.2, cycle);
}

/** Annual commerce maintenance for one company (fixed, demand-independent).
 *  A tier under construction still owes the upkeep of its already-built tier. */
function commerceMaintYear(st, co) {
  const infl = inflationOf(st.time.year);
  let c = 0;
  for (const s of st.stations) {
    if (s.co !== co.id) continue;
    const lvl = effectiveCommerce(st, s);
    const spec = commerceSpec(lvl);
    if (spec) c += spec.maintYear;
  }
  return Math.round(c * infl);
}

/** Estimated ANNUAL station-commerce income at a station's current footfall
 *  (the per-calendar-day rate scaled to a full year). 0 if it earns nothing. */
function stationCommerceIncomeYear(st, s) {
  if (!commerceEligible(s)) return 0;
  const footfall = s.paxDay || 0;                          // passengers/day through here (latest sim-day)
  return Math.round(commerceIncomeDay(st, s, footfall) * CFG.DAYS_PER_YEAR * CFG.CAL_DAYS_PER_SIM_DAY);
}

/** Annual upkeep owed for one station: the year-end building levy (flat,
 *  depot or station rate) plus any station-commerce maintenance (which
 *  already climbs steeply with tier). Mirrors the charges in onNewYear
 *  (year-end levy) and the daily commerce upkeep. */
function stationUpkeepYear(st, s) {
  const infl = inflationOf(st.time.year);
  const building = (s.isDepot ? CFG.DEPOT.yearlyMaint : CFG.STATION.yearlyMaint) * infl;
  const spec = commerceSpec(effectiveCommerce(st, s));
  const commerce = spec ? spec.maintYear * infl : 0;
  return Math.round(building + commerce);
}

/** Peak load factor (busiest directional segment ÷ per-direction capacity)
 *  across the alive lines that serve a station — the crowding "demand" the
 *  station's services are running at right now. 0 if nothing serves it. */
function stationPeakLoad(st, sid) {
  let load = 0;
  for (const l of st.lines) {
    if (!l.alive || !l.stations || !l.stations.includes(sid) || l.capacity <= 0) continue;
    load = Math.max(load, l.demand / l.capacity);
  }
  return load;
}

/** Cost & km-count to retrofit every non-electrified hex of this company's
 *  track with catenary. Per-km cost mirrors the +50% premium of building
 *  electrified in the first place, scaled by terrain build multiplier and
 *  current-era inflation. */
function electrifyTrackCost(st, co) {
  const infl = inflationOf(st.time.year);
  let cost = 0, count = 0;
  for (let i = 0; i < st.hexes.length; i++) {
    const t = st.hexes[i].track;
    if (!t || t.co !== co.id) continue;
    // every non-electrified rail on the hex needs its own catenary (count km of rail)
    for (const rail of trackRailList(t)) {
      if (rail.elec) continue;
      cost += CFG.TRACK.baseCost * CFG.TRACK.elecExtra * CFG.TERRAIN[st.hexes[i].terrain].buildMult;
      count++;
    }
  }
  return { cost: Math.round(cost * infl), count };
}

/** Electrify ALL of this company's existing track in one go. Lines that become
 *  fully electrified gain access to EMU/express stock; future track is built
 *  electrified by default. All-or-nothing on cost. */
function bulkElectrifyTrack(st, co) {
  if (st.time.year < CFG.UNLOCK.electrification)
    return { ok: false, msg: "Electrification unlocks in " + CFG.UNLOCK.electrification + ".", count: 0, cost: 0 };
  const q = electrifyTrackCost(st, co);
  if (!q.count) return { ok: false, msg: "All your track is already electrified.", count: 0, cost: 0 };
  if (co.cash < q.cost) return { ok: false, msg: "Need " + fmtYen(q.cost) + " to electrify all track.", count: q.count, cost: q.cost };
  co.cash -= q.cost;
  for (let i = 0; i < st.hexes.length; i++) {
    const t = st.hexes[i].track;
    if (!t || t.co !== co.id) continue;
    normalizeTrack(t);                       // ensure a real rails array to mutate
    for (const rail of t.rails) rail.elec = true;
    normalizeTrack(t);
  }
  // lines whose whole path is now electrified (on their gauge) qualify as electrified
  for (const l of st.lines) {
    if (l.alive && l.co === co.id) l.elec = pathElec(st, l.path, l.gaugeMm);
  }
  co.elecDefault = true;              // keep building electrified from here on
  st.od.dirty = true; st.renderDirty = true;
  return { ok: true, count: q.count, cost: q.cost };
}

/* ---- Redevelopment ----------------------------------------------------------
 * Tear up your own track and turn the parcel into rent-earning property
 * (shopping center, housing complex, …). The land stays yours and the new
 * development feeds the existing developed-land rent loop. Any of the
 * company's own lines that run over the hex are removed (their trains go to
 * storage), so the player is warned before confirming.
 */

/** Alive lines whose path crosses a given hex. */
function linesUsingHex(st, idx) {
  return st.lines.filter(l => l.alive && l.path.includes(idx));
}
/** Alive lines of a particular gauge-mm whose path crosses a given hex (so
 *  removing one gauge's rail only breaks that gauge's lines). */
function linesUsingHexGauge(st, idx, mm) {
  return st.lines.filter(l => l.alive && l.gaugeMm === mm && l.path.includes(idx));
}

/** True if a build/demolish job touches hex idx (track jobs list hexes; the
 *  demolish/gauge/station-demolition jobs each carry a single hex). */
function buildTouchesHex(b, idx) {
  if (b.kind === "demolish" || b.kind === "gauge" || b.kind === "stationdemo") return b.hex === idx;
  return !!(b.hexes && b.hexes.includes(idx));
}
/** True if any construction or demolition job is already pending on hex idx. */
function hexHasPendingWork(st, idx) {
  return st.builds.some(b => buildTouchesHex(b, idx));
}

/** Why this hex's track can't be redeveloped into property by co (rails must be
 *  fully cleared and the parcel emptied), or null if it can. */
function canRedevelop(st, co, idx) {
  const h = st.hexes[idx];
  if (!h.track || h.track.co !== co.id) return "Demolish works only on your own track.";
  if (h.owner !== co.id) return "You must own this parcel.";
  if (h.stations.some(sid => st.stations[sid] && st.stations[sid].alive)) return "Remove the station on this hex first.";
  if (hexHasPendingWork(st, idx)) return "This hex is still under construction.";
  return null;
}

/** Why this hex's track (or one gauge of it) can't simply be torn up by co, or
 *  null if it can. Unlike redevelopment, a bare track demolition is allowed even
 *  when a station sits on the hex (the station stays; only the rail goes). */
function canDemolishTrack(st, co, idx, gauge) {
  const h = st.hexes[idx];
  if (!h.track || h.track.co !== co.id) return "Demolish works only on your own track.";
  if (gauge && !trackHasGauge(h.track, gauge)) return "No " + (CFG.GAUGES[gauge] ? CFG.GAUGES[gauge].name : gauge) + " rail here.";
  if (hexHasPendingWork(st, idx)) return "This hex is still under construction.";
  return null;
}

/** Why a building can't be (de)constructed on owned, track-free hex idx, or null.
 *  This is the parcel-development path (no rails involved): you may clear an
 *  existing building or raise a new one on land you own. */
function canDevelopParcel(st, co, idx) {
  const h = st.hexes[idx];
  if (isNationalLand(idx)) return "Imperial Household grounds — national land.";
  if (h.owner !== co.id) return "You must own this parcel.";
  if (h.track) return "There's track here — use Demolish to clear it.";
  if (h.stations.some(sid => st.stations[sid] && st.stations[sid].alive)) return "There's a station on this hex.";
  if (h.cons === "rice") return "Farmland isn't yours to clear — buy and develop open land instead.";
  if (hexHasPendingWork(st, idx)) return "This hex is still under construction.";
  return null;
}

/** Calendar days to clear hex idx (×terrain), plus the build time of consType. */
function redevelopDays(st, idx, consType, demolishNeeded) {
  const ter = CFG.TERRAIN[st.hexes[idx].terrain];
  let days = demolishNeeded ? CFG.DEVELOP.demolishDays * ter.buildMult : 0;
  const spec = consType ? CFG.DEVELOP.builds[consType] : null;
  if (spec) days += spec.days;
  return Math.ceil(days);
}

/** Itemized cost to demolish on idx and (optionally) build consType.
 *  `demolishNeeded` adds the teardown charge (track or an existing building). */
function redevelopCost(st, co, idx, consType, demolishNeeded) {
  if (demolishNeeded === undefined) demolishNeeded = true;
  const h = st.hexes[idx];
  const infl = inflationOf(st.time.year);
  const demolish = demolishNeeded ? Math.round(CFG.DEVELOP.demolishCost * CFG.TERRAIN[h.terrain].buildMult * infl) : 0;
  const spec = consType ? CFG.DEVELOP.builds[consType] : null;
  const land = h.value || landPrice(st, idx);
  const build = spec ? Math.round(spec.cost * infl + land * CFG.DEVELOP.landShare) : 0;
  return { demolish, build, total: demolish + build };
}

/** Estimated yearly rent a developed parcel of this value & dev level earns
 *  (matches the daily developed-land rent loop, summed over a sim year). */
function estimatedRentYear(st, value, dev) {
  return Math.round(value * CFG.LAND.rentPerDay * CFG.CAL_DAYS_PER_SIM_DAY * CFG.DAYS_PER_YEAR * (0.5 + 0.25 * dev));
}

/** Enqueue a timed demolition/redevelopment job. The track and/or building on
 *  the hex stays in place and operating until the teardown completes, at which
 *  point finishDemolish() clears it and applies any new development. */
function enqueueDemolish(st, co, idx, develop, hadTrack, days, gauge) {
  st.builds.push({ kind: "demolish", co: co.id, hex: idx, develop: develop || null,
    hadTrack: !!hadTrack, gauge: gauge || null, total: Math.max(1, days), progress: 0 });
}

/** Apply a finished demolition job: remove track (and any lines using it) and/or
 *  the existing building, then raise the new development if one was ordered. A
 *  job carrying a `gauge` removes only that one rail (leaving any other gauges
 *  on the hex in service); otherwise the whole permanent way is torn up. */
function finishDemolish(st, job) {
  const h = st.hexes[job.hex];
  const co = st.companies[job.co];
  let removedLines = 0;
  if (job.hadTrack && h.track) {
    if (job.gauge && !job.develop && CFG.GAUGES[job.gauge]) {
      const mm = CFG.GAUGES[job.gauge].mm;
      const affected = linesUsingHexGauge(st, job.hex, mm);   // only this gauge's lines break
      removedLines = affected.length;
      for (const l of affected) removeLine(st, st.companies[l.co], l.id);
      normalizeTrack(h.track);
      h.track.rails = h.track.rails.filter(r => r.gauge !== job.gauge);
      if (!h.track.rails.length) h.track = null;              // last rail gone → bare hex
      else normalizeTrack(h.track);
    } else {
      const affected = linesUsingHex(st, job.hex);            // tear up everything
      removedLines = affected.length;
      for (const l of affected) removeLine(st, st.companies[l.co], l.id);
      h.track = null;
    }
  }
  if (job.develop) {
    const spec = CFG.DEVELOP.builds[job.develop];
    h.cons = job.develop;
    h.dev = spec ? spec.dev : 1;
  } else {
    h.cons = null; h.dev = 0;        // cleared parcel (or bare track removal)
  }
  if (h.owner >= 0) h.value = landPrice(st, job.hex);
  st.od.dirty = true; st.renderDirty = true;
  if (co && co.isPlayer) {
    if (job.develop) {
      const spec = CFG.DEVELOP.builds[job.develop];
      logEvent(st, "Redevelopment complete on hex #" + h.spiral + ": " + (spec ? spec.label : "development") +
        " — now earning rent.", "event");
    } else {
      logEvent(st, (job.hadTrack ? "Track" : "Building") + " demolished on hex #" + h.spiral +
        (removedLines ? " (" + removedLines + " line(s) removed)." : "."));
    }
  }
}

/** Begin demolishing your track on idx. With `consType`, the parcel is also
 *  redeveloped into rent-earning property (requires clearing ALL rails and an
 *  empty hex — no station). Without it, this is a bare teardown: with `gauge`
 *  set only that one rail is torn up (other gauges keep running), and the work
 *  is allowed even when a station sits on the hex (the station stays; the rail
 *  is what's removed). Track and lines keep running until the work completes. */
function demolishTrack(st, co, idx, consType, gauge) {
  const h = st.hexes[idx];
  if (consType) {                                   // demolish + redevelop into property
    const why = canRedevelop(st, co, idx);
    if (why) return { ok: false, msg: why };
    const spec = CFG.DEVELOP.builds[consType];
    if (!spec) return { ok: false, msg: "Unknown development type." };
    const q = redevelopCost(st, co, idx, consType, true);
    if (co.cash < q.total) return { ok: false, msg: "Need " + fmtYen(q.total) + "." };
    co.cash -= q.total;
    const days = redevelopDays(st, idx, consType, true);
    enqueueDemolish(st, co, idx, consType, true, days, null);
    const affected = linesUsingHex(st, idx);
    if (co.isPlayer) logEvent(st, "Redevelopment started on hex #" + h.spiral +
      " (~" + days + " days" + (affected.length ? ", " + affected.length + " line(s) will be removed" : "") + ").");
    return { ok: true, cost: q.total, days, removedLines: affected.length,
      rentPerYear: estimatedRentYear(st, h.value || landPrice(st, idx), spec.dev) };
  }
  // bare track teardown (allowed even with a station on the hex — req #3)
  const why = canDemolishTrack(st, co, idx, gauge);
  if (why) return { ok: false, msg: why };
  const q = redevelopCost(st, co, idx, null, true);
  if (co.cash < q.total) return { ok: false, msg: "Need " + fmtYen(q.total) + "." };
  co.cash -= q.total;
  const days = redevelopDays(st, idx, null, true);
  enqueueDemolish(st, co, idx, null, true, days, gauge || null);
  const mm = gauge && CFG.GAUGES[gauge] ? CFG.GAUGES[gauge].mm : null;
  const affected = mm !== null ? linesUsingHexGauge(st, idx, mm) : linesUsingHex(st, idx);
  if (co.isPlayer) logEvent(st, "Demolition started on hex #" + h.spiral +
    (gauge ? " (" + CFG.GAUGES[gauge].name + " rail)" : "") +
    " (~" + days + " days" + (affected.length ? ", " + affected.length + " line(s) will be removed" : "") + ").");
  return { ok: true, cost: q.total, days, removedLines: affected.length, rentPerYear: 0 };
}

/** Compatibility wrapper: demolish track and redevelop into consType. */
function demolishAndDevelop(st, co, idx, consType) {
  return demolishTrack(st, co, idx, consType);
}

/* ---- Station demolition -----------------------------------------------------
 * Tearing a station down is done from the Manage Station screen (not the
 * Demolish tool, which is for track). It costs money and takes time; the
 * station keeps serving until the work completes. The RAIL on the hex is left
 * in place — only the station building is removed.
 */

/** Yen to demolish a station (scales with the size of its ekinaka commerce). */
function stationDemolishCost(st, s) {
  const tierMult = 1 + effectiveCommerce(st, s) * 0.5;       // a bigger station is dearer to clear
  return Math.round(CFG.STATION.demolishCost * inflationOf(st.time.year) * tierMult);
}
/** Calendar days to demolish a station (longer for a heavily-built ekinaka). */
function stationDemolishDays(st, s) {
  return Math.ceil(CFG.STATION.demolishDays * (1 + effectiveCommerce(st, s) * 0.25));
}

/** Drop a station from every line that serves it; lines left with fewer than
 *  2 stations are removed (their trains go to storage). The line's path/track
 *  is untouched — only the stop is gone. */
function removeStationFromLines(st, sid) {
  for (const l of st.lines) {
    if (!l.alive || !l.stations || !l.stations.includes(sid)) continue;
    l.stations = l.stations.filter(x => x !== sid);
    if (l.stops) delete l.stops[sid];
    if (l.waypoints) l.waypoints = l.waypoints.filter(x => x !== sid);
    if (l.stations.length < 2) removeLine(st, st.companies[l.co], l.id);
  }
}

/** Begin demolishing a station (from Manage Station). Returns a {quoteOnly}
 *  estimate or enqueues the works; the station serves until they finish. */
function demolishStation(st, co, sid, quoteOnly) {
  const s = st.stations[sid];
  if (!s || !s.alive || s.co !== co.id) return { ok: false, msg: "Not your station." };
  if (s.building) return { ok: false, msg: "This station is still under construction." };
  if (st.builds.some(b => b.kind === "stationdemo" && b.sid === sid)) return { ok: false, msg: "Already being demolished." };
  const cost = stationDemolishCost(st, s), days = stationDemolishDays(st, s);
  if (quoteOnly) return { ok: true, quoteOnly: true, cost, days };
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  st.builds.push({ kind: "stationdemo", co: co.id, sid, hex: s.hex, total: Math.max(1, days), progress: 0 });
  if (co.isPlayer) logEvent(st, "Demolition of " + s.name + " started (~" + days + " days). The rail is left in place.");
  return { ok: true, cost, days };
}

/** Apply a finished station-demolition job: drop the station from its lines and
 *  remove it from the hex. The hex's track stays put. */
function finishStationDemolish(st, job) {
  const s = st.stations[job.sid];
  const co = st.companies[job.co];
  if (!s || !s.alive) return;
  removeStationFromLines(st, s.id);
  s.alive = false;
  const h = st.hexes[s.hex];
  h.stations = h.stations.filter(id => id !== s.id);
  st.od.dirty = true; st.renderDirty = true;
  if (co && co.isPlayer) logEvent(st, "Station demolished: " + s.name + " — the rail remains.", "event");
}

/** Begin developing an owned, track-free parcel: build a new construction, or
 *  (if one already stands) clear it and optionally raise a replacement. The land
 *  stays yours; finished developments feed the rent loop. */
function developParcel(st, co, idx, consType) {
  const why = canDevelopParcel(st, co, idx);
  if (why) return { ok: false, msg: why };
  const h = st.hexes[idx];
  const spec = consType ? CFG.DEVELOP.builds[consType] : null;
  if (consType && !spec) return { ok: false, msg: "Unknown development type." };
  if (!consType && !h.cons) return { ok: false, msg: "Nothing to demolish here." };
  const demolishNeeded = !!h.cons;          // an existing building must be cleared first
  const q = redevelopCost(st, co, idx, consType, demolishNeeded);
  if (co.cash < q.total) return { ok: false, msg: "Need " + fmtYen(q.total) + "." };
  co.cash -= q.total;
  const days = redevelopDays(st, idx, consType, demolishNeeded);
  enqueueDemolish(st, co, idx, consType, false, days);
  if (co.isPlayer) logEvent(st, (consType ? "Construction" : "Demolition") + " started on hex #" +
    h.spiral + " (~" + days + " days).");
  return { ok: true, cost: q.total, days,
    rentPerYear: spec ? estimatedRentYear(st, h.value || landPrice(st, idx), spec.dev) : 0 };
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

/** Total cost to build a depot on idx; depot+station also includes this
 *  company's configured station defaults (platform level / length). */
function depotBuildCost(st, co, idx, asStation) {
  const base = depotCost(st, idx, asStation);
  return asStation ? base + stationDefaultsExtra(st, co, base) : base;
}

/** True if a station-like record (station or depot) should act as a line stop. */
function isLineStop(s) {
  return !!s && s.alive && !s.building && !(s.isDepot && !s.depotAsStation);
}

function buildDepot(st, co, idx, asStation) {
  const why = canBuildStation(st, co, idx);  // same hex eligibility as a station
  if (why) return { ok: false, msg: why };
  const cost = depotBuildCost(st, co, idx, asStation);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  const h = st.hexes[idx];
  const s = {
    id: st.stations.length, co: co.id, hex: idx,
    cars: asStation ? co.stationDefaults.cars : 3,
    name: (h.name || ("Sta #" + h.spiral)) + " Depot", builtYear: st.time.year,
    board: 0, boardAvg: 0, alive: true, building: CFG.DEPOT.buildDays,
    isDepot: true, depotAsStation: !!asStation,
    commerce: 0, commerceBuilding: 0, commercePending: 0,
    platBuilding: 0, platPending: 0,
  };
  st.stations.push(s);
  h.stations.push(s.id);
  st.od.dirty = true;
  if (co.isPlayer) {
    logEvent(st, (asStation ? "Depot+station" : "Depot") + " construction started on " +
      (h.name ? h.name + " " : "") + "hex #" + h.spiral + " (~" + CFG.DEPOT.buildDays + " days).");
  }
  return { ok: true, station: s, cost };
}

/** Direction the next train added to a line should run. Linear lines always
 *  start forward (+1) and bounce; loop lines alternate so successive trains
 *  circulate opposite ways — odd-numbered (1st, 3rd, …) clockwise (+1),
 *  even-numbered (2nd, 4th, …) counter-clockwise (−1). Based on how many live
 *  trains the line already runs. */
function nextTrainDir(st, line) {
  if (!line.loop) return 1;
  const live = line.trains.filter(id => st.trains[id] && st.trains[id].alive).length;
  return live % 2 === 0 ? 1 : -1;     // 0 existing → 1st train → clockwise; 1 existing → 2nd → counter
}

/** Send a stored train to operate a compatible line (gauge & electrification). */
function assignStoredTrain(st, co, trainId, lineId) {
  const tr = st.trains[trainId];
  if (!tr || !tr.alive || !tr.stored || tr.co !== co.id) return { ok: false, msg: "Not a stored train." };
  const line = st.lines[lineId];
  if (!line || !line.alive || line.co !== co.id) return { ok: false, msg: "Bad line." };
  if (!trainTypesFor(st, co, line).includes(tr.type)) return { ok: false, msg: "Incompatible with this line (gauge/electrification)." };
  tr.dir = nextTrainDir(st, line);
  tr.stored = false; tr.line = lineId; tr.pos = Math.random() * Math.max(1, line.path.length - 1);
  line.trains.push(tr.id);
  refreshTrainCars(st);
  st.od.dirty = true;
  return { ok: true };
}

/** Resale value of a train: a fraction of its current-era price that
 *  depreciates with age. Older rolling stock fetches less, but never zero. */
function trainResaleValue(st, tr) {
  const age = Math.max(0, st.time.year - (tr.bought ?? st.time.year));
  const r = CFG.TRAIN_RESALE;
  const frac = clamp(r.base - r.dropPerYear * age, r.floor, r.base);
  return Math.round(CFG.TRAINS[tr.type].cost * inflationOf(st.time.year) * frac);
}

/** Sell/scrap a train (active or depot-stored) for its resale value. Detaches
 *  it from its line if it was running. */
function sellTrain(st, co, trainId) {
  const tr = st.trains[trainId];
  if (!tr || !tr.alive || tr.co !== co.id) return { ok: false, msg: "Not your train." };
  const refund = trainResaleValue(st, tr);
  if (!tr.stored && tr.line >= 0 && st.lines[tr.line]) {
    const line = st.lines[tr.line];
    line.trains = line.trains.filter(id => id !== tr.id);
  }
  tr.alive = false; tr.stored = false; tr.line = -1;
  co.cash += refund;
  refreshTrainCars(st);
  st.od.dirty = true;
  return { ok: true, refund };
}

/** Sell a depot-stored train for its resale value. */
function scrapStoredTrain(st, co, trainId) {
  const tr = st.trains[trainId];
  if (!tr || !tr.alive || !tr.stored || tr.co !== co.id) return { ok: false, msg: "Not a stored train." };
  return sellTrain(st, co, trainId);
}

/* ---- Default fare (company-wide ¥/km) -------------------------------------
 * One knob prices every line at once. Each line may opt out (line.fareOverride)
 * to keep its own fare; the rest follow the company default. Until the player
 * sets the default explicitly it tracks the era-comfortable rate so new lines
 * are never mis-priced for their era.
 */

/** The company's effective default fare (¥/km): the explicit value once set,
 *  otherwise the current era's reference rate. */
function companyDefaultFare(st, co) {
  return co.defaultFareSet ? co.defaultFarePerKm
    : +(CFG.PAX.defaultFarePerKm * inflationOf(st.time.year)).toFixed(3);
}

/** Set the company-wide default fare and apply it to every alive line that
 *  hasn't overridden it. Returns how many lines were re-priced. */
function setCompanyDefaultFare(st, co, perKm) {
  co.defaultFarePerKm = clamp(+perKm || 0, 0, 1e6);
  co.defaultFareSet = true;
  let n = 0;
  for (const l of st.lines) {
    if (l.alive && l.co === co.id && !l.fareOverride) { l.fare = co.defaultFarePerKm; n++; }
  }
  st.od.dirty = true;
  return n;
}

/* ---- Lines ----------------------------------------------------------------
 * A line is a path over connected track between two of the company's
 * stations. Track of partner companies (trackage rights) with the same
 * gauge is usable. Multiple services (local/express) can share track. A line
 * may also be a one-way LOOP (line.loop): its path closes back on itself and
 * trains circulate, alternating direction as they're added (see buyTrain).
 */

/** BFS over usable track hexes for this company on a single gauge; returns the
 *  hex path or null. `gaugeMm` pins the gauge; when omitted it defaults to the
 *  first in-service rail at the start hex. Only in-service rails of that gauge
 *  count — trains can't run over a different gauge sharing the hex. */
function trackPath(st, co, fromHex, toHex, gaugeMm) {
  const ft = st.hexes[fromHex].track;
  if (!ft) return null;
  let wantMm = gaugeMm;
  if (!wantMm) {                                   // default: start hex's first running rail
    const r = trackRailList(ft).find(r => !r.building);
    wantMm = CFG.GAUGES[(r || ft).gauge].mm;
  }
  const usable = (i) => {
    const t = st.hexes[i].track;
    if (!trackHasMm(t, wantMm)) return false;
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
  const g = planLineGauge(st, co, [staA, staB], false, co.gauge);
  if (g.error) return { ok: false, msg: g.error };
  const path = g.path, gaugeMm = g.mm;
  // stations served by the path (this company's, finished, and willing to stop —
  // depot-only facilities have no passenger platform and are skipped)
  const stationsOnPath = lineStationsOnPath(st, co, path, gaugeMm);
  if (stationsOnPath.length < 2) return { ok: false, msg: "Line needs 2+ stations." };
  const stops = {};
  stationsOnPath.forEach((sid, k) => {
    const s = st.stations[sid];
    // express defaults: stop at termini and major (busy/well-developed) stations only
    stops[sid] = type === "local" || k === 0 || k === stationsOnPath.length - 1 || stationServiceLevel(st, s) >= 2;
  });
  const elec = pathElec(st, path, gaugeMm);
  const line = {
    id: st.lines.length, co: co.id,
    name: st.stations[stationsOnPath[0]].name + "-" + st.stations[stationsOnPath[stationsOnPath.length - 1]].name,
    path, stations: stationsOnPath, stops, type, loop: false,
    fare: companyDefaultFare(st, co), fareOverride: false,
    gaugeMm, elec, trains: [],
    capacity: 0, demand: 0, board: 0, served: 0, desirability: 1, alive: true,
  };
  st.lines.push(line);
  st.od.dirty = true;
  return { ok: true, line };
}

/** Stitch the full hex path that visits an ordered list of waypoint stations,
 *  routing each consecutive pair over usable track (BFS shortest along
 *  existing rails). With `loop`, also routes the last waypoint back to the
 *  first so the path closes on itself (path[0] === last hex). Returns
 *  { path } or { error }. */
function lineWaypointPath(st, co, waypoints, loop, gaugeMm) {
  if (!waypoints || waypoints.length < 2) return { error: "A line needs at least 2 stations." };
  if (loop && waypoints.length < 3) return { error: "A loop line needs at least 3 stations." };
  if (!gaugeMm) return { error: "No gauge selected for the line." };
  const full = [];
  const hops = loop ? waypoints.length : waypoints.length - 1;   // loop adds the closing hop back to start
  for (let k = 0; k < hops; k++) {
    const a = st.stations[waypoints[k]], b = st.stations[waypoints[(k + 1) % waypoints.length]];
    if (!a || !b) return { error: "Unknown station in the route." };
    // a station meets the gauge at its own hex or — the #4 case — an adjacent
    // hex carrying that gauge of rail; route anchor-to-anchor
    const aAnchor = stationGaugeAnchor(st, a, gaugeMm), bAnchor = stationGaugeAnchor(st, b, gaugeMm);
    if (aAnchor < 0 || bAnchor < 0)
      return { error: a.name + " and " + b.name + " aren't connected by " + gaugeMm + "mm track (check gauge/rights)." };
    const seg = trackPath(st, co, aAnchor, bAnchor, gaugeMm);
    if (!seg) return { error: a.name + " and " + b.name + " aren't connected by " + gaugeMm + "mm track (check gauge/rights)." };
    if (k === 0) full.push(...seg);
    else full.push(...seg.slice(1));        // drop the shared junction hex
  }
  return { path: full };
}

/** Choose the gauge for a line over the given waypoints: try the preferred
 *  gauge first (the company's default), then every other gauge, returning the
 *  first that connects all waypoints. Returns {mm, path} or {error}. */
function planLineGauge(st, co, waypoints, loop, prefer) {
  const mms = [];
  const add = key => { if (CFG.GAUGES[key]) { const mm = CFG.GAUGES[key].mm; if (!mms.includes(mm)) mms.push(mm); } };
  add(prefer);
  for (const key in CFG.GAUGES) add(key);
  let lastErr = "Stations not connected by usable track (check gauge/rights).";
  for (const mm of mms) {
    const r = lineWaypointPath(st, co, waypoints, loop, mm);
    if (!r.error) return { mm, path: r.path };
    lastErr = r.error;
  }
  return { error: lastErr };
}

/** True if every hex of `path` carries an in-service rail of gauge-mm that is
 *  electrified (so a line on this gauge can run electric stock end-to-end). */
function pathElec(st, path, mm) {
  return path.every(hx => { const r = trackRailMm(st.hexes[hx].track, mm); return r && r.elec; });
}

/** Index in a line's path where a station meets the line: the station's own
 *  hex if it lies on the path, else an adjacent path hex (the #4 case). -1 if
 *  the station doesn't touch the path at all. */
function stationPathPos(st, line, sid) {
  const hex = st.stations[sid].hex;
  const p = line.path.indexOf(hex);
  if (p >= 0) return p;
  const nbs = neighborsOf(hex);
  for (let i = 0; i < line.path.length; i++) if (nbs.includes(line.path[i])) return i;
  return -1;
}

/** All this company's operating line-stop stations served by a hex path, in
 *  path order (deduplicated). With `gaugeMm`, also picks up stations whose own
 *  hex lacks that gauge but which sit beside the path (the #4 case). */
function lineStationsOnPath(st, co, path, gaugeMm) {
  const out = [];
  const onPath = new Set(path);
  const consider = sid => {
    const s = st.stations[sid];
    if (!s || s.co !== co.id || !isLineStop(s) || out.includes(sid)) return;
    // a station serves the line if its hex lies on the path, OR (the #4 case)
    // its own hex lacks this gauge but it sits beside a path hex that carries it
    if (onPath.has(s.hex)) { out.push(sid); return; }
    if (gaugeMm && !trackHasMm(st.hexes[s.hex].track, gaugeMm) &&
        neighborsOf(s.hex).some(nb => onPath.has(nb))) out.push(sid);
  };
  for (const hx of path) {
    for (const sid of st.hexes[hx].stations) consider(sid);          // stations on the path
    for (const nb of neighborsOf(hx))                                 // + stations beside the path
      for (const sid of st.hexes[nb].stations) consider(sid);
  }
  return out;
}

/** Default stop pattern for a freshly routed line: chosen waypoints always
 *  stop; otherwise locals stop everywhere and expresses skip minor stations.
 *  oldStops (optional) preserves the player's existing toggles on a re-route. */
function defaultStops(st, stationsOnPath, waypointSet, type, oldStops) {
  const stops = {};
  for (const sid of stationsOnPath) {
    if (waypointSet.has(sid)) { stops[sid] = true; continue; }     // chosen waypoints always stop
    if (oldStops && sid in oldStops) { stops[sid] = oldStops[sid]; continue; }  // keep prior toggle
    stops[sid] = type === "local" || stationServiceLevel(st, st.stations[sid]) >= 2;
  }
  return stops;
}

/** Create a line that visits an ordered list of waypoint stations the player
 *  picked (not merely the shortest A→B route). Waypoints are always served.
 *  With `loop`, the path closes back to the first station and trains circulate
 *  one-way (alternating direction as they're added). */
function createLineVia(st, co, waypoints, type, loop) {
  waypoints = (waypoints || []).filter((sid, k, a) => a.indexOf(sid) === k);   // dedupe
  for (const sid of waypoints) {
    const s = st.stations[sid];
    if (!s || s.co !== co.id || !isLineStop(s)) return { ok: false, msg: "Pick your own operating stations." };
  }
  if (waypoints.length < (loop ? 3 : 2)) {
    return { ok: false, msg: loop ? "A loop line needs at least 3 stations." : "A line needs at least 2 stations." };
  }
  const g = planLineGauge(st, co, waypoints, loop, co.gauge);
  if (g.error) return { ok: false, msg: g.error };
  const path = g.path, gaugeMm = g.mm;
  const stationsOnPath = lineStationsOnPath(st, co, path, gaugeMm);
  if (stationsOnPath.length < 2) return { ok: false, msg: "Line needs 2+ stations on its route." };
  const wpSet = new Set(waypoints);
  const stops = defaultStops(st, stationsOnPath, wpSet, type);
  const elec = pathElec(st, path, gaugeMm);
  const endName = st.stations[stationsOnPath[stationsOnPath.length - 1]].name;
  const line = {
    id: st.lines.length, co: co.id,
    name: loop ? st.stations[stationsOnPath[0]].name + " Loop"
               : st.stations[stationsOnPath[0]].name + "-" + endName,
    path, stations: stationsOnPath, stops, waypoints: waypoints.slice(), type, loop: !!loop,
    fare: companyDefaultFare(st, co), fareOverride: false,
    gaugeMm, elec, trains: [],
    capacity: 0, demand: 0, board: 0, served: 0, desirability: 1, alive: true,
  };
  st.lines.push(line);
  st.od.dirty = true;
  return { ok: true, line };
}

/** The waypoint list for a line — explicit if present, else derived from its
 *  current stop stations (so legacy / AI lines can still be re-routed). */
function lineWaypoints(line) {
  if (line.waypoints && line.waypoints.length >= 2) return line.waypoints.slice();
  const stops = line.stations.filter(sid => line.stops[sid]);
  return (stops.length >= 2 ? stops : line.stations).slice();
}

/** Re-route an existing line through a new ordered waypoint list (add/remove
 *  stations, extend, reshape). Keeps the line's id, name, fare and trains;
 *  preserves the player's existing stop toggles where stations remain. `loop`
 *  defaults to the line's current loop status (so editing keeps a loop closed). */
function editLineRoute(st, co, lineId, waypoints, type, loop) {
  const line = st.lines[lineId];
  if (!line || !line.alive || line.co !== co.id) return { ok: false, msg: "Bad line." };
  if (loop === undefined) loop = !!line.loop;
  waypoints = (waypoints || []).filter((sid, k, a) => a.indexOf(sid) === k);
  for (const sid of waypoints) {
    const s = st.stations[sid];
    if (!s || s.co !== co.id || !isLineStop(s)) return { ok: false, msg: "Pick your own operating stations." };
  }
  if (waypoints.length < (loop ? 3 : 2)) {
    return { ok: false, msg: loop ? "A loop line needs at least 3 stations." : "A line needs at least 2 stations." };
  }
  // editing keeps the line's existing gauge (its trains are gauge-specific)
  const r = lineWaypointPath(st, co, waypoints, loop, line.gaugeMm);
  if (r.error) return { ok: false, msg: r.error };
  const path = r.path;
  const stationsOnPath = lineStationsOnPath(st, co, path, line.gaugeMm);
  if (stationsOnPath.length < 2) return { ok: false, msg: "Line needs 2+ stations on its route." };
  const wpSet = new Set(waypoints);
  line.path = path;
  line.stations = stationsOnPath;
  line.stops = defaultStops(st, stationsOnPath, wpSet, type || line.type, line.stops);
  line.waypoints = waypoints.slice();
  line.loop = !!loop;
  line.elec = pathElec(st, path, line.gaugeMm);
  refreshTrainCars(st);
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
    id: st.trains.length, co: co.id, line: lineId, type, cars, bought: st.time.year,
    pos: Math.random() * Math.max(1, line.path.length - 1), dir: nextTrainDir(st, line), alive: true, stored: false,
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

/** Crew-slots a job wants right now: a track corridor can put a crew on each
 *  unbuilt section at once; every other civil-works job occupies one crew. */
function buildJobSlotsWanted(job) {
  return job.kind === "track" ? Math.max(0, job.hexes.length - job.done) : 1;
}

/** Allocate this day's construction-crew capacity per company, FIFO down the
 *  queue (see CFG.TRACK.crewsByEra). Returns a parallel array of slot counts.
 *  A company can only progress `crews` km of civil works simultaneously — the
 *  era's technology limits how fast money turns into railway, so construction
 *  time stays a real constraint even for a rich company. Jobs beyond capacity
 *  wait their turn. */
function allocateCrews(st) {
  const crews = CFG.TRACK.crewsByEra[eraOf(st.time.year).key];
  const remaining = new Map();                  // co id -> crew-slots left today
  return st.builds.map(job => {
    const left = remaining.has(job.co) ? remaining.get(job.co) : crews;
    const slots = Math.min(left, buildJobSlotsWanted(job));
    remaining.set(job.co, left - slots);
    return slots;
  });
}

function processBuilds(st) {
  // one simulated day represents ~30 calendar days of construction work,
  // scaled by the crews the company can field (allocateCrews) and slowed
  // when the builder is short-staffed (underpaying the going wage)
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  const slots = allocateCrews(st);
  for (let b = st.builds.length - 1; b >= 0; b--) {
    const job = st.builds[b];
    const jco = st.companies[job.co];
    const work = span * ((jco && jco._buildSpeed) || 1) * slots[b];
    // demolition / redevelopment: the track (and any building) stays in place and
    // usable until the teardown completes, then it's cleared and (optionally) the
    // parcel is redeveloped into rent-earning property.
    if (job.kind === "demolish") {
      job.progress += work;
      if (job.progress >= job.total) {
        finishDemolish(st, job);
        st.builds.splice(b, 1);
      }
      continue;
    }
    // gauge works: add a parallel rail of a new gauge, or convert (regauge) an
    // existing rail. The rail being converted is already out of service (marked
    // building when the job started); a rail being added appears only on
    // completion. Existing OTHER rails keep running throughout.
    if (job.kind === "gauge") {
      job.progress += work;
      if (job.progress >= job.total) {
        finishGaugeWork(st, job);
        st.builds.splice(b, 1);
      }
      continue;
    }
    // station demolition: the station keeps operating until the teardown
    // completes, then it's removed (its rail is left in place).
    if (job.kind === "stationdemo") {
      job.progress += work;
      if (job.progress >= job.total) {
        finishStationDemolish(st, job);
        st.builds.splice(b, 1);
      }
      continue;
    }
    // track: with S crews on the corridor, S sections advance at once
    job.progress += work;
    while (job.progress >= job.daysPerHex && job.done < job.hexes.length) {
      job.progress -= job.daysPerHex;
      const i = job.hexes[job.done++];
      const h = st.hexes[i];
      const ter = CFG.TERRAIN[h.terrain];
      h.track = { co: job.co, gauge: job.gauge, elec: !!job.elec, tunnel: !!ter.needsTunnel, dmg: 0,
        rails: [{ gauge: job.gauge, elec: !!job.elec, building: false }] };
      h.cons = null; h.dev = 0;        // only rails shown on rail hexes
      st._industryKmYear = (st._industryKmYear || 0) + 1;          // labor-market pressure
      if (jco) jco._kmYear = (jco._kmYear || 0) + 1;               // expansion fatigue signal
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
  // station/depot construction countdown (in calendar days), also slowed when
  // the owner is short-staffed
  for (const s of st.stations) {
    if (s.alive && s.building) {
      const sco = st.companies[s.co];
      s.building = Math.max(0, s.building - span * ((sco && sco._buildSpeed) || 1));
      if (!s.building) {
        st.od.dirty = true;
        const sco = st.companies[s.co];
        if (sco && sco.isPlayer) {
          logEvent(st, (s.isDepot ? (s.depotAsStation ? "Depot+station" : "Depot") : "Station") +
            " opened: " + s.name + ".");
        }
      }
    }
    // commerce (ekinaka) construction countdown — switches the earning tier
    // and its upkeep over on completion
    if (s.alive && s.commerceBuilding > 0) {
      const sco = st.companies[s.co];
      s.commerceBuilding = Math.max(0, s.commerceBuilding - span * ((sco && sco._buildSpeed) || 1));
      if (!s.commerceBuilding && s.commercePending) {
        s.commerce = s.commercePending;
        s.commercePending = 0;
        st.od.dirty = true;
        if (sco && sco.isPlayer) {
          const spec = commerceSpec(s.commerce);
          logEvent(st, "Commerce opened at " + s.name + ": " + (spec ? spec.name : "shops") +
            " — now trading.", "event");
        }
      }
    }
    // platform extension — trains on the served lines lengthen on completion
    if (s.alive && s.platBuilding > 0) {
      const sco = st.companies[s.co];
      s.platBuilding = Math.max(0, s.platBuilding - span * ((sco && sco._buildSpeed) || 1));
      if (!s.platBuilding && s.platPending) {
        s.cars = s.platPending; s.platPending = 0;
        refreshTrainCars(st);
        st.od.dirty = true;
        if (sco && sco.isPlayer) logEvent(st, "Platforms lengthened at " + s.name + " to " + s.cars + "-car.");
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

/** Years a company has been trading (since it was founded). */
function yearsInBusiness(st, co) {
  return Math.max(0, st.time.year - co.founded);
}

/** A young railway can't be acquired at all until it has traded for
 *  CFG.BUYOUT.minYearsInBusiness years — early upstarts get room to grow. */
function buyoutBlockedReason(st, target) {
  const years = yearsInBusiness(st, target);
  if (years < CFG.BUYOUT.minYearsInBusiness) {
    return target.name + " has only been in business " + years + " year" + (years === 1 ? "" : "s") +
      " — a railway can't be bought out until it has operated " + CFG.BUYOUT.minYearsInBusiness +
      " years (established " + target.founded + ").";
  }
  return null;
}

/** Liquidate a hopelessly insolvent company: services stop, rolling stock and
 *  buildings are struck off, rails are lifted for scrap and its land returns
 *  to the open market. AI-only — the player's company is never auto-wound-up
 *  (the game has no formal game-over state). Called from onNewYear when a
 *  rival is deep underwater or chronically insolvent; with real repair bills
 *  and payroll, financial strain can now genuinely kill a struggling railway. */
function windUpCompany(st, co) {
  co.alive = false;
  for (const l of st.lines) if (l.alive && l.co === co.id) removeLine(st, co, l.id);
  for (const t of st.trains) if (t.co === co.id) { t.alive = false; t.stored = false; t.line = -1; }
  for (const s of st.stations) {
    if (s.co !== co.id || !s.alive) continue;
    s.alive = false;
    const h = st.hexes[s.hex];
    h.stations = h.stations.filter(id => id !== s.id);
  }
  for (const h of st.hexes) if (h.track && h.track.co === co.id) h.track = null;
  for (const i of co.land) { const h = st.hexes[i]; h.owner = -1; h.value = 0; }
  co.land = [];
  st.builds = st.builds.filter(b => b.co !== co.id);
  st.od.dirty = true;
  if (st.renderDirty !== undefined) st.renderDirty = true;
}

/** Transfer everything from `target` to `buyer` at 1.2× enterprise value. */
function buyOutCompany(st, buyer, target) {
  const blocked = buyoutBlockedReason(st, target);
  if (blocked) return { ok: false, msg: blocked };
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
  // in-progress construction jobs, too — otherwise track still being laid would
  // complete stamped with the defunct company's id (orphaned, undemolishable)
  for (const b of st.builds) if (b.co === target.id) b.co = buyer.id;
  st.od.dirty = true;
  if (st.renderDirty !== undefined) st.renderDirty = true;
  return { ok: true, price };
}
