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

function player(st) { return st.companies.find(c => c.isPlayer); }

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

/* =========================================================================
 * Panels
 * ========================================================================= */
const TABS = ["Build", "Lines", "Finance", "Companies", "Log", "System"];

function initUI(G) {
  const ui = G.ui;
  const tabs = document.getElementById("tabs");
  for (const t of TABS) {
    tabs.appendChild(btn(t, "tab", () => { ui.tab = t; renderPanel(G); }));
  }
  ui.tab = "Build";
  renderPanel(G);
  initCanvasInput(G);
  document.getElementById("pauseBtn").addEventListener("click", () => {
    ui.paused = !ui.paused;
    document.getElementById("pauseBtn").textContent = ui.paused ? "RESUME" : "PAUSE";
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
  const dow = t.totalDays % 7;
  const dayName = dow === 5 ? "Sat" : dow === 6 ? "Sun" : "Weekday";
  document.getElementById("clock").textContent =
    eraYearLabel(t.year) + " (" + t.year + ") · " + seasonOf(t.day) + " · Day " + (t.day + 1) +
    " · " + dayName + (dow >= 5 ? " (holiday)" : "") + " · " + phase.name;
  document.getElementById("cash").textContent = p ? fmtYen(p.cash) : "";
  document.getElementById("pax").textContent = p ? fmtNum(p.stats.pax) + " pax/day" : "";
}

function renderPanel(G) {
  const ui = G.ui, panel = document.getElementById("panel");
  for (const b of document.querySelectorAll("#tabs .tab")) b.classList.toggle("active", b.textContent === ui.tab);
  panel.textContent = "";
  ({ Build: buildPanel, Lines: linesPanel, Finance: financePanel,
     Companies: companiesPanel, Log: logPanel, System: systemPanel }[ui.tab])(G, panel);
}

/* ---- Build ---- */
function buildPanel(G, panel) {
  const st = G.st, ui = G.ui, p = player(st);
  panel.appendChild(el("div", "ptitle", "CONSTRUCTION"));
  const modes = [["inspect", "Inspect"], ["buyland", "Buy Land"], ["track", "Lay Track"], ["station", "Build Station"], ["line", "Create Line"]];
  const mrow = el("div", "btnrow");
  for (const [m, label] of modes) {
    const b = btn(label, "ubtn mode" + (ui.mode === m ? " active" : ""), () => {
      ui.mode = m; ui.trackStart = -1; ui.lineSel = [];
      setStatus(({ inspect: "Click hexes to inspect. Drag to pan, wheel to zoom.",
        buyland: "Click an unowned hex to buy it.",
        track: "Click a START hex, then an END hex — a route will be suggested for approval.",
        station: "Click a hex with your track on owned land.",
        line: "Click two of your stations connected by track." })[m]);
      renderPanel(G);
    });
    mrow.appendChild(b);
  }
  panel.appendChild(mrow);

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
  if (st.time.year >= CFG.UNLOCK.electrification) {
    const lab = el("label", "lbl");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = p.elecDefault;
    cb.addEventListener("change", () => { p.elecDefault = cb.checked; });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(" Electrified (+50% cost)"));
    sect.appendChild(lab);
  } else sect.appendChild(el("div", "dim", "Electrification unlocks in " + CFG.UNLOCK.electrification + "."));
  panel.appendChild(sect);

  // pending plan approval
  if (ui.plan && ui.plan.path) {
    const box = el("div", "planbox");
    box.appendChild(el("div", "lbl", "ROUTE PROPOSAL"));
    box.appendChild(el("div", "", ui.plan.newHexes + " km of new track" + (ui.plan.elec ? " (electrified)" : "")));
    box.appendChild(el("div", "", "Construction: " + fmtYen(ui.plan.cost)));
    box.appendChild(el("div", "", "Land purchase: " + fmtYen(ui.plan.landCost)));
    box.appendChild(el("div", "", "Build time: ~" + ui.plan.days + " days"));
    const row = el("div", "btnrow");
    row.appendChild(btn("APPROVE", "ubtn go", () => {
      const r = approveTrack(st, p, ui.plan);
      setStatus(r.ok ? "Construction started." : r.msg);
      ui.plan = null; ui.trackStart = -1; renderPanel(G);
    }));
    row.appendChild(btn("Cancel", "ubtn", () => { ui.plan = null; ui.trackStart = -1; renderPanel(G); }));
    box.appendChild(row);
    panel.appendChild(box);
  }

  // construction queue
  const jobs = st.builds.filter(b => b.co === p.id);
  if (jobs.length) {
    panel.appendChild(el("div", "lbl", "UNDER CONSTRUCTION"));
    for (const j of jobs) {
      panel.appendChild(el("div", "dim", "Track: " + j.done + "/" + j.hexes.length + " km laid"));
    }
  }
  panel.appendChild(el("div", "dim small",
    "Era: " + eraOf(st.time.year).name + " · Build speed: " +
    CFG.TRACK.daysPerHexByEra[eraOf(st.time.year).key] + " days/km · Platform cap: " +
    maxPlatformCars(st.time.year) + " cars"));
}

/* ---- Lines ---- */
function linesPanel(G, panel) {
  const st = G.st, p = player(st);
  panel.appendChild(el("div", "ptitle", "LINES & TRAINS"));
  const lines = st.lines.filter(l => l.alive && l.co === p.id);
  if (!lines.length) panel.appendChild(el("div", "dim", "No lines yet. Build track and stations, then use Create Line."));
  for (const line of lines) {
    const box = el("div", "linebox");
    const head = el("div", "lhead", line.name + " (" + line.type + ")");
    head.style.borderLeft = "4px solid " + p.color;
    box.appendChild(head);
    box.appendChild(el("div", "dim small", line.path.length + " km · " + line.stations.length + " stations · " +
      (line.elec ? "electrified" : "non-electrified") + " · " + line.gaugeMm + "mm"));
    const load = line.capacity > 0 ? line.demand / line.capacity : 0;
    box.appendChild(el("div", "small",
      "Demand " + fmtNum(line.demand) + " / cap " + fmtNum(line.capacity) +
      (load > 1 ? " — OVERCROWDED (riders frustrated)" : "") +
      " · desirability " + Math.round(line.desirability * 100) + "%"));
    // fare control
    const frow = el("div", "btnrow");
    frow.appendChild(el("span", "lbl", "Fare ¥/km: "));
    const finp = el("input", "uinp");
    finp.type = "number"; finp.min = "0"; finp.step = "0.1"; finp.value = line.fare;
    finp.addEventListener("change", () => {
      line.fare = clamp(+finp.value || 0, 0, 1e6); st.od.dirty = true;
      setStatus("Fare set. Riders will respond to price vs alternatives.");
    });
    frow.appendChild(finp);
    box.appendChild(frow);
    const brow = el("div", "btnrow");
    brow.appendChild(btn("Buy Train (" + line.trains.length + ")", "ubtn", () => trainModal(G, line)));
    brow.appendChild(btn("Stops", "ubtn", () => stopsModal(G, line)));
    brow.appendChild(btn("Delete", "ubtn warn", () => {
      openModal("Delete " + line.name + "?", el("div", "", "Trains on it are scrapped (no refund)."), [
        ["Delete", () => { removeLine(st, p, line.id); renderPanel(G); }], ["Keep", null]]);
    }));
    box.appendChild(brow);
    panel.appendChild(box);
  }
  panel.appendChild(el("div", "dim small",
    "Tip: duplicate a corridor with an express service (Create Line, type express) and tune its stops."));
}

function trainModal(G, line) {
  const st = G.st, p = player(st);
  const body = el("div");
  const types = trainTypesFor(st, p, line);
  if (!types.length) body.appendChild(el("div", "", "No compatible train types (check electrification/gauge/era)."));
  const buttons = [["Close", null]];
  for (const ty of types) {
    const t = CFG.TRAINS[ty];
    const cost = Math.round(t.cost * inflationOf(st.time.year));
    body.appendChild(btn(t.name + " — " + t.speed + " km/h, " + t.cap + " pax/car — " + fmtYen(cost), "ubtn wide", () => {
      const r = buyTrain(st, p, line.id, ty);
      setStatus(r.ok ? "Train added to " + line.name + "." : r.msg);
      closeModal(); renderPanel(G);
    }));
  }
  body.appendChild(el("div", "dim small", "Cars per train are capped by the shortest platform among the line's stops."));
  openModal("Buy train — " + line.name, body, buttons);
}

function stopsModal(G, line) {
  const st = G.st;
  const body = el("div");
  body.appendChild(el("div", "dim small", "Set the stopping pattern (termini always served best as stops)."));
  for (const sid of line.stations) {
    const s = st.stations[sid];
    const lab = el("label", "lbl block");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !!line.stops[sid];
    cb.addEventListener("change", () => {
      line.stops[sid] = cb.checked; st.od.dirty = true; refreshTrainCars(st);
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" " + s.name + " (L" + s.level + ", " + s.cars + "-car)"));
    body.appendChild(lab);
  }
  openModal("Stops — " + line.name, body, [["Done", null]]);
}

/* ---- Finance ---- */
function financePanel(G, panel) {
  const st = G.st, p = player(st);
  panel.appendChild(el("div", "ptitle", "FINANCIAL REPORT"));
  const rows = [
    ["Cash", fmtYen(p.cash)],
    ["Revenue (today)", fmtYen(p.stats.revToday)],
    ["Costs (today)", fmtYen(p.stats.costToday)],
    ["Revenue (year to date)", fmtYen(p.stats.revYear)],
    ["Costs (year to date)", fmtYen(p.stats.costYear)],
    ["Daily passengers", fmtNum(p.stats.pax) + " (avg " + fmtNum(p.stats.paxAvg) + ")"],
    ["Land owned", p.land.length + " hexes"],
    ["Track", companyTrackHexes(st, p).length + " km"],
    ["Stations", st.stations.filter(s => s.co === p.id && s.alive).length + ""],
    ["Company value", fmtYen(companyValue(st, p))],
    ["Price level (era)", "×" + inflationOf(st.time.year).toFixed(1)],
  ];
  const table = el("table", "ftable");
  for (const [k, v] of rows) {
    const tr = el("tr"); tr.appendChild(el("td", "", k)); tr.appendChild(el("td", "num", v));
    table.appendChild(tr);
  }
  panel.appendChild(table);
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
      row.appendChild(btn("Buy out (" + fmtYen(price) + ")", "ubtn warn", () => {
        openModal("Acquire " + co.name + "?", el("div", "", "All their land, track, stations, lines and trains become yours for " + fmtYen(price) + "."), [
          ["Acquire", () => {
            const r = buyOutCompany(st, p, co);
            setStatus(r.ok ? "You acquired " + co.name + "!" : r.msg);
            if (r.ok) logEvent(st, p.name + " acquired " + co.name + " for " + fmtYen(r.price) + ".");
            renderPanel(G);
          }], ["Cancel", null]]);
      }));
      box.appendChild(row);
    }
    panel.appendChild(box);
  });
  panel.appendChild(el("div", "dim small", "Victory in " + CFG.END_YEAR + ": highest combined cash + average daily passengers."));
}

/* ---- Log ---- */
function logPanel(G, panel) {
  const st = G.st;
  st.events.unread = 0;
  panel.appendChild(el("div", "ptitle", "EVENT LOG"));
  const list = st.events.log.slice(-60).reverse();
  for (const e of list) {
    const d = el("div", "logline " + e.kind);
    d.appendChild(el("span", "dim", eraYearLabel(e.year) + ": "));
    d.appendChild(document.createTextNode(e.text));
    panel.appendChild(d);
  }
  if (!list.length) panel.appendChild(el("div", "dim", "Nothing yet."));
}

/* ---- System ---- */
function systemPanel(G, panel) {
  const st = G.st, ui = G.ui;
  panel.appendChild(el("div", "ptitle", "SYSTEM"));
  const row1 = el("div", "btnrow");
  row1.appendChild(btn("Save", "ubtn", () => setStatus(saveToLocal(st) ? "Saved." : "Save failed (storage full?)")));
  row1.appendChild(btn("Load", "ubtn", () => {
    try {
      const s2 = loadFromLocal();
      if (s2) { G.st = s2; G.st.renderDirty = true; setStatus("Loaded."); renderPanel(G); }
      else setStatus("No save found.");
    } catch (e) { setStatus("Load failed: " + e.message); }
  }));
  panel.appendChild(row1);
  const row2 = el("div", "btnrow");
  row2.appendChild(btn("Export file", "ubtn", () => {
    const blob = new Blob([exportSaveString(st)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tokyo-railroad-" + st.time.year + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  }));
  const imp = el("input"); imp.type = "file"; imp.accept = ".json,application/json"; imp.style.display = "none";
  imp.addEventListener("change", () => {
    const f = imp.files[0]; if (!f) return;
    f.text().then(txt => {
      try { G.st = importSaveString(txt); G.st.renderDirty = true; setStatus("Imported."); renderPanel(G); }
      catch (e) { setStatus("Import rejected: " + e.message); }
    });
  });
  row2.appendChild(imp);
  row2.appendChild(btn("Import file", "ubtn", () => imp.click()));
  panel.appendChild(row2);
  const row3 = el("div", "btnrow");
  row3.appendChild(btn("New game", "ubtn warn", () => {
    openModal("Start over?", el("div", "", "Current progress is lost unless saved/exported."), [
      ["New game", () => { G.st = newGame((Math.random() * 1e9) | 0); G.st.renderDirty = true; renderPanel(G); }],
      ["Cancel", null]]);
  }));
  panel.appendChild(row3);
  const lab = el("label", "lbl block");
  const cb = el("input"); cb.type = "checkbox"; cb.checked = ui.showOwners;
  cb.addEventListener("change", () => { ui.showOwners = cb.checked; });
  lab.appendChild(cb); lab.appendChild(document.createTextNode(" Show land ownership overlay"));
  panel.appendChild(lab);
  panel.appendChild(el("div", "dim small", "Autosaves every year to localStorage. Seed: " + st.seed));
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
    if (dragging && !dragMoved && e.target === canvas) handleClick(G, e);
    dragging = false;
  });
  canvas.addEventListener("mousemove", e => {
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
    const z = G.renderer.cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89);
    G.renderer.cam.zoom = clamp(z, 0.4, 5);
  }, { passive: false });
}

function hexInfo(st, idx) {
  const h = st.hexes[idx];
  let s = (h.name ? h.name + " " : "") + "#" + h.spiral + " · " + h.terrain;
  if (h.cons) s += " · " + h.cons + " (dev " + h.dev + ")";
  if (h.track) s += " · track: " + (st.companies[h.track.co] ? st.companies[h.track.co].name : "?") +
    " " + h.track.gauge + (h.track.elec ? "⚡" : "") + (h.track.dmg ? " [DAMAGED " + h.track.dmg + "d]" : "");
  for (const sid of h.stations) {
    const sta = st.stations[sid];
    if (sta.alive) s += " · STATION " + sta.name + " (L" + sta.level + ", " + sta.cars + "-car" + (sta.building ? ", building" : "") + ")";
  }
  s += " · owner: " + (h.owner === -1 ? "none — price " + fmtYen(landPrice(st, idx)) :
    (st.companies[h.owner] ? st.companies[h.owner].name : "?"));
  return s;
}

function handleClick(G, e) {
  const st = G.st, ui = G.ui, p = player(st);
  const rect = document.getElementById("map").getBoundingClientRect();
  const idx = G.renderer.pickHex(e.clientX - rect.left, e.clientY - rect.top);
  if (idx < 0) return;
  const h = st.hexes[idx];

  if (ui.mode === "buyland") {
    const r = buyLand(st, p, idx);
    setStatus(r.ok ? "Bought hex #" + h.spiral + " for " + fmtYen(r.price) + "." : r.msg);
  } else if (ui.mode === "track") {
    if (ui.trackStart < 0) { ui.trackStart = idx; setStatus("Start set at #" + h.spiral + ". Now click the end hex."); }
    else {
      const plan = planTrack(st, p, ui.trackStart, idx);
      if (plan.err) { setStatus(plan.err); ui.trackStart = -1; }
      else {
        ui.plan = plan;
        setStatus("Route proposed: " + plan.newHexes + " km, " + fmtYen(plan.cost + plan.landCost) + ". Approve in the Build panel.");
        ui.tab = "Build"; renderPanel(G);
      }
    }
  } else if (ui.mode === "station") {
    const r = buildStation(st, p, idx);
    setStatus(r.ok ? "Station under construction (" + CFG.STATION.buildDays + " days)." : r.msg);
  } else if (ui.mode === "line") {
    const sid = h.stations.find(id => st.stations[id].co === p.id && st.stations[id].alive && !st.stations[id].building);
    if (sid === undefined) { setStatus("That's not one of your operating stations."); return; }
    if (!ui.lineSel.includes(sid)) ui.lineSel.push(sid);
    if (ui.lineSel.length === 2) {
      const [a, b] = ui.lineSel; ui.lineSel = [];
      const body = el("div", "", "Service type for the new line:");
      openModal("Create line", body, [
        ["Local (all stops)", () => finishLine(G, a, b, "local")],
        ["Express (major stops)", () => finishLine(G, a, b, "express")],
        ["Cancel", null]]);
    } else setStatus("First station selected. Click the second.");
  } else { // inspect
    setStatus(hexInfo(st, idx));
    const own = h.stations.map(id => st.stations[id]).find(s => s && s.co === p.id && s.alive);
    if (own) stationModal(G, own);
  }
}

function finishLine(G, a, b, type) {
  const st = G.st, p = player(st);
  const r = createLine(st, p, a, b, type);
  if (r.ok) {
    setStatus(r.line.name + " created with " + r.line.stations.length + " stations. Buy trains in the Lines tab!");
    G.ui.tab = "Lines";
  } else setStatus(r.msg);
  renderPanel(G);
}

function stationModal(G, s) {
  const st = G.st, p = player(st);
  const body = el("div");
  body.appendChild(el("div", "", "Level " + s.level + " · platforms for " + s.cars + "-car trains · ~" +
    fmtNum(s.board || 0) + " boardings/day"));
  const upCost = s.level < CFG.STATION.maxLevel
    ? Math.round(stationCost(st, s.hex) * CFG.STATION.upgradeCostMult * s.level *
        (1 + Math.min(1.5, Math.max(0, st.time.year - s.builtYear) / 40)))
    : 0;
  openModal("Station: " + s.name, body, [
    ...(s.level < CFG.STATION.maxLevel ? [["Expand station (" + fmtYen(upCost) + ")", () => {
      const r = upgradeStation(st, p, s.id); setStatus(r.ok ? "Station expanded." : r.msg);
    }]] : []),
    ["Extend platform (+1 car)", () => {
      const r = extendPlatform(st, p, s.id);
      if (r.ok) refreshTrainCars(st);
      setStatus(r.ok ? "Platform extended to " + s.cars + " cars (" + fmtYen(r.cost) + ")." : r.msg);
    }],
    ["Close", null]]);
}

/* ---- End-game overlay ---- */
function showEndScreen(G) {
  const st = G.st;
  const alive = st.companies.filter(c => c.alive);
  const maxCash = Math.max(...alive.map(c => Math.max(1, c.cash)));
  const maxPax = Math.max(...alive.map(c => Math.max(1, c.stats.paxAvg)));
  const ranked = alive.slice().sort((a, b) =>
    (b.cash / maxCash + b.stats.paxAvg / maxPax) - (a.cash / maxCash + a.stats.paxAvg / maxPax));
  const body = el("div");
  body.appendChild(el("div", "", "Reiwa 10 has arrived. Final standings (cash + daily ridership):"));
  ranked.forEach((co, i) => {
    body.appendChild(el("div", i === 0 ? "lhead" : "", (i + 1) + ". " + co.name +
      " — " + fmtYen(co.cash) + ", " + fmtNum(co.stats.paxAvg) + " pax/day" +
      (co.isPlayer ? "  ← you" : "")));
  });
  const win = ranked[0];
  openModal(win.isPlayer ? "VICTORY — your railway defined Tokyo!" : win.name + " wins the century.", body,
    [["Keep watching", null], ["New game", () => { G.st = newGame((Math.random() * 1e9) | 0); G.st.renderDirty = true; }]]);
}
