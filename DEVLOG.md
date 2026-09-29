# DEVLOG

## 2026-09-29 — "First Steps" guide card (user friendliness)
- Created this log (none existed). Tests: `node tools/smoke.js`, `node tools/domsmoke.js` (both pass; smoke takes >2 min).
- Added a live **First Steps** checklist card atop every side panel (`guideCard` in js/ui.js). Steps are derived from game state (track → 2 stations → line → train → first riders), so it works on loaded saves, highlights the current step, and has a button that switches to the right tool. Vanishes when complete, on "Hide guide", or when "Show tutorial/tip text" is off. UI-only; no save-schema change.
- Decided against: a modal walkthrough (interrupts, players skip it) and any mechanics change.
- Next: a first-run scenario hint that points at a good starting hex (highest demand near the land grant); teach *why* sparse networks win (the density problem is still open); a region-select overworld; hex close-up view (focus area 6). Audio: not reviewed this run — check whether Paris/Melbourne still borrow other maps' BGM.
