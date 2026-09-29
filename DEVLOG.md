# DEVLOG

Iteration notes for scheduled improvement runs. Newest last.

## 2026-09-29 — "First Steps" onboarding card (focus #1)
- **Did**: added a floating checklist (js/ui.js `guideSteps`/`renderGuide`, css `#guide`)
  derived from live state: buy land → lay track → 2 stations → line → train → first
  riders. Shows only the current step's hint; hides itself when done, via ✕, or when
  "Show tutorial/tip text" is off. No saved flags, so it works on loaded games
  (a save that is already complete stays silent). On completion it logs the game's
  core lesson: a few well-placed stations beat paving every hex.
- **Decided against**: a modal step-by-step tutorial that blocks input — checklists
  that watch real state teach without gating (OpenTTD/SimCity-style).
- **Not verified**: hint wording names UI labels from memory of the Build/Lines tabs;
  check them against the real buttons. Layout of the card on mobile untested in a browser.
- **Next**: (1) map-density problem — idea: diminishing returns for stations/track
  packed tightly (catchment overlap already splits demand?) and per-hex upkeep that
  scales with local track density; (2) hex close-up inspect view; (3) audio gaps not
  yet audited — check js/audio.js for maps reusing another map's BGM.
- Note: tools/smoke.js and tools/domsmoke.js each take >2 min here.
- Pre-existing: domsmoke has 2 failing v0.5.7 per-hex-rights tests (fail on clean main too); investigate.
