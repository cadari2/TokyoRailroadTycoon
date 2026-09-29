# DEVLOG

## 2026-09-29 — First-steps objective card (onboarding)
- Added `firstStepsCard` (js/ui.js): a checklist at the top of the side panel
  walking new players through the core loop — Demand map → 2 stations → track
  → line → train → first fares. Steps are derived from game state and latch;
  the card hides when finished, via "Hide", or when "Show tutorial/tip text"
  is off. Demand button now sets `ui.usedDemand`.
- Decided against: modal/forced tutorial (blocks veterans), and any
  density-related mechanic this run (onboarding was the top-flagged issue).
- Note: no DEVLOG existed before; earlier history is in README/docs/PLAN-*.
- Next: highlight the target tab/button for the current step; per-map
  starter goals; hex close-up inspect view (focus area #6); density
  incentives (sparse networks are still not the rewarded style); audio gaps
  not yet audited.
- Known pre-existing failures in tools/domsmoke.js (fail on baseline too): the
  two v0.5.7 per-hex-rights tests (rival-track mousedown / world.js:2917).
