# DEVLOG

## 2026-09-29 — First-steps coach (onboarding)
- Added a "🚉 First steps" checklist card at the top of the side panel (`firstStepsCard` in js/ui.js). Five steps (lay track → 2 stations → line → train → first riders), each derived from live game state so it works after load. Current step is highlighted with where-to-click guidance; the card dismisses itself once complete or via ✕; respects the "Show tutorial/tip text" setting. Its footer nudges toward few well-placed stations (supports the sparse-network goal).
- Decided against a modal/scripted tutorial: state-derived checklist can't desync and doesn't block play.
- Next: highlight the relevant Build-mode button for the current step; a follow-up "grow" phase (second line, transfers, R&D); coach dismissal (`ui.coachDone`) is not saved across reloads; step text is English-only (no i18n yet). Map-density problem, hex close-up view, and per-map BGM audit remain untouched.
- Audio: not audited this run.

## 2026-09-29 — Rail-density blight (anti-carpeting)
- New `CFG.LAND.railBlight` + `railBlightMult(st, idx)` (js/map.js). A hex with more than 2 track-bearing neighbours has its pop/attraction discounted in `computeCatchments` (−14% per extra neighbour, floor 40%) and grows slower in `monthlyGrowth`. A single line or station-with-spur is untouched; a paved-over block becomes a yard whose surroundings are worth less to every station. Complements per-km maintenance (which punishes cost) by punishing *demand* — the loop's actual currency — so a spine with room to breathe out-earns a grid.
- Doesn't contradict v0.5.8 F7 (tracks don't sterilise their own district): the penalty only bites from ≥3 track neighbours.
- Decided against a flat per-hex tax (already have maintenance) and against blocking adjacent track (feels arbitrary).
- Next: surface it in the UI (hex inspector line "hemmed in by rail: −x% demand", maybe a tint overlay); tune `perNbr` with tools/balance.js; check AI builders don't stumble into it; hex close-up view, map BGM audit still untouched. Smoke test takes >2 min here.
