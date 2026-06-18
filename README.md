# Tokyo Railroad Tycoon

**Version 0.3**

A browser-based railroad tycoon prototype set in fictionalized Greater Tokyo, 1872 (Meiji 5) to 2028 (Reiwa 10).
No build step, no external dependencies. Open `index.html` in desktop Chrome / Safari / Firefox.

---

## 1. High-Level Architecture

### Files / Modules (classic scripts, shared `window` scope, loaded in dependency order)

| File               | Responsibility |
|--------------------|----------------|
| `index.html`       | Shell, canvas, UI panel skeleton, script loading order |
| `css/style.css`    | Retro early-PC business-sim aesthetic (beveled panels, scanline-free CRT palette) |
| `data/machinames.js` | Real Shōwa-era 町名 (machi names) by old ward — the hex-naming pools |
| `data/hexnames.js` | Optional per-hex name overrides (spiral-index → name) |
| `js/config.js`     | All tuning constants: eras, terrain, train types, prices, economy knobs |
| `js/util.js`       | Seeded RNG (mulberry32), value noise, formatting, min-heap |
| `js/map.js`        | Hex math (odd-r offset + cube), 50×50 procedural terrain generation, spiral indexing |
| `js/world.js`      | Companies, land purchase, A* track planning, construction queue, stations, lines, trains, trackage-rights, buyouts |
| `js/sim.js`        | **Passenger origin–destination simulation**, network routing, capacity/crowding, daily finance (incl. maintenance & payroll), land-value/development growth |
| `js/hr.js`         | **Workforce**: headcount, payroll, morale, the labor market, strikes, and the annual awards ceremony |
| `js/ai.js`         | up to 6 computer opponents: staggered market entry, expansion logic, pricing, wage policy, acquisitions |
| `js/events.js`     | Random + historically-flavored events (earthquakes, typhoons, fires, air raids, booms, bubbles, pandemics, remote work) |
| `js/save.js`       | localStorage autosave/manual save, export/import JSON with validation & sanitization |
| `js/render.js`     | Canvas rendering: cached terrain layer, tracks, stations, trains, day/night tint, era palettes, asset loader with placeholders |
| `js/ui.js`         | Panels (Build / Lines / Finance / Property / Workforce / Companies / Log / System), interaction modes, dialogs |
| `js/main.js`       | Game state factory, fixed-step main loop (days), boot/glue |
| `tools/smoke.js`   | Headless Node smoke test of the simulation core |

The simulation core (`map/world/sim/ai/events/save`) never touches the DOM, so it can run headless for testing.

### Core data structures

```js
state = {
  seed, time: { sec, year, day, frac },        // 300 real sec = 1 year on a 12-month CALENDAR
                                               // (day = month index 0..11); each month ≈25s,
                                               // played as a representative day with its own
                                               // day/night cycle and a blended weekday/weekend
                                               // ridership; every month ≈30 calendar days
  hexes: Hex[2500],                            // idx = row*50 + col (odd-r offset)
  companies: Company[], stations: Station[], lines: Line[], trains: Train[],
  builds: BuildJob[],                          // construction queue (takes in-game days)
  econ: { cycle, commuteFactor, adoption },    // macro modifiers
  labor: { tightness, wageMult, scarcity },    // labor market (drives the prevailing wage)
  events: { log, active, majors },             // ≤2 major destructive events / 100 yrs
  awardsLast: { year, results:[…] },           // last year-end awards ceremony (for the UI)
  od: { dirty, lastAssign }                    // O-D assignment cache
}

Hex      = { col,row, terrain, cons, dev, owner, value,
             track:{co,tunnel,dmg, gauge,elec, rails:[{gauge,elec,building}]}|null,  // co owns the
             //   permanent way; it can carry 1+ parallel RAILS of different gauges (trains never
             //   run between them, only alongside). gauge/elec mirror rails[0] for back-compat;
             //   a rail with building:true is mid-construction (adding/regauging) and out of service.
             stations:[id], spiral, name }
Company  = { id,name,color,isPlayer,founded,cash,gauge, land:Set, trackHexes:Set,
             rights:Set, stats:{pax,rev,cost,history,morale}, alive, ai:{...},
             wageLevel, morale, reputation, awards:[],            // workforce / HR
             defaultFarePerKm, defaultFareSet,                    // company-wide default ¥/km for lines
             _opCost, _headcount, _productivity, _buildSpeed, _strikeDays }   // derived (not saved)
Station  = { id,co,hex,cars,name,builtYear, board, boardAvg,  // cars = platform length
             commerce, commerceBuilding, commercePending }  // ekinaka tier (0–5) + works countdown
Line     = { id,co,name,path:[hexIdx],stations:[id],stops:{id:bool},type,loop,fare,fareOverride,gauge,elec,
             trains:[id], capacity, demand, board, served, desirability, color }
             // loop=true → one-way closed circuit (path[0]===path[end]); fareOverride pins the line's
             // own fare so the company default doesn't touch it
Train    = { id,co,line,type,cars, pos,dir }                // pos = distance along path (visual); on a
                                                            // loop, dir alternates per train (odd CW, even CCW)
Passenger flows are aggregated per O-D station pair (gravity model), not per-agent —
but origins/destinations come from real hex buildings in station catchments, and route
choice is a generalized-cost (fare + time·VOT) Dijkstra over the service network.
```

### Main loop

```
requestAnimationFrame → accumulate real dt
  ├─ advance clock (5 min real = 1 yr = 12 simulated months); on each new MONTH (~25s):
  │    ├─ construction queue progress (~52 calendar days of work)
  │    ├─ O-D reassignment if network/prices dirty (or every sim-day)
  │    ├─ passenger counts (blended weekday/weekend ×, rush phases, events, capacity caps)
  │    ├─ fare revenue + land rent + station commerce − OPERATING COSTS (per-km/per-car
  │    │   maintenance + payroll + commerce upkeep, scaled by morale); growth; AI decisions
  │    └─ yearly: year-end levy (property tax + station upkeep), WORKFORCE PASS
  │       (labor market, AI wage policy, morale drift, strikes) + AWARDS CEREMONY,
  │       era checks, events, fare inflation-indexing, autosave, buyout checks
  ├─ move visible trains along line paths (continuous, for engagement)
  └─ render (cached terrain + dynamic layers + smooth cosine day/night tint)
```

Track is laid **one hex at a time**: pick the Lay Track tool, click a hex, and
confirm the quoted construction + land cost and build time. Inspect mode keeps
the clicked tile selected with a persistent detail card (terrain, residents,
commerce population, owner, value/asking price) including offers to buy parcels
from other companies at a markup — they refuse if infrastructure sits on it.

**Multiple gauges per hex (`addGauge` / `changeGauge`).** A hex's permanent way
can carry more than one gauge of rail. Click your own track with the Lay Track
tool (or *Manage track* in the inspector) to **add a parallel rail** of another
gauge — about the price of fresh track but with **no land to buy** (the parcel
is already yours) — or to **convert (regauge)** an existing rail. Trains never
run *between* gauges, only **alongside** each other on the hex. Regauging reuses
the roadbed and land so its materials are cheap, but it's slow and labour-heavy
(`CFG.TRACK.regaugeCostMult` / `regaugeTimeMult`) and the rail **carries no
service until the works finish** (any lines on that gauge through the hex are
dropped the moment work starts). A **station accepts trains of any gauge whose
rail is on its own hex or an adjacent hex** (`stationGaugeAnchor`), so one
station can junction lines of several gauges without every gauge passing exactly
through its hex.

**Demolition.** The **Demolish** tool tears up track — one gauge at a time on a
multi-gauge hex, or all of it — and may then redevelop an emptied parcel into
rent-earning property. It now works **even when a station sits on the hex** (the
station stays; only the rail goes). To remove a **station** itself, use *Demolish*
in its **Manage Station** screen: it costs money and time, the station serves
until the works finish, and the **rail on the hex is left in place**.

**Controls (desktop & mobile).** Mouse: drag to pan, wheel to zoom (toward the
cursor), click to act. Touch: one-finger drag to pan, two-finger pinch to zoom
(toward the midpoint), tap to act. The `☰ Menu` button in the top bar hides/shows
the side panel on any device — on desktop the map reflows to fill the freed
space; on small screens the panel floats as an overlay so the map stays full-screen
(and it starts hidden so the map is visible first). The canvas uses
`touch-action: none` so finger gestures drive the map, not the browser.

### Passenger O-D model (the heart)

1. **Catchments**: every station collects population (houses/apartments) and attractions
   (shops/schools/civic/jobs) from hexes within radius 2, distance-weighted, split between
   overlapping stations.
2. **Service network**: stations are nodes; each line contributes edges between consecutive
   *stop* stations (time = dist/speed + dwell; cost = fare). Transfers cost +5 min.
   Trackage rights let lines run over partner track of a compatible gauge.
3. **Production-constrained gravity**: each origin's residents make a bounded number of
   outbound rail trips per day — a *production budget* `tripsPerCapita · pop_i · adoption · econ`
   — which is *distributed* across destinations in proportion to each one's pull
   (`att_j · accessibility · length-decay`) and then suppressed by a logit mode share (against
   a non-rail alternative: walking → buses → cars by era), affordability, and crowding. Because
   the budget is a per-capita rate, **total demand scales linearly with population** (people ride
   ~twice a day) rather than as the `pop · att` product, which grew unbounded.
4. **Assignment** splits each flow across two rider segments routed independently — budget riders
   (low value-of-time, fare-sensitive) and comfort-seekers (high VoT, crowd-averse, willing to pay
   for a fast, empty express) — so demand divides over competing routes instead of all taking one
   path. A crowding *discomfort* cost (fare-equivalent, not VoT-scaled) makes packed locals
   unpleasant even in early eras. Daily line capacity = trains × cars ×
   capacity × round-trips/day (platform length caps cars), counted *per direction past a point*.
   A line's `demand` is its **peak directional link volume** (busiest segment), unit-matched to
   capacity so `demand / capacity` is a true load factor; `board` is total boardings (riders).
   Overcrowding caps served passengers and lowers line *desirability* → less demand and slower
   land growth nearby. Journeys count round-trip (commuters).
5. Served passengers drive **land value & development growth** along the line.

### Running costs & the workforce (`hr.js`)

Owning a network is no longer free — there's a real economic deterrent against
carpeting the map with rails:

- **Maintenance** (daily): per-km permanent-way upkeep (dearer on tunnels/bridges
  and electrified track) + per-car rolling-stock upkeep (rises with a train's age).
- **Payroll** (daily): headcount scales with track-km, station commerce tiers, train cars
  and HQ overhead. You set a company-wide **wage level**; it's measured against a
  **prevailing wage** that rises with the era and a **tight labor market**.
- **Morale** (yearly drift) responds to pay (vs. the going rate) and **overwork**
  (sustained crowding + breakneck expansion). It feeds back into effective
  capacity and construction speed; chronically low morale risks a **strike**
  (a company-scoped service collapse). Underpaying the market also leaves you
  **short-staffed** — slower builds — and booms (1955, 1964) tighten labor further.
- **Annual awards** recognize the best & worst operators (employee satisfaction,
  largest network, most passengers, most profitable) plus one-time milestones,
  paying modest PR money and nudging morale/reputation.

The **Imperial Palace** and its grounds/moat (within `LAND.palaceRadius` of CENTER)
are **national land**: never for sale and not buildable — lines must route around
the Kokyo, as they do in real Tokyo.

### Lines: fares, loops & the Property panel

- **One-knob fares.** The Lines panel has a **Default fare ¥/km** box that prices
  *every* line at once. Each line carries an **Override** checkbox — tick it to pin
  that line's own fare so the default leaves it alone; untick it to snap back to the
  default. Until you set the box it tracks the era-comfortable rate, so new lines are
  never mis-priced for their era (`companyDefaultFare` / `setCompanyDefaultFare`).
- **Loop lines.** A line can be a **one-way closed circuit** instead of an
  out-and-back service: tick *Loop line* in the line builder and pick 3+ stations.
  The path closes back to the first station (`path[0]===path[end]`), trains
  **circulate without reversing**, and successive trains run **opposite directions** —
  odd-numbered clockwise, even-numbered counter-clockwise (`nextTrainDir`). Loops cycle
  the network faster (a train passes each stop once per lap), and the O-D model closes
  the routing graph so riders can travel either way around the ring.
- **Property panel.** A portfolio view of everything you own — stations, track and
  non-rail land — with each asset's **quantified demand, income and running cost** and
  one-tap upgrades. Each station lists the **lines passing through it and their type**
  (local/express, loop); tap a station to trace its lines on the map. Clicking a station
  hex on the map highlights **all** lines through every station sharing that hex.

### Buyouts: protecting young railways

Acquiring a rival is **impossible until it has traded for `CFG.BUYOUT.minYearsInBusiness`
(5) years** — early upstarts (player- or AI-founded) get room to find their feet instead
of being swallowed immediately. Enforced in `buyOutCompany`, so it applies to both the
player's acquisitions and AI mergers; the Companies panel disables the Buy-out button and
shows how long a young rival stays protected.

### Station commerce — "ekinaka" (`CFG.COMMERCE`)

A station can be a business in its own right, not just a stop. Income scales with
**footfall** (passengers passing through) and the **economic cycle**; **maintenance**
is a fixed annual lump owed regardless of demand and climbs steeply with each tier,
so high tiers are a gamble — lucrative on a busy hub, a money pit on a quiet one.
All figures are Meiji-scale and inflation-indexed; build costs also fold in a share
of the hex's land value. Each tier shows a **distinct glyph** on the station hex.

| Tier | From | Style | Notes |
|------|------|-------|-------|
| 1 | 1876 | Platform vending | **Automatic** once invented — a meagre, free trickle at every open station |
| 2 | 1880 | Station shops & kiosks | First paid upgrade (the JR "kiosk" lineage) |
| 3 | 1950 | Retail & restaurant concourse | Postwar station retail; higher cost/upkeep/upside |
| 4 | 1960 | Station shopping mall | Terminal department-store era, on railroad-owned land |
| 5 | 2000 | Integrated station city | The ekinaka boom — in-gate retail cities (ecute, GranSta) |

Tiers are built **one step at a time** (Manage station → *Develop…*), each with a
long, realistic construction period. The **Finance** panel breaks revenue down into
**fares / land rent / station commerce**, lists your **non-rail land holdings** and
their estimated rent, and reports annual **commerce upkeep**.

---

## 2. Asset System (placeholders active until you supply art)

Drop PNGs into `assets/` matching the manifest in `js/render.js` (`ASSET_MANIFEST`).
Missing assets fall back to clean procedural placeholders.

| Key pattern                | Size (px) | Notes |
|----------------------------|-----------|-------|
| `tile_<terrain>_<era>.png` | 48×42     | pointy-top hex tile, transparent corners; era ∈ meiji/taisho/showa1/showa2/heisei/reiwa |
| `cons_<type>_<era>.png`    | 32×32     | rice, road, shop, house, apartment, school, civic |
| `station_l<1-3>.png`       | 32×32     | station sizes |
| `commerce_l<1-5>.png`      | 16×16     | per-tier ekinaka badge (vending → station city); procedural glyph fallback |
| `train_<type>.png`         | 24×12     | drawn rotated along track |
| `icon_<name>.png`          | 16×16     | UI icons |

All layers draw in order: terrain → constructions → track → stations → trains → tint.

---

## 3. Hex Names (`data/machinames.js`, `data/hexnames.js`)

Every hex is named with a **real Shōwa-era 町名** (machi name in use between the Great
Kantō Earthquake reconstruction and the 1960s–70s 住居表示 mergers that abolished most of
them — e.g. 木挽町, now part of 銀座). `data/machinames.js` holds pools of genuine machi
grouped by the old (pre-1947) wards; `assignAreaNames()` (map.js) hands each ward the
nearest hexes and gives them distinct machi by proximity, so the dense city reads like a
pre-1960 kiriezu — no directional prefixes, no 丁目 block numbers. The palace hex is
皇居 / Kokyo. The sparse periphery (bay, mountains, neighboring prefectures) the city pools
don't reach falls back to the nearest district anchor's real name, so far-flung cells can
repeat (coarser). Naming is purely positional, so it regenerates identically on load.

Pools are best-effort and not yet exhaustive; the central wards are richly and uniquely
named, while the outer suburbs are coarser. Adding more names to `data/machinames.js`
sharpens coverage outward.

To override individual hexes, key them by spiral index (center = 0, then clockwise rings;
the spiral index is shown in the inspector):

```js
window.HEX_NAMES = {
  0: "皇居 (Kokyo)",
  // ... spiralIndex: "name"
};
```

---

## 4. Save Format

Versioned JSON (`{ v, savedAt, state }`), compact but human-readable keys. Import is
validated: structural whitelist, numeric clamping, string length limits; user strings are
only ever rendered with `textContent` (no HTML injection).
