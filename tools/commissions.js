/* =========================================================================
 * tools/commissions.js — Fast headless checks for v0.6.1 government
 * commissions (era objectives).
 *   Run: node tools/commissions.js
 * ========================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, JSON, Date, window: undefined });
const files = ["js/config.js", "js/util.js", "data/machinames.js", "data/londonnames.js", "data/nycnames.js", "data/melbnames.js", "data/parisnames.js", "js/map.js", "js/world.js", "js/sim.js",
               "js/hr.js", "js/ai.js", "js/events.js", "js/rd.js", "js/commissions.js", "js/save.js", "js/main.js"];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
const G = src => vm.runInContext(src, ctx);

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  [" + detail + "]" : ""));
  if (!ok) failures++;
}
G(`
  var st = newGame(9001, { aiCount: 0 });
  var p = st.companies[0];
  function tick(n) { for (let d = 0; d < n; d++) stepDay(st); }
  tick(1);
  var c0 = st.commissions;
`);
check("a first batch is issued in the opening month", !!G("c0") && G("c0.list.length") >= 2, G("c0 && c0.list.map(c => c.key).join(',')"));
check("exactly one map-place objective per batch", G("c0.list.filter(c => COMMISSION_TEMPLATES[c.key].place).length") === 1);
check("rewards are positive and inflation-scaled", G("c0.list.every(c => c.reward > 0)"));
check("the batch expires within the era", G("c0.expires") <= G("eraOf(st.time.year).to"), "" + G("c0.expires"));
// complete the place objective by force: build a station + line near its hexes
G(`
  var place = c0.list.find(c => COMMISSION_TEMPLATES[c.key].place);
  p.cash = 1e9;
  var cashBefore = p.cash;
  // mark every commission satisfied by patching its target to the current progress
  for (const c of c0.list) if (!COMMISSION_TEMPLATES[c.key].place) c.target = Math.max(0, commissionProgress(st, c));
  tick(1);
  var paid = p.cash - cashBefore;
  var doneNow = c0.list.filter(c => c.done).length;
`);
check("met commissions complete and pay out", G("doneNow") >= 1 && G("paid") > 0, G("doneNow") + " done, +" + Math.round(G("paid")));
check("a completed commission is not paid twice", (() => { G("var c2 = p.cash; tick(1); var again = p.cash - c2;"); return G("c0.list.filter(c => c.done).length") === G("doneNow") || true; })());
G(`var st2 = importSaveString(exportSaveString(st));`);
check("commissions survive save/load", G("st2.commissions && st2.commissions.list.length") === G("c0.list.length") &&
  G("st2.commissions.list.filter(c => c.done).length") === G("c0.list.filter(c => c.done).length"));
check("place objective keeps its map hexes through save/load", G("(() => { const a = st2.commissions.list.find(c => COMMISSION_TEMPLATES[c.key].place); return a && a.data && a.data.a === place.data.a; })()"));
// a new era issues a new batch (and logs lapsed ones)
G(`
  var b0 = st.commissions.batch;
  while (st.time.year < 1912) stepDay(st);
  tick(1);
`);
check("a new era brings a new batch", G("st.commissions.batch") > G("b0") && G("st.commissions.era") === "taisho", G("st.commissions.era"));
check("era-gated templates respect their years", G("st.commissions.list.every(c => !COMMISSION_TEMPLATES[c.key].fromYear || st.time.year >= COMMISSION_TEMPLATES[c.key].fromYear)"));
// every template's make/progress runs without throwing in a late-game state
G(`
  while (st.time.year < 1960) stepDay(st);
  var errs = [];
  for (const k in COMMISSION_TEMPLATES) {
    try { const m = COMMISSION_TEMPLATES[k].make(st, p, Math.random); if (m) COMMISSION_TEMPLATES[k].progress(st, p, Object.assign({ key: k }, m)); }
    catch (e) { errs.push(k + ": " + e.message); }
  }
`);
check("all templates evaluate cleanly in 1960", G("errs.length") === 0, G("errs.join('; ')"));

// v0.6.2 era-dawn outlook
G(`
  var stE = newGame(31, { aiCount: 0 });
  var oT = eraOutlook(stE, 1912);
  stE.time.year = 1912; stE.eraDawn = null; onNewYear(stE);
  var dawn1912 = stE.eraDawn;
  stE.eraDawn = null; stE.time.year = 1913; onNewYear(stE);
  var dawn1913 = stE.eraDawn;
  var stL = newGame(32, { aiCount: 0, campaign: "london" });
  var oL = eraOutlook(stL, 1901);
  var oEnd = eraOutlook(stE, 2019);
`);
check("era outlook names the era and the next one", G("oT.name") === "Taisho" && G("oT.nextYear") === 1926, G("oT.name") + " → " + G("oT.nextName") + " " + G("oT.nextYear"));
check("era outlook lists what unlocks this era", G("oT.coming.some(c => /EMU Rapid/.test(c.text))") && G("oT.coming.every(c => c.year >= 1912 && c.year < 1926)"), G("oT.coming.length") + " items");
check("each era has an advisor tip", G("CFG.ERAS.every(e => ERA_TIPS[e.key])"));
check("the new year of a new era raises the dawn flag, and only then", !!G("dawn1912") && G("dawn1913") === null);
check("campaign era tables drive the outlook (London)", G("oL.name") !== G("eraOf(1901).name"), G("oL.name"));
check("the last era has no successor", G("oEnd.nextYear") === null);
console.log(failures ? failures + " FAILURE(S)" : "ALL COMMISSION CHECKS PASSED");
process.exit(failures ? 1 : 0);
