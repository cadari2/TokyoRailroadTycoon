# DEVLOG

Iteration notes for the scheduled improvement runs. Newest last.

## 2026-09-29 — First-steps coach bar (focus: user friendliness)
- **What**: added `#coach`, a slim bar under the news ticker naming the single
  next step for a new player (buy land → lay track → 2 stations → line →
  train → first fares → third station). Steps are derived from live state
  (`COACH_STEPS` in `js/ui.js`), so it self-advances, works on loaded games,
  and disappears once all steps are done. "Hide" dismisses it; the existing
  "Show tutorial/tip text" checkbox in System also turns it off.
- The last two steps nudge toward the core loop and sparse networks
  ("link demand hotspots directly rather than paving the map").
- **Decided against**: modal/blocking tutorial (interrupts play; testers skip
  them) and a scripted tutorial map (bigger scope).
- **Not verified**: rendering in a real browser (only the Node stub smoke).
- **Next**: highlight the relevant tab/button for the current step; per-map
  step text (e.g. real region names); hex close-up inspect view; density
  incentives (still unsolved — consider diminishing returns on redundant
  parallel track within N hexes of an existing line). Audio: no gaps audited
  this run.
