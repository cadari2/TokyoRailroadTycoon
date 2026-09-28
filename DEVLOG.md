# DEVLOG

Newest entries last. Each entry: what changed, what was rejected, what's next.

## 2026-09-28 — Onboarding coach banner
- **Did**: added a green "NEXT n/6" banner (`#coach`, `renderCoach`/`coachStep` in js/ui.js)
  that derives the player's next step purely from game state (land → track → 2 stations →
  line → train → wait for riders). Stateless, so it works across save/load; honors the
  "Show tutorial/tip text" setting and has a "hide" button. Step 2 text plants the
  "sparse, direct routes beat rail everywhere" idea early.
- **Rejected**: a modal step-by-step tutorial (interrupts play; OpenTTD/SimCity teach via
  persistent hints instead); persisting progress flags (state-derived is more robust).
- **Known**: `tools/domsmoke.js` has 2 pre-existing failures (v0.5.7 per-hex rights drag
  tests with rival track) — present before this change. smoke.js takes >2 min.
- **Next**: highlight the relevant Build-mode button per coach step; a density lesson
  step after the first line (e.g. nudge when track hexes >> station count / low pax per
  track hex); audio still unaudited (check assets/audio/manifest.js for maps borrowing
  another map's BGM); close-up hex inspect view remains the big art opportunity.
