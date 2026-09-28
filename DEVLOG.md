# Dev Log

Running notes for each autonomous iteration on Tokyo Railroad Tycoon: what
changed, what was decided against and why, and what the next pass should
look at. Newest entry first.

## 2026-09-28 — First-time onboarding tutorial

**Context.** No DEVLOG existed yet (first run of this loop). Read the
README's version history and recent commits instead: the game is deep
(v0.5.9.2, corridor economics, trackage rights, timetables, achievements,
five campaigns) but had no structured onboarding at all — just scattered
`appendTip()` hint lines and a "Show tutorial/tip text" checkbox. The task
brief's focus-area #1 ("user friendliness — the most-flagged problem with
test audiences: they don't know what to do") pointed here directly, so
that's what this pass built, rather than spreading across multiple areas.

**What shipped.** A short, first-time-only guided walkthrough of the core
loop — lay track → open two stations → start a line → put a train into
service — that teaches by doing instead of a click-through slideshow:

- Coach-mark boxes (`js/ui.js`, new section after `appendTip`) highlight the
  *real* UI control for each step (the Lay Track / Build Station / Create
  Line mode buttons, the map canvas, the Lines panel's Buy Train button)
  with a pulsing outline, and position themselves next to it.
- Each step advances on the player's own action — `G.ui.mode === "track"`,
  two owned track hexes, two stations, a line, a train — read directly off
  game state (`st.builds`/`st.stations`/`st.lines`/`st.trains`), not a
  "click Next" button. `updateTutorial(G)` polls this once per animation
  frame from `main.js`'s existing `frame()` loop (same pattern as
  `audioTick`), so it costs nothing when no tutorial is running.
- Triggers once, automatically, the first time a player ever starts a new
  game (`localStorage` flag `trt_tutorial_v1_done`, checked in
  `startNewGame()`), and is replayable any time from System → "▶ Replay
  first-time tutorial" (already-satisfied steps auto-skip instantly, so
  replaying mid-game just lands you on the closing summary).
- The closing step explicitly restates the CORE MISSION: ridership funds
  expansion, and "watch demand, not blank hexes — a few well-placed lines
  beat paving every hex with track." This is the cheapest place in the game
  to say that once, directly, to every new player, given the standing
  "sparse network" problem flagged in the brief.

**Implementation notes / traps avoided.**
- `tools/domsmoke.js` boots the *entire* UI layer against a hand-rolled DOM
  stub (`appendChild`/`children`/`classList`, no `querySelector*`, no
  `Element.remove()`, and `getElementById` only resolves the fixed ids
  baked into the stub, not later `createElement`d ones). The first draft
  used `querySelectorAll` and `document.querySelector(".tutorial-target")`
  and crashed that harness. Rewrote to a manual `children`-tree walk and a
  cached module-level element reference instead — works identically in a
  real browser and keeps the headless harness able to exercise this code
  (it's literally there to catch reference errors in browser-only paths).
  Also avoided `.remove()` (not in the stub): the coach box is hidden via
  `style.display`, not detached.
- Confirmed the 2 `domsmoke.js` failures on this branch
  (`v0.5.7 per-hex rights: drag...` / `...Make offer...`) are **pre-existing**
  on the unmodified base commit too (reproduced via `git stash`) — unrelated
  to this change, not fixed here (out of scope for this pass; flagged below).
- Verified the full flow in a real headless Chromium (Playwright, the
  pre-installed browser) end to end: start screen → all 9 steps advance in
  order on real game-state changes → Finish → localStorage flag set → coach
  box hidden. Also verified Skip tutorial and the System-panel replay
  button. Screenshots confirmed the coach box reads cleanly against the
  existing beveled-panel retro aesthetic and doesn't collide with modals
  (it hides while a confirm modal is open).
- `node tools/smoke.js` (the deep Node-only sim test, unaffected by this
  change since it never loads `ui.js`) still passes 100% — full 1872–2028
  run on two seeds, final standings sane.

**Decided against.**
- A full click-locking/blocking tutorial (disabling everything but the
  "correct" next control) — rejected as too heavy-handed for a game whose
  whole appeal is open-ended tinkering; a player who ignores the coach mark
  and pokes around instead should still be able to.
- Auto-advancing "mode-track"/"mode-station"/"mode-line" *and* forcing the
  Build tab open every frame — only forces the tab once, on step-entry, so
  a player who tabs away mid-step isn't fought with; the coach box just
  re-centers and waits.
- Translating the tutorial copy — the codebase's i18n (`t()`) covers static
  chrome, but nearly all dynamic in-game text (event log lines, build
  confirmations, status-bar messages) is English-only already; tutorial
  text follows that existing precedent rather than being the first dynamic
  string to route through `t()`.

**Next iteration should look at:**
1. The two pre-existing `domsmoke.js` failures under "v0.5.7 per-hex
   trackage rights" (drag-select mousedown on a rival's own track, and the
   Make-offer negotiation dialog) — `js/world.js:2917` throws reading
   `st.hexes[key[0]].track.co` for an undefined company lookup. Worth a
   real fix; not touched here to keep this pass scoped to onboarding.
2. Focus-area #1 continues beyond this: the Build-panel wall of text /
   options (gauge, electrification, tunnel, double-track, platform length,
   bulk upgrades — all in one scroll) is still a lot for a brand-new player
   even after the tutorial gets them through their first line. A
   progressive-disclosure pass (hide advanced sections until the player has
   e.g. 2+ lines running) could follow naturally from this tutorial's
   step/gating pattern.
3. Focus-area #6's specific ask — a proper close-up/inspect view for a
   single hex with real density (buildings, terrain texture) instead of a
   bigger flat tile — is untouched and still open; it's a meaningfully
   different (rendering-heavy) scope from this pass.
4. Audio: not audited this pass. A future run should check the README's
   audio section against `assets/audio/manifest.js` for any still-missing
   BGM/SFX slots or maps borrowing another map's track (Charles III/Carolean
   London currently borrows the Reiwa Tokyo track per the manifest comment —
   worth a dedicated Carolean-era track at some point, low priority).
