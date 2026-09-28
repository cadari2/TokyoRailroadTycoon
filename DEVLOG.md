# DEVLOG

Iteration log for scheduled improvement runs. Newest entries at the bottom.

## 2026-09-28 — Guided onboarding coach (focus area 1: user friendliness)
- **Did:** added a green "🎓 Step n/5" coach bar under the news ticker. It derives the
  player's next step purely from state (lay track → 2 stations → create line → buy train →
  first riders), so it survives save/load and can't get stuck. A button jumps to the right
  tool (`setBuildMode`, extracted from the Build panel's inline closure so both share it).
  Dismiss with ✕ or Settings' "Show tutorial/tip text" toggle. Step 2 nudges "about 2 hexes
  apart" to seed the sparse-network idea from the start.
- **Tests:** `tools/smoke.js` all PASS. `tools/domsmoke.js` has 2 pre-existing failures
  (per-hex trackage rights drag test), identical with and without this change. Both suites are slow (>2 min).
- **Decided against:** a modal step-by-step tutorial (interrupts play; a passive bar is
  gentler and re-derives from state); tracking steps in save data (schema bump for no gain).
- **Next:** fix the 2 domsmoke failures; no coach UI test yet; the coach ends after first
  riders — a mid-game follow-up (why is a station empty? demand overlay hint) would help.
  Map-density problem untouched: idea to explore is upkeep/land-cost scaling with rail
  hexes per served station, so long empty stretches and parallel duplicates cost more.
  Audio: not audited this run; Paris/others may still borrow tracks — check js/audio.js.
