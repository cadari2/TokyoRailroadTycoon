/* =========================================================================
 * save.js — Persistence: localStorage autosave/manual save and
 * export/import as compact human-readable JSON. Imports are validated and
 * sanitized (structural whitelist, numeric clamping, string limits) so a
 * hostile save file can't break or script the game. Terrain is regenerated
 * deterministically from the seed; only mutable state is stored.
 * ========================================================================= */
"use strict";

const CONS_KEYS = [null, "rice", "road", "house", "apartment", "shop", "school", "civic"];
const GAUGE_KEYS = ["narrow", "industrial", "scotch", "standard"];

function serializeGame(st) {
  const consIdx = c => Math.max(0, CONS_KEYS.indexOf(c));
  const hx = { cons: [], dev: [], own: [], vb: [], trk: [] };
  for (let i = 0; i < st.hexes.length; i++) {
    const h = st.hexes[i];
    hx.cons.push(consIdx(h.cons));
    hx.dev.push(h.dev | 0);
    hx.own.push(h.owner);
    hx.vb.push(Math.round((h.valueBoost || 1) * 100));
    if (h.track) hx.trk.push([i, h.track.co, GAUGE_KEYS.indexOf(h.track.gauge), h.track.elec ? 1 : 0, h.track.tunnel ? 1 : 0, h.track.dmg | 0]);
  }
  return {
    v: CFG.SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: st.seed,
    time: { sec: st.time.sec, totalDays: st.time.totalDays },
    econ: st.econ,
    rng: { ai: st.aiRng.n, ev: st.evRng.n, gr: st.growthRng.n },
    hx,
    companies: st.companies.map(c => ({
      name: c.name, color: c.color, isPlayer: c.isPlayer, founded: c.founded,
      cash: Math.round(c.cash), gauge: c.gauge, elecDefault: c.elecDefault,
      stationDefaults: { level: c.stationDefaults.level, cars: c.stationDefaults.cars },
      land: c.land, rights: c.rights, alive: c.alive,
      wageLevel: c.wageLevel, morale: c.morale, reputation: c.reputation,
      awards: c.awards || [], strikeDays: Math.round(c._strikeDays || 0),
      stats: { paxAvg: Math.round(c.stats.paxAvg), revYear: Math.round(c.stats.revYear),
               costYear: Math.round(c.stats.costYear), lastLevy: c.stats.lastLevy || null,
               history: c.stats.history.slice(-160) },
      ai: c.ai ? { plan: c.ai.plan || null, difficulty: c.ai.difficulty || CFG.AI.DEFAULT_DIFFICULTY } : null,
    })),
    pendingAI: st.pendingAI,
    stations: st.stations.map(s => ({ co: s.co, hex: s.hex, level: s.level, cars: s.cars,
      name: s.name, builtYear: s.builtYear, alive: s.alive, building: s.building | 0,
      isDepot: !!s.isDepot, depotAsStation: !!s.depotAsStation,
      commerce: s.commerce | 0, commerceBuilding: Math.round(s.commerceBuilding || 0),
      commercePending: s.commercePending | 0 })),
    lines: st.lines.map(l => ({ co: l.co, name: l.name, path: l.path, stations: l.stations,
      stops: l.stops, waypoints: l.waypoints || null, type: l.type, fare: l.fare, gaugeMm: l.gaugeMm, elec: l.elec,
      trains: l.trains, desirability: l.desirability, alive: l.alive })),
    trains: st.trains.map(t => ({ co: t.co, line: t.line, type: t.type, cars: t.cars, bought: t.bought | 0, alive: t.alive, stored: !!t.stored })),
    builds: st.builds,
    events: { log: st.events.log.slice(-120), active: st.events.active, majors: st.events.majors },
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
  if (obj.v !== CFG.SAVE_VERSION) throw new Error("Unsupported save version.");
  const seed = vInt(obj.seed, 1, 2 ** 31, 12345);
  const N = CFG.MAP_W * CFG.MAP_H;
  const st = freshState(seed);                                   // regenerate terrain from seed

  st.time.sec = vNum(obj.time && obj.time.sec, 0, 1e9, 0);
  st.time.totalDays = vInt(obj.time && obj.time.totalDays, 0, 1e6, 0);
  syncClock(st);

  const e = obj.econ || {};
  st.econ.cycle = vNum(e.cycle, 0.5, 2, 1);
  st.econ.paxMult = vNum(e.paxMult, 0.1, 2, 1);
  st.econ.commuteFactor = vNum(e.commuteFactor, 0.5, 1, 1);
  st.econ.landBubble = vNum(e.landBubble, 0.5, 3, 1);
  st.econ.demandIndex = vNum(e.demandIndex, 0, 10, 0);
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
      level: vInt(sd.level, 1, CFG.STATION.maxLevel, 1),
      cars: vInt(sd.cars, 1, 15, 3),
    };
    co.land = vIntArr(c.land, 0, N - 1);
    co.rights = vIntArr(c.rights, 0, 11);
    co.alive = vBool(c.alive);
    co.wageLevel = vNum(c.wageLevel, CFG.HR.wageLevelMin, CFG.HR.wageLevelMax, CFG.HR.wageLevelDefault);
    co.morale = vNum(c.morale, 0, 1, CFG.HR.moraleDefault);
    co.reputation = vNum(c.reputation, 0, 1, 0.5);
    co.awards = (Array.isArray(c.awards) ? c.awards.slice(0, 40) : []).map(k => vStr(k, 24)).filter(Boolean);
    co._strikeDays = vNum(c.strikeDays, 0, 3650, 0);
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
    h.owner = vInt(hx.own && hx.own[i], -2, st.companies.length - 1, -1);   // -2 = private holdout
    h.valueBoost = vNum(hx.vb && hx.vb[i], 50, 600, 100) / 100;
    h.track = null; h.stations = [];
  }
  for (const t of (Array.isArray(hx.trk) ? hx.trk : [])) {
    if (!Array.isArray(t)) continue;
    const i = vInt(t[0], 0, N - 1, 0), co = vInt(t[1], 0, st.companies.length - 1, 0);
    st.hexes[i].track = { co, gauge: GAUGE_KEYS[vInt(t[2], 0, 3, 0)], elec: !!t[3], tunnel: !!t[4], dmg: vInt(t[5], 0, 365, 0) };
    st.hexes[i].cons = null; st.hexes[i].dev = 0;
  }

  // stations / lines / trains (indices preserved; invalid entries become dead)
  st.stations = (Array.isArray(obj.stations) ? obj.stations.slice(0, 2000) : []).map((s, id) => {
    const hex = vInt(s.hex, 0, N - 1, 0);
    const out = {
      id, co: vInt(s.co, 0, st.companies.length - 1, 0), hex,
      level: vInt(s.level, 1, CFG.STATION.maxLevel, 1), cars: vInt(s.cars, 1, 15, 3),
      name: vStr(s.name, 48) || "Sta", builtYear: vInt(s.builtYear, 1800, 2100, 1872),
      board: 0, alive: vBool(s.alive), building: vInt(s.building, 0, 999, 0),
      isDepot: vBool(s.isDepot), depotAsStation: vBool(s.depotAsStation),
      commerce: vInt(s.commerce, 0, CFG.COMMERCE.levels.length - 1, 0),
      commerceBuilding: vInt(s.commerceBuilding, 0, 99999, 0),
      commercePending: vInt(s.commercePending, 0, CFG.COMMERCE.levels.length - 1, 0),
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
      type: CFG.LINE_TYPES.includes(l.type) ? l.type : "local",
      fare: vNum(l.fare, 0, 1e6, 1), gaugeMm: vInt(l.gaugeMm, 600, 1500, 1067), elec: vBool(l.elec),
      trains: [], desirability: vNum(l.desirability, 0.3, 1, 1),
      alive: vBool(l.alive) && Array.isArray(l.path) && l.path.length >= 2,
      capacity: 0, demand: 0, board: 0, served: 0, rev: 0, _coRev: {},
      _savedTrains: vIntArr(l.trains, 0, 99999),
    };
  });
  st.trains = (Array.isArray(obj.trains) ? obj.trains.slice(0, 2000) : []).map((t, id) => ({
    id, co: vInt(t.co, 0, st.companies.length - 1, 0), line: vInt(t.line, -1, Math.max(0, st.lines.length - 1), -1),
    type: CFG.TRAINS[t.type] ? t.type : "steam_local", cars: vInt(t.cars, 1, 15, 3),
    bought: vInt(t.bought, 1800, 2100, st.time.year),
    pos: 0, dir: 1, alive: vBool(t.alive), stored: vBool(t.stored),
  }));
  for (const l of st.lines) { l.trains = l._savedTrains.filter(id => st.trains[id] && st.trains[id].alive && st.trains[id].line === l.id); delete l._savedTrains; }

  st.builds = (Array.isArray(obj.builds) ? obj.builds.slice(0, 200) : []).map(b => ({
    kind: "track", co: vInt(b.co, 0, st.companies.length - 1, 0), hexes: vIntArr(b.hexes, 0, N - 1),
    done: vInt(b.done, 0, 10000, 0), daysPerHex: vNum(b.daysPerHex, 0.1, 365, 5),
    progress: vNum(b.progress, 0, 1e4, 0), gauge: GAUGE_KEYS.includes(b.gauge) ? b.gauge : "narrow", elec: vBool(b.elec),
  })).filter(b => b.hexes.length);

  const ev = obj.events || {};
  st.events.log = (Array.isArray(ev.log) ? ev.log.slice(-120) : []).map(l => ({
    year: vInt(l.year, 1800, 2100, 1872), day: vInt(l.day, 0, 365, 0),
    text: vStr(l.text, 300), kind: ["info", "event", "major"].includes(l.kind) ? l.kind : "info",
  }));
  st.events.active = (Array.isArray(ev.active) ? ev.active.slice(0, 20) : []).map(a => ({
    name: vStr(a.name, 60), text: vStr(a.text, 300), major: vBool(a.major),
    paxMult: vNum(a.paxMult, 0.1, 2, 1), days: vInt(a.days, 1, 3650, 30),
  }));
  st.events.majors = vIntArr(ev.majors, 1800, 2100);
  recomputeEventMods(st);

  // recompute derived values
  for (const co of st.companies) for (const i of co.land) st.hexes[i].value = landPrice(st, i);
  updateLaborMarket(st);              // labor market for the loaded era
  refreshWorkforceDerived(st);        // headcount / op-cost / productivity (no morale drift)
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
