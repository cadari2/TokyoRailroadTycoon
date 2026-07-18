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

/** Can another MAJOR earthquake strike? Hard per-playthrough budget (see
 *  CFG.EVENTS.majorQuakeCap — neither is guaranteed to occur) plus a minimum
 *  gap so "roughly once a century" never means twice in a decade.
 *  st.events.majors records the years of past major quakes. */
function majorQuakeAllowed(st) {
  if (!campaignOf(st).quakes) return false;   // earthquakes only where the registry says so (Tokyo)
  const majors = st.events.majors;
  if (majors.length >= CFG.EVENTS.majorQuakeCap) return false;
  if (majors.length && st.time.year - Math.max(...majors) < CFG.EVENTS.majorQuakeGapYears) return false;
  return true;
}

/** A hex people care about: the most populated/attractive of a few random
 *  samples — great quakes are remembered because they hit somewhere dear,
 *  and bombers aim at the city, not at empty paddies. */
function populatedHex(st, rng) {
  const dm = demandFieldCached(st);
  let best = hexIdx(CFG.CENTER.col, CFG.CENTER.row), bestV = -1;
  for (let t = 0; t < 10; t++) {
    const i = hexIdx(rndInt(rng, 4, CFG.MAP_W - 5), rndInt(rng, 4, CFG.MAP_H - 5));
    const v = dm.field[i] * (0.5 + rnd(rng));
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

/* ---- Resilience against a given event ----------------------------------------
 * Seismic events get the full composition (era/renewal × taishin × R&D — see
 * world.js). Aerial attack is a different threat: seismic bracing doesn't
 * stop incendiaries, so taishin is skipped and structural R&D only half-
 * counts; newer construction (era/renewal) still burns and collapses less.
 * Storm flooding gets no resilience credit — embankments flood regardless. */
function disasterTrackRes(st, i, prof) {
  const t = st.hexes[i].track;
  if (!t) return 0;
  if (prof.seismic) return trackResilience(st, i);
  if (prof.aerial) return combineResilience([eraResilience(t.built), rndResilience(st.companies[t.co]) * 0.5]);
  return 0;
}
function disasterStationRes(st, s, prof) {
  if (prof.seismic) return stationResilience(st, s);
  if (prof.aerial) return combineResilience([eraResilience(s.renewed || s.builtYear),
    rndResilience(st.companies[s.co]) * 0.5]);
  return 0;
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
  let trackHit = 0, devHit = 0, commerceHit = 0, floodHit = 0, razedHit = 0;
  const isWaterMargin = (i) => {
    if (CFG.TERRAIN[st.hexes[i].terrain].bridge) return true;
    return neighborsOf(i).some(n => CFG.TERRAIN[st.hexes[n].terrain].bridge);
  };
  for (const i of hexesWithin(epicenter, prof.radius)) {
    const h = st.hexes[i];
    const falloff = 1 - hexDist(i, epicenter) / (prof.radius + 1);       // 1 at center → ~0 at rim
    const denseness = 0.25 + 0.75 * Math.min(1, (h.dev || 0) / 3);       // fire feeds on the built city
    // -- track (damage chance AND repair days scale by the hex's resilience) --
    if (h.track) {
      let p = (prof.track || 0) * falloff;
      const flooded = prof.floodBias && isWaterMargin(i);
      if (flooded) p += prof.floodBias * falloff;
      if (prof.fireBias) p *= denseness;
      const res = disasterTrackRes(st, i, prof);
      p *= 1 - res;
      if (rnd(rng) < p) {
        const days = Math.round(rndInt(rng, prof.dmgDays[0], prof.dmgDays[1]) *
                                (0.5 + 0.5 * falloff) * (1 - res));
        if (days > 0) {
          h.track.dmg = Math.min(365, Math.max(h.track.dmg || 0, days));
          trackHit++;
          if (flooded) floodHit++;
        }
      }
    }
    // -- buildings (the CITY, not railway assets: it is continuously rebuilt,
    // so tremor losses shrink with the calendar era; concrete also burns less
    // readily than the old wooden city, at half credit) --
    if (h.dev > 0 && (prof.buildings || 0) > 0) {
      let p = prof.buildings * falloff;
      if (prof.fireBias) p *= denseness;
      if (prof.seismic) p *= 1 - eraResilience(st.time.year);
      else if (prof.aerial) p *= 1 - 0.5 * eraResilience(st.time.year);
      if (rnd(rng) < p) {
        h.dev = Math.max(0, h.dev - 1);
        devHit++;
        // a hit that knocks out the last development level DESTROYS the hex:
        // the building itself is gone and the parcel reads as cleared land
        // (the growth loop rebuilds it over the years, same as any bare lot)
        if (h.dev <= 0 && h.cons) { h.cons = null; razedHit++; }
        st.renderDirty = true;
      }
    }
    // -- station commerce (the built ekinaka burns/collapses one tier) --
    if ((prof.commerce || 0) > 0) {
      for (const sid of h.stations) {
        const s = st.stations[sid];
        if (!s || !s.alive || (s.commerce || 0) < 2) continue;
        if (rnd(rng) < prof.commerce * falloff * (1 - disasterStationRes(st, s, prof))) { s.commerce--; commerceHit++; }
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
  // hexes were destroyed outright — one collapse/rubble sting per disaster,
  // whoever it hit (disaster sounds play for everyone, same as the sirens)
  if (razedHit > 0) queueSfx(st, "hex_destroyed");
  return { trackHit, devHit, commerceHit, floodHit, razedHit };
}

function startEvent(st, ev) {
  ev.total = ev.days;                       // recovery curves need the original span
  st.events.active.push(ev);
  // NOTE: ev.major is a display/log emphasis flag only; the major-QUAKE
  // budget (st.events.majors) is recorded by the quake branch itself, and
  // the war has its own once-per-playthrough state (st.war.happened).
  logEvent(st, ev.text, ev.major ? "major" : "event");
  recomputeEventMods(st);
}

/* ---- Major war ----------------------------------------------------------------
 * At most one per playthrough, and a playthrough may have none. Start year is
 * unconstrained, duration is 2–10 years, PEAK severity is randomized (1.0 ≈
 * the historical worst as a ceiling, most wars land well below it), and the
 * intensity CURVE across the war window is randomized too — one or two
 * gaussian bumps at random positions/widths, so a given war may open with a
 * sharp climax and taper, build slowly to a late catastrophe, or peak twice.
 * Each war year fires aerial raids on the dense city proportional to that
 * year's intensity, suppresses ridership (recomputeEventMods), and drives
 * inflation while it lasts and for a few years after (see updateInflation).
 */
function maybeStartWar(st) {
  if (st.war && st.war.happened) return;
  if (rnd(st.evRng) >= CFG.EVENTS.warChance) return;
  const rng = st.evRng;
  const years = rndInt(rng, CFG.EVENTS.warYearsMin, CFG.EVENTS.warYearsMax);
  const peak = 0.3 + 0.7 * rnd(rng);
  const bumps = [];
  const nBumps = rnd(rng) < 0.35 ? 2 : 1;
  for (let b = 0; b < nBumps; b++) {
    bumps.push({ c: rnd(rng), w: 0.12 + 0.3 * rnd(rng), a: 0.5 + 0.5 * rnd(rng) });
  }
  const profile = [];
  for (let t = 0; t < years; t++) {
    const x = years === 1 ? 0.5 : t / (years - 1);
    let v = 0;
    for (const b of bumps) v = Math.max(v, b.a * Math.exp(-((x - b.c) ** 2) / (2 * b.w * b.w)));
    profile.push(v);
  }
  const mx = Math.max(...profile) || 1;
  for (let t = 0; t < years; t++) profile[t] = +(profile[t] * peak / mx).toFixed(3);
  st.war = { active: true, happened: true, startYear: st.time.year, years,
             peak: +peak.toFixed(3), profile, yearIdx: 0, inten: 0 };
  logEvent(st, "⚔ WAR. The nation mobilizes — the skies over the capital are no longer safe.", "major");
}

/** One year of the war: raids proportional to this year's intensity. */
function warYearTick(st) {
  const w = st.war;
  if (!w || !w.active) return;
  const rng = st.evRng;
  const inten = w.profile[w.yearIdx] ?? 0;
  w.inten = inten;
  if (inten > 0.05) {
    const nRaids = 1 + Math.floor(inten * 2.5);
    let track = 0, blocks = 0, biz = 0, razed = 0;
    for (let n = 0; n < nRaids; n++) {
      const hit = applyDisaster(st, populatedHex(st, rng), {
        radius: 4 + Math.round(6 * inten),
        track: 0.12 + 0.35 * inten,
        dmgDays: [40, Math.round(60 + 140 * inten)],
        fireBias: true,
        buildings: 0.18 + 0.4 * inten,
        commerce: 0.2 + 0.5 * inten,
        landHit: 1 - 0.35 * inten,
        aerial: true,
      });
      track += hit.trackHit; blocks += hit.devHit; biz += hit.commerceHit; razed += hit.razedHit;
    }
    logEvent(st, "✈ AIR RAIDS strike the capital: " + blocks + " blocks burnt out" +
      (razed ? " (" + razed + " razed to the ground)" : "") +
      (track ? ", " + track + " km of track destroyed" : "") +
      (biz ? ", " + biz + " station businesses gutted" : "") + ".", "major");
    queueSfx(st, "disaster_war");
  } else {
    logEvent(st, "The war grinds on far from the capital — the city is spared this year.", "event");
  }
  w.yearIdx++;
  if (w.yearIdx >= w.years) {
    w.active = false;
    w.inten = 0;
    st.econ.cycle = Math.min(st.econ.cycle, 0.85);      // postwar slump
    st.econ.postwar = { years: 4, peak: w.peak };       // postwar price spike (see updateInflation)
    logEvent(st, "🕊 The war is over. Rebuilding begins — and prices will not be what they were.", "major");
  }
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
  // active war: ridership suppressed in proportion to this year's intensity
  if (st.war && st.war.active) pax *= 1 - CFG.EVENTS.warPaxHit * (st.war.inten || 0);
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

  // --- seismic building standards take effect (see CFG.TAISHIN) ---
  for (const std of CFG.TAISHIN.STANDARDS) {
    if (y === std.year) {
      logEvent(st, "🏗 " + y + ": " + std.name + " takes effect — stations can be retrofitted " +
        "to the new seismic standard (Manage station, or Retrofit All in the Build panel). " +
        "New stations are built to it automatically.", "event");
    }
  }

  // --- randomized macro events (v0.5.7 hazard deck) ---
  // The old fixed-year scripted arcs (1904/1918/1955/1964/1986/1991/2008/2020/
  // 2023) are gone; discrete named calamities/manias now roll from the deck.
  deckEvents(st);

  // --- major war (randomized; at most one per playthrough, possibly none) ---
  if (!(st.war && st.war.active)) maybeStartWar(st);
  if (st.war && st.war.active) warYearTick(st);

  // --- earthquakes ---
  // MAJOR: per-playthrough budget (cap 2, ~1%/yr, min gap — see majorQuakeAllowed).
  if (majorQuakeAllowed(st) && rnd(rng) < CFG.EVENTS.majorQuakeChance) {
    const epi = populatedHex(st, rng);
    st.events.majors.push(y);                       // spend one of the playthrough's quake slots
    const hit = applyDisaster(st, epi, { radius: 13, track: 0.55, dmgDays: [60, 150],
      floodBias: 0.3, buildings: 0.28, commerce: 0.5, landHit: 0.75, seismic: true });
    startEvent(st, { name: "Great earthquake", major: true, paxMult: 0.6, days: 270, curve: "slow",
      text: "GREAT EARTHQUAKE (epicenter " + (st.hexes[epi].name || "hex #" + st.hexes[epi].spiral) + "): " +
        hit.trackHit + " km of track wrecked" +
        (hit.floodHit ? " (" + hit.floodHit + " km flooded where the water margins surged)" : "") +
        (hit.razedHit ? ", " + hit.razedHit + " city blocks levelled outright" : "") +
        (hit.commerceHit ? ", " + hit.commerceHit + " station businesses in ruins" : "") +
        "; land values slump and the city rebuilds slowly. Repairs are on the owners." });
    queueSfx(st, "disaster_quake");
    st.econ.landBubble = Math.max(0.7, st.econ.landBubble * 0.8);
    st.econ.rebuild = { years: 3, k: 1 };           // reconstruction price pressure (updateInflation)
  }
  // MINOR: the same likelihood in 1872 and 2028 — what shrinks over the
  // years is the DAMAGE, through resilience (era/renewal, taishin, R&D), so
  // a maintained modern network visibly rides out shocks that used to wreck it.
  else if (campaignOf(st).quakes && rnd(rng) < CFG.EVENTS.minorQuakeChance) {
    const epi = randomHex();
    const hit = applyDisaster(st, epi, { radius: 6, track: 0.35, dmgDays: [15, 50],
      floodBias: 0.2, buildings: 0.10, commerce: 0.12, landHit: 0.97, seismic: true });
    if (hit.trackHit || hit.commerceHit) {
      startEvent(st, { name: "Earthquake", paxMult: 0.93, days: 60, curve: "fast",
        text: "Earthquake near " + (st.hexes[epi].name || "hex #" + st.hexes[epi].spiral) + ": " +
          (hit.trackHit ? hit.trackHit + " km of track damaged" : "") +
          (hit.trackHit && hit.commerceHit ? ", " : "") +
          (hit.commerceHit ? hit.commerceHit + " station businesses damaged" : "") + "." });
      queueSfx(st, "disaster_quake");
    } else {
      logEvent(st, "An earthquake rattles " + (st.hexes[epi].name || "the region") +
        " — the network rides it out undamaged.");
    }
  } else if (majorAllowedSoft(st) && y < 1930 && rnd(rng) < 0.008) {
    // great fire: feeds on the dense wooden city — buildings and station
    // commerce burn, but the steel rails largely survive
    const epi = randomHex();
    const hit = applyDisaster(st, epi, { radius: 6, track: 0.15, dmgDays: [30, 80],
      fireBias: true, buildings: 0.55, commerce: 0.7, landHit: 0.8 });
    startEvent(st, { name: "Great fire", major: true, paxMult: 0.8, days: 120, curve: "linear",
      text: "GREAT FIRE around hex #" + st.hexes[epi].spiral + ": " + hit.devHit + " blocks burn" +
        (hit.razedHit ? " (" + hit.razedHit + " burnt to ash)" : "") +
        (hit.commerceHit ? ", " + hit.commerceHit + " station businesses lost" : "") +
        (hit.trackHit ? "; " + hit.trackHit + " km of track scorched" : "; the rails largely survive") + "." });
    queueSfx(st, "disaster_fire");
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
    queueSfx(st, "disaster_typhoon");
  }
  // gentle random business cycle drift back toward 1.0…
  st.econ.cycle = clamp(st.econ.cycle * 0.97 + 0.03 + (rnd(rng) - 0.5) * 0.02, 0.7, 1.5);
  // …plus a coupling so booms follow real city growth (v0.5.7): a city drawing
  // migrants faster than the baseline runs hot, a shrinking one runs cold.
  st.econ.cycle = clamp(st.econ.cycle + CFG.ECON.growthCoupling * ((st.econ.popRate || 0) - CFG.POP.baseRate), 0.7, 1.5);
  // land-price mean reversion — SUSPENDED while a speculative mania is inflating
  // (the deck holds landBubble up until it bursts, see deckEvents).
  if (st.events.deck.bubble.phase !== "mania") {
    st.econ.landBubble = clamp(st.econ.landBubble * 0.96 + 0.04, 0.6, 2.5);
  }
}

/* ---- Hazard deck (v0.5.7) ----------------------------------------------------
 * Discrete, randomized macro calamities and manias — pandemics, financial
 * panics, land bubbles — replacing the old fixed-year scripted arcs. Each type
 * follows the war/quake grammar: a small per-year chance, a per-playthrough
 * cap, and a refractory gap. Magnitudes and durations are randomized; every
 * effect flows through an EXISTING channel (startEvent pax curves, econ.cycle,
 * econ.landBubble, econ.commuteFactor). Booms and mild recessions are NOT here
 * — those emerge from the endogenous business cycle. All draws use st.evRng. */
function deckEvents(st) {
  const rng = st.evRng, y = st.time.year, D = CFG.EVENTS.DECK, e = st.econ;
  const deck = st.events.deck;

  // --- land bubble: multi-year speculative mania, then a burst ---
  const B = D.bubble, bd = deck.bubble;
  if (bd.phase === "mania") {
    if (!bd.atPeak) {
      e.landBubble = Math.min(bd.target, (e.landBubble || 1) + (bd.ramp || 0));
      if (e.landBubble >= bd.target - 1e-6) bd.atPeak = true;
    }
    e.cycle = clamp(e.cycle + B.maniaCycleBoost, 0.7, 1.6);        // froth lifts the cycle mildly
    if (bd.atPeak && rnd(rng) < B.burstChancePerYear) burstBubble(st, "burst");
  } else if (bd.count < B.cap && (y - bd.lastYear) >= B.gapYears && majorAllowedSoft(st) && rnd(rng) < B.chance) {
    const peak = B.peakRange[0] + rnd(rng) * (B.peakRange[1] - B.peakRange[0]);
    const ramp = rndInt(rng, B.rampYears[0], B.rampYears[1]);
    bd.phase = "mania"; bd.target = peak; bd.atPeak = false;
    bd.ramp = (peak - (e.landBubble || 1)) / Math.max(1, ramp);
    bd.count++; bd.lastYear = y;
    logEvent(st, "📈 BUBBLE ECONOMY: land prices begin a speculative climb across the capital.", "event");
  }

  // --- financial panic / crash ---
  const PN = D.panic, pd = deck.panic;
  if (pd.count < PN.cap && (y - pd.lastYear) >= PN.gapYears && majorAllowedSoft(st) && rnd(rng) < PN.chance) {
    const hit = PN.cycleHitRange[0] + rnd(rng) * (PN.cycleHitRange[1] - PN.cycleHitRange[0]);
    e.cycle = Math.min(e.cycle, hit);
    pd.count++; pd.lastYear = y;
    logEvent(st, "💥 FINANCIAL PANIC: markets crash and the business cycle turns down sharply.", "event");
    if (bd.phase === "mania") burstBubble(st, "panic");           // a panic always pops a live mania
  }

  // --- pandemic ---
  const PD = D.pandemic, pandd = deck.pandemic;
  if (pandd.count < PD.cap && (y - pandd.lastYear) >= PD.gapYears && majorAllowedSoft(st) && rnd(rng) < PD.chance) {
    const paxMult = PD.paxMultRange[0] + rnd(rng) * (PD.paxMultRange[1] - PD.paxMultRange[0]);
    const days = rndInt(rng, PD.daysRange[0], PD.daysRange[1]);
    const preMed = y < 1950;
    const nm = preMed ? "Influenza pandemic" : "Pandemic";
    startEvent(st, { name: nm, curve: "hold", paxMult, days, pandemic: true,
      text: nm + " sweeps the region: ridership " + Math.round((1 - paxMult) * 100) +
        "% down until it burns out." });
    pandd.count++; pandd.lastYear = y;
    // era-gated permanent remote-work aftermath: only once the economy is
    // office/communications-heavy (Heisei onward) can a pandemic durably empty
    // the office market (see occupancyTarget's commuteFactor term).
    const gateIdx = CFG.ERAS.findIndex(x => x.key === PD.remoteWorkFromEra);
    const curIdx = CFG.ERAS.findIndex(x => x.key === eraOf(y).key);
    if (gateIdx >= 0 && curIdx >= gateIdx && rnd(rng) < PD.remoteWorkChance) {
      const cf = PD.commuteFactorRange[0] + rnd(rng) * (PD.commuteFactorRange[1] - PD.commuteFactorRange[0]);
      e.commuteFactor = Math.max(PD.commuteFactorFloor, (e.commuteFactor || 1) * cf);
      logEvent(st, "🏠 Remote work takes hold: commuter demand permanently reduced.", "event");
    }
  }
}

/** Pop a land bubble: land values collapse to a randomized floor and the cycle
 *  takes a knock. Called at peak (random burst roll) or by any financial panic. */
function burstBubble(st, cause) {
  const B = CFG.EVENTS.DECK.bubble, bd = st.events.deck.bubble, e = st.econ;
  const floor = B.burstFloorRange[0] + rnd(st.evRng) * (B.burstFloorRange[1] - B.burstFloorRange[0]);
  e.landBubble = floor;
  e.cycle = Math.min(e.cycle, e.cycle * 0.92);
  bd.phase = null; bd.atPeak = false; bd.ramp = 0;
  logEvent(st, "📉 The bubble bursts: land values collapse" +
    (cause === "panic" ? " as the panic hits" : "") + ".", "event");
}

/** Soft gate for non-quake calamities (pandemics, great fires): don't stack
 *  them on top of an active major event or a raging war. */
function majorAllowedSoft(st) {
  return st.events.active.every(e => !e.major) && !(st.war && st.war.active);
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
