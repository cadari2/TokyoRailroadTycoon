# Dev Log

Running notes for each iteration on Tokyo Railroad Tycoon: what changed, what
was deliberately skipped and why, and what the next pass should look at.
This file didn't exist before this entry — for the fuller history (v0.5.x →
v0.6.0), see the changelog at the top of `README.md`; the highlights that
matter for what's next:

- **v0.6.0** added peak/off-peak timetables (since simplified back out in
  v0.5.9.2 — assigned trains just run all day now), achievements, the Paris
  campaign, and through-service agreements.
- **v0.5.9.2** simplified line operations, added achievements + Paris, fixed
  a period-4 ridership oscillation bug.
- The core loop (build transit → ridership → district growth → more
  transit funding) is implemented via `updateAttractiveness`/`updatePopulation`
  in `js/main.js` and the demand/OD assignment in `js/world.js` — this is the
  thing every change should protect.
- Known standing risk, restated by the task brief: the "pave every hex"
  optimum undermines realism/fun. No run has yet tackled this head-on; it
  remains the highest-value open problem.

## 2026-09-28 — Guided tutorial for first-time players

**What:** User testing has consistently flagged the same problem: new
players don't know what to do at game start. There was no onboarding beyond
scattered `appendTip()` hints inside panels (which is also the case study
one prior test audience specifically flagged). Added a short, skippable
guided-tutorial overlay (`#tutorialBox` in `index.html`, logic in
`js/ui.js`):

- Offered as a checkbox on the start screen's new-game section, defaulted
  **on** unless the player has already seen/skipped a tutorial before
  (tracked via `localStorage["trt_tutorial_seen"]`, same pattern as the
  existing campaign-completion/unlock flags).
- Six steps: intro → lay ≥2 hexes of track → build 2 stations → found a
  line → buy a train → unpause and watch. Four of the six auto-advance by
  polling live game state each render (`st.hexes`/`st.stations`/`st.lines`/
  `st.trains` for the player's company) — no separate save-able progress
  counter needed. The intro and closing steps advance on a Next/Finish
  button since there's nothing in game state to detect for them.
- Each step highlights the tab and/or button it wants the player to use
  (a CSS pulse via `.tut-highlight`), tracked through explicit references
  (`G._tabBtns`, new `G._modeBtns`, new `G._tutBtns`) rather than
  `document.querySelector`, since `buildPanel`/`linesPanel` rebuild their
  buttons from scratch on every render — a DOM query would have worked in
  the browser but silently returned nothing against `tools/domsmoke.js`'s
  DOM stub (which doesn't implement `querySelector`/`querySelectorAll`),
  so the direct-reference approach is both faster and testable.
- A "Skip tutorial ✕" button is always present and disables it permanently
  (via the same seen-flag) — this is a light nudge, never a gate.

**Decided against:**
- Blocking/modal-style tutorials (can't act until you do the tutorial
  step) — rejected as too heavy-handed for a sim where players often want
  to explore first; the persistent-but-skippable card fits the genre
  better (RCT/OpenTTD-style nudge, not a forced walkthrough).
- A step for "wait for profit" or anything requiring elapsed sim time —
  the six steps above are the actionable minimum; once a player has built
  track→stations→line→train, they've already learned the interface.
- Persisting tutorial step progress into the save file — recomputing from
  live state on every render is simpler, survives reload/undo correctly,
  and needed no save-schema bump.

**Testing:** `tools/smoke.js` doesn't load `js/ui.js` at all (it's
DOM-free by design), so it was unaffected. `tools/domsmoke.js` *does*
exercise the start screen, and its `debug mode off by default` step
hard-asserted "exactly one checkbox on the start screen" — broke once the
tutorial checkbox was added. Fixed the test itself (`findCheckboxNear`,
matching by the adjacent label text instead of position/count), since the
assumption was about "the debug checkbox" specifically, not "how many
checkboxes total" — that's the right invariant going forward as more
start-screen options get added.

Also found, NOT caused by this change (confirmed against a stashed
baseline of the pre-change tree): `tools/domsmoke.js`'s two "v0.5.7 per-hex
trackage rights" steps fail (`mousedown on the rival's own track should
start the selection`, then a crash at `js/world.js:2917` reading
`st.hexes[key[0]].track.co` — looks like a hex in the negotiation-offer
flow can have `track` be null/undefined by the time "Make offer" runs).
**Left unfixed** — out of scope for this pass (one well-scoped change per
run), but flagged here since it's a real bug in a shipped feature, not
test flakiness.

**Next iteration should look at:**
1. Fix the per-hex trackage-rights bug above (`js/world.js:2917` and the
   drag-selection skip logic) — it's broken on `main`, not just under test.
2. The map-density problem (pave-every-hex being the "efficient" play) is
   still untouched and is the single highest-value ask in the brief.
   Possible angles worth prototyping: land/upkeep costs that scale
   superlinearly with a company's *track density* in an area (not just
   total km), or demand mechanics that reward fewer, well-placed stations
   over blanket coverage (e.g. diminishing marginal ridership when
   stations are too close together, which would also make the "buy the
   ekimae district" mechanic more central).
3. This tutorial covers "what to click first." It does not cover reading
   the simulation once running (what demand/attractiveness/finance panels
   mean) — a natural follow-up given #1 in the focus list is still the
   top-flagged issue.
4. Audio: no run has yet audited which maps still borrow another map's
   BGM track or are missing SFX — flagged per the brief's ask, not yet
   investigated.
