# DEVLOG

Newest entries at the bottom. Each: what changed, what was rejected, what's next.

## 2026-09-29 — First-run "Getting Started" coach
- **Did**: added a state-derived checklist card (`coachSteps`/`coachCard` in js/ui.js) atop the side panel:
  lay track → 2 stations → line → train → watch the loop. Highlights the current step with a
  why-blurb and a one-click jump to the right build mode. Steps are computed from game state, so it
  works after loading saves and can't desync. Dismissable (✕) and respects the "Show tutorial/tip text" setting.
  The copy nudges toward the core loop and sparse, demand-targeted routes.
- **Rejected**: a modal/scripted tutorial (blocks play, brittle vs. many campaigns); saving the dismissed flag (session-only for now).
- **Next**: persist `coachHidden` in saves; highlight target hexes on the map (top demand pair suggestion);
  a sparse-network incentive (e.g. per-station catchment overlap penalty / land-value upkeep on unused track);
  hex close-up view; audio gaps not yet audited (check which maps reuse another map's BGM).
- Note: tools/smoke.js takes >2 min; run it in the background. domsmoke passed.
