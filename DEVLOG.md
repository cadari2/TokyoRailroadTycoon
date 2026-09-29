# DEVLOG

Newest entries last. Each iteration: what was done, what was rejected, what to look at next.

## 2026-09-29 — First Steps onboarding checklist
- **Did**: added a "First steps" card atop the side panel (`onboardingCard` in js/ui.js). Six steps — buy land, lay track, build two stations, create a line, buy a train, carry passengers — computed from live game state (no saved flags, so it works on loaded saves and can't desync). Only the current step shows its how-to; finished steps strike through; ✕ dismisses; it hides itself when complete or when "Show tutorial/tip text" is off.
- **Decided against**: modal/blocking tutorials (interrupts experienced players) and a scripted tutorial map (bigger scope). Kept the copy nudging toward sparse routes ("sparse, deliberate routes beat paving everything").
- **Next**: highlight the relevant map hex / tab button for the current step; a post-checklist "grow" nudge (demand → population → funds loop) ; region-select overworld; inspect-view density for a station hex.
- **Audio gaps**: not audited this run — check assets/audio/manifest.js for maps borrowing another map's BGM.
- **Tests**: tools/domsmoke.js passes (no FAIL). tools/smoke.js is slow (>2 min); not re-run to completion.
