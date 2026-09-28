# Dev Log

This file is the running handoff between automated iterations of this
project. Each entry: what changed, why, what was considered and rejected,
and what the next iteration should look at.

---

## 2026-09-28 — New Railroad Guide (v0.5.9.3)

**Context.** This is the first entry in this file — it didn't exist before
this run. Repo state at the start: v0.5.9.2 on `main`, 158 commits deep, a
mature single-page canvas game (Tokyo/London/NYC/Melbourne/Paris
campaigns) with two headless test harnesses (`tools/smoke.js`,
`tools/domsmoke.js`) but no `package.json`/CI wiring — they're run by hand
with `node`.

**What I did.** Per the standing brief's #1 priority ("test audiences don't
know what to do"), added a **New Railroad Guide**: a small checklist
(`js/ui.js: renderNewPlayerGuide`/`guideSteps`) rendered at the top of
*every* side-panel tab, tracking six concrete steps — buy land, lay track,
build a station, create a line, buy a train, carry your first
passengers — each derived live from real game state (`p.land`,
`h.track.co`, `st.stations`, `st.lines`, `st.trains`, `p.stats.pax`), never
from a separate "did they do the tutorial" flag that could desync from
what actually happened. The current step shows a one-line hint and a "Show
me" button that jumps to the right tab/tool mode. A "Hide" button (and
auto-hide once every step is done) dismisses it, remembered per-browser via
`localStorage` (`trt_guide_dismissed`) so it never reappears once a player
has actually learned the loop — same pattern the campaign-unlock code
already uses for `trt_completions`. It also respects the existing "Show
tutorial/tip text" setting (`ui.showTips`), so a player who's already
turned tips off doesn't get a big new box anyway.

Bumped `CFG.VERSION` to 0.5.9.3 and added a README changelog entry.

**Why this shape, not something bigger.** A blocking modal wizard
("click here, now click here") would fight the sandbox-y, at-your-own-pace
feel that's core to this genre (SimCity/OpenTTD don't force-walk you either
past the first minute) and would need to special-case every tab/mode
transition. A persistent, state-derived checklist gets the same "what do I
do first" answer without taking over the screen, degrades gracefully if a
player ignores it, and can't get out of sync with what's actually on the
map — it's just reading `st`, not a scripted sequence.

**What I decided against.**
- *Highlighting/pulsing the actual UI element* (e.g. glowing the "Buy Land"
  button) — more discoverable, but touching the render loop for every
  affected control was a much bigger, riskier diff for one iteration.
  Worth doing as a follow-up if the plain checklist doesn't move the
  needle.
- *Persisting guide progress in the save schema* — steps are cheap to
  recompute from live state every render (a few `.some()` scans over
  arrays that are already small in the early game), so there's no state to
  serialize. Keeps this change out of `save.js`/the save-version bump
  entirely.
- *A full onboarding campaign/scenario* (a scripted "Meiji Starter" mini
  map) — real depth, but a much larger scope than "one well-scoped
  improvement," and overlaps with focus area #3 (map variety) more than
  #1. Flagging for a future run.

**Verified.** `node tools/smoke.js` (full 1872–2028 run, all checks) and
`node tools/domsmoke.js` (boots the full game against a DOM stub, clicks
through every tab/mode) both pass at the same rate as before my change —
**2 pre-existing `domsmoke` failures** (`v0.5.7 per-hex rights: drag along
connected track...` and `...Make offer opens a negotiation dialog...`,
both in the trackage-rights selection flow, `js/world.js:2917` throws on
`st.hexes[key[0]].track` being null) reproduce identically on a clean
stash of `HEAD` with none of this run's changes applied — they predate
this iteration and are **not** something I introduced. Left unfixed since
they're in an unrelated system (per-hex trackage-rights negotiation, not
onboarding); flagging for whichever iteration next touches `world.js`
trackage rights or `domsmoke.js`'s drag-selection test.

**For the next iteration.**
1. **Fix the pre-existing `domsmoke` failure** in per-hex trackage-rights
   drag-selection / Make-offer flow (`js/world.js` ~line 2917,
   `st.hexes[key[0]].track.co` — `track` can apparently be null there in
   the test's rival-track scenario; `tools/domsmoke.js` ~line 759). Two
   real FAILs sitting in the test output is easy to start ignoring as
   "always red" — worth silencing properly.
2. **Onboarding, round 2**: if playtesting still shows people missing the
   guide, escalate from "checklist" to "highlight the live button/mode for
   the current step" (see rejected option above).
3. **Density/sparse-play problem** (the standing "pave every hex" issue)
   is still completely untouched — the brief's other headline ask. No
   design attempted yet this run; next iteration with spare scope should
   take a swing at it specifically (e.g. rewarding station spacing/transfer
   efficiency over raw track coverage, or a maintenance/upkeep cost curve
   that punishes redundant parallel track harder than it currently does).
4. **Hex inspect/close-up view** (focus area #6) is still the flat,
   under-filled view described in the brief — a good next art pass once a
   gameplay iteration isn't mid-flight.
5. No `package.json`/CI exists — `tools/smoke.js` alone takes ~10 CPU
   minutes in this sandbox (a full 1872–2028 sim run several times over
   plus various sub-scenarios). If this repo ever gets CI, that runtime
   should be budgeted for or split up.
