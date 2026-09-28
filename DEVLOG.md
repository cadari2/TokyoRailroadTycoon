# Dev Log

Running notes for each automated iteration on Tokyo Railroad Tycoon: what
changed, why, what was deliberately left alone, and what the next pass
should look at. Newest entry on top.

---

## 2026-09-28 — New-player guided tutorial

**Context:** this is the first run of the standing "keep improving the
game" task, so there was no prior DEVLOG to read. Per the brief, the
top-ranked, most-flagged problem is user friendliness — test audiences
don't know what to do — so that's where this pass started. There was no
structured onboarding at all: a single status-bar welcome line at boot
("Buy land, lay track, and connect the city...") and a scattering of
`appendTip()` hint lines inside panels (gated by a "Show tutorial/tip
text" checkbox), but nothing that walks a first-time player through the
actual sequence of actions that makes a working, paying railway.

**What changed:** a short, skippable, state-driven tutorial
(`js/ui.js`: `TUTORIAL_STEPS`, `renderTutorial`, `startTutorial`,
`skipTutorial`) that floats in a small box over the top-left of the map
(`#tutorialBox` in `index.html` / `css/style.css`) so it never blocks
play. Seven steps: welcome/goal, lay track, build station A, build
station B, create a line, buy a train, wrap-up. Each actionable step
carries a `done(st, p)` predicate over real game state (track hexes laid
or queued, stations owned, a line with 2+ stops, a train on the roster)
and auto-advances the instant the player actually does the thing — it
never requires clicking through a modal to "confirm" progress, and it
can't get stuck if the player reaches the goal by a UI path the tutorial
didn't anticipate. It fires automatically exactly once per browser
(`localStorage["trt_tutorial_v1"]`), the first time a **new** game is
started (never on Continue/Load, since that's clearly a returning
player), and can be replayed anytime from System → Settings ("🎓 Replay
guided tutorial").

The welcome step and the wrap-up step both explicitly state the core
loop (track → riders → money → more/better track) and, deliberately,
lead with a warning against the paving-every-hex trap: "a few
well-placed lines that truly connect where people live to where they
work will always beat a dense tangle nobody rides." Given map density is
called out as one of the longest-standing problems, the very first thing
a new player reads about the game now frames sparse, deliberate networks
as the *winning* play, not just a purity option. This doesn't fix the
density problem mechanically, but it's a free, low-risk nudge worth
having regardless of whatever mechanical fix lands later — remove it if
a later pass wants the framing to live somewhere else instead.

**Verified:** `node --check` on the touched files; `tools/domsmoke.js`
(the DOM-stub playthrough) run to completion after the change — it
drives the real Build/Lines/Money panels and clicks through construction,
so it would surface a thrown error from `renderTutorial` being wired
into `renderPanel`. `tools/smoke.js` (headless sim-only) doesn't load
`ui.js` at all, so it's unaffected by this change; it was run anyway as
a baseline sanity check since no sim logic was touched.

**Considered and rejected:**
- *Blocking, modal-driven tutorial (click "Next" to proceed).* Rejected —
  it teaches players to click through prompts without doing the thing,
  which is exactly the failure mode a good tutorial avoids. State-driven
  auto-advance was more work but is the right shape.
- *DOM highlighting/pointing at the specific button to click* (an arrow
  or glow on the "Lay Track" mode button, etc.). Would be a nice
  polish pass, but wiring per-step target elements into every mode
  button touches a lot of `buildPanel()` for a first cut. Left as a
  clearly-labeled next step below.
- *Gating the tutorial on explicit land purchase before track.* The
  mechanics don't require it — laying track through unowned land already
  buys the parcel at the discounted corridor rate (`buildTrackHex`,
  v0.5.9). Teaching "buy land first" would have been actively wrong, so
  Buy Land is mentioned only in the wrap-up as an optional value-capture
  strategy, not a required step.

**Next steps for a future iteration:**
- Add visual highlighting of the specific button/mode a step wants
  (spotlight or pulsing border), not just text instructions.
- The tutorial currently only ever targets the Tokyo campaign's opening
  (it fires on whatever campaign is started first, which for a brand-new
  player is always Tokyo since the others are locked). Once map-identity
  work adds an overworld/region-select screen (see Focus Area #3), revisit
  whether the tutorial copy should branch by campaign.
- Audio gap, unrelated to this pass but worth flagging per the standing
  audio-focus item: NYC, Melbourne and Paris have no `CFG.BGM_*` table of
  their own — `bgmKey()` (`js/config.js`) falls through to Tokyo's
  Japanese-era keys (`meiji`/`taisho`/`showa1`/`showa2`/`heisei`/`reiwa`)
  for every non-Tokyo, non-London campaign, so e.g. NYC's "Gilded Age"
  plays `meiji.mp3`. London already has its own reign-keyed table
  (`CFG.BGM_LONDON`); NYC/Melbourne/Paris don't have period-appropriate
  BGM files yet either, so this needs both new tracks and a
  `CFG.BGM_NYC`/`CFG.BGM_MELB`/`CFG.BGM_PARIS` table plus a `bgmKey()`
  branch, mirroring the London pattern.
- The close-up hex/station inspect view (Focus Area #6) is still the
  under-built screen the brief calls out — worth a dedicated pass.
