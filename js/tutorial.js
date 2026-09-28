/* =========================================================================
 * js/tutorial.js — first-game onboarding walkthrough.
 *
 * Test audiences' #1 complaint was "I don't know what to do." This is a
 * short, non-blocking checklist that appears the first time a brand-new
 * player starts a game and tracks real progress against actual game state
 * — lay track, build two stations, create a line, buy a train, check the
 * money — rather than a modal wall of text to click through. Each step
 * auto-advances the moment its condition becomes true (checked once a
 * frame from the main loop), so it rewards doing the thing, not reading
 * about it. It can be skipped at any point and replayed later from
 * System → Settings.
 *
 * Persistence: only a "seen it" flag lives in localStorage
 * (trt_tutorial_done). The walkthrough's own active/step state lives on G
 * (not st), so it never touches the save schema.
 * ========================================================================= */
"use strict";

const TUTORIAL_DONE_KEY = "trt_tutorial_done";

function tutorialSeen() {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(TUTORIAL_DONE_KEY) === "1"; }
  catch (e) { return true; }   // storage unavailable — don't nag every load
}
function markTutorialSeen() {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(TUTORIAL_DONE_KEY, "1"); }
  catch (e) { /* ignore */ }
}

/** How many of the player's stations are actually usable line stops
 *  (built, not a pure rolling-stock yard) — mirrors isLineStop(). */
function tutorialStationStops(st) {
  const p = player(st);
  return st.stations.filter(s => s.co === p.id && isLineStop(s)).length;
}

// steps without a `done` checker only advance when the player clicks the
// box's own button (the opening/closing bookends, and the "read this" beat
// after the train starts running) — everything else advances on real progress.
const TUTORIAL_STEPS = [
  { key: "welcome", tab: "Build", mode: "inspect",
    title: "Welcome to your railway",
    body: "You've inherited land and cash to found a private railway. This short walkthrough gets one line running end to end — everything else in the game grows out of that loop. Skip any time." },
  { key: "track", tab: "Build", mode: "track",
    title: "Step 1 — Lay track",
    body: "Click Lay Track, then click a hex of your own land to start building rail. Track only needs to reach where riders already are — you don't have to pave every hex to turn a profit.",
    done: G => companyTrackKm(G.st, player(G.st)) > 0 },
  { key: "station", tab: "Build", mode: "station",
    title: "Step 2 — Build a station",
    body: "Switch to Build Station and click a hex that has your track on it. Track alone carries nobody — a station is where passengers actually board.",
    done: G => tutorialStationStops(G.st) >= 1 },
  { key: "station2", tab: "Build", mode: "station",
    title: "Step 3 — Build a second station",
    body: "A line needs two ends. Lay a little more track if you need to, then build a second station so the first one has somewhere to connect to.",
    done: G => tutorialStationStops(G.st) >= 2 },
  { key: "line", tab: "Build", mode: "line",
    title: "Step 4 — Create a line",
    body: "Open Create Line, click your two stations in order (a route preview appears below), then Build local. That turns bare track into a running service.",
    done: G => G.st.lines.some(l => l.co === player(G.st).id && l.alive) },
  { key: "train", tab: "Lines", mode: null,
    title: "Step 5 — Buy a train",
    body: "A line with no train is just paint on the map. Select your new line here and buy one to put it into service.",
    done: G => G.st.trains.some(tr => tr.co === player(G.st).id && tr.alive) },
  { key: "finance", tab: "Money", mode: null,
    title: "Step 6 — Watch the money",
    body: "Your train is now earning fares. Finance shows revenue against upkeep and payroll — service drives riders, riders drive cash, cash funds more service. That loop is the whole game, so build sparingly and where demand actually is: paving every hex in rail looks efficient but rarely pays for itself." },
  { key: "done", tab: null, mode: null,
    title: "You're running a railway",
    body: "From here: grow the line, check Demand (top bar) for underserved districts before you build, and watch Property/R&D as the eras turn. Good luck — replay this walkthrough any time from System → Settings." },
];

/** Should the given Build-panel mode button pulse right now? Only while the
 *  player hasn't switched to it yet — once they're in the mode the tutorial
 *  wanted, the point's made and further pulsing is just noise. */
function tutorialWantsMode(G, mode) {
  const tut = G.tutorial;
  if (!tut || !tut.active) return false;
  const step = TUTORIAL_STEPS[tut.index];
  return !!step && step.mode === mode && G.ui.mode !== mode;
}

/** Reset any tutorial highlight left on the tab bar. */
function tutorialClearTabHighlight(G) {
  for (const [, b] of (G._tabBtns || [])) b.classList.remove("tut-pulse");
}
/** Pulse the tab the current step wants the player looking at. */
function tutorialApplyTabHighlight(G) {
  const tut = G.tutorial;
  tutorialClearTabHighlight(G);
  if (!tut || !tut.active) return;
  const step = TUTORIAL_STEPS[tut.index];
  if (!step || !step.tab) return;
  for (const [key, b] of (G._tabBtns || [])) if (key === step.tab) b.classList.add("tut-pulse");
}

function startTutorial(G) {
  G.tutorial = { active: true, index: 0 };
  tutorialEnterStep(G);
}
/** remember=true persists "don't show again" (a real finish or an explicit skip);
 *  remember=false just hides the box (e.g. the player loaded a different save). */
function endTutorial(G, remember) {
  G.tutorial = { active: false, index: 0 };
  if (remember) markTutorialSeen();
  tutorialClearTabHighlight(G);
  renderTutorialBox(G);
}
function tutorialAdvance(G) {
  G.tutorial.index++;
  if (G.tutorial.index >= TUTORIAL_STEPS.length) { endTutorial(G, true); return; }
  tutorialEnterStep(G);
}
/** Jump the UI to where the new step happens, then (re)draw everything that
 *  reflects tutorial state: the panel (for the mode's active highlight),
 *  the tab bar, and the box itself. */
function tutorialEnterStep(G) {
  const step = TUTORIAL_STEPS[G.tutorial.index];
  if (!step) return;
  if (step.tab) G.ui.tab = step.tab;
  if (step.mode) G.ui.mode = step.mode;
  // every step points at a panel tab — reveal the side menu if the player
  // (or the mobile default) had collapsed it, so the instruction is visible
  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn && document.body.classList.contains("sidebar-hidden")) menuBtn.click();
  renderPanel(G);
  tutorialApplyTabHighlight(G);
  renderTutorialBox(G);
}

/** Called once a frame; cheap enough (a handful of array scans over a
 *  small company roster) to run unconditionally alongside the sim tick. */
function tutorialTick(G) {
  const tut = G.tutorial;
  if (!tut || !tut.active) return;
  const step = TUTORIAL_STEPS[tut.index];
  if (!step || !step.done) return;
  let complete = false;
  try { complete = step.done(G); } catch (e) { return; }   // defensive: never let a bad state crash the frame
  if (complete) {
    setStatus("✓ " + step.title.replace(/^Step \d+ — /, "") + " — nice work.");
    tutorialAdvance(G);
  }
}

function renderTutorialBox(G) {
  let box = document.getElementById("tutBox");
  const tut = G.tutorial;
  if (!tut || !tut.active) { if (box) box.remove(); return; }
  const step = TUTORIAL_STEPS[tut.index];
  if (!step) { endTutorial(G, true); return; }
  if (!box) {
    box = el("div", "tutbox");
    box.id = "tutBox";
    document.body.appendChild(box);
  }
  box.textContent = "";
  box.appendChild(el("div", "tuttitle", step.title));
  box.appendChild(el("div", "tutbody", step.body));
  const row = el("div", "tutbtns");
  const isLast = tut.index === TUTORIAL_STEPS.length - 1;
  if (!step.done) {
    row.appendChild(btn(isLast ? "Finish" : "Got it →", "ubtn go",
      () => { if (isLast) endTutorial(G, true); else tutorialAdvance(G); }));
  } else {
    row.appendChild(el("div", "dim small", "Waiting for you to try this…"));
  }
  if (!isLast) row.appendChild(btn("Skip tutorial", "ubtn", () => endTutorial(G, true)));
  box.appendChild(row);
}

/** Hook for a brand-new game (called from startNewGame): starts the
 *  walkthrough for a player who's never finished or skipped it, otherwise
 *  makes sure no stale box/highlight from a previous game lingers. */
function maybeStartTutorial(G) {
  G.tutorial = { active: false, index: 0 };
  if (!tutorialSeen()) startTutorial(G);
  else { tutorialClearTabHighlight(G); renderTutorialBox(G); }
}
