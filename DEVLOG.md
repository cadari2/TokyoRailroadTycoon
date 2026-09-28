# Dev Log

Running notes from the automated iteration passes on Tokyo Railroad Tycoon.
Each entry: what changed, what was decided against and why, and what the
next pass should look at.

This file didn't exist before this entry — there is no prior iteration
history to summarize, so this run relied on the git log and README
changelog for context instead.

---

## 2026-09-28 — First-run "How to Play" guide (v0.5.9.3)

**Why:** the routine brief for this project names user friendliness as the
most-flagged problem with test audiences ("they don't know what to do"),
ahead of simulation bugs, map variety, depth, progression, art, and audio.
Before this change the game had zero onboarding: the start screen dropped a
new player straight onto the map with one status-bar line ("Buy land, lay
track, and connect the city...") and left them to discover the Build tab,
the Demand heatmap, and the Lines panel on their own. Scattered `appendTip`
lines exist throughout the side panels, but nothing explains the *goal* or
the core feedback loop up front.

**What changed:**
- A short, skippable "How to Play" modal (`showTutorialModal` in `js/ui.js`)
  auto-opens the first time a player starts *any* game (any campaign),
  gated on a `trt_tutorial_seen_v1` localStorage flag so it never repeats
  uninvited. It covers, in five short sections: the core loop (ridership →
  fares → more track/land → more reach → more demand → more population →
  repeat), where to click first (Build → lay track → Create Line), the
  Demand heatmap as a "find demand before you build" tool, and — the one
  I leaned on hardest — a plain-language explanation of why a few well-aimed
  lines beat paving every hex (idle track still costs upkeep; a company's
  own overlapping lines split their own riders). This directly targets the
  standing map-density problem called out in the brief: it's a teaching
  intervention rather than a mechanical one, since the brief asks for ways
  to make sparse play *rewarding*, and the fastest lever available in one
  pass was making sure players know that from minute one instead of
  learning it the hard way over a full playthrough.
- A new **❓ Help** button in the top bar (and a matching "How to Play"
  button in System ▸ Settings) reopens the same modal on demand, so it's
  not a one-shot the player can lose track of.
- Fully bilingual (EN/JA), following the existing `data/i18n.js` pattern
  used by the start screen.
- `tools/domsmoke.js` DOM stub updated with the new `helpBtn` id.
- Bumped `CFG.VERSION` to 0.5.9.3 and added a README changelog entry,
  matching this repo's existing convention of a version bump per feature
  pass.

**Decided against, and why:**
- A multi-step wizard (Next/Back through separate screens) — the existing
  `openModal` helper closes on any button press, so a stepper would need
  its own state machine. A single scrollable modal (max-height 80vh,
  already styled for the Achievements modal) covers the same content with
  far less new plumbing, and five short sections comfortably fit.
- An in-game objectives/checklist system ("build your first line to
  continue") — that's a bigger, riskier change (needs new persistent
  state, UI, and interacts with existing tip/status-bar messaging) and
  risks nagging returning players. A future pass could build this *on top*
  of the guide added here, but it didn't fit "one well-scoped change."
  worth watching whether test audiences still get lost after this lands.
- Changing the actual density/upkeep economy (e.g. penalizing overlapping
  coverage harder, or rewarding sparse networks mechanically) — the brief
  explicitly separates "teach it" from "genuinely novel mechanics that make
  sparse play more rewarding"; the latter is a bigger design question
  (see "Next" below) that deserves its own focused pass, not a rider on an
  onboarding change.

**Verification:**
- `node tools/smoke.js` — full headless economy run, PASS (this change
  touches no files smoke.js loads: config/util/map/world/sim/hr/ai/events/
  rd/save/main — it's UI-only).
- `node tools/domsmoke.js` — ran once on this branch's HEAD before the
  change (`git stash` back to base) and once after: **identical** result
  both times — all tests pass except two pre-existing failures in the
  v0.5.7 per-hex trackage-rights drag-select/negotiation flow
  (`domsmoke.js:759`, `js/world.js:2917`), unrelated to this change. Not
  fixed here to keep this pass scoped to onboarding; flagging for a future
  "simulation bugs" pass (see Next).

**Next steps for a future iteration:**
1. **Bug, not mine to fix this pass:** `tools/domsmoke.js` fails two
   pre-existing per-hex trackage-rights tests: (a) "drag along connected
   track selects hexes" — mousedown on a rival's own track doesn't start
   the selection (`domsmoke.js:759`); (b) "Make offer opens a negotiation
   dialog" throws inside `js/world.js:2917`
   (`st.companies[st.hexes[key[0]].track.co]` — looks like an
   undefined/stale company index, worth checking whether `track.co` can
   point at a company that no longer exists, e.g. after a rival goes
   bankrupt). Both predate this pass (confirmed via `git stash`); next
   simulation-bugs pass should pick these up first.
2. **The real density fix is still open.** This pass taught players not
   to pave every hex; it didn't change the underlying incentive. Ideas
   worth exploring next: an achievement or scoring bonus for high
   farebox-per-track-hex efficiency (reward sparse networks, not just
   flag dense ones as suboptimal in a tooltip); a "network efficiency"
   stat surfaced prominently (not buried in Finance) so players get
   ongoing feedback, not just a one-time warning; or land/upkeep costs
   that scale worse with adjacent-owned-track density specifically (so
   redundant local coverage is measurably worse, not just "your own
   lines split riders" which is already true but maybe not felt strongly
   enough early on).
3. **Onboarding checklist**, deferred above — a lightweight "first line
   built ✓ / first train running ✓" nudge sequence, separate from this
   modal, would close the loop between "being told what to do" and
   "confirming you did it."
4. Audio: not investigated this pass — a future pass should check for
   missing BGM/SFX or maps still borrowing another map's track, per the
   brief's audio focus area.
