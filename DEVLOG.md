# Dev Log

Running notes for each automated improvement pass: what changed, why, what
was considered and rejected, and what the next pass should look at. Newest
entry on top. (This file didn't exist before the entry below — the project's
history up to v0.5.9.2 lives in `README.md` and `docs/PLAN-*.md`.)

---

## 2026-09-28 — First-steps guide (onboarding)

**Context**: per the standing brief, user-friendliness is the most-flagged
problem with test audiences — they don't know what to do. Before this pass,
the game had a passive `showTips` setting (contextual one-liners scattered
through panels, e.g. `appendTip()` calls) and a mode-switch status bar
(`setStatus()`), but nothing that actively walks a new player through the
core loop, and no persistent "what do I do next" reference. The start screen
is a dense configuration form (family standing, rivals, difficulty,
campaign) with no in-game follow-through once Start is pressed.

**What I did**: added a small non-blocking "First Steps" guide — a floating
checklist card (`#tutorial` in `index.html`, styled in `css/style.css`,
built by `renderTutorial()`/`TUTORIAL_STEPS` in `js/ui.js`) that tracks the
five moves that make up the core loop: lay track → build a station → build
a second station → create a line → buy a train. Each step's "done" state is
read straight from live game state (`st.hexes`/`st.stations`/`st.lines`/
`st.trains` filtered to the player's company id), so it can't drift out of
sync with what the player actually did — there's no separate progress flag
to maintain. The active step's hint is a button that jumps the Build/Lines
tab to the right mode, so the guide is actionable, not just descriptive.

It auto-opens once, the very first time a player starts a game in a given
browser (`localStorage` flag `trt_tutorial_seen`), and is reopenable any
time via a new topbar `❔ Guide` button — so it doubles as quick reference
for returning players, not just a one-shot wizard. Dismissing it (✕ or
"Skip guide") just hides it; it doesn't lose progress if reopened. On
completion it collapses to one congratulatory line pointing at Money/R&D
rather than continuing to list finished steps.

Extended `tools/domsmoke.js` (the headless DOM smoke test) with two new
steps covering the auto-open, the close/reopen cycle, and the completion
state once track/stations/line/train all exist for the player. Note for
whoever touches that file next: its DOM stub's `el.textContent = ""` does
**not** clear `el.children` (only a real browser does that) — existing
steps work around it by diffing `children.length` before/after a render,
and I followed the same pattern for the new assertions.

**Considered and rejected**:
- *A blocking modal wizard (click-through Next/Next/Next)* — would force a
  specific order and stop the player from exploring, which cuts against the
  "figure out your own network" appeal the game is going for. A checklist
  that reflects real state, not a linear script, felt truer to a sim.
- *Making "Buy Land" an explicit tutorial step* — the v0.5.9 corridor-
  conveyance fix already buys+conveys unowned land automatically when you
  lay track over it, so a beginner genuinely doesn't need the Buy Land mode
  for the core loop anymore (it's now a deliberate ekimae land-banking play
  for later). Forcing it into step 1 would have taught a habit the game
  doesn't need.
- *Full i18n for the guide text* — `data/i18n.js`'s own header says
  transient status lines and deep panel prose are intentionally
  English-only for now (only the persistent shell is bilingual); the guide
  text follows that existing convention rather than half-translating a new
  surface.
- *In-canvas highlight arrows pointing at the exact hex/button* — real value,
  but a materially bigger change (needs render-layer hooks into the tutorial
  state) and this pass aimed for one well-scoped thing. Flagged below.

**Verification**: `node tools/smoke.js` (full sim, headless, no DOM) passes
with zero failures. `node tools/domsmoke.js` passes on everything this pass
touched (including the two new guide steps), but has two **pre-existing**
failures unrelated to this change, confirmed present on the prior commit too
(ran the same suite against `HEAD~1` in a scratch worktree before touching
anything): `v0.5.7 per-hex rights: drag along connected track selects
hexes...` and the offer-modal step right after it, both in the per-hex
trackage-rights drag-select flow (`js/ui.js` hexRights mode). Left unfixed
this pass to stay scoped to the onboarding change — see next steps.

**Next steps for a future pass**:
- Fix the two pre-existing `domsmoke.js` failures in the per-hex trackage-
  rights drag-select flow (`step("v0.5.7 per-hex rights: drag along
  connected track selects hexes...")` and the offer-modal step right after
  it in `tools/domsmoke.js`). First failure: "mousedown on the rival's own
  track should start the selection" — the picked hex likely isn't matching
  the test's expected screen coordinates, possibly because an earlier
  step's camera pan/zoom state carries over unexpectedly. Second failure is
  a crash in `js/world.js:2917` (`st.companies[st.hexes[key[0]].track.co]`)
  reading `.track` off something that turns out falsy — probably a
  downstream symptom of the first failure leaving `hexRightsSel` in an
  unexpected state rather than a separate bug. Worth a real look since this
  is a live in-game feature (negotiating trackage rights with a rival),
  not just test scaffolding.
- The guide only covers the very first line. A natural follow-on "second
  goals" tier (double-track a busy corridor, build a depot, hit your first
  profitable month) could reuse the same `TUTORIAL_STEPS`-with-`done()`
  pattern once the first one proves out with players.
- In-canvas pointing (highlight the exact hex/button the active step wants)
  would close the gap between "told what to do" and "shown where" — biggest
  remaining onboarding gap, but needs render-layer changes, not just
  `ui.js`.
- The close-up/inspect single-hex view (focus area #6 in the brief) is still
  the flat, under-filled view described in the brief — untouched this pass.
- Map/audio review (focus areas #3, #7): not audited this pass. Worth a
  dedicated pass to check every campaign has its own BGM (the brief
  specifically flags checking for maps still borrowing another map's track)
  and that terrain proportions read as distinct per city.
- Density/sparse-network incentives (the standing "don't let paving every
  hex be optimal" problem) — not touched this pass; still the most valuable
  open design problem per the brief.
