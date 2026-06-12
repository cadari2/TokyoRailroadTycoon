# Tokyo Railroad Tycoon

A browser-based railroad tycoon prototype set in fictionalized Greater Tokyo, 1872 (Meiji 5) to 2028 (Reiwa 10).
No build step, no external dependencies. Open `index.html` in desktop Chrome / Safari / Firefox.

---

## 1. High-Level Architecture

### Files / Modules (classic scripts, shared `window` scope, loaded in dependency order)

| File               | Responsibility |
|--------------------|----------------|
| `index.html`       | Shell, canvas, UI panel skeleton, script loading order |
| `css/style.css`    | Retro early-PC business-sim aesthetic (beveled panels, scanline-free CRT palette) |
| `data/hexnames.js` | **Hex name data format** — spiral-index → Taisho-era block names (you supply later) |
| `js/config.js`     | All tuning constants: eras, terrain, train types, prices, economy knobs |
| `js/util.js`       | Seeded RNG (mulberry32), value noise, formatting, min-heap |
| `js/map.js`        | Hex math (odd-r offset + cube), 50×50 procedural terrain generation, spiral indexing |
| `js/world.js`      | Companies, land purchase, A* track planning, construction queue, stations, lines, trains, trackage-rights, buyouts |
| `js/sim.js`        | **Passenger origin–destination simulation**, network routing, capacity/crowding, daily finance, land-value/development growth |
| `js/ai.js`         | 4 computer opponents: staggered market entry, expansion logic, pricing, acquisitions |
| `js/events.js`     | Random + historically-flavored events (earthquakes, typhoons, fires, air raids, booms, bubbles, pandemics, remote work) |
| `js/save.js`       | localStorage autosave/manual save, export/import JSON with validation & sanitization |
| `js/render.js`     | Canvas rendering: cached terrain layer, tracks, stations, trains, day/night tint, era palettes, asset loader with placeholders |
| `js/ui.js`         | Panels (Build / Lines / Finance / Companies / Log / Save), interaction modes, dialogs |
| `js/main.js`       | Game state factory, fixed-step main loop (days), boot/glue |
| `tools/smoke.js`   | Headless Node smoke test of the simulation core |

The simulation core (`map/world/sim/ai/events/save`) never touches the DOM, so it can run headless for testing.

### Core data structures

```js
state = {
  seed, time: { sec, year, day, frac },        // 300 real sec = 1 year, SIMULATED as a
                                               // 7-day week (5 work days + Sat/Sun holidays),
                                               // each day ≈43s with its own day/night cycle;
                                               // every simulated day stands for ~52 calendar days
  hexes: Hex[2500],                            // idx = row*50 + col (odd-r offset)
  companies: Company[], stations: Station[], lines: Line[], trains: Train[],
  builds: BuildJob[],                          // construction queue (takes in-game days)
  econ: { cycle, commuteFactor, adoption },    // macro modifiers
  events: { log, active, majors },             // ≤2 major destructive events / 100 yrs
  od: { dirty, lastAssign }                    // O-D assignment cache
}

Hex      = { col,row, terrain, cons, dev, owner, value, track:{co,gauge,elec,tunnel,dmg}|null,
             stations:[id], spiral, name }
Company  = { id,name,color,isPlayer,founded,cash,gauge, land:Set, trackHexes:Set,
             rights:Set, stats:{pax,rev,cost,history}, alive, ai:{...} }
Station  = { id,co,hex,level,cars,name,builtYear, board }   // cars = platform length
Line     = { id,co,name,path:[hexIdx],stations:[id],stops:{id:bool},type,fare,gauge,elec,
             trains:[id], capacity, demand, served, desirability, color }
Train    = { id,co,line,type,cars, pos,dir }                // pos = distance along path (visual)
Passenger flows are aggregated per O-D station pair (gravity model), not per-agent —
but origins/destinations come from real hex buildings in station catchments, and route
choice is a generalized-cost (fare + time·VOT) Dijkstra over the service network.
```

### Main loop

```
requestAnimationFrame → accumulate real dt
  ├─ advance clock (5 min real = 1 yr = 7 simulated days); on each new DAY (~43s):
  │    ├─ construction queue progress (~52 calendar days of work)
  │    ├─ O-D reassignment if network/prices dirty (or every sim-day)
  │    ├─ passenger counts (workday/holiday ×, rush phases, events, capacity caps)
  │    ├─ fare revenue + land rent accrual; development & land-value growth; AI decisions
  │    └─ yearly: YEAR-END LEVY (property tax + station upkeep lump — the only
  │       recurring costs; no track/train maintenance), era checks, events,
  │       fare inflation-indexing, autosave, buyout checks
  ├─ move visible trains along line paths (continuous, for engagement)
  └─ render (cached terrain + dynamic layers + smooth cosine day/night tint)
```

Track is laid **one hex at a time**: pick the Lay Track tool, click a hex, and
confirm the quoted construction + land cost and build time. Inspect mode keeps
the clicked tile selected with a persistent detail card (terrain, residents,
commerce population, owner, value/asking price) including offers to buy parcels
from other companies at a markup — they refuse if infrastructure sits on it.

### Passenger O-D model (the heart)

1. **Catchments**: every station collects population (houses/apartments) and attractions
   (shops/schools/civic/jobs) from hexes within radius 2, distance-weighted, split between
   overlapping stations.
2. **Service network**: stations are nodes; each line contributes edges between consecutive
   *stop* stations (time = dist/speed + dwell; cost = fare). Transfers cost +5 min.
   Trackage rights let lines run over partner track of a compatible gauge.
3. **Gravity demand** per station pair: `pop_i · att_j · adoption · econ / f(cost)`, with a
   logit mode share against a non-rail alternative (walking → buses → cars by era).
4. **Assignment** loads flows onto lines; daily line capacity = trains × cars × capacity ×
   round-trips/day (platform length caps cars). Overcrowding caps served passengers and
   lowers line *desirability* → less demand and slower land growth nearby. Journeys count
   round-trip (commuters).
5. Served passengers drive **land value & development growth** along the line.

---

## 2. Asset System (placeholders active until you supply art)

Drop PNGs into `assets/` matching the manifest in `js/render.js` (`ASSET_MANIFEST`).
Missing assets fall back to clean procedural placeholders.

| Key pattern                | Size (px) | Notes |
|----------------------------|-----------|-------|
| `tile_<terrain>_<era>.png` | 48×42     | pointy-top hex tile, transparent corners; era ∈ meiji/taisho/showa1/showa2/heisei/reiwa |
| `cons_<type>_<era>.png`    | 32×32     | rice, road, shop, house, apartment, school, civic |
| `station_l<1-3>.png`       | 32×32     | station sizes |
| `train_<type>.png`         | 24×12     | drawn rotated along track |
| `icon_<name>.png`          | 16×16     | UI icons |

All layers draw in order: terrain → constructions → track → stations → trains → tint.

---

## 3. Hex Name Data Format (`data/hexnames.js`)

Hexes are numbered **from the center hex (index 0) outward in clockwise spiral rings**
(ring 1 = indices 1–6 starting east of center, ring 2 = 7–18, …). Supply Taisho-era block
names as:

```js
window.HEX_NAMES = {
  0: "日本橋",
  1: "京橋",
  // ... spiralIndex: "name"
};
```

Unnamed hexes display their spiral index. The spiral index of any hex is shown in the
inspector panel so you can map names easily.

---

## 4. Save Format

Versioned JSON (`{ v, savedAt, state }`), compact but human-readable keys. Import is
validated: structural whitelist, numeric clamping, string length limits; user strings are
only ever rendered with `textContent` (no HTML injection).
