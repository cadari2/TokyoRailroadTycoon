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
  // the year is simulated as one week: 5 work days then Saturday & Sunday
  const dayName = t.day < 5 ? "Workday " + (t.day + 1) + "/5" : t.day === 5 ? "Saturday (holiday)" : "Sunday (holiday)";
  document.getElementById("clock").textContent =
    eraYearLabel(t.year) + " (" + t.year + ") · " + seasonOf((t.day + t.frac) / 7) +
    " · " + dayName + " · " + phase.name;
  document.getElementById("cash").textContent = p ? fmtYen(p.cash) : "";
  document.getElementById("pax").textContent = p ? fmtNum(p.stats.pax) + " pax/day" : "";
}

function renderPanel(G) {
  const ui = G.ui, panel = document.getElementById("panel");
  for (const b of document.querySelectorAll("#tabs .tab")) b.classList.toggle("active", b.textContent === ui.tab);
  panel.textContent = "";
  if (ui.selected >= 0 && ui.selected < G.st.hexes.length) selectionBox(G, panel);
  ({ Build: buildPanel, Lines: linesPanel, Finance: financePanel,
     Companies: companiesPanel, Log: logPanel, System: systemPanel }[ui.tab])(G, panel);
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
  add("Terrain", h.terrain + (CFG.TERRAIN[h.terrain].needsTunnel ? " (tunnel required)" : CFG.TERRAIN[h.terrain].bridge ? " (bridge required)" : ""));
  if (h.cons) add("Construction", h.cons + " (development " + h.dev + "/5)");
  add("Residents", fmtNum(hexPop(h)));
  add("Commerce population", fmtNum(hexAtt(h)) + " (workers, shoppers, visitors drawn here daily)");
  const owner = h.owner === -1 ? null : st.companies[h.owner];
  add("Owner", owner ? owner.name + (owner.isPlayer ? " (you)" : "") : "unowned");
  if (h.owner === -1) add("Purchase price", fmtYen(landPrice(st, idx)));
  else add("Assessed value", fmtYen(h.value || landPrice(st, idx)));
  if (owner && !owner.isPlayer) {
    const ask = landOfferPrice(st, p, idx);
    add("Asking price", ask === null ? "not for sale (infrastructure/plans on it)" : fmtYen(ask));
  }
  if (h.track) {
    const tco = st.companies[h.track.co];
    add("Track", (tco ? tco.name : "?") + " · " + CFG.GAUGES[h.track.gauge].name +
      (h.track.elec ? " · electrified" : "") + (h.track.tunnel ? " · tunnel" : "") +
      (h.track.dmg ? " · DAMAGED (" + Math.ceil(h.track.dmg) + " days to repair)" : ""));
  }
  for (const sid of h.stations) {
    const s = st.stations[sid];
    if (!s.alive) continue;
    const sco = st.companies[s.co];
    const kind = s.isDepot ? (s.depotAsStation ? "Depot+Station" : "Depot") : "Station";
    const traffic = s.building ? "under construction" :
      (s.isDepot && !s.depotAsStation) ? "yard only — no passenger traffic" :
      "~" + fmtNum(s.board || 0) + " boardings/day";
    add(kind, s.name + " (" + (sco ? sco.name : "?") + ", L" + s.level + ", " + s.cars + "-car, " + traffic + ")");
  }
  const row = el("div", "btnrow");
  if (h.owner === -1 || (owner && !owner.isPlayer)) {
    row.appendChild(btn(h.owner === -1 ? "Buy land…" : "Offer to buy…", "ubtn go", () => confirmBuyLand(G, idx)));
  }
  const ownSta = h.stations.map(id => st.stations[id]).find(s => s && s.co === p.id && s.alive);
  if (ownSta) row.appendChild(btn("Manage station", "ubtn", () => stationModal(G, ownSta)));
  row.appendChild(btn("Deselect", "ubtn", () => { ui.selected = -1; renderPanel(G); }));
  box.appendChild(row);
  panel.appendChild(box);
}

/** Confirmation dialog for buying a parcel (unowned or from another company). */
function confirmBuyLand(G, idx) {
  const st = G.st, p = player(st), h = st.hexes[idx];
  const label = (h.name ? h.name + " " : "") + "hex #" + h.spiral;
  if (h.owner === p.id) { setStatus("You already own this parcel."); return; }
  if (h.owner === -1) {
    const price = landPrice(st, idx);
    openModal("Buy land", el("div", "", "Buy " + label + " (" + h.terrain + ") for " + fmtYen(price) + "?"), [
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
  const modes = [["inspect", "Inspect"], ["buyland", "Buy Land"], ["track", "Lay Track"], ["station", "Build Station"], ["depot", "Build Depot"], ["line", "Create Line"]];
  const mrow = el("div", "btnrow");
  for (const [m, label] of modes) {
    const b = btn(label, "ubtn mode" + (ui.mode === m ? " active" : ""), () => {
      ui.mode = m; ui.lineSel = [];
      setStatus(({ inspect: "Click a hex to select & inspect it. Drag to pan, wheel to zoom.",
        buyland: "Click a hex to buy it (a confirmation with the price will appear).",
        track: "Click a hex to lay 1 km of track there (cost & time shown for confirmation).",
        station: "Click a hex with your track on owned land (confirmation will appear).",
        depot: "Click a hex with your track on owned land to build a rolling-stock depot (stores trains from deleted lines).",
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

  // construction queue
  const jobs = st.builds.filter(b => b.co === p.id);
  const buildingStations = st.stations.filter(s => s.co === p.id && s.alive && s.building);
  if (jobs.length || buildingStations.length) {
    panel.appendChild(el("div", "lbl", "UNDER CONSTRUCTION" + (jobs.length ? " (" + jobs.length + " km)" : "")));
    for (const j of jobs.slice(0, 8)) {
      const left = Math.max(0, j.daysPerHex * j.hexes.length - j.progress);
      panel.appendChild(el("div", "dim small", "Track hex #" + st.hexes[j.hexes[j.done] ?? j.hexes[0]].spiral +
        " — ~" + Math.ceil(left) + " days left"));
    }
    if (jobs.length > 8) panel.appendChild(el("div", "dim small", "…and " + (jobs.length - 8) + " more"));
    for (const s of buildingStations) {
      panel.appendChild(el("div", "dim small", (s.isDepot ? (s.depotAsStation ? "Depot+station " : "Depot ") : "Station ") +
        s.name + " — ~" + Math.ceil(s.building) + " days left"));
    }
    skipAheadRow(G, panel);
  }
  panel.appendChild(el("div", "dim small",
    "Era: " + eraOf(st.time.year).name + " · Build time: " +
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
      openModal("Delete " + line.name + "?", el("div", "", "Trains on it are moved to storage (a depot, if you have one) and can be reassigned to another line later."), [
        ["Delete", () => { removeLine(st, p, line.id); renderPanel(G); }], ["Keep", null]]);
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
      const box = el("div", "linebox");
      box.appendChild(el("div", "small", CFG.TRAINS[tr.type].name + " — " + tr.cars + " cars"));
      const brow = el("div", "btnrow");
      brow.appendChild(btn("Assign to line…", "ubtn", () => assignTrainModal(G, tr)));
      brow.appendChild(btn("Scrap", "ubtn warn", () => {
        openModal("Scrap train?", el("div", "", "Scrap this " + CFG.TRAINS[tr.type].name +
          " for a " + Math.round(CFG.DEPOT.scrapRefund * 100) + "% refund?"), [
          ["Scrap", () => {
            const r = scrapStoredTrain(st, p, tr.id);
            setStatus(r.ok ? "Scrapped for " + fmtYen(r.refund) + "." : r.msg);
            renderPanel(G);
          }], ["Keep", null]]);
      }));
      box.appendChild(brow);
      panel.appendChild(box);
    }
  }
}

/** Modal: choose a compatible line to reassign a stored train to. */
function assignTrainModal(G, tr) {
  const st = G.st, p = player(st);
  const body = el("div");
  const lines = st.lines.filter(l => l.alive && l.co === p.id && trainTypesFor(st, p, l).includes(tr.type));
  if (!lines.length) body.appendChild(el("div", "", "No compatible lines (check gauge/electrification)."));
  const buttons = [["Cancel", null]];
  for (const line of lines) {
    body.appendChild(btn(line.name + " (" + line.type + ", " + line.path.length + " km)", "ubtn wide", () => {
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
  const levy = p.stats.lastLevy || { tax: 0, upkeep: 0 };
  const rows = [
    ["Cash", fmtYen(p.cash)],
    ["Revenue (this sim-day)", fmtYen(p.stats.revToday)],
    ["Revenue (year to date)", fmtYen(p.stats.revYear)],
    ["Last year-end property tax", fmtYen(levy.tax)],
    ["Last year-end station upkeep", fmtYen(levy.upkeep)],
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

/** Button row to fast-forward time to the next construction/station completion. */
function skipAheadRow(G, panel) {
  const st = G.st, p = player(st);
  const days = st.ended ? 0 : daysToNextCompletion(st, p);
  if (days <= 0) return;
  const row = el("div", "btnrow");
  row.appendChild(btn("⏩ Skip ahead ~" + days + " day" + (days === 1 ? "" : "s") + " (to next completion)", "ubtn go", () => {
    fastForwardDays(st, days);
    setStatus("Skipped ahead " + days + " day" + (days === 1 ? "" : "s") + " — costs and income applied as normal.");
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
    if (!sta.alive) continue;
    const kind = sta.isDepot ? (sta.depotAsStation ? "DEPOT+STATION" : "DEPOT") : "STATION";
    s += " · " + kind + " " + sta.name + " (L" + sta.level + ", " + sta.cars + "-car" + (sta.building ? ", building" : "") + ")";
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
    confirmBuyLand(G, idx);
  } else if (ui.mode === "track") {
    // one hex at a time, confirmed by the player — no auto-routed proposals
    const q = buildTrackHex(st, p, idx, true);
    if (!q.ok) { setStatus(q.msg); return; }
    const body = el("div");
    body.appendChild(el("div", "", "Lay 1 km of " + CFG.GAUGES[p.gauge].name + (q.elec ? " electrified" : "") +
      " track on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral + " (" + h.terrain + ")."));
    body.appendChild(el("div", "small", "Construction: " + fmtYen(q.cost)));
    if (q.landCost) body.appendChild(el("div", "small", "Land purchase: " + fmtYen(q.landCost)));
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
    if (why) { setStatus(why); return; }
    const cost = stationCost(st, idx);
    openModal("Build station", el("div", "",
      "Build a station on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral + " for " + fmtYen(cost) +
      "? (~" + CFG.STATION.buildDays + " days)"), [
      ["Confirm (" + fmtYen(cost) + ")", () => {
        const r = buildStation(st, p, idx);
        setStatus(r.ok ? "Station under construction (" + CFG.STATION.buildDays + " days)." : r.msg);
        renderPanel(G);
      }],
      ["Cancel", null]]);
  } else if (ui.mode === "depot") {
    const why = canBuildStation(st, p, idx);
    if (why) { setStatus(why); return; }
    const costDepot = depotCost(st, idx, false), costStation = depotCost(st, idx, true);
    const body = el("div");
    body.appendChild(el("div", "", "Build a rolling-stock depot on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
      "? (~" + CFG.DEPOT.buildDays + " days)"));
    body.appendChild(el("div", "dim small", "A depot stores trains from deleted lines so they're never scrapped. " +
      "Doubling as a station costs more and draws some passenger traffic, but yard facilities reduce its commerce by " +
      Math.round((1 - CFG.DEPOT.commerceMult) * 100) + "%."));
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
  } else if (ui.mode === "line") {
    const sid = h.stations.find(id => st.stations[id].co === p.id && st.stations[id].alive && !st.stations[id].building);
    if (sid === undefined) { setStatus("That's not one of your operating stations."); return; }
    if (!isLineStop(st.stations[sid])) { setStatus("A depot-only facility can't be a line stop. Build it as depot+station first."); return; }
    if (!ui.lineSel.includes(sid)) ui.lineSel.push(sid);
    if (ui.lineSel.length === 2) {
      const [a, b] = ui.lineSel; ui.lineSel = [];
      const body = el("div", "", "Service type for the new line:");
      openModal("Create line", body, [
        ["Local (all stops)", () => finishLine(G, a, b, "local")],
        ["Express (major stops)", () => finishLine(G, a, b, "express")],
        ["Cancel", null]]);
    } else setStatus("First station selected. Click the second.");
  } else { // inspect: persistent selection shown at the top of the side panel
    ui.selected = idx;
    setStatus(hexInfo(st, idx));
    renderPanel(G);
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
  const isPureDepot = s.isDepot && !s.depotAsStation;
  if (isPureDepot) {
    body.appendChild(el("div", "", "Rolling-stock depot — stores trains removed from deleted lines for later reassignment. No passenger traffic."));
  } else {
    body.appendChild(el("div", "", "Level " + s.level + " · platforms for " + s.cars + "-car trains · ~" +
      fmtNum(s.board || 0) + " boardings/day" + (s.isDepot ? " (depot+station: reduced commerce)" : "")));
  }
  const upCost = s.level < CFG.STATION.maxLevel
    ? Math.round(stationCost(st, s.hex) * CFG.STATION.upgradeCostMult * s.level *
        (1 + Math.min(1.5, Math.max(0, st.time.year - s.builtYear) / 40)))
    : 0;
  const buttons = [];
  if (!isPureDepot) {
    if (s.level < CFG.STATION.maxLevel) {
      buttons.push(["Expand station (" + fmtYen(upCost) + ")", () => {
        const r = upgradeStation(st, p, s.id); setStatus(r.ok ? "Station expanded." : r.msg);
      }]);
    }
    buttons.push(["Extend platform (+1 car)", () => {
      const r = extendPlatform(st, p, s.id);
      if (r.ok) refreshTrainCars(st);
      setStatus(r.ok ? "Platform extended to " + s.cars + " cars (" + fmtYen(r.cost) + ")." : r.msg);
    }]);
  }
  buttons.push(["Close", null]);
  openModal((s.isDepot ? (s.depotAsStation ? "Depot+Station: " : "Depot: ") : "Station: ") + s.name, body, buttons);
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
