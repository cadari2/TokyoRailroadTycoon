/* =========================================================================
 * rd.js — Research & Development. Companies (player and AI) fund research
 * into real innovations of Japan's PRIVATE suburban/commuter railways
 * (Hankyu, Keio, Tokyu, Odakyu, Seibu, Tobu…) — explicitly NOT JR or the
 * Shinkansen; this game is about private commuter competition. Each tech has
 * a direct mechanical effect on a system already in the game: network
 * capacity, staffing cost, running cost, revenue capture, or crowding.
 *
 * Model (v0.6):
 *   • One active project per company at a time — research is a real
 *     opportunity cost, so priorities matter.
 *   • No calendar gates: a tech arrives when someone pays to develop it.
 *     Progression is paced by cost (early workshop-scale programmes are
 *     cheap, later electronics are dear) and by prerequisite chains.
 *   • Funding drives speed: the same project can be run lean or as a crash
 *     programme — cost and duration scale together with the funding level,
 *     so more money in means the technology is developed faster.
 *   • Licensing: once ANY company has developed a tech, others may lease it
 *     from the developer for a one-time licence fee (paid to the developer)
 *     instead of running their own programme. AI rivals both lease the
 *     player's inventions (income!) and offer theirs for lease.
 *   • A few real-world practices are NOT researched at all — they spread
 *     through the whole industry as standard strategy at their historical
 *     moment (RND_AUTO below) and switch on for every company automatically.
 *   • Effects are company-wide multipliers (or, for resilience, an additive
 *     factor) read by the sim/hr hooks. They compose multiplicatively across
 *     techs, so stacking gives diminishing returns.
 * No DOM access.
 * ========================================================================= */
"use strict";

/* ---- Industry-standard practices (automatic, never researched) -------------
 * These arrive for EVERY alive company in their historical year — they're part
 * of the era's basic railway strategy, not a lab programme. Effects are read
 * through the same rndMult/rndResilience hooks as researched techs. */
const RND_AUTO = {
  // Kobayashi Ichizō's Hankyu model (Minoo-Arima / Takarazuka, 1910–13): the
  // railway develops the housing and station retail along its own line.
  devmodel: {
    name: "Rail + real-estate development model", year: 1910,
    growthMult: 1.30, commerceMult: 1.25,
    blurb: "the Hankyu model — every railway now develops housing and retail along its own lines. Land around stations develops faster and station commerce earns more.",
  },
  // In-house seismic engineering after the 1923 Kantō disaster.
  taishin_rnd: {
    name: "Quake-resistant structural engineering", year: 1925,
    resilience: 0.35,
    blurb: "after the great quake, seismic engineering becomes standard practice. All track and stations gain structural resilience — on top of any building-code (taishin) retrofits.",
  },
  // Through-running onto subway lines (Toei Asakusa ↔ Keisei, 1960; then
  // Keio, Tokyu, Odakyu et al.): one-seat rides deep into the city.
  through_service: {
    name: "Mutual through-service with subways", year: 1962,
    revMult: 1.10,
    blurb: "through-running onto subway lines becomes the norm: one-seat rides into the city centre capture riders who would otherwise transfer away. +10% fare revenue.",
  },
};

/* ---- Researchable technologies ----------------------------------------------
 * Ordered early → late. cost is a Meiji-scale figure (× inflation at start
 * time); years is the duration at STANDARD funding (scaled by the funding
 * level chosen when the project starts). */
const RND_TECHS = {
  // Bessemer/open-hearth steel rails displaced wrought iron in the 1870s–80s.
  steel_rails: {
    name: "Steel rails", cost: 100000, years: 2, prereq: null,
    opCostMult: 0.94,
    blurb: "Steel rails replace soft wrought iron — the permanent way lasts several times longer between renewals. −6% permanent-way & rolling-stock running cost.",
  },
  // Tablet (token) block working spread through Japan's single-track lines
  // in the Meiji era, replacing timetable-and-flag operation.
  block_signal: {
    name: "Tablet block signalling", cost: 130000, years: 2, prereq: null,
    capacityMult: 1.06,
    blurb: "Single-track sections protected by tablet block instead of timetable and flag — trains follow each other closely in safety. +6% effective capacity.",
  },
  // Westinghouse automatic air brakes: continuous braking on every carriage.
  air_brake: {
    name: "Automatic air brakes", cost: 160000, years: 2, prereq: null,
    capacityMult: 1.05, opCostMult: 0.97,
    blurb: "Continuous automatic brakes on every carriage — longer, faster trains stop safely and the brakemen come down off the roofs. +5% capacity, −3% running cost.",
  },
  // Electric traction — overhead catenary + electric multiple units. The
  // backbone of the modern private commuter railway (from ~1905 in Japan).
  // Unlike the other techs its benefit is a CAPABILITY, not a multiplier:
  // enablesElec gates electrifying track and running EMU stock (see
  // canElectrify). minYear keeps it out of reach until traction historically
  // arrives — no company can develop OR license it before then.
  track_electrification: {
    name: "Track electrification", cost: 300000, years: 3, prereq: null,
    minYear: CFG.UNLOCK.electrification, enablesElec: true,
    blurb: "Overhead catenary and electric multiple units. Unlocks electrifying your track and running fast, clean EMU stock — the foundation of the modern commuter railway. Cannot be developed before electric traction reaches the country (from " + CFG.UNLOCK.electrification + ").",
  },
  // Automatic fare gates, pioneered at Hankyu Kitasenri (Omron/Tateisi).
  auto_gates: {
    name: "Automatic ticket gates", cost: 260000, years: 2, prereq: null,
    payrollMult: 0.88,
    blurb: "Automatic fare gates — first seen at Hankyu Kitasenri. Leaner gatelines across the network — −12% payroll.",
  },
  // Chopper-controlled regenerative braking: power fed back to the grid.
  regen_brake: {
    name: "Regenerative braking", cost: 320000, years: 3, prereq: "air_brake",
    opCostMult: 0.94,
    blurb: "Regenerative braking feeds power back to the grid on electric operation. −6% permanent-way & rolling-stock running cost. Requires automatic air brakes.",
  },
  // VVVF (variable-frequency) AC traction, built on regenerative braking.
  vvvf: {
    name: "VVVF inverter control", cost: 520000, years: 3, prereq: "regen_brake",
    opCostMult: 0.92,
    blurb: "Variable-frequency AC traction — lighter, brushless, cheaper to run and maintain. A further −8% running cost. Requires regenerative braking.",
  },
  // Contactless IC transit ticketing (the Suica/PASMO era).
  ic_card: {
    name: "IC card ticketing", cost: 640000, years: 3, prereq: "auto_gates",
    revMult: 1.05, payrollMult: 0.93, capacityMult: 1.06,
    blurb: "Contactless IC ticketing. Better fare capture (+5% revenue), leaner staffing (−7% payroll), and faster boarding eases crowding (+6% effective capacity). Requires automatic ticket gates.",
  },
};

/** Spec for a tech key, researched or industry-standard. */
function techSpec(key) { return RND_TECHS[key] || RND_AUTO[key] || null; }

/** Fresh research state for a new company. leased maps tech key → the
 *  developer company id it was licensed from. */
function freshResearch() { return { done: [], active: null, leased: {} }; }

/** Has this company completed a given tech (own lab, licence, or industry standard)? */
function researchDone(co, key) {
  return !!(co && co.research && co.research.done.includes(key));
}

/** Can this company electrify track & run electric stock? Electrification is now
 *  an R&D capability (track_electrification) — obtained by developing it in the
 *  lab or licensing it from a rival — rather than a free calendar unlock. The
 *  tech's own minYear still holds it to its historical arrival window. */
function canElectrify(st, co) {
  return researchDone(co, "track_electrification");
}

/** Product of a multiplier field across a company's completed techs (default
 *  1.0 — a company that has researched nothing pays/earns the normal rate). */
function rndMult(co, field) {
  let m = 1;
  if (co && co.research) for (const key of co.research.done) {
    const t = techSpec(key);
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
    const t = techSpec(key);
    if (t && t.resilience) r += t.resilience;
  }
  return r;
}

/** Why company `co` can't START researching `key` right now, or null if it can. */
function canResearch(st, co, key) {
  if (RND_AUTO[key]) return "Industry-standard practice — adopted automatically, not researched.";
  const t = RND_TECHS[key];
  if (!t) return "No such technology.";
  if (researchDone(co, key)) return "Already researched.";
  if (t.minYear && st.time.year < t.minYear) return "Not yet viable — the underlying technology only arrives in " + t.minYear + ".";
  if (co.research && co.research.active) return "A project is already under way — finish or wait for it.";
  if (t.prereq && !researchDone(co, t.prereq)) return "Requires " + techSpec(t.prereq).name + " first.";
  return null;
}

/** Cost to start a tech now at STANDARD funding (Meiji figure × inflation). */
function researchCost(st, key) {
  const t = RND_TECHS[key];
  return t ? Math.round(t.cost * inflationOf(st, st.time.year)) : 0;
}
/** Research duration in calendar days at STANDARD funding. */
function researchDays(key) {
  const t = RND_TECHS[key];
  return t ? Math.round(t.years * 365) : 0;
}

/** Funding levels a project can run at: a higher level pays a higher MONTHLY
 *  fee and the work goes proportionally faster — money in, speed out. Total
 *  spend over the (shortened) schedule still works out to standard cost ×
 *  funding, so faster carries a crash premium (see rndMonthlyFee). */
const RND_FUNDING = [
  { mult: 0.5, name: "Lean" },
  { mult: 1,   name: "Standard" },
  { mult: 2,   name: "Accelerated" },
  { mult: 3,   name: "Crash programme" },
];

/** A rival's programme "leaks" to the industry once it is at least this far
 *  along — the trigger for the rumor log the player sees (see processResearch). */
const RND_LEAK_FRAC = 0.8;

/** Name of a funding level by its multiplier (for logs / status lines). */
function fundingName(mult) {
  const f = RND_FUNDING.find(x => x.mult === mult);
  return f ? f.name : "×" + mult;
}

/** Monthly R&D fee for running `key` at funding `fund`, given the standard
 *  total cost `stdCost` (a Meiji figure × inflation, fixed when the project
 *  starts). R&D is now a running MONTHLY cost, not an up-front lump sum. The
 *  fee scales with fund² so that spending fund× as fast burns cash fund²× as
 *  quickly over a schedule fund× shorter — netting a total of stdCost × fund,
 *  i.e. the old up-front price, now paid as you go and stoppable mid-project. */
function rndMonthlyFee(key, fund, stdCost) {
  const days = researchDays(key) || 1;
  return Math.round((stdCost / days) * fund * fund * (365 / 12));
}

/** Begin researching a technology. Nothing is charged up front — the project
 *  runs on a monthly fee (rndMonthlyFee) drained by processResearch as work
 *  proceeds, and can be re-funded or halted at any time. It completes, and its
 *  effect switches on, once its standard-days of work are paid down. */
function startResearch(st, co, key, fundMult) {
  const why = canResearch(st, co, key);
  if (why) return { ok: false, msg: why };
  const fund = clamp(+fundMult || 1, 0.25, 4);
  const stdCost = researchCost(st, key);
  const fee = rndMonthlyFee(key, fund, stdCost);
  if (co.cash < fee) return { ok: false, msg: "Need " + fmtYen(fee) + "/month to fund this." };
  if (!co.research) co.research = freshResearch();
  co.research.active = { key, fund, stdDaysLeft: researchDays(key), stdCost, leaked: false };
  if (co.isPlayer) logEvent(st, "R&D started: " + RND_TECHS[key].name + " at " +
    fundingName(fund) + " funding (~" + fmtYen(fee) + "/month, ~" +
    (researchDays(key) / fund / 365).toFixed(1) + " yrs at this pace).", "event");
  return { ok: true, fee, fund };
}

/** Change the active project's funding level mid-programme: the monthly fee and
 *  the pace both change from here on; the work already done is kept. */
function setResearchFunding(st, co, fundMult) {
  if (!co.research || !co.research.active) return { ok: false, msg: "No active project." };
  co.research.active.fund = clamp(+fundMult || 1, 0.25, 4);
  return { ok: true, fund: co.research.active.fund };
}

/** Halt the active project. Research is pay-as-you-go, so nothing is refunded
 *  and the part-finished work is lost — but the lab is freed immediately to
 *  start something else. */
function stopResearch(st, co) {
  if (!co.research || !co.research.active) return { ok: false, msg: "No active project." };
  const key = co.research.active.key;
  co.research.active = null;
  if (co.isPlayer) logEvent(st, "R&D halted: " + RND_TECHS[key].name +
    " shelved — the part-finished work is written off.", "event");
  return { ok: true, key };
}

/** Fraction (0..1) of the way through a company's active project, or 0 if idle. */
function researchProgress(co) {
  const a = co && co.research && co.research.active;
  if (!a) return 0;
  const total = researchDays(a.key) || 1;
  return clamp(1 - a.stdDaysLeft / total, 0, 1);
}

/* ---- Licensing ---------------------------------------------------------------
 * Once a company has DEVELOPED a tech in its own lab, other companies may
 * lease it for a one-time licence fee paid to the developer — no waiting, no
 * lab. Licensed techs can't be re-licensed onward (only the developer sells). */

/** One-time licence fee for a tech (a discount on developing it yourself). */
function leasePrice(st, key) {
  return Math.round(researchCost(st, key) * 0.6);
}

/** Alive companies (other than co) that developed `key` themselves and can
 *  license it out. */
function leaseSources(st, co, key) {
  return st.companies.filter(c => c.alive && c.id !== co.id && c.research &&
    c.research.done.includes(key) &&
    !(c.research.leased && c.research.leased[key] !== undefined));
}

/** Why company `co` can't LEASE `key` right now, or null if it can. Leasing is
 *  instant and doesn't occupy the company's own lab. */
function canLease(st, co, key) {
  if (RND_AUTO[key]) return "Industry-standard practice — adopted automatically.";
  const t = RND_TECHS[key];
  if (!t) return "No such technology.";
  if (researchDone(co, key)) return "Already in service.";
  if (co.research && co.research.active && co.research.active.key === key)
    return "Already developing it in your own lab.";
  if (t.prereq && !researchDone(co, t.prereq)) return "Requires " + techSpec(t.prereq).name + " first.";
  if (!leaseSources(st, co, key).length) return "No company has developed this yet.";
  return null;
}

/** Lease `key` from `fromCo` (or the first available developer): the fee is
 *  paid to the developer and the tech enters service immediately. */
function leaseTech(st, co, key, fromCo) {
  const why = canLease(st, co, key);
  if (why) return { ok: false, msg: why };
  const owner = fromCo && fromCo.alive ? fromCo : leaseSources(st, co, key)[0];
  const price = leasePrice(st, key);
  if (co.cash < price) return { ok: false, msg: "Need " + fmtYen(price) + "." };
  co.cash -= price;
  owner.cash += price;
  if (!co.research) co.research = freshResearch();
  co.research.done.push(key);
  if (!co.research.leased) co.research.leased = {};
  co.research.leased[key] = owner.id;
  if (RND_TECHS[key].enablesElec) co.elecDefault = true;   // build electric from here on
  if (typeof recomputeCompanyOp === "function") recomputeCompanyOp(st, co);
  st.od.dirty = true;
  if (co.isPlayer) {
    logEvent(st, "🔬 Licensed: " + RND_TECHS[key].name + " from " + owner.name +
      " for " + fmtYen(price) + " — in service immediately.", "event");
    queueSfx(st, "research_done");
  } else if (owner.isPlayer) {
    logEvent(st, "💼 " + co.name + " licenses your " + RND_TECHS[key].name +
      " for " + fmtYen(price) + " — the fee is credited to your account.", "event");
  }
  return { ok: true, price, owner };
}

/** Techs a company could START right now (prereqs met, not done, none active). */
function researchAvailable(st, co) {
  return Object.keys(RND_TECHS).filter(k => !canResearch(st, co, k));
}

/** Industry-standard practices: grant each RND_AUTO tech to every alive
 *  company once its year arrives. Idempotent and cheap — called every sim-day
 *  from processResearch so new-year, save-load and debug skips all catch up. */
function processAutoTechs(st) {
  for (const key in RND_AUTO) {
    const t = RND_AUTO[key];
    if (st.time.year < t.year) continue;
    // the London campaign has no earthquakes — seismic practice never applies
    if (key === "taishin_rnd" && st.campaign === "london") continue;
    for (const co of st.companies) {
      if (!co.alive) continue;
      if (!co.research) co.research = freshResearch();
      if (co.research.done.includes(key)) continue;
      co.research.done.push(key);
      if (typeof recomputeCompanyOp === "function") recomputeCompanyOp(st, co);
      st.od.dirty = true;
      if (co.isPlayer) logEvent(st, "🏙 " + t.year + ": " + t.name +
        " becomes standard industry practice — " + t.blurb, "event");
    }
  }
}

/** Per-sim-day: adopt industry standards and advance the active project (each
 *  sim-day ≈ CAL_DAYS_PER_SIM_DAY calendar days). Research is funded up
 *  front, so it isn't slowed by construction crews or understaffing — labs
 *  run on their own clock. */
function processResearch(st) {
  processAutoTechs(st);
  const span = CFG.CAL_DAYS_PER_SIM_DAY;
  for (const co of st.companies) {
    if (!co.alive || !co.research || !co.research.active) continue;
    const a = co.research.active;
    const total = researchDays(a.key) || 1;
    // funding buys speed: this tick advances span×fund standard-days of work…
    const work = Math.min(a.stdDaysLeft, span * a.fund);
    // …and bills the matching slice of the fund²-scaled programme cost.
    co.cash -= (a.stdCost / total) * work * a.fund;
    a.stdDaysLeft -= work;
    if (a.stdDaysLeft <= 0) {
      co.research.done.push(a.key);
      co.research.active = null;
      if (RND_TECHS[a.key].enablesElec) co.elecDefault = true;   // build electric from here on
      // completing a tech may change costs/capacity/resilience → refresh derived
      if (typeof recomputeCompanyOp === "function") recomputeCompanyOp(st, co);
      st.od.dirty = true;
      if (co.isPlayer) { logEvent(st, "🔬 R&D complete: " + RND_TECHS[a.key].name +
        " — " + RND_TECHS[a.key].blurb, "event"); queueSfx(st, "research_done"); }
    } else if (!co.isPlayer && !a.leaked && (1 - a.stdDaysLeft / total) >= RND_LEAK_FRAC) {
      // a rival's programme leaks once it's clearly near completion — a rumor the
      // player can act on (license it from them, or race to finish their own).
      a.leaked = true;
      logEvent(st, "🕵 Industry rumor: " + co.name + " is said to be close to perfecting " +
        RND_TECHS[a.key].name + ".", "event");
    }
  }
}

/* ---- AI research ------------------------------------------------------------
 * Rivals research too. An idle AI with a comfortable cash cushion picks the
 * cheapest way to its next tech — licensing it from whoever developed it
 * (fee paid to the developer, possibly the player) when that's cheaper, or
 * running its own programme otherwise. Difficulty sets how much it keeps in
 * reserve and how eagerly it invests (harder AIs invest sooner and more
 * readily), so a Hard field out-modernizes the player if the player neglects
 * R&D. Called from the yearly AI pass.
 */
function aiResearch(st, co) {
  if (co.isPlayer || !co.alive) return;
  if (!co.research) co.research = freshResearch();
  const diff = CFG.AI.DIFFICULTIES[co.ai && co.ai.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
  // harder AIs invest more readily (smaller reserve demanded, higher chance)
  const eager = 0.25 * diff.expandMult;
  if (rnd(st.aiRng) >= eager) return;
  // cheapest affordable route to a new tech, own lab or licence, keeping a
  // sensible cash cushion (bigger for cautious AIs)
  let best = null, bestCost = Infinity, bestOwner = null;
  if (!co.research.active) for (const key of researchAvailable(st, co)) {
    const cost = researchCost(st, key);
    if (co.cash < cost * (diff.bufferMult + 0.5)) continue;
    if (cost < bestCost) { bestCost = cost; best = key; bestOwner = null; }
  }
  for (const key of Object.keys(RND_TECHS)) {
    if (canLease(st, co, key)) continue;
    const price = leasePrice(st, key);
    if (co.cash < price * (diff.bufferMult + 0.5)) continue;
    if (price < bestCost) { bestCost = price; best = key; bestOwner = leaseSources(st, co, key)[0]; }
  }
  if (best) {
    if (bestOwner) leaseTech(st, co, best, bestOwner);
    else startResearch(st, co, best, 1);
  }
}
