# Tokyo Railroad Tycoon

**Version 0.5.9** — timetables, achievements and Paris:

- **Peak/off-peak timetables** (replaces the old rush/daytime-only toggles):
  each line's panel now sets how many trains run OFF-PEAK (idle the rest —
  they park at a platform in the animation and stop costing crew hours and
  wear) and how many **rush extras** join for the peak. Extras are REAL
  trains drafted from depot-stored stock — no depot or no compatible spares
  means no extras. Capacity follows the binding window (the peak carries
  ~55% of riders in ~33% of the day), so a thinned trough roster usually
  keeps every rider while banking payroll; extras relieve genuine crush
  loads at overtime crew rates. Extras visibly roam their line during rush
  hours and return to the depot after.
- **Achievements** (🏆 on the start screen): 16 cross-game goals — from the
  Golden Spike to campaign-flavored ones like *Yamanote Dream* / *The Circle
  Line* / *La Petite Ceinture* (loop line with 8+ stations) and landmark
  routes. Earned achievements persist across games and maps.
- **Paris campaign**: unlocked by earning **5 achievements across 2+ maps**
  (any difficulty). The Seine crosses the map east→west; the **Louvre**,
  **Arc de Triomphe** and **Eiffel Tower** stand as state-held landmark
  hexes with their own art; five routes nationales radiate from Châtelet;
  Belle-Époque display eras, franc prices, French rival compagnies.
- **Through-service agreements**: when two companies hold MUTUAL trackage
  rights, their networks run coordinated timetables — the transfer penalty
  between their lines drops (same-company transfers improve too). Capable
  AIs now buy reciprocal rights to form these partnerships.
- **Per-line P&L**: each line's panel shows its daily fare take against its
  apportioned share of payroll, permanent-way and rolling-stock upkeep.
- **Assignment damping fix** (bugfix): two parallel lines could fall into a
  period-4 rider oscillation (one line emptying entirely every fourth day);
  heavier crowding-feedback damping converges it.
- Debug mode on the start screen unlocks every campaign for testing; NYC's
  Hudson and East rivers now always rise off the top map edge.

The previous **v0.5.9** pass:

- **Corridor parcels convey** (bugfix): laying track on unowned market land
  now transfers the hex to the builder at the discounted corridor rate
  (`LAND.rowShare` × market price) — the district's buildings stay and keep
  developing beside the rail. Named holdouts and the government kaidō still
  sell passage only.
- **Pointer picking fixed** (bugfix): the canvas viewport size could go stale
  when the layout changed without a window `resize` (panel expand/collapse),
  offsetting the picked hex from the pointer. A `ResizeObserver` plus a
  stale-size guard in `pickHex` keeps pointer math exact.
- **Smaller palace footprint**: the inner-moat area shrinks from 37 hexes to
  7 (moat ring at radius 2), returning the old inner city to play.
- **Land grants resized**: kazoku start with a 2-hex central plot plus a
  4-hex outer plot; zaibatsu with one 4-hex outer plot.
- **Single-track meets**: on single track, opposing trains pass each other
  only at stations or double-tracked hexes (passing loops). The animation
  shows trains held at loops (red home signal) while oncoming or faster
  services clear; economically each meet costs round-trip minutes scaled by
  the line's still-single-tracked share, flowing into trips/day (capacity →
  demand & income), rider wait cost, and crew payroll. The Lines panel
  itemizes the loss; double-tracking removes it.
- **Double-track art**: a double-tracked hex now draws two distinct parallel
  tracks (own tie beds, wider ballast); damaged track draws the actual
  wreckage — a torn gap, buckled rail ends, debris — instead of a red ✕.
- **Cheaper boarding charge**: the founding per-journey service charge drops
  to ¥0.1 (was ¥0.5).
- **Hard-AI ekimae ventures**: hard rivals now play the Kobayashi Ichizō
  gamble — an infill station in a quiet spot on a commerce-connected line,
  buying the land around it and raising housing and shops so the station
  makes its own riders.

The v0.5.8 "Living Corridor" cycle
([`docs/PLAN-v0.5.8.md`](docs/PLAN-v0.5.8.md)) is implemented: an
engagement-and-depth cycle aimed at tycoon/OpenTTD veterans. The hex grid is
now **1 hex = 500 m** (station spacing lands every ~2 hexes, matching real
Tokyo's ~1 km average; the 50×50 map tightens onto roughly the 23 special
wards), hexes are **living districts** that keep their villages and buildings
when rail runs through them (track buys a *right-of-way*, not the whole
parcel — the ekimae land-value-capture play is back: buy the district around
your planned station), **link capacity & double-tracking** make corridors a
real network puzzle (a second same-gauge rail doubles a hex's throughput;
widening the right-of-way through the built-up city costs today's land
value), **asset aging & breakdowns** turn the mid-game into a
renewal-vs-expansion management loop (worn track breaks down and slows
lines; renewal actions reset it — verified solvent through the full
1872–2028 run on two seeds), **service planning** adds per-line management
levers (skip-stop patterns, rush-hour extras, daytime-only span), and the
Lines panel surfaces link load and reliability so the new depth stays
legible. One coordinated save-schema break to **v13**. Explicitly out of
scope: freight, signals/junctions, per-part train upgrades, scenario modes.

Scoped down for time, tracked as follow-ups (see plan §7-8, non-blocking):
London/NYC/Melbourne terrain-proportion redesign for the new scale (the
mechanical economy rescale is complete for all four campaigns; only the
cosmetic geography pass is deferred), AI double-tracking response and the
Lines-panel bulk double-track action, AI renewal budgeting, the corridor
load/condition map overlays, and the per-line "why did ridership change?"
ledger.

v0.5.6 highlights — the world gets bigger and the endgame gets harder. Two new
campaigns: **New York** (the harbor, the Hudson and East River, the four
colonial post roads, Gilded Age → Fiscal Crisis → Revival eras, $ pricing) and
**Melbourne** (Port Phillip Bay, the Yarra, five arterials out of Flinders
Street, Marvellous Melbourne → Land Bust → Federation eras, £ pricing with the
1966 decimal changeover). A **campaign registry** (`CFG.CAMPAIGNS`) replaces
the scattered string compares, and the **unlock chain** is now earned:
London unlocks by completing Tokyo; **New York** requires completing BOTH
Tokyo and London (victory screen) with at least ONE of them at 難しい
Muzukashii difficulty or higher; **Melbourne** requires completing all three
maps with at least TWO at Muzukashii or higher. Late-game challenge (plan §1a/§3):
two **late AI entry windows** — a postwar reconstruction operator (1946–1955)
and a publicly backed transit authority (1958–1968) — enter with era-scaled
capital and a hard profile, capable AIs now **electrify their networks** when
the lab delivers, and from 1946 ambitious rivals get a **second wind**
(reduced size brake, extra expansion appetite) so strong competitors keep
contesting corridors all the way to 2028. Save schema v12 (older Tokyo/London
saves still load).

v0.5.5 highlights — the property economy grows up. Buildings now have
**occupancy**: tenants follow district demand, transit access and the
population trend, and split across competing space nearby, so rent is earned
parcel by parcel instead of automatically (a building bought with the land
keeps its sitting tenants; a new development opens ~15% full and fills — or
doesn't — with the district). Every owned building owes a fixed **upkeep**
whether or not it's occupied, so overbuilding a dead district loses real
money, while pairing a development with a well-run line fills it. The old
"civic/office complex" build splits into a **small office** and a true
**office building** (from 1923) an order of magnitude apart in cost, rent
ceiling and upkeep. Map-seeded **schools and civic halls are public buildings**
now — the land under them is never for sale, so railways route around the
schoolhouse. A **population manager** composes the era's demographic tide, the
business cycle, war, quake reconstruction and how much rail service the region
enjoys into a single yearly trend that scales all organic growth and
residential occupancy (see Finance → "Population trend"). The tile inspector
and purchase dialog now itemize what a parcel actually earns and costs —
building, occupancy, rent/yr, upkeep/yr, property tax/yr — and the Property
portfolio shows occupancy and upkeep per parcel.

v0.5.4 highlights: **separate music (BGM) and sound-effects (SFX) volume bars**
in the System → Settings menu (each channel is set and persisted independently);
rival boards now **hold out against buyouts** for randomized/financial reasons
(a confident, solvent railway won't sell at any price this year, while distress
brings it to the table); **IC card ticketing** is year-gated to its realistic
Suica-era arrival (2001); two new researchable/licensable programmes —
**high-acceleration EMUs** and **lightweight carbodies** — each unlock a new
high-capacity commuter EMU in the depot; and smarter AI R&D (impact-weighted
tech choices, crash programmes on hard) and more opportunistic AI buyouts.

v0.5.3 highlights: a playable London campaign pass — London's geography is now
realistic (no sea, no mountains, only a thin tidal marsh fringe; the Thames
runs west→east off the map edge), farms grow **wheat** (own sprite) instead of
rice, and one-of-a-kind landmark sprites: the **Imperial Palace** (Tokyo), the
**Palace of Westminster**, **castles** (Buckingham Palace, the Tower of
London), **London Bridge** carrying the turnpikes over the Thames, and **Tower
Bridge** on the river by Parliament. Royal land is held by the Crown / House
of Windsor (was "Imperial"). London also unlocks by loading a London save,
London exports default to `london-railroad-tycoon-<year>.json`, and after a
Tokyo victory the end screen routes to the full start screen to configure the
London game (class, rivals, difficulty, speed). Disasters can now raze
buildings outright (with a `hex_destroyed` SFX slot), the System menu shows
everyone's difficulty, and in-game "New game" reopens the start screen.

v0.5.1 highlights: depots now gate fleet size (max 2 trains/line without one;
line deletion without a depot auto-sells the stock, and running trains can be
pulled INTO the depot without deleting their line), a Lines-panel overlay that
draws every operating route at once, roadside development along the kaidō,
hard water-map invariants (rivers always reach the sea and stay one hex wide;
the sea always touches the map edge), pooled audio elements (fixes SFX/BGM
going silent in late Heisei), and a London pass: £ currency, English rival /
landholder names, the historic turnpike roads, and campaign-correct titles.
The v0.5.2 plan (not yet implemented) lives in `docs/PLAN-v0.5.2.md`.

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
| `js/config.js`     | All tuning constants: eras, the causal `INFLATION` params, terrain, train types, prices, economy knobs, `TAISHIN` seismic standards, disaster/war params |
| `js/util.js`       | Seeded RNG (mulberry32), value noise, formatting, min-heap, `queueSfx` sink |
| `js/map.js`        | Hex math (odd-r offset + cube), 50×50 procedural terrain generation, spiral indexing |
| `js/world.js`      | Companies, land purchase, A* track planning, construction queue, stations, lines, trains, trackage-rights, buyouts |
| `js/sim.js`        | **Passenger origin–destination simulation**, network routing, capacity/crowding, daily finance (incl. maintenance & payroll), land-value/development growth |
| `js/hr.js`         | **Workforce**: headcount, payroll, morale, the labor market, strikes, and the annual awards ceremony |
| `js/ai.js`         | up to 6 computer opponents: staggered market entry, **demand-driven expansion** (underserved-demand targeting off the shared demand field), pricing, fleet renewal, wage policy, acquisitions; per-AI difficulty (see `CFG.AI.DIFFICULTIES`) |
| `js/events.js`     | Random + flavored events; **constant-frequency minor quakes** whose damage falls with resilience, **major quakes** (per-playthrough budget), a fully **randomized major war** (chance/timing/duration/severity curve), per-type damage profiles + shaped recovery — repairs are paid, day by day (`sim.js`) |
| `js/rd.js`         | **R&D**: private-railway tech tree (steel rails, block signalling, air brakes, auto-gates, regen braking, VVVF, IC cards) with prereq chains, funding-scaled speed, inter-company licensing, automatic industry standards (dev-model, taishin, through-service), inflation-scaled costs, company-wide effect multipliers, and AI research |
| `js/save.js`       | localStorage autosave/manual save, export/import JSON with validation & sanitization |
| `js/render.js`     | Canvas rendering: devicePixelRatio-aware backing store, supersampled cache + vector redraw at high zoom (crisp at every zoom), **bold hex-filling terrain/building art for zoomed-out identifiability**, day/night tint, era palettes |
| `js/audio.js`      | Per-era BGM crossfades + event SFX; reads `assets/audio/manifest.js`; degrades silently on missing files; volume/mute persisted |
| `js/ui.js`         | Panels (Build / Lines / Finance / Property / **R&D** / Workforce / Companies / Log / System), interaction modes, dialogs, audio controls |
| `js/main.js`       | Game state factory, fixed-step main loop (days), **causal `updateInflation`**, boot/glue |
| `tools/smoke.js`   | Headless Node smoke test of the simulation core |
| `tools/balance.js` | Headless 156-year economy trace (the AI plays the player's seat); prints per-decade cash / km / riders / rev-cost ratio for retuning `config.js` |

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
  econ: { cycle, commuteFactor, priceLevel, priceHist, rebuild, postwar },  // macro + causal inflation
  war: { active, years, peak, profile, inten } | null,   // randomized major war
  labor: { tightness, wageMult, scarcity },    // labor market (drives the prevailing wage)
  events: { log, active, majors },             // majors = years of major quakes (≤2 / playthrough)
  awardsLast: { year, results:[…] },           // last year-end awards ceremony (for the UI)
  od: { dirty, lastAssign }                    // O-D assignment cache
}

Hex      = { col,row, terrain, cons, dev, owner, value,
             track:{co,tunnel,dmg, built, gauge,elec, rails:[{gauge,elec,building}]}|null,  // co owns the
             //   permanent way; built = year laid/last renewed (seismic resilience). It can carry 1+
             //   parallel RAILS of different gauges (trains never run between them, only alongside).
             //   a rail with building:true is mid-construction (adding/regauging) and out of service.
             stations:[id], spiral, name }
Company  = { id,name,color,isPlayer,founded,cash,gauge, land:Set, trackHexes:Set,
             rights:Set, stats:{pax,rev,cost,history,morale}, alive, ai:{...},
             wageLevel, morale, reputation, awards:[],            // workforce / HR
             research:{done:[key], active:{key,daysLeft,fund}|null, leased:{key:coId}},   // R&D (rd.js)
             defaultFarePerKm, defaultFareSet,                    // company-wide default ¥/km for lines
             _opCost, _headcount, _productivity, _buildSpeed, _strikeDays }   // derived (not saved)
Station  = { id,co,hex,cars,name,builtYear, board, boardAvg,  // cars = platform length
             commerce, commerceBuilding, commercePending,   // ekinaka tier (0–5) + works countdown
             renewed, taishin, taishinBuilding, taishinPending }  // seismic: last-renewal year + code level
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
  │    ├─ construction queue progress (~30 calendar days of work, crew-limited:
  │    │   only CFG.TRACK.crewsByEra km of civil works advance simultaneously)
  │    ├─ disaster repairs (paid day-by-day; unpaid damage stays broken)
  │    ├─ O-D reassignment if network/prices dirty (or every sim-day)
  │    ├─ passenger counts (blended weekday/weekend ×, rush phases, events, capacity caps)
  │    ├─ fare revenue + land rent + station commerce − OPERATING COSTS (per-km/per-car
  │    │   maintenance + payroll + commerce upkeep, scaled by morale); growth; AI decisions
  │    └─ yearly: year-end levy (property tax + station upkeep), fare indexation
  │       (default-following fares snap to the era rate; pinned fares keep their
  │       REAL value through the CFG.INFLATION anchor curve), insolvency wind-ups,
  │       WORKFORCE PASS (labor market, AI wage policy, morale drift, strikes)
  │       + AWARDS CEREMONY, era checks, events, autosave, buyout checks
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
| `cons_<type>_<era>.png`    | 32×32     | rice, road, shop, house, apartment, school, civic (the `rice` type renders as a **wheat field** in the London campaign) |
| `landmark_<key>.png`       | 32×32     | one-of-a-kind places: imperial_palace, parliament, castle, london_bridge, tower_bridge |
| `station_l<1-3>.png`       | 32×32     | station sizes |
| `commerce_l<1-5>.png`      | 16×16     | per-tier ekinaka badge (vending → station city); procedural glyph fallback |
| `train_<type>.png`         | 24×12     | drawn rotated along track |
| `icon_<name>.png`          | 16×16     | UI icons |

All layers draw in order: terrain → constructions → track → stations → trains → tint.

Until you supply PNGs the game draws **procedural vector art** (v0.5 redesign):
bold, hex-filling building silhouettes with a dark outline (house / apartment /
shop / school / civic / rice / road) and strong terrain textures (snow-capped
massifs, contour hills, reedy swamp, water bands, moat revetment). The goal is
that every terrain and building type is identifiable **at the zoomed-out view**,
not just close up. Era mood is still set by the `ERA_TINT` overlay, and building
silhouettes evolve slightly across the eras (taller towers, modern shop signage).

## 2a. Audio (`js/audio.js`, `assets/audio/`)

Background music and sound effects are driven by a manifest that maps semantic
names to filenames, so you can add audio incrementally — **a slot with no file
present is silently muted, never an error.** A mute toggle lives in the top bar
(🔊); the System → Settings panel adds **independent volume bars for music (BGM)
and sound effects (SFX)**. All three persist across sessions.

**Folder convention**

```
assets/audio/
  manifest.js              ← the manifest (a .js file, see note below)
  bgm/   <era>.mp3         ← one looping track per era / monarch
  sfx/   <event>.mp3|.wav  ← one clip per game event
```

The extension is whatever the manifest says — `.mp3` and `.wav` both work. If a
file is silent after you add it, check the manifest's filename matches the one
on disk (extension included).

**Why `manifest.js` and not `manifest.json`:** the game is meant to be opened
as a local file (`file://`), and browsers refuse to `fetch()` a local `.json`.
A `<script>` that assigns `window.AUDIO_MANIFEST` loads fine either way, so the
manifest is authored as data in `assets/audio/manifest.js`. Edit the filenames
there if you name your files differently.

**BGM slots** (drop `assets/audio/bgm/<file>`): one per era key. Tracks **loop**
and **crossfade** into each other as the years roll into a new era. The **Tokyo**
campaign is keyed by Japanese era; the **London** campaign is keyed by reigning
monarch (`CFG.BGM_LONDON`).

*Tokyo (Japanese eras):*

| Era key  | Years      | Default filename       |
|----------|------------|------------------------|
| `meiji`  | 1872–1911  | `meiji.mp3`            |
| `taisho` | 1912–1925  | `taisho.mp3`           |
| `showa1` | 1926–1945  | `early_showa.mp3`      |
| `showa2` | 1946–1988  | `post_war_showa.mp3`   |
| `heisei` | 1989–2018  | `heisei.mp3`           |
| `reiwa`  | 2019–2028  | `reiwa.mp3`            |

*London (reigning monarch):* Elizabeth II's 70-year reign is split across **two**
tracks; Edward VIII's abdication year (1936) gets its own; Charles III (Carolean)
has no track yet, so it **borrows `reiwa.mp3`**.

| BGM key             | Reign / years              | Default filename          |
|---------------------|----------------------------|---------------------------|
| `victoria`          | Victoria · 1872–1900       | `victoria.mp3`            |
| `edwardvii`         | Edward VII · 1901–1909     | `edwardvii.mp3`           |
| `georgev`           | George V · 1910–1935       | `georgev.mp3`             |
| `edwardviii`        | Edward VIII · 1936         | `edwardviii.mp3`          |
| `georgevi`          | George VI · 1937–1951      | `georgevi.mp3`            |
| `elizabethii_early` | Elizabeth II · 1952–1986   | `elizabethii_early.mp3`   |
| `elizabethii_late`  | Elizabeth II · 1987–2021   | `elizabethii_late.mp3`    |
| `carolean`          | Charles III · 2022–2028    | `reiwa.mp3` *(borrowed)*  |

**SFX slots** (drop `assets/audio/sfx/<file>`): fired at the in-game moment
below. Player-action sounds fire only for **your** company (AI actions are
silent).

| Event name          | Fires when…                                            |
|---------------------|--------------------------------------------------------|
| `game_start`        | a new game begins                                      |
| `buy_land`          | you buy a land parcel                                  |
| `build_rail`        | you start a track-hex build                            |
| `build_station`     | you start a station / depot build                      |
| `purchase_train`    | you buy rolling stock                                  |
| `line_created`      | you open a new line                                    |
| `upgrade`           | platform / commerce / **seismic retrofit** / electrify |
| `construction_done` | your track construction completes                      |
| `research_done`     | an R&D project completes                               |
| `disaster_quake`    | an earthquake strikes                                  |
| `disaster_fire`     | a great fire                                           |
| `disaster_typhoon`  | a typhoon                                              |
| `disaster_war`      | an air-raid year during a war                          |
| `hex_destroyed`     | a building is razed outright by disaster or war        |
| `windup`            | a company goes bankrupt / is wound up                  |
| `victory`           | the final standings (game end)                         |
| `train_depart`      | *reserved* — not auto-fired (per-stop would be noise)  |

Audio arms on the first click/keypress (browser autoplay policy). Missing files
are simply skipped, so partial audio sets work fine.

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

## 4. Disasters, seismic resilience & war (`js/events.js`, `CFG.TAISHIN`, `CFG.DISASTER`)

- **Minor earthquakes** fire at the **same rate across the whole timeline**
  (`CFG.EVENTS.minorQuakeChance`). What falls over the years is the **damage**,
  through one composed **resilience** value per asset, not three separate rolls:

  ```
  R = 1 − (1−rEra)(1−rTaishin)(1−rR&D)      (capped at CFG.DISASTER.resilienceCap)
  ```

  - `rEra` — passive construction technique, keyed to the year the asset was
    **built or last renewed** (track: laid / regauged / repaired-to-health;
    station: built, or platform / commerce / seismic works finished). A
    neglected Meiji station never inherits techniques it was never rebuilt with.
  - `rTaishin` — the seismic building **standard** the station was retrofitted
    to. Real Japanese code milestones (`CFG.TAISHIN.STANDARDS`): 1920 Urban
    Building Law, 1924 post-Kantō revision, 1950 Building Standards Act, 1971 RC
    revision, 1981 shin-taishin, 1995 post-Kobe. When a standard takes effect
    you can retrofit a station one at a time (Manage station) or in bulk (Build
    panel); cost/time come from the station-construction + inflation formulas.
    New stations are built to their day's standard automatically.
  - `rR&D` — the structural-engineering research tech (see §5).

  A quake scales both its damage chance and its repair days by `(1 − R)`, so a
  maintained, well-upgraded network visibly rides out shocks that wreck a
  neglected one.

- **Major earthquakes** are a **per-playthrough budget** (`majorQuakeCap` = 2,
  `majorQuakeChance` ≈ 1 %/yr, min gap) — roughly once a century, and a game may
  see none. Severity/recovery (flood-margin surge, slow recovery curve, paid
  repairs) is also reduced by the same resilience factors.

- **Major war** is fully **randomized** and at most one per playthrough (a game
  may have none): any start year, 2–10 years long, a randomized **peak
  severity** (most land well below the historical-worst ceiling) and a
  randomized **intensity curve** across the war window (early climax, slow
  crescendo, or twin peaks). Each war year fires aerial raids scaled to that
  year's intensity; seismic bracing doesn't help against incendiaries (taishin
  is skipped; structural R&D only half-counts).

## 5. R&D (`js/rd.js`, the **R&D** panel)

Companies (player and AI) fund research into real innovations of Japan's
**private** commuter railways (Hankyu, Keio, Tōkyū, Odakyū, …) — not JR /
Shinkansen. One active project at a time; cost is a Meiji figure × inflation
(same scale as everything else). There are **no calendar gates** — progression
is paced by cost and prerequisite chains, and the **funding level** chosen when
a project starts scales cost and speed together (Lean ×0.5 … Crash ×3): more
money in means the technology is developed faster.

Researchable techs (each with a direct, network-wide mechanical effect):

| Tech | Effect |
|------|--------|
| Steel rails | −6 % running cost |
| Tablet block signalling | +6 % effective capacity |
| Automatic air brakes | +5 % capacity, −3 % running cost |
| Automatic ticket gates | −12 % payroll |
| Regenerative braking | −6 % running cost (needs air brakes) |
| VVVF inverter control | −8 % running cost (needs regen braking) |
| IC card ticketing | +5 % revenue, −7 % payroll, +6 % effective capacity (needs auto gates) |

**Licensing:** once any company has developed a tech, others can lease it for a
one-time licence fee (60 % of the development cost) paid to the developer — in
service immediately. AI rivals license the player's inventions (income!) and
the player can license theirs.

**Industry standards (automatic, never researched):** the rail + real-estate
development model (1910, +30 % growth / +25 % commerce), quake-resistant
structural engineering (1925, +0.35 resilience; Tokyo campaign only), and
mutual through-service with subways (1962, +10 % revenue) switch on for every
company at their historical year — they're era strategy, not lab projects.

Effects compose multiplicatively (diminishing returns). AI rivals research too —
difficulty sets how eagerly they invest, so a Hard field out-modernizes a player
who neglects R&D.

## 6. Save Format

Versioned JSON (`{ v, savedAt, state }`), compact but human-readable keys. Import is
validated: structural whitelist, numeric clamping, string length limits; user strings are
only ever rendered with `textContent` (no HTML injection). **v11** marks the v0.5.3
London map reshape (no sea/mountains, Thames bridges & landmarks) — **London**
saves older than v11 are rejected on load, while Tokyo generation is untouched
so v10 Tokyo saves keep loading; **v10** marks the v0.5.1
map-generation change (river/sea invariants, London roads); **v9** added player classes,
loan/arrears state, and the `campaign` field (Tokyo / London); **v8** added seismic fields
(track `built` year; station `renewed` / `taishin`), the randomized `war` state, the
causal price level + recent `priceHist`, and `co.research`; **v7** added disaster
recovery-curve fields.

> **⚠ Save compatibility — v0.5.1 is a clean break.** The current save version is
> **v10** and the minimum accepted version is **also v10** (`SAVE_VERSION` /
> `SAVE_MIN_VERSION` in `config.js`). Terrain is regenerated from the seed on
> load, and v0.5.1 changed map generation itself (rivers must reach the sea and
> stay one hex wide, the sea must touch the map edge, London gained its turnpike
> roads and a connected Thames) — so **an older save's track and stations could
> land on water in the regenerated world**. Loading v9 and earlier is therefore
> rejected with a clear message. Start a fresh game on v0.5.1.

## 7. Balance notes (v0.5)

The economy was rescaled so income and costs share one scale (previously fare
revenue outran all expenses ~250×). Key invariants, checked with
`node tools/balance.js [seed]`:

- **Opening pinch**: `START_CASH` funds one modest line plus the payroll burned
  while building it (a naive-but-sane operator bottoms out near zero, not deep
  in debt).
- **Whole-arc tension**: revenue/cost for a decently-run company sits ~2–5
  early, runs higher (5–12) through the mid-game boom, and compresses to ~1.5–3
  in the Heisei/Reiwa squeeze.
- **Internal consistency**: every yen figure (land, construction, wages,
  maintenance, fares, commerce, R&D) is multiplied by `inflationOf(st, year)`,
  and fares are re-indexed yearly — so no side of the ledger can silently run
  away from the other.
- **Causal inflation (v0.5)**: the fixed historical anchor table is gone. The
  price level is built up year by year from **what happens in this playthrough**
  (`updateInflation`, `main.js`): a baseline drift plus pressure from the
  business cycle, an active **war** (and its postwar overhang) and **great-quake
  reconstruction**. A calm, war-free, quake-free game drifts to ~×11 by 2028; a
  game with a severe war and its rebuild reaches ~×30–36 — two playthroughs no
  longer share one curve. Because costs and income scale by the **same** level,
  the rev/cost *ratio* is unchanged; only nominal yen figures differ. Re-traced
  across seeds after the R&D + inflation changes: opening min-cash ≈ +¥145k, and
  R&D's operating-cost cuts let more rivals survive to 2029 than in v0.4.

## License

Tokyo Railroad Tycoon is free software, released under the
[GNU General Public License v3.0](LICENSE). You may redistribute and/or
modify it under the terms of the GPL-3.0 (or, at your option, any later
version); it is distributed without any warranty.
