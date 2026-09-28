/* =========================================================================
 * guide.js — "Getting Started" onboarding steps (pure; no DOM).
 * Progress is derived from game state, so it needs no save data: each step
 * is done when the player's company has the corresponding thing. ui.js
 * renders the card and remembers dismissal in localStorage.
 * ========================================================================= */
"use strict";

/** Ordered steps for the player's company; `done` is derived from state.
 *  opts.sawDemand — the player has toggled the demand heatmap this session. */
function guideSteps(st, opts) {
  opts = opts || {};
  const p = st.companies.find(c => c.isPlayer);
  if (!p) return [];
  const mine = a => a.filter(x => x && x.alive !== false && x.co === p.id);
  const hasTrack = st.hexes.some(h => h.track && h.track.co === p.id);
  const stations = mine(st.stations);
  const lines = mine(st.lines);
  const hasTrain = lines.some(l => l.trains && l.trains.some(id => st.trains[id] && st.trains[id].alive));
  return [
    { key: "demand", done: !!opts.sawDemand, tab: null,
      title: "Find where people are",
      body: "Press Demand (top bar). Warm hexes hold the most riders — link the big ones, not every hex between." },
    { key: "track", done: hasTrack, tab: "Build",
      title: "Lay some track",
      body: "Build tab → Track, then click hexes between two busy areas. Aim for a few well-chosen links." },
    { key: "stations", done: stations.length >= 2, tab: "Build",
      title: "Build two stations",
      body: "Stations at both ends of your track (Build tab → Station). Riders only board at stations." },
    { key: "line", done: lines.length >= 1, tab: "Lines",
      title: "Create a line",
      body: "Lines tab → New line, and pick your stations in order. A line tells trains where to run." },
    { key: "train", done: hasTrain, tab: "Lines",
      title: "Put a train on it",
      body: "Buy a train and assign it to the line. Watch it fill up." },
    { key: "fare", done: (p.stats.pax || 0) > 0 || (p.stats.paxAvg || 0) > 0, tab: "Money",
      title: "Earn your first fares",
      body: "Riders pay per trip. Income funds more track — the loop that grows the city." },
    { key: "network", done: stations.length >= 4 && lines.length >= 1, tab: "Build",
      title: "Grow a deliberate network",
      body: "Add stations where demand is high. Rail in every hex costs upkeep without adding riders." },
  ];
}
