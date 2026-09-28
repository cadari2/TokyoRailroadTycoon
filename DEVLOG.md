# Dev Log

Running log of automated iteration passes on Tokyo Railroad Tycoon. Each
entry: what changed, why, what was deliberately skipped, and what the next
pass should look at. Read this before starting new work — don't repeat or
contradict a recent decision without a clear reason.

Core mission to hold every change against: good public transit drives
demand; demand drives population and money; that growth funds more
well-connected transit. Don't add or "fix" anything that dilutes that loop.
The standing hard problem: the "efficient" play is paving every hex with
rail, which kills realism and fun — sparse, deliberate networks should be
the rewarded style. No entry below has cracked that yet; it's still open.

---

## 2026-09-28 — First-run "Getting Started" checklist (v0.5.9.3)

**What:** Added a small, self-checking onboarding panel (`js/ui.js`:
`onboardingChecklist`) that appears above the tab content on every screen
until dismissed. Six steps mirror the minimum path to a running, earning
railway — buy land → lay track → build a station → create a line → buy a
train → carry your first riders — each read directly off live game state
(`p.land`, `h.track.co`, `st.stations`, `st.lines`, `st.trains`,
`p.stats.pax`), so nothing is double-tracked as separate onboarding state
and a class's starting land grant can already satisfy step 1. Each
incomplete step's row has a "Show me" button that switches to the right
Build mode (or the Lines tab) and posts the same status-bar hint the
existing mode buttons use, so it teaches the existing UI rather than
introducing a parallel one. The whole panel respects the existing
"Show tutorial/tip text" setting, hides itself for good (this game and all
future ones, via `localStorage`) once every step is done, and offers an
explicit ✕ dismiss for players who already know the game.

**Why this, now:** the scheduled brief's own framing is that user
friendliness is the most-flagged problem with test audiences — "they don't
know what to do" — and it was the first item with no code addressing it at
all. The game already had scattered contextual tips (`appendTip`, gated on
`ui.showTips`) and a per-hex text inspector, but nothing that told a
brand-new player the *sequence*: buy → track → station → line → train →
ride. RollerCoaster Tycoon/OpenTTD/Civ all open new players with a short,
concrete checklist rather than a wall of tooltips; this borrows that shape
without adding a scripted/forced tutorial mode, so it never gets in an
experienced player's way and never blocks free play.

**Decided against:**
- A forced, modal, step-by-step tutorial (can't skip, can't experiment) —
  rejected because it fights the sandbox nature of the game and because the
  brief explicitly favors organic feedback over gating.
- A separate "tutorial mode" flag/save field — rejected; deriving every
  step from existing state means it can never drift out of sync with what
  the player actually did, and it needed no save-schema bump (`SAVE_VERSION`
  unchanged).
- Persisting the checklist's dismissed/open state in the save file — `G.ui`
  is already never serialized (confirmed in `save.js`), and localStorage is
  the right layer for "has this browser's player ever finished onboarding,"
  matching the existing `trt_completions`/`trt_unlocked` pattern.
- A full scripted tour of every panel (R&D, Workforce, Rivals, financing) —
  scoped down to just the steps that get a first game's first train running;
  those other systems only matter once the player already understands the
  core loop, and cramming them in would recreate the "wall of tooltips"
  problem this is meant to fix.

**Next iteration should look at:**
- User friendliness remains the top-priority focus area even after this —
  this pass only covers the *first* few minutes. A second-tier prompt once
  the player has a working line (e.g., "your line is profitable — try a
  second one," or a nudge toward R&D/double-tracking once traffic saturates
  a corridor) would extend the same idea into the early-midgame, where
  playtesters likely also stall.
- The map-density problem (CORE MISSION) is untouched by this pass and is
  still the single most valuable unsolved design question in the repo —
  next pass should treat it as a priority even before more friendliness
  work, if a genuinely new angle on it turns up.
- Audio: `bgmKey()` in `js/config.js` only branches Tokyo vs. London (the
  London monarch-reign table `CFG.BGM_LONDON`); New York, Melbourne and
  Paris all fall through to `eraOf(year).key` and therefore play **Tokyo's**
  Japanese-era tracks (meiji/taisho/showa/heisei/reiwa) for their entire
  run — none of those three campaigns has its own BGM schedule or files.
  This is a real, unflagged instance of "a map still borrowing another
  map's track" per the brief's audio focus area. Composing/sourcing three
  more BGM tracks per era-equivalent is a substantial content task on its
  own and wasn't attempted here — flagging it explicitly so a future pass
  (or the maintainer) can prioritize it rather than rediscovering it.
- The hex close-up/inspect view called out in the brief (art/presentation
  focus area) is still just the top-down tile at higher canvas zoom plus the
  text-based `selectionBox` panel — there is no dedicated denser rendering
  for a single selected hex yet. This is a good, well-scoped next target for
  a presentation-focused pass; it's independent of this onboarding work.
