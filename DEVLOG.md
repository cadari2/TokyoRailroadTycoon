# DEVLOG

Newest entries at the bottom. Each: what was done, what was rejected, next steps.

## Iteration: New-player coach (focus area 1, user friendliness)

**Did:** Added `coachStep(st, co)` (js/world.js, pure, smoke-tested) and a
`coachBanner` at the top of the sidebar panel (js/ui.js). It walks a new player
through the core loop: claim land → lay track → two stations → open a line →
buy a train → "let it grow, then extend". Each step has a "Show me" button that
jumps to the right tab/mode; "Hide guide" dismisses it (re-enabled via the
Settings "Show tutorial/tip text" checkbox). Final step deliberately teaches the
sparse-network idea (few well-placed stops 3–5 hexes apart, track costs upkeep).

**Decided against:** modal step-by-step tutorial overlay (interrupts play; a
persistent state-driven banner can't get out of sync with what the player did);
a density penalty this run (one scoped change only).

**Next:** the coach ends after ~4 stations; add mid-game prompts (electrify,
express service, through-running, R&D). An overworld/region-select map for
onboarding. A close-up hex inspect view (focus 6). Density: still unsolved —
consider a per-hex track upkeep that scales with local track share, or
catchment overlap penalties. Audio: not audited this run.
