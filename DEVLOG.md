# DEVLOG

Iteration notes for the scheduled improvement runs. Newest last.

## v0.5.9.3 — Corridor severance (density of rail never pays)
- **What**: `severanceDamp()` in `js/sim.js`. Organic development on a parcel is
  divided by `1 + 0.35 × (adjacent bare-track hexes)` (`CFG.LAND.severancePerTrack`).
  Station hexes don't sever. A lone line barely dents a district (~0.7×); a
  fully paved neighbourhood (6 track neighbours) grows at ~0.32×. Applied to
  both station-driven growth and kaidō roadside growth, stacking with the
  existing `trackedGrowthMult`.
- **Why**: maintenance already taxes track, but paving still "worked" because
  demand near stations kept growing regardless. Now carpeting the map
  starves the very demand the loop depends on, while dense *service*
  (stations, frequency) keeps paying.
- **Decided against**: penalizing occupancy/existing buildings (punishes
  players for history and would be invisible); a UI overlay wasn't added.
- **Next**: surface severance to the player (hex inspect tooltip: "hemmed in
  by rail: growth ×0.5"); tune 0.35 with tools/balance.js; the DEVLOG was
  missing before this entry — onboarding/tutorial remains the top-flagged
  area and the close-up hex inspect view is still unbuilt.
- **Audio**: not audited this run.
