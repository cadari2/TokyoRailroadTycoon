/* =========================================================================
 * rd.js — Research & Development. Companies (player and AI) fund research
 * into real innovations of Japan's PRIVATE suburban/commuter railways
 * (Hankyu, Keio, Tokyu, Odakyu, Seibu, Tobu…) — explicitly NOT JR or the
 * Shinkansen; this game is about private commuter competition. Each tech is
 * gated to its real-world arrival year and has a direct mechanical effect on
 * a system already in the game: land/commerce development, seismic
 * resilience, network reach, staffing cost, running cost, or crowding.
 *
 * Model (kept consistent with the rest of the game's economy):
 *   • One active project per company at a time — research is a real
 *     opportunity cost, so priorities matter.
 *   • Cost is a Meiji-scale figure × inflationOf(year), exactly like every
 *     other price; time is a fixed per-tech span in years (its R&D
 *     difficulty). You pay the cost up front and wait for completion — the
 *     same pay-then-build pattern as commerce/platform/taishin works.
 *   • Effects are company-wide multipliers (or, for resilience, an additive
 *     factor) read by the sim/hr hooks. They compose multiplicatively across
 *     techs, so stacking gives diminishing returns.
 * No DOM access.
 * ========================================================================= */
"use strict";

const RND_TECHS = {
  // Kobayashi Ichizō's Hankyu model (Minoo-Arima / Takarazuka, 1910–13): the
  // railway develops the housing and station retail along its own line.
  devmodel: {
    name: "Rail + real-estate development model", from: 1910, cost: 220000, years: 3, prereq: null,
    growthMult: 1.30, commerceMult: 1.25,
    blurb: "The Hankyu model — develop housing and retail along your own lines. Land around your stations develops faster and your station commerce earns more.",
  },
  // In-house seismic engineering after the 1923 Kantō disaster.
  taishin_rnd: {
    name: "Quake-resistant structural engineering", from: 1925, cost: 300000, years: 4, prereq: null,
    resilience: 0.35,
    blurb: "Company seismic-engineering programme. Adds structural resilience to ALL your track and stations — stacks on top of the building-code (taishin) retrofits.",
  },
  // Through-running onto subway lines (Toei Asakusa ↔ Keisei, 1960; then
  // Keio, Tokyu, Odakyu et al.): one-seat rides deep into the city.
  through_service: {
    name: "Mutual through-service with subways", from: 1962, cost: 400000, years: 3, prereq: null,
    revMult: 1.10,
    blurb: "Through-running onto subway lines: one-seat rides into the city centre capture riders who would otherwise transfer away. +10% fare revenue.",
  },
  // Automatic fare gates, pioneered at Hankyu Kitasenri in 1967 (Omron/Tateisi).
  auto_gates: {
    name: "Automatic ticket gates", from: 1967, cost: 260000, years: 2, prereq: null,
    payrollMult: 0.88,
    blurb: "Automatic fare gates (first at Hankyu Kitasenri, 1967). Leaner gatelines across the network — −12% payroll.",
  },
  // Chopper-controlled regenerative braking (Eidan 6000, 1968; private
  // railways from ~1969): power fed back to the grid.
  regen_brake: {
    name: "Regenerative braking", from: 1969, cost: 320000, years: 3, prereq: null,
    opCostMult: 0.94,
    blurb: "Regenerative braking feeds power back to the grid on electric operation. −6% permanent-way & rolling-stock running cost.",
  },
  // VVVF (variable-frequency) AC traction: Kumamoto tram 1982, private
  // railways (Tokyū 9000 etc.) from the mid-1980s. Deliberately later than
  // regenerative braking, and built on it.
  vvvf: {
    name: "VVVF inverter control", from: 1984, cost: 520000, years: 3, prereq: "regen_brake",
    opCostMult: 0.92,
    blurb: "Variable-frequency AC traction — lighter, brushless, cheaper to run and maintain. A further −8% running cost. Requires regenerative braking.",
  },
  // Contactless IC transit ticketing arrived in Japan in 2001; the private
  // railways' own PASMO followed in 2007.
  ic_card: {
    name: "IC card ticketing", from: 2001, cost: 640000, years: 3, prereq: "auto_gates",
    revMult: 1.05, payrollMult: 0.93, capacityMult: 1.06,
    blurb: "Contactless IC ticketing (the PASMO era). Better fare capture (+5% revenue), leaner staffing (−7% payroll), and faster boarding eases crowding (+6% effective capacity). Requires automatic ticket gates.",
  },
};

/** Fresh research state for a new company. */
function freshResearch() { return { done: [], active: null }; }

/** Has this company completed a given tech? */
function researchDone(co, key) {
  return !!(co && co.research && co.research.done.includes(key));
}

/** Product of a multiplier field across a company's completed techs (default
 *  1.0 — a company that has researched nothing pays/earns the normal rate). */
function rndMult(co, field) {
  let m = 1;
  if (co && co.research) for (const key of co.research.done) {
    const t = RND_TECHS[key];
    if (t && typeof t[field] === "number") m *= t[field];
  }
  return m;
}
function rndOpCostMult(co)   { return rndMult(co, "opCostMult"); }
function rndPayrollMult(co)  { return rndMult(co, "payrollMult"); }
function rndRevMult(co)      { return rndMult(co, "revMult"); }
function rndCapacityMult(co) { return rndMult(co, "capacityMult"); }
function rndCommerceMult(co) { return rndMult(co, "commerceMult"); }
function rndGrowthMult(co)   { return rndMult(co, "growthMult"); }

/** Additive structural-resilience contribution from completed R&D (0..~). */
function rndResilience(co) {
  let r = 0;
  if (co && co.research) for (const key of co.research.done) {
    const t = RND_TECHS[key];
    if (t && t.resilience) r += t.resilience;
  }
  return r;
}

/** Why company `co` can't START researching `key` right now, or null if it can. */
function canResearch(st, co, key) {
  const t = RND_TECHS[key];
  if (!t) return "No such technology.";
  if (researchDone(co, key)) return "Already researched.";
  if (co.research && co.research.active) return "A project is already under way — finish or wait for it.";
  if (st.time.year < t.from) return t.name + " isn't feasible until " + t.from + ".";
  if (t.prereq && !researchDone(co, t.prereq)) return "Requires " + RND_TECHS[t.prereq].name + " first.";
  return null;
}

/** Cost to start a tech now (Meiji figure × inflation). */
function researchCost(st, key) {
  const t = RND_TECHS[key];
  return t ? Math.round(t.cost * inflationOf(st.time.year)) : 0;
}
/** Research duration in calendar days. */
function researchDays(key) {
  const t = RND_TECHS[key];
  return t ? Math.round(t.years * 365) : 0;
}

/** Begin researching a technology: pays the cost up front and starts the
 *  countdown. The effect switches on when the project completes. */
function startResearch(st, co, key) {
  const why = canResearch(st, co, key);
  if (why) return { ok: false, msg: why };
  const cost = researchCost(st, key);
  if (co.cash < cost) return { ok: false, msg: "Need " + fmtYen(cost) + "." };
  co.cash -= cost;
  if (!co.research) co.research = freshResearch();
  co.research.active = { key, daysLeft: researchDays(key) };
  if (co.isPlayer) logEvent(st, "R&D started: " + RND_TECHS[key].name +
    " (~" + RND_TECHS[key].years + " yrs, " + fmtYen(cost) + ").", "event");
  return { ok: true, cost, days: researchDays(key) };
}

/** Techs a company could START right now (gated & prereqs met, not done, none active). */
function researchAvailable(st, co) {
  return Object.keys(RND_TECHS).filter(k => !canResearch(st, co, k));
}

/** Per-sim-day: advance the active project (each sim-day ≈ CAL_DAYS_PER_SIM_DAY
 *  calendar days). Research is funded up front, so it isn't slowed by
 *  construction crews or understaffing — labs run on their own clock. */
function processResearch(st) {
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  for (const co of st.companies) {
    if (!co.alive || !co.research || !co.research.active) continue;
    const a = co.research.active;
    a.daysLeft -= span;
    if (a.daysLeft <= 0) {
      co.research.done.push(a.key);
      co.research.active = null;
      // completing a tech may change costs/capacity/resilience → refresh derived
      if (typeof recomputeCompanyOp === "function") recomputeCompanyOp(st, co);
      st.od.dirty = true;
      if (co.isPlayer) logEvent(st, "🔬 R&D complete: " + RND_TECHS[a.key].name +
        " — " + RND_TECHS[a.key].blurb, "event");
    }
  }
}

/* ---- AI research ------------------------------------------------------------
 * Rivals research too. An idle AI with a comfortable cash cushion starts the
 * most valuable tech it can afford; difficulty sets how much it keeps in
 * reserve and how eagerly it invests (harder AIs research sooner and more
 * readily), so a Hard field out-modernizes the player if the player neglects
 * R&D. Called from the yearly AI pass.
 */
function aiResearch(st, co) {
  if (co.isPlayer || !co.alive) return;
  if (!co.research) co.research = freshResearch();
  if (co.research.active) return;
  const diff = CFG.AI.DIFFICULTIES[co.ai && co.ai.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
  const avail = researchAvailable(st, co);
  if (!avail.length) return;
  // harder AIs invest more readily (smaller reserve demanded, higher chance)
  const eager = 0.25 * diff.expandMult;
  if (rnd(st.aiRng) >= eager) return;
  // priority: pick the affordable tech that leaves a sensible reserve, favouring
  // the cheapest available so the AI keeps advancing rather than saving forever
  let best = null, bestCost = Infinity;
  for (const key of avail) {
    const cost = researchCost(st, key);
    if (co.cash < cost * (diff.bufferMult + 0.5)) continue;    // keep a cushion (bigger for cautious AIs)
    if (cost < bestCost) { bestCost = cost; best = key; }
  }
  if (best) startResearch(st, co, best);
}
