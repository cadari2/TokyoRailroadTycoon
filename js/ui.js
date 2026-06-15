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
  // DEBUG button disabled for public release — see index.html for the
  // commented-out <button id="debugBtn"> and openDebugSkipModal() further
  // down in this file. Uncomment all three spots to restore the time-skip feature.
  // document.getElementById("debugBtn").addEventListener("click", () => openDebugSkipModal(G));
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
  const owner = h.owner >= 0 ? st.companies[h.owner] : null;
  if (h.owner === -2) {
    add("Owner", (h.holdout || "private landowner") + " — refuses to sell at any price");
  } else {
    add("Owner", owner ? owner.name + (owner.isPlayer ? " (you)" : "") : "unowned");
  }
  if (h.owner === -1) add("Purchase price", fmtYen(landPrice(st, idx)));
  else if (h.owner !== -2) add("Assessed value", fmtYen(h.value || landPrice(st, idx)));
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
  if (h.owner === -2) { setStatus((h.holdout || "The owner") + " refuses to sell this parcel at any price."); return; }
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
    const b = btn(label, "ubtn mode" + (ui.mode === m || (m === "line" && ui.mode === "editLine") ? " active" : ""), () => {
      ui.mode = m; ui.lineSel = []; ui.editLineId = -1;
      setStatus(({ inspect: "Click a hex to select & inspect it. Drag to pan, wheel to zoom.",
        buyland: "Click a hex to buy it (a confirmation with the price will appear).",
        track: "Click a hex to lay 1 km of track there (cost & time shown for confirmation).",
        station: "Click a hex with your track on owned land (confirmation will appear).",
        depot: "Click a hex with your track on owned land to build a rolling-stock depot (stores trains from deleted lines).",
        line: "Click your stations in order to set the line's route. Pick 2+, then Build in the panel." })[m]);
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
  if (st.time.year >= CFG.UNLOCK.electrification) {
    const lab = el("label", "lbl");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = p.elecDefault;
    cb.addEventListener("change", () => { p.elecDefault = cb.checked; });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(" Electrified (+50% cost)"));
    sect.appendChild(lab);
  } else sect.appendChild(el("div", "dim", "Electrification unlocks in " + CFG.UNLOCK.electrification + "."));
  panel.appendChild(sect);

  // new-station defaults: platform level & length applied to future builds
  const carCap = maxPlatformCars(st.time.year);
  const defSect = el("div", "sect");
  defSect.appendChild(el("div", "lbl", "New station defaults:"));
  const lvlDefRow = el("div", "airow");
  lvlDefRow.appendChild(el("span", "", "Platforms:"));
  const lvlDefSel = el("select", "usel");
  for (let l = 1; l <= CFG.STATION.maxLevel; l++) {
    const o = el("option", "", "Level " + l);
    o.value = "" + l;
    lvlDefSel.appendChild(o);
  }
  lvlDefSel.value = "" + p.stationDefaults.level;
  lvlDefSel.addEventListener("change", () => {
    p.stationDefaults.level = clamp(+lvlDefSel.value || 1, 1, CFG.STATION.maxLevel);
    renderPanel(G);
  });
  lvlDefRow.appendChild(lvlDefSel);
  defSect.appendChild(lvlDefRow);

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

  // bulk station upgrades: raise every eligible station to a chosen level / platform length
  const bulkSect = el("div", "sect");
  bulkSect.appendChild(el("div", "lbl", "Bulk station upgrades:"));

  const lvlTarget = clamp(ui.bulkLevelTarget || CFG.STATION.maxLevel, 1, CFG.STATION.maxLevel);
  const lvlRow = el("div", "airow");
  lvlRow.appendChild(el("span", "", "Raise all stations to:"));
  const lvlTargetSel = el("select", "usel");
  for (let l = 1; l <= CFG.STATION.maxLevel; l++) {
    const o = el("option", "", "Level " + l);
    o.value = "" + l;
    lvlTargetSel.appendChild(o);
  }
  lvlTargetSel.value = "" + lvlTarget;
  lvlTargetSel.addEventListener("change", () => {
    ui.bulkLevelTarget = clamp(+lvlTargetSel.value || 1, 1, CFG.STATION.maxLevel);
    renderPanel(G);
  });
  lvlRow.appendChild(lvlTargetSel);
  const lvlEligible = st.stations.filter(s => s.co === p.id && isLineStop(s) && s.level < lvlTarget);
  const lvlCost = lvlEligible.reduce((sum, s) => sum + stationLevelUpgradeCost(st, s, lvlTarget), 0);
  const lvlBtn = btn("Upgrade (" + fmtYen(lvlCost) + ")", "ubtn", () => {
    const r = bulkUpgradeStationLevels(st, p, lvlTarget);
    setStatus(r.ok ? "Upgraded " + r.count + " station" + (r.count === 1 ? "" : "s") +
      " to level " + lvlTarget + " for " + fmtYen(r.cost) + "." : r.msg);
    renderPanel(G);
  });
  if (!lvlEligible.length || p.cash < lvlCost) lvlBtn.disabled = true;
  lvlRow.appendChild(lvlBtn);
  bulkSect.appendChild(lvlRow);
  bulkSect.appendChild(el("div", "dim small",
    lvlEligible.length + " station" + (lvlEligible.length === 1 ? "" : "s") + " below level " + lvlTarget + "."));

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
  const carEligible = st.stations.filter(s => s.co === p.id && isLineStop(s) && s.cars < carTarget);
  const carCost = carEligible.reduce((sum, s) => sum + stationPlatformUpgradeCost(st, s, carTarget), 0);
  const carBtn = btn("Extend (" + fmtYen(carCost) + ")", "ubtn", () => {
    const r = bulkExtendPlatforms(st, p, carTarget);
    setStatus(r.ok ? "Extended " + r.count + " station" + (r.count === 1 ? "" : "s") +
      " to " + carTarget + "-car platforms for " + fmtYen(r.cost) + "." : r.msg);
    renderPanel(G);
  });
  if (!carEligible.length || p.cash < carCost) carBtn.disabled = true;
  carRow.appendChild(carBtn);
  bulkSect.appendChild(carRow);
  bulkSect.appendChild(el("div", "dim small",
    carEligible.length + " station" + (carEligible.length === 1 ? "" : "s") + " under " + carTarget + " cars."));

  // electrify all track at once (retrofit catenary across the whole network)
  if (st.time.year >= CFG.UNLOCK.electrification) {
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
  panel.appendChild(bulkSect);

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
  if (lines.length) panel.appendChild(el("div", "dim small", "Click a line's name to show its route on the map."));
  for (const line of lines) {
    const box = el("div", "linebox");
    const selected = G.ui.selectedLine === line.id;
    const head = el("div", "lhead", (selected ? "▸ " : "") + line.name + " (" + line.type + ")");
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
    brow.appendChild(btn("Edit Route", "ubtn", () => {
      G.ui.mode = "editLine"; G.ui.editLineId = line.id; G.ui.selectedLine = line.id;
      G.ui.lineSel = lineWaypoints(line); G.ui.tab = "Build";
      setStatus("Editing " + line.name + ": click stations to add/remove waypoints, then Apply changes in the panel.");
      renderPanel(G);
    }));
    brow.appendChild(btn("Delete", "ubtn warn", () => {
      openModal("Delete " + line.name + "?", el("div", "", "Trains on it are moved to storage (a depot, if you have one) and can be reassigned to another line later."), [
        ["Delete", () => { if (G.ui.selectedLine === line.id) G.ui.selectedLine = -1; removeLine(st, p, line.id); renderPanel(G); }], ["Keep", null]]);
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
      brow.appendChild(btn("Scrap", "ubtn warn", () => {
        const val = trainResaleValue(st, tr);
        openModal("Scrap train?", el("div", "", "Scrap this " + CFG.TRAINS[tr.type].name +
          " (age " + age + "y) for its resale value of " + fmtYen(val) + "?"), [
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
  // current rolling stock on this line — sell/scrap for resale value
  const onLine = line.trains.map(id => st.trains[id]).filter(t => t && t.alive);
  if (onLine.length) {
    body.appendChild(el("div", "lbl block", "Rolling stock on this line (sell for resale value):"));
    for (const tr of onLine) {
      const age = Math.max(0, st.time.year - (tr.bought ?? st.time.year));
      const val = trainResaleValue(st, tr);
      const row = el("div", "btnrow");
      row.appendChild(el("span", "small", CFG.TRAINS[tr.type].name + " · " + tr.cars + "-car · age " + age + "y"));
      row.appendChild(btn("Sell " + fmtYen(val), "ubtn warn", () => {
        const r = sellTrain(st, p, tr.id);
        setStatus(r.ok ? "Sold " + CFG.TRAINS[tr.type].name + " for " + fmtYen(r.refund) + "." : r.msg);
        closeModal(); renderPanel(G);
      }));
      body.appendChild(row);
    }
    body.appendChild(el("div", "lbl block", "Buy a new train:"));
  }
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
  openModal("Trains — " + line.name, body, buttons);
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

/** Button row to fast-forward time to the next construction/station completion.
 *  The label shows CALENDAR days (matching the "~X days left" lines in the
 *  construction queue); fastForwardDays is driven by the equivalent SIMULATED
 *  day count so the skip lands exactly on (or just past) completion. */
function skipAheadRow(G, panel) {
  const st = G.st, p = player(st);
  const simDays = st.ended ? 0 : daysToNextCompletion(st, p);
  if (simDays <= 0) return;
  const calDays = Math.max(1, Math.ceil(calendarDaysToNextCompletion(st, p)));
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
    h.owner === -2 ? (h.holdout || "private") + " (not for sale)" :
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
    const cost = stationBuildCost(st, p, idx);
    openModal("Build station", el("div", "",
      "Build a station on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral + " for " + fmtYen(cost) +
      "? (~" + CFG.STATION.buildDays + " days, level " + p.stationDefaults.level + " · " +
      p.stationDefaults.cars + "-car platforms)"), [
      ["Confirm (" + fmtYen(cost) + ")", () => {
        const r = buildStation(st, p, idx);
        setStatus(r.ok ? "Station under construction (" + CFG.STATION.buildDays + " days)." : r.msg);
        renderPanel(G);
      }],
      ["Cancel", null]]);
  } else if (ui.mode === "depot") {
    const why = canBuildStation(st, p, idx);
    if (why) { setStatus(why); return; }
    const costDepot = depotBuildCost(st, p, idx, false), costStation = depotBuildCost(st, p, idx, true);
    const body = el("div");
    body.appendChild(el("div", "", "Build a rolling-stock depot on " + (h.name ? h.name + " " : "") + "hex #" + h.spiral +
      "? (~" + CFG.DEPOT.buildDays + " days)"));
    body.appendChild(el("div", "dim small", "A depot stores trains from deleted lines so they're never scrapped. " +
      "Doubling as a station costs more and draws some passenger traffic, but yard facilities reduce its commerce by " +
      Math.round((1 - CFG.DEPOT.commerceMult) * 100) + "%. Depot+station uses your default level " +
      p.stationDefaults.level + " · " + p.stationDefaults.cars + "-car platforms."));
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
  } else { // inspect: persistent selection shown at the top of the side panel
    ui.selected = idx;
    setStatus(hexInfo(st, idx));
    renderPanel(G);
  }
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
  if (ui.lineSel.length >= 2) {
    const prev = lineWaypointPath(st, p, ui.lineSel);
    sect.appendChild(el("div", "dim small", prev.error ? "⚠ " + prev.error
      : "Route preview: " + prev.path.length + " km along existing track."));
  }
  const act = el("div", "btnrow");
  if (editing) {
    act.appendChild(btn("Apply changes", "ubtn go", () => {
      const r = editLineRoute(st, p, ui.editLineId, ui.lineSel.slice());
      if (r.ok) {
        setStatus("Route updated — " + r.line.stations.length + " stations, " + r.line.path.length + " km.");
        ui.selectedLine = r.line.id; ui.mode = "inspect"; ui.editLineId = -1; ui.lineSel = []; ui.tab = "Lines";
      } else setStatus(r.msg);
      renderPanel(G);
    }));
  } else {
    act.appendChild(btn("Build local", "ubtn go", () => buildLineFromWaypoints(G, "local")));
    act.appendChild(btn("Build express", "ubtn", () => buildLineFromWaypoints(G, "express")));
  }
  act.appendChild(btn("Clear", "ubtn", () => { ui.lineSel = []; renderPanel(G); }));
  if (editing) act.appendChild(btn("Cancel", "ubtn", () => {
    ui.mode = "inspect"; ui.editLineId = -1; ui.lineSel = []; setStatus("Edit cancelled."); renderPanel(G);
  }));
  sect.appendChild(act);
  panel.appendChild(sect);
}

function buildLineFromWaypoints(G, type) {
  const st = G.st, p = player(st);
  const r = createLineVia(st, p, G.ui.lineSel.slice(), type);
  if (r.ok) {
    setStatus(r.line.name + " created — " + r.line.stations.length + " stations, " + r.line.path.length +
      " km. Buy trains in the Lines tab.");
    G.ui.lineSel = []; G.ui.mode = "inspect"; G.ui.tab = "Lines"; G.ui.selectedLine = r.line.id;
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

/* ---- Debug: in-game time-skip (disabled for public release) ----
 * The DEBUG button and its start-screen toggle are commented out above and
 * in index.html, so this function is currently unreachable from the UI. It
 * is left in place — along with fastForwardToYear() in main.js — so the
 * time-skip feature can be restored later by uncommenting those spots. */
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

  const body = el("div");
  body.appendChild(el("div", "endBanner" + (won ? " win" : ""), won ? "*** VICTORY! ***" : "*** GAME OVER ***"));
  body.appendChild(el("div", "endSub", "Tokyo Railway Chronicle, " + CFG.START_YEAR + "–" + st.time.year +
    " (" + (st.time.year - CFG.START_YEAR) + " years of service)"));

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
    body.appendChild(el("div", "small dim", "Your railway didn't survive to see the new era — but its tracks live on in Tokyo's story."));
  }
  body.appendChild(el("div", "endThanks", "お疲れ様でした (Otsukaresama deshita) — thanks for playing!"));

  let title;
  if (won) title = "VICTORY — your railway defined Tokyo!";
  else if (meRank > 0) title = win.name + " wins the century — you finished #" + (meRank + 1) + " of " + ranked.length + ".";
  else title = win.name + " wins the century.";

  openModal(title, body,
    [["Keep watching", null], ["New game", () => { G.st = newGame((Math.random() * 1e9) | 0); G.st.renderDirty = true; }]]);
}

/* ---- Start screen ---- */
/** Populate the pre-game overlay: continue a save (if any), or configure and
 *  start a new game (number of computer rivals + a difficulty for each). */
function buildStartScreen(G, savedExists) {
  const root = document.getElementById("startBox");
  root.textContent = "";
  root.appendChild(el("div", "modalTitle", "TOKYO RAILROAD TYCOON"));
  root.appendChild(el("div", "dim small",
    "1872–2028 — lay track, build stations, and grow a rail empire across Tokyo's history."));

  // game speed (applies whether continuing a save or starting fresh)
  const speedRow = el("div", "airow");
  speedRow.appendChild(el("span", "lbl", "Game speed:"));
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

  /* DEBUG mode disabled for public release. To restore: uncomment this
   * block, the <button id="debugBtn"> in index.html, the click listener in
   * initUI() above, and the two applyDebugMode() calls below.
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
  */

  if (savedExists) {
    root.appendChild(el("div", "lbl block", "A saved game was found."));
    const row = el("div", "btnrow");
    row.appendChild(btn("Continue saved game", "ubtn go wide", () => {
      applySpeed();
      // applyDebugMode();   // disabled for public release
      document.getElementById("startScreen").classList.add("hidden");
    }));
    root.appendChild(row);
    root.appendChild(el("hr"));
    root.appendChild(el("div", "lbl block", "…or configure and start a new game:"));
  }

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
      row.appendChild(el("span", "lbl", CFG.AI.names[i] + ":"));
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

  const startRow = el("div", "btnrow");
  startRow.appendChild(btn("Start new game", "ubtn go wide", () => {
    applySpeed();
    // applyDebugMode();   // disabled for public release
    const aiCount = clamp(+countSel.value || 0, 0, CFG.AI_COUNT);
    const aiDifficulties = diffSelects.map(s => s.value);
    const seed = (Math.random() * 1e9) | 0;
    G.st = newGame(seed, { aiCount, aiDifficulties });
    G.st.renderDirty = true;
    document.getElementById("startScreen").classList.add("hidden");
    setStatus("Welcome to 1872. Buy land, lay track, and connect the city. (Drag map to pan, wheel to zoom.)");
    renderPanel(G);
  }));
  root.appendChild(startRow);
}
