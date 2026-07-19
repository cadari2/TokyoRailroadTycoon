# Coding Plan v0.5.9.1 — One-Map Tunnel Building

## Goal

Add player-buildable urban tunnels without creating a second underground map layer. Tunnel remains a per-hex/per-rail attribute (`track.tunnel`) drawn on the existing map, built with the same Lay Track workflow plus a Build-tab **Bore tunnel** toggle.

## Current plumbing to reuse

- Track already stores `track.tunnel` and rendering branches on it.
- Construction already has tunnel multipliers and terrain-driven tunnel requirements.
- Inspect panels already surface track/tunnel status.
- Disaster logic already evaluates per-asset resilience and damage, so tunnel modifiers can plug into existing damage rolls.
- Achievements and cross-map persistence already exist for campaign unlocks.

## Implementation steps

### 1. Config and era economics

- Add `CFG.TUNNELS` with:
  - `enabledTech: "electrification"` or an equivalent electrification-year gate.
  - `requiresElec: true` to prevent steam-only underground operation.
  - `forceDoubleTrack: true` because player-facing tunnel hexes are twin-tube/double-track.
  - Era boring cost multipliers, e.g. Meiji/early cut-and-cover 6× surface, post-1900 5×, interwar 4.5×, TBM/R&D 4×.
  - Higher annual upkeep multiplier, platform-length/station platform-car cost multipliers, and a small no-level-crossing link-budget bonus.
  - Disaster modifiers: immune to typhoon/fire, reduced earthquake damage after taishin R&D.
- Keep platform extension timelines realistic by making underground platform extension a normal upgrade job with longer duration and higher per-car cost, not an instant station edit.

### 2. Build-tab user interface

- Add a **Bore tunnel** checkbox/toggle next to Lay Track options.
- Gate the toggle with clear disabled reasons:
  - Electrification/tunnel tech unavailable.
  - Selected company lacks electric-capable construction/line mode if the existing UI distinguishes this.
- Persist the UI toggle in transient UI state only; saved track stores the result as `track.tunnel`.
- Update cost previews/status text to explain: land purchase avoided except portal hexes; underground rights purchased for intermediate hexes; higher boring and upkeep costs apply.

### 3. Construction rules and rights

- Extend path costing in `world.js` so manual tunnel segments:
  - Ignore most surface obstacles, built-up districts, and holdout estates for pathability.
  - Charge boring cost per hex instead of full land purchase for intermediate tunnel hexes.
  - Require purchase/ownership of entrance and exit portal hexes where tunnel meets surface track.
  - Allow the surface parcel above intermediate tunnel hexes to remain owned/developable, or record underground rights if owned by another party.
  - Automatically create or require electrified rails.
  - Automatically install/ensure two rails in tunnel hexes, respecting gauge compatibility.
- Add save/load migration for any new rights fields, defaulting old saves to surface-only rights.

### 4. Tunnel stations and platform lengths

- Add an underground station build mode or reuse station placement on tunneled track with an **Underground station** cost line.
- Draw underground stations as a surface entrance/roundel on the same hex.
- Apply higher per-platform-car costs and longer job times for construction and later platform extensions.
- Keep demand/catchment unchanged so players do not learn a new passenger model.

### 5. Rendering and animation

- Enhance existing `track.tunnel` rendering:
  - Dashed/darkened ribbon for tunnel rail.
  - Portal art where a tunnel hex connects to a non-tunnel track hex.
  - Roundel/entrance art for underground stations.
- Keep all assets on the existing canvas/map. Do not add a layer switcher, minimap mode, or camera change.
- Make Inspect explicitly say **underground**, show double-track/twin-tube status, and include upkeep/P&L cost effects.

### 6. Operations and disasters

- Enforce no-steam underground by blocking non-electric trains from lines that include tunnel hexes, or by forcing electrification before a tunnel line can open.
- Apply tunnel upkeep multiplier through the existing maintenance/P&L allocation.
- Add tunnel link-budget bonus where level-crossing friction would otherwise apply.
- In disasters, skip typhoon/fire damage for tunnel track and apply reduced earthquake damage after taishin-related R&D.

### 7. Achievement and campaign hooks

- Add `going_underground` to `CFG.ACHIEVEMENTS` and `ACH_TESTS` for opening a line with at least one tunneled hex and an underground station.
- Add campaign-specific titles/hooks such as:
  - Tokyo: **Going Underground**.
  - Melbourne: **City Loop**.
  - Paris: **Métro Maker**.
- Consider using this achievement as optional progress toward existing cross-map unlock counts rather than a hard gate.

### 8. Tests and validation

- Add smoke tests for:
  - Bore toggle gated before electrification.
  - Tunnel path ignores surface holdouts but charges boring/rights costs.
  - Portal hexes require ownership/purchase.
  - Tunnel hexes become double-tracked and electrified.
  - Steam/non-electric stock cannot run underground.
  - Tunnel upkeep appears in line P&L.
  - Typhoon/fire immunity and post-taishin earthquake reduction.
  - `going_underground` persists to achievement storage.
- Add DOM smoke coverage for the Build-tab toggle, Inspect text, and rendered portal/entrance state.

## Non-goals

- No separate underground view.
- No new passenger catchment model.
- No manual depth controls.
- No instant late-game platform-length extension; underground expansion remains a costly construction job.
