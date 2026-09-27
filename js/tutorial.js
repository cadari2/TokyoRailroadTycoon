/* =========================================================================
 * tutorial.js — The Railway Advisor (v0.6.1).
 *
 * Two layers, both drawn as a card at the top of the side panel:
 *
 *  1. A GUIDED FIRST RAILWAY (opt-in on the start screen, on by default for a
 *     first game): a short chain of objectives — read the demand map, lay a
 *     short corridor between two busy districts, build stations, open a line,
 *     buy a train, watch the money come in, then grow. Each step checks the
 *     live game state, so the player can do things in any order; "Show me"
 *     switches to the right tab/tool, highlights the button to press and
 *     drops markers on the map. Inspired by the OpenTTD/SimCity advisors and
 *     Civilization's early-game prompts.
 *
 *  2. A CONTEXTUAL ADVISOR that keeps going afterwards: one prioritized hint
 *     at a time (a crowded line, a station no line serves, money trouble,
 *     residents fleeing rail blight, idle R&D…), each dismissable.
 *
 * Browser-only (reads the DOM through ui.js helpers); the only game state it
 * owns is st.tutorial = { on, step } (serialized by save.js).
 * ========================================================================= */
"use strict";

/* ---- helpers ------------------------------------------------------------- */
function tutPlayerTrackCount(st, p) {
  let n = 0;
  for (const h of st.hexes) if (h.track && h.track.co === p.id) n++;
  for (const b of st.builds) if (b.co === p.id && b.kind === "track") n += b.hexes.length - b.done;
  return n;
}
function tutStations(st, p, operatingOnly) {
  return st.stations.filter(s => s.alive && s.co === p.id && (!s.isDepot || s.depotAsStation) && (!operatingOnly || !s.building));
}
function tutLines(st, p) { return st.lines.filter(l => l.alive && l.co === p.id); }
/** A side-panel tab's label in the current language (e.g. "Money" → "Assets"). */
function tabName(key) { return typeof t === "function" ? t("tab." + key) : key; }

/** Pick a short, promising starter corridor: the busiest buildable district
 *  near the player's land (or the city centre) and a second busy one 4–7
 *  hexes away. Returns [a, b] hex indices or null. */
function tutSuggestCorridor(st, p) {
  const dm = demandFieldCached(st);
  const okHex = (i) => {
    const h = st.hexes[i];
    if (isNationalLand(i) || CFG.TERRAIN[h.terrain].water || h.terrain === "mountain") return false;
    if (h.track || h.stations.length) return false;
    return h.owner === -1 || h.owner === p.id;
  };
  // anchor: the player's own land if any (grants), else the centre
  let anchor = hexIdx(CFG.CENTER.col, CFG.CENTER.row);
  if (p.land && p.land.length) anchor = p.land[0];
  let a = -1, best = -1;
  for (const i of hexesWithin(anchor, 7)) {
    if (!okHex(i)) continue;
    const v = dm.field[i] / (1 + 0.05 * hexDist(i, anchor));
    if (v > best) { best = v; a = i; }
  }
  if (a < 0) return null;
  let b = -1; best = -1;
  for (const i of hexesWithin(a, 7)) {
    const d = hexDist(i, a);
    if (d < 4 || !okHex(i)) continue;
    const v = dm.field[i];
    if (v > best) { best = v; b = i; }
  }
  return b < 0 ? null : [a, b];
}
function tutFocus(G, idxs) {
  if (!idxs || !idxs.length) return;
  let x = 0, y = 0;
  for (const i of idxs) { const c = hexCenterIdx(i); x += c.x; y += c.y; }
  G.renderer.cam.x = x / idxs.length; G.renderer.cam.y = y / idxs.length;
}
function tutGo(G, tab, mode) {
  if (tab) G.ui.tab = tab;
  if (mode) { G.ui.mode = mode; G.ui.lineSel = []; G.ui.editLineId = -1; }
  if (document.body.classList.contains("sidebar-hidden")) {
    document.body.classList.remove("sidebar-hidden");
    window.dispatchEvent(new Event("resize"));
  }
  renderPanel(G);
}

/* ---- the guided steps ---------------------------------------------------
 * text(G) → string; done(G) → bool (checked live); targets(G) → CSS
 * selectors to highlight; show(G) → the "Show me" action. A step with
 * manual: true waits for the player to press "Next". */
const TUT_STEPS = [
  {
    key: "welcome", title: "Welcome, Railway President", manual: true,
    text: () => "It's " + CFG.START_YEAR + ". Nobody here has ridden a train. Your job: build railways people want to ride. " +
      "Good service brings riders; riders bring fares; and the districts around busy stations GROW — more homes, more shops, " +
      "more riders. That loop is the whole game. This advisor walks you through your first line (≈5 minutes).",
  },
  {
    key: "demand", title: "1 · Find the riders",
    text: () => "Press the Overlay button (top bar). Warm colours show where people live and work — a station there fills " +
      "up; a station in the fields stays empty.",
    done: (G) => !!G.ui.showDemand || !!G._tutSawDemand,
    targets: () => ["#demandBtn"],
    show: (G) => { G.ui.showDemand = true; G._tutSawDemand = true; const b = document.getElementById("demandBtn"); if (b) b.classList.add("active"); },
  },
  {
    key: "track", title: "2 · Lay a short corridor",
    text: (G) => tabName("Build") + " → Lay Track, then click hexes one at a time to join two warm districts 4–7 hexes apart " +
      "(each hex is " + CFG.HEX_KM + " km). The gold rings mark a good first corridor. Start SHORT: construction takes months " +
      "and money is tight. Progress: " + Math.min(4, tutPlayerTrackCount(G.st, player(G.st))) + "/4 hexes.",
    done: (G) => tutPlayerTrackCount(G.st, player(G.st)) >= 4,
    targets: () => ['[data-tab="Build"]', '[data-mode="track"]'],
    show: (G) => {
      const pair = tutSuggestCorridor(G.st, player(G.st));
      if (pair) { G.ui.tutMarks = pair; tutFocus(G, pair); }
      tutGo(G, "Build", "track");
      setStatus("Lay Track: click the hexes between the two gold rings, one at a time.");
    },
  },
  {
    key: "stations", title: "3 · Build a station at each end",
    text: (G) => tabName("Build") + " → Build Station, and click your track at each end of the corridor. Each station gathers riders from " +
      "about " + CFG.STATION.catchment + " hexes around it. Stations: " + Math.min(2, tutStations(G.st, player(G.st)).length) + "/2.",
    done: (G) => tutStations(G.st, player(G.st)).length >= 2,
    targets: () => ['[data-tab="Build"]', '[data-mode="station"]'],
    show: (G) => {
      const p = player(G.st);
      const ends = [];
      for (let i = 0; i < G.st.hexes.length; i++) if (G.st.hexes[i].track && G.st.hexes[i].track.co === p.id) ends.push(i);
      if (ends.length) { G.ui.tutMarks = [ends[0], ends[ends.length - 1]]; tutFocus(G, G.ui.tutMarks); }
      tutGo(G, "Build", "station");
    },
  },
  {
    key: "wait", title: "4 · Let the navvies work",
    text: (G) => {
      const p = player(G.st);
      const left = G.st.builds.filter(b => b.co === p.id).length + tutStations(G.st, p).filter(s => s.building).length;
      return "Construction takes time (" + left + " job" + (left === 1 ? "" : "s") + " left). Use the ⏩ speed button in the top bar, " +
        "or \"Skip ahead\" in the Build panel, to fast-forward to the next completion.";
    },
    done: (G) => {
      const p = player(G.st);
      return tutStations(G.st, p, true).length >= 2 && !G.st.builds.some(b => b.co === p.id && b.kind === "track");
    },
    targets: () => ["#speedBtn", ".skipAhead"],
    show: (G) => tutGo(G, "Build", "inspect"),
  },
  {
    key: "line", title: "5 · Open a line",
    text: () => tabName("Build") + " → Create Line, click your two stations in order, then press \"Build local\" in the panel. " +
      "A line is the route your trains run.",
    done: (G) => tutLines(G.st, player(G.st)).length >= 1,
    targets: () => ['[data-tab="Build"]', '[data-mode="line"]', ".lineBuildBtn"],
    show: (G) => {
      const ss = tutStations(G.st, player(G.st), true);
      if (ss.length) { G.ui.tutMarks = ss.slice(0, 2).map(s => s.hex); tutFocus(G, G.ui.tutMarks); }
      tutGo(G, "Build", "line");
    },
  },
  {
    key: "train", title: "6 · Buy a train",
    text: () => tabName("Lines") + " tab → click your line's name → \"Buy Train\". A steam local is fine for now. " +
      "More trains = more frequent service = riders wait less (and more of them ride).",
    done: (G) => tutLines(G.st, player(G.st)).some(l => l.trains.length > 0),
    targets: () => ['[data-tab="Lines"]', ".lhead", ".buyTrainBtn"],
    show: (G) => {
      const l = tutLines(G.st, player(G.st))[0];
      if (l) G.ui.selectedLine = l.id;
      G.ui.tutMarks = null;
      tutGo(G, "Lines");
    },
  },
  {
    key: "watch", title: "7 · Your first passengers",
    text: (G) => {
      const p = player(G.st);
      return "Trains are running! Riders/day and revenue show in the top bar and the " + tabName("Money") + " tab. " +
        (p.stats.pax > 0 ? "Right now: " + fmtNum(Math.round(p.stats.pax)) + " passengers/day. " : "Give it a month or two… ") +
        "Costs (wages, track upkeep, property tax at year end) are real — watch the " + tabName("Money") + " tab.";
    },
    done: (G) => player(G.st).stats.pax > 0,
    targets: () => ['[data-tab="Money"]'],
    show: (G) => tutGo(G, "Money"),
  },
  {
    key: "grow", title: "8 · Grow — but not everywhere", manual: true,
    text: () => "Next: extend the line or add stations where the demand map is warm; the districts around busy " +
      "stations will grow and feed you more riders. But a railway on every street helps nobody — surface track " +
      "blights the homes around it (click Overlay twice for the rail-blight map). Space your lines out; later, raise " +
      "busy ones onto viaducts (from " + CFG.VIADUCT.from + ") or put them underground.",
  },
  {
    key: "more", title: "9 · The long game", manual: true,
    text: () => tabName("Company") + " → R&D researches better trains (electric EMUs, from " + CFG.UNLOCK.electrification + "). " +
      "A depot lets a line run more than " + CFG.DEPOT.trainsPerLineNoDepot + " trains. Rivals will arrive — you can buy trackage rights " +
      "or buy them out. The game runs to " + CFG.END_YEAR + ". That's the tutorial: the advisor will keep offering tips here.",
  },
];

/* ---- the contextual advisor -------------------------------------------
 * Returns hints in priority order; the first not dismissed is shown. */
function advisorHints(G) {
  const st = G.st, p = player(st), out = [];
  if (!p || !p.alive) return out;
  const infl = inflationOf(st, st.time.year);
  const lines = tutLines(st, p);
  if (p.cash < 0) out.push({ key: "cash-neg", text: "💸 You're overdrawn. Draw a loan (" + tabName("Money") + " → Finance), raise fares, or sell idle land before the year-end tax bill." });
  else if (p.cash < 20000 * infl && lines.length) out.push({ key: "cash-low", text: "💰 Cash is running low. Property tax and station upkeep are billed at year end — keep a reserve." });
  for (const l of lines) {
    if (!l.trains.length) { out.push({ key: "notrain-" + l.id, text: "🚂 " + l.name + " has no trains — it carries nobody. " + tabName("Lines") + " tab → Buy Train.", tab: "Lines", line: l.id }); break; }
  }
  for (const l of lines) {
    if (l.trains.length && l.servedFrac !== undefined && l.servedFrac < 0.75) {
      out.push({ key: "crowd-" + l.id + "-" + Math.floor(st.time.year / 5), tab: "Lines", line: l.id,
        text: "🚃 " + l.name + " is packed — only " + Math.round(l.servedFrac * 100) + "% of its riders fit. Add trains, lengthen platforms, or double-track its busiest stretch." });
      break;
    }
  }
  const served = new Set();
  for (const l of lines) for (const sid of l.stations) served.add(sid);
  const orphan = tutStations(st, p, true).find(s => !served.has(s.id));
  if (orphan) out.push({ key: "orphan-" + orphan.id, hex: orphan.hex, text: "🏚 " + orphan.name + " has no line calling at it. Create Line (or Edit Route) to put it to work." });
  if (lines.some(l => l.trains.length >= CFG.DEPOT.trainsPerLineNoDepot) && !companyHasDepot(st, p))
    out.push({ key: "depot", text: "🛠 A line is at the " + CFG.DEPOT.trainsPerLineNoDepot + "-train limit. Build a depot on your track to run more." });
  if ((st._blightLost || 0) > (G._advBlightSeen || 0) + 2) {
    out.push({ key: "blight-" + Math.floor(st.time.year / 3), onShow: () => { G._advBlightSeen = st._blightLost; },
      text: "🏘 Families are moving out of districts hemmed in by railway (see the rail-blight Overlay). Space lines further apart, or raise track onto viaducts (" + tabName("Build") + " tab → bulk upgrades → Elevate)." });
  }
  if (p.research && !p.research.active && st.time.year >= CFG.START_YEAR + 2)
    out.push({ key: "rd-" + Math.floor(st.time.year / 4), tab: "Company", text: "🔬 Your R&D lab is idle. " + tabName("Company") + " → R&D: better trains and techniques compound over decades." });
  if (lines.length && st.time.year >= CFG.START_YEAR + 3 && tutStations(st, p, true).length < 4)
    out.push({ key: "expand-" + Math.floor(st.time.year / 5), text: "🗺 One line is a start. Extend it toward the next warm district on the demand Overlay — each new station brings in a new catchment of riders." });
  return out;
}

/* ---- rendering ------------------------------------------------------------ */
function tutorialCard(G, panel) {
  const st = G.st;
  if (!st || !player(st)) return;
  const T = st.tutorial;
  if (T && T.on) {
    const step = TUT_STEPS[T.step];
    if (!step) { T.on = false; return; }
    const box = el("div", "advisor");
    const head = el("div", "advHead");
    head.appendChild(el("span", "advTitle", "🎩 " + step.title));
    head.appendChild(el("span", "advStep", (T.step + 1) + "/" + TUT_STEPS.length));
    box.appendChild(head);
    box.appendChild(el("div", "advText", step.text(G)));
    const row = el("div", "btnrow");
    if (step.manual) {
      row.appendChild(btn(T.step + 1 >= TUT_STEPS.length ? "Finish" : "Next ▶", "ubtn go", () => tutAdvance(G)));
    } else if (step.show) {
      row.appendChild(btn("Show me", "ubtn go", () => { step.show(G); renderPanel(G); }));
    }
    row.appendChild(btn("Skip tutorial", "ubtn", () => {
      T.on = false; G.ui.tutMarks = null;
      try { localStorage.setItem("trt_tutorial_done", "1"); } catch (e) {}
      setStatus("Tutorial skipped. The advisor will still offer tips here (turn tips off in System → Settings).");
      renderPanel(G);
    }));
    box.appendChild(row);
    panel.appendChild(box);
    return;
  }
  if (G.ui.showTips === false) return;
  G._advDismissed = G._advDismissed || new Set();
  const hint = advisorHints(G).find(h => !G._advDismissed.has(h.key));
  if (!hint) return;
  if (hint.onShow) hint.onShow();
  const box = el("div", "advisor advisorTip");
  box.appendChild(el("div", "advText", hint.text));
  const row = el("div", "btnrow");
  if (hint.tab || hint.hex !== undefined) row.appendChild(btn("Show", "ubtn", () => {
    if (hint.hex !== undefined) { G.ui.selected = hint.hex; tutFocus(G, [hint.hex]); }
    if (hint.line !== undefined) G.ui.selectedLine = hint.line;
    tutGo(G, hint.tab || G.ui.tab);
  }));
  row.appendChild(btn("Dismiss", "ubtn", () => { G._advDismissed.add(hint.key); renderPanel(G); }));
  box.appendChild(row);
  panel.appendChild(box);
}

function tutAdvance(G) {
  const T = G.st.tutorial;
  if (!T) return;
  T.step++;
  G.ui.tutMarks = null;
  if (T.step >= TUT_STEPS.length) {
    T.on = false;
    try { localStorage.setItem("trt_tutorial_done", "1"); } catch (e) {}
    setStatus("Tutorial complete — good luck, President. The advisor will keep offering tips.");
  } else {
    setStatus("✔ Objective complete: " + TUT_STEPS[T.step - 1].title.replace(/^\d+ · /, "") + ". Next: " + TUT_STEPS[T.step].title.replace(/^\d+ · /, "") + ".");
    queueSfx(G.st, "milestone");
  }
  renderPanel(G);
}

/** Called at the top of renderPanel (and so on its 1.2 s refresh):
 *  auto-advance a finished objective before the card is drawn. */
function tutorialUpdate(G) {
  const T = G.st && G.st.tutorial;
  if (!T || !T.on) { G.ui.tutMarks = null; return; }
  const step = TUT_STEPS[T.step];
  if (!step) { T.on = false; return; }
  if (!step.manual && step.done && step.done(G)) {
    // advance at most one step per refresh so each completion reads clearly
    T.step++;
    G.ui.tutMarks = null;
    if (T.step >= TUT_STEPS.length) T.on = false;
    else {
      setStatus("✔ " + step.title.replace(/^\d+ · /, "") + " — done! Next: " + TUT_STEPS[T.step].title.replace(/^\d+ · /, "") + ".");
      queueSfx(G.st, "milestone");
    }
  }
}
/** Called at the end of renderPanel: glow the controls this step needs. */
function tutorialHighlight(G) {
  document.querySelectorAll(".tut-glow").forEach(e => e.classList.remove("tut-glow"));
  const T = G.st && G.st.tutorial;
  if (!T || !T.on) return;
  const step = TUT_STEPS[T.step];
  if (step && step.targets) {
    for (const sel of step.targets(G)) {
      try { document.querySelectorAll(sel).forEach(e => e.classList.add("tut-glow")); } catch (e) {}
    }
  }
}
