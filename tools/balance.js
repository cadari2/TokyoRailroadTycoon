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
const files = ["js/config.js", "js/util.js", "data/machinames.js", "data/londonnames.js", "data/nycnames.js", "data/melbnames.js", "js/map.js", "js/world.js", "js/sim.js",
               "js/hr.js", "js/ai.js", "js/events.js", "js/rd.js", "js/save.js", "js/main.js"];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
}

// Usage: node tools/balance.js [seed] [campaign] [aiDifficulty]
//   campaign: tokyo | london | nyc | melbourne   aiDifficulty: easy | normal | hard
const seed = +(process.argv[2] || 424242);
const campaign = process.argv[3] || "tokyo";
const aiDiff = process.argv[4] || "";
vm.runInContext(`
  var st = newGame(${seed}, { campaign: ${JSON.stringify(campaign)},
    aiDifficulties: ${JSON.stringify(aiDiff)} ? CFG.AI.entryWindows.map(() => ${JSON.stringify(aiDiff)}) : [] });
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

  console.log("Balance trace, seed ${seed}, campaign ${campaign}" +
    (${JSON.stringify(aiDiff)} ? ", AI difficulty ${aiDiff}" : "") +
    " — * marks the player's seat (AI-driven)");
  let minCash = Infinity, insolventYears = 0;
  const lateWatch = {};                        // rival pax/day at checkpoints (late-game health)
  for (let d = 0; d < 12 * (CFG.END_YEAR - CFG.START_YEAR + 1); d++) {
    st.time.totalDays++; syncClock(st);
    if (st.time.day === 0) {
      // snapshot BEFORE onNewYear zeroes the yearly rev/cost accumulators
      if ((st.time.year - 2) % 10 === 0) snapshot();
      if ([1990, 2000, 2010, 2020, 2028].includes(st.time.year)) {
        lateWatch[st.time.year] = st.companies.filter(c => c.alive && c.id !== 0)
          .map(c => Math.round(c.stats.paxAvg)).sort((a, b) => b - a);
      }
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
  console.log("late-game rival health (pax/day, best-first):");
  for (const y of Object.keys(lateWatch)) console.log("  " + y + ": " + (lateWatch[y].join(", ") || "none alive"));
  const top2000 = (lateWatch[2000] || [0])[0], top2028 = (lateWatch[2028] || [0])[0];
  console.log("top rival pax 2000 → 2028: " + top2000 + " → " + top2028 +
    (top2028 >= top2000 ? "  (still growing ✓)" : "  (shrinking ✗)"));
`, ctx);
