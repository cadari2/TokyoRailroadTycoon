# DEVLOG

Newest entries last. Each: what changed, what was rejected, what's next.

## 2026-09-29 — Guided "next step" coach (onboarding)
- **Did**: added `coachStep`/`coachCard` in `js/ui.js`: a green card atop the side panel that walks new players through the core loop (lay track → 2 stations → line → train → wait for fares → "grow the loop"). Derived purely from game state (no saved flags beyond transient `ui.*`), so it adapts to out-of-order play and loaded saves. Each step has a button that switches to the right tool. ✕ dismisses; the existing "Show tutorial/tip text" setting hides it. The final step states the sparse-network principle explicitly.
- **Rejected**: modal/scripted tutorial (blocks play, desyncs from saves); auto-forcing map focus.
- **Next**: (1) coach doesn't yet highlight a *recommended* pair of hexes on the map — a "best first corridor" overlay from the demand field would help a lot; (2) the density problem is untouched this run: idea = per-hex track upkeep that scales with the count of owned track hexes not on any line, or diminishing station catchment overlap; (3) close-up hex inspect view still sparse; (4) audio: not audited this run — check `assets/audio/manifest.js` for maps reusing Tokyo's BGM.
- Note: `tools/smoke.js` and `tools/domsmoke.js` each take >2 min; run in background.
