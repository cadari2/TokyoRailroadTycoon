# DEVLOG

Newest entries last. Each: what was done, what was decided against, what's next.

## Onboarding: "Getting Started" guide card
- Added `js/guide.js` (pure `guideSteps(st, opts)`, state-derived so no save-format change) and a bottom-left
  card in the map area (`renderGuide` in ui.js): 7 steps — find demand (heatmap), lay track, 2 stations,
  create a line, put a train on it, earn first fares, grow a *deliberate* network — with a progress strip
  and a button jumping to the relevant tab. Dismiss with ✕ (localStorage `trt_guide_off`); System panel can
  re-show it. Auto-hides when finished or after START_YEAR+3.
- Copy is deliberately nudging toward sparse networks (link big demand, not every hex).
- Decided against: modal pop-up tutorial (blocks play, gets skipped) and save-stored progress.
- Next: verify tab/button names match the real Build panel wording in-browser; highlight target UI elements;
  a scenario-style first-map objective; hex close-up inspect view (focus area 6); density incentives
  (per-hex upkeep vs. rider gain); audio gaps not yet audited.
