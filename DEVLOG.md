# Dev Log

Running notes from each automated iteration: what changed, why, what was
deliberately skipped, and what the next pass should look at. Read this before
starting new work — don't repeat or contradict what's here without a reason.

## Core mission (keep every change honest against this)

Good public transit drives demand; demand drives population and money;
growth funds more well-connected transit. That feedback loop is the game's
charm. Nothing should dilute it — least of all "solutions" that make paving
every hex with rail the efficient play. Sparse, deliberate networks should be
the rewarding style; that's still an open problem (see Backlog below).

---

## 2026-09-28 — First-time onboarding checklist

**Context:** no DEVLOG existed yet, so this entry starts the log. Read
through `README.md` and recent git history (through v0.5.9.2 — trackage
rights, through-service agreements, achievements, the Paris campaign,
tunnels) instead. The game's mechanical depth is already substantial; the
repeatedly-flagged test-audience problem is that new players don't know what
to do at the very start. That's focus area #1 in the standing brief, so this
iteration targeted it directly with one well-scoped feature rather than
spreading across areas.

**What was there already:** a single status-bar sentence on game start
("Buy land, lay track, and connect the city…"), per-mode status hints when
switching Build tools, and a `showTips` setting that gates verbose inline
tips throughout the side panel (`appendTip` in `js/ui.js`). None of it forms
a sequence a new player can follow — everything is passive text that's easy
to miss or scroll past, and there was no way to tell "have I actually done
the thing yet."

**What changed:** a small "GETTING STARTED" checklist overlay
(`#tutorial` in `index.html`, styled in `css/style.css`) floats over the map
canvas for a new game. It lists the core loop as six steps — lay track,
build a station, build a second station, create a line, buy a train, unpause
and watch riders board — and checks each one off by reading real game state
(`js/ui.js`: `TUTORIAL_STEPS`, `updateTutorial`), not a scripted click
sequence. That was a deliberate choice: a state-driven checklist can't get
out of sync with what the player actually did, can't block input, and
degrades gracefully if a player does things out of the "expected" order
(e.g. builds both stations before making a line — the checklist just ticks
off whichever steps are actually true). The current step is highlighted;
completed ones show a check and strike through. It auto-hides once every
step is done, respects the existing `showTips` toggle, and can be dismissed
early with its own close button — dismissal persists in `localStorage`
(`trt_tutorial_dismissed`, same convention as the campaign-unlock flags), and
a link in System settings ("Show \"Getting Started\" checklist again") brings
it back if a player closes it by accident. It refreshes from the existing
per-frame `renderTopbar` call and only touches the DOM when its own
completion signature changes, so it costs effectively nothing once shown.

**Considered and rejected:**
- A modal/wizard that walks the player through each action with forced
  clicks. Rejected — it would block the camera/canvas, fight the existing
  mode-based tool system, and desync the moment a player deviates from the
  script (e.g. builds a depot first). A passive, state-driven checklist gets
  the same teaching value without any of that fragility.
- Bumping the README version header for this change. Skipped to keep this
  pass scoped to the one feature; a version bump reads oddly attached to a
  UI-only addition with no save-schema or balance impact.

**Tests:** `node tools/smoke.js` — ALL CHECKS PASSED, unaffected by this
change (it never loads `ui.js`). `node tools/domsmoke.js` was extended with
the three new DOM ids — `tutorial`, `tutorialClose`, `tutorialBody` — so the
new overlay is actually exercised by the headless DOM harness instead of
silently no-op'ing on `getElementById` returning null; every step touching
it (and every other step) passes. Both scripts are slow in this sandbox
(each does a full 1872–2028 fast-forward) — expect ~10+ minutes per run here;
that's pre-existing and unrelated to this change.

`domsmoke.js` does end with 2 pre-existing failures, confirmed present on
`HEAD~1` too (ran it in a scratch worktree before committing, byte-identical
failures) — **not caused by this change**, left as-is to keep this pass
scoped to onboarding:
- `v0.5.7 per-hex rights: drag along connected track selects hexes…` —
  `mousedown` on the synthetic rival hex at `tools/domsmoke.js:759` doesn't
  start the selection. The test computes screen coordinates from
  `hexCenterIdx` + `renderer.cam` assuming the camera hasn't moved since an
  earlier step; several steps before this one start fresh games or fast-
  forward years, any of which can pan/reset `cam` without this test
  re-reading it. Likely a test-ordering bug (stale coordinates), not a real
  picking regression — but worth confirming against the `pickHex` stale-size
  guard from v0.5.9.1 before assuming that.
- `v0.5.7 per-hex rights: Make offer…` — cascades from the first failure
  (`world.js:2917` throws on `st.hexes[key[0]].track.co` because `key[0]`'s
  hex has no track — the selection the first test failed to build).
  Fixing the first failure likely fixes this one for free.

**Next iteration should look at:**
- **The 2 pre-existing `domsmoke.js` failures above** — quick, well-scoped,
  and worth clearing before they mask a real regression: fix the stale
  camera-coordinate assumption in the trackage-rights drag-select test (or
  the underlying picking issue, if it turns out to be one), which should
  clear the cascaded "Make offer" failure too.
- **Map density / sparse-network incentive** (the standing hardest problem):
  still unsolved. No progress made this round — it needs real design
  exploration (interchange bonuses? maintenance costs that scale worse than
  linearly with total track? land-value capture tuned so *fewer, better*
  stations outearn blanket coverage?), not a quick mechanical tweak.
- The onboarding checklist only covers the *very* first loop (one line, one
  train). A natural follow-up: a second-tier checklist or milestone banner
  for early-game growth moves (double-track a busy corridor, buy a second
  train, start a second line, take your first rival's trackage rights) that
  only appears after the first checklist completes — same state-driven
  pattern, higher-level goals.
- The close-up/inspect single-hex view (focus area #6 in the brief) is still
  the sparse, under-filled placeholder described in the brief — a good next
  pick since it also serves onboarding (it's where a new player decides what
  to place) and map identity (regional detail).
- **Audio gap, verified this round:** `bgmKey()` in `js/config.js` (line
  ~1296) is explicit — "every other campaign follows the Japanese era."
  London gets its own monarch-keyed BGM table (`CFG.BGM_LONDON`), but **New
  York, Melbourne, and Paris all play the Tokyo/Meiji-Taisho-Shōwa BGM
  tracks** (`assets/audio/bgm/` only has Japanese-era and British-monarch
  files — no Gilded-Age/Fiscal-Crisis/Revival cues for NYC, no
  Marvellous-Melbourne/Land-Bust/Federation cues for Melbourne, no
  Belle-Époque cue for Paris, despite the README describing those eras by
  name). This is real scope, not a quick fix — it's 3 campaigns × ~2-3 era
  tracks needing period-appropriate placeholder BGM plus a `CFG.BGM_NYC` /
  `CFG.BGM_MELBOURNE` / `CFG.BGM_PARIS` table each and a `bgmKey()` branch
  per campaign (mirroring the London pattern). Good candidate for a
  dedicated future iteration rather than folding into an unrelated pass.
