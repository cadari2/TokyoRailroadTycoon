# DEVLOG

## 2026-09-28 — First-steps guide (onboarding)
- **Did:** added a "First steps" checklist card (js/ui.js `guideSteps`/`guideCard`) above the panel tabs. Six steps (track → two stations → line → train → first fares → third stop) auto-detect from game state, latch when done, and can be hidden or disabled via the Settings tips toggle. Copy frames the core loop (fares fund growth) and nudges toward dense demand hubs and a few good links instead of blanket rail.
- **Decided against:** a modal/forced tutorial (interrupts experienced players) and touching density mechanics in the same run.
- **Tested:** tools/domsmoke.js passes; tools/smoke.js takes >2 min here, not re-run (no sim changes).
- **Next:** guide steps could highlight target buttons/hexes on the map; persist guide state in saves; density incentive (e.g. per-hex upkeep or catchment overlap penalty) still open; hex close-up view untouched; audio not audited (no DEVLOG history existed).
