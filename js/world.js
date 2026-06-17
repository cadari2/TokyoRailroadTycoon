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
    stationDefaults: { level: 1, cars: 3 },  // platforms/platform length applied to newly built stations
    // company-wide default fare (¥/km) applied to every line that hasn't opted
    // out (line.fareOverride). Until the player sets it explicitly it tracks the
    // era-comfortable rate, so new lines are always sensibly priced.
    defaultFarePerKm: opts.defaultFarePerKm ?? +(CFG.PAX.defaultFarePerKm * inflationOf(opts.founded)).toFixed(2),
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
  if (hexHasPendingWork(st, idx)) return "This hex is being demolished — wait for it to clear.";
  return null;
}

/** Extra one-time cost of building a new station pre-configured to this
 *  company's stationDefaults instead of the baseline level-1/3-car station.
 *  Mirrors the per-step pricing of upgradeStation (level, applied first) and
 *  extendPlatform (platform length, priced at the default's level), so
 *  building "pre-upgraded" never undercuts upgrading after the fact. Shorter
 *  defaults can lower the price but never below a quarter of the base cost. */
function stationDefaultsExtra(st, co, baseCost) {
  const lvl = co.stationDefaults.level, cars = co.stationDefaults.cars;
  let extra = 0;
  for (let l = 1; l < lvl; l++) extra += Math.round(baseCost * CFG.STATION.upgradeCostMult * l);
  const perCar = Math.round(CFG.STATION.platformUpgradeCost * inflationOf(st.time.year) * (1 + lvl * 0.3));
  extra += (cars - 3) * perCar;
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
    level: co.stationDefaults.level, cars: co.stationDefaults.cars,
    name: h.name || ("Sta #" + h.spiral), builtYear: st.time.year,
    board: 0, alive: true, building: CFG.STATION.buildDays,
    isDepot: false, depotAsStation: false,
    commerce: 0, commerceBuilding: 0, commercePending: 0,
    levelBuilding: 0, levelPending: 0, platBuilding: 0, platPending: 0,
  };
  st.stations.push(s);
  h.stations.push(s.id);
  st.od.dirty = true;
  if (co.isPlayer) {
    logEvent(st, "Station construction started on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
      " (~" + CFG.STATION.buildDays + " days).");
  }
  return { ok: true, station: s, cost };
}

/** Cost to raise a single station from its current level toward targetLevel,
 *  summing each step's price (same per-step formula as upgradeStation). */
function stationLevelUpgradeCost(st, s, targetLevel) {
  const target = clamp(targetLevel, 1, CFG.STATION.maxLevel);
  const age = Math.max(0, st.time.year - s.builtYear);
  const base = stationCost(st, s.hex) * CFG.STATION.upgradeCostMult * (1 + Math.min(1.5, age / 40));
  let cost = 0;
  for (let l = s.level; l < target; l++) cost += Math.round(base * l);
  return cost;
}

/** Cost to lengthen a single station's platform toward targetCars
 *  (era-capped), summing each +1 step's price (same formula as extendPlatform). */
function stationPlatformUpgradeCost(st, s, targetCars) {
  const cap = maxPlatformCars(st.time.year);
  const target = clamp(targetCars, 1, cap);
  const perCar = Math.round(CFG.STATION.platformUpgradeCost * inflationOf(st.time.year) * (1 + s.level * 0.3));
  return Math.max(0, target - s.cars) * perCar;
}

/** Calendar days to raise a station from `fromLevel` up to `toLevel`. */
function stationLevelUpgradeDays(fromLevel, toLevel) {
  return CFG.STATION.upgradeDaysPerLevel * Math.max(0, toLevel - fromLevel);
}
/** Calendar days to lengthen a platform from `fromCars` to `toCars`. */
function platformUpgradeDays(fromCars, toCars) {
  return CFG.STATION.platformDaysPerCar * Math.max(0, toCars - fromCars);
}
/** Level a station will reach once any pending expansion completes. */
function effectiveStationLevel(s) { return s.levelPending || s.level; }
/** Cars a station's platform will reach once any pending extension completes. */
function effectiveStationCars(s) { return s.platPending || s.cars; }

/** Expand station level (catchment/major-stop bonus) — pricey once established.
 *  The work takes time; the station keeps operating at its current level and the
 *  new level switches on when construction completes (see processBuilds). */
function upgradeStation(st, co, sid) {
  const s = st.stations[sid];
  if (s.co !== co.id || !s.alive) return { ok: false, msg: "Not yours." };
  if (s.levelBuilding > 0) return { ok: false, msg: "A level upgrade is already under way here." };
  const target = s.level + 1;
  if (target > CFG.STATION.maxLevel) return { ok: false, msg: "Already max level." };
  const cost = stationLevelUpgradeCost(st, s, target);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  s.levelPending = target;
  s.levelBuilding = stationLevelUpgradeDays(s.level, target);
  if (co.isPlayer) logEvent(st, "Station expansion started at " + s.name +
    " → level " + target + " (~" + Math.ceil(s.levelBuilding) + " days).");
  return { ok: true, cost, days: s.levelBuilding };
}

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

/** Start a level upgrade on every eligible station (this company's, excluding
 *  pure depots and any already upgrading) up to targetLevel, charging the
 *  combined multi-step cost in one go. All-or-nothing: if the company can't
 *  afford the full bill, nothing starts. Each station keeps running. */
function bulkUpgradeStationLevels(st, co, targetLevel) {
  const target = clamp(targetLevel, 1, CFG.STATION.maxLevel);
  const eligible = st.stations.filter(s => s.co === co.id && isLineStop(s) && s.levelBuilding <= 0 && s.level < target);
  if (!eligible.length) return { ok: false, msg: "No stations below level " + target + ".", count: 0, cost: 0 };
  const cost = eligible.reduce((sum, s) => sum + stationLevelUpgradeCost(st, s, target), 0);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + ".", count: eligible.length, cost };
  co.cash -= cost;
  for (const s of eligible) { s.levelPending = target; s.levelBuilding = stationLevelUpgradeDays(s.level, target); }
  if (co.isPlayer) logEvent(st, "Expansion to level " + target + " started at " + eligible.length +
    " station" + (eligible.length === 1 ? "" : "s") + ".");
  return { ok: true, count: eligible.length, cost };
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

/** Annual upkeep owed for one station: the year-end building levy (level-scaled,
 *  depot or station rate) plus any station-commerce maintenance. Mirrors the
 *  charges in onNewYear (year-end levy) and the daily commerce upkeep. */
function stationUpkeepYear(st, s) {
  const infl = inflationOf(st.time.year);
  const building = (s.isDepot ? CFG.DEPOT.yearlyMaint : CFG.STATION.yearlyMaint) * s.level * infl;
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
    if (t && t.co === co.id && !t.elec) {
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
    if (t && t.co === co.id && !t.elec) t.elec = true;
  }
  // lines whose whole path is now electrified qualify as electrified
  for (const l of st.lines) {
    if (l.alive && l.co === co.id) l.elec = l.path.every(hx => st.hexes[hx].track && st.hexes[hx].track.elec);
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

/** True if a build/demolish job touches hex idx (track jobs list hexes;
 *  demolition jobs carry a single hex). */
function buildTouchesHex(b, idx) {
  return b.kind === "demolish" ? b.hex === idx : !!(b.hexes && b.hexes.includes(idx));
}
/** True if any construction or demolition job is already pending on hex idx. */
function hexHasPendingWork(st, idx) {
  return st.builds.some(b => buildTouchesHex(b, idx));
}

/** Why this hex's track can't be demolished/redeveloped by co, or null if it can. */
function canRedevelop(st, co, idx) {
  const h = st.hexes[idx];
  if (!h.track || h.track.co !== co.id) return "Demolish works only on your own track.";
  if (h.owner !== co.id) return "You must own this parcel.";
  if (h.stations.some(sid => st.stations[sid] && st.stations[sid].alive)) return "Remove the station on this hex first.";
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
function enqueueDemolish(st, co, idx, develop, hadTrack, days) {
  st.builds.push({ kind: "demolish", co: co.id, hex: idx, develop: develop || null,
    hadTrack: !!hadTrack, total: Math.max(1, days), progress: 0 });
}

/** Apply a finished demolition job: remove track (and any lines using it) and/or
 *  the existing building, then raise the new development if one was ordered. */
function finishDemolish(st, job) {
  const h = st.hexes[job.hex];
  const co = st.companies[job.co];
  let removedLines = 0;
  if (job.hadTrack && h.track) {
    const affected = linesUsingHex(st, job.hex);
    removedLines = affected.length;
    for (const l of affected) removeLine(st, st.companies[l.co], l.id);
    h.track = null;
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

/** Begin demolishing your track on idx (optionally redeveloping it afterwards).
 *  Track and lines keep running until the work completes. */
function demolishTrack(st, co, idx, consType) {
  const why = canRedevelop(st, co, idx);
  if (why) return { ok: false, msg: why };
  const spec = consType ? CFG.DEVELOP.builds[consType] : null;
  if (consType && !spec) return { ok: false, msg: "Unknown development type." };
  const q = redevelopCost(st, co, idx, consType, true);
  if (co.cash < q.total) return { ok: false, msg: "Need " + fmtYen(q.total) + "." };
  co.cash -= q.total;
  const days = redevelopDays(st, idx, consType, true);
  enqueueDemolish(st, co, idx, consType, true, days);
  const affected = linesUsingHex(st, idx);
  if (co.isPlayer) logEvent(st, (consType ? "Redevelopment" : "Demolition") + " started on hex #" +
    st.hexes[idx].spiral + " (~" + days + " days" + (affected.length ? ", " + affected.length + " line(s) will be removed" : "") + ").");
  return { ok: true, cost: q.total, days, removedLines: affected.length,
    rentPerYear: spec ? estimatedRentYear(st, st.hexes[idx].value || landPrice(st, idx), spec.dev) : 0 };
}

/** Compatibility wrapper: demolish track and redevelop into consType. */
function demolishAndDevelop(st, co, idx, consType) {
  return demolishTrack(st, co, idx, consType);
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
    level: asStation ? co.stationDefaults.level : 1,
    cars: asStation ? co.stationDefaults.cars : 3,
    name: (h.name || ("Sta #" + h.spiral)) + " Depot", builtYear: st.time.year,
    board: 0, alive: true, building: CFG.DEPOT.buildDays,
    isDepot: true, depotAsStation: !!asStation,
    commerce: 0, commerceBuilding: 0, commercePending: 0,
    levelBuilding: 0, levelPending: 0, platBuilding: 0, platPending: 0,
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

/** Scrap a depot-stored train for its resale value. */
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
    : +(CFG.PAX.defaultFarePerKm * inflationOf(st.time.year)).toFixed(2);
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
function lineWaypointPath(st, co, waypoints, loop) {
  if (!waypoints || waypoints.length < 2) return { error: "A line needs at least 2 stations." };
  if (loop && waypoints.length < 3) return { error: "A loop line needs at least 3 stations." };
  const full = [];
  const hops = loop ? waypoints.length : waypoints.length - 1;   // loop adds the closing hop back to start
  for (let k = 0; k < hops; k++) {
    const a = st.stations[waypoints[k]], b = st.stations[waypoints[(k + 1) % waypoints.length]];
    if (!a || !b) return { error: "Unknown station in the route." };
    const seg = trackPath(st, co, a.hex, b.hex);
    if (!seg) return { error: a.name + " and " + b.name + " aren't connected by usable track (check gauge/rights)." };
    if (k === 0) full.push(...seg);
    else full.push(...seg.slice(1));        // drop the shared junction hex
  }
  return { path: full };
}

/** All this company's operating line-stop stations lying on a hex path, in
 *  path order (deduplicated). */
function lineStationsOnPath(st, co, path) {
  const out = [];
  for (const hx of path) {
    for (const sid of st.hexes[hx].stations) {
      const s = st.stations[sid];
      if (s.co === co.id && isLineStop(s) && !out.includes(sid)) out.push(sid);
    }
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
    stops[sid] = type === "local" || st.stations[sid].level >= 2;
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
  const r = lineWaypointPath(st, co, waypoints, loop);
  if (r.error) return { ok: false, msg: r.error };
  const path = r.path;
  const stationsOnPath = lineStationsOnPath(st, co, path);
  if (stationsOnPath.length < 2) return { ok: false, msg: "Line needs 2+ stations on its route." };
  const wpSet = new Set(waypoints);
  const stops = defaultStops(st, stationsOnPath, wpSet, type);
  const gaugeMm = CFG.GAUGES[st.hexes[path[0]].track.gauge].mm;
  const elec = path.every(hx => st.hexes[hx].track.elec);
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
  const r = lineWaypointPath(st, co, waypoints, loop);
  if (r.error) return { ok: false, msg: r.error };
  const path = r.path;
  const stationsOnPath = lineStationsOnPath(st, co, path);
  if (stationsOnPath.length < 2) return { ok: false, msg: "Line needs 2+ stations on its route." };
  const wpSet = new Set(waypoints);
  line.path = path;
  line.stations = stationsOnPath;
  line.stops = defaultStops(st, stationsOnPath, wpSet, type || line.type, line.stops);
  line.waypoints = waypoints.slice();
  line.loop = !!loop;
  line.gaugeMm = CFG.GAUGES[st.hexes[path[0]].track.gauge].mm;
  line.elec = path.every(hx => st.hexes[hx].track.elec);
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

function processBuilds(st) {
  // one simulated day represents ~52 calendar days of construction work,
  // slowed when the builder is short-staffed (underpaying the going wage)
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  for (let b = st.builds.length - 1; b >= 0; b--) {
    const job = st.builds[b];
    const jco = st.companies[job.co];
    // demolition / redevelopment: the track (and any building) stays in place and
    // usable until the teardown completes, then it's cleared and (optionally) the
    // parcel is redeveloped into rent-earning property.
    if (job.kind === "demolish") {
      job.progress += span * ((jco && jco._buildSpeed) || 1);
      if (job.progress >= job.total) {
        finishDemolish(st, job);
        st.builds.splice(b, 1);
      }
      continue;
    }
    job.progress += span * ((jco && jco._buildSpeed) || 1);
    while (job.progress >= job.daysPerHex && job.done < job.hexes.length) {
      job.progress -= job.daysPerHex;
      const i = job.hexes[job.done++];
      const h = st.hexes[i];
      const ter = CFG.TERRAIN[h.terrain];
      h.track = { co: job.co, gauge: job.gauge, elec: !!job.elec, tunnel: !!ter.needsTunnel, dmg: 0 };
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
    // station level expansion — the new level (catchment/major-stop bonus)
    // switches on when the work finishes; the station ran throughout
    if (s.alive && s.levelBuilding > 0) {
      const sco = st.companies[s.co];
      s.levelBuilding = Math.max(0, s.levelBuilding - span * ((sco && sco._buildSpeed) || 1));
      if (!s.levelBuilding && s.levelPending) {
        s.level = s.levelPending; s.levelPending = 0;
        st.od.dirty = true;
        if (sco && sco.isPlayer) logEvent(st, "Station expanded: " + s.name + " is now level " + s.level + ".");
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
