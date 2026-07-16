/* =========================================================================
 * ui.js — Retro business-sim interface: top bar, tabbed side panel
 * (Build / Lines / Finance / Companies / Log / System), canvas interaction
 * modes, modals, status bar. All dynamic text uses textContent (XSS-safe).
 * ========================================================================= */
"use strict";

/* tiny DOM helper */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(label, cls, onClick) {
  const b = el("button", cls, label);
  b.addEventListener("click", onClick);
  return b;
}

function setStatus(text) { document.getElementById("statusbar").textContent = text; }
/** Status message for a rejected action ("can't build here"), with a buzz. */
function denyStatus(st, text) { setStatus(text); queueSfx(st, "invalid_action"); }

/* ---- Campaign unlock chain (v0.5.6) ----------------------------------------
 * Progress is remembered in localStorage across sessions:
 *   trt_completions — per-campaign completion record { done, hard }: `done`
 *     means the player reached the victory screen with their company alive
 *     (any difficulty); `hard` means at least one such completion was played
 *     at muzukashii difficulty or higher (player class hardness >= 2).
 *   trt_unlocked — campaigns proven earned some other way (e.g. loading a
 *     save file of that campaign from another browser).
 * The rules themselves live in CFG.CAMPAIGNS[key].unlock (requires/hardCount):
 *   London     — complete Tokyo (any difficulty).
 *   New York   — complete Tokyo AND London, at least ONE of them at
 *                muzukashii or higher.
 *   Melbourne  — complete Tokyo, London AND New York, at least TWO of them
 *                at muzukashii or higher.
 */
const LONDON_FLAG = "trt_london_unlocked";           // legacy pre-v0.5.6 flag (still honored)
const COMPLETIONS_KEY = "trt_completions";
const UNLOCKED_KEY = "trt_unlocked";
function lsGetJSON(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function lsSetJSON(key, obj) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(obj)); }
  catch (e) { /* ignore */ }
}
/** The per-campaign completion record (see header comment). The legacy London
 *  flag is folded in as a Tokyo completion so pre-v0.5.6 progress carries over. */
function readCompletions() {
  const comps = lsGetJSON(COMPLETIONS_KEY) || {};
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(LONDON_FLAG) === "1") {
      comps.tokyo = comps.tokyo || { done: true, hard: false };
      comps.tokyo.done = true;
    }
  } catch (e) { /* ignore */ }
  return comps;
}
/** Record a finished playthrough (victory screen, company alive). */
function recordCompletion(campaignKey, playerClass) {
  const key = campaignOf(campaignKey).key;
  const cls = CFG.PLAYER_CLASSES[playerClass];
  const hard = !!cls && (cls.hardness || 0) >= 2;    // muzukashii (shizoku) or higher
  const comps = lsGetJSON(COMPLETIONS_KEY) || {};
  const rec = comps[key] || { done: false, hard: false };
  rec.done = true;
  rec.hard = rec.hard || hard;
  comps[key] = rec;
  lsSetJSON(COMPLETIONS_KEY, comps);
}
/** Loading a save file of a locked campaign proves it was earned elsewhere. */
function unlockCampaignBySave(campaignKey) {
  const key = campaignOf(campaignKey).key;
  const u = lsGetJSON(UNLOCKED_KEY) || {};
  if (!u[key]) { u[key] = true; lsSetJSON(UNLOCKED_KEY, u); }
}
/** Whether a campaign is currently playable, per the registry rules. */
function campaignUnlocked(key) {
  const spec = CFG.CAMPAIGNS[key];
  if (!spec) return false;
  if (!spec.unlock) return true;
  const manual = lsGetJSON(UNLOCKED_KEY) || {};
  if (manual[key]) return true;
  const comps = readCompletions();
  const req = spec.unlock.requires;
  if (!req.every(r => comps[r] && comps[r].done)) return false;
  const hardDone = req.filter(r => comps[r] && comps[r].hard).length;
  return hardDone >= (spec.unlock.hardCount || 0);
}
/** Human description of what still locks a campaign (start-screen hint). */
function campaignLockHint(key) {
  const spec = CFG.CAMPAIGNS[key];
  if (!spec || !spec.unlock) return "";
  const req = spec.unlock.requires.map(r => CFG.CAMPAIGNS[r].title);
  let s = "complete " + req.join(", ").replace(/, ([^,]*)$/, " and $1") + " (victory screen)";
  if (spec.unlock.hardCount > 0) {
    s += ", at least " + (spec.unlock.hardCount === 1 ? "one" : "two") +
      " of them at 難しい Muzukashii difficulty or higher";
  }
  return s;
}
// legacy helpers (Phase 11 API, kept for save.js compatibility paths)
function londonUnlocked() { return campaignUnlocked("london"); }
function unlockLondon() {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(LONDON_FLAG, "1"); } catch (e) { /* ignore */ }
}

function player(st) { return st.companies.find(c => c.isPlayer); }

/* ---- Campaign-flavoured labels (v0.5.3) ---- */
/** The sovereign landholder of the palace grounds: the Imperial Household in
 *  Tokyo, the Crown (House of Windsor) in London. Label only — the national-
 *  land rules are identical in both campaigns. */
function crownName(st) { return campaignOf(st).crown; }
/** Kind of land the palace grounds are (royal/city/crown/national land). */
function crownLandWord(st) { return campaignOf(st).crownLand; }
/** Player-facing name of a construction type — London's farms grow wheat, not rice. */
const CONS_LABELS = {
  rice: "rice paddies", road: "road", house: "houses", apartment: "apartments",
  shop: "shops", school: "school", civic: "civic hall",
  office_s: "small office", office_l: "office building",
};
function consName(st, key) {
  if (key === "rice" && st && campaignOf(st).wheat) return "wheat";
  return CONS_LABELS[key] || key;
}
/** Player-facing names of the one-of-a-kind landmark hexes (h.landmark). */
const LANDMARK_NAMES = {
  imperial_palace: "The Imperial Palace",
  parliament: "The Palace of Westminster (Houses of Parliament)",
  castle: "Castle",
  london_bridge: "London Bridge",
  tower_bridge: "Tower Bridge",
};

/* ---- Modal ---- */
function openModal(title, bodyEl, buttons) {
  const m = document.getElementById("modal"), box = document.getElementById("modalBox");
  box.textContent = "";
  box.appendChild(el("div", "modalTitle", title));
  box.appendChild(bodyEl);
  const row = el("div", "modalBtns");
  for (const [label, fn] of buttons) row.appendChild(btn(label, "ubtn", () => { closeModal(); if (fn) fn(); }));
  box.appendChild(row);
  m.classList.remove("hidden");
}
function closeModal() { document.getElementById("modal").classList.add("hidden"); }
document.getElementById("modal").addEventListener("click", e => {
  if (e.target.id === "modal") closeModal();
});

/* =========================================================================
 * Panels
 * ========================================================================= */
// v0.5 UI tidy: nine tabs collapsed to five. Each parent tab owns one or more
// sub-panels (the old tabs, now behind an in-panel sub-tab row).
const TABS = ["Build", "Lines", "Money", "Company", "System"];
const SUBPANELS = {
  Build:   [["Build", buildPanel]],
  Lines:   [["Lines", linesPanel]],
  Money:   [["Finance", financePanel], ["Property", propertiesPanel]],
  Company: [["R&D", researchPanel], ["Workforce", workforcePanel], ["Rivals", companiesPanel]],
  System:  [["Settings", systemPanel], ["Log", logPanel]],
};
// legacy / deep-link tab names → [parent tab, sub-panel label]
const LEGACY_TAB = {
  Finance: ["Money", "Finance"], Property: ["Money", "Property"],
  "R&D": ["Company", "R&D"], Workforce: ["Company", "Workforce"], Companies: ["Company", "Rivals"],
  Log: ["System", "Log"], Settings: ["System", "Settings"],
};

/** (Re)build the tab bar, labelling each button in the active language while
 *  keeping its English key for routing/highlighting (G._tabBtns). */
function buildTabs(G) {
  const ui = G.ui, tabs = document.getElementById("tabs");
  tabs.textContent = "";
  G._tabBtns = [];
  for (const key of TABS) {
    const b = btn(t("tab." + key), "tab", () => { ui.tab = key; renderPanel(G); });
    G._tabBtns.push([key, b]);
    tabs.appendChild(b);
  }
}

/** Switch language: persist, relabel the persistent chrome, and re-render.
 *  Rebuilds the start screen too if it's currently showing. */
function applyLang(G, lang) {
  setLang(lang);
  buildTabs(G);
  syncTopbarLabels(G);
  const startScreen = document.getElementById("startScreen");
  if (startScreen && !startScreen.classList.contains("hidden")) buildStartScreen(G, G._savedExists, G._startResumable);
  renderPanel(G);
}

/** Push localized text onto the static top-bar controls. */
function syncTopbarLabels(G) {
  const set = (id, key) => { const e = document.getElementById(id); if (e) e.textContent = t(key); };
  set("title", "top.title");
  set("demandBtn", "top.demand");
  const pause = document.getElementById("pauseBtn");
  if (pause) pause.textContent = t(G && G.ui && G.ui.paused ? "top.resume" : "top.pause");
  const menu = document.getElementById("menuBtn");
  if (menu) menu.textContent = document.body.classList.contains("sidebar-hidden")
    ? t("top.menu") : "✕ " + t("top.menu").replace("☰ ", "");
}

function initUI(G) {
  const ui = G.ui;
  ui.subtab = ui.subtab || {};
  buildTabs(G);
  ui.tab = "Build";
  syncTopbarLabels(G);
  renderPanel(G);
  initCanvasInput(G);
  document.getElementById("pauseBtn").addEventListener("click", () => {
    ui.paused = !ui.paused;
    document.getElementById("pauseBtn").textContent = t(ui.paused ? "top.resume" : "top.pause");
  });
  // Show/hide the side menu (works on desktop and mobile). Hiding it lets the
  // map fill the screen — essential on a phone where the panel would otherwise
  // eat most of the width. On desktop the map reflows, so we nudge a resize to
  // refit the canvas; on mobile the panel overlays the map (no refit needed).
  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn) {
    const syncMenuBtn = () => {
      const hidden = document.body.classList.contains("sidebar-hidden");
      menuBtn.textContent = hidden ? t("top.menu") : "✕ " + t("top.menu").replace("☰ ", "");
      menuBtn.classList.toggle("active", !hidden);
    };
    menuBtn.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-hidden");
      syncMenuBtn();
      // refit the canvas to the new map width (desktop); harmless on mobile
      if (typeof Event === "function") window.dispatchEvent(new Event("resize"));
    });
    // Start with the panel hidden on small screens so the map is visible first.
    if (window.innerWidth <= 760) document.body.classList.add("sidebar-hidden");
    syncMenuBtn();
  }
  const demandBtn = document.getElementById("demandBtn");
  if (demandBtn) demandBtn.addEventListener("click", () => {
    ui.showDemand = !ui.showDemand;
    demandBtn.classList.toggle("active", ui.showDemand);
    setStatus(ui.showDemand ? "Demand heatmap on: warmer = more latent riders nearby (where to build)."
      : "Demand heatmap off.");
  });
  // quick audio mute toggle (full volume control lives in the System panel)
  const audioBtn = document.getElementById("audioBtn");
  if (audioBtn) {
    const syncAudioBtn = () => {
      const muted = typeof audioMuted === "function" && audioMuted();
      audioBtn.textContent = muted ? "🔇" : "🔊";
      audioBtn.classList.toggle("active", !muted);
    };
    audioBtn.addEventListener("click", () => {
      if (typeof toggleAudioMuted === "function") toggleAudioMuted();
      syncAudioBtn();
      setStatus((typeof audioMuted === "function" && audioMuted()) ? "Audio muted." : "Audio on.");
    });
    syncAudioBtn();
  }
  document.getElementById("debugBtn").addEventListener("click", () => openDebugSkipModal(G));
  // clicking the news ticker jumps to the full event log
  const ticker = document.getElementById("ticker");
  if (ticker) ticker.addEventListener("click", () => {
    ui.tab = "System";
    ui.subtab.System = "Log";
    if (document.body.classList.contains("sidebar-hidden")) document.getElementById("menuBtn").click();
    renderPanel(G);
  });
  setInterval(() => {
    // periodic panel refresh unless the user is typing in it
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT")) return;
    if (document.getElementById("modal").classList.contains("hidden")) renderPanel(G);
  }, 1200);
}

function renderTopbar(G) {
  const st = G.st, p = player(st);
  const t = st.time;
  const phase = dayPhase(t.frac);
  // the year runs on a 12-month calendar; each month plays a representative day
  const camp = campaignOf(st);
  // browser-tab title + topbar brand follow the campaign (guarded — every frame)
  const wantTitle = camp.title + " Railroad Tycoon — 1872–2028";
  if (typeof document !== "undefined" && document.title !== wantTitle) document.title = wantTitle;
  const brandEl = document.getElementById("title");
  const wantBrand = "■ " + camp.title.toUpperCase() + " RAILROAD TYCOON";
  if (brandEl && brandEl.textContent !== wantBrand) brandEl.textContent = wantBrand;
  const eraLabel = camp.key === "tokyo" ? eraYearLabel(t.year) : eraDisplayName(st, t.year);
  setCurrency(campaignCurrency(st));         // Melbourne's 1966 £→$ changeover applies live
  document.getElementById("clock").textContent =
    eraLabel + " (" + t.year + ") · " + monthName(t.day) +
    " · " + seasonOf((t.day + t.frac) / 12) + " · " + phase.name;
  document.getElementById("cash").textContent = p ? fmtYen(p.cash) : "";
  document.getElementById("pax").textContent = p ? fmtNum(p.stats.pax) + " pax/day (you)" : "";
  const popEl = document.getElementById("pop");
  if (popEl) popEl.textContent = camp.title + " pop. " + fmtNum(st.totalPop ?? totalPopulation(st));
  renderTicker(G);
}

/** Year label for log/ticker datelines: the Japanese era-year for Tokyo
 *  ("Meiji 5"), the plain year everywhere else ("1872"). */
function logYearLabel(st, year) {
  return st && st.campaign !== "tokyo" ? "" + year : eraYearLabel(year);
}

/** News ticker under the top bar: the latest event-log entry, refreshed only
 *  when a new entry lands (clicking it opens the full log — see initUI). */
function renderTicker(G) {
  const tick = document.getElementById("ticker");
  if (!tick) return;
  const log = G.st.events.log;
  const last = log.length ? log[log.length - 1] : null;
  if (tick._shown === last) return;
  tick._shown = last;
  tick.textContent = "";
  if (!last) return;
  tick.appendChild(el("span", "dim", "📰 " + logYearLabel(G.st, last.year) + " · " + monthName(last.day) + " — "));
  tick.appendChild(document.createTextNode(last.text));
}

/** Average passengers passing through a station on the most recent simulated
 *  day (boardings + alightings). */
function stationPaxDay(s) { return Math.round((s && s.paxDay) || 0); }

/** Alive lines that serve (pass through) a station, by station id. */
function linesAtStation(st, sid) {
  return st.lines.filter(l => l.alive && l.stations && l.stations.includes(sid));
}

/** Short service-type label for a line, e.g. "local", "express", or
 *  "local · loop" for a one-way loop circuit. */
function lineTypeLabel(line) {
  return line.type + (line.loop ? " · loop" : "");
}

/** "Name (type[, passes])" for a line through a station — surfaces each line's
 *  name and whether it's a local/express service that stops or merely passes. */
function lineThroughLabel(st, line, sid) {
  return line.name + " (" + lineTypeLabel(line) + (line.stops[sid] ? "" : ", passes") + ")";
}

/** A compact 4-tile summary strip drawn atop every panel (the "summary-first"
 *  goal of the v0.5 UI tidy): the numbers a player checks constantly, so they
 *  don't have to open Finance to see them. */
function statTiles(G, panel) {
  const st = G.st, p = player(st);
  const netWorth = Math.round(companyValue(st, p) - (p.debt || 0));
  const net = Math.round(p.stats.revToday - p.stats.costToday);
  const tiles = [
    ["year", "stat.year", st.time.year + " · " + eraDisplayName(st, st.time.year)],
    ["cash", "stat.cash", fmtYen(p.cash)],
    ["networth", "stat.networth", fmtYen(netWorth)],
    ["netday", "stat.netday", (net >= 0 ? "+" : "") + fmtYen(net)],
  ];
  const wrap = el("div", "statTiles");
  for (const [id, key, v] of tiles) {
    const tile = el("div", "statTile");
    tile.appendChild(el("div", "statK", t(key)));
    const valEl = el("div", "statV", v);
    if (id === "networth" && p.debt > 0) valEl.classList.add("warn");     // net of debt
    if (id === "netday" && net < 0) valEl.classList.add("warn");
    tile.appendChild(valEl);
    wrap.appendChild(tile);
  }
  panel.appendChild(wrap);
}

function renderPanel(G) {
  const ui = G.ui, panel = document.getElementById("panel");
  if (!ui.subtab) ui.subtab = {};
  // normalize a legacy / deep-link tab name (e.g. "Finance", "Log") into its
  // new parent tab + sub-panel, so old callers and saved UI state still route.
  if (LEGACY_TAB[ui.tab]) { const [par, sub] = LEGACY_TAB[ui.tab]; ui.subtab[par] = sub; ui.tab = par; }
  if (!SUBPANELS[ui.tab]) ui.tab = "Build";
  for (const [key, b] of (G._tabBtns || [])) b.classList.toggle("active", key === ui.tab);
  panel.textContent = "";
  if (ui.selected >= 0 && ui.selected < G.st.hexes.length) selectionBox(G, panel);
  statTiles(G, panel);
  const subs = SUBPANELS[ui.tab];
  let sub = ui.subtab[ui.tab];
  if (!subs.some(s => s[0] === sub)) sub = subs[0][0];
  ui.subtab[ui.tab] = sub;
  if (subs.length > 1) {
    const row = el("div", "subtabs");
    for (const [label] of subs)
      row.appendChild(btn(t("sub." + label), "subtab" + (label === sub ? " active" : ""),
        () => { ui.subtab[ui.tab] = label; renderPanel(G); }));
    panel.appendChild(row);
  }
  (subs.find(s => s[0] === sub)[1])(G, panel);
}

/** A titled section that folds its body away; open-state persists in ui.collapse
 *  so a re-render keeps it as the player left it. Used to tuck secondary detail
 *  out of sight (the v0.5 "less visible text" goal). */
function collapsible(G, parent, key, title, buildBody, defaultOpen) {
  const ui = G.ui; if (!ui.collapse) ui.collapse = {};
  const open = ui.collapse[key] ?? !!defaultOpen;
  parent.appendChild(btn((open ? "▾ " : "▸ ") + title, "collapseHead",
    () => { ui.collapse[key] = !open; renderPanel(G); }));
  if (open) { const body = el("div", "collapseBody"); buildBody(body); parent.appendChild(body); }
}

/* ---- Persistent tile inspector (stays until deselected) ---- */
function selectionBox(G, panel) {
  const st = G.st, ui = G.ui, p = player(st);
  const idx = ui.selected, h = st.hexes[idx];
  const box = el("div", "selbox");
  const head = el("div", "lhead", (h.name ? h.name + " " : "") + "Hex #" + h.spiral);
  box.appendChild(head);
  const add = (k, v) => {
    const r = el("div", "small");
    r.appendChild(el("span", "dim", k + ": "));
    r.appendChild(document.createTextNode(v));
    box.appendChild(r);
  };
  add("Terrain", h.terrain + (CFG.TERRAIN[h.terrain].needsTunnel ? " (tunnel required)"
    : CFG.TERRAIN[h.terrain].water ? " (open water — causeway or reclamation)"
    : CFG.TERRAIN[h.terrain].bridge ? " (bridge required)" : ""));
  if (h.cons) {
    add("Construction", consName(st, h.cons) + " (development " + h.dev + "/5)" +
      (h.owner === -4 ? " — public building" : ""));
    // property economics (v0.5.5): what this building earns/costs its owner
    if ((CFG.CONS[h.cons].rentMult || 0) > 0 && !h.track && !h.stations.length) {
      const v = h.value || landPrice(st, idx);
      const occ = h.owner >= 0 ? occupancyOf(h) : occupancyTarget(st, idx);
      const rentNow = Math.round(estimatedRentYear(st, v, h.dev, h.cons, occ));
      const upkeep = Math.round((CFG.CONS[h.cons].upkeepYear || 0) * inflationOf(st, st.time.year));
      const tax = Math.round(v * CFG.LAND.taxYearly);
      add("Occupancy", Math.round(occ * 100) + "%" + (h.owner >= 0 ? "" : " (district estimate — tenants stay through a sale)"));
      add(h.owner >= 0 ? "Rent" : "Rent if bought", "~" + fmtYen(rentNow) + "/yr at current occupancy (up to " +
        fmtYen(estimatedRentYear(st, v, h.dev, h.cons)) + "/yr full)");
      add("Building upkeep", "~" + fmtYen(upkeep) + "/yr — owed even when empty");
      add("Property tax", "~" + fmtYen(tax) + "/yr (year-end levy on all owned land)");
    } else if (h.cons === "rice") {
      add("Note", "farmland earns no rent — develop the parcel after buying it");
    }
  }
  if (h.landmark) add("Landmark", LANDMARK_NAMES[h.landmark] || h.landmark);
  add("Residents", fmtNum(hexPop(h)));
  add("Commerce population", fmtNum(hexAtt(h)) + " (workers, shoppers, visitors drawn here daily)");
  add("Area demand", fmtNum(Math.round(demandFieldCached(st).field[idx])) +
    " (latent riders a station here could draw — toggle the Demand map up top)");
  const national = isNationalLand(idx);
  const owner = h.owner >= 0 ? st.companies[h.owner] : null;
  if (national) {
    add("Owner", crownName(st) + " — " + crownLandWord(st));
    add("Status", "Not for sale, not buildable. Route lines around the palace.");
  } else if (h.owner === -2) {
    add("Owner", (h.holdout || "private landowner") + " — refuses to sell at any price");
  } else if (h.owner === -3) {
    add("Owner", "Government — highway land (never for sale)");
  } else if (h.owner === -4) {
    add("Owner", "The town — public " + (h.cons === "school" ? "school" : "institution") + " (never for sale)");
  } else {
    add("Owner", owner ? owner.name + (owner.isPlayer ? " (you)" : "") : "unowned");
  }
  if (h.kaido) {
    const kroute = CFG.KAIDO.ROUTES[h.kaido.route] || {};
    add(st.campaign === "tokyo" ? "Kaidō" : "Road", (kroute.name || h.kaido.route) + " — " +
      (h.kaido.state === "highway" ? "expressway" : h.kaido.state === "paved" ? "paved road" : "dirt road"));
    add("Crossing rights", (hasKaidoRights(h, p.id) ? "held (you may lay track across)" :
      fmtYen(kaidoRightsCost(st, idx)) + " one-time to lay track across") +
      " — non-exclusive: each railway buys its own rights and they can share the corridor");
  }
  if (!national && h.owner === -1) add("Purchase price", fmtYen(landPrice(st, idx)));
  else if (!national && h.owner !== -2 && h.owner !== -4) add("Assessed value", fmtYen(h.value || landPrice(st, idx)));
  if (owner && !owner.isPlayer) {
    const ask = landOfferPrice(st, p, idx);
    add("Asking price", ask === null ? "not for sale (infrastructure/plans on it)" : fmtYen(ask));
  }
  if (h.track) {
    const tco = st.companies[h.track.co];
    const railStr = trackRailList(h.track).map(r => CFG.GAUGES[r.gauge].name +
      (r.elec ? " ⚡" : "") + (r.building ? " (building)" : "")).join(" + ");
    add("Track", (tco ? tco.name : "?") + " · " + railStr +
      (h.track.tunnel ? " · tunnel" : "") +
      (h.track.dmg ? " · DAMAGED (" + Math.ceil(h.track.dmg) + " days to repair)" : ""));
  }
  for (const sid of h.stations) {
    const s = st.stations[sid];
    if (!s.alive) continue;
    const sco = st.companies[s.co];
    const kind = s.isDepot ? (s.depotAsStation ? "Depot+Station" : "Depot") : "Station";
    const traffic = s.building ? "under construction" :
      (s.isDepot && !s.depotAsStation) ? "yard only — no passenger traffic" :
      "~" + fmtNum(stationPaxDay(s)) + " pax/day";
    add(kind, s.name + " (" + (sco ? sco.name : "?") + ", " + s.cars + "-car, " + traffic + ")");
    // station commerce (ekinaka) style
    if (!(s.isDepot && !s.depotAsStation) && !s.building) {
      const cspec = commerceSpec(effectiveCommerce(st, s));
      if (s.commerceBuilding > 0) {
        const pend = commerceSpec(s.commercePending);
        add("Commerce", "building " + (pend ? pend.name : "shops") + " (~" + Math.ceil(s.commerceBuilding) + " days)");
      } else if (cspec) {
        add("Commerce", cspec.name + (effectiveCommerce(st, s) === 1 ? " (vending)" : ""));
      }
    }
    // lines coming in & out of this station, with their service type
    // (local/express, loop) — these are highlighted on the map too
    if (!(s.isDepot && !s.depotAsStation) && !s.building) {
      const conn = linesAtStation(st, sid);
      add("Lines in/out", conn.length
        ? conn.map(l => lineThroughLabel(st, l, sid)).join(", ")
        : "none yet");
    }
  }
  const row = el("div", "btnrow");
  if (!national && !CFG.TERRAIN[h.terrain].water && (h.owner === -1 || (owner && !owner.isPlayer))) {
    row.appendChild(btn(h.owner === -1 ? "Buy land…" : "Offer to buy…", "ubtn go", () => confirmBuyLand(G, idx)));
  }
  // kaidō crossing rights (also bought automatically when building across)
  if (h.kaido && !hasKaidoRights(h, p.id)) {
    row.appendChild(btn("Buy crossing rights (" + fmtYen(kaidoRightsCost(st, idx)) + ")", "ubtn go", () => {
      const r = buyKaidoRights(st, p, idx);
      setStatus(r.ok ? "Crossing rights secured." : r.msg);
      renderPanel(G);
    }));
  }
  // reclaim open water (sea/lake — never rivers) into buildable ground
  if (CFG.TERRAIN[h.terrain].reclaimable && !canReclaim(st, p, idx)) {
    const q = reclaimLand(st, p, idx, true);
    row.appendChild(btn("Reclaim (" + fmtYen(q.cost) + ", ~" + q.days + "d)", "ubtn go", () => {
      openModal("Reclaim this water lot?", el("div", "",
        "Fill " + (h.name ? h.name + " " : "") + "hex #" + h.spiral + " into buildable ground for " +
        fmtYen(q.cost) + "? The works take ~" + q.days + " days; the lot is yours from today."), [
        ["Reclaim for " + fmtYen(q.cost), () => {
          const r = reclaimLand(st, p, idx);
          setStatus(r.ok ? "Reclamation started (~" + r.days + " days)." : r.msg);
          renderPanel(G);
        }],
        ["Cancel", null]]);
    }));
  }
  const ownSta = h.stations.map(id => st.stations[id]).find(s => s && s.co === p.id && s.alive);
  if (ownSta) row.appendChild(btn("Manage station", "ubtn", () => stationModal(G, ownSta)));
  if (h.track && h.track.co === p.id) row.appendChild(btn("Manage track", "ubtn", () => gaugeModal(G, idx)));
  // sell owned land (no infrastructure) back to the open market
  if (h.owner === p.id && !h.track && !h.stations.some(sid => st.stations[sid] && st.stations[sid].alive)) {
    const proceeds = landSaleValue(st, p, idx);
    row.appendChild(btn("Sell land (" + fmtYen(proceeds) + ")", "ubtn warn", () => {
      openModal("Sell parcel?", el("div", "",
        "Sell " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
        (h.cons ? " (with its " + consName(st, h.cons) + ")" : "") + " back to the open market for " + fmtYen(proceeds) +
        "? The cash is credited immediately and the parcel can be bought again by anyone."), [
        ["Sell for " + fmtYen(proceeds), () => {
          const r = sellLand(st, p, idx);
          setStatus(r.ok ? "Sold for " + fmtYen(r.proceeds) + "." : r.msg);
          if (r.ok) { ui.selected = -1; ui.focusStation = -1; }
          renderPanel(G);
        }],
        ["Keep", null]]);
    }));
  }
  row.appendChild(btn("Deselect", "ubtn", () => { ui.selected = -1; ui.focusStation = -1; renderPanel(G); }));
  box.appendChild(row);
  panel.appendChild(box);
}

/** Confirmation dialog for buying a parcel (unowned or from another company). */
function confirmBuyLand(G, idx) {
  const st = G.st, p = player(st), h = st.hexes[idx];
  const label = (h.name ? h.name + " " : "") + "hex #" + h.spiral;
  if (isNationalLand(idx)) { setStatus(crownName(st) + " grounds — " + crownLandWord(st) + ", never for sale."); return; }
  if (h.owner === p.id) { setStatus("You already own this parcel."); return; }
  if (h.owner === -2) { setStatus((h.holdout || "The owner") + " refuses to sell this parcel at any price."); return; }
  if (h.owner === -4) { setStatus("A public " + (h.cons === "school" ? "school" : "institution") + " stands here — public land, never for sale."); return; }
  if (h.owner === -1) {
    const price = landPrice(st, idx);
    const body = el("div");
    body.appendChild(el("div", "", "Buy " + label + " (" + h.terrain + ") for " + fmtYen(price) + "?"));
    // what comes with the deed (v0.5.5): the building, its tenants, its bills
    if (h.cons && (CFG.CONS[h.cons].rentMult || 0) > 0) {
      const occ = occupancyTarget(st, idx);
      body.appendChild(el("div", "small", "Includes the " + consName(st, h.cons) + " on it (dev " + h.dev +
        ", ~" + Math.round(occ * 100) + "% occupied) — rent ~" +
        fmtYen(estimatedRentYear(st, price, h.dev, h.cons, occ)) + "/yr at today's occupancy."));
      body.appendChild(el("div", "dim small", "Running costs: building upkeep ~" +
        fmtYen(Math.round((CFG.CONS[h.cons].upkeepYear || 0) * inflationOf(st, st.time.year))) +
        "/yr (owed even when empty) + property tax ~" + fmtYen(Math.round(price * CFG.LAND.taxYearly)) + "/yr."));
    } else if (h.cons === "rice") {
      body.appendChild(el("div", "dim small", "The " + consName(st, h.cons) + " earn no rent — property tax ~" +
        fmtYen(Math.round(price * CFG.LAND.taxYearly)) + "/yr until you develop or resell the parcel."));
    } else if (!h.cons) {
      body.appendChild(el("div", "dim small", "Bare land: nothing builds itself — develop it (Build/Develop) for rental income, " +
        "or hold it for track. Property tax ~" + fmtYen(Math.round(price * CFG.LAND.taxYearly)) + "/yr either way."));
    }
    openModal("Buy land", body, [
      ["Confirm purchase", () => {
        const r = buyLand(st, p, idx);
        setStatus(r.ok ? "Bought " + label + " for " + fmtYen(r.price) + "." : r.msg);
        renderPanel(G);
      }],
      ["Cancel", null]]);
  } else {
    const seller = st.companies[h.owner];
    const price = landOfferPrice(st, p, idx);
    if (price === null) { setStatus(seller.name + " won't sell this parcel."); return; }
    openModal("Offer to " + seller.name,
      el("div", "", "They agree to sell " + label + " for " + fmtYen(price) +
        " (" + Math.round((CFG.LAND.resaleMarkup - 1) * 100) + "% over assessed value)."), [
      ["Pay " + fmtYen(price), () => {
        const r = offerBuyLand(st, p, idx);
        setStatus(r.ok ? "Deal — " + label + " purchased from " + r.seller.name + "." : r.msg);
        renderPanel(G);
      }],
      ["Decline", null]]);
  }
}

/* ---- Build ---- */
function buildPanel(G, panel) {
  const st = G.st, ui = G.ui, p = player(st);
  panel.appendChild(el("div", "ptitle", "CONSTRUCTION"));
  const modes = [["inspect", "Inspect"], ["buyland", "Buy Land"], ["track", "Lay Track"], ["station", "Build Station"], ["depot", "Build Depot"], ["line", "Create Line"], ["develop", "Build/Develop"], ["demolish", "Demolish"]];
  const mrow = el("div", "btnrow");
  for (const [m, label] of modes) {
    const b = btn(label, "ubtn mode" + (ui.mode === m || (m === "line" && ui.mode === "editLine") ? " active" : ""), () => {
      ui.mode = m; ui.lineSel = []; ui.editLineId = -1; ui.lineLoop = false;
      setStatus(({ inspect: "Tap a hex to select & inspect it. Drag/swipe to pan, wheel or pinch to zoom.",
        buyland: "Click a hex to buy it (a confirmation with the price will appear).",
        track: "Click empty land to lay 1 km of track; click your own track to add a second gauge or regauge it.",
        station: "Click a hex with your track on owned land (confirmation will appear).",
        depot: "Click a hex with your track on owned land to build a rolling-stock depot (stores spare trains; required to run more than " + CFG.DEPOT.trainsPerLineNoDepot + " trains on a line).",
        line: "Click your stations in order to set the line's route. Pick 2+, then Build in the panel.",
        develop: "Click an owned parcel (no track) to build, demolish or replace a building on it for rental income.",
        demolish: "Click your own track to demolish it and (optionally) redevelop the parcel for rental income." })[m]);
      renderPanel(G);
    });
    mrow.appendChild(b);
  }
  panel.appendChild(mrow);

  // line builder: ordered waypoint selection (Create Line / Edit Route)
  if (ui.mode === "line" || ui.mode === "editLine") lineBuilderSection(G, panel);

  // gauge / electrification defaults for new track
  const sect = el("div", "sect");
  sect.appendChild(el("div", "lbl", "New track gauge:"));
  const gsel = el("select", "usel");
  for (const g of gaugesAvailable(st.time.year)) {
    const o = el("option", "", CFG.GAUGES[g].name);
    o.value = g; if (g === p.gauge) o.selected = true;
    gsel.appendChild(o);
  }
  gsel.addEventListener("change", () => { p.gauge = gsel.value; });
  sect.appendChild(gsel);
  if (canElectrify(st, p)) {
    const lab = el("label", "lbl");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = p.elecDefault;
    cb.addEventListener("change", () => { p.elecDefault = cb.checked; });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(" Electrified (+50% cost)"));
    sect.appendChild(lab);
  } else sect.appendChild(el("div", "dim", st.time.year < CFG.UNLOCK.electrification
    ? "Electric traction arrives in " + CFG.UNLOCK.electrification + "."
    : "Electrification requires R&D — research or license Track electrification (R&D panel)."));
  panel.appendChild(sect);

  // new-station defaults: platform length applied to future builds
  const carCap = maxPlatformCars(st.time.year);
  const defSect = el("div", "sect");
  defSect.appendChild(el("div", "lbl", "New station defaults:"));

  const carDefRow = el("div", "airow");
  carDefRow.appendChild(el("span", "", "Platform length:"));
  const carDefSel = el("select", "usel");
  for (let c = 1; c <= carCap; c++) {
    const o = el("option", "", c + "-car");
    o.value = "" + c;
    carDefSel.appendChild(o);
  }
  carDefSel.value = "" + Math.min(p.stationDefaults.cars, carCap);
  carDefSel.addEventListener("change", () => {
    p.stationDefaults.cars = clamp(+carDefSel.value || 1, 1, carCap);
    renderPanel(G);
  });
  carDefRow.appendChild(carDefSel);
  defSect.appendChild(carDefRow);
  defSect.appendChild(el("div", "dim small", "Applied to stations and depot+stations built from now on (raises their cost)."));
  panel.appendChild(defSect);

  // bulk station upgrades: develop commerce everywhere it's ready, or extend every platform to a chosen length
  const bulkSect = el("div", "sect");
  bulkSect.appendChild(el("div", "lbl", "Bulk station upgrades:"));

  // level-from-the-bottom: only stations at the company's LOWEST current tier
  // are developed, so the whole network catches up one tier at a time
  const comElig = bulkCommerceEligible(st, p);
  const comEligible = comElig.stations;
  const comCost = comEligible.reduce((sum, s) => sum + commerceBuildCost(st, s, nextCommerceLevel(s)), 0);
  const comRow = el("div", "airow");
  comRow.appendChild(el("span", "", "Develop next commerce tier everywhere:"));
  const comBtn = btn("Develop (" + fmtYen(comCost) + ")", "ubtn", () => {
    const r = bulkBuildCommerce(st, p);
    setStatus(r.ok ? "Commerce works started at " + r.count + " station" +
      (r.count === 1 ? "" : "s") + " for " + fmtYen(r.cost) + " (each keeps running)." : r.msg);
    renderPanel(G);
  });
  if (!comEligible.length || p.cash < comCost) comBtn.disabled = true;
  comRow.appendChild(comBtn);
  bulkSect.appendChild(comRow);
  if (comEligible.length) {
    const curSpec = commerceSpec(comElig.tier), nextSpec = commerceSpec(comElig.tier + 1);
    bulkSect.appendChild(el("div", "dim small",
      "Lowest current tier: " + (curSpec ? curSpec.name : "none") + " — " + comEligible.length +
      " station" + (comEligible.length === 1 ? "" : "s") + " at it would step up to " +
      (nextSpec ? nextSpec.name : "the next tier") + ". Stations already above stay as they are."));
  } else {
    bulkSect.appendChild(el("div", "dim small", "No stations have a commerce tier ready to develop (idle)."));
  }

  const carTarget = clamp(ui.bulkCarsTarget || carCap, 1, carCap);
  const carRow = el("div", "airow");
  carRow.appendChild(el("span", "", "Extend all platforms to:"));
  const carTargetSel = el("select", "usel");
  for (let c = 1; c <= carCap; c++) {
    const o = el("option", "", c + "-car");
    o.value = "" + c;
    carTargetSel.appendChild(o);
  }
  carTargetSel.value = "" + carTarget;
  carTargetSel.addEventListener("change", () => {
    ui.bulkCarsTarget = clamp(+carTargetSel.value || 1, 1, carCap);
    renderPanel(G);
  });
  carRow.appendChild(carTargetSel);
  const carEligible = st.stations.filter(s => s.co === p.id && isLineStop(s) && s.platBuilding <= 0 && s.cars < carTarget);
  const carCost = carEligible.reduce((sum, s) => sum + stationPlatformUpgradeCost(st, s, carTarget), 0);
  const carBtn = btn("Extend (" + fmtYen(carCost) + ")", "ubtn", () => {
    const r = bulkExtendPlatforms(st, p, carTarget);
    setStatus(r.ok ? "Platform extension to " + carTarget + "-car started at " + r.count + " station" +
      (r.count === 1 ? "" : "s") + " for " + fmtYen(r.cost) + "." : r.msg);
    renderPanel(G);
  });
  if (!carEligible.length || p.cash < carCost) carBtn.disabled = true;
  carRow.appendChild(carBtn);
  bulkSect.appendChild(carRow);
  bulkSect.appendChild(el("div", "dim small",
    carEligible.length + " station" + (carEligible.length === 1 ? "" : "s") + " under " + carTarget + " cars (idle)."));

  // electrify all track at once (retrofit catenary across the whole network) —
  // gated on the Track electrification R&D (developed or licensed)
  if (canElectrify(st, p)) {
    const eq = electrifyTrackCost(st, p);
    const elecRow = el("div", "airow");
    elecRow.appendChild(el("span", "", "Electrify all track:"));
    const elecBtn = btn(eq.count ? "Electrify (" + fmtYen(eq.cost) + ")" : "All electrified", "ubtn", () => {
      const r = bulkElectrifyTrack(st, p);
      setStatus(r.ok ? "Electrified " + r.count + " km of track for " + fmtYen(r.cost) +
        ". Electric (EMU) stock is now available on fully-wired lines." : r.msg);
      renderPanel(G);
    });
    if (!eq.count || p.cash < eq.cost) elecBtn.disabled = true;
    elecRow.appendChild(elecBtn);
    bulkSect.appendChild(elecRow);
    bulkSect.appendChild(el("div", "dim small",
      eq.count ? eq.count + " km of non-electrified track." : "Whole network is electrified."));
  }

  // seismic retrofit across the whole roster (taishin standards) — Tokyo only;
  // the London campaign has no earthquakes, so the whole seismic branch hides
  const tLvl = taishinLevel(st.time.year);
  if (tLvl > 0 && campaignOf(st).quakes) {
    const tEligible = st.stations.filter(s => s.co === p.id && s.alive && !s.building &&
      (!s.isDepot || s.depotAsStation) &&
      s.taishinBuilding <= 0 && (s.taishin || 0) < tLvl);
    const tCost = tEligible.reduce((a, s) => a + stationTaishinCost(st, s), 0);
    const tRow = el("div", "airow");
    tRow.appendChild(el("span", "", "Seismic retrofit all stations:"));
    const tBtn = btn(tEligible.length ? "Retrofit (" + fmtYen(tCost) + ")" : "All at standard", "ubtn", () => {
      const r = bulkUpgradeTaishin(st, p);
      setStatus(r.ok ? "Seismic retrofit started at " + r.count + " station" + (r.count === 1 ? "" : "s") +
        " for " + fmtYen(r.cost) + " (each keeps serving)." : r.msg);
      renderPanel(G);
    });
    if (!tEligible.length || p.cash < tCost) tBtn.disabled = true;
    tRow.appendChild(tBtn);
    bulkSect.appendChild(tRow);
    bulkSect.appendChild(el("div", "dim small", tEligible.length
      ? tEligible.length + " station" + (tEligible.length === 1 ? "" : "s") + " below " + taishinSpec(tLvl).name +
        " — quakes hit sub-standard structures much harder."
      : "Every station meets " + taishinSpec(tLvl).name + "."));
  }
  panel.appendChild(bulkSect);

  // construction queue — track, demolition/redevelopment, station openings,
  // commerce and station upgrades, each with calendar days remaining
  // today's crew split (FIFO, allocateCrews): jobs allotted 0 slots are
  // genuinely stalled — label them so the days-left figures read honestly
  const crewSlots = allocateCrews(st);
  const starved = new Map();
  st.builds.forEach((b, k) => { if (b.co === p.id) starved.set(b, crewSlots[k] === 0); });
  const trackJobs = st.builds.filter(b => b.co === p.id && b.kind === "track");
  const demoJobs = st.builds.filter(b => b.co === p.id && b.kind === "demolish");
  const gaugeJobs = st.builds.filter(b => b.co === p.id && b.kind === "gauge");
  const sdemoJobs = st.builds.filter(b => b.co === p.id && b.kind === "stationdemo");
  const reclaimJobs = st.builds.filter(b => b.co === p.id && b.kind === "reclaim");
  const lines = [];   // {label, left, wait}
  for (const j of trackJobs) {
    lines.push({ label: "Track hex #" + st.hexes[j.hexes[j.done] ?? j.hexes[0]].spiral,
      left: Math.max(0, j.daysPerHex * j.hexes.length - j.progress), wait: starved.get(j) });
  }
  for (const j of demoJobs) {
    const verb = j.develop ? "Redevelop" : (j.gauge ? "Demolish " + CFG.GAUGES[j.gauge].name + " rail" : (j.hadTrack ? "Demolish track" : "Demolish"));
    lines.push({ label: verb + " hex #" + st.hexes[j.hex].spiral, left: Math.max(0, j.total - j.progress), wait: starved.get(j) });
  }
  for (const j of gaugeJobs) {
    const verb = j.mode === "change" ? "Regauge → " + CFG.GAUGES[j.gauge].name : "Add " + CFG.GAUGES[j.gauge].name + " rail";
    lines.push({ label: verb + " hex #" + st.hexes[j.hex].spiral, left: Math.max(0, j.total - j.progress), wait: starved.get(j) });
  }
  for (const j of reclaimJobs) {
    lines.push({ label: "Reclaim hex #" + st.hexes[j.hex].spiral, left: Math.max(0, j.total - j.progress), wait: starved.get(j) });
  }
  for (const j of sdemoJobs) {
    const s = st.stations[j.sid];
    lines.push({ label: "Demolish station " + (s ? s.name : "#" + j.sid), left: Math.max(0, j.total - j.progress), wait: starved.get(j) });
  }
  for (const s of st.stations) {
    if (s.co !== p.id || !s.alive) continue;
    const kind = s.isDepot ? (s.depotAsStation ? "Depot+station " : "Depot ") : "Station ";
    if (s.building) lines.push({ label: kind + s.name + " (opening)", left: s.building });
    if (s.commerceBuilding > 0) lines.push({ label: s.name + " — " + (commerceSpec(s.commercePending) ? commerceSpec(s.commercePending).name : "commerce"), left: s.commerceBuilding });
    if (s.platBuilding > 0) lines.push({ label: s.name + " → " + s.platPending + "-car platform", left: s.platBuilding });
    if (s.taishinBuilding > 0) lines.push({ label: s.name + " — seismic retrofit → " +
      (taishinSpec(s.taishinPending) ? taishinSpec(s.taishinPending).name : "current standard"), left: s.taishinBuilding });
  }
  if (lines.length) {
    lines.sort((a, b) => a.left - b.left);
    panel.appendChild(el("div", "lbl", "UNDER CONSTRUCTION (" + lines.length + ")"));
    // ETAs in real calendar days: work advances at _buildSpeed per calendar
    // day, so a short-staffed builder's queue honestly reads slower — and the
    // skip-ahead label below stays consistent with these figures
    const spd = Math.max(0.1, p._buildSpeed || 1);
    for (const ln of lines.slice(0, 10)) {
      const days = Math.ceil(ln.left / spd);
      panel.appendChild(el("div", "dim small", ln.label + " — " +
        (ln.wait ? "waiting for crew (~" + days + " days of work queued)" :
                   "~" + days + " days left")));
    }
    if (lines.length > 10) panel.appendChild(el("div", "dim small", "…and " + (lines.length - 10) + " more"));
    skipAheadRow(G, panel);
  }
  panel.appendChild(el("div", "dim small",
    "Era: " + eraDisplayName(st, st.time.year) + " · Build time: " +
    CFG.TRACK.daysPerHexByEra[eraOf(st.time.year).key] + " days/km · Platform cap: " +
    maxPlatformCars(st.time.year) + " cars"));
}

/* ---- Lines ---- */
function linesPanel(G, panel) {
  const st = G.st, p = player(st);
  panel.appendChild(el("div", "ptitle", "LINES & TRAINS"));
  const lines = st.lines.filter(l => l.alive && l.co === p.id);
  if (!lines.length) panel.appendChild(el("div", "dim", "No lines yet. Build track and stations, then use Create Line."));
  if (lines.length) {
    // company-wide default fare: one box prices every line that hasn't opted
    // out (each line's "Override" checkbox below pins its own fare)
    const dfSect = el("div", "sect");
    const dfRow = el("div", "btnrow");
    dfRow.appendChild(el("span", "lbl", "Default fare " + curSym() + "/km (all lines): "));
    const dfInp = el("input", "uinp");
    dfInp.type = "number"; dfInp.min = "0"; dfInp.step = "0.01"; dfInp.value = companyDefaultFare(st, p);
    dfInp.addEventListener("change", () => {
      const n = setCompanyDefaultFare(st, p, +dfInp.value || 0);
      setStatus("Default fare " + curSym() + p.defaultFarePerKm + "/km — re-priced " + n + " line" +
        (n === 1 ? "" : "s") + " (override-checked lines kept their own fare).");
      renderPanel(G);
    });
    dfRow.appendChild(dfInp);
    dfSect.appendChild(dfRow);
    dfSect.appendChild(el("div", "dim small",
      "Sets the per-km fare for every line at once. The default never rises with inflation — only you change it. Tick a line's “Override” box to pin its own fare so the default leaves it alone."));
    // v0.6: the default is never inflation-indexed, so EVERY default erodes
    // over time — warn + one-click re-price when it falls far behind the era
    const eraRef = +(CFG.PAX.defaultFarePerKm * inflationOf(st, st.time.year)).toFixed(3);
    if (p.defaultFarePerKm < eraRef * 0.4) {
      const dwRow = el("div", "btnrow");
      dwRow.appendChild(el("span", "small", "⚠ your default fare has eroded far below the era level "));
      dwRow.appendChild(btn("Raise to era rate (" + curSym() + eraRef + "/km)", "ubtn go", () => {
        const n = setCompanyDefaultFare(st, p, eraRef);
        queueSfx(st, "fare_changed");
        setStatus("Default fare re-priced to " + curSym() + eraRef + "/km (" + n + " lines updated).");
        renderPanel(G);
      }));
      dfSect.appendChild(dwRow);
    }
    panel.appendChild(dfSect);
    // v0.5.1: overlay every operating route at once — network at a glance
    const allRow = el("div", "btnrow");
    allRow.appendChild(btn((G.ui.showAllLines ? "✔ " : "") + "Show all my routes on the map",
      "ubtn" + (G.ui.showAllLines ? " go" : ""), () => {
        G.ui.showAllLines = !G.ui.showAllLines;
        setStatus(G.ui.showAllLines ? "Showing every operating route (each in its own colour)." : "Route overlay hidden.");
        renderPanel(G);
      }));
    panel.appendChild(allRow);
    panel.appendChild(el("div", "dim small", "Click a line's name to show just that route on the map."));
  }
  for (const line of lines) {
    const box = el("div", "linebox");
    const selected = G.ui.selectedLine === line.id;
    const head = el("div", "lhead", (selected ? "▸ " : "") + line.name + " (" + lineTypeLabel(line) + ")");
    head.style.borderLeft = "4px solid " + p.color;
    head.style.cursor = "pointer";
    if (selected) head.style.background = "rgba(255,227,74,0.16)";
    head.title = "Click to show/hide this line's route on the map";
    head.addEventListener("click", () => {
      G.ui.selectedLine = selected ? -1 : line.id;
      setStatus(selected ? "Route hidden." : "Showing route of " + line.name + " on the map.");
      renderPanel(G);
    });
    box.appendChild(head);
    const nameRow = el("div", "btnrow");
    nameRow.appendChild(el("span", "lbl", "Name: "));
    const lnInp = el("input", "uinp");
    lnInp.type = "text"; lnInp.value = line.name; lnInp.maxLength = 40; lnInp.style.width = "150px";
    lnInp.addEventListener("change", () => {
      const v = lnInp.value.trim();
      if (v) { line.name = v; setStatus("Line renamed to “" + v + "”."); renderPanel(G); }
    });
    nameRow.appendChild(lnInp);
    box.appendChild(nameRow);
    box.appendChild(el("div", "dim small", line.path.length + " km · " + line.stations.length + " stations · " +
      (line.elec ? "electrified" : "non-electrified") + " · " + line.gaugeMm + "mm" +
      (line.loop ? " · ↻ one-way loop" : "")));
    if (line.loop && line.trains.length) {
      box.appendChild(el("div", "dim small",
        "Loop: trains circulate both ways — odd-numbered clockwise, even-numbered counter-clockwise."));
    }
    // peak load = busiest segment's directional volume vs per-direction capacity
    const load = line.capacity > 0 ? line.demand / line.capacity : 0;
    box.appendChild(el("div", "small",
      "~" + fmtNum(Math.round((line.board || 0) * 2)) + " riders/day · peak load " +
      Math.round(load * 100) + "% of capacity" +
      (load > 1 ? " — OVERCROWDED (riders frustrated)" : "") +
      " · desirability " + Math.round(line.desirability * 100) + "%"));
    // fare pressure: ¥/km vs the era-comfortable level — above 100% erodes demand
    const comfort = CFG.PAX.defaultFarePerKm * CFG.PAX.comfortFareMult * inflationOf(st, st.time.year);
    const pressure = comfort > 0 ? line.fare / comfort : 0;
    box.appendChild(el("div", "dim small",
      "Fare pressure " + Math.round(pressure * 100) + "%" +
      (pressure > 1 ? " — too expensive; riders go elsewhere" : pressure > 0.85 ? " — near riders' comfort limit" : " — affordable")));
    // v0.5: fares aren't inflation-indexed — warn when a pinned fare has
    // eroded far below the era-comfortable level, with a one-click raise
    const eraComfy = +(CFG.PAX.defaultFarePerKm * inflationOf(st, st.time.year)).toFixed(3);
    if (line.fareOverride && pressure < 0.4) {
      const wrow = el("div", "btnrow");
      wrow.appendChild(el("span", "small", "⚠ fare far below the era level (inflation has eroded it) "));
      wrow.appendChild(btn("Raise to era-comfortable (" + curSym() + eraComfy + "/km)", "ubtn go", () => {
        line.fare = eraComfy; st.od.dirty = true;
        queueSfx(st, "fare_changed");
        setStatus(line.name + " re-priced to the era rate (" + curSym() + eraComfy + "/km).");
        renderPanel(G);
      }));
      box.appendChild(wrow);
    }
    // fare control + override toggle (overridden lines ignore the default box)
    const frow = el("div", "btnrow");
    frow.appendChild(el("span", "lbl", "Fare " + curSym() + "/km: "));
    const finp = el("input", "uinp");
    finp.type = "number"; finp.min = "0"; finp.step = "0.01"; finp.value = line.fare;
    finp.addEventListener("change", () => {
      line.fare = clamp(+finp.value || 0, 0, 1e6); line.fareOverride = true; st.od.dirty = true;
      setStatus("Fare set for " + line.name + " — override on, so the default fare won't change it.");
      renderPanel(G);
    });
    frow.appendChild(finp);
    const ovLab = el("label", "lbl");
    const ovCb = el("input"); ovCb.type = "checkbox"; ovCb.checked = !!line.fareOverride;
    ovCb.addEventListener("change", () => {
      line.fareOverride = ovCb.checked;
      if (!ovCb.checked) line.fare = companyDefaultFare(st, p);    // snap back to the default
      st.od.dirty = true;
      setStatus(ovCb.checked ? line.name + " will keep its own fare when the default changes."
        : line.name + " now follows the default fare (" + curSym() + companyDefaultFare(st, p) + "/km).");
      renderPanel(G);
    });
    ovLab.appendChild(ovCb); ovLab.appendChild(document.createTextNode(" Override default"));
    frow.appendChild(ovLab);
    box.appendChild(frow);
    const brow = el("div", "btnrow");
    brow.appendChild(btn("Buy Train (" + line.trains.length + ")", "ubtn", () => trainModal(G, line)));
    brow.appendChild(btn("Stops", "ubtn", () => stopsModal(G, line)));
    brow.appendChild(btn("Edit Route", "ubtn", () => {
      G.ui.mode = "editLine"; G.ui.editLineId = line.id; G.ui.selectedLine = line.id;
      G.ui.lineSel = lineWaypoints(line); G.ui.lineLoop = !!line.loop; G.ui.tab = "Build";
      setStatus("Editing " + line.name + ": click stations to add/remove waypoints, then Apply changes in the panel.");
      renderPanel(G);
    }));
    brow.appendChild(btn("Delete", "ubtn warn", () => {
      // v0.5.1: without a depot there is nowhere to stable the trains — they
      // are sold off automatically; with one they go into storage as before
      const hasDepot = companyHasDepot(st, p);
      openModal("Delete " + line.name + "?", el("div", "", hasDepot
        ? "Its trains are moved to your depot and can be reassigned to another line later."
        : "You have NO DEPOT to store its trains — they will be SOLD automatically at resale value."), [
        ["Delete", () => {
          if (G.ui.selectedLine === line.id) G.ui.selectedLine = -1;
          const r = removeLine(st, p, line.id);
          queueSfx(st, "line_deleted");
          setStatus(r.sold ? "Line deleted — " + r.sold + " train" + (r.sold === 1 ? "" : "s") +
              " sold for " + fmtYen(r.refund) + " (no depot)."
            : r.stored ? "Line deleted — " + r.stored + " train" + (r.stored === 1 ? "" : "s") + " moved to the depot."
            : "Line deleted.");
          renderPanel(G);
        }], ["Keep", null]]);
    }));
    box.appendChild(brow);
    panel.appendChild(box);
  }
  panel.appendChild(el("div", "dim small",
    "Tip: duplicate a corridor with an express service (Create Line, type express) and tune its stops."));

  const stored = st.trains.filter(t => t.alive && t.stored && t.co === p.id);
  if (stored.length) {
    panel.appendChild(el("div", "lbl", "STORED TRAINS (depot)"));
    for (const tr of stored) {
      const age = Math.max(0, st.time.year - (tr.bought ?? st.time.year));
      const box = el("div", "linebox");
      box.appendChild(el("div", "small", CFG.TRAINS[tr.type].name + " — " + tr.cars + " cars · age " + age + "y"));
      const brow = el("div", "btnrow");
      brow.appendChild(btn("Assign to line…", "ubtn", () => assignTrainModal(G, tr)));
      brow.appendChild(btn("Sell", "ubtn warn", () => {
        const val = trainResaleValue(st, tr);
        openModal("Sell train?", el("div", "", "Sell this " + CFG.TRAINS[tr.type].name +
          " (age " + age + "y) for its resale value of " + fmtYen(val) + "?"), [
          ["Sell", () => {
            const r = scrapStoredTrain(st, p, tr.id);
            setStatus(r.ok ? "Sold for " + fmtYen(r.refund) + "." : r.msg);
            renderPanel(G);
          }], ["Keep", null]]);
      }));
      box.appendChild(brow);
      panel.appendChild(box);
    }
  }
}

/** Modal: choose a compatible line to reassign a stored train to. Each row
 *  shows the service type and the line's PEAK LOAD (busiest segment vs
 *  capacity — v0.5.1) so stock goes where it's needed most. */
function assignTrainModal(G, tr) {
  const st = G.st, p = player(st);
  const body = el("div");
  const lines = st.lines.filter(l => l.alive && l.co === p.id && trainTypesFor(st, p, l).includes(tr.type));
  if (!lines.length) body.appendChild(el("div", "", "No compatible lines (check gauge/electrification)."));
  else body.appendChild(el("div", "dim small", "Peak load = the busiest segment's demand vs the line's capacity — over 100% means riders are being turned away."));
  const buttons = [["Cancel", null]];
  for (const line of lines.slice().sort((a, b) =>
      (b.capacity > 0 ? b.demand / b.capacity : 0) - (a.capacity > 0 ? a.demand / a.capacity : 0))) {
    const load = line.capacity > 0 ? Math.round(100 * line.demand / line.capacity) : null;
    const loadTxt = load === null ? "no service yet" : "peak load " + load + "%" + (load > 100 ? " — OVERCROWDED" : "");
    body.appendChild(btn(line.name + " — " + lineTypeLabel(line) + " · " + loadTxt + " · " + line.path.length + " km",
      "ubtn wide", () => {
        const r = assignStoredTrain(st, p, tr.id, line.id);
        setStatus(r.ok ? "Train assigned to " + line.name + "." : r.msg);
        closeModal(); renderPanel(G);
      }));
  }
  openModal("Assign " + CFG.TRAINS[tr.type].name, body, buttons);
}

function trainModal(G, line) {
  const st = G.st, p = player(st);
  const body = el("div");
  // current rolling stock on this line — sell for resale value, or (v0.5.1)
  // pull it into the depot for reassignment without deleting the line
  const onLine = line.trains.map(id => st.trains[id]).filter(t => t && t.alive);
  const hasDepot = companyHasDepot(st, p);
  if (onLine.length) {
    body.appendChild(el("div", "lbl block", "Rolling stock on this line:"));
    for (const tr of onLine) {
      const age = Math.max(0, st.time.year - (tr.bought ?? st.time.year));
      const val = trainResaleValue(st, tr);
      const row = el("div", "btnrow");
      row.appendChild(el("span", "small", CFG.TRAINS[tr.type].name + " · " + tr.cars + "-car · age " + age + "y"));
      if (hasDepot) {
        row.appendChild(btn("To depot", "ubtn", () => {
          const r = storeTrain(st, p, tr.id);
          setStatus(r.ok ? CFG.TRAINS[tr.type].name + " moved to the depot — reassign it from Lines & Trains." : r.msg);
          renderPanel(G); trainModal(G, line);
        }));
      }
      row.appendChild(btn("Sell " + fmtYen(val), "ubtn warn", () => {
        const r = sellTrain(st, p, tr.id);
        setStatus(r.ok ? "Sold " + CFG.TRAINS[tr.type].name + " for " + fmtYen(r.refund) + "." : r.msg);
        renderPanel(G); trainModal(G, line);
      }));
      body.appendChild(row);
    }
    body.appendChild(el("div", "lbl block", "Buy a new train:"));
  }
  const types = trainTypesFor(st, p, line);
  if (!types.length) body.appendChild(el("div", "", "No compatible train types (check electrification/gauge/era)."));
  else if (!hasDepot && onLine.length >= CFG.DEPOT.trainsPerLineNoDepot) {
    body.appendChild(el("div", "small", "⚠ Without a depot a line can run at most " +
      CFG.DEPOT.trainsPerLineNoDepot + " trains. Build a depot (Build tab) to grow the fleet."));
  }
  const buttons = [["Close", null]];
  for (const ty of types) {
    const t = CFG.TRAINS[ty];
    const cost = Math.round(t.cost * inflationOf(st, st.time.year));
    body.appendChild(btn(t.name + " — " + t.speed + " km/h, " + t.cap + " pax/car — " + fmtYen(cost), "ubtn wide", () => {
      const r = buyTrain(st, p, line.id, ty);
      setStatus(r.ok ? "Train added to " + line.name + "." : r.msg);
      renderPanel(G); trainModal(G, line);
    }));
  }
  body.appendChild(el("div", "dim small", "Cars per train are capped by the shortest platform among the line's stops."));
  openModal("Trains — " + line.name, body, buttons);
}

function stopsModal(G, line) {
  const st = G.st;
  const body = el("div");
  body.appendChild(el("div", "dim small", "Set the stopping pattern (termini always served best as stops). " +
    "Figures are passengers through each station on the most recent simulated day."));
  for (const sid of line.stations) {
    const s = st.stations[sid];
    const lab = el("label", "lbl block");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !!line.stops[sid];
    cb.addEventListener("change", () => {
      line.stops[sid] = cb.checked; st.od.dirty = true; refreshTrainCars(st);
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" " + s.name + " (" + s.cars + "-car · ~" +
      fmtNum(stationPaxDay(s)) + " pax/day)"));
    body.appendChild(lab);
  }
  openModal("Stops — " + line.name, body, [["Done", null]]);
}

/** One-line reading of the population manager (v0.5.5): the macro trend that
 *  scales city growth and residential occupancy, with what's driving it. */
function popTrendLabel(st) {
  const pr = st.econ.popPressure || 1;
  const word = pr >= 1.25 ? "booming" : pr >= 1.05 ? "growing" : pr >= 0.9 ? "steady" : pr >= 0.6 ? "stalling" : "shrinking";
  const drivers = [];
  if (st.war && st.war.active) drivers.push("war");
  if (st.econ.rebuild && st.econ.rebuild.years > 0) drivers.push("quake recovery");
  if ((st.econ.cycle || 1) > 1.05) drivers.push("boom economy");
  else if ((st.econ.cycle || 1) < 0.95) drivers.push("slump");
  return word + " (×" + pr.toFixed(2) + (drivers.length ? " — " + drivers.join(", ") : "") + ")";
}

/* ---- Finance ---- */
function financePanel(G, panel) {
  const st = G.st, p = player(st);
  const levy = p.stats.lastLevy || { tax: 0, upkeep: 0 };
  const op = p._opCost || { payroll: 0, track: 0, train: 0, total: 0 };
  const commerceMaint = commerceMaintYear(st, p);
  const ftable = (rows) => {
    const table = el("table", "ftable");
    for (const [k, v] of rows) {
      const tr = el("tr"); tr.appendChild(el("td", "", k)); tr.appendChild(el("td", "num", v));
      table.appendChild(tr);
    }
    return table;
  };
  // headline figures always visible; the full breakdown folds away below
  panel.appendChild(ftable([
    ["Revenue (this sim-day)", fmtYen(p.stats.revToday)],
    ["Operating cost (this sim-day)", fmtYen(p.stats.costToday)],
    ["Net (this sim-day)", fmtYen(p.stats.revToday - p.stats.costToday)],
    ["Revenue (year to date)", fmtYen(p.stats.revYear)],
    ["Company value", fmtYen(companyValue(st, p))],
  ]));
  collapsible(G, panel, "fin.detail", "Full breakdown", (body) => body.appendChild(ftable([
    ["— of which fares", fmtYen(p.stats.fareRevToday || 0)],
    ["— of which land rent", fmtYen(p.stats.landRevToday || 0)],
    ["— of which station commerce", fmtYen(p.stats.commerceRevToday || 0)],
    ["— Land & property rent (YTD)", fmtYen(p.stats.landRevYear || 0)],
    ["— Property upkeep (YTD)", fmtYen(p.stats.landCostYear || 0)],
    ["— Station commerce (YTD)", fmtYen(p.stats.commerceRevYear || 0)],
    ["— Payroll (annual)", fmtYen(op.payroll)],
    ["— Track maintenance (annual)", fmtYen(op.track)],
    ["— Train maintenance (annual)", fmtYen(op.train)],
    ["— Commerce upkeep (annual)", fmtYen(commerceMaint)],
    ["Last year-end property tax", fmtYen(levy.tax)],
    ["Last year-end station upkeep", fmtYen(levy.upkeep)],
    ["Daily passengers", fmtNum(p.stats.pax) + " (avg " + fmtNum(p.stats.paxAvg) + ")"],
    ["Land owned", p.land.length + " hexes"],
    ["Track", companyTrackHexes(st, p).length + " km"],
    ["Stations", st.stations.filter(s => s.co === p.id && s.alive).length + ""],
    ["Employees", fmtNum(p._headcount || 0)],
    ["Price level (era)", "×" + inflationOf(st, st.time.year).toFixed(1)],
    ["Population trend", popTrendLabel(st)],
  ])));

  // ---- Kangyō-Bank credit line (v0.5): debt, terms, borrow/repay ----
  panel.appendChild(el("div", "lbl", bankName(st).toUpperCase() + " — CREDIT LINE"));
  if (p.delinquentYears > 0) {
    const warn = el("div", "linebox", "⚠ TAX ARREARS: " + fmtYen(Math.round(p.taxArrears || 0)) +
      " unpaid — year " + p.delinquentYears + " of 3. At three delinquent years the bank forces a loan; " +
      "if your credit can't cover it, the railway is SOLD OUT from under you.");
    warn.style.borderLeft = "4px solid #c0392b";
    const owed = Math.round(p.taxArrears || 0);
    const canPay = Math.max(0, Math.min(Math.floor(p.cash), owed));
    const payRow = el("div", "btnrow");
    const payBtn = btn("Pay arrears now (" + fmtYen(canPay) + (canPay < owed ? " of " + fmtYen(owed) : "") + ")",
      "ubtn go", () => {
        const paid = payTaxArrears(st, p);
        if (paid > 0) setStatus("Paid " + fmtYen(paid) + " toward tax arrears" +
          (p.taxArrears > 0 ? " — " + fmtYen(Math.round(p.taxArrears)) + " still owed." : ". Delinquency record cleared."));
        else denyStatus(st, "No cash on hand to pay the collector.");
        renderPanel(G);
      });
    if (canPay <= 0) payBtn.disabled = true;
    payRow.appendChild(payBtn);
    warn.appendChild(payRow);
    panel.appendChild(warn);
  }
  const limit = creditLimitOf(st, p), avail = availableCredit(st, p);
  const bt = el("table", "ftable");
  for (const [k, v] of [
    ["Outstanding debt", fmtYen(Math.round(p.debt || 0))],
    ["Interest rate", (100 * (p.rate || 0)).toFixed(1) + "%/yr (charged monthly)"],
    ["Interest (this month)", fmtYen(Math.round(p.stats.interestToday || 0))],
    ["Credit limit", fmtYen(limit) + " (" + Math.round(100 * (p.creditFactor || 0)) + "% of company value)"],
    ["Available to borrow", fmtYen(avail)],
  ]) {
    const tr = el("tr"); tr.appendChild(el("td", "", k)); tr.appendChild(el("td", "num", v));
    bt.appendChild(tr);
  }
  panel.appendChild(bt);
  const brow = el("div", "btnrow");
  let brows = 0;
  const askAmount = (title, max, fn) => {
    const box = el("div");
    box.appendChild(el("div", "small", "Up to " + fmtYen(max) + "."));
    const inp = el("input"); inp.type = "number"; inp.min = "0"; inp.max = "" + max; inp.value = "" + max;
    box.appendChild(inp);
    openModal(title, box, [["Confirm", () => { fn(+inp.value || 0); renderPanel(G); }], ["Cancel", null]]);
  };
  if (avail > 0) { brows++; brow.appendChild(btn("Borrow…", "ubtn go", () =>
    askAmount("Borrow from the " + bankName(st), avail, a => setStatus(borrowLoan(st, p, a).msg || "Loan drawn.")))); }
  if ((p.debt || 0) > 0 && p.cash > 0) { brows++; brow.appendChild(btn("Repay…", "ubtn", () =>
    askAmount("Repay principal", Math.min(Math.round(p.debt), Math.floor(p.cash)), a => setStatus(repayLoan(st, p, a).msg || "Repaid.")))); }
  if (brows) panel.appendChild(brow);

  // ---- Land & property holdings (income from land NOT used for rail) ----
  const parcels = [];
  let rentEstYear = 0, upkeepEstYear = 0, idleCount = 0;
  for (const i of p.land) {
    const h = st.hexes[i];
    if (h.track || h.stations.length) continue;          // rail land is excluded
    const v = h.value || landPrice(st, i);
    const ry = parcelRentYear(st, i), uy = parcelUpkeepYear(st, i);
    rentEstYear += ry; upkeepEstYear += uy;
    if (!ry) idleCount++;
    parcels.push({ h, i, v, ry, uy });
  }
  panel.appendChild(el("div", "lbl", "LAND & PROPERTY (non-rail)"));
  const lt = el("table", "ftable");
  for (const [k, v] of [
    ["Non-rail parcels owned", parcels.length + " (" + idleCount + " earning nothing)"],
    ["Rent income (annual, at occupancy)", fmtYen(rentEstYear)],
    ["Building upkeep (annual)", fmtYen(upkeepEstYear)],
  ]) {
    const tr = el("tr"); tr.appendChild(el("td", "", k)); tr.appendChild(el("td", "num", v));
    lt.appendChild(tr);
  }
  panel.appendChild(lt);
  if (!parcels.length) {
    panel.appendChild(el("div", "dim small",
      "You own no land outside your rail corridor. Buy parcels (Inspect a hex) or redevelop torn-up track into rent-earning property to add a second income stream."));
  } else {
    const top = parcels.slice().sort((a, b) => (b.ry - b.uy) - (a.ry - a.uy)).slice(0, 8);
    const pt = el("table", "ftable");
    const hd = el("tr"); for (const c of ["Parcel", "Value", "Occ.", "Rent/yr", "Upkeep/yr"]) hd.appendChild(el("th", "", c));
    pt.appendChild(hd);
    for (const { h, i, v, ry, uy } of top) {
      const tr = el("tr");
      tr.appendChild(el("td", "", (h.name ? h.name + " " : "") + "#" + h.spiral +
        (h.cons ? " (" + consName(st, h.cons) + ")" : " (vacant)")));
      tr.appendChild(el("td", "num", fmtYen(v)));
      tr.appendChild(el("td", "num", ry ? Math.round(occupancyOf(h) * 100) + "%" : "—"));
      tr.appendChild(el("td", "num", ry ? fmtYen(ry) : "—"));
      tr.appendChild(el("td", "num" + (uy > ry ? " neg" : ""), uy ? fmtYen(uy) : "—"));
      pt.appendChild(tr);
    }
    panel.appendChild(pt);
    if (parcels.length > 8) panel.appendChild(el("div", "dim small",
      "Showing the 8 best of " + parcels.length + " parcels — the full list is in Money → Property."));
  }
  const hist = p.stats.history.slice(-10);
  if (hist.length) {
    panel.appendChild(el("div", "lbl", "PAST YEARS"));
    const ht = el("table", "ftable");
    const hd = el("tr"); for (const h of ["Year", "Profit", "Pax/day"]) hd.appendChild(el("th", "", h));
    ht.appendChild(hd);
    for (const h of hist) {
      const tr = el("tr");
      tr.appendChild(el("td", "", "" + h.year));
      tr.appendChild(el("td", "num" + (h.profit < 0 ? " neg" : ""), fmtYen(h.profit)));
      tr.appendChild(el("td", "num", fmtNum(h.pax)));
      ht.appendChild(tr);
    }
    panel.appendChild(ht);
  }
}

/* ---- Property ----
 * A portfolio view of everything the player owns — stations, track and
 * non-rail land — with each asset's quantified demand, income and running
 * cost, plus one-tap upgrades. Each station lists the lines passing through
 * it and their service type (local/express, loop). Tapping a station traces
 * its lines on the map (the same highlight as clicking the hex).
 */
function focusStationOnMap(G, s) {
  const ui = G.ui;
  ui.selected = s.hex; ui.focusStation = s.id; ui.mode = "inspect";
  setStatus("Highlighting the lines through " + s.name + " on the map.");
  renderPanel(G);
}

function propertiesPanel(G, panel) {
  const st = G.st, ui = G.ui, p = player(st);
  panel.appendChild(el("div", "ptitle", "PROPERTY PORTFOLIO"));

  const stations = st.stations.filter(s => s.co === p.id && s.alive);
  const trackKm = companyTrackHexes(st, p).length;
  const op = p._opCost || { payroll: 0, track: 0, train: 0, total: 0 };

  // tally station economics and non-rail land in one pass
  let commerceIncome = 0, stationUpkeep = 0;
  for (const s of stations) { commerceIncome += stationCommerceIncomeYear(st, s); stationUpkeep += stationUpkeepYear(st, s); }
  const parcels = [];
  let rentYear = 0, propUpkeepYear = 0;
  for (const i of p.land) {
    const h = st.hexes[i];
    if (h.track || h.stations.length) continue;                 // rail land excluded
    const v = h.value || landPrice(st, i);
    const ry = parcelRentYear(st, i), uy = parcelUpkeepYear(st, i);
    rentYear += ry; propUpkeepYear += uy;
    parcels.push({ i, h, v, ry, uy });
  }

  // ---- portfolio summary (income vs running cost) ----
  const summary = el("table", "ftable");
  for (const [k, v] of [
    ["Stations / depots", stations.length + ""],
    ["Track", trackKm + " km"],
    ["Non-rail parcels", parcels.length + ""],
    ["Station commerce income (annual)", fmtYen(Math.round(commerceIncome))],
    ["Land & property rent (annual, at occupancy)", fmtYen(Math.round(rentYear))],
    ["Property upkeep (annual)", fmtYen(Math.round(propUpkeepYear))],
    ["Track maintenance (annual)", fmtYen(op.track)],
    ["Station & commerce upkeep (annual)", fmtYen(Math.round(stationUpkeep))],
  ]) {
    const tr = el("tr"); tr.appendChild(el("td", "", k)); tr.appendChild(el("td", "num", v));
    summary.appendChild(tr);
  }
  panel.appendChild(summary);
  panel.appendChild(el("div", "dim small",
    "Demand, income and cost for every property you own. Tap a station's name to trace its lines on the map; use its buttons to upgrade."));

  // ---- stations & depots (busiest first) ----
  panel.appendChild(el("div", "lbl", "STATIONS & DEPOTS (" + stations.length + ")"));
  if (!stations.length) panel.appendChild(el("div", "dim small", "No stations yet — build one on your track (Build tab)."));
  for (const s of stations.slice().sort((a, b) => (b.paxDay || 0) - (a.paxDay || 0))) {
    const box = el("div", "linebox");
    const kind = s.isDepot ? (s.depotAsStation ? "Depot+Station" : "Depot") : "Station";
    const head = el("div", "lhead", s.name + " · " + kind + (s.building ? " (building)" : ""));
    head.style.cursor = "pointer";
    head.title = "Show this station's lines on the map";
    if (!s.building) head.addEventListener("click", () => focusStationOnMap(G, s));
    box.appendChild(head);
    box.appendChild(el("div", "dim small", s.cars + "-car platforms" +
      (s.building ? " · ~" + Math.ceil(s.building) + " days to open" : "")));
    const pureDepot = s.isDepot && !s.depotAsStation;
    if (!pureDepot && !s.building) {
      const load = stationPeakLoad(st, s.id);
      box.appendChild(el("div", "small", "Demand: ~" + fmtNum(stationPaxDay(s)) + " pax/day" +
        (load > 0 ? " · busiest line " + Math.round(load * 100) + "% of capacity" + (load > 1 ? " — OVERCROWDED" : "") : "")));
      const inc = stationCommerceIncomeYear(st, s), up = stationUpkeepYear(st, s);
      const cspec = commerceSpec(effectiveCommerce(st, s));
      box.appendChild(el("div", "small", "Commerce: " + (cspec ? cspec.name : "none") + " · income ~" +
        fmtYen(inc) + "/yr · upkeep ~" + fmtYen(up) + "/yr · net " + fmtYen(inc - up) + "/yr"));
      const conn = linesAtStation(st, s.id);
      box.appendChild(el("div", "dim small", "Lines in/out: " + (conn.length
        ? conn.map(l => lineThroughLabel(st, l, s.id)).join(", ") : "none yet")));
    } else if (pureDepot) {
      box.appendChild(el("div", "dim small", "Rolling-stock yard — stores trains, no passenger traffic."));
    }
    const brow = el("div", "btnrow");
    brow.appendChild(btn("Manage / Upgrade", "ubtn", () => stationModal(G, s)));
    if (!s.building) brow.appendChild(btn("Show on map", "ubtn", () => focusStationOnMap(G, s)));
    box.appendChild(brow);
    panel.appendChild(box);
  }

  // ---- track / rails (network demand + maintenance, electrify upgrade) ----
  panel.appendChild(el("div", "lbl", "TRACK & RAILS"));
  let elecKm = 0;
  for (let i = 0; i < st.hexes.length; i++) { const t = st.hexes[i].track; if (t && t.co === p.id && t.elec) elecKm++; }
  let peakLoad = 0, riders = 0;
  for (const l of st.lines) {
    if (!l.alive || l.co !== p.id) continue;
    riders += (l.board || 0) * 2;
    if (l.capacity > 0) peakLoad = Math.max(peakLoad, l.demand / l.capacity);
  }
  const trackTbl = el("table", "ftable");
  for (const [k, v] of [
    ["Track length", trackKm + " km (" + elecKm + " electrified)"],
    ["Annual maintenance", fmtYen(op.track)],
    ["Network demand", fmtNum(Math.round(riders)) + " riders/day · peak line load " + Math.round(peakLoad * 100) + "%"],
  ]) {
    const tr = el("tr"); tr.appendChild(el("td", "", k)); tr.appendChild(el("td", "num", v));
    trackTbl.appendChild(tr);
  }
  panel.appendChild(trackTbl);
  if (canElectrify(st, p)) {
    const eq = electrifyTrackCost(st, p);
    if (eq.count) {
      const erow = el("div", "btnrow");
      const eb = btn("Electrify all track (" + fmtYen(eq.cost) + ")", "ubtn", () => {
        const r = bulkElectrifyTrack(st, p);
        setStatus(r.ok ? "Electrified " + r.count + " km of track for " + fmtYen(r.cost) + "." : r.msg);
        renderPanel(G);
      });
      if (p.cash < eq.cost) eb.disabled = true;
      erow.appendChild(eb);
      panel.appendChild(erow);
    }
  }

  // ---- non-rail land & improvements (value, rent, latent demand) ----
  panel.appendChild(el("div", "lbl", "LAND & IMPROVEMENTS (" + parcels.length + ")"));
  if (!parcels.length) {
    panel.appendChild(el("div", "dim small",
      "No non-rail land. Buy parcels (Inspect a hex) or redevelop torn-up track into rent-earning property."));
  } else {
    const dm = demandFieldCached(st);
    const tbl = el("table", "ftable");
    const hd = el("tr"); for (const c of ["Parcel", "Value", "Occ.", "Rent/yr", "Upkeep/yr", "Demand"]) hd.appendChild(el("th", "", c));
    tbl.appendChild(hd);
    for (const { i, h, v, ry, uy } of parcels.slice().sort((a, b) => (b.ry - b.uy) - (a.ry - a.uy)).slice(0, 20)) {
      const tr = el("tr");
      const td0 = el("td", "", (h.name ? h.name + " " : "") + "#" + h.spiral + (h.cons ? " (" + consName(st, h.cons) + ")" : " (vacant)"));
      td0.style.cursor = "pointer";
      td0.addEventListener("click", () => {
        ui.selected = i; ui.focusStation = -1; ui.mode = "inspect"; setStatus(hexInfo(st, i)); renderPanel(G);
      });
      tr.appendChild(td0);
      tr.appendChild(el("td", "num", fmtYen(v)));
      tr.appendChild(el("td", "num", ry ? Math.round(occupancyOf(h) * 100) + "%" : "—"));
      tr.appendChild(el("td", "num", ry ? fmtYen(ry) : "—"));
      tr.appendChild(el("td", "num" + (uy > ry ? " neg" : ""), uy ? fmtYen(uy) : "—"));
      tr.appendChild(el("td", "num", fmtNum(Math.round(dm.field[i] || 0))));
      tbl.appendChild(tr);
    }
    panel.appendChild(tbl);
    if (parcels.length > 20) panel.appendChild(el("div", "dim small", "Showing 20 of " + parcels.length + " parcels (best net first)."));
    panel.appendChild(el("div", "dim small",
      "“Occ.” is how full the building is — tenants follow district demand, transit access and the population trend, and split across competing space nearby. " +
      "“Demand” is the latent riders a station on that hex could draw. Tap a parcel to inspect or sell it; build on idle parcels via Build/Develop."));
  }
}

/* ---- Workforce ---- */
/** A simple inline-styled 0..1 progress bar (no CSS dependency). */
function meterBar(frac, color) {
  const wrap = el("div");
  wrap.style.cssText = "height:10px;background:#222;border:1px solid #000;margin:3px 0;";
  const fill = el("div");
  fill.style.cssText = "height:100%;width:" + Math.round(clamp(frac, 0, 1) * 100) + "%;background:" + color + ";";
  wrap.appendChild(fill);
  return wrap;
}

/* ---- R&D panel: fund research into private-railway innovations ---- */
function researchPanel(G, panel) {
  const st = G.st, ui = G.ui, p = player(st);
  panel.appendChild(el("div", "ptitle", "RESEARCH & DEVELOPMENT"));
  if (!p.research) p.research = freshResearch();
  panel.appendChild(el("div", "dim small",
    "Fund the innovations of Japan's private commuter railways. One lab project at a time — R&D is a MONTHLY cost, and the more you spend per month the faster it's developed. You can re-fund or halt a project at any time. " +
    "Rivals license what you've developed (the fee is paid to you), and anything a rival has already developed can be licensed from them for a price — in service immediately."));

  // funding level for the NEXT project started (monthly fee and speed scale together)
  const fSect = el("div", "sect");
  const fRow = el("div", "btnrow");
  fRow.appendChild(el("span", "lbl", "New-project funding: "));
  const fSel = el("select", "usel");
  for (const f of RND_FUNDING) {
    const o = el("option", "", f.name + " (×" + f.mult + " pace & monthly cost)");
    o.value = "" + f.mult;
    if (f.mult === (ui.rndFund || 1)) o.selected = true;
    fSel.appendChild(o);
  }
  fSel.addEventListener("change", () => { ui.rndFund = +fSel.value || 1; renderPanel(G); });
  fRow.appendChild(fSel);
  fSect.appendChild(fRow);
  panel.appendChild(fSect);
  const fund = ui.rndFund || 1;

  // active project — progress bar, live monthly fee, re-fund / halt controls
  const aSect = el("div", "sect");
  if (p.research.active) {
    const a = p.research.active;
    const t = techSpec(a.key);
    const frac = researchProgress(p);
    const yrsLeft = Math.max(0, a.stdDaysLeft / a.fund / 365);
    const fee = rndMonthlyFee(a.key, a.fund, a.stdCost);
    aSect.appendChild(el("div", "lbl", "IN PROGRESS"));
    aSect.appendChild(el("div", "", t.name));
    // progress indicator
    const bar = el("div"); bar.style.cssText = "height:10px;background:rgba(255,255,255,0.12);border-radius:5px;overflow:hidden;margin:5px 0;";
    const fill = el("div"); fill.style.cssText = "height:100%;width:" + Math.round(frac * 100) + "%;background:#5fbf6a;";
    bar.appendChild(fill); aSect.appendChild(bar);
    aSect.appendChild(el("div", "dim small", Math.round(frac * 100) + "% complete · ~" +
      yrsLeft.toFixed(1) + " yrs left at " + fundingName(a.fund) + " funding · " + fmtYen(fee) + "/month."));
    // re-fund mid-project and halt
    const cRow = el("div", "btnrow");
    cRow.appendChild(el("span", "lbl", "Funding: "));
    const cSel = el("select", "usel");
    for (const f of RND_FUNDING) {
      const o = el("option", "", f.name); o.value = "" + f.mult;
      if (f.mult === a.fund) o.selected = true;
      cSel.appendChild(o);
    }
    cSel.addEventListener("change", () => {
      setResearchFunding(st, p, +cSel.value || 1);
      setStatus(t.name + " now funded at " + fundingName(+cSel.value || 1) + ".");
      renderPanel(G);
    });
    cRow.appendChild(cSel);
    cRow.appendChild(btn("Halt project", "ubtn warn", () => {
      const r = stopResearch(st, p);
      setStatus(r.ok ? t.name + " shelved — part-finished work written off." : r.msg);
      renderPanel(G);
    }));
    aSect.appendChild(cRow);
  } else {
    aSect.appendChild(el("div", "dim", "No active project — pick one below."));
  }
  panel.appendChild(aSect);

  // one row per tech: done / researchable / leasable / locked (with reason)
  const list = el("div", "sect");
  for (const key of Object.keys(RND_TECHS)) {
    const t = RND_TECHS[key];
    const row = el("div", "selbox");
    row.appendChild(el("div", "lhead", t.name));
    row.appendChild(el("div", "dim small", t.blurb));
    if (researchDone(p, key)) {
      const from = p.research.leased && p.research.leased[key] !== undefined
        ? st.companies[p.research.leased[key]] : null;
      row.appendChild(el("div", "small", "✔ In service." + (from ? " (licensed from " + from.name + ")" : "")));
    } else if (p.research.active && p.research.active.key === key) {
      row.appendChild(el("div", "small", "…under way — " + Math.round(researchProgress(p) * 100) + "% complete."));
    } else {
      const why = canResearch(st, p, key);
      const brow = el("div", "btnrow");
      let anyBtn = false;
      if (why) row.appendChild(el("div", "dim small", why));
      if (!why) {
        const fee = rndMonthlyFee(key, fund, researchCost(st, key));
        const yrs = (t.years / fund).toFixed(1);
        const b = btn("Research (" + fmtYen(fee) + "/mo, ~" + yrs + " yrs)", "ubtn go", () => {
          const r = startResearch(st, p, key, fund);
          setStatus(r.ok ? "R&D started: " + t.name + " (" + fmtYen(r.fee) + "/month)." : r.msg);
          renderPanel(G);
        });
        if (p.cash < fee) b.disabled = true;
        brow.appendChild(b); anyBtn = true;
      }
      // licensing: instant, from whichever rival developed it first
      if (!canLease(st, p, key)) {
        const src = leaseSources(st, p, key)[0];
        const price = leasePrice(st, key);
        const lb = btn("License from " + src.name + " (" + fmtYen(price) + ")", "ubtn", () => {
          const r = leaseTech(st, p, key, src);
          setStatus(r.ok ? "Licensed " + t.name + " from " + r.owner.name + " for " + fmtYen(r.price) + " — in service now." : r.msg);
          renderPanel(G);
        });
        if (p.cash < price) lb.disabled = true;
        brow.appendChild(lb); anyBtn = true;
      }
      if (anyBtn) row.appendChild(brow);
    }
    list.appendChild(row);
  }
  panel.appendChild(list);

  // industry standards — never researched, adopted by everyone automatically
  const auto = el("div", "sect");
  auto.appendChild(el("div", "lbl", "Industry practice (automatic, not researched):"));
  for (const key of Object.keys(RND_AUTO)) {
    const t = RND_AUTO[key];
    if (key === "taishin_rnd" && !campaignOf(st).quakes) continue;
    auto.appendChild(el("div", "dim small",
      (researchDone(p, key) ? "✔ " : "· ") + t.name + " (from " + t.year + ")"));
  }
  panel.appendChild(auto);
}

function workforcePanel(G, panel) {
  const st = G.st, p = player(st);
  panel.appendChild(el("div", "ptitle", "WORKFORCE & MORALE"));

  // --- morale ---
  const morale = p.morale ?? CFG.HR.moraleDefault;
  panel.appendChild(el("div", "lbl", "Employee morale: " + moraleLabel(morale) + " (" + Math.round(morale * 100) + "%)"));
  panel.appendChild(meterBar(morale, morale >= 0.62 ? "#62b06a" : morale >= 0.45 ? "#e0b23a" : "#d2624a"));
  if (p._strikeDays > 0) {
    panel.appendChild(el("div", "logline major", "ON STRIKE — service crippled for ~" + Math.ceil(p._strikeDays) +
      " more days. Raise wages to keep staff happy."));
  }

  // --- wage control ---
  const labor = st.labor || { wageMult: 1, tightness: 0 };
  const prevailing = prevailingWageYear(st);
  const relPct = Math.round((p.wageLevel / Math.max(0.5, labor.wageMult)) * 100);
  const sect = el("div", "sect");
  sect.appendChild(el("div", "lbl", "Wage policy: " + Math.round(p.wageLevel * 100) + "% of base · you pay " +
    relPct + "% of the going rate"));
  const slider = el("input");
  slider.type = "range";
  slider.min = "" + Math.round(CFG.HR.wageLevelMin * 100);
  slider.max = "" + Math.round(CFG.HR.wageLevelMax * 100);
  slider.step = "5";
  slider.value = "" + Math.round(p.wageLevel * 100);
  slider.style.width = "100%";
  const readout = el("div", "dim small",
    relPct < 90 ? "Underpaying — staff are unhappy and you may be short-handed (slower builds)." :
    relPct > 115 ? "Generous pay — morale climbs, but payroll bites." :
    "About the market rate.");
  slider.addEventListener("input", () => {
    p.wageLevel = clamp((+slider.value || 100) / 100, CFG.HR.wageLevelMin, CFG.HR.wageLevelMax);
    const r = Math.round((p.wageLevel / Math.max(0.5, labor.wageMult)) * 100);
    readout.textContent = r < 90 ? "Underpaying — staff are unhappy and you may be short-handed (slower builds)." :
      r > 115 ? "Generous pay — morale climbs, but payroll bites." : "About the market rate.";
  });
  slider.addEventListener("change", () => { recomputeCompanyOp(st, p); renderPanel(G); });
  sect.appendChild(slider);
  sect.appendChild(readout);
  panel.appendChild(sect);

  // --- payroll / headcount / op cost ---
  const op = p._opCost || { payroll: 0, track: 0, train: 0, total: 0 };
  const table = el("table", "ftable");
  for (const [k, v] of [
    ["Employees", fmtNum(p._headcount || 0)],
    ["Prevailing wage / head / yr", fmtYen(prevailing)],
    ["Annual payroll", fmtYen(op.payroll)],
    ["Annual track maintenance", fmtYen(op.track)],
    ["Annual train maintenance", fmtYen(op.train)],
    ["Total annual operating cost", fmtYen(op.total)],
  ]) {
    const tr = el("tr"); tr.appendChild(el("td", "", k)); tr.appendChild(el("td", "num", v));
    table.appendChild(tr);
  }
  panel.appendChild(table);

  // --- labor market ---
  const tl = labor.tightness || 0;
  const tdesc = tl < 0.35 ? "slack — labor is plentiful and cheap" :
    tl < 0.7 ? "balanced" : tl < 1.0 ? "tight — wages rising" : "very tight — worker shortage!";
  panel.appendChild(el("div", "lbl", "LABOR MARKET"));
  panel.appendChild(el("div", "small", "Conditions: " + tdesc));
  panel.appendChild(el("div", "dim small", "Going rate ×" + (labor.wageMult || 1).toFixed(2) +
    " of base. Booms and industry-wide building drive wages up; pay below the rate and construction slows."));

  // --- awards ---
  const aw = st.awardsLast;
  if (aw && aw.results && aw.results.length) {
    panel.appendChild(el("div", "lbl", "AWARDS — " + logYearLabel(st, aw.year) +
      (st.campaign === "tokyo" ? " (" + aw.year + ")" : "")));
    for (const r of aw.results) {
      const line = el("div", "small" + (r.bad ? " neg" : ""),
        (r.bad ? "🚩 " : "🏅 ") + r.label + " — " + r.name + (r.cash ? " (+" + fmtYen(r.cash) + ")" : ""));
      panel.appendChild(line);
    }
  }
  if (p.awards && p.awards.length) {
    panel.appendChild(el("div", "dim small", "Your milestones earned: " + p.awards.length));
  }
}

/* ---- Companies ---- */
function companiesPanel(G, panel) {
  const st = G.st, p = player(st);
  panel.appendChild(el("div", "ptitle", "COMPANY STANDINGS"));
  const alive = st.companies.filter(c => c.alive);
  const maxCash = Math.max(...alive.map(c => Math.max(1, c.cash)));
  const maxPax = Math.max(...alive.map(c => Math.max(1, c.stats.paxAvg)));
  const ranked = alive.slice().sort((a, b) =>
    (b.cash / maxCash + b.stats.paxAvg / maxPax) - (a.cash / maxCash + a.stats.paxAvg / maxPax));
  ranked.forEach((co, rank) => {
    const box = el("div", "linebox");
    const head = el("div", "lhead", (rank + 1) + ". " + co.name + (co.isPlayer ? " (YOU)" : ""));
    head.style.borderLeft = "4px solid " + co.color;
    box.appendChild(head);
    box.appendChild(el("div", "small", "Cash " + fmtYen(co.cash) + " · " + fmtNum(co.stats.paxAvg) +
      " pax/day · value " + fmtYen(companyValue(st, co))));
    box.appendChild(el("div", "dim small", "Morale: " + moraleLabel(co.morale ?? 0.78) +
      " (" + Math.round((co.morale ?? 0.78) * 100) + "%)" +
      (co._strikeDays > 0 ? " · ON STRIKE" : "") + " · " + fmtNum(co._headcount || 0) + " staff"));
    box.appendChild(el("div", "dim small", "Gauge: " + CFG.GAUGES[co.gauge].name + " · founded " + co.founded +
      (co.rights.length ? " · rights over: " + co.rights.map(id => st.companies[id].name).join(", ") : "")));
    if (!co.isPlayer) {
      const row = el("div", "btnrow");
      const ask = rightsAskingPrice(st, p, co);
      row.appendChild(btn("Trackage rights (" + fmtYen(ask) + ")", "ubtn", () => {
        const r = negotiateRights(st, p, co);
        setStatus(r.ok ? "Deal! You may now run trains over " + co.name + " track." : r.msg);
        renderPanel(G);
      }));
      const price = Math.round(companyValue(st, co) * 1.2);
      // an acquisition can be refused for two reasons: a hard age gate (too
      // young to be bought at all) or the target's board holding out — the
      // latter shifts with the year and the target's finances
      const blocked = buyoutBlockedReason(st, co) || buyoutHoldoutReason(st, co);
      const buyBtn = btn("Buy out (" + fmtYen(price) + ")", "ubtn warn", () => {
        if (blocked) { setStatus(blocked); return; }
        openModal("Acquire " + co.name + "?", el("div", "", "All their land, track, stations, lines and trains become yours for " + fmtYen(price) + "."), [
          ["Acquire", () => {
            const r = buyOutCompany(st, p, co);
            setStatus(r.ok ? "You acquired " + co.name + "!" : r.msg);
            if (r.ok) logEvent(st, p.name + " acquired " + co.name + " for " + fmtYen(r.price) + ".");
            renderPanel(G);
          }], ["Cancel", null]]);
      });
      if (blocked) { buyBtn.disabled = true; buyBtn.title = blocked; }
      row.appendChild(buyBtn);
      box.appendChild(row);
      if (blocked) {
        box.appendChild(el("div", "dim small", "🛡 " + blocked));
      }
    }
    panel.appendChild(box);
  });
  panel.appendChild(el("div", "dim small", "Victory in " + CFG.END_YEAR + ": highest combined cash + average daily passengers."));
}

/** Button row to fast-forward time to the next construction/station completion.
 *  The label shows the nearest completion's remaining ETA in calendar days —
 *  the SAME figure as the shortest "~X days left" line in the queue — so the
 *  two always read consistently. The fast-forward itself advances whole
 *  simulated months (the sim only ticks construction on month boundaries), so
 *  the clock may land up to one simulated month past the exact ETA. */
function skipAheadRow(G, panel) {
  const st = G.st, p = player(st);
  const simDays = st.ended ? 0 : daysToNextCompletion(st, p);
  if (simDays <= 0) return;
  const spd = Math.max(0.1, p._buildSpeed || 1);
  const calDays = Math.max(1, Math.ceil(calendarDaysToNextCompletion(st, p) / spd));
  const row = el("div", "btnrow");
  row.appendChild(btn("⏩ Skip ahead ~" + calDays + " day" + (calDays === 1 ? "" : "s") + " (to next completion)", "ubtn go", () => {
    fastForwardDays(st, simDays);
    setStatus("Skipped ahead ~" + calDays + " day" + (calDays === 1 ? "" : "s") + " — costs and income applied as normal.");
    renderPanel(G);
  }));
  panel.appendChild(row);
}

/* ---- Log ---- */
function logPanel(G, panel) {
  const st = G.st;
  st.events.unread = 0;
  panel.appendChild(el("div", "ptitle", "EVENT LOG"));
  skipAheadRow(G, panel);
  const list = st.events.log.slice(-60).reverse();
  for (const e of list) {
    const d = el("div", "logline " + e.kind);
    d.appendChild(el("span", "dim", logYearLabel(st, e.year) + ": "));
    d.appendChild(document.createTextNode(e.text));
    panel.appendChild(d);
  }
  if (!list.length) panel.appendChild(el("div", "dim", "Nothing yet."));
}

/* ---- System ---- */
function systemPanel(G, panel) {
  const st = G.st, ui = G.ui;
  panel.appendChild(el("div", "ptitle", "SYSTEM"));
  // language toggle (mirrors the start screen; persisted in localStorage)
  const langRow = el("div", "btnrow");
  langRow.appendChild(el("span", "lbl", t("lang.toggle") + ":"));
  for (const l of languages())
    langRow.appendChild(btn(I18N[l]["lang.name"], "ubtn" + (getLang() === l ? " active" : ""),
      () => applyLang(G, l)));
  panel.appendChild(langRow);
  const row1 = el("div", "btnrow");
  const saveBtn = btn(t("btn.save"), "ubtn", () => setStatus(saveToLocal(st) ? "Saved." : "Save failed (storage full?)"));
  saveBtn.title = "Save to this browser's local storage (no file is created).";
  row1.appendChild(saveBtn);
  const loadBtn = btn(t("btn.load"), "ubtn", () => {
    try {
      const s2 = loadFromLocal();
      if (s2) { G.st = s2; G.st.renderDirty = true; setStatus("Loaded."); renderPanel(G); }
      else setStatus("No save found. (Load reads browser storage — to open a .json file use Import file.)");
    } catch (e) { setStatus("Load failed: " + e.message); }
  });
  loadBtn.title = "Load the game saved in this browser. To open a downloaded .json file, use Import file instead.";
  row1.appendChild(loadBtn);
  panel.appendChild(row1);
  const row2 = el("div", "btnrow");
  const expBtn = btn("Export file", "ubtn", () => {
    const blob = new Blob([exportSaveString(st)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // London playthroughs export as london-railroad-tycoon by default
    a.download = campaignOf(st).savePrefix + st.time.year + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  });
  expBtn.title = "Download the current game as a .json file you can keep or share.";
  row2.appendChild(expBtn);
  const imp = el("input"); imp.type = "file"; imp.accept = ".json,application/json"; imp.style.display = "none";
  imp.addEventListener("change", () => {
    const f = imp.files[0]; if (!f) return;
    f.text().then(txt => {
      try { G.st = importSaveString(txt); G.st.renderDirty = true; setStatus("Imported."); renderPanel(G); }
      catch (e) { setStatus("Import rejected: " + e.message); }
    });
  });
  row2.appendChild(imp);
  const impBtn = btn("Import file", "ubtn", () => imp.click());
  impBtn.title = "Open a .json save file from your computer (use this to load a downloaded/shared save).";
  row2.appendChild(impBtn);
  panel.appendChild(row2);

  // audio: separate music (BGM) and sound-effects (SFX) volume bars + mute
  // (BGM crossfades per era; missing files stay silent)
  if (typeof bgmVolume === "function") {
    const aSect = el("div", "sect");
    aSect.appendChild(el("div", "lbl", "AUDIO"));
    const muteLbl = el("label", "lbl");
    const muteCb = el("input"); muteCb.type = "checkbox"; muteCb.checked = audioMuted();
    muteLbl.appendChild(muteCb);
    muteLbl.appendChild(document.createTextNode(" Mute all audio"));
    muteCb.addEventListener("change", () => {
      setAudioMuted(muteCb.checked);
      const b = document.getElementById("audioBtn");
      if (b) { b.textContent = muteCb.checked ? "🔇" : "🔊"; b.classList.toggle("active", !muteCb.checked); }
    });
    aSect.appendChild(muteLbl);
    // one labelled slider (0–100%, live read-out) per audio channel
    const volBar = (label, getter, setter) => {
      const row = el("div", "airow");
      row.appendChild(el("span", "lbl", label));
      const s = el("input"); s.type = "range"; s.min = "0"; s.max = "100"; s.step = "5";
      s.value = "" + Math.round(getter() * 100);
      const pct = el("span", "dim small", s.value + "%");
      s.addEventListener("input", () => { setter((+s.value || 0) / 100); pct.textContent = s.value + "%"; });
      row.appendChild(s);
      row.appendChild(pct);
      aSect.appendChild(row);
    };
    volBar("Music (BGM):", bgmVolume, setBgmVolume);
    volBar("Effects (SFX):", sfxVolume, setSfxVolume);
    aSect.appendChild(el("div", "dim small",
      "Music and sound effects have independent volumes. Per-era background music crossfades as the years pass; sound effects mark builds, upgrades, disasters and more. Drop files into assets/audio/ (see the README) — any slot without a file stays silent."));
    panel.appendChild(aSect);
  }
  const row3 = el("div", "btnrow");
  // reopens the full start screen (class/rivals/difficulty/campaign); the
  // current game keeps running behind it and nothing is lost until Start
  row3.appendChild(btn("New game…", "ubtn warn", () => reopenStartScreen(G)));
  panel.appendChild(row3);

  // the difficulty this game was set up with (start-screen choices)
  const dSect = el("div", "sect");
  dSect.appendChild(el("div", "lbl", "DIFFICULTY"));
  const cls = CFG.PLAYER_CLASSES[st.playerClass];
  if (cls) dSect.appendChild(el("div", "dim small", "You: " + cls.name + " — " + cls.difficulty));
  for (const co of st.companies) {
    if (co.isPlayer || !co.ai) continue;
    const d = CFG.AI.DIFFICULTIES[co.ai.difficulty] || CFG.AI.DIFFICULTIES[CFG.AI.DEFAULT_DIFFICULTY];
    dSect.appendChild(el("div", "dim small", co.name + " — " + d.name + (co.alive ? "" : " (defunct)")));
  }
  panel.appendChild(dSect);
  const lab = el("label", "lbl block");
  const cb = el("input"); cb.type = "checkbox"; cb.checked = ui.showOwners;
  cb.addEventListener("change", () => { ui.showOwners = cb.checked; });
  lab.appendChild(cb); lab.appendChild(document.createTextNode(" Show land ownership overlay"));
  panel.appendChild(lab);
  panel.appendChild(el("div", "dim small", "Autosaves every year to localStorage. Seed: " + st.seed));
  panel.appendChild(el("div", "dim small",
    campaignOf(st).title + " Railroad Tycoon v" + CFG.VERSION));
}

/* =========================================================================
 * Canvas interaction
 * ========================================================================= */
function initCanvasInput(G) {
  const canvas = document.getElementById("map");
  const ui = G.ui;
  let dragging = false, dragMoved = false, lastX = 0, lastY = 0;

  canvas.addEventListener("mousedown", e => { dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener("mouseup", e => {
    try {
      if (dragging && !dragMoved && e.target === canvas) handleClick(G, e);
    } finally {
      dragging = false;
    }
  });
  // safety net: if the mouse button was released outside the window (so no
  // mouseup was ever seen) or a click handler above threw before resetting
  // `dragging`, a stray move with the button no longer held would otherwise
  // be misread as an ongoing drag and pan the map out from under the cursor
  // forever ("map attached to pointer"). e.buttons === 0 catches that.
  window.addEventListener("blur", () => { dragging = false; });
  canvas.addEventListener("mousemove", e => {
    if (dragging && e.buttons === 0) dragging = false;
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
      if (dragMoved) {
        G.renderer.cam.x -= dx / G.renderer.cam.zoom;
        G.renderer.cam.y -= dy / G.renderer.cam.zoom;
        lastX = e.clientX; lastY = e.clientY;
      }
    }
    const rect = canvas.getBoundingClientRect();
    ui.hover = G.renderer.pickHex(e.clientX - rect.left, e.clientY - rect.top);
    if (ui.hover >= 0 && ui.mode === "inspect") setStatus(hexInfo(G.st, ui.hover));
  });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(G, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.89);
  }, { passive: false });

  /* ---- touch: one-finger pan / tap, two-finger pinch-zoom ----
   * Mirrors the mouse behaviour so the map is fully usable on a phone: drag a
   * finger to pan, pinch to zoom (toward the pinch midpoint), and a tap that
   * doesn't move selects/acts on a hex just like a click. */
  let tDragging = false, tMoved = false, tLastX = 0, tLastY = 0;
  let pinchDist = 0;
  const touchMid = ts => {
    const rect = canvas.getBoundingClientRect();
    return { x: (ts[0].clientX + ts[1].clientX) / 2 - rect.left,
             y: (ts[0].clientY + ts[1].clientY) / 2 - rect.top };
  };
  const touchSpread = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);

  canvas.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
      tDragging = true; tMoved = false;
      tLastX = e.touches[0].clientX; tLastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      tDragging = false; tMoved = true;            // a pinch is never a tap
      pinchDist = touchSpread(e.touches);
      const m = touchMid(e.touches); tLastX = m.x; tLastY = m.y;
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", e => {
    if (e.touches.length === 1 && tDragging) {
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      const dx = x - tLastX, dy = y - tLastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) tMoved = true;
      if (tMoved) {
        G.renderer.cam.x -= dx / G.renderer.cam.zoom;
        G.renderer.cam.y -= dy / G.renderer.cam.zoom;
        tLastX = x; tLastY = y;
      }
    } else if (e.touches.length === 2) {
      tMoved = true;
      const m = touchMid(e.touches);
      const dist = touchSpread(e.touches);
      if (pinchDist > 0 && dist > 0) zoomAt(G, m.x, m.y, dist / pinchDist);
      // also pan with the moving midpoint (two-finger drag)
      G.renderer.cam.x -= (m.x - tLastX) / G.renderer.cam.zoom;
      G.renderer.cam.y -= (m.y - tLastY) / G.renderer.cam.zoom;
      pinchDist = dist; tLastX = m.x; tLastY = m.y;
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", e => {
    if (tDragging && !tMoved && e.changedTouches.length) {
      const t = e.changedTouches[0];
      handleClick(G, { clientX: t.clientX, clientY: t.clientY });   // a tap acts like a click
    }
    if (e.touches.length === 0) { tDragging = false; pinchDist = 0; }
  });
}

/** Zoom the camera by `factor` while keeping the world point under screen
 *  pixel (fx, fy) — canvas-relative — fixed, so wheel/pinch zoom toward the
 *  cursor or pinch midpoint rather than the map centre. */
function zoomAt(G, fx, fy, factor) {
  const cam = G.renderer.cam;
  const before = G.renderer.screenToWorld(fx, fy);
  cam.zoom = clamp(cam.zoom * factor, 0.4, 5);
  const after = G.renderer.screenToWorld(fx, fy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
}

function hexInfo(st, idx) {
  const h = st.hexes[idx];
  let s = (h.name ? h.name + " " : "") + "#" + h.spiral + " · " + h.terrain;
  if (h.cons) s += " · " + consName(st, h.cons) + " (dev " + h.dev + ")";
  if (h.track) s += " · track: " + (st.companies[h.track.co] ? st.companies[h.track.co].name : "?") +
    " " + trackRailList(h.track).map(r => r.gauge + (r.elec ? "⚡" : "") + (r.building ? "…" : "")).join("+") +
    (h.track.dmg ? " [DAMAGED " + h.track.dmg + "d]" : "");
  for (const sid of h.stations) {
    const sta = st.stations[sid];
    if (!sta.alive) continue;
    const kind = sta.isDepot ? (sta.depotAsStation ? "DEPOT+STATION" : "DEPOT") : "STATION";
    const px = sta.building || (sta.isDepot && !sta.depotAsStation) ? "" : ", ~" + fmtNum(stationPaxDay(sta)) + " pax/day";
    s += " · " + kind + " " + sta.name + " (" + sta.cars + "-car" + (sta.building ? ", building" : "") + px + ")";
  }
  const roadWord = campaignOf(st).roadWord;
  s += " · owner: " + (h.owner === -1 ? "none — price " + fmtYen(landPrice(st, idx)) :
    h.owner === -2 ? (h.holdout || "private") + " (not for sale)" :
    h.owner === -3 ? "government " + roadWord + " (rights " + fmtYen(kaidoRightsCost(st, idx)) + ")" :
    h.owner === -4 ? "public building (not for sale)" :
    (st.companies[h.owner] ? st.companies[h.owner].name : "?"));
  if (h.kaido) s += " · " + ((CFG.KAIDO.ROUTES[h.kaido.route] || {}).name || roadWord) + " (" + h.kaido.state + ")";
  return s;
}

function handleClick(G, e) {
  const st = G.st, ui = G.ui, p = player(st);
  const rect = document.getElementById("map").getBoundingClientRect();
  const idx = G.renderer.pickHex(e.clientX - rect.left, e.clientY - rect.top);
  if (idx < 0) return;
  const h = st.hexes[idx];

  if (ui.mode === "buyland") {
    confirmBuyLand(G, idx);
  } else if (ui.mode === "track") {
    // clicking your own track opens gauge works (add a parallel gauge / regauge)
    if (h.track && h.track.co === p.id) { gaugeModal(G, idx); return; }
    // otherwise lay fresh track: one hex at a time, confirmed by the player
    const q = buildTrackHex(st, p, idx, true);
    if (!q.ok) { denyStatus(st, q.msg); return; }
    const body = el("div");
    body.appendChild(el("div", "", "Lay 1 km of " + CFG.GAUGES[p.gauge].name + (q.elec ? " electrified" : "") +
      " track on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral + " (" + h.terrain + ")."));
    body.appendChild(el("div", "small", "Construction: " + fmtYen(q.cost)));
    const roadWord = campaignOf(st).roadWord;
    if (q.landCost && q.rightsOnly) {
      body.appendChild(el("div", "small", "Trackage rights (one-time): " + fmtYen(q.landCost)));
      body.appendChild(el("div", "dim small",
        "The " + roadWord + " corridor stays government land — you buy a permanent right to run track across it, not the parcel. " +
        "Rights here aren't exclusive: any other railway may buy its own crossing rights and share the corridor, each paying its own one-time fee."));
    } else if (q.landCost) {
      body.appendChild(el("div", "small", "Land purchase: " + fmtYen(q.landCost)));
    } else if (q.rightsOnly) {
      body.appendChild(el("div", "dim small", "You already hold trackage rights on this " + roadWord + " hex — no further fee."));
    }
    body.appendChild(el("div", "small", "Build time: ~" + q.days + " days"));
    openModal("Lay track", body, [
      ["Confirm (" + fmtYen(q.cost + q.landCost) + ")", () => {
        const r = buildTrackHex(st, p, idx);
        setStatus(r.ok ? "Track under construction on hex #" + h.spiral + " (~" + r.days + " days)." : r.msg);
        renderPanel(G);
      }],
      ["Cancel", null]]);
  } else if (ui.mode === "station") {
    const why = canBuildStation(st, p, idx);
    if (why) { denyStatus(st, why); return; }
    const cost = stationBuildCost(st, p, idx);
    openModal("Build station", el("div", "",
      "Build a station on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral + " for " + fmtYen(cost) +
      "? (~" + stationBuildDays(st) + " days, " +
      p.stationDefaults.cars + "-car platforms)"), [
      ["Confirm (" + fmtYen(cost) + ")", () => {
        const r = buildStation(st, p, idx);
        setStatus(r.ok ? "Station under construction (" + stationBuildDays(st) + " days)." : r.msg);
        renderPanel(G);
      }],
      ["Cancel", null]]);
  } else if (ui.mode === "depot") {
    const why = canBuildStation(st, p, idx);
    if (why) { denyStatus(st, why); return; }
    const costDepot = depotBuildCost(st, p, idx, false), costStation = depotBuildCost(st, p, idx, true);
    const body = el("div");
    body.appendChild(el("div", "", "Build a rolling-stock depot on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
      "? (~" + CFG.DEPOT.buildDays + " days)"));
    body.appendChild(el("div", "dim small", "A depot stables spare rolling stock: it lets a line run more than " +
      CFG.DEPOT.trainsPerLineNoDepot + " trains, keeps the trains of deleted lines instead of selling them off, " +
      "and lets you pull a train off a line without deleting it. " +
      "Doubling as a station costs more and draws some passenger traffic, but yard facilities reduce its commerce by " +
      Math.round((1 - CFG.DEPOT.commerceMult) * 100) + "%. Depot+station uses your default " +
      p.stationDefaults.cars + "-car platforms."));
    openModal("Build depot", body, [
      ["Depot only (" + fmtYen(costDepot) + ")", () => {
        const r = buildDepot(st, p, idx, false);
        setStatus(r.ok ? "Depot under construction (" + CFG.DEPOT.buildDays + " days)." : r.msg);
        renderPanel(G);
      }],
      ["Depot + station (" + fmtYen(costStation) + ")", () => {
        const r = buildDepot(st, p, idx, true);
        setStatus(r.ok ? "Depot+station under construction (" + CFG.DEPOT.buildDays + " days)." : r.msg);
        renderPanel(G);
      }],
      ["Cancel", null]]);
  } else if (ui.mode === "line" || ui.mode === "editLine") {
    const sid = h.stations.find(id => st.stations[id].co === p.id && st.stations[id].alive && !st.stations[id].building);
    if (sid === undefined) { setStatus("That's not one of your operating stations."); return; }
    if (!isLineStop(st.stations[sid])) { setStatus("A depot-only facility can't be a line stop. Build it as depot+station first."); return; }
    const at = ui.lineSel.indexOf(sid);
    if (at >= 0) ui.lineSel.splice(at, 1);              // click a chosen waypoint again to drop it
    else ui.lineSel.push(sid);                          // otherwise append it to the route
    setStatus(ui.lineSel.length < 2 ? "Pick the stations the line should serve, in order (2+ needed)."
      : ui.lineSel.length + " waypoints selected — add more or build the line in the panel.");
    renderPanel(G);
  } else if (ui.mode === "demolish") {
    demolishModal(G, idx);
  } else if (ui.mode === "develop") {
    developModal(G, idx);
  } else { // inspect: persistent selection shown at the top of the side panel
    ui.selected = idx;
    // focus any station on this hex so its lines are highlighted on the map
    const fsid = h.stations.find(id => st.stations[id].alive);
    ui.focusStation = fsid === undefined ? -1 : fsid;
    setStatus(hexInfo(st, idx));
    renderPanel(G);
  }
}

/** Modal: demolish your track on a hex and optionally redevelop the parcel
 *  into rent-earning property (shopping center, housing complex, …). */
function demolishModal(G, idx) {
  const st = G.st, p = player(st), h = st.hexes[idx];
  const why = canDemolishTrack(st, p, idx, null);
  if (why) { setStatus(why); return; }
  const label = (h.name ? h.name + " " : "") + "hex #" + h.spiral;
  const rails = trackRailList(h.track).filter(r => !r.building);
  const hasStation = h.stations.some(sid => st.stations[sid] && st.stations[sid].alive);
  const dDays = redevelopDays(st, idx, null, true);
  const dCost = redevelopCost(st, p, idx, null, true).demolish;
  const body = el("div");
  body.appendChild(el("div", "", "Demolish track on " + label + ". The track keeps running until the work finishes."));
  if (hasStation) body.appendChild(el("div", "small", "A station sits on this hex — it stays open; only the rail is removed (manage the station to demolish it)."));
  // per-rail demolition when the hex carries more than one gauge
  if (rails.length > 1) {
    for (const r of rails) {
      const aff = linesUsingHexGauge(st, idx, CFG.GAUGES[r.gauge].mm).length;
      body.appendChild(btn("Remove " + CFG.GAUGES[r.gauge].name + " rail — " + fmtYen(dCost) + " (~" + dDays + " days" +
        (aff ? ", " + aff + " line(s)" : "") + ")", "ubtn wide", () => {
        const res = demolishTrack(st, p, idx, null, r.gauge);
        setStatus(res.ok ? "Demolition started (~" + res.days + " days)." : res.msg);
        closeModal(); renderPanel(G);
      }));
    }
  }
  const affAll = linesUsingHex(st, idx).length;
  body.appendChild(btn((rails.length > 1 ? "Remove all rails" : "Demolish track only") + " — " + fmtYen(dCost) +
    " (~" + dDays + " days" + (affAll ? ", " + affAll + " line(s)" : "") + ")", "ubtn wide", () => {
    const r = demolishTrack(st, p, idx, null, null);
    setStatus(r.ok ? "Demolition started (~" + r.days + " days)." : r.msg);
    closeModal(); renderPanel(G);
  }));
  // redeveloping the parcel into property needs an empty, owned, station-free hex
  if (!hasStation && h.owner === p.id) {
    body.appendChild(el("div", "lbl block", "Or demolish all & build (owned — earns rent):"));
    for (const type of Object.keys(CFG.DEVELOP.builds)) {
      const spec = CFG.DEVELOP.builds[type];
      if (spec.from && st.time.year < spec.from) continue;      // not yet buildable in this era
      const q = redevelopCost(st, p, idx, type, true);
      const days = redevelopDays(st, idx, type, true);
      const rent = estimatedRentYear(st, (h.value || landPrice(st, idx)), spec.dev, type);
      body.appendChild(btn(spec.label + " — " + fmtYen(q.total) + " (~" + days + " days, up to ~" + fmtYen(rent) + "/yr rent)", "ubtn wide", () => {
        const r = demolishAndDevelop(st, p, idx, type);
        setStatus(r.ok ? spec.label + " — redevelopment started (~" + r.days + " days, then ~" + fmtYen(r.rentPerYear) + "/yr rent)." : r.msg);
        closeModal(); renderPanel(G);
      }));
    }
  } else if (hasStation) {
    body.appendChild(el("div", "dim small", "To turn this parcel into rent-earning property, demolish the station first (Manage station)."));
  }
  openModal("Demolish — " + label, body, [["Close", null]]);
}

/** Modal: add a parallel gauge of rail to a hex you own, or convert (regauge)
 *  an existing rail. Trains can't run between gauges — only alongside. */
function gaugeModal(G, idx) {
  const st = G.st, p = player(st), h = st.hexes[idx];
  if (!h.track || h.track.co !== p.id) { setStatus("You need your own track on this hex first."); return; }
  const label = (h.name ? h.name + " " : "") + "hex #" + h.spiral;
  const rails = trackRailList(h.track);
  const body = el("div");
  body.appendChild(el("div", "", "Rails on " + label + ": " +
    rails.map(r => CFG.GAUGES[r.gauge].name + (r.elec ? " ⚡" : "") + (r.building ? " (building)" : "")).join(" + ") + "."));
  if (hexHasPendingWork(st, idx)) {
    body.appendChild(el("div", "small warn", "⚠ Works are already under way on this hex — wait for them to finish."));
    openModal("Manage track — " + label, body, [["Close", null]]);
    return;
  }
  body.appendChild(el("div", "dim small", "Trains never run between rails of different gauge — they only run alongside each other on the hex."));
  // add a parallel gauge (≈ fresh track cost, no land — the parcel is yours)
  const addable = addableGauges(st, idx);
  if (addable.length) {
    body.appendChild(el("div", "lbl block", "Add a parallel rail (≈ fresh track, no land to buy):"));
    for (const g of addable) {
      const q = addGauge(st, p, idx, g, true);
      if (!q.ok) continue;
      body.appendChild(btn("Add " + CFG.GAUGES[g].name + " — " + fmtYen(q.cost) + " (~" + q.days + " days)", "ubtn wide", () => {
        const r = addGauge(st, p, idx, g);
        setStatus(r.ok ? "Adding " + CFG.GAUGES[g].name + " rail (~" + r.days + " days)." : r.msg);
        closeModal(); renderPanel(G); if (r.ok) gaugeModal(G, idx);
      }));
    }
  }
  // convert an existing in-service rail (slow & labour-heavy; no service until done)
  const targets = gaugesAvailable(st.time.year);
  const convertible = rails.filter(r => !r.building);
  let anyConv = false;
  const convSect = el("div");
  convSect.appendChild(el("div", "lbl block", "Convert a rail to another gauge (cheap materials, but slow — no service until done):"));
  for (const r of convertible) {
    for (const tg of targets) {
      if (tg === r.gauge || trackHasGauge(h.track, tg)) continue;
      const q = changeGauge(st, p, idx, r.gauge, tg, true);
      if (!q.ok) continue;
      anyConv = true;
      convSect.appendChild(btn(CFG.GAUGES[r.gauge].name + " → " + CFG.GAUGES[tg].name + " — " + fmtYen(q.cost) +
        " (~" + q.days + " days)", "ubtn wide warn", () => {
        const aff = linesUsingHexGauge(st, idx, CFG.GAUGES[r.gauge].mm).length;
        const go = () => {
          const res = changeGauge(st, p, idx, r.gauge, tg);
          setStatus(res.ok ? "Regauging started (~" + res.days + " days, no service until done)." : res.msg);
          closeModal(); renderPanel(G);
        };
        if (aff) openModal("Regauge " + label + "?", el("div", "", "⚠ " + aff +
          " line(s) run on " + CFG.GAUGES[r.gauge].name + " through this hex and will be removed (their trains go to storage). The rail carries no service until the works finish. Continue?"),
          [["Regauge", go], ["Cancel", null]]);
        else go();
      }));
    }
  }
  if (anyConv) body.appendChild(convSect);
  openModal("Manage track — " + label, body, [["Close", null]]);
}

/** Modal: build, demolish or replace a building on an owned, track-free parcel.
 *  This is the land-development path — no rails involved — so the player can
 *  reshape any buildings on land they own. The work takes time; the parcel keeps
 *  earning its current rent until it completes. */
function developModal(G, idx) {
  const st = G.st, p = player(st), h = st.hexes[idx];
  const why = canDevelopParcel(st, p, idx);
  if (why) { setStatus(why); return; }
  const label = (h.name ? h.name + " " : "") + "hex #" + h.spiral;
  const existing = h.cons && h.cons !== "rice" ? h.cons : null;
  const body = el("div");
  body.appendChild(el("div", "", existing
    ? "This parcel holds a " + (CFG.CONS[existing] ? existing : "building") + ". Clear it, or replace it with a new development. It keeps earning until the work finishes."
    : "Build a development on this owned parcel. It earns rent once the work finishes."));
  if (existing) {
    const dq = redevelopCost(st, p, idx, null, true);
    const dDays = redevelopDays(st, idx, null, true);
    body.appendChild(btn("Demolish building — " + fmtYen(dq.demolish) + " (~" + dDays + " days)", "ubtn wide", () => {
      const r = developParcel(st, p, idx, null);
      setStatus(r.ok ? "Demolition started (~" + r.days + " days)." : r.msg);
      closeModal(); renderPanel(G);
    }));
    body.appendChild(el("div", "lbl block", "Or replace with:"));
  } else {
    body.appendChild(el("div", "lbl block", "Build:"));
  }
  for (const type of Object.keys(CFG.DEVELOP.builds)) {
    const spec = CFG.DEVELOP.builds[type];
    if (spec.from && st.time.year < spec.from) continue;        // not yet buildable in this era
    const q = redevelopCost(st, p, idx, type, !!existing);
    const days = redevelopDays(st, idx, type, !!existing);
    const rent = estimatedRentYear(st, (h.value || landPrice(st, idx)), spec.dev, type);
    const upkeep = Math.round((CFG.CONS[type] ? CFG.CONS[type].upkeepYear || 0 : 0) * inflationOf(st, st.time.year));
    body.appendChild(btn(spec.label + " — " + fmtYen(q.total) + " (~" + days + " days, up to ~" + fmtYen(rent) +
      "/yr rent, " + fmtYen(upkeep) + "/yr upkeep)", "ubtn wide", () => {
      const r = developParcel(st, p, idx, type);
      setStatus(r.ok ? spec.label + " — construction started (~" + r.days + " days, then up to ~" + fmtYen(r.rentPerYear) + "/yr rent)." : r.msg);
      closeModal(); renderPanel(G);
    }));
  }
  body.appendChild(el("div", "dim small",
    "A new building opens ~" + Math.round(CFG.LAND.OCC.newBuildStart * 100) + "% occupied and fills (or doesn't) with the district: " +
    "demand nearby, a busy station of yours, the population trend — minus competing space next door. Upkeep is owed even when it stands empty."));
  openModal("Build / develop — " + label, body, [["Close", null]]);
}

/** Construction-panel section for the ordered waypoint route, shown while in
 *  Create Line ("line") or Edit Route ("editLine") mode. */
function lineBuilderSection(G, panel) {
  const st = G.st, p = player(st), ui = G.ui;
  const editing = ui.mode === "editLine" && st.lines[ui.editLineId] && st.lines[ui.editLineId].alive;
  const sect = el("div", "sect");
  sect.appendChild(el("div", "lbl", editing ? "Edit route: " + st.lines[ui.editLineId].name : "New line — route waypoints:"));
  if (!ui.lineSel.length) {
    sect.appendChild(el("div", "dim small", "Click your stations on the map, in the order the line should serve them."));
  }
  ui.lineSel.forEach((sid, k) => {
    const s = st.stations[sid];
    const row = el("div", "airow");
    row.appendChild(el("span", "small", (k + 1) + ". " + (s ? s.name : "(removed)")));
    row.appendChild(btn("✕", "ubtn", () => { ui.lineSel.splice(k, 1); renderPanel(G); }));
    sect.appendChild(row);
  });
  // loop toggle: build a one-way circular line (returns to the first station and
  // trains circulate) instead of a back-and-forth out-and-back service
  const loopLab = el("label", "lbl block");
  const loopCb = el("input"); loopCb.type = "checkbox"; loopCb.checked = !!ui.lineLoop;
  loopCb.addEventListener("change", () => { ui.lineLoop = loopCb.checked; renderPanel(G); });
  loopLab.appendChild(loopCb);
  loopLab.appendChild(document.createTextNode(" ↻ Loop line (one-way circle — needs 3+ stations, returns to the first)"));
  sect.appendChild(loopLab);
  if (ui.lineSel.length >= 2) {
    const prev = planLineGauge(st, p, ui.lineSel, ui.lineLoop, p.gauge);
    sect.appendChild(el("div", "dim small", prev.error ? "⚠ " + prev.error
      : "Route preview: " + prev.path.length + " km" + (ui.lineLoop ? " (closed loop)" : "") + " on " + prev.mm + "mm track."));
  }
  const act = el("div", "btnrow");
  if (editing) {
    act.appendChild(btn("Apply changes", "ubtn go", () => {
      const r = editLineRoute(st, p, ui.editLineId, ui.lineSel.slice(), undefined, ui.lineLoop);
      if (r.ok) {
        setStatus("Route updated — " + r.line.stations.length + " stations, " + r.line.path.length + " km" +
          (r.line.loop ? " (one-way loop)" : "") + ".");
        ui.selectedLine = r.line.id; ui.mode = "inspect"; ui.editLineId = -1; ui.lineSel = []; ui.lineLoop = false; ui.tab = "Lines";
      } else setStatus(r.msg);
      renderPanel(G);
    }));
  } else {
    act.appendChild(btn(ui.lineLoop ? "Build local loop" : "Build local", "ubtn go", () => buildLineFromWaypoints(G, "local", ui.lineLoop)));
    act.appendChild(btn(ui.lineLoop ? "Build express loop" : "Build express", "ubtn", () => buildLineFromWaypoints(G, "express", ui.lineLoop)));
  }
  act.appendChild(btn("Clear", "ubtn", () => { ui.lineSel = []; renderPanel(G); }));
  if (editing) act.appendChild(btn("Cancel", "ubtn", () => {
    ui.mode = "inspect"; ui.editLineId = -1; ui.lineSel = []; ui.lineLoop = false; setStatus("Edit cancelled."); renderPanel(G);
  }));
  sect.appendChild(act);
  panel.appendChild(sect);
}

function buildLineFromWaypoints(G, type, loop) {
  const st = G.st, p = player(st);
  const r = createLineVia(st, p, G.ui.lineSel.slice(), type, loop);
  if (r.ok) {
    setStatus(r.line.name + " created — " + r.line.stations.length + " stations, " + r.line.path.length +
      " km" + (loop ? " (one-way loop)" : "") + ". Buy trains in the Lines tab.");
    G.ui.lineSel = []; G.ui.lineLoop = false; G.ui.mode = "inspect"; G.ui.tab = "Lines"; G.ui.selectedLine = r.line.id;
  } else setStatus(r.msg);
  renderPanel(G);
}

function stationModal(G, s) {
  const st = G.st, p = player(st);
  const body = el("div");
  const isPureDepot = s.isDepot && !s.depotAsStation;
  if (isPureDepot) {
    body.appendChild(el("div", "", "Rolling-stock depot — stores trains removed from deleted lines for later reassignment. No passenger traffic."));
  } else {
    body.appendChild(el("div", "", "Platforms for " + s.cars + "-car trains · ~" +
      fmtNum(stationPaxDay(s)) + " pax/day" + (s.isDepot ? " (depot+station: reduced commerce)" : "")));
    const conn = linesAtStation(st, s.id);
    body.appendChild(el("div", "dim small", "Lines in/out: " + (conn.length
      ? conn.map(l => lineThroughLabel(st, l, s.id)).join(", ") : "none yet")));
  }
  const nameRow = el("div", "btnrow");
  nameRow.appendChild(el("span", "lbl", "Name: "));
  const snInp = el("input", "uinp");
  snInp.type = "text"; snInp.value = s.name; snInp.maxLength = 40; snInp.style.width = "180px";
  snInp.addEventListener("change", () => {
    const v = snInp.value.trim();
    if (v) { s.name = v; setStatus("Station renamed to “" + v + "”."); }
  });
  nameRow.appendChild(snInp);
  body.appendChild(nameRow);
  // ---- station commerce (ekinaka) ----
  if (!isPureDepot) {
    const curLvl = effectiveCommerce(st, s);
    const curSpec = commerceSpec(curLvl);
    const csec = el("div", "sect");
    csec.appendChild(el("div", "lbl", "STATION COMMERCE"));
    if (s.commerceBuilding > 0) {
      const pend = commerceSpec(s.commercePending);
      csec.appendChild(el("div", "small", "Building: " + (pend ? pend.name : "shops") +
        " — ~" + Math.ceil(s.commerceBuilding) + " days remaining."));
    } else {
      csec.appendChild(el("div", "small", "Current: " + (curSpec ? curSpec.name : "none") +
        (curLvl === 1 ? " (automatic)" : "")));
    }
    if (curSpec) {
      const infl = inflationOf(st, st.time.year);
      csec.appendChild(el("div", "dim small",
        "Earns ~" + (curSpec.incomePerPax * infl).toFixed(2) + " " + curSym() + "/passenger · upkeep " +
        fmtYen(Math.round(curSpec.maintYear * infl)) + "/yr (owed even if quiet)."));
    }
    const nxt = nextCommerceLevel(s);
    if (s.commerceBuilding > 0) {
      csec.appendChild(el("div", "dim small", "Commerce works are under construction here."));
    } else if (nxt) {
      const nspec = commerceSpec(nxt);
      const why = canBuildCommerce(st, p, s, nxt);
      if (why && st.time.year < nspec.from) {
        csec.appendChild(el("div", "dim small", "Next tier — " + nspec.name + " — opens in " + nspec.from + "."));
      } else if (why) {
        csec.appendChild(el("div", "dim small", why));
      } else {
        const cost = commerceBuildCost(st, s, nxt);
        csec.appendChild(btn("Develop: " + nspec.name + " (" + fmtYen(cost) + ", ~" + nspec.buildDays + " days)",
          "ubtn go", () => {
            const r = buildCommerce(st, p, s);
            setStatus(r.ok ? "Commerce works started: " + nspec.name + " (" + fmtYen(r.cost) + ")." : r.msg);
            closeModal(); renderPanel(G); if (r.ok) stationModal(G, s);
          }));
        csec.appendChild(el("div", "dim small",
          "Higher tiers cost more, take longer, and owe heavy fixed upkeep — but a busy hub can earn handsomely. A quiet station will lose money on them."));
      }
    } else {
      csec.appendChild(el("div", "dim small", "Fully developed — this station is an integrated retail city."));
    }
    body.appendChild(csec);
  }

  // ---- station works: platform extension (takes time; the station keeps
  // operating throughout and the upgrade switches on when done)
  if (!isPureDepot) {
    const usec = el("div", "sect");
    usec.appendChild(el("div", "lbl", "STATION WORKS"));
    const reopen = () => { closeModal(); renderPanel(G); stationModal(G, s); };
    // platform
    const cap = maxPlatformCars(st.time.year);
    if (s.platBuilding > 0) {
      usec.appendChild(el("div", "small", "Lengthening → " + s.platPending + "-car platforms — ~" +
        Math.ceil(s.platBuilding) + " days remaining."));
    } else if (s.cars < cap) {
      const pCost = stationPlatformUpgradeCost(st, s, s.cars + 1);
      const pDays = platformUpgradeDays(s.cars, s.cars + 1);
      usec.appendChild(btn("Extend platform → " + (s.cars + 1) + "-car (" + fmtYen(pCost) + ", ~" + pDays + " days)", "ubtn wide", () => {
        const r = extendPlatform(st, p, s.id);
        setStatus(r.ok ? "Platform extension started → " + (s.cars + 1) + "-car (~" + r.days + " days)." : r.msg);
        reopen();
      }));
    } else {
      usec.appendChild(el("div", "dim small", "Platforms at this era's " + cap + "-car cap."));
    }
    // seismic retrofit (taishin) — earthquake campaigns only (Tokyo)
    if (!campaignOf(st).quakes) {
      // no seismic section
    } else if (s.taishinBuilding > 0) {
      usec.appendChild(el("div", "small", "Seismic retrofit under way → " +
        (taishinSpec(s.taishinPending) ? taishinSpec(s.taishinPending).name : "current standard") +
        " — ~" + Math.ceil(s.taishinBuilding) + " days remaining."));
    } else {
      const cur = taishinSpec(s.taishin || 0);
      usec.appendChild(el("div", "dim small", "Seismic standard: " + (cur ? cur.name : "pre-code construction") +
        " · quake resilience " + Math.round(stationResilience(st, s) * 100) + "%" +
        " (era of last works " + (s.renewed || s.builtYear) + (rndResilience(p) > 0 ? ", + structural R&D" : "") + ")."));
      if (!canTaishin(st, p, s)) {
        const q = upgradeStationTaishin(st, p, s.id, true);
        usec.appendChild(btn("Seismic retrofit → " + taishinSpec(q.level).name +
          " (" + fmtYen(q.cost) + ", ~" + q.days + " days)", "ubtn wide", () => {
          const r = upgradeStationTaishin(st, p, s.id);
          setStatus(r.ok ? "Seismic retrofit started at " + s.name + " (~" + r.days + " days)." : r.msg);
          reopen();
        }));
      }
    }
    body.appendChild(usec);
  }
  // ---- demolish this station (the rail on its hex is LEFT in place) ----
  {
    const dsec = el("div", "sect");
    dsec.appendChild(el("div", "lbl", "DEMOLISH " + (s.isDepot ? (s.depotAsStation ? "DEPOT+STATION" : "DEPOT") : "STATION")));
    const job = st.builds.find(b => b.kind === "stationdemo" && b.sid === s.id);
    if (job) {
      dsec.appendChild(el("div", "small", "Demolition under way — ~" + Math.ceil(job.total - job.progress) + " days remaining."));
    } else if (s.building) {
      dsec.appendChild(el("div", "dim small", "Still under construction — can't demolish yet."));
    } else {
      const q = demolishStation(st, p, s.id, true);
      if (q.ok) {
        dsec.appendChild(btn("Demolish (" + fmtYen(q.cost) + ", ~" + q.days + " days)", "ubtn wide warn", () => {
          const lines = linesAtStation(st, s.id).length;
          const go = () => {
            const r = demolishStation(st, p, s.id);
            setStatus(r.ok ? "Demolition of " + s.name + " started (~" + r.days + " days). The rail stays." : r.msg);
            closeModal(); renderPanel(G);
          };
          openModal("Demolish " + s.name + "?", el("div", "",
            "Tear down " + s.name + " for " + fmtYen(q.cost) + " (~" + q.days + " days)? It keeps serving until the work finishes, and the RAIL on the hex is left in place." +
            (lines ? " " + lines + " line(s) call here — they'll drop this stop (a line left with fewer than 2 stations is removed)." : "")),
            [["Demolish", go], ["Keep", null]]);
        }));
        dsec.appendChild(el("div", "dim small", "Removes the station building only — the track on the hex stays. Costs money and time."));
      } else {
        dsec.appendChild(el("div", "dim small", q.msg));
      }
    }
    body.appendChild(dsec);
  }
  openModal((s.isDepot ? (s.depotAsStation ? "Depot+Station: " : "Depot: ") : "Station: ") + s.name, body, [["Close", null]]);
}

/* ---- Debug: in-game time-skip ---- */
/** DEBUG button handler (only visible when debug mode was enabled at the
 *  start screen): lets the player jump the simulation forward to the next
 *  decade mark (or beyond, in 10-year steps, up to just before CFG.END_YEAR).
 *  Every company — including the player's — keeps operating, earning,
 *  building and growing the whole time, exactly as if real time had passed. */
function openDebugSkipModal(G) {
  const st = G.st;
  const lo = Math.ceil((st.time.year + 1) / 10) * 10;
  const hi = Math.floor((CFG.END_YEAR - 1) / 10) * 10;
  const body = el("div");
  if (lo > hi) {
    body.appendChild(el("div", "",
      "No further time-skip milestones remain — Reiwa 10 (" + CFG.END_YEAR + ") is close at hand."));
    openModal("Debug: Skip ahead", body, [["Close", null]]);
    return;
  }
  body.appendChild(el("div", "",
    "Jump the simulation forward to the start of a chosen year. Every company — including yours — " +
    "keeps operating, earning, building and growing the whole time, exactly as if real time had passed."));
  const row = el("div", "airow");
  row.appendChild(el("span", "lbl", "Skip to year:"));
  const sel = el("select", "usel");
  for (let y = lo; y <= hi; y += 10) {
    const o = el("option", "", "" + y);
    o.value = "" + y;
    sel.appendChild(o);
  }
  row.appendChild(sel);
  body.appendChild(row);
  openModal("Debug: Skip ahead", body, [
    ["Cancel", null],
    ["Confirm", () => {
      const target = +sel.value;
      setStatus("Simulating world history to " + target + "… this may take a few seconds.");
      setTimeout(() => {
        fastForwardToYear(st, target);
        st.renderDirty = true;
        renderPanel(G);
        setStatus("Welcome to " + target + ". The world kept moving — including your own railway.");
      }, 30);
    }],
  ]);
}

/* ---- End-game overlay ---- */
/** Per-rank flavor titles, worst to first is reversed below — index 0 is the
 *  champion. Kept short; kanji titles carry romaji per the project's
 *  bilingual-label convention. */
const END_TITLES = [
  "鉄道将軍 (Tetsudo Shogun) — Railway Shogun",
  "鉄道男爵 (Tetsudo Danshaku) — Baron of the Rails",
  "地方運転官 (Chiho Untenkan) — Regional Operator",
  "路線課長 (Sen Kacho) — Line Section Chief",
  "見習い駅長 (Minarai Ekicho) — Apprentice Stationmaster",
];

function showEndScreen(G) {
  const st = G.st;
  const alive = st.companies.filter(c => c.alive);
  const maxCash = Math.max(...alive.map(c => Math.max(1, c.cash)));
  const maxPax = Math.max(...alive.map(c => Math.max(1, c.stats.paxAvg)));
  const ranked = alive.slice().sort((a, b) =>
    (b.cash / maxCash + b.stats.paxAvg / maxPax) - (a.cash / maxCash + a.stats.paxAvg / maxPax));
  const win = ranked[0];
  const meRank = ranked.findIndex(c => c.isPlayer);     // -1 if the player's company didn't survive
  const won = meRank === 0;

  const camp = campaignOf(st);
  const london = camp.key === "london";
  const soldOut = st.endReason === "sellout";
  // COMPLETION: reaching the end year (victory screen) with your company alive
  // counts, at the difficulty of the class you played — this is what feeds the
  // campaign unlock chain (Tokyo → London → New York → Melbourne)
  const reachedEnd = st.time.year >= CFG.END_YEAR && !soldOut && meRank >= 0;
  const lockedBefore = Object.keys(CFG.CAMPAIGNS).filter(k => !campaignUnlocked(k));
  if (reachedEnd) recordCompletion(st.campaign, st.playerClass);
  const justUnlocked = reachedEnd ? lockedBefore.filter(k => campaignUnlocked(k)) : [];

  const body = el("div");
  body.appendChild(el("div", "endBanner" + (won && !soldOut ? " win" : ""),
    soldOut ? "*** SOLD OUT ***" : won ? "*** VICTORY! ***" : "*** GAME OVER ***"));
  body.appendChild(el("div", "endSub", camp.title + " Railway Chronicle, " +
    CFG.START_YEAR + "–" + st.time.year + " (" + (st.time.year - CFG.START_YEAR) + " years of service)"));
  const UNLOCK_BLURBS = {
    london: "Build the Underground and the great termini across Victorian London.",
    nyc: "Elevateds, river crossings and the five boroughs — Gilded-Age New York awaits.",
    melbourne: "Marvellous Melbourne — the bayside arc, the land boom, and the bust to survive.",
  };
  for (const k of justUnlocked) {
    const spec = CFG.CAMPAIGNS[k];
    const u = el("div", "linebox", "🎉 NEW CAMPAIGN UNLOCKED — " + spec.startLabel + ". " +
      (UNLOCK_BLURBS[k] || "") + " Press \"New game…\" below to open the start screen, then Start — " +
      spec.startLabel + ".");
    u.style.borderLeft = "4px solid #2d6a5a";
    body.appendChild(u);
  }
  // if this completion moved toward (but didn't reach) the next unlock, say why
  if (reachedEnd && !justUnlocked.length) {
    const next = Object.keys(CFG.CAMPAIGNS).find(k => !campaignUnlocked(k));
    if (next) {
      body.appendChild(el("div", "dim small", "Next campaign — " + CFG.CAMPAIGNS[next].title +
        ": " + campaignLockHint(next) + "."));
    }
  }
  if (soldOut) {
    body.appendChild(el("div", "small", "Three years of unpaid taxes with the credit line exhausted — " +
      "the " + bankName(st) + " sold your railway out from under you. The trains keep running; you just don't own them anymore."));
  }

  ranked.forEach((co, i) => {
    const box = el("div", "linebox endRow" + (i === 0 ? " endRank1" : "") + (co.isPlayer ? " endYou" : ""));
    const head = el("div", "lhead", (i === 0 ? "★ " : "") + (i + 1) + ". " + co.name + (co.isPlayer ? "  ← YOU" : ""));
    head.style.borderLeft = "4px solid " + co.color;
    box.appendChild(head);
    box.appendChild(el("div", "small", END_TITLES[Math.min(i, END_TITLES.length - 1)]));
    box.appendChild(el("div", "small", "Cash " + fmtYen(co.cash) + " · value " + fmtYen(companyValue(st, co)) +
      " · " + fmtNum(co.stats.paxAvg) + " pax/day"));
    box.appendChild(el("div", "dim small", "Track " + companyTrackHexes(st, co).length + " hexes · " +
      st.stations.filter(s => s.co === co.id && s.alive).length + " stations · " +
      st.lines.filter(l => l.co === co.id && l.alive).length + " lines · " +
      st.trains.filter(t => t.co === co.id && t.alive).length + " trains · est. " + co.founded));
    body.appendChild(box);
  });

  if (meRank < 0) {
    body.appendChild(el("div", "small dim", "Your railway didn't survive to see the new era — but its tracks live on in the city's story."));
  }
  body.appendChild(el("div", "endThanks", camp.key !== "tokyo" ? "Thank you for playing!"
    : "お疲れ様でした (Otsukaresama deshita) — thanks for playing!"));

  let title;
  if (soldOut) title = "SOLD OUT — the bank forecloses on your railway.";
  else if (won) title = "VICTORY — your railway defined " + camp.title + "!";
  else if (meRank > 0) title = win.name + " wins the century — you finished #" + (meRank + 1) + " of " + ranked.length + ".";
  else title = win.name + " wins the century.";

  // "New game…" reopens the start screen with the full setup (class, rivals,
  // difficulty — and the London campaign, which unlockLondon() above has
  // already made selectable there when it was earned this run)
  const buttons = [["Keep watching", null],
    ["New game…", () => reopenStartScreen(G)]];
  openModal(title, body, buttons);
}

/* ---- Start screen ---- */
/** Re-open the start screen while a game is running (the in-game "New game"
 *  buttons): the player gets the full setup — class, rivals, difficulty,
 *  campaign — and can back out to the running game untouched. Nothing is
 *  lost until Start is actually pressed. */
function reopenStartScreen(G) {
  buildStartScreen(G, false, true);
  document.getElementById("startScreen").classList.remove("hidden");
}

/** Populate the pre-game overlay: continue a save (if any), or configure and
 *  start a new game (number of computer rivals + a difficulty for each).
 *  `resumable` = opened from within a running game (adds a Back button). */
function buildStartScreen(G, savedExists, resumable) {
  G._savedExists = savedExists;          // remembered so a language switch can rebuild
  G._startResumable = !!resumable;
  const root = document.getElementById("startBox");
  root.textContent = "";
  queueSfx(G.st, "start_screen");        // title jingle (plays once audio unlocks)
  root.appendChild(el("div", "modalTitle", t("start.title")));
  root.appendChild(el("div", "dim small", t("start.subtitle")));

  // opened mid-game: offer the way back before anything else, and warn that
  // pressing Start abandons the current run (the yearly autosave will begin
  // overwriting it once the new game gets going)
  if (resumable) {
    const backRow = el("div", "btnrow");
    backRow.appendChild(btn("⬅ Back to current game", "ubtn wide", () => {
      queueSfx(G.st, "start_screen_button");
      document.getElementById("startScreen").classList.add("hidden");
    }));
    root.appendChild(backRow);
    root.appendChild(el("div", "dim small",
      "Starting a new game replaces the current one — Save or Export it first if you want to keep it."));
  }

  // language toggle (persisted in localStorage; re-labels the whole shell)
  const langRow = el("div", "airow");
  langRow.appendChild(el("span", "lbl", t("lang.toggle") + ":"));
  for (const l of languages()) {
    const b = btn(I18N[l]["lang.name"], "ubtn" + (getLang() === l ? " active" : ""),
      () => applyLang(G, l));
    langRow.appendChild(b);
  }
  root.appendChild(langRow);

  // game speed (applies whether continuing a save or starting fresh)
  const speedRow = el("div", "airow");
  speedRow.appendChild(el("span", "lbl", t("start.speed")));
  const speedSel = el("select", "usel");
  for (const sp of CFG.SPEEDS) {
    const o = el("option", "", sp.name);
    o.value = sp.key;
    if (sp.key === CFG.DEFAULT_SPEED) o.selected = true;
    speedSel.appendChild(o);
  }
  speedRow.appendChild(speedSel);
  root.appendChild(speedRow);
  const applySpeed = () => {
    const sp = CFG.SPEEDS.find(s => s.key === speedSel.value) || CFG.SPEEDS[0];
    G.ui.speedMult = sp.mult;
  };

  // debug mode: adds a DEBUG button next to PAUSE that lets you jump the
  // simulation forward in 10-year steps mid-game (applies whether
  // continuing a save or starting fresh).
  const debugLbl = el("label", "lbl");
  const debugCb = el("input"); debugCb.type = "checkbox";
  debugLbl.appendChild(debugCb);
  debugLbl.appendChild(document.createTextNode(" Debug mode: enable in-game time-skip button"));
  const debugRow = el("div", "airow");
  debugRow.appendChild(debugLbl);
  root.appendChild(debugRow);
  const applyDebugMode = () => {
    G.ui.debugMode = debugCb.checked;
    document.getElementById("debugBtn").style.display = debugCb.checked ? "" : "none";
  };

  // Load a save file from disk — independent of the local-storage autosave
  // above; this is how you open a .json file exported from this game
  // (downloaded earlier, or shared by someone else).
  const loadInp = el("input"); loadInp.type = "file"; loadInp.accept = ".json,application/json"; loadInp.style.display = "none";
  const loadMsg = el("div", "dim small");
  loadInp.addEventListener("change", () => {
    const f = loadInp.files[0]; if (!f) return;
    f.text().then(txt => {
      try {
        const loaded = importSaveString(txt);
        applySpeed();
        applyDebugMode();
        G.st = loaded;
        G.st.renderDirty = true;
        document.getElementById("startScreen").classList.add("hidden");
        setStatus("Loaded " + f.name + ".");
        renderPanel(G);
      } catch (e) { loadMsg.textContent = "Load failed: " + e.message; }
    });
  });

  if (savedExists) {
    root.appendChild(el("div", "lbl block", t("start.saved")));
    const row = el("div", "btnrow");
    row.appendChild(btn(t("start.continue"), "ubtn go wide", () => {
      applySpeed();
      applyDebugMode();
      queueSfx(G.st, "start_screen_button");
      document.getElementById("startScreen").classList.add("hidden");
    }));
    root.appendChild(row);
  }
  const loadRow = el("div", "btnrow");
  loadRow.appendChild(loadInp);
  const loadBtn = btn(t("start.loadfile"), "ubtn wide", () => loadInp.click());
  loadBtn.title = "Open a .json save file exported from this game.";
  loadRow.appendChild(loadBtn);
  root.appendChild(loadRow);
  root.appendChild(loadMsg);
  root.appendChild(el("hr"));
  root.appendChild(el("div", "lbl block", "…or configure and start a new game:"));

  // ---- Player class (v0.5): social standing sets funds, credit terms & land grants ----
  root.appendChild(el("div", "lbl block", "Your family's standing:"));
  const classBox = el("div", "sect");
  const classRadios = [];
  for (const key of Object.keys(CFG.PLAYER_CLASSES)) {
    const cls = CFG.PLAYER_CLASSES[key];
    const row = el("label", "airow");
    const rb = el("input"); rb.type = "radio"; rb.name = "playerClass"; rb.value = key;
    if (key === CFG.DEFAULT_PLAYER_CLASS) rb.checked = true;
    row.appendChild(rb);
    row.appendChild(el("span", "lbl", " " + cls.name + " — " + cls.difficulty +
      " · " + fmtYen(cls.startCash) +
      (cls.grants.length ? " · " + cls.grants.length + " land grant" + (cls.grants.length === 1 ? "" : "s") : "")));
    classBox.appendChild(row);
    classRadios.push(rb);
  }
  root.appendChild(classBox);

  const countRow = el("div", "airow");
  countRow.appendChild(el("span", "lbl", "Computer-controlled rivals:"));
  const countSel = el("select", "usel");
  for (let i = 0; i <= CFG.AI_COUNT; i++) {
    const o = el("option", "", i === 0 ? "0 (none)" : "" + i);
    o.value = "" + i;
    if (i === CFG.AI_COUNT) o.selected = true;
    countSel.appendChild(o);
  }
  countRow.appendChild(countSel);
  root.appendChild(countRow);

  const diffRows = el("div", "sect");
  root.appendChild(diffRows);
  let diffSelects = [];
  function rebuildDiffRows() {
    diffRows.textContent = "";
    diffSelects = [];
    const n = clamp(+countSel.value || 0, 0, CFG.AI_COUNT);
    for (let i = 0; i < n; i++) {
      const row = el("div", "airow");
      row.appendChild(el("span", "lbl", "Rival " + (i + 1) + ":"));   // names are per-campaign, assigned at Start
      const dsel = el("select", "usel");
      for (const key of Object.keys(CFG.AI.DIFFICULTIES)) {
        const o = el("option", "", CFG.AI.DIFFICULTIES[key].name);
        o.value = key;
        if (key === CFG.AI.DEFAULT_DIFFICULTY) o.selected = true;
        dsel.appendChild(o);
      }
      row.appendChild(dsel);
      diffRows.appendChild(row);
      diffSelects.push(dsel);
    }
  }
  countSel.addEventListener("change", rebuildDiffRows);
  rebuildDiffRows();

  const startNewGame = (campaign) => {
    applySpeed();
    applyDebugMode();
    const aiCount = clamp(+countSel.value || 0, 0, CFG.AI_COUNT);
    const aiDifficulties = diffSelects.map(s => s.value);
    const playerClass = (classRadios.find(r => r.checked) || {}).value || CFG.DEFAULT_PLAYER_CLASS;
    const seed = (Math.random() * 1e9) | 0;
    G.st = newGame(seed, { aiCount, aiDifficulties, playerClass, campaign });
    G.st.renderDirty = true;
    queueSfx(G.st, "start_screen_button");
    document.getElementById("startScreen").classList.add("hidden");
    setStatus(t("start.welcome", 1872));
    renderPanel(G);
  };
  // Unlocked campaigns become selectable (Tokyo → London → New York →
  // Melbourne); the first still-locked one shows what it takes to earn it.
  let lockHintShown = false;
  for (const key of Object.keys(CFG.CAMPAIGNS)) {
    if (key === "tokyo") continue;                       // Tokyo is the main Start button below
    const spec = CFG.CAMPAIGNS[key];
    if (campaignUnlocked(key)) {
      const cityRow = el("div", "btnrow");
      cityRow.appendChild(btn("Start — " + spec.startLabel, "ubtn wide", () => startNewGame(key)));
      root.appendChild(cityRow);
    } else if (!lockHintShown) {
      lockHintShown = true;
      root.appendChild(el("div", "dim small",
        "🔒 " + spec.title + " — locked. To unlock: " + campaignLockHint(key) + "."));
    }
  }

  const startRow = el("div", "btnrow");
  startRow.appendChild(btn(t("start.newgame"), "ubtn go wide", () => startNewGame("tokyo")));
  root.appendChild(startRow);
}
