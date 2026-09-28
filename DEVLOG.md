# Dev Log

Running notes from the automated "keep improving the game" loop: what changed,
why, what was deliberately skipped, and what the next iteration should look at.
This is the first entry — no DEVLOG existed before this run, so there's no
prior context to reconcile with.

---

## 2026-09-28 — First-run onboarding: a real "How to Play" modal

**Problem.** Per the loop's standing brief, user friendliness is the
most-flagged issue with test audiences ("they don't know what to do"). A
read-only survey of the codebase this run confirmed there was genuinely no
tutorial: a brand-new player got the start screen (knobs, no rules), one
status-bar sentence on first load, and otherwise only hover-only `title=`
tooltips (invisible on touch). A `showTips`/`appendTip()` scaffold already
existed for contextual tips but was wired into only 3-4 places in a
3300-line `ui.js` — cheap infrastructure that was never used.

**What shipped.**
- A `❓ Help` button in the top bar (`index.html`), wired in `initUI` to open
  a new "How to Play" modal (`openHelpModal`, `js/ui.js`).
- The modal covers, in five short sections: the goal, **the core loop**
  (service → demand → fares/growth → funds the next line — this game's
  central mechanic, stated explicitly since nothing else in the UI said it
  outright), how to get started (Build/Lines panels), and — pointedly —
  **"Build sparse, not wide"**: track/staff/tax accrue daily regardless of
  ridership, a parallel second track roughly doubles upkeep, and two
  stations built too close split the same catchment instead of each
  drawing a full one. This restates mechanics that already existed
  (`CFG.MAINTENANCE`, `HR.staffPerKm`, catchment-splitting in
  `computeCatchments()`) but were never surfaced to the player as *advice* —
  they just quietly lost money if they carpeted the map.
- The modal auto-opens once, the first time a brand-new game is started in a
  browser that's never seen it (`HELP_SEEN_KEY = "trt_help_seen"` in
  localStorage, checked in `startNewGame`). Players who already have an
  autosave (the Continue path) never hit that code path, so returning
  players aren't interrupted. It's always reachable again via the ❓ button.

**Deliberately not done this run** (kept the change to one finished thing
rather than a grab bag, per the loop's own instructions):
- **A genuine player-facing anti-sprawl mechanic.** The AI already gets
  `CFG.AI.parallelTrackPenalty` / `trackSoftCap` to keep it from carpeting
  the map (`config.js` ~842-852) — the human player gets none of that, only
  the passive cost deterrent. The Help modal now *explains* the deterrent,
  but a live in-the-moment nudge (e.g. a build-time warning when laying
  redundant parallel track, or surfacing the upkeep delta before confirming)
  would be a stronger, more game-changing fix for the map-density problem
  the brief calls out as one of the most valuable things to crack. That's a
  bigger, more design-sensitive change than a documentation pass and
  deserves its own focused run.
- **The hex close-up/inspect view** (focus area #6). Confirmed there is no
  magnified/graphical close-up at all — `selectionBox()` in `ui.js` (search
  "Persistent tile inspector") is pure text, and hex selection on the canvas
  is just an outline (`render.js`, search "tracePath" near the hover/select
  draw calls). This is real, scoped greenfield work for a dedicated run.
- **Campaign BGM gaps** (focus area #7, flagging per the brief's instruction
  even though not fixed this run): `bgmKey()` in `js/config.js` (~1296-1303)
  only special-cases `campaign === "london"` (`CFG.BGM_LONDON`). NYC,
  Melbourne, and Paris have **no dedicated BGM table at all** — they
  silently fall through to Tokyo's Japanese-era tracks
  (meiji/taisho/showa.../heisei/reiwa.mp3) despite each having its own
  currency, rival names, and landmarks. London's one deliberate placeholder
  reuse (carolean → reiwa.mp3) is commented as intentional
  (`assets/audio/manifest.js` line ~42); NYC/Melbourne/Paris have no such
  reasoning because nothing was ever written for them. SFX coverage looks
  complete — no missing files found.
- **Broader `appendTip()` expansion.** Left as-is; the single Help modal is
  the higher-leverage version of the same idea (one thorough explainer beats
  a dozen scattered one-liners for a first pass), but scattering a few more
  contextual tips into Build/Lines/Finance later is still a good, cheap
  follow-up.

**A bug found, not fixed (out of scope for this run).** Confirmed via
`tools/domsmoke.js` and reproduced on the unmodified base branch too (via
`git stash` + re-run, so it predates this change): the per-hex trackage-
rights "Make offer" flow throws in `js/world.js:2917` —
`target = st.companies[st.hexes[key[0]].track.co]` assumes the first
selected hex has track, but crashes with a `TypeError` reading `.co` of
`null` when it doesn't. Repro: `tools/domsmoke.js` step "v0.5.7 per-hex
rights: Make offer opens a negotiation dialog and clears the selection on
accept". A companion step ("drag along connected track selects hexes...")
also fails intermittently — see the testing note below on why that one may
be map-seed-dependent rather than a hard bug; the crash at world.js:2917 is
NOT seed-dependent and reproduced on every run.

**Testing.**
- `tools/smoke.js` (headless sim core, unaffected by this change since it
  doesn't load `ui.js`): 356/356 PASS. Note: this now takes **5-10+ minutes**
  of wall time to complete — worth flagging as unusually slow for a "smoke"
  test; a progress heartbeat (`console.log` every N sim-years) would make a
  hang vs. a slow-but-fine run distinguishable in CI/automation.
- `tools/domsmoke.js` (full DOM+UI boot): added two new steps covering the
  Help modal (auto-open-once on first game, persisted flag, manual reopen
  via the ❓ button, content sanity-check) — both pass. Also had to add
  `helpBtn` to the id stub list and a `hasText()` helper (the existing
  `findByText()` only matches `<button>` text, not the modal's body `<div>`s).
  Ran the full suite **three times**; besides the world.js:2917 bug above
  (100% reproducible, 3/3), two *other* steps ("track mode single click →
  confirm modal", "gauge works modal") failed in exactly one of the three
  runs each, with different failure combinations each time. `startNewGame`
  seeds every game with `(Math.random() * 1e9) | 0` (`ui.js`), so
  `domsmoke.js` procedurally generates a different map on every invocation;
  several test steps click fixed screen pixel coordinates assuming a
  particular map layout, which will occasionally miss on an unlucky seed.
  This is pre-existing test fragility, not something this change caused —
  but it means a single green/red `domsmoke.js` run isn't fully trustworthy
  on its own. Worth a future fix: pin `domsmoke.js` to a fixed seed (or a
  few known-good seeds) for reproducibility.

**Next iteration should look at, in rough priority order:**
1. Fix `js/world.js:2917` (trackage-rights negotiation crash) — small, clear
   repro, real player-facing bug (crashes the negotiation dialog).
2. A real player-facing density/anti-sprawl mechanic (see above) — this is
   the single most-called-out opportunity in the loop's brief and this run
   only documented the problem, it didn't change the incentive.
3. The hex close-up/inspect view (focus area #6) — greenfield, and doubles
   as a chance to show regional character per map (serves focus areas #1 and
   #3 too).
4. Campaign BGM for NYC/Melbourne/Paris (focus area #7) — either source
   period-appropriate tracks or add an explicit, commented fallback mapping
   in `CFG.BGM_NYC`/`BGM_MELBOURNE`/`BGM_PARIS` (mirror `BGM_LONDON`'s
   `{from, key}` shape) so the reuse is a documented choice, not a silent gap.
5. Pin `tools/domsmoke.js` to a fixed RNG seed to kill the run-to-run test
   flakiness described above.
6. Investigate why `tools/smoke.js` takes 5-10+ minutes; add a progress
   heartbeat at minimum.
7. Expand `appendTip()` usage in the Build/Lines/Finance panels now that the
   Help modal has set the tone for in-game guidance.
