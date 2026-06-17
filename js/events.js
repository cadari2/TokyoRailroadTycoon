/* =========================================================================
 * events.js — Random event system with historical flavor. Destructive
 * majors (earthquake, great fire, typhoon, air raids) are hard-capped at
 * 2 per 100 years with a minimum gap; economic events (booms, bubbles,
 * pandemics, remote work) shape demand and land values. Each event has
 * clear, specific results shown in the log. No DOM access.
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

/** Damage infrastructure around an epicenter; returns hexes hit. */
function applyDamage(st, epicenter, radius, severity) {
  let hit = 0;
  for (const i of hexesWithin(epicenter, radius)) {
    const h = st.hexes[i];
    if (h.track && rnd(st.evRng) < severity) {
      h.track.dmg = rndInt(st.evRng, 30, 90);             // days under repair
      hit++;
    }
    if (h.dev > 0 && rnd(st.evRng) < severity * 0.5) { h.dev = Math.max(0, h.dev - 1); st.renderDirty = true; }
  }
  st.od.dirty = true;
  return hit;
}

function startEvent(st, ev) {
  st.events.active.push(ev);
  if (ev.major) st.events.majors.push(st.time.year);
  logEvent(st, ev.text, ev.major ? "major" : "event");
  recomputeEventMods(st);
}

function recomputeEventMods(st) {
  let pax = 1;
  for (const ev of st.events.active) pax *= ev.paxMult ?? 1;
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
    startEvent(st, { name: "Influenza pandemic", text: "Influenza pandemic sweeps the capital: ridership -45% for a year.", paxMult: 0.55, days: 365 });
  }
  if (y === 1923 && majorAllowed(st) && rnd(rng) < 0.85) {
    const hit = applyDamage(st, center, 14, 0.55);
    startEvent(st, { name: "Great Kanto Earthquake", major: true, paxMult: 0.6, days: 270,
      text: "GREAT KANTO EARTHQUAKE: " + hit + " km of track damaged near the center; ridership -40% while the city rebuilds." });
    st.econ.landBubble = Math.max(0.7, st.econ.landBubble * 0.8);
  }
  if (y === 1937) { st.econ.cycle = 1.1; logEvent(st, "War economy: factories hum, commuting rises (+10%)."); }
  if (y === 1944 && majorAllowed(st)) {
    const hit = applyDamage(st, center, 18, 0.45);
    startEvent(st, { name: "Air raids", major: true, paxMult: 0.5, days: 540,
      text: "AIR RAIDS strike the capital: " + hit + " km of track destroyed; ridership halved until war's end." });
  }
  if (y === 1946) { st.econ.cycle = 0.85; logEvent(st, "Postwar austerity: demand depressed (-15%)."); }
  if (y === 1955) { st.econ.cycle = 1.25; logEvent(st, "High-growth era begins: standard & Scotch gauge unlocked — the shinkansen age! Demand +25%."); }
  if (y === 1964) { st.econ.cycle = 1.35; logEvent(st, "Olympic boom: the world watches Tokyo. Demand +35%."); }
  if (y === 1986) { st.econ.landBubble = 2.2; logEvent(st, "BUBBLE ECONOMY: land prices across the capital more than double.", "event"); }
  if (y === 1991) { st.econ.landBubble = 0.9; st.econ.cycle = 0.9; logEvent(st, "The bubble bursts: land values collapse, demand -10%.", "event"); }
  if (y === 2008) { st.econ.cycle = 0.92; logEvent(st, "Global financial crisis: demand dips (-8%)."); }
  if (y === 2020 && majorAllowedSoft(st)) {
    startEvent(st, { name: "Pandemic", text: "PANDEMIC: offices empty out. Ridership -50% for 18 months.", paxMult: 0.5, days: 540 });
    st.econ.commuteFactor = 0.86;
    logEvent(st, "Remote work takes hold: commuter demand permanently -14%.", "event");
  }
  if (y === 2023) { st.econ.cycle = 1.05; logEvent(st, "Recovery and tourism return: demand +5%."); }

  // --- random destructive events (era-appropriate, capped) ---
  if (majorAllowed(st) && rnd(rng) < 0.012) {
    const epi = randomHex();
    const hit = applyDamage(st, epi, 10, 0.5);
    startEvent(st, { name: "Earthquake", major: true, paxMult: 0.7, days: 180,
      text: "EARTHQUAKE (epicenter hex #" + st.hexes[epi].spiral + "): " + hit + " km of track damaged; ridership -30% for 6 months." });
  } else if (majorAllowed(st) && y < 1930 && rnd(rng) < 0.012) {
    const epi = randomHex();
    const hit = applyDamage(st, epi, 6, 0.6);
    startEvent(st, { name: "Great fire", major: true, paxMult: 0.8, days: 120,
      text: "GREAT FIRE around hex #" + st.hexes[epi].spiral + ": " + hit + " km of track lost; ridership -20% for 4 months." });
  }
  // minor typhoons: frequent, brief, non-major
  if (rnd(rng) < 0.18) {
    const epi = randomHex();
    const hit = applyDamage(st, epi, 5, 0.18);
    startEvent(st, { name: "Typhoon", paxMult: 0.85, days: 21,
      text: "Typhoon lashes the region: " + (hit ? hit + " km of track flooded; " : "") + "ridership -15% for 3 weeks." });
  }
  // gentle random business cycle drift back toward 1.0
  st.econ.cycle = clamp(st.econ.cycle * 0.97 + 0.03 + (rnd(rng) - 0.5) * 0.02, 0.7, 1.5);
  st.econ.landBubble = clamp(st.econ.landBubble * 0.96 + 0.04, 0.6, 2.5);
}

/** Pandemics count against the spirit of the cap but aren't track-destructive. */
function majorAllowedSoft(st) {
  return st.events.active.every(e => !e.major);
}

/** Per simulated day: age out active events (durations are calendar days). */
function dailyEvents(st) {
  let changed = false;
  for (let i = st.events.active.length - 1; i >= 0; i--) {
    const ev = st.events.active[i];
    ev.days -= CFG.CAL_DAYS_PER_SIM_DAY;
    if (ev.days <= 0) {
      logEvent(st, ev.name + " is over — conditions return to normal.");
      st.events.active.splice(i, 1);
      changed = true;
    }
  }
  if (changed) recomputeEventMods(st);
}
