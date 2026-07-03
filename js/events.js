/* =========================================================================
 * events.js — Random event system with historical flavor. Destructive
 * majors (earthquake, great fire, typhoon, air raids) are hard-capped at
 * 2 per 100 years with a minimum gap; economic events (booms, bubbles,
 * pandemics, remote work) shape demand and land values.
 *
 * Disasters have teeth (v0.4): each type carries its own damage PROFILE —
 * what it hits (track, buildings, station commerce, land values), where
 * (flood-prone water margins vs. the dense burnable city), and how
 * ridership RECOVERS afterwards (a shaped curve, not a flat penalty
 * window). Repairing the damage costs real money, paid day by day
 * (see sim.js dailyTick / CFG.DISASTER). No DOM access.
 * ========================================================================= */
"use strict";

function logEvent(st, text, kind) {
  st.events.log.push({ year: st.time.year, day: st.time.day, text, kind: kind || "info" });
  if (st.events.log.length > 300) st.events.log.shift();
  st.events.unread = (st.events.unread || 0) + 1;
}

/** Can another destructive major fire this year? (cap: 2 per rolling 100y) */
function majorAllowed(st) {
  const y = st.time.year;
  const recent = st.events.majors.filter(m => y - m < 100);
  if (recent.length >= CFG.EVENTS.majorPer100y) return false;
  if (recent.length && y - Math.max(...recent) < CFG.EVENTS.minMajorGapYears) return false;
  return true;
}

/* ---- Damage engine ----------------------------------------------------------
 * One engine, per-event profiles:
 *   radius     hexes affected; everything falls off toward the rim
 *   track      base chance a track hex is damaged
 *   dmgDays    [min,max] calendar days of repair work per damaged hex
 *              (repairs are PAID, day by day — see sim.js)
 *   floodBias  extra track-damage chance beside rivers/canals/moats and on
 *              bridges — typhoon flooding and quake surge/liquefaction (the
 *              tsunami consequence, folded into the map's low-lying water
 *              margins: the map has no open-sea hexes, so a separate
 *              coastal-only event type would have nothing to anchor to)
 *   fireBias   true → damage feeds on building density (dev): fires and
 *              incendiary raids gut the dense city and mostly spare fields
 *   buildings  chance a developed hex loses one development level
 *   commerce   chance a station in radius loses one built ekinaka tier
 *   landHit    valueBoost multiplier at the epicenter (fades to none at the
 *              rim; recovery comes through the normal growth loop)
 */
function applyDisaster(st, epicenter, prof) {
  const rng = st.evRng;
  let trackHit = 0, devHit = 0, commerceHit = 0, floodHit = 0;
  const isWaterMargin = (i) => {
    if (CFG.TERRAIN[st.hexes[i].terrain].bridge) return true;
    return neighborsOf(i).some(n => CFG.TERRAIN[st.hexes[n].terrain].bridge);
  };
  for (const i of hexesWithin(epicenter, prof.radius)) {
    const h = st.hexes[i];
    const falloff = 1 - hexDist(i, epicenter) / (prof.radius + 1);       // 1 at center → ~0 at rim
    const denseness = 0.25 + 0.75 * Math.min(1, (h.dev || 0) / 3);       // fire feeds on the built city
    // -- track --
    if (h.track) {
      let p = (prof.track || 0) * falloff;
      const flooded = prof.floodBias && isWaterMargin(i);
      if (flooded) p += prof.floodBias * falloff;
      if (prof.fireBias) p *= denseness;
      if (rnd(rng) < p) {
        const days = rndInt(rng, prof.dmgDays[0], prof.dmgDays[1]) * (0.5 + 0.5 * falloff);
        h.track.dmg = Math.min(365, Math.max(h.track.dmg || 0, Math.round(days)));
        trackHit++;
        if (flooded) floodHit++;
      }
    }
    // -- buildings --
    if (h.dev > 0 && (prof.buildings || 0) > 0) {
      let p = prof.buildings * falloff;
      if (prof.fireBias) p *= denseness;
      if (rnd(rng) < p) { h.dev = Math.max(0, h.dev - 1); devHit++; st.renderDirty = true; }
    }
    // -- station commerce (the built ekinaka burns/collapses one tier) --
    if ((prof.commerce || 0) > 0) {
      for (const sid of h.stations) {
        const s = st.stations[sid];
        if (!s || !s.alive || (s.commerce || 0) < 2) continue;
        if (rnd(rng) < prof.commerce * falloff) { s.commerce--; commerceHit++; }
      }
    }
    // -- land values (recover through the normal growth loop) --
    if (prof.landHit && prof.landHit < 1) {
      h.valueBoost = Math.max(0.5, (h.valueBoost || 1) * (1 - (1 - prof.landHit) * falloff));
      if (h.owner >= 0) h.value = landPrice(st, i);
    }
  }
  st.od.dirty = true;
  st.renderDirty = true;
  return { trackHit, devHit, commerceHit, floodHit };
}

function startEvent(st, ev) {
  ev.total = ev.days;                       // recovery curves need the original span
  st.events.active.push(ev);
  if (ev.major) st.events.majors.push(st.time.year);
  logEvent(st, ev.text, ev.major ? "major" : "event");
  recomputeEventMods(st);
}

/** Ridership modifier from active events. paxMult is the FULL impact at the
 *  moment of the event; the effective hit then follows the event's recovery
 *  curve as its days run down (r = fraction remaining):
 *    hold    full impact until it ends (wars, pandemics — the cause persists)
 *    slow    r^0.6 — deep damage that lingers (earthquakes: the city limps)
 *    linear  r     — steady rebuilding
 *    fast    r^1.8 — a sharp dip that clears quickly (storm damage)
 *  so events differ in SHAPE, not just size and length. */
function recomputeEventMods(st) {
  let pax = 1;
  for (const ev of st.events.active) {
    const full = ev.paxMult ?? 1;
    if (full >= 1) { pax *= full; continue; }
    const r = ev.total > 0 ? clamp(ev.days / ev.total, 0, 1) : 1;
    const shape = ev.curve === "hold" ? 1
                : ev.curve === "slow" ? Math.pow(r, 0.6)
                : ev.curve === "fast" ? Math.pow(r, 1.8)
                : r;
    pax *= 1 - (1 - full) * shape;
  }
  st.econ.paxMult = pax;
}

/** Called once per year: schedule historically-flavored & random events. */
function yearlyEvents(st) {
  const y = st.time.year;
  const rng = st.evRng;
  const center = hexIdx(CFG.CENTER.col, CFG.CENTER.row);
  const randomHex = () => hexIdx(rndInt(rng, 5, CFG.MAP_W - 6), rndInt(rng, 5, CFG.MAP_H - 6));

  // --- station-commerce milestones (the "ekinaka" story) ---
  if (y === CFG.COMMERCE.vendingYear) {
    logEvent(st, "🥤 " + y + ": The vending machine is invented. Every open station now earns a meagre but steady trickle from platform vending — automatically.", "event");
  }
  if (y === CFG.COMMERCE.levels[2].from) {
    logEvent(st, "🏪 " + y + ": Station kiosks & shops arrive — you can now pay to develop commerce inside your stations (Manage station).", "event");
  }
  if (y === CFG.COMMERCE.levels[3].from) {
    logEvent(st, "🍜 " + y + ": Postwar station concourses bloom — retail, restaurants and convenience. A new, richer tier of station commerce opens.", "event");
  }
  if (y === CFG.COMMERCE.levels[4].from) {
    logEvent(st, "🛍 " + y + ": The terminal department-store era — build a shopping mall in and around your station on railroad-owned land.", "event");
  }
  if (y === CFG.COMMERCE.levels[5].from) {
    logEvent(st, "🏬 " + y + ": The ekinaka boom — in-gate retail cities. The grandest, riskiest station-commerce tier is now possible.", "event");
  }

  // --- scripted economic arcs ---
  if (y === 1904) { st.econ.cycle = 1.15; logEvent(st, "Industrial boom: wartime industry lifts travel demand (+15%)."); }
  if (y === 1918 && majorAllowedSoft(st)) {
    startEvent(st, { name: "Influenza pandemic", curve: "hold", paxMult: 0.55, days: 365,
      text: "Influenza pandemic sweeps the capital: ridership -45% until it burns out." });
  }
  if (y === 1923 && majorAllowed(st) && rnd(rng) < 0.85) {
    // the Great Kanto Earthquake: wide, violent, water margins surge, the
    // dense center burns — and the recovery is slow and expensive
    const hit = applyDisaster(st, center, { radius: 14, track: 0.55, dmgDays: [60, 150],
      floodBias: 0.3, buildings: 0.28, commerce: 0.5, landHit: 0.75 });
    startEvent(st, { name: "Great Kanto Earthquake", major: true, paxMult: 0.6, days: 270, curve: "slow",
      text: "GREAT KANTO EARTHQUAKE: " + hit.trackHit + " km of track wrecked" +
        (hit.floodHit ? " (" + hit.floodHit + " km flooded where rivers surged their banks)" : "") +
        (hit.commerceHit ? ", " + hit.commerceHit + " station businesses in ruins" : "") +
        "; land values slump and the city rebuilds slowly. Repairs are on the owners." });
    st.econ.landBubble = Math.max(0.7, st.econ.landBubble * 0.8);
  }
  if (y === 1937) { st.econ.cycle = 1.1; logEvent(st, "War economy: factories hum, commuting rises (+10%)."); }
  if (y === 1944 && majorAllowed(st)) {
    // incendiary raids feed on the dense city: buildings and station
    // commerce burn far more than the rails themselves; demand stays
    // suppressed until the war ends (hold), then recovery begins
    const hit = applyDisaster(st, center, { radius: 18, track: 0.30, dmgDays: [90, 200],
      fireBias: true, buildings: 0.5, commerce: 0.65, landHit: 0.7 });
    startEvent(st, { name: "Air raids", major: true, paxMult: 0.5, days: 540, curve: "hold",
      text: "AIR RAIDS strike the capital: " + hit.trackHit + " km of track destroyed, " +
        hit.devHit + " blocks burnt out" +
        (hit.commerceHit ? ", " + hit.commerceHit + " station businesses gutted" : "") +
        "; ridership halved until war's end." });
  }
  if (y === 1946) { st.econ.cycle = 0.85; logEvent(st, "Postwar austerity: demand depressed (-15%)."); }
  if (y === 1955) { st.econ.cycle = 1.25; logEvent(st, "High-growth era begins: standard & Scotch gauge unlocked — the shinkansen age! Demand +25%."); }
  if (y === 1964) { st.econ.cycle = 1.35; logEvent(st, "Olympic boom: the world watches Tokyo. Demand +35%."); }
  if (y === 1986) { st.econ.landBubble = 2.2; logEvent(st, "BUBBLE ECONOMY: land prices across the capital more than double.", "event"); }
  if (y === 1991) { st.econ.landBubble = 0.9; st.econ.cycle = 0.9; logEvent(st, "The bubble bursts: land values collapse, demand -10%.", "event"); }
  if (y === 2008) { st.econ.cycle = 0.92; logEvent(st, "Global financial crisis: demand dips (-8%)."); }
  if (y === 2020 && majorAllowedSoft(st)) {
    startEvent(st, { name: "Pandemic", curve: "hold", paxMult: 0.5, days: 540,
      text: "PANDEMIC: offices empty out. Ridership -50% while it lasts." });
    st.econ.commuteFactor = 0.86;
    logEvent(st, "Remote work takes hold: commuter demand permanently -14%.", "event");
  }
  if (y === 2023) { st.econ.cycle = 1.05; logEvent(st, "Recovery and tourism return: demand +5%."); }

  // --- random destructive events (era-appropriate, capped) ---
  if (majorAllowed(st) && rnd(rng) < 0.012) {
    // earthquake: violent shaking everywhere in range, and the low-lying
    // water margins — bridges, riverside embankments — surge and liquefy
    const epi = randomHex();
    const hit = applyDisaster(st, epi, { radius: 10, track: 0.5, dmgDays: [45, 120],
      floodBias: 0.35, buildings: 0.2, commerce: 0.35, landHit: 0.85 });
    startEvent(st, { name: "Earthquake", major: true, paxMult: 0.7, days: 180, curve: "slow",
      text: "EARTHQUAKE (epicenter hex #" + st.hexes[epi].spiral + "): " + hit.trackHit + " km of track damaged" +
        (hit.floodHit ? ", embankments along the water surge and fail (" + hit.floodHit + " km)" : "") +
        (hit.commerceHit ? ", " + hit.commerceHit + " station businesses wrecked" : "") +
        "; ridership recovers only as the repairs are paid for." });
  } else if (majorAllowed(st) && y < 1930 && rnd(rng) < 0.012) {
    // great fire: feeds on the dense wooden city — buildings and station
    // commerce burn, but the steel rails largely survive
    const epi = randomHex();
    const hit = applyDisaster(st, epi, { radius: 6, track: 0.15, dmgDays: [30, 80],
      fireBias: true, buildings: 0.55, commerce: 0.7, landHit: 0.8 });
    startEvent(st, { name: "Great fire", major: true, paxMult: 0.8, days: 120, curve: "linear",
      text: "GREAT FIRE around hex #" + st.hexes[epi].spiral + ": " + hit.devHit + " blocks burn" +
        (hit.commerceHit ? ", " + hit.commerceHit + " station businesses lost" : "") +
        (hit.trackHit ? "; " + hit.trackHit + " km of track scorched" : "; the rails largely survive") + "." });
  }
  // minor typhoons: frequent, brief, non-major — flooding along the water
  // margins and on bridges, a sharp dip that clears fast
  if (rnd(rng) < 0.18) {
    const epi = randomHex();
    const hit = applyDisaster(st, epi, { radius: 5, track: 0.06, dmgDays: [20, 45],
      floodBias: 0.5, buildings: 0.04, landHit: 0.97 });
    startEvent(st, { name: "Typhoon", paxMult: 0.85, days: 21, curve: "fast",
      text: "Typhoon lashes the region: " + (hit.trackHit ? hit.trackHit + " km of low-lying track flooded; " : "") +
        "services limp for a few weeks." });
  }
  // gentle random business cycle drift back toward 1.0
  st.econ.cycle = clamp(st.econ.cycle * 0.97 + 0.03 + (rnd(rng) - 0.5) * 0.02, 0.7, 1.5);
  st.econ.landBubble = clamp(st.econ.landBubble * 0.96 + 0.04, 0.6, 2.5);
}

/** Pandemics count against the spirit of the cap but aren't track-destructive. */
function majorAllowedSoft(st) {
  return st.events.active.every(e => !e.major);
}

/** Per simulated day: age out active events (durations are calendar days) and
 *  refresh the ridership modifier — recovery curves change it every day. */
function dailyEvents(st) {
  for (let i = st.events.active.length - 1; i >= 0; i--) {
    const ev = st.events.active[i];
    ev.days -= CFG.CAL_DAYS_PER_SIM_DAY;
    if (ev.days <= 0) {
      logEvent(st, ev.name + " is over — conditions return to normal.");
      st.events.active.splice(i, 1);
    }
  }
  recomputeEventMods(st);
}
