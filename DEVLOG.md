# Dev Log

Running notes from each automated iteration: what changed, why, what was
considered and rejected, and what the next pass should look at. Newest
entries at the bottom.

## 2026-09-28 — First-time walkthrough (v0.5.9.3)

**Why:** the brief for these runs flags user friendliness — specifically
onboarding — as the most-flagged problem with test audiences ("they don't
know what to do"). This repo had no DEVLOG yet, so this is effectively the
first logged iteration; I read the README and skimmed recent history
(v0.5.6 → v0.5.9.2: campaigns, achievements, trackage rights, tunnels,
Paris) before picking a focus.

Confirmed the gap by reading `js/ui.js`: contextual tips exist (`appendTip`,
gated by a "Show tutorial/tip text" setting) but they're passive prose
scattered inside panels the player has to already know to open. Nothing
proactively walks a new player through the founding actions — buy/hold
land, lay track, build two stations, create a line, buy a train — which is
exactly the sequence a first session needs before anything else in the game
makes sense.

**What I built:** a short, skippable step-by-step walkthrough
(`js/ui.js`, "First-time walkthrough" section):
- Activates automatically the moment a brand-new game starts (hooked into
  `buildStartScreen`'s `startNewGame`), unless the player has already
  seen or skipped one (`localStorage["trt_tutorial_seen"]`).
- A floating card (`#tutorialBox`, bottom-left, doesn't block the map)
  shows one step at a time: a title, one or two sentences of instruction,
  and Back/Next/Skip buttons.
- Each step highlights the exact button that does the thing (a pulsing
  glow — `.tutorial-glow`), found live by tab key or by button label text
  so it always matches the current DOM rather than a stale reference.
- Steps auto-advance the moment the player actually does the thing —
  ≥2 track hexes, 1st station, 2nd station, 1st line, 1st train — checked
  against real game state (`companyTrackHexes`, `st.stations`, etc.), not
  just clicks. A player who plays ahead of the text never feels stuck
  waiting on a "Next" click; a player who wants to read first can still
  click through at their own pace.
- "System → Settings" gained a **Replay walkthrough** button so it's never
  permanently gone.
- Deliberately excludes "buy land" as a mandatory step: every starting
  class already holds a founding land grant, so telling a player to buy
  land first would contradict what's actually on their map.

**Considered and rejected:**
- *A full modal wizard blocking the map* — rejected: it would hide the very
  thing being explained (the map/hexes) and can't auto-advance from real
  actions the way a floating, non-blocking card can.
- *Fully localizing the walkthrough text (ja)* — the existing i18n table
  explicitly scopes "deep panel prose" to English-only for now (see
  `data/i18n.js` header); the walkthrough follows that same convention
  rather than half-translating one more surface. Worth doing once someone
  does a real i18n pass over tips generally.
- *Teaching demand/finance concepts in the walkthrough* — kept the scope to
  the mechanical founding sequence only. Deeper strategy (why sparse,
  focused lines beat paving every hex) is one closing sentence, not a
  lesson; a fuller "how to actually win" tutorial is a separate, larger
  piece of work.

**Testing:** `node tools/smoke.js` (headless economy/logic, no UI) — 0
failures, unaffected since it never loads `js/ui.js`.
`node tools/domsmoke.js` (boots the full game incl. UI against a DOM stub)
— 2 failures, but I confirmed both are **pre-existing**: they reproduce
identically on the base commit with my changes stashed out. Logged below
as a flag, not fixed here (out of scope for this pass, and I'd rather not
touch trackage-rights code same-day as an unrelated UI feature).

**Flag for next iteration — pre-existing domsmoke failures (v0.5.7
trackage-rights tests), unrelated to this change:**
- `v0.5.7 per-hex rights: drag along connected track selects hexes…` fails
  at `mousedown on the rival's own track should start the selection`
  (`tools/domsmoke.js:759`) — the synthetic screen-space click computed via
  `hexCenterIdx` + the current camera transform doesn't resolve back to the
  intended hex through `pickHex`, so the click starts empty-handed.
- The very next test, `Make offer opens a negotiation dialog…`, then fails
  downstream in `js/world.js:2917` (`st.companies[st.hexes[key[0]].track.co]`)
  because the prior test left `hexRightsSel` empty/invalid.
- Worth checking whether this is a real regression in hex picking/camera
  math (would matter for players too) or just a stale fixture in the test
  (camera position assumption no longer matches map generation/defaults).
  I did not chase this further this pass — recommend it as a focused
  bugfix iteration under "simulation bugs and loose ends."

**Other candidates I looked at but didn't start** (still valid next steps,
per the brief's priority order):
- The close-up/inspect hex view is still the flat, sparse render described
  in the brief — a good-sized, self-contained art/presentation project for
  a dedicated pass rather than something to bolt onto a UI-onboarding run.
- No overworld/region-select map yet; campaigns are still picked from a
  plain list on the start screen.
- Audio: didn't audit this pass; still flagged from the brief as unchecked
  (which maps, if any, still borrow another map's track).
