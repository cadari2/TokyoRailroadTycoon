# Dev Log

Running log for the autonomous "keep improving the game" iterations. Each
entry: what changed, what was decided against (and why), and what the next
pass should look at.

This file didn't exist before this entry even though the project has a long
history (see `git log` and the version notes in `README.md` — v0.5.6 through
v0.5.9.2 landed a lot: Living Corridor, tunnels, achievements, Paris, service
planning, R&D, workforce/HR, disasters/war, four playable campaigns). Treat
the README's per-version bullets as the historical record for anything
before this file; from here on, new iterations should append below instead
of relying on README changelog entries for "why".

---

## 2026-09-28 — First-time player onboarding checklist

**Problem:** focus area #1 (per the standing brief) — test audiences
consistently don't know what to do first. The game had scattered one-off
tips (`appendTip` dim-text hints sprinkled through panels) but no structured
"here's what to do next" flow. A brand-new player is dropped onto a 50×50
hex map with five tabs and a dozen build modes and has to reverse-engineer
the core loop (buy land → lay track → build station → create line → buy
train → riders show up → money → repeat) from the README.

**What I did:** added a small, persistent "Getting Started" checklist that
floats over the top-left corner of the map (`#tutorial` in `index.html`,
styled in `css/style.css`, driven by `js/ui.js`). It lists the five concrete
first actions (buy land, lay track, build a station, create a line, buy a
train) and checks each one off live by reading actual game state — it does
**not** hook the build actions themselves. That matters for two reasons:

1. It's correct no matter how the player gets there (mouse, replaying a
   step out of order, save/reload mid-tutorial).
2. A step a starting land grant already satisfies (kazoku/zaibatsu classes
   start with land; shizoku/heimin don't) shows up checked from the very
   first frame instead of asking the player to do something they've already
   done — a real trap for a hook-based "on buyLand() called" approach.

The current step also surfaces a hint line (the exact tab/mode to use), and
the track step specifically detects "you have a track-build job queued but
it hasn't finished yet" and shows a construction-in-progress message instead
of the generic hint, since that step has real in-game-day latency and a
silent multi-day wait right after starting was the most likely place for a
new player to think they'd done something wrong.

Shown once per browser (`localStorage.trt_tutorial_seen`) — armed on the
very first boot with no existing save, so it survives whichever campaign/
class the player then picks on the start screen, but never re-arms itself
on subsequent "New game" starts. A "▶ Replay tutorial" button in
System → Settings brings it back on demand without touching that flag, for
players who want a refresher or a returning player who wants to show
someone else.

**What I decided against:**
- *A blocking modal wizard* (click-through steps, can't do anything else
  until you dismiss each one). Rejected: it fights the "learn by poking at
  things" style the rest of the UI already has, and it goes stale instantly
  if the player does step 3 before step 2 (very likely — e.g. they explore
  the map before buying land). A live, non-blocking checklist has no
  "wrong order" failure mode.
- *Hooking the world.js action functions* (`buyLand`, `buildTrackHex`,
  `createLine`, `buyTrain`) to fire tutorial-advance events. Rejected in
  favor of polling live state each frame (cheap — the checks are simple
  array/length lookups, and `companyTrackHexes` is an O(2500) scan but only
  runs while the tutorial is visible and only once per rendered frame).
  Polling means zero coupling between world.js (sim core, must stay
  DOM-free per the architecture) and the tutorial UI.
- *A full guided tour of every panel* (Finance, R&D, Workforce, achievements,
  trackage rights, etc.). Out of scope for one pass — the five-step "found a
  working, revenue-generating line" loop is the actual core loop the whole
  game is about; everything else is depth a player discovers once that loop
  clicks. A second onboarding pass could add a *second*, lower-priority
  checklist ("grow further": double-track a busy corridor, take out a loan,
  start R&D) that arms after the first completes, but that's additive, not
  something this pass needed to block on.

**Verification:** `node --check` on the touched files; ran both
`tools/smoke.js` (headless economy trace) and `tools/domsmoke.js` (full
boot + simulated clicks through the UI) — the DOM smoke test's minimal
`document.getElementById` stub doesn't register an id for `"tutorial"`, so
`renderTutorial()` hits its `if (!box) return;` guard and no-ops there,
same as every other purely-cosmetic overlay would; the rest of the 700-line
click-simulation script (start screen, tab rendering, track/station/line/
train flows, save/load, campaign unlock chain, trackage-rights negotiation)
is unaffected by this change since it doesn't touch any of those code
paths.

**Next steps flagged for a future iteration:**
- *Audio gap (focus area #7):* `bgmKey()` (`js/config.js`) only special-cases
  London (reigning-monarch tracks); New York, Melbourne, and Paris all fall
  through to `eraOf(year).key`, i.e. they play Tokyo's Meiji/Taishō/Shōwa/
  Heisei/Reiwa background tracks verbatim over their own (very differently
  named) eras — Gilded Age NYC hearing "Meiji-era" music, etc. This is the
  "maps still borrowing another map's track" case the brief asks to flag.
  Fixing it needs either new period-appropriate tracks per campaign (ideal)
  or at minimum a same-length generic set + a `bgmKey` branch like the
  London one so the *years* line up even before the files change.
- *A "second checklist"* for the post-onboarding early game (double-track a
  crowded corridor, take a loan, start an R&D project, check the demand
  heatmap) — natural follow-on once the first-run data suggests players are
  clearing the first checklist but still stalling afterward.
- The close-up/inspect single-hex view (focus area #6) is still the
  top-down tile at zoom — still worth the "real density" treatment described
  in the brief; not touched this pass.
- Map density / "every hex paved with rail is optimal" (the standing
  structural problem called out in the brief) is unaddressed this pass —
  the tutorial doesn't currently teach anything about *not* overbuilding.
  Once the basic loop lands for players, a natural next UI nudge is
  surfacing land-value / catchment-overlap feedback so sparse, deliberate
  networks visibly out-earn a fully-paved grid, rather than that being a
  fact players have to infer from the finance numbers alone.
