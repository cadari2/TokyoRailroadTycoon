# DEVLOG

## 2026-09-29 — First-steps coach (onboarding)
- Added a "🚉 First steps" checklist card at the top of the side panel (`firstStepsCard` in js/ui.js). Five steps (lay track → 2 stations → line → train → first riders), each derived from live game state so it works after load. Current step is highlighted with where-to-click guidance; the card dismisses itself once complete or via ✕; respects the "Show tutorial/tip text" setting. Its footer nudges toward few well-placed stations (supports the sparse-network goal).
- Decided against a modal/scripted tutorial: state-derived checklist can't desync and doesn't block play.
- Next: highlight the relevant Build-mode button for the current step; a follow-up "grow" phase (second line, transfers, R&D); coach dismissal (`ui.coachDone`) is not saved across reloads; step text is English-only (no i18n yet). Map-density problem, hex close-up view, and per-map BGM audit remain untouched.
- Audio: not audited this run.
