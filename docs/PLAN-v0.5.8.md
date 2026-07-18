# Tokyo Railroad Tycoon v0.5.8 — Engagement & Depth Plan ("The Living Corridor")

Planning session, 2026-07-18. This document is self-contained: an implementer with no
access to the planning conversation should be able to read it top to bottom and start
working. All features below are **approved by the owner** (approval history in §1).

---

## 0. Context, audience, and design pillars

**Goal:** maximize player engagement and popularity, drawing inspiration from OpenTTD.

**Interview decisions (owner-approved, binding):**

| Question | Decision |
|---|---|
| Target audience | **Tycoon/OpenTTD veterans** — depth and network mastery over casual onboarding |
| Core rework appetite | Yes, **but management-level, not micromanagement**. No signals/junction logic, no per-part train upgrades. Timetabling-lite is acceptable. Extra complexity must never be *required* to survive to 2028 — it is how you *win*, not how you avoid losing. |
| Freight | **No.** Passenger-only; the game doubles down on being the best passenger-railway sim. |
| Game structure | **The 156-year marathon is the game.** No scenario modes; densify the mid/late game instead. |
| Hex scale | **1 hex = 500 m** (changed from 1 km). Average real Tokyo station spacing is ~1 km, so stations land every ~2 hexes and corridors gain density. Map focus tightens to roughly the 23 special wards. |

**Where engagement currently leaks (blindspot findings):**

1. Mid-game decision density is thin: after the network is sketched (~Shōwa), the player
   mostly watches. OpenTTD fills this span with continuous network optimization; here,
   topology barely matters beyond distance.
2. Capacity is a per-line formula that ignores shared corridors — two lines over one
   single-track hex cost nothing extra. Network topology is not a puzzle yet.
3. Laying track *erases* the city: `world.js` sets `h.cons = null; h.dev = 0` on every
   completed track hex, so each rail corridor sterilizes its own catchment — the line
   destroys part of the demand it was built to serve.
4. Rich sim causes (mode share, crowding, morale) are computed but not surfaced; outcomes
   read as opaque.

**Approved feature set** (risk-first order — this is also the implementation order):

- **W0 — Hex rescale: 1 hex = 500 m** (foundation; touches everything)
- **F7 — District hexes & right-of-way** (hex = a living district; rail shares it)
- **F1 — Link capacity & double-tracking** (topology matters; corridors are won with steel)
- **F2 — Asset lifecycle: condition, breakdowns, delays** (the mid-game management loop)
- **F3 — Service planning** (per-line service levels; optional-complexity layer)
- **F6 — Diagnostics & legibility** (surface the "why"; multiplies F1–F3's value)

Explicitly **rejected** (do not implement): freight/industry chains, signals/junction
mechanics, per-train component upgrades, scenario/challenge modes, multiplayer, modding
surface (deferred, not rejected — `config.js`'s data-driven layout keeps it cheap later).

**One coordinated save-schema break:** bump `SAVE_VERSION` and `SAVE_MIN_VERSION` to
**13** in the *first* PR of this cycle (W0); all later features extend v13 rather than
breaking again. Older saves are declined with the existing friendly message pattern.

All sim-side work must land with coverage in `tools/smoke.js` and a retune pass in
`tools/balance.js` (the sim core is deliberately headless-testable — keep it that way:
none of the new systems may touch the DOM outside `ui.js`/`render.js`).

---

## 1. Approval history

- F1, F2, F3, F6, F7 approved by the owner in the planning session (2026-07-18).
- F4 (era goal ladder) and F5 (rival personalities) were proposed and **not approved** —
  do not implement.
- F7's hex-scale question was resolved by the owner: **500 m per hex**, names kept via
  the existing machi system (density notes in §3.6).

---

## 2. W0 — Hex rescale to 500 m  *(foundation · risk: HIGH · do first, alone, in one PR)*

### What & why
Today `1 hex ≈ 1 km` is implicit everywhere (comments say "yen/hex (≈1 km)", train
speeds are km/h with hex=1 km, catchment radius 2 = 2 km). At 1 km, adjacent-hex
stations are already at real Yamanote spacing, so *every* hex on a line is a plausible
station and corridors have no interior structure. At **500 m**, stations naturally sit
every ~2 hexes, corridors have between-station hexes where F1's link capacity and F2's
condition live, and the 50×50 map (now ~25 km × ~21.6 km) tightens onto roughly the
23 special wards — a denser, more urban game.

### How to code it

1. **Introduce one constant** in `config.js`:
   ```js
   HEX_KM: 0.5,   // real km per hex (design invariant; was implicitly 1.0)
   ```
   Then audit every site that treats "1 hex" as "1 km" and multiply by `CFG.HEX_KM`.
   The rule: **all economy constants stay per-km** (fares ¥/km, `TRACK.baseCost` per km,
   maintenance per km, `demolishCost` per km, alt-mode `minPerKm`/`yenPerKm`); the *per-hex
   application* multiplies by `HEX_KM`. A network of the same real length costs the same.
   Known sites (grep for `perKm`, `daysPerHex`, `hexDist`, `speed`):
   - `world.js`: track build cost/time per hex (`daysPerHexByEra` becomes per-km ×
     `HEX_KM`), electrification km caps (`crewsByEra` counts km — convert to
     hexes = km / `HEX_KM`), demolition, reclaim.
   - `sim.js`: edge travel time (`dist` in hexes → km = hexes × `HEX_KM` before dividing
     by speed), fare per edge (km-based), trackage-rights per-km splits (`ownKm`/`hostKm`
     counters are per-hex — scale), crow-distance decay in the gravity model
     (`hexDist(A,B)` → × `HEX_KM` wherever it feeds km-denominated costs).
   - `main.js` / render: `TRAIN_VISUAL` (visual hex/sec per km/h) doubles so on-screen
     train speed is unchanged.
   - `hr.js`: headcount per track-km.
2. **Radii and falloffs double (they are in hexes, not km):**
   - `CFG.STATION.catchment: 2 → 3` (1.5 km walk/bike shed; +1 for service ≥ 3 as today
     → 2 km). Deliberately slightly *tighter* in km than the old 2 km base — denser
     station spacing means overlapping sheds; the existing overlap-splitting logic
     handles it, but retune `tripsPerCapita` if totals drift (balance.js will show it).
   - `LAND.centerFalloff: 6.5 → 13`, `palaceRadius: 2 → 4` (Kokyo is ~2 km wide — 4 hexes
     at 500 m is right), `LAND.supplyRadius: 3 → 6`, moat ring radius 2 → 4 in `map.js`,
     grant-plot rings (`CFG.GRANT_RINGS`), AI corridor-scoring distances in `ai.js`
     (audit any literal hex-count thresholds, e.g. expansion reach, station-spacing
     heuristics), disaster damage radii in `events.js`.
3. **Map generation (`map.js`)**: same 50×50 grid, but the map now depicts the core
   wards. Terrain proportions need a pass per campaign: Tokyo — the bay shrinks to the
   real waterfront share (SE corner), rivers stay 1 hex wide (now 500 m — acceptable
   abstraction), and the western mountain band becomes **hills/upland fringe** (the real
   Kantō mountains are outside a 25 km frame; keep a modest hill band for terrain-cost
   variety rather than literal mountains). Preserve every existing water invariant
   (rivers reach the sea, sea touches the edge). London/NYC/Melbourne get the same
   proportional pass (each campaign's geography source in `map.js` per `CFG.CAMPAIGNS`).
4. **Hex names**: keep `assignAreaNames()` unchanged. The map area shrinks 4×, so the
   ward-grouped pools in `data/machinames.js` now cover proportionally more of the map —
   the 23-ward focus the owner wants. Where a ward's pool exhausts (4× more hexes per
   ward), let **adjacent hexes share one machi name** (assign each name to a small
   contiguous cluster of 2–4 hexes before moving to the next name) — real machi were
   usually larger than 500 m anyway, so this is *more* accurate, not less. Peripheral
   fallback naming (nearest district anchor) is unchanged.
5. **Save schema v13**: no new fields from W0 itself (terrain regenerates from seed),
   but the regenerated world is geometrically incompatible with v12 saves — this is the
   break. Decline < v13 with the message pattern used for the v0.5.1 break.
6. **Retune** with `tools/balance.js`: the invariants in README §7 (opening pinch,
   whole-arc rev/cost tension) must hold at the new scale. Expect `tripsPerCapita`,
   `expandMinScore` (`CFG.AI`), and station-cost constants to need adjustment.

### Edge cases
- Trackage-rights fare splitting counts hexes (`ownKm++`) — rename to `ownHexes` and
  convert once, or the through-fare doubles.
- `hexesWithin` radius bumps grow O(r²) — catchment 3 and supply 6 are fine; avoid
  blanket-doubling any radius used in per-frame render loops without checking cost.
- Time-skip milestones (`ui.js`) and construction crew limits interact: a km of works
  is now 2 hexes — verify skip-simulation still completes builds at the same real rate.

**Risk:** HIGH (touches everything; mitigated by being purely mechanical + balance.js).
**Open question:** none blocking. Grid stays 50×50; do not resize it in this cycle.

---

## 3. F7 — District hexes & right-of-way  *(core · risk: MEDIUM-HIGH)*

### What & why
A hex stops being a single all-or-nothing parcel and becomes a **district** (~0.25 km²
at the new scale): it can hold its village/buildings *and* a rail corridor *and* a
station plot simultaneously. Laying track buys a **right-of-way (ROW)** through the
district — cheaper than the whole parcel — and **no longer erases development**.
Residents beside the tracks keep living there, keep counting in catchments, and keep
growing. This fixes the self-sterilizing-corridor bug, restores the historically
accurate private-railway value-capture game (buy the district around your own station
before the line opens; develop the ekimae), and makes later double-tracking (F1) a
genuinely expensive urban land acquisition, as it was historically.

### How to code it

1. **Data model** (`config.js`, `world.js`, `save.js`):
   - `Hex` keeps `cons`, `dev`, `occ`, `owner` *alongside* `track`. Delete both
     `h.cons = null; h.dev = 0` clears when track completes (`world.js` build-queue
     completion, ~line 2309) and any equivalent in station placement. Demolishing rail
     (`world.js` ~line 1460) no longer clears the district's building — only rail state.
   - New track field: `track.row = { paidLevel }` — the dev level the ROW was purchased
     at (used for F1's widening cost, §4). Serialize in `save.js` (v13 already broken by
     W0, so just add the field to the whitelist).
   - **Ownership split:** `h.owner` remains the district's landholder (village, rival,
     player, holdout). `track.co` owns only the corridor. `buyLand` (full parcel) and a
     new `buyRightOfWay(st, co, idx)` are separate purchases:
     - ROW price = `landValueOf(hex) × CFG.LAND.rowShare` (add `rowShare: 0.35`) ×
       `(1 + CFG.TRACK.devCostPerLevel × h.dev)` — the existing urban-premium shape.
     - Laying track through a district you don't own requires only the ROW. Laying
       through a district you *do* own costs nothing extra (you own the whole parcel).
     - ROW on public land (`owner === -4`) and palace grounds stays forbidden as today.
     - Districts **always sell the ROW** at the quoted price (no holdout negotiation —
       owner decision, to avoid micromanagement); price scaling with `dev` is the
       deterrent. Existing named holdouts keep refusing *full-parcel* sales as today
       but do sell ROW at a `CFG.LAND.holdoutRowMult` (suggest 2.0) premium.
   - Track laid during the works knocks the district's building down **one dev level**
     (construction disruption), never below 0, never deleting `cons`.
2. **Simulation** (`sim.js`): catchment code already reads `hexPop`/`hexAtt` from
   `h.cons`/`h.dev` — with the clears deleted it works unchanged. In the growth pass,
   remove any `if (h.track) continue`-style exclusions (grep `world.js` growth-eligible
   checks, e.g. the `!h.track` conditions at ~lines 298/366/411) so tracked districts
   develop organically; apply a mild growth damper `CFG.LAND.trackedGrowthMult: 0.8`
   (living next to the tracks) and a *bonus* within 1 hex of a station as today.
3. **Property economy:** a full parcel bought by a company that also hosts its own (or
   anyone's) track behaves exactly like today's owned building: occupancy, rent, upkeep,
   property tax (v0.5.5 systems, unchanged). This is the ekimae play: buy the districts
   around a planned station cheaply, open the line, collect the appreciation and rent.
4. **AI** (`ai.js`): route costing must use ROW price (not full-parcel price) when
   scoring corridors; teach hard-profile AIs the ekimae play (optionally buy 1–3 full
   parcels adjacent to a planned station when cash-rich — reuse the existing land-buy
   machinery, low effort, big flavor).
5. **Rendering** (`render.js`): composite district art. Draw order within a hex:
   terrain → building silhouette (offset toward one side of the hex, scaled ~70%) →
   track (the existing rail strip, drawn along its through-direction) → station
   forecourt glyph if a station is present → trains. At zoomed-out levels, keep the
   current "rails dominate" look (building omitted below a zoom threshold) so network
   legibility doesn't regress; from mid-zoom in, the village appears beside the line.
   The supersampled cache invalidates on the same events it does today.
6. **Migration/back-compat:** none needed (v13 break). But `windUpCompany`,
   `buyOutCompany`, disaster damage, and demolition paths must all be audited for the
   old assumption "track hex ⇒ no cons" (grep for `h.track` guards).

**Risk:** MEDIUM-HIGH — the "track hex has no building" assumption is scattered; the
audit list above is the real work. Balance: ROW pricing softens early expansion, so
re-run the opening-pinch invariant.
**Open question (flagged, non-blocking):** should a district's building be *razeable*
by its rail-owning company for a fee (to place large stations)? Suggest yes, via the
existing demolition path, but it can ship later.

---

## 4. F1 — Link capacity & double-tracking  *(core · risk: HIGH)*

### What & why
Makes network topology itself the puzzle — the OpenTTD stickiness — without signals.
Every track hex has a **throughput budget**; all service scheduled over it (yours and
trackage-rights partners') competes for that budget. A single-track hex saturates;
laying a **second parallel rail of the same gauge** (double-tracking) doubles it. The
multi-rail machinery already exists for gauges (`track.rails[]`, `addGauge`); this
feature extends it to same-gauge pairs. Combined with F7, double-tracking through the
built-up Shōwa city is the authentic, ruinously expensive corridor-war move: the ROW
must be **widened** at *current* land value (`track.row.paidLevel` records what you
paid for; the delta to today's `dev` is the widening bill). Survival never requires
it — a modest single-track service is viable forever; capacity is how you *win*
corridors against rivals.

### How to code it

1. **Config** (`config.js`):
   ```js
   LINK: {
     trainsPerDayPerRail: { /* by era-or-tech: */ base: 60, blockSignal: 80, autoBrakes: 90 },
     // one rail supports N scheduled round-trip train-passages/day; a second
     // same-gauge rail doubles the budget on that hex. Values are per direction-pair
     // (a round trip consumes 1). Tune in balance.js.
     overCapPenalty: 2.2,   // exponent on the slowdown when demandedSlots/budget > 1
   }
   ```
   The rail-count budget composes with existing capacity techs (block signalling, air
   brakes) — move their "+% effective capacity" effects to raise `trainsPerDayPerRail`
   instead of the line-level multiplier, so the techs now relieve *links* (semantically
   truer and no double counting).
2. **Model** (`world.js`): `addGauge` currently forbids adding a rail of the *same*
   gauge — allow it, labeled "double track". Cost = fresh-track material cost + **ROW
   widening**: `(landValueNow × rowShare × widenMult) × max(0, currentDevFactor −
   paidDevFactor)` where the dev factors use the `devCostPerLevel` shape and
   `track.row.paidLevel`. Update `paidLevel` on completion. Time uses the existing
   parallel-rail build-job path (rail is `building:true`, out of service — already
   implemented for gauge adds).
3. **Sim** (`sim.js`): after lines schedule their fleets, compute per-hex demanded
   slots: for each line, `slotsPerDay = trainsOnLine × roundTripsPerDay` (round trips
   already derive from path length/speed for capacity math — reuse it); add that to
   every hex on the line's path (trackage-rights guests count against the host's hex).
   Per hex, `load = demandedSlots / (railsOfServiceGauge × trainsPerDayPerRail)`.
   If `load > 1`, the hex imposes a **slowdown factor** `load^overCapPenalty` on edge
   travel time for every line through it (feeds the existing generalized-cost routing —
   riders drain to rivals/alt modes automatically) and caps effective line capacity by
   `1/load` on the affected segment (plugs into the existing per-direction link-volume
   capacity math — `line.demand` is already the peak directional link volume, so the
   binding constraint becomes `min(fleetCapacity, linkBudget)` per segment).
   Cache per-hex totals in the O-D reassignment pass (`od.dirty` already gates it);
   this is O(total path hexes), trivial.
4. **AI** (`ai.js`): rivals must respond or the feature reads as player-only tax.
   Add a yearly check: any own hex with sustained `load > 0.9` and cash → schedule a
   double-track job (reuse the electrification-decision pattern, which already exists
   for capable AIs). Hard profiles also weight corridor scoring by rivals' link
   headroom (attack saturated corridors).
5. **UI** (`ui.js`): "Double track" appears in the same *Manage track* dialog as gauge
   adds; quote materials + widening separately (players should *see* that waiting made
   it expensive). Bulk action: select a line → "double-track the bottleneck segment"
   (hexes above a load threshold).
6. **Save**: rails array already serializes; `row.paidLevel` from F7 covers the rest.

### Edge cases
- Loop lines pass each hex once per lap per train — count slots accordingly (existing
  round-trip math differs for loops; mirror it).
- Mixed-gauge hexes: budget is per *gauge's* rail count (a narrow rail doesn't relieve
  a standard-gauge line).
- Station hexes: platforms already cap cars; do **not** also meter station hexes with
  link budget at 1× — give station hexes `×1.5` budget (throat abstraction) or
  terminals will bind before platforms do, which reads as mysterious.
- Damaged/under-construction rails contribute 0 budget (interacts with F2 outages —
  a breakdown on single track is a real stoppage; on double track, degraded service.
  This interaction is the point of the whole design).

**Risk:** HIGH — this rebalances the tuned economy; the `overCapPenalty` and budget
numbers need real balance.js iteration, and the tech-effect migration must not double
count. **Decision worth arguing about (flagged, owner leaning already given):** rival
trains do *not* physically block yours — contention is a capacity/slowdown split, not
train-level blocking. Keep it that way; per-train blocking is signals by the back door.

---

## 5. F2 — Asset lifecycle: condition, breakdowns, delays  *(core · risk: MEDIUM-HIGH)*

### What & why
The owner's requested mechanic and the mid-game engagement engine: infrastructure and
rolling stock **age**, aged assets **break down**, breakdowns cause **delays** that
riders actually feel (via generalized cost), and the fix is a **management decision**
(paid, time-taking renewal — never per-part micromanagement). The mid-game stops being
watch-time: a mature network is a rolling renewal program competing for the same cash
as expansion, exactly the real railway-management tradeoff.

### How to code it

1. **Condition, derived not stored.** Track already stores `built` (year laid/renewed);
   stations store `renewed`; trains age (upkeep already rises with age). Define
   `conditionOf(asset, year)`: 1.0 when new, decaying with age since last renewal —
   `Math.exp(-(age)/CFG.WEAR.halfLife[assetType])` with `halfLife` ≈ track 45y,
   station 60y, train 30y (tune). Heavy use accelerates wear: scale age by the asset's
   lifetime-average load factor where cheaply available (track: the F1 `load` cache;
   trains: line load). Storing nothing new keeps saves small; only **renewal events**
   change state (they reset `built`/`renewed` — machinery exists for track repairs and
   station works).
2. **Breakdown hazard** (`events.js`, monthly pass): per line, hazard =
   `CFG.WEAR.baseHazard × Σ over path hexes (1 − conditionOf(track)) × HEX_KM +
   per-train term (1 − conditionOf(train))`. On a roll, emit an **incident**:
   `{ line, kind: "track"|"stock", hexIdx?, daysLeft, severity }` pushed to a new
   `st.incidents` array (serialize in v13). Effects while active:
   - travel-time multiplier on the line (or on the hex, feeding F1's slowdown path —
     reuse it; an incident is just temporary negative budget),
   - capacity reduction `severity`,
   - on **single track** through the incident hex: service through the hex halts
     (budget 0) — double-tracked corridors degrade instead of stopping (F1 synergy).
   Incidents auto-clear after `daysLeft` (crew handles it — no player action required
   to *survive*), but chronic low condition means chronic incidents.
3. **Renewal actions** (`world.js`, `ui.js`): 
   - Track: "Renew track" on a selection/line segment — cost ≈ 45% of fresh build (roadbed
     and ROW kept), uses the build-queue with `crewsByEra` limits, resets `built`
     (which also feeds the existing seismic `rEra` — renewal now pays twice, in
     reliability *and* quake resilience: make this explicit in the UI).
   - Trains: "Overhaul" (cheap, resets ~60% of age) and "Replace" (existing purchase
     path). One button each — no parts.
   - Stations: existing platform/taishin works already reset `renewed`; add a plain
     "Refurbish" for stations with nothing else to buy.
   - Bulk: Lines panel "Renew worst 10 km" and fleet-wide "Overhaul aging stock",
     mirroring the existing bulk-taishin pattern (`world.js` ~line 939).
4. **Reliability as a player-facing number:** per line, `reliability% =` rolling
   365-day share of incident-free service. Shown in Lines panel and fed into line
   `desirability` (riders punish unreliable lines — the existing desirability channel
   already propagates to demand and land growth; small coefficient, tune).
5. **HR interplay** (`hr.js`): maintenance headcount already scales with track-km; low
   morale/short-staffing multiplies the hazard (×1.0–1.5). Gives the wage lever a
   second consequence — no new UI.
6. **AI** (`ai.js`): yearly renewal budget = fraction of revenue scaled by difficulty;
   AIs renew worst-condition assets first. Hard AIs keep reliability high; easy AIs
   visibly decay (readable flavor: the rickety rival).
7. **Survivability guard (owner requirement):** tune so a player who *never* renews
   suffers revenue erosion and embarrassment, not death: cap total incident downtime
   per line per year (`CFG.WEAR.maxDownDaysPerYear` ≈ 25) and keep the desirability
   penalty gentle. Verify in balance.js: a no-renewal AI trace must still reach 2028
   solvent on Normal.

**Risk:** MEDIUM-HIGH (hazard-curve tuning; the no-death-spiral guarantee needs actual
traces). **Open question (non-blocking):** should major quake damage interact with
condition (worn track takes more damage)? Suggest yes via a small term in the existing
resilience composition — one line of code — but ship without it if tuning drags.

---

## 6. F3 — Service planning  *(engagement layer · risk: MEDIUM)*

### What & why
Timetabling-lite, per the owner's line: management, not micromanagement. Each line gets
a **service plan** — a small set of levers that interact with F1's link budgets and
F2's wear — and every lever has a sane default equal to today's behavior, so a player
who never opens the panel loses nothing but the optimization edge.

### How to code it

1. **Per-line fields** (`Line`, serialize in v13): 
   `svc = { pattern: "all_stops"|"skip_stop", rush: false, span: "full"|"daytime" }`.
   Defaults: `all_stops`, no rush boost, full span — exactly current behavior.
2. **Levers:**
   - **Skip-stop pattern**: the line's existing `stops` map already supports
     non-stopping stations; add a one-click "express pattern" generator (keep every
     2nd–3rd stop by boardings) instead of manual toggling. Faster trips for through
     riders (existing time math), lost boardings at skipped stops (existing catchment
     math) — zero new sim code, pure UI convenience over existing mechanics.
   - **Rush-hour extras** (`rush: true`): +25% effective daily capacity and +15% link
     slots demanded (F1) on that line, +payroll (crew overtime, via `hr.js` headcount
     multiplier on that line's share) and +wear rate (F2). The classic capacity-vs-cost
     dial. Implemented as multipliers in the existing capacity/cost passes.
   - **Service span** (`daytime`): −15% capacity, −20% train wear and −10% crew cost
     (no night/early runs). The quiet-branch-line economizer.
3. **Sim integration** (`sim.js`): all three are multiplier hooks on already-computed
   quantities (capacity, slots, payroll share, wear rate). No new solver. The O-D model
   sees their effects through capacity and time, nothing else.
4. **AI** (`ai.js`): hard AIs turn on rush extras when line load > 0.85 and cash flows;
   that's all.
5. **UI** (`ui.js`): three controls in the existing per-line editor + the pattern
   generator button. Show projected deltas (capacity, cost/yr, wear) before applying.

**Risk:** MEDIUM (mostly balance; the levers must not strictly dominate defaults).
**Open question:** none blocking. Full timetable grids are explicitly out of scope.

---

## 7. F6 — Diagnostics & legibility  *(polish · risk: LOW · last)*

### What & why
Everything above adds causes; this surfaces them. Veterans forgive difficulty, not
opacity. The sim already computes every number needed — this is presentation.

### How to code it

1. **Per-line "Why?" breakdown** (`ui.js`, data from `sim.js` caches): for a selected
   line, show the demand ledger: potential riders in catchments → lost to mode share
   (alt modes won) → lost to fare pressure → lost to crowding discomfort → lost to
   delays/reliability (F2) → lost to link saturation (F1) → carried. Each term already
   exists in the assignment pass or is added by F1/F2 — persist them per line in a
   `line._diag` object (derived, not saved) during O-D assignment.
2. **Corridor load overlay** (`render.js` + a Lines-panel toggle, mirroring the
   existing all-routes overlay): color track hexes by F1 `load` (green→red), with
   double-track hexes marked. This is *the* planning view for F1.
3. **Condition overlay**: same mechanism, colored by F2 `conditionOf` — the renewal
   planning view.
4. **Incident feed**: F2 incidents render in the existing event log with line links;
   a small "reliability" column joins the Lines panel table.
5. Keep all of it read-only and out of the sim core (derived caches only).

**Risk:** LOW. Ship alongside or immediately after F1/F2 — do not let the two core
systems soak without their overlays, or they will play as opaque punishment.

---

## 8. Sequencing, dependencies, and PR plan

```
PR 1  W0  hex rescale (+ save v13 break, name clustering, terrain pass, retune)
PR 2  F7  district hexes & ROW            (depends on W0 pricing scale)
PR 3  F1  link capacity & double-track    (depends on F7 row.paidLevel; + load overlay from F6.2)
PR 4  F2  asset lifecycle                 (depends on F1 slowdown path; + condition overlay F6.3, feed F6.4)
PR 5  F3  service planning                (depends on F1 slots, F2 wear)
PR 6  F6  remaining diagnostics ("Why?" ledger) + final balance pass
```

Each PR: smoke.js coverage for new sim behavior, balance.js trace across ≥3 seeds
checking the README §7 invariants plus the new ones (no-renewal solvency, single-track
viability), all four campaigns boot and complete a time-skipped run headless.

## 9. Open questions (non-blocking, decide during implementation)

1. Razing a district's building for large station footprints (F7 §3) — recommended yes, later.
2. Quake-damage/condition coupling (F2) — recommended yes, one term, cut if tuning drags.
3. Station-hex link-budget multiplier (F1 edge cases) — start at ×1.5, tune.
4. Whether unlock gating (London/NYC/Melbourne) should loosen for this cycle — **not
   discussed with the owner; do not change it without asking.**
