/* =========================================================================
 * tools/balance.js — Headless economy balance trace (Node).
 *
 * Runs the full 1872–2028 timeline with the player's seat handed to the AI
 * brain (a "reasonably-played company"), plus the normal rival roster, and
 * prints a per-decade table: cash, track-km, lines, riders, revenue vs cost.
 * Use it to sanity-check any retuning of config.js — the goal is an economy
 * where a decently-run company expands sustainably but cash NEVER runs away
 * from costs (watch the rev/cost ratio: ~1.2–3 is healthy tension, 10+ means
 * money has stopped mattering).
 *   Run: node tools/balance.js [seed]
 * ========================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, JSON, Date, window: undefined });
const files = ["js/config.js", "js/util.js", "data/machinames.js", "js/map.js", "js/world.js", "js/sim.js",
               "js/hr.js", "js/ai.js", "js/events.js", "js/rd.js", "js/save.js", "js/main.js"];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
}

const seed = +(process.argv[2] || 424242);
vm.runInContext(`
  var st = newGame(${seed});
  // Hand the player's seat to the AI brain: a stand-in for a reasonably-played
  // company, so the trace exercises the exact costs and revenues a person
  // would meet. It keeps its player id/color; only the driver changes.
  st.companies[0].isPlayer = false;
  st.companies[0].ai = { cooldown: 0, focus: null, difficulty: "normal" };

  const fmtM = v => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1000) + "k");
  function snapshot() {
    const year = st.time.year;
    for (const co of st.companies) {
      if (!co.alive) continue;
      const km = companyTrackHexes(st, co).length;
      const lines = st.lines.filter(l => l.alive && l.co === co.id).length;
      const rev = co.stats.revYear, cost = co.stats.costYear;
      const ratio = cost > 0 ? (rev / cost).toFixed(2) : "—";
      console.log(String(year).padEnd(5) + (co.id === 0 ? "*" : " ") + co.name.padEnd(24) +
        " cash " + fmtM(co.cash).padStart(8) +
        "  km " + String(km).padStart(3) +
        "  lines " + String(lines).padStart(2) +
        "  pax/day " + String(Math.round(co.stats.paxAvg)).padStart(7) +
        "  rev/yr " + fmtM(rev).padStart(8) + "  cost/yr " + fmtM(cost).padStart(8) +
        "  ratio " + String(ratio).padStart(6) +
        (co.cash < 0 ? "  ⚠ INSOLVENT" : ""));
    }
    console.log("");
  }

  console.log("Balance trace, seed ${seed} — * marks the player's seat (AI-driven)");
  let minCash = Infinity, insolventYears = 0;
  for (let d = 0; d < 12 * (CFG.END_YEAR - CFG.START_YEAR + 1); d++) {
    st.time.totalDays++; syncClock(st);
    if (st.time.day === 0) {
      // snapshot BEFORE onNewYear zeroes the yearly rev/cost accumulators
      if ((st.time.year - 2) % 10 === 0) snapshot();
      onNewYear(st);
    }
    dailyEvents(st); dailyTick(st);
    for (const co of st.companies) if (co.alive && !co.isPlayer) aiTick(st, co);
    const p = st.companies[0];
    if (p.alive) { minCash = Math.min(minCash, p.cash); if (p.cash < 0 && st.time.day === 0) insolventYears++; }
  }
  snapshot();
  console.log("player-seat minimum cash over the run: " + fmtM(minCash) +
    (insolventYears ? "  (" + insolventYears + " insolvent year-starts)" : ""));
`, ctx);
