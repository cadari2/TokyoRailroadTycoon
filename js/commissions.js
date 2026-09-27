/* =========================================================================
 * commissions.js — Government commissions (v0.6.1): era objectives.
 *
 * The long game (1872–2028) needed signposts. Each era — and every
 * CFG.COMMISSIONS.refreshYears within the long ones — the railway authority
 * (Tokyo's Railway Bureau, London's Board of Trade, …) issues a small batch
 * of commissions: link two busy districts, bring the railway to an unserved
 * neighbourhood, carry more riders, grow the city, electrify, double-track,
 * raise track onto viaducts, dig a subway, develop station commerce, run a
 * network without standing-room-only trains. Targets scale with the era and
 * with the company's current size, so they stay reachable but stretching.
 * Completing one pays a grant (inflation-indexed) and a little reputation;
 * a lapsed commission simply expires — no penalty, just a missed chance.
 *
 * DOM-free: state lives in st.commissions (serialized by save.js); the
 * browser panel is drawn by commissionsCard (tutorial.js).
 * ========================================================================= */
"use strict";

/** Station/hex helpers shared by the templates. */
function comOpStations(st, p) {
  return st.stations.filter(s => s.alive && s.co === p.id && !s.building && (!s.isDepot || s.depotAsStation));
}
function comNiceRound(v) {
  if (v < 100) return Math.ceil(v / 10) * 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.ceil(v / mag / 5) * 5 * mag;
}
/** A line of p's with a served stop within r hexes of idx. */
function comLineServes(st, line, idx, r) {
  for (const sid of line.stations) {
    const s = st.stations[sid];
    if (s && s.alive && !s.building && line.stops && line.stops[sid] && hexDist(s.hex, idx) <= r) return true;
  }
  return false;
}
function comAnyStationNear(st, idx, r, coId) {
  return st.stations.some(s => s.alive && (!s.isDepot || s.depotAsStation) &&
    (coId === undefined || s.co === coId) && hexDist(s.hex, idx) <= r);
}
function comSiteOk(st, i) {
  const h = st.hexes[i];
  return !isNationalLand(i) && !CFG.TERRAIN[h.terrain].water && h.terrain !== "mountain";
}

/* ---- templates ------------------------------------------------------------
 * make(st, p, rng) → { target, data, title, desc } or null (not applicable);
 * progress(st, p, c) → number compared against c.target. */
const COMMISSION_TEMPLATES = {
  link: {
    place: true,
    make(st, p, rng) {
      const dm = demandFieldCached(st);
      // the busiest district the player doesn't already serve…
      let a = -1, best = 0;
      for (let i = 0; i < st.hexes.length; i++) {
        if (!comSiteOk(st, i) || dm.field[i] <= best) continue;
        if (st.lines.some(l => l.alive && l.co === p.id && comLineServes(st, l, i, 2))) continue;
        best = dm.field[i]; a = i;
      }
      if (a < 0) return null;
      // …and a second busy one 8–16 hexes (4–8 km) away
      let b = -1; best = 0;
      for (let i = 0; i < st.hexes.length; i++) {
        const d = hexDist(i, a);
        if (d < 8 || d > 16 || !comSiteOk(st, i)) continue;
        const v = dm.field[i] * (0.8 + 0.4 * rng());
        if (v > best) { best = v; b = i; }
      }
      if (b < 0) return null;
      const A = hexLabel(st, a), B = hexLabel(st, b);
      return { target: 1, data: { a, b }, title: "Link " + A + " and " + B,
        desc: "Run a line calling within 2 hexes of both " + A + " and " + B + "." };
    },
    progress(st, p, c) {
      return st.lines.some(l => l.alive && l.co === p.id && l.trains.length &&
        comLineServes(st, l, c.data.a, 2) && comLineServes(st, l, c.data.b, 2)) ? 1 : 0;
    },
    hexes: c => [c.data.a, c.data.b],
  },
  serve: {
    place: true,
    make(st, p, rng) {
      // a populous neighbourhood no railway reaches yet
      let pick = -1, best = 0;
      for (let i = 0; i < st.hexes.length; i++) {
        if (!comSiteOk(st, i)) continue;
        let pop = 0;
        for (const j of hexesWithin(i, 2)) pop += hexPop(st.hexes[j]);
        pop *= 0.85 + 0.3 * rng();
        if (pop <= best || comAnyStationNear(st, i, 3)) continue;
        best = pop; pick = i;
      }
      if (pick < 0 || best <= 0) return null;
      const X = hexLabel(st, pick);
      return { target: 1, data: { a: pick }, title: "Bring the railway to " + X,
        desc: "Open a station within 2 hexes of " + X + " — its residents have no train yet." };
    },
    progress(st, p, c) { return comOpStations(st, p).some(s => hexDist(s.hex, c.data.a) <= 2) ? 1 : 0; },
    hexes: c => [c.data.a],
  },
  riders: {
    make(st, p) {
      const floor = { meiji: 800, taisho: 3000, showa1: 8000, showa2: 25000, heisei: 50000, reiwa: 70000 }[eraOf(st.time.year).key];
      const target = comNiceRound(Math.max(floor, (p.stats.paxAvg || 0) * 1.6 + 300));
      return { target, title: "Carry " + fmtNum(target) + " passengers a day",
        desc: "Average ridership across your network (the top-bar figure)." };
    },
    progress: (st, p) => Math.round(p.stats.paxAvg || 0),
  },
  stations: {
    make(st, p) {
      const target = Math.max(3, comOpStations(st, p).length + 3);
      return { target, title: "Operate " + target + " stations", desc: "Open stations in new neighbourhoods — each one brings a new catchment of riders." };
    },
    progress: (st, p) => comOpStations(st, p).length,
  },
  grow: {
    make(st) {
      const pop = totalPopulation(st);
      const target = comNiceRound(pop * 1.12);
      return { target, title: "Grow the city to " + fmtNum(target) + " people",
        desc: "Busy, affordable, uncrowded lines make districts around your stations grow." };
    },
    progress: (st) => st.totalPop || totalPopulation(st),
  },
  track: {
    eras: ["meiji", "taisho"],
    make(st, p) {
      const km = companyTrackHexes(st, p).length * CFG.HEX_KM;
      const target = Math.round(km + 8);
      return { target, title: "Lay " + target + " km of track", desc: "Extend the network toward the districts the demand map shows." };
    },
    progress: (st, p) => Math.round(companyTrackHexes(st, p).length * CFG.HEX_KM),
  },
  electrify: {
    fromYear: 1912,
    make(st, p) {
      const n = st.lines.filter(l => l.alive && l.co === p.id && l.elec).length;
      const target = n + 1;
      return { target, title: "Electrify " + (target === 1 ? "a line" : target + " lines"),
        desc: "Electric trains are faster and cleaner. Research or license Track electrification (Company → R&D), then wire a line." };
    },
    progress: (st, p) => st.lines.filter(l => l.alive && l.co === p.id && l.elec).length,
  },
  double: {
    fromYear: 1920,
    make(st, p) {
      const target = comDoubleCount(st, p) + 6;
      return { target, title: "Double-track " + target + " hexes", desc: "Busy corridors need a second track — it doubles a hex's train capacity and ends single-track waits." };
    },
    progress: (st, p) => comDoubleCount(st, p),
  },
  viaduct: {
    fromYear: 1926,
    make(st, p) {
      const target = comElevatedCount(st, p) + 4;
      return { target, title: "Raise " + target + " hexes onto viaducts",
        desc: "Grade-separate the dense core: surface track blights the homes around it." };
    },
    progress: (st, p) => comElevatedCount(st, p),
  },
  subway: {
    fromYear: 1927,
    make(st, p) {
      if (comOpStations(st, p).some(s => s.underground)) return null;
      return { target: 1, title: "Open an underground station", desc: "Bore a tunnel under the city (Build → Lay Track → Bore tunnel) and open a station on it." };
    },
    progress: (st, p) => comOpStations(st, p).some(s => s.underground) ? 1 : 0,
  },
  commerce: {
    fromYear: 1950,
    make(st, p) {
      const n = comOpStations(st, p).filter(s => (s.commerce | 0) >= 1).length;
      const target = n + 3;
      return { target, title: "Develop commerce at " + target + " stations", desc: "Station shops earn from footfall and make the neighbourhood grow faster." };
    },
    progress: (st, p) => comOpStations(st, p).filter(s => (s.commerce | 0) >= 1).length,
  },
  comfort: {
    fromYear: 1900,
    make(st, p) {
      const lines = st.lines.filter(l => l.alive && l.co === p.id && l.trains.length);
      const target = Math.max(3, lines.length + 1);
      return { target, title: "Run " + target + " lines with room to spare",
        desc: "Have " + target + " lines carrying everyone who wants to ride (no line turning riders away)." };
    },
    progress: (st, p) => st.lines.filter(l => l.alive && l.co === p.id && l.trains.length &&
      (l.servedFrac ?? 1) >= 0.97 && (l.board || 0) > 0).length,
  },
};
function comDoubleCount(st, p) {
  let n = 0;
  for (const h of st.hexes) if (h.track && h.track.co === p.id && trackRailList(h.track).filter(r => !r.building).length >= 2) n++;
  return n;
}
function comElevatedCount(st, p) {
  let n = 0;
  for (const h of st.hexes) if (h.track && h.track.co === p.id && h.track.elevated) n++;
  return n;
}

/** Who issues commissions in this campaign (cosmetic). */
function commissionIssuer(st) {
  return ({ tokyo: "the Railway Bureau (鉄道院)", london: "the Board of Trade", nyc: "the Public Service Commission",
    melbourne: "the Victorian Railways Commissioners", paris: "the Ministère des Travaux publics" })[campaignOf(st).key] || "the government";
}

/** Issue a fresh batch for the current era/period. */
function issueCommissions(st, p) {
  const C = CFG.COMMISSIONS, year = st.time.year, era = eraOf(year).key;
  const batchNo = ((st.commissions && st.commissions.batch) || 0) + 1;
  const rng = makeRng(((st.seed | 0) ^ (batchNo * 0x9e3779b1)) >>> 0);
  const eligible = Object.keys(COMMISSION_TEMPLATES).filter(k => {
    const T = COMMISSION_TEMPLATES[k];
    if (T.fromYear && year < T.fromYear) return false;
    if (T.eras && !T.eras.includes(era)) return false;
    return true;
  });
  // one "place" objective (a concrete spot on the map) plus numeric ones
  const places = eligible.filter(k => COMMISSION_TEMPLATES[k].place);
  const others = eligible.filter(k => !COMMISSION_TEMPLATES[k].place);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(rng) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const order = shuffle(places.slice()).concat(shuffle(others.slice()));
  const list = [];
  const eraIdx = CFG.ERAS.findIndex(e => e.key === era);
  for (const key of order) {
    if (list.length >= C.perBatch) break;
    if (COMMISSION_TEMPLATES[key].place && list.some(c => COMMISSION_TEMPLATES[c.key].place)) continue;
    let made = null;
    try { made = COMMISSION_TEMPLATES[key].make(st, p, () => rnd(rng)); } catch (e) { made = null; }
    if (!made) continue;
    // already satisfied at issue time? skip — a commission should ask for something new
    const c = Object.assign({ key, done: false, doneYear: 0 }, made);
    try { if (COMMISSION_TEMPLATES[key].progress(st, p, c) >= c.target) continue; } catch (e) { continue; }
    c.reward = Math.round(C.rewardBase * (1 + C.rewardEraStep * Math.max(0, eraIdx)) * inflationOf(st, year) *
      (COMMISSION_TEMPLATES[key].place ? C.placeMult : 1));
    list.push(c);
  }
  st.commissions = { batch: batchNo, era, issued: year, expires: Math.min(eraOf(year).to, year + C.refreshYears - 1), list };
  if (list.length) {
    logEvent(st, "📜 New commissions from " + commissionIssuer(st) + ": " + list.map(c => c.title).join(" · ") +
      " (by " + st.commissions.expires + ").", "major");
  }
}

/** Monthly: pay out completed commissions; refresh the batch on a new era,
 *  after the period lapses, or (next January) once all are complete. */
function checkCommissions(st) {
  const p = st.companies.find(c => c.isPlayer);
  if (!p || !p.alive) return;
  const year = st.time.year;
  const cur = st.commissions;
  const allDone = cur && cur.list.length && cur.list.every(c => c.done);
  if (!cur || eraOf(year).key !== cur.era || year > cur.expires ||
      (allDone && st.time.day === 0 && year > (cur.list.reduce((m, c) => Math.max(m, c.doneYear), 0)))) {
    if (cur) {
      const lapsed = cur.list.filter(c => !c.done);
      if (lapsed.length) logEvent(st, "📜 Commission" + (lapsed.length > 1 ? "s" : "") + " lapsed: " + lapsed.map(c => c.title).join(" · ") + ".");
    }
    issueCommissions(st, p);
    return;
  }
  for (const c of cur.list) {
    if (c.done) continue;
    const T = COMMISSION_TEMPLATES[c.key];
    let prog = 0;
    try { prog = T.progress(st, p, c); } catch (e) { prog = 0; }
    c.progress = prog;
    if (prog >= c.target) {
      c.done = true; c.doneYear = year;
      p.cash += c.reward;
      p.reputation = clamp((p.reputation ?? 0.5) + CFG.COMMISSIONS.reputation, 0, 1);
      logEvent(st, "📜 Commission complete: " + c.title + " — " + commissionIssuer(st) + " grants " + fmtYen(c.reward) + ".", "major");
      queueSfx(st, "milestone");
    }
  }
}

/** Current progress of a commission (for the panel). */
function commissionProgress(st, c) {
  const p = st.companies.find(co => co.isPlayer);
  if (!p) return 0;
  try { return COMMISSION_TEMPLATES[c.key].progress(st, p, c); } catch (e) { return 0; }
}
