/* =========================================================================
 * save.js — Persistence: localStorage autosave/manual save and
 * export/import as compact human-readable JSON. Imports are validated and
 * sanitized (structural whitelist, numeric clamping, string limits) so a
 * hostile save file can't break or script the game. Terrain is regenerated
 * deterministically from the seed; only mutable state is stored.
 * ========================================================================= */
"use strict";

// NOTE: append-only — indices are persisted in saves (office_s/office_l added v0.5.5)
const CONS_KEYS = [null, "rice", "road", "house", "apartment", "shop", "school", "civic", "office_s", "office_l"];
const GAUGE_KEYS = ["narrow", "industrial", "scotch", "standard"];

function serializeGame(st) {
  const consIdx = c => Math.max(0, CONS_KEYS.indexOf(c));
  const hx = { cons: [], dev: [], own: [], vb: [], occ: [], trk: [], rec: [], kr: [], cy: [], tr: [] };
  for (let i = 0; i < st.hexes.length; i++) {
    const h = st.hexes[i];
    hx.cons.push(consIdx(h.cons));
    hx.dev.push(h.dev | 0);
    hx.own.push(h.owner);
    hx.vb.push(Math.round((h.valueBoost || 1) * 100));
    hx.occ.push(h.occ === undefined ? -1 : Math.round(h.occ * 100));   // v0.5.5: occupancy (−1 = unset)
    if (h.consYear !== undefined) hx.cy.push([i, h.consYear]);   // v13: building vintage (sparse)
    if (h.track && h.track.rights && h.track.rights.length) hx.tr.push([i, h.track.rights]);   // v13: per-hex trackage rights (sparse)
    if (h.reclaimed) hx.rec.push(i);   // v9: filled-in water (terrain regen would drown it)
    if (h.kaido && h.kaido.rights && h.kaido.rights.length) hx.kr.push([i, h.kaido.rights]);   // v9: crossing rights (kaidō itself regenerates from seed; state re-derives from year)
    if (h.track) {
      // element [6] = all rails [gaugeIdx, elec, building]; [2]/[3] mirror rails[0] for older loaders
      // element [7] (v8) = year built / last renewed (seismic era factor)
      const rails = trackRailList(h.track).map(r => [GAUGE_KEYS.indexOf(r.gauge), r.elec ? 1 : 0, r.building ? 1 : 0]);
      hx.trk.push([i, h.track.co, GAUGE_KEYS.indexOf(h.track.gauge), h.track.elec ? 1 : 0, h.track.tunnel ? 1 : 0, h.track.dmg | 0, rails, h.track.built | 0]);
    }
  }
  return {
    v: CFG.SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: st.seed,
    campaign: st.campaign || "tokyo",
    playerClass: st.playerClass || CFG.DEFAULT_PLAYER_CLASS,
    time: { sec: st.time.sec, totalDays: st.time.totalDays },
    econ: st.econ,
    rng: { ai: st.aiRng.n, ev: st.evRng.n, gr: st.growthRng.n },
    hx,
    companies: st.companies.map(c => ({
      name: c.name, color: c.color, isPlayer: c.isPlayer, founded: c.founded,
      cash: Math.round(c.cash), gauge: c.gauge, elecDefault: c.elecDefault,
      stationDefaults: { cars: c.stationDefaults.cars },
      defaultFarePerKm: c.defaultFarePerKm, defaultFareSet: !!c.defaultFareSet,
      serviceCharge: c.serviceCharge, serviceChargeSet: !!c.serviceChargeSet,   // v13
      land: c.land, rights: c.rights, alive: c.alive,
      playerClass: c.playerClass || null, debt: Math.round(c.debt || 0), rate: c.rate,
      creditFactor: c.creditFactor, taxArrears: Math.round(c.taxArrears || 0),
      delinquentYears: c.delinquentYears | 0,
      wageLevel: c.wageLevel, morale: c.morale, reputation: c.reputation,
      awards: c.awards || [], strikeDays: Math.round(c._strikeDays || 0),
      research: c.research ? { done: c.research.done.slice(),
        active: c.research.active ? { key: c.research.active.key,
          stdDaysLeft: Math.round(c.research.active.stdDaysLeft),
          stdCost: Math.round(c.research.active.stdCost || 0),
          fund: c.research.active.fund || 1, leaked: !!c.research.active.leaked } : null,
        leased: c.research.leased || {} } : null,
      stats: { paxAvg: Math.round(c.stats.paxAvg), revYear: Math.round(c.stats.revYear),
               costYear: Math.round(c.stats.costYear), lastLevy: c.stats.lastLevy || null,
               history: c.stats.history.slice(-160) },
      ai: c.ai ? { plan: c.ai.plan || null, difficulty: c.ai.difficulty || CFG.AI.DEFAULT_DIFFICULTY } : null,
    })),
    pendingAI: st.pendingAI,
    stations: st.stations.map(s => ({ co: s.co, hex: s.hex, cars: s.cars,
      name: s.name, builtYear: s.builtYear, alive: s.alive, building: s.building | 0,
      isDepot: !!s.isDepot, depotAsStation: !!s.depotAsStation,
      commerce: s.commerce | 0, commerceBuilding: Math.round(s.commerceBuilding || 0),
      commercePending: s.commercePending | 0, boardAvg: Math.round(s.boardAvg || 0),
      platBuilding: Math.round(s.platBuilding || 0), platPending: s.platPending | 0,
      renewed: s.renewed | 0, taishin: s.taishin | 0,
      taishinBuilding: Math.round(s.taishinBuilding || 0), taishinPending: s.taishinPending | 0 })),
    lines: st.lines.map(l => ({ co: l.co, name: l.name, path: l.path, stations: l.stations,
      stops: l.stops, waypoints: l.waypoints || null, type: l.type, loop: !!l.loop,
      fare: l.fare, fareOverride: !!l.fareOverride, gaugeMm: l.gaugeMm, elec: l.elec,
      trains: l.trains, desirability: l.desirability, alive: l.alive,
      svc: l.svc || { pattern: "all_stops", rush: false, span: "full" } })),   // v0.5.8 F3
    trains: st.trains.map(t => ({ co: t.co, line: t.line, type: t.type, cars: t.cars, bought: t.bought | 0, alive: t.alive, stored: !!t.stored })),
    builds: st.builds,
    events: { log: st.events.log.slice(-120), active: st.events.active, majors: st.events.majors,
              deck: st.events.deck },                  // v13: hazard-deck history
    war: st.war,                                       // v8: randomized major-war state
    deals: st.deals || [],                             // v13: negotiable-deal state
  };
}

/* ---- validation helpers ---- */
function vNum(x, lo, hi, dflt) {
  x = +x;
  return Number.isFinite(x) ? clamp(x, lo, hi) : dflt;
}
function vInt(x, lo, hi, dflt) { return Math.round(vNum(x, lo, hi, dflt)); }
function vStr(x, maxLen) {
  if (typeof x !== "string") return "";
  // strip control characters; rendering always uses textContent, never innerHTML
  return x.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLen);
}
function vBool(x) { return !!x; }
function vIntArr(a, lo, hi) {
  if (!Array.isArray(a)) return [];
  return a.map(x => vInt(x, lo, hi, lo)).filter(x => x >= lo && x <= hi);
}

/** Rebuild a full game state from a (possibly hostile) parsed save object. Throws on garbage. */
function deserializeGame(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Not a save file.");
  // Accept this and older save versions. Each version only adds fields, and
  // every field is read defensively with a default below, so older saves load
  // cleanly (newly-added features simply start at their default value).
  const sv = +obj.v;
  if (!Number.isFinite(sv)) throw new Error("Unsupported save version.");
  if (sv < CFG.SAVE_MIN_VERSION) {
    throw new Error("This save is from an earlier version of the game — v0.5.1 reshaped the map " +
      "(rivers, coastline, London roads), so old saves can't be continued. Please start a new game.");
  }
  if (sv > CFG.SAVE_VERSION) throw new Error("Save is from a newer version of the game.");
  const seed = vInt(obj.seed, 1, 2 ** 31, 12345);
  const N = CFG.MAP_W * CFG.MAP_H;
  // v12 (v0.5.6): campaign is an open key validated against the registry —
  // unknown keys fall back to Tokyo rather than being trusted
  const campaign = campaignOf(obj.campaign).key === obj.campaign ? obj.campaign : "tokyo";
  const camp = campaignOf(campaign);
  // Each city's saves are only loadable from the schema whose map generator
  // matches (London reshaped at v11; NYC/Melbourne exist from v12). Tokyo
  // generation is untouched, so old Tokyo saves keep loading.
  if (sv < (camp.saveMinVersion || CFG.SAVE_MIN_VERSION)) {
    throw new Error("This " + camp.title + " save is from an earlier version of the game — the " +
      camp.title + " map has since been reshaped, so it can't be continued. Please start a new game.");
  }
  // holding a save of a locked campaign proves it was earned: unlock it on
  // the start screen even in a fresh browser (defined in ui.js; absent headless)
  if (camp.unlock && typeof unlockCampaignBySave === "function") unlockCampaignBySave(campaign);
  const st = freshState(seed, campaign);                         // regenerate the right terrain from seed
  st.campaign = campaign;
  st.playerClass = CFG.PLAYER_CLASSES[obj.playerClass] ? obj.playerClass : CFG.DEFAULT_PLAYER_CLASS;

  st.time.sec = vNum(obj.time && obj.time.sec, 0, 1e9, 0);
  st.time.totalDays = vInt(obj.time && obj.time.totalDays, 0, 1e6, 0);
  syncClock(st);
  setCurrency(campaignCurrency(st));   // money strings follow the campaign (and Melbourne's 1966 changeover)

  const e = obj.econ || {};
  st.econ.cycle = vNum(e.cycle, 0.5, 2, 1);
  st.econ.paxMult = vNum(e.paxMult, 0.1, 2, 1);
  st.econ.commuteFactor = vNum(e.commuteFactor, 0.5, 1, 1);
  st.econ.landBubble = vNum(e.landBubble, 0.5, 3, 1);
  st.econ.demandIndex = vNum(e.demandIndex, 0, 10, 0);
  // v8: inflation drivers
  st.econ.rebuild = e.rebuild && typeof e.rebuild === "object"
    ? { years: vInt(e.rebuild.years, 0, 10, 0), k: vNum(e.rebuild.k, 0, 2, 1) } : null;
  st.econ.postwar = e.postwar && typeof e.postwar === "object"
    ? { years: vInt(e.postwar.years, 0, 10, 0), peak: vNum(e.postwar.peak, 0, 1, 0.5) } : null;
  // v8: causal price level & the small recent-year history inflationOf reads.
  // A pre-v8 save (or a corrupt one) has no level: synthesize one from the
  // baseline drift up to the loaded year so costs stay on scale.
  const loadedYear = st.time.year;
  if (Number.isFinite(+e.priceLevel) && +e.priceLevel >= CFG.INFLATION.base) {
    st.econ.priceLevel = clamp(+e.priceLevel, CFG.INFLATION.base, 1e6);
    st.econ.priceHist = {};
    if (e.priceHist && typeof e.priceHist === "object") {
      for (const k in e.priceHist) {
        const yr = +k, lv = +e.priceHist[k];
        if (Number.isFinite(yr) && Number.isFinite(lv) && lv >= CFG.INFLATION.base) st.econ.priceHist[yr] = lv;
      }
    }
  } else {
    st.econ.priceLevel = CFG.INFLATION.base *
      Math.pow(1 + CFG.INFLATION.driftPerYear, Math.max(0, loadedYear - CFG.START_YEAR));
    st.econ.priceHist = {};
  }
  // guarantee the two years inflationOf will ask for are present
  st.econ.priceHist[CFG.START_YEAR] = st.econ.priceHist[CFG.START_YEAR] || CFG.INFLATION.base;
  st.econ.priceHist[loadedYear] = st.econ.priceLevel;
  if (st.econ.priceHist[loadedYear - 1] === undefined) {
    st.econ.priceHist[loadedYear - 1] = st.econ.priceLevel / (1 + CFG.INFLATION.driftPerYear);
  }
  // v8: major-war state (at most one per playthrough)
  const w = obj.war;
  st.war = w && typeof w === "object" ? {
    active: vBool(w.active), happened: vBool(w.happened),
    startYear: vInt(w.startYear, 1800, 2100, 1900),
    years: vInt(w.years, 1, 10, 5), peak: vNum(w.peak, 0, 1, 0.5),
    profile: (Array.isArray(w.profile) ? w.profile.slice(0, 10) : []).map(v => vNum(v, 0, 1, 0)),
    yearIdx: vInt(w.yearIdx, 0, 10, 0), inten: vNum(w.inten, 0, 1, 0),
  } : null;
  const r = obj.rng || {};
  st.aiRng.n = vInt(r.ai, 0, 2 ** 32, seed) >>> 0;
  st.evRng.n = vInt(r.ev, 0, 2 ** 32, seed) >>> 0;
  st.growthRng.n = vInt(r.gr, 0, 2 ** 32, seed) >>> 0;

  // companies (max 12)
  st.companies = [];
  const cos = Array.isArray(obj.companies) ? obj.companies.slice(0, 12) : [];
  for (const c of cos) {
    const co = createCompany(st, {
      name: vStr(c.name, 48) || "Company", color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : "#888888",
      isPlayer: vBool(c.isPlayer), founded: vInt(c.founded, 1800, 2100, 1872),
      cash: vNum(c.cash, -1e12, 1e13, 0), gauge: GAUGE_KEYS.includes(c.gauge) ? c.gauge : "narrow",
    });
    co.elecDefault = vBool(c.elecDefault);
    const sd = c.stationDefaults || {};
    co.stationDefaults = {
      cars: vInt(sd.cars, 1, 15, 3),
    };
    co.defaultFarePerKm = vNum(c.defaultFarePerKm, 0, 1e6, co.defaultFarePerKm);
    co.defaultFareSet = vBool(c.defaultFareSet);
    // v13: per-company flat service charge. Pre-v13 saves seed it from the base
    // × inflation at the company's founding year, matching defaultFarePerKm.
    co.serviceCharge = Number.isFinite(+c.serviceCharge)
      ? vNum(c.serviceCharge, 0, 1e6, 0)
      : CFG.PAX.serviceChargeBase * inflationOf(st, co.founded);
    co.serviceChargeSet = vBool(c.serviceChargeSet);
    co.land = vIntArr(c.land, 0, N - 1);
    co.rights = vIntArr(c.rights, 0, 11);
    co.alive = vBool(c.alive);
    // v9: credit line & tax standing
    co.playerClass = CFG.PLAYER_CLASSES[c.playerClass] ? c.playerClass : null;
    const terms = classTermsOf(co.playerClass);
    co.debt = vNum(c.debt, 0, 1e13, 0);
    co.rate = vNum(c.rate, 0, 1, terms.rate);
    co.creditFactor = vNum(c.creditFactor, 0, 2, terms.creditFactor);
    co.taxArrears = vNum(c.taxArrears, 0, 1e13, 0);
    co.delinquentYears = vInt(c.delinquentYears, 0, 10, 0);
    co.wageLevel = vNum(c.wageLevel, CFG.HR.wageLevelMin, CFG.HR.wageLevelMax, CFG.HR.wageLevelDefault);
    co.morale = vNum(c.morale, 0, 1, CFG.HR.moraleDefault);
    co.reputation = vNum(c.reputation, 0, 1, 0.5);
    co.awards = (Array.isArray(c.awards) ? c.awards.slice(0, 40) : []).map(k => vStr(k, 24)).filter(Boolean);
    co._strikeDays = vNum(c.strikeDays, 0, 3650, 0);
    // R&D (v8, extended v0.6): only whitelist real tech keys (researchable or
    // industry-standard); ignore a bad/finished active; keep licence records
    const rs = c.research || {};
    const done = (Array.isArray(rs.done) ? rs.done : []).filter(k => techSpec(k));
    let active = null;
    if (rs.active && RND_TECHS[rs.active.key] && !done.includes(rs.active.key)) {
      const key = rs.active.key, total = researchDays(key);
      const fund = vNum(rs.active.fund, 0.25, 4, 1);
      // stdDaysLeft is the new (monthly-funding) field; migrate a pre-monthly
      // save's fund-shortened daysLeft back to standard-days (daysLeft × fund).
      const stdLeft = rs.active.stdDaysLeft !== undefined
        ? vNum(rs.active.stdDaysLeft, 0, total, total)
        : clamp(vNum(rs.active.daysLeft, 0, 8000, total) * fund, 0, total);
      const stdCost = vNum(rs.active.stdCost, 0, 1e12, researchCost(st, key));
      active = { key, fund, stdDaysLeft: stdLeft, stdCost, leaked: vBool(rs.active.leaked) };
    }
    const leased = {};
    if (rs.leased && typeof rs.leased === "object") {
      for (const k in rs.leased) if (RND_TECHS[k] && done.includes(k)) leased[k] = vInt(rs.leased[k], 0, 11, 0);
    }
    co.research = { done, active, leased };
    const s = c.stats || {};
    co.stats.paxAvg = vNum(s.paxAvg, 0, 1e8, 0);
    co.stats.revYear = vNum(s.revYear, 0, 1e12, 0);
    co.stats.costYear = vNum(s.costYear, 0, 1e12, 0);
    const lv = s.lastLevy || {};
    co.stats.lastLevy = { tax: vNum(lv.tax, 0, 1e13, 0), upkeep: vNum(lv.upkeep, 0, 1e13, 0) };
    co.stats.history = (Array.isArray(s.history) ? s.history.slice(-160) : []).map(h => ({
      year: vInt(h.year, 1800, 2100, 1872), cash: vNum(h.cash, -1e12, 1e13, 0),
      pax: vNum(h.pax, 0, 1e8, 0), profit: vNum(h.profit, -1e12, 1e12, 0),
    }));
    co.stats.morale = co.morale;
    if (co.ai && c.ai) {
      if (c.ai.plan) co.ai.plan = { a: vInt(c.ai.plan.a, 0, N - 1, 0), b: vInt(c.ai.plan.b, 0, N - 1, 0) };
      if (CFG.AI.DIFFICULTIES[c.ai.difficulty]) co.ai.difficulty = c.ai.difficulty;
    }
  }
  st.pendingAI = (Array.isArray(obj.pendingAI) ? obj.pendingAI.slice(0, 8) : []).map(p => ({
    year: vInt(p.year, 1800, 2100, 1900), name: vStr(p.name, 48), color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : "#888888",
    difficulty: CFG.AI.DIFFICULTIES[p.difficulty] ? p.difficulty : CFG.AI.DEFAULT_DIFFICULTY,
  }));

  // hex overlay
  const hx = obj.hx || {};
  for (let i = 0; i < N; i++) {
    const h = st.hexes[i];
    h.cons = CONS_KEYS[vInt(hx.cons && hx.cons[i], 0, CONS_KEYS.length - 1, 0)];
    h.dev = vInt(hx.dev && hx.dev[i], 0, 5, 0);
    h.owner = vInt(hx.own && hx.own[i], -4, st.companies.length - 1, -1);   // -2 = private holdout, -3 = government kaidō, -4 = public building
    h.valueBoost = vNum(hx.vb && hx.vb[i], 50, 600, 100) / 100;
    const occ = vInt(hx.occ && hx.occ[i], -1, 100, -1);                     // v0.5.5: occupancy (−1 = unset)
    if (occ >= 0) h.occ = occ / 100; else delete h.occ;
    h.track = null; h.stations = [];
    // v0.5.5 migration: unowned map-seeded schools/civic halls become public
    // land (pre-v0.5.5 saves stored them as ordinary market parcels)
    if ((h.cons === "school" || h.cons === "civic") && h.owner === -1) h.owner = -4;
  }
  // v9: reclaimed water — regeneration drowned these hexes; raise them again
  for (const i of vIntArr(hx.rec, 0, N - 1)) {
    const h = st.hexes[i];
    if (CFG.TERRAIN[h.terrain].reclaimable) { h.terrain = "grass"; h.reclaimed = true; }
  }
  // v9: kaidō crossing rights — the corridors themselves regenerate from the
  // seed; only who holds rights on which hex is mutable state
  for (const kr of (Array.isArray(hx.kr) ? hx.kr : [])) {
    if (!Array.isArray(kr)) continue;
    const i = vInt(kr[0], 0, N - 1, 0), h = st.hexes[i];
    if (h.kaido) h.kaido.rights = vIntArr(kr[1], 0, st.companies.length - 1);
  }
  updateKaido(st);                      // re-derive road state (dirt/paved/highway) from the year
  for (const t of (Array.isArray(hx.trk) ? hx.trk : [])) {
    if (!Array.isArray(t)) continue;
    const i = vInt(t[0], 0, N - 1, 0), co = vInt(t[1], 0, st.companies.length - 1, 0);
    // rails: prefer the explicit per-rail list [gaugeIdx, elec, building]; older
    // saves (no element [6]) carry a single rail described by [2]/[3]
    let rails = null;
    if (Array.isArray(t[6]) && t[6].length) {
      rails = t[6].filter(Array.isArray).map(r => ({ gauge: GAUGE_KEYS[vInt(r[0], 0, 3, 0)], elec: !!r[1], building: !!r[2] }));
    }
    if (!rails || !rails.length) rails = [{ gauge: GAUGE_KEYS[vInt(t[2], 0, 3, 0)], elec: !!t[3], building: false }];
    st.hexes[i].track = { co, gauge: rails[0].gauge, elec: rails[0].elec, tunnel: !!t[4], dmg: vInt(t[5], 0, 365, 0), rails,
      // pre-v8 saves carry no build year: old track conservatively counts as
      // un-renewed (repairs and regauging modernize it as the game runs)
      built: vInt(t[7], 1800, 2100, CFG.START_YEAR) };
    st.hexes[i].cons = null; st.hexes[i].dev = 0;
  }
  // v13: per-hex trackage rights (the track objects were rebuilt just above)
  for (const tr of (Array.isArray(hx.tr) ? hx.tr : [])) {
    if (!Array.isArray(tr)) continue;
    const i = vInt(tr[0], 0, N - 1, 0), h = st.hexes[i];
    if (h.track) h.track.rights = vIntArr(tr[1], 0, st.companies.length - 1);
  }
  // v13: building vintage. Restore saved consYear; a pre-v13 parcel that has a
  // building but no recorded vintage is seeded at/near the grace boundary so
  // its upkeep and desirability start neutral (seeding at START_YEAR would
  // triple upkeep across a late-era save on load). Deterministic per-hex jitter.
  const savedCY = new Map();
  for (const cy of (Array.isArray(hx.cy) ? hx.cy : [])) {
    if (!Array.isArray(cy)) continue;
    savedCY.set(vInt(cy[0], 0, N - 1, 0), vInt(cy[1], 1800, 2100, CFG.START_YEAR));
  }
  const graceBoundary = clamp(st.time.year - CFG.LAND.VINT.graceYears, CFG.START_YEAR, st.time.year);
  for (let i = 0; i < N; i++) {
    const h = st.hexes[i];
    if (!h.cons || h.cons === "rice" || h.cons === "road" || h.track || h.stations.length) continue;
    if (savedCY.has(i)) { h.consYear = savedCY.get(i); continue; }
    const jitter = Math.floor((((i * 2654435761) >>> 0) / 4294967296) * 10);
    h.consYear = graceBoundary - jitter;
  }

  // stations / lines / trains (indices preserved; invalid entries become dead)
  st.stations = (Array.isArray(obj.stations) ? obj.stations.slice(0, 2000) : []).map((s, id) => {
    const hex = vInt(s.hex, 0, N - 1, 0);
    const out = {
      id, co: vInt(s.co, 0, st.companies.length - 1, 0), hex,
      cars: vInt(s.cars, 1, 15, 3),
      name: vStr(s.name, 48) || "Sta", builtYear: vInt(s.builtYear, 1800, 2100, 1872),
      board: 0, boardAvg: vNum(s.boardAvg, 0, 1e7, 0),
      alive: vBool(s.alive), building: vInt(s.building, 0, 999, 0),
      isDepot: vBool(s.isDepot), depotAsStation: vBool(s.depotAsStation),
      commerce: vInt(s.commerce, 0, CFG.COMMERCE.levels.length - 1, 0),
      commerceBuilding: vInt(s.commerceBuilding, 0, 99999, 0),
      commercePending: vInt(s.commercePending, 0, CFG.COMMERCE.levels.length - 1, 0),
      platBuilding: vInt(s.platBuilding, 0, 99999, 0),
      platPending: vInt(s.platPending, 0, 15, 0),
      // v8 seismic fields — pre-v8 stations count as built to the code of
      // their day and never renewed since
      renewed: vInt(s.renewed, 1800, 2100, 0) || vInt(s.builtYear, 1800, 2100, 1872),
      taishin: vInt(s.taishin, 0, CFG.TAISHIN.STANDARDS.length,
                    taishinLevel(vInt(s.builtYear, 1800, 2100, 1872))),
      taishinBuilding: vInt(s.taishinBuilding, 0, 99999, 0),
      taishinPending: vInt(s.taishinPending, 0, CFG.TAISHIN.STANDARDS.length, 0),
    };
    if (out.alive) st.hexes[hex].stations.push(id);
    return out;
  });
  st.lines = (Array.isArray(obj.lines) ? obj.lines.slice(0, 500) : []).map((l, id) => {
    const stops = {};
    if (l.stops && typeof l.stops === "object") {
      for (const k of Object.keys(l.stops).slice(0, 200)) stops[vInt(k, 0, st.stations.length - 1, 0)] = !!l.stops[k];
    }
    return {
      id, co: vInt(l.co, 0, st.companies.length - 1, 0), name: vStr(l.name, 48) || "Line",
      path: vIntArr(l.path, 0, N - 1), stations: vIntArr(l.stations, 0, Math.max(0, st.stations.length - 1)),
      stops, waypoints: Array.isArray(l.waypoints) ? vIntArr(l.waypoints, 0, Math.max(0, st.stations.length - 1)) : undefined,
      type: CFG.LINE_TYPES.includes(l.type) ? l.type : "local", loop: vBool(l.loop),
      fare: vNum(l.fare, 0, 1e6, 1), fareOverride: vBool(l.fareOverride),
      gaugeMm: vInt(l.gaugeMm, 600, 1500, 1067), elec: vBool(l.elec),
      trains: [], desirability: vNum(l.desirability, 0.3, 1, 1),
      alive: vBool(l.alive) && Array.isArray(l.path) && l.path.length >= 2,
      capacity: 0, demand: 0, board: 0, served: 0, rev: 0, _coRev: {},
      _savedTrains: vIntArr(l.trains, 0, 99999),
      // v0.5.8 F3: service plan — sane defaults (today's behavior) if missing/invalid
      svc: {
        pattern: l.svc && l.svc.pattern === "skip_stop" ? "skip_stop" : "all_stops",
        rush: !!(l.svc && l.svc.rush),
        span: l.svc && l.svc.span === "daytime" ? "daytime" : "full",
      },
    };
  });
  st.trains = (Array.isArray(obj.trains) ? obj.trains.slice(0, 2000) : []).map((t, id) => ({
    id, co: vInt(t.co, 0, st.companies.length - 1, 0), line: vInt(t.line, -1, Math.max(0, st.lines.length - 1), -1),
    type: CFG.TRAINS[t.type] ? t.type : "steam_local", cars: vInt(t.cars, 1, 15, 3),
    bought: vInt(t.bought, 1800, 2100, st.time.year),
    pos: 0, dir: 1, alive: vBool(t.alive), stored: vBool(t.stored),
  }));
  for (const l of st.lines) { l.trains = l._savedTrains.filter(id => st.trains[id] && st.trains[id].alive && st.trains[id].line === l.id); delete l._savedTrains; }
  // loop lines: restore the alternating circulation (train dir isn't serialized),
  // odd-positioned trains clockwise (+1), even counter-clockwise (−1)
  for (const l of st.lines) {
    if (!l.alive || !l.loop) continue;
    l.trains.forEach((tid, k) => { if (st.trains[tid]) st.trains[tid].dir = k % 2 === 0 ? 1 : -1; });
  }

  const CONS_BUILD_KEYS = Object.keys(CFG.DEVELOP.builds);
  st.builds = (Array.isArray(obj.builds) ? obj.builds.slice(0, 200) : []).map(b => {
    const co = vInt(b.co, 0, st.companies.length - 1, 0);
    if (b.kind === "demolish") {
      return { kind: "demolish", co, hex: vInt(b.hex, 0, N - 1, 0),
        develop: CONS_BUILD_KEYS.includes(b.develop) ? b.develop : null, hadTrack: vBool(b.hadTrack),
        gauge: GAUGE_KEYS.includes(b.gauge) ? b.gauge : null,
        total: vNum(b.total, 1, 1e5, 1), progress: vNum(b.progress, 0, 1e5, 0) };
    }
    if (b.kind === "gauge") {
      return { kind: "gauge", co, hex: vInt(b.hex, 0, N - 1, 0),
        mode: b.mode === "change" ? "change" : "add",
        gauge: GAUGE_KEYS.includes(b.gauge) ? b.gauge : "narrow",
        fromGauge: GAUGE_KEYS.includes(b.fromGauge) ? b.fromGauge : null,
        elec: vBool(b.elec), total: vNum(b.total, 1, 1e5, 1), progress: vNum(b.progress, 0, 1e5, 0) };
    }
    if (b.kind === "reclaim") {
      return { kind: "reclaim", co, hex: vInt(b.hex, 0, N - 1, 0),
        total: vNum(b.total, 1, 1e5, 1), progress: vNum(b.progress, 0, 1e5, 0) };
    }
    if (b.kind === "electrify") {
      return { kind: "electrify", co, hexes: vIntArr(b.hexes, 0, N - 1),
        done: vInt(b.done, 0, 10000, 0), daysPerHex: vNum(b.daysPerHex, 0.1, 1e4, 5),
        progress: vNum(b.progress, 0, 1e5, 0) };
    }
    if (b.kind === "stationdemo") {
      return { kind: "stationdemo", co, sid: vInt(b.sid, 0, Math.max(0, st.stations.length - 1), 0),
        hex: vInt(b.hex, 0, N - 1, 0), total: vNum(b.total, 1, 1e5, 1), progress: vNum(b.progress, 0, 1e5, 0) };
    }
    return { kind: "track", co, hexes: vIntArr(b.hexes, 0, N - 1),
      done: vInt(b.done, 0, 10000, 0), daysPerHex: vNum(b.daysPerHex, 0.1, 1e4, 5),
      progress: vNum(b.progress, 0, 1e5, 0), gauge: GAUGE_KEYS.includes(b.gauge) ? b.gauge : "narrow", elec: vBool(b.elec) };
  }).filter(b => (b.kind !== "track" && b.kind !== "electrify") || b.hexes.length);

  const ev = obj.events || {};
  st.events.log = (Array.isArray(ev.log) ? ev.log.slice(-120) : []).map(l => ({
    year: vInt(l.year, 1800, 2100, 1872), day: vInt(l.day, 0, 365, 0),
    text: vStr(l.text, 300), kind: ["info", "event", "major"].includes(l.kind) ? l.kind : "info",
  }));
  st.events.active = (Array.isArray(ev.active) ? ev.active.slice(0, 20) : []).map(a => {
    const days = vInt(a.days, 1, 3650, 30);
    return {
      name: vStr(a.name, 60), text: vStr(a.text, 300), major: vBool(a.major),
      paxMult: vNum(a.paxMult, 0.1, 2, 1), days,
      pandemic: vBool(a.pandemic),   // v13: an active pandemic still suppresses population on load
      // v7: recovery-curve fields — older saves default to a linear recovery
      // over whatever duration remained
      total: vInt(a.total, 1, 3650, 0) || days,
      curve: ["hold", "slow", "fast", "linear"].includes(a.curve) ? a.curve : "linear",
    };
  });
  st.events.majors = vIntArr(ev.majors, 1800, 2100);
  // v13: hazard-deck history. Absent on older saves → start fresh. We do NOT
  // retro-credit the old scripted 1986/1991/2020 events, EXCEPT: a save whose
  // commuteFactor is already below 1 lived through the scripted 2020 pandemic,
  // so mark one pandemic (lastYear 2020) to stop it re-rolling immediately.
  const dk = (ev.deck && typeof ev.deck === "object") ? ev.deck : {};
  const restoreSlot = (o, extra) => {
    o = (o && typeof o === "object") ? o : {};
    const base = { count: vInt(o.count, 0, 20, 0),
      lastYear: Number.isFinite(+o.lastYear) ? vInt(o.lastYear, -1e6, 2100, -Infinity) : -Infinity };
    return extra ? Object.assign(base, extra(o)) : base;
  };
  st.events.deck = {
    pandemic: restoreSlot(dk.pandemic),
    panic: restoreSlot(dk.panic),
    bubble: restoreSlot(dk.bubble, o => ({
      phase: o.phase === "mania" ? "mania" : null,
      peak: vNum(o.peak, 1, 3, 1), target: vNum(o.target, 1, 3, 1),
      atPeak: vBool(o.atPeak), ramp: vNum(o.ramp, 0, 2, 0),
    })),
  };
  if (!dk.pandemic && st.econ.commuteFactor < 1) {
    st.events.deck.pandemic.count = 1;
    st.events.deck.pandemic.lastYear = 2020;
  }
  recomputeEventMods(st);

  // v13: negotiable-deal state (open offers / cooldowns / insult flags)
  st.deals = (Array.isArray(obj.deals) ? obj.deals.slice(0, 200) : []).map(d => ({
    asker: vInt(d.asker, -1, st.companies.length - 1, -1),
    target: vInt(d.target, 0, st.companies.length - 1, 0),
    kind: ["hex", "company", "rights", "hexRights"].includes(d.kind) ? d.kind : "hex",
    key: Array.isArray(d.key) ? vIntArr(d.key, 0, N - 1) : (Number.isFinite(+d.key) ? vInt(d.key, 0, N - 1, 0) : null),
    offer: vNum(d.offer, 0, 1e13, 0), counter: vNum(d.counter, 0, 1e13, 0),
    year: vInt(d.year, 1800, 2100, st.time.year),
    state: ["open", "rejected", "insulted"].includes(d.state) ? d.state : "open",
  })).filter(d => d.target >= 0);

  // recompute derived values
  for (const co of st.companies) for (const i of co.land) st.hexes[i].value = landPrice(st, i);
  updateLaborMarket(st);              // labor market for the loaded era
  refreshWorkforceDerived(st);        // headcount / op-cost / productivity (no morale drift)
  // v13: city attractiveness. Restore a saved snapshot if present; otherwise
  // (older save) recompute it once from the reconstructed world so population
  // has a sane basis on the first new year.
  const ea = obj.econ && obj.econ.attract;
  if (ea && typeof ea === "object") {
    st.econ.attract = {
      transit: vNum(ea.transit, 0, 3, 1), housing: vNum(ea.housing, 0, 3, 1),
      jobs: vNum(ea.jobs, 0, 3, 1), congestion: vNum(ea.congestion, 0, 1, 1),
      afford: vNum(ea.afford, 0, 2, 1), overall: vNum(ea.overall, CFG.ATTRACT.overallMin, CFG.ATTRACT.overallMax, 1),
    };
  } else {
    updateAttractiveness(st);
  }
  st.od.dirty = true;
  st.renderDirty = true;
  return st;
}

/* ---- storage / files ---- */
function saveToLocal(st, slot) {
  try {
    localStorage.setItem(CFG.SAVE_KEY + (slot || ""), JSON.stringify(serializeGame(st)));
    return true;
  } catch (e) { console.warn("Save failed:", e); return false; }
}
function loadFromLocal(slot) {
  const raw = localStorage.getItem(CFG.SAVE_KEY + (slot || ""));
  if (!raw) return null;
  return deserializeGame(JSON.parse(raw));
}
function exportSaveString(st) { return JSON.stringify(serializeGame(st)); }
function importSaveString(str) {
  if (typeof str !== "string" || str.length > 8e6) throw new Error("File too large.");
  return deserializeGame(JSON.parse(str));
}
