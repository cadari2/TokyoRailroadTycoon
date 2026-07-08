/* =========================================================================
 * config.js — All tuning constants for Tokyo Railroad Tycoon.
 * Everything balance-related lives here so the game can be retuned in one place.
 * ========================================================================= */
"use strict";

const CFG = {
  VERSION: "0.5",                      // game release version (distinct from SAVE_VERSION)
  MAP_W: 50,
  MAP_H: 50,
  CENTER: { col: 25, row: 25 },          // fictional Nihonbashi / Edo center

  YEAR_SECONDS: 300,                      // 5 real minutes = 1 in-game year (at yukkuri speed)
  // The year runs on a 12-month CALENDAR: each simulated step is one month
  // (January…December), played out as a ~25-second representative day with its
  // own day/night rush cycle. Every simulated month stands for ~30 calendar
  // days of traffic and construction progress, and folds an average mix of
  // weekdays and weekends into its ridership (see PAX.holidayMult).
  DAYS_PER_YEAR: 12,                      // simulated months per year (the calendar)
  // Game-speed presets chosen on the start screen (real-time multiplier on
  // YEAR_SECONDS). yukkuri ゆっくり is the base 5-minute year.
  SPEEDS: [
    { key: "katatsumuri", name: "カタツムリ Katatsumuri (½×)", mult: 0.5 },
    { key: "yukkuri",     name: "ゆっくり Yukkuri (1×)",        mult: 1   },
    { key: "sakusaku",    name: "サクサク Sakusaku (2×)",       mult: 2   },
    { key: "isoge",       name: "急げ Isoge (5×)",             mult: 5   },
  ],
  DEFAULT_SPEED: "yukkuri",
  CAL_DAYS_PER_SIM_DAY: 365 / 12,         // calendar days represented by one simulated month
  TRAIN_VISUAL: 0.05,                     // visual hex/sec per km/h (aesthetic scale)
  TRAIN_DWELL_SEC: 0.9,                   // real seconds a train pauses at each scheduled stop
  START_YEAR: 1872,
  END_YEAR: 2028,                         // Reiwa 10 — game ends Jan 1, 2029

  START_CASH: 750000,                     // Meiji yen. Under the v0.4 cost scale this funds roughly ONE
                                          // modest starter line (track + land + two stations + a train)
                                          // plus the payroll burned while it's built — the opening years
                                          // are meant to pinch, not strangle.
  AI_COUNT: 6,                            // default number of computer rivals (max — limited by AI.entryWindows/names/colors)

  // ---- Player classes (v0.5) ---------------------------------------------
  // The social standing the player starts from. It sets starting capital,
  // the Kangyō-Bank credit terms (creditFactor × company assets = borrowing
  // ceiling; rate = annual interest), and any starting land grants. No other
  // bonuses — a heimin who survives plays the same game as a kazoku.
  // grants: list of plots given at game start; each is 2–3 contiguous hexes
  // near the named ring ("palace" = just outside the palace grounds,
  // "central" = the inner city outside the palace area, "outer" = mid-ring).
  PLAYER_CLASSES: {
    kazoku:   { name: "華族 Kazoku",   difficulty: "易しい Yasashii",   startCash: 1300000,
                creditFactor: 0.90, rate: 0.040, grants: ["palace", "outer"] },
    zaibatsu: { name: "財閥 Zaibatsu", difficulty: "普通 Futsuu",       startCash: 850000,
                creditFactor: 0.60, rate: 0.065, grants: ["central"] },
    shizoku:  { name: "士族 Shizoku",  difficulty: "難しい Muzukashii", startCash: 520000,
                creditFactor: 0.45, rate: 0.090, grants: [] },
    heimin:   { name: "平民 Heimin",   difficulty: "無理 Muri",         startCash: 300000,
                creditFactor: 0.35, rate: 0.120, grants: [] },
  },
  DEFAULT_PLAYER_CLASS: "zaibatsu",
  // hex-distance rings (from CENTER) each grant anchor is drawn from
  GRANT_RINGS: { palace: [3, 5], central: [5, 9], outer: [12, 18] },

  // ---- Kaidō corridors (v0.5) ---------------------------------------------
  // Four named government highways radiating from Nihonbashi. Fixed hexes for
  // the whole game (per-seed jitter at generation only). The land under them
  // is government-held (owner -3) and can never be bought — companies buy
  // CROSSING RIGHTS per hex to lay track across; rights persist on the hex.
  // States evolve with the era: dirt → paved (spreading outward 1945–60) →
  // highway (from 1960); a better road is a stronger non-rail alternative and
  // dearer to get rights over.
  KAIDO: {
    ROUTES: {
      tokaido: { name: "東海道 Tōkaidō",      angle: 115 },  // S/SW toward Shinagawa/Yokohama
      koshu:   { name: "甲州街道 Kōshū Kaidō", angle: 187 },  // west via Naitō-Shinjuku
      nikko:   { name: "日光街道 Nikkō Kaidō", angle: 285 },  // north via Senju
      oshu:    { name: "奥州街道 Ōshū Kaidō",  angle: 320 },  // splits north-east
    },
    angleJitter: 14,          // deg, per-seed once per route
    wobble: 18,               // deg, per-step drunkard wobble
    rightsBase: 9000,         // Meiji ¥/hex for crossing rights on a dirt road
    rightsStateMult: { dirt: 1, paved: 2.5, highway: 6 },
    paveFrom: 1945, paveTo: 1960,     // paving spreads outward over these years
    highwayFrom: 1960, highwayTo: 1972,
    // alt-mode strength: multiplies the walk/bus/car alternative's per-km cost
    // near the corridor (lower = stronger alternative, see assignOD)
    altMult: { dirt: 1.0, paved: 0.88, highway: 0.72 },
  },

  // ---- Eras --------------------------------------------------------------
  ERAS: [
    { key: "meiji",  name: "Meiji",       from: 1872, to: 1911 },
    { key: "taisho", name: "Taisho",      from: 1912, to: 1925 },
    { key: "showa1", name: "Early Showa", from: 1926, to: 1945 },
    { key: "showa2", name: "Late Showa",  from: 1946, to: 1988 },
    { key: "heisei", name: "Heisei",      from: 1989, to: 2018 },
    { key: "reiwa",  name: "Reiwa",       from: 2019, to: 2028 },
  ],

  // ---- Inflation (causal) -------------------------------------------------
  // The purchasing-power index every yen figure is multiplied by (land,
  // construction, wages, maintenance, fares, commerce — all flow through
  // inflationOf, so costs and income scale TOGETHER by construction).
  //
  // No longer a fixed historical table: the price LEVEL is now built up year
  // by year from what actually happens in THIS playthrough (see
  // updateInflation in main.js). A calm game with no war and no great quake
  // drifts up gently; a game with a bad war and its reconstruction can spike
  // many times higher. Two playthroughs no longer share one price curve.
  //   priceLevel *= 1 + rate, where the annual rate is:
  //     driftPerYear                          secular creep, calm economy
  //   + cycleWeight  · (econ.cycle − 1)       booms inflate, slumps deflate
  //   + warWeight    · war.inten              wartime spending (lagged 1 yr)
  //   + postwarWeight· war.peak · decay       postwar overhang after a war
  //   + rebuildWeight· quake.k                reconstruction after a great quake
  //   (clamped to [yearRateMin, yearRateMax]; level never drops below base)
  INFLATION: {
    base: 1.0,                // 1872 price level
    driftPerYear: 0.014,      // secular creep in a calm economy (≈ ×8–9 over 156 yrs)
    cycleWeight: 0.03,        // × (econ.cycle − 1)
    warWeight: 0.14,          // × this year's war intensity (0..1)
    postwarWeight: 0.24,      // × war peak, decaying over the postwar window
    postwarYears: 4,          // length of the postwar inflation window
    rebuildWeight: 0.06,      // × great-quake reconstruction pressure
    rebuildYears: 3,          // length of the reconstruction window
    yearRateMin: -0.03,       // bounded deflation
    yearRateMax: 0.55,        // a catastrophic year can spike prices ~55%, no more
  },

  // Technology unlock years
  UNLOCK: {
    electrification: 1905,
    tunnels: 1890,
    stdGauge: 1955,          // standard (1435) & Scotch (1372) arrive with shinkansen era
    sharedStationHex: 1946,  // multiple companies' stations in one hex from Late Showa
    platform6: 1912, platform10: 1946, platform15: 1989,
  },

  GAUGES: {
    narrow:     { mm: 1067, name: "Narrow (1067mm)" },
    industrial: { mm: 762,  name: "Industrial (762mm)" },
    scotch:     { mm: 1372, name: "Scotch (1372mm)" },
    standard:   { mm: 1435, name: "Standard (1435mm)" },
  },
  START_GAUGES: ["narrow", "industrial"],

  // ---- Terrain -----------------------------------------------------------
  // moveCost: A* weight. buildMult: multiplies track construction price & time.
  // color: base fill. accent: secondary tone used by the per-terrain pattern
  // (hachures, ripples, etc.) so adjacent terrain types read clearly apart.
  TERRAIN: {
    grass:    { moveCost: 1.0, buildMult: 1.0, color: "#6fae4e", accent: "#598f3f", buildable: true  },
    hill:     { moveCost: 2.2, buildMult: 1.8, color: "#bda35a", accent: "#8f7a3c", buildable: true  },
    mountain: { moveCost: 7.0, buildMult: 4.5, color: "#9b9088", accent: "#6e6258", buildable: true, needsTunnel: true },
    swamp:    { moveCost: 3.0, buildMult: 3.8, color: "#566f55", accent: "#3c5240", buildable: true  },   // reclamation premium
    river:    { moveCost: 3.6, buildMult: 3.0, color: "#5a9bd9", accent: "#a9d4f5", buildable: true, bridge: true },
    moat:     { moveCost: 3.4, buildMult: 3.2, color: "#3c5e7d", accent: "#7c8b95", buildable: true, bridge: true },
    canal:    { moveCost: 3.2, buildMult: 2.8, color: "#62acb0", accent: "#bfe7e8", buildable: true, bridge: true },
    // v0.5: open water. Not bridgeable-by-buildings; rail crosses as a
    // causeway; land can be RECLAIMED from sea/lake (never from rivers) via
    // the construction-job system (Phase 2 wires the generator & rules).
    sea:      { moveCost: 9.0, buildMult: 5.0, color: "#2e5f8f", accent: "#7fb3de", buildable: false, reclaimable: true, water: true, causeway: true },
    lake:     { moveCost: 8.0, buildMult: 4.6, color: "#3f7fae", accent: "#9cc9e8", buildable: false, reclaimable: true, water: true, causeway: true },
  },

  // ---- Land reclamation (v0.5, sea/lake only — never rivers) --------------
  // Filling open water into buildable ground via the construction-job system.
  // Cost is Meiji-scale (×inflation); days scale with the era's construction
  // technology (same ratio as track daysPerHexByEra vs. the Meiji figure).
  RECLAIM: {
    baseCost: 45000,              // yen/hex at Meiji prices (×inflation)
    days: 700,                    // calendar days at the Meiji construction pace
  },

  // Constructions on hexes (placeholders; influence pop/jobs and land value).
  // accent: secondary tone used by the construction's glyph (roofs, awnings,
  // paddy lines, flags) for at-a-glance readability.
  CONS: {
    rice:      { pop: 10,  att: 3,   valueMult: 0.8, color: "#d8d27a", accent: "#a8b955" },
    road:      { pop: 5,   att: 10,  valueMult: 1.0, color: "#9c9488", accent: "#e8d370" },
    house:     { pop: 90,  att: 10,  valueMult: 1.2, color: "#e8dcc6", accent: "#a8503a" },
    apartment: { pop: 280, att: 35,  valueMult: 1.7, color: "#aebccb", accent: "#3f5f96" },  // cool blue-grey tower — reads apart from warm houses/rice at zoom-out
    shop:      { pop: 20,  att: 240, valueMult: 1.8, color: "#ecd9a0", accent: "#c0392b" },
    school:    { pop: 8,   att: 320, valueMult: 1.3, color: "#cfd9e6", accent: "#e0e6ec" },
    civic:     { pop: 8,   att: 150, valueMult: 1.2, color: "#aab0b8", accent: "#d04030" },  // police/fire
  },

  // ---- Land economics ----------------------------------------------------
  // Rescaled (v0.4) so land sits on the same money scale as fare revenue:
  // buying a central right-of-way is now a serious capital decision, and the
  // year-end property tax makes a big land bank a real carrying cost.
  LAND: {
    baseRural: 1600,               // yen, edge of map, Meiji
    baseCenterBonus: 150000,       // added at exact center, exponential falloff
    centerFalloff: 6.5,            // hex radius e-folding
    demandValueK: 0.15,            // how much global rail demand inflates all land (kept gentle —
                                   //   at realistic ridership the old 0.35 tripled land map-wide and
                                   //   priced every late-entering railway out of existence)
    priceMult: 1.10,               // global land-price multiplier (normal difficulty: +10%)
    taxYearly: 0.045,              // property tax + management, levied at year end
    rentPerDay: 0.00030,           // owned developed non-rail land yields rent (per calendar day)
    resaleMarkup: 1.7,             // other companies sell land at this × value (if no infra on it)
    sellFrac: 0.90,                // net proceeds when selling your land back to the open market (× assessed value)
    holdoutFrac: 0.10,             // share of developed hexes held by private owners who never sell (2× the original scattering)
    palaceRadius: 2,               // hexes within this radius of CENTER are Imperial Palace grounds/moat
    palaceMult: 60,                // price multiplier at the palace hex itself (the Kokyo is not for sale)
    palaceRingMult: 20,             // price multiplier for the surrounding grounds & moat (radius 1-2)
  },

  // ---- Construction ------------------------------------------------------
  // Up-front build prices. Recurring running costs now exist too: per-km/per-car
  // maintenance and payroll accrue daily (see MAINTENANCE / HR), on top of the
  // year-end property tax and station upkeep lump.
  TRACK: {
    baseCost: 12000,              // yen/hex (≈1 km), Meiji, grass (v0.4 rescale: on the fare-revenue scale)
    elecExtra: 0.5,               // +50% for electrified
    // Building through built-up parcels costs and takes more (demolition,
    // compensation, working around the city): ×(1 + devCostPerLevel·dev).
    devCostPerLevel: 0.30,        // +30% cost per development level of the hex
    devTimePerLevel: 0.12,        // +12% time per development level of the hex
    // Calendar days to lay 1 hex (≈1 km) of track. Grounded in history: a km of
    // hand-built Meiji permanent way (surveying, earthworks, sleepers, rail) took
    // most of a year; mechanization, prefabrication and heavy plant steadily
    // compress this toward the modern pace. ~30 calendar days = 1 simulated month.
    daysPerHexByEra: { meiji: 240, taisho: 170, showa1: 120, showa2: 70, heisei: 50, reiwa: 38 },
    // CONSTRUCTION CREWS: how many kilometres of civil works a company can
    // progress SIMULTANEOUSLY (track hexes, gauge works, demolitions). A long
    // corridor advances up to this many sections at once; further jobs queue.
    // This is what makes construction time a real constraint in every era —
    // cash alone can't carpet the map, because Meiji Japan simply cannot field
    // unlimited navvy gangs, while Reiwa heavy plant runs many fronts at once.
    crewsByEra: { meiji: 3, taisho: 4, showa1: 5, showa2: 7, heisei: 9, reiwa: 10 },
    tunnelTimeMult: 3, bridgeTimeMult: 2,
    // ---- Gauge works (on track you already own) ----
    // Adding a parallel rail of a NEW gauge to a hex costs about the same as
    // laying fresh track (materials + labour) but needs no land — the property
    // is already yours. Trains still can't run between the two rails, only
    // alongside each other on the hex.
    addGaugeTimeMult: 1.0,        // building a parallel rail takes ≈ as long as fresh track
    // CONVERTING an existing rail to another gauge (regauging) reuses the
    // roadbed and land, so materials are relatively cheap — but tearing up,
    // realigning and relaying the permanent way is slow and labour-heavy, and
    // the rail carries NO service until the work is finished.
    regaugeCostMult: 0.55,        // regauge cost vs. fresh track (cheaper: roadbed & land reused)
    regaugeTimeMult: 1.6,         // but slower than fresh (remove old rail, realign, relay)
  },
  STATION: {
    baseCost: 60000,              // v0.4 rescale: a station is a real capital project
    platformUpgradeCost: 20000,   // per car slot added (×inflation)
    yearlyMaint: 30000,           // yen/station/year lump (×inflation), levied at year end
    // Calendar days to build a new station — earlier eras build slower,
    // mirroring the track pace (era technology applies to buildings too).
    buildDaysByEra: { meiji: 320, taisho: 280, showa1: 240, showa2: 200, heisei: 170, reiwa: 150 },
    platformDaysPerCar: 70,       // calendar days to lengthen a platform by one car
    catchment: 2,                 // hex radius
    busyBoard: 400,                // boardings/day a station needs to count as "busy" (service level, growth pull)
    demolishCost: 25000,          // yen ×inflation to tear a station down (scales with commerce tier); the rail is left in place
    demolishDays: 200,            // calendar days to demolish a station
    bridgeMult: 2.2,              // station on a bridge/causeway hex (river, moat, canal, sea, lake) costs this ×
  },

  // ---- Development / population growth (P4) ---------------------------------
  // Rail access pulls in housing and commerce around stations. baseRate is the
  // per-hex-per-month growth chance at full power (accessible, affordable,
  // uncrowded); commercePerLevel makes a well-developed ekinaka (player-built
  // station commerce) itself part of an area's pull, not just a side income.
  GROWTH: {
    baseRate: 0.072,               // 0.06 × 1.2 — 20% faster growth overall
    commercePerLevel: 0.12,        // +12% growth pull per built commerce tier
  },

  // ---- Station commerce ("ekinaka" — money made from the building, not the
  // train) ------------------------------------------------------------------
  // A station can be developed into a place of business in its own right.
  // Income scales with FOOTFALL (passengers passing through) and the economic
  // cycle, so a busy hub mints money while a quiet one barely earns — but the
  // MAINTENANCE is a fixed annual lump owed regardless of demand, and it climbs
  // steeply with level. High levels are a genuine gamble: huge upside on a
  // crowded station, a bleeding wound on a sleepy one. All yen figures are
  // Meiji-scale and inflation-indexed (×inflationOf). Build costs also fold in
  // a share of the hex's land value (you're developing real estate).
  //
  // Historical anchors:
  //   1876 vending — platform vending; meager, automatic once invented.
  //   1880 shops   — kiosks/baiten (the Japan Railways "kiosk" lineage).
  //   1950 retail  — postwar station concourses (retail + restaurants + convenience).
  //   1960 mall    — terminal department-store / shopping-centre era (Tokyu, Seibu, Lumine).
  //   2000 complex — the ekinaka boom: in-gate retail cities (ecute, GranSta, etc.).
  COMMERCE: {
    vendingYear: 1876,            // vending machines arrive — every open station earns a trickle
    demandSwing: 1.0,             // commerce income scales fully with the economic cycle (boom/bust risk)
    // levels[0] is "none"; 1..5 are the buildable/auto tiers.
    // v0.4 rescale: build costs & upkeep ×~3.3 (the money scale moved), and
    // incomePerPax ÷~3 so ekinaka supplements fares instead of dwarfing the
    // rebalanced fare of ~¥0.05/km — a kiosk sale is a side business, not a
    // second railway.
    levels: [
      null,
      { key: "vending", name: "Platform vending",            from: 1876, auto: true,
        buildCost: 4000,   buildDays: 30,   landShare: 0.00, maintYear: 1000,    incomePerPax: 0.005 },
      { key: "shops",   name: "Station shops & kiosks",      from: 1880,
        buildCost: 30000,  buildDays: 240,  landShare: 0.10, maintYear: 11000,   incomePerPax: 0.020 },
      { key: "retail",  name: "Retail & restaurant concourse", from: 1950,
        buildCost: 100000, buildDays: 600,  landShare: 0.25, maintYear: 150000,  incomePerPax: 0.065 },
      { key: "mall",    name: "Station shopping mall",       from: 1960,
        buildCost: 300000, buildDays: 1095, landShare: 0.50, maintYear: 820000,  incomePerPax: 0.150 },
      { key: "complex", name: "Integrated station city",     from: 2000,
        buildCost: 900000, buildDays: 1825, landShare: 0.80, maintYear: 3000000, incomePerPax: 0.280 },
    ],
    // map glyph tint per level (the at-a-glance "style" of the station hex)
    glyphColor: [null, "#4fd0d8", "#e0922f", "#d8b23a", "#d24a9b", "#f5d24a"],
  },

  // ---- Depots --------------------------------------------------------------
  // A depot stores rolling stock removed from deleted lines so trains are
  // never scrapped. It can optionally double as a passenger station, but the
  // yard/maintenance facilities eat into the catchment's commerce.
  DEPOT: {
    baseCost: 30000,               // cheaper than a full station — yard only
    landMultDepot: 0.20,           // land-cost share when depot-only
    landMultStation: 0.55,         // land-cost share when doubling as a station
    buildDays: 150,                // calendar days to build a depot
    yearlyMaint: 15000,            // yen/depot/year lump (×inflation), levied at year end
    commerceMult: 0.45,            // pop/attraction multiplier when doubling as a station
  },

  // ---- Redevelopment --------------------------------------------------------
  // Tear up your own track and turn the parcel into rent-earning property
  // (the land stays yours; rent flows through the existing developed-land
  // income loop). Construction cost = a flat build price (×inflation) plus a
  // share of the hex's land value, so central redevelopment costs more.
  DEVELOP: {
    demolishCost: 7000,            // yen ×inflation ×terrain.buildMult to tear up 1 km of track
    landShare: 0.30,               // construction also costs this share of the hex's land value
    demolishDays: 60,              // calendar days to clear a parcel (×terrain.buildMult); track/buildings stay until done
    // builds: dev (development level) · cost (yen ×inflation) · days (calendar days to construct)
    builds: {
      shop:      { label: "Shopping center",       dev: 3, cost: 64000, days: 420 },
      apartment: { label: "Housing complex",       dev: 3, cost: 80000, days: 480 },
      house:     { label: "Townhouses",            dev: 2, cost: 36000, days: 240 },
      civic:     { label: "Civic / office complex", dev: 2, cost: 52000, days: 300 },
    },
  },

  // ---- Trains ------------------------------------------------------------
  // speed km/h (hex=1km), capPerCar passengers, unlock year, needs
  TRAINS: {
    steam_local:  { name: "Steam Local",      speed: 35,  cap: 55,  cost: 30000,  from: 1872 },
    steam_exp:    { name: "Steam Express",    speed: 48,  cap: 50,  cost: 42000,  from: 1885 },
    emu_local:    { name: "EMU Local",        speed: 55,  cap: 80,  cost: 56000,  from: 1905, elec: true },
    emu_rapid:    { name: "EMU Rapid",        speed: 68,  cap: 75,  cost: 74000,  from: 1918, elec: true },
    emu_exp:      { name: "EMU Express",      speed: 80,  cap: 70,  cost: 95000,  from: 1932, elec: true },
    special_exp:  { name: "Special Express",  speed: 95,  cap: 64,  cost: 126000, from: 1950, elec: true },
    shinkansen:   { name: "Shinkansen",       speed: 210, cap: 90,  cost: 320000, from: 1955, elec: true, gauge: "standard" },
  },
  // Resale value when scrapping/selling rolling stock: a fraction of the
  // train's current-era price, depreciating with age (old stock is worth
  // less, but never nothing). Applies to active and depot-stored trains.
  TRAIN_RESALE: { base: 0.45, dropPerYear: 0.006, floor: 0.15 },
  LINE_TYPES: ["local", "rapid", "express", "special express"],
  // ---- Buyouts -----------------------------------------------------------
  // Acquiring a rival is harder in a railway's infancy: a young company can't
  // be bought out at all until it has traded for a few years, so early upstarts
  // get room to find their feet instead of being swallowed immediately.
  BUYOUT: {
    minYearsInBusiness: 5,        // a company can't be acquired until it has operated this many years
  },
  SERVICE_HOURS: 18,              // operating hours per day
  DWELL_MIN: 1.0,                 // minutes per stop
  TRANSFER_MIN: 5,                // transfer penalty minutes

  // ---- Passengers --------------------------------------------------------
  PAX: {
    tripsPerCapita: 4.0,          // production budget: outbound rail trips a station's residents
                                  //   make per day. Distributed across destinations by pull, then
                                  //   suppressed by mode share/affordability/crowding. Anchors total
                                  //   demand to population (linear) so it can't scale super-linearly.
    costLambda: 30,               // generalized-cost decay (yen-equivalent minutes)
    votByEra: { meiji: 0.15, taisho: 0.3, showa1: 0.6, showa2: 6, heisei: 22, reiwa: 26 }, // yen/min
    // Explicit non-rail alternatives (v0.5, replaces the old altPerKmByEra
    // scalar). Rail competes per O-D against the CHEAPEST mode by generalized
    // cost: votc·(access + km·minPerKm[·roadMult]) + km·yenPerKm·inflation.
    // Road-bound modes (road: true) speed up near a paved/highway kaidō
    // (KAIDO.altMult scales their minPerKm), so highway corridors locally
    // cheapen the bus/car alternative and squeeze parallel rail late-game.
    // Monopoly fares are capped naturally: riders defect to the best mode
    // below, never "to nothing".
    // Target effective curve (cheapest mode, typical trip, min/km-equivalent)
    // matches the tuned v0.4 scalars: 18 → 16 → 14 → ~9 → ~8 → ~8.
    ALT_MODES: {
      meiji:  [ { key: "walk", minPerKm: 18, yenPerKm: 0, access: 0 },
                { key: "rickshaw", minPerKm: 10, yenPerKm: 1.5, access: 2, road: true } ],
      taisho: [ { key: "walk", minPerKm: 18, yenPerKm: 0, access: 0 },
                { key: "bicycle", minPerKm: 16, yenPerKm: 0, access: 1 },
                { key: "rickshaw", minPerKm: 10, yenPerKm: 1.5, access: 2, road: true } ],
      showa1: [ { key: "walk", minPerKm: 18, yenPerKm: 0, access: 0 },
                { key: "bicycle", minPerKm: 15, yenPerKm: 0, access: 1 },
                { key: "bus", minPerKm: 12, yenPerKm: 0.08, access: 6, road: true } ],
      showa2: [ { key: "walk", minPerKm: 18, yenPerKm: 0, access: 0 },
                { key: "bicycle", minPerKm: 14, yenPerKm: 0, access: 1 },
                { key: "bus", minPerKm: 10, yenPerKm: 0.05, access: 6, road: true },
                { key: "car", minPerKm: 7, yenPerKm: 0.12, access: 6, road: true } ],
      heisei: [ { key: "walk", minPerKm: 18, yenPerKm: 0, access: 0 },
                { key: "bicycle", minPerKm: 14, yenPerKm: 0, access: 1 },
                { key: "bus", minPerKm: 9, yenPerKm: 0.05, access: 5, road: true },
                { key: "car", minPerKm: 6, yenPerKm: 0.12, access: 5, road: true } ],
      reiwa:  [ { key: "walk", minPerKm: 18, yenPerKm: 0, access: 0 },
                { key: "bicycle", minPerKm: 14, yenPerKm: 0, access: 1 },
                { key: "bus", minPerKm: 9, yenPerKm: 0.05, access: 5, road: true },
                { key: "car", minPerKm: 6, yenPerKm: 0.11, access: 4, road: true } ],
    },
    adoptionRamp: [ [1872, 0.35], [1900, 0.6], [1925, 0.85], [1955, 1.0], [2028, 1.0] ],
    holidayMult: 0.55,            // weekend ridership vs. a weekday — blended across each month
                                  //   (≈5 weekdays + 2 weekend days), so every month carries the
                                  //   same averaged weekday/weekend mix (no separate "holiday" steps)
    crowdDesirePenalty: 0.5,      // desirability loss at 2x overcapacity
    // --- rider realism (route choice & where people locate) ---
    crowdTimePenalty: 0.8,        // crowded trains feel slower: +80% in-vehicle time at 2× load (route choice)
    waitWeight: 1.0,             // half-headway wait, weighted into generalized cost (frequency matters)
    comfortFareMult: 1.6,         // fares up to 1.6× the era default ride "comfortable"; above this, demand erodes
    affordSpread: 0.6,            // how sharply demand falls once fares exceed the comfortable level
    destLambda: 1.0,              // destination-choice competition spread (× costLambda × VoT)
    // v0.4 rescale: the old ¥0.25/km sat ~25–60× above the game's own cost
    // scale, so fare revenue swamped every expense and cash snowballed no
    // matter what. ¥0.05/km (Meiji) puts revenue on the same scale as the
    // rebalanced wage/maintenance/construction costs. Affordability and
    // comfort logic are all RELATIVE to this default, so they follow along.
    defaultFarePerKm: 0.06,       // yen/km at Meiji scale (×inflation-indexed yearly)
    reassignDays: 1,              // O-D refresh cadence in simulated days
    // --- comfort & rider segmentation (so pricier express trains attract demand) ---
    // A crowding "discomfort" cost charged in fare-equivalent yen per km of a
    // packed segment (×inflation), independent of value-of-time — so a jammed
    // local is genuinely unpleasant even in eras when time is nearly worthless,
    // pushing some riders onto an emptier (and dearer) express.
    comfortCostPerKm: 0.18,       // yen/km of discomfort at 2× crowding (load − 1 = 1) — fare-scale-relative
    // Travelers split into market segments routed independently and recombined,
    // so each O-D's demand divides across competing routes instead of all piling
    // onto a single cheapest path. Comfort-seekers value time and shun crowding
    // (they'll pay for a fast, empty express); budget riders chase the low fare.
    classes: [
      { key: "budget",  share: 0.62, votMult: 0.8, comfortMult: 0.6 },
      { key: "comfort", share: 0.38, votMult: 2.6, comfortMult: 2.4 },
    ],
  },

  // Day phase profile (fractions of daily ridership by time-of-day, for visuals)
  DAY_PHASES: [
    { from: 0.00, name: "night",        glow: 0.05 },
    { from: 0.27, name: "morning rush", glow: 1.0  },
    { from: 0.40, name: "midday",       glow: 0.35 },
    { from: 0.48, name: "lunch rush",   glow: 0.6  },
    { from: 0.56, name: "afternoon",    glow: 0.35 },
    { from: 0.70, name: "evening rush", glow: 1.0  },
    { from: 0.85, name: "night",        glow: 0.12 },
  ],

  // ---- Events ------------------------------------------------------------
  EVENTS: {
    // Major earthquakes: a per-PLAYTHROUGH budget, not a rolling window.
    // ~1%/year ≈ "roughly once a century": ≈21% of games see none, ≈33% see
    // exactly one, the rest hit the cap of two (with a minimum gap so they
    // can't stack). Neither is ever guaranteed.
    majorQuakeCap: 2,             // hard cap per playthrough
    majorQuakeChance: 0.01,       // per-year chance (roughly once a century)
    majorQuakeGapYears: 15,       // "roughly, not strictly" — no back-to-back catastrophes
    // Minor earthquakes: SAME likelihood across the whole timeline — what
    // falls over time is the damage, through resilience (era/renewal of each
    // asset, taishin standards, R&D), never the frequency.
    minorQuakeChance: 0.15,       // per-year chance, constant 1872–2028
    // Major war: at most one per playthrough, and a playthrough may have
    // none. Any start year, aerial attack, duration and severity randomized;
    // the intensity CURVE inside the war window is also randomized (early
    // climax / crescendo / twin peaks) — see events.js maybeStartWar.
    warChance: 0.006,             // per-year chance (≈39% of games see no war)
    warYearsMin: 2,
    warYearsMax: 10,              // hard cap on war length
    warPaxHit: 0.5,               // ridership suppression at intensity 1.0
  },

  // ---- Disaster consequences ----------------------------------------------
  // Damage profiles live with each event in events.js (that's what makes an
  // earthquake feel different from a fire); the shared repair economics live
  // here. Damaged track no longer heals for free: it is repaired day by day
  // ONLY while the owner pays the crews (sim.js dailyTick). Unpaid damage
  // stays broken, and lines across it keep losing capacity — a disaster can
  // push a struggling company into a genuine financial spiral.
  DISASTER: {
    repairPerKmDay: 55,           // yen/km per calendar day of repair work
                                  //   (Meiji scale, ×terrain.buildMult ×inflation —
                                  //   a 90-day repair ≈ 40% of fresh construction)
    // ---- Seismic resilience -----------------------------------------------
    // Every quake's damage to an asset is scaled by (1 − R), where R is ONE
    // composed resilience value: R = 1 − (1−rEra)(1−rTaishin)(1−rR&D),
    // capped below so nothing is invulnerable. The three factors:
    //   rEra      passive construction-technique improvement, keyed to the
    //             year the asset was BUILT OR LAST RENEWED (track: laid,
    //             regauged, or repaired back to health; station: built, or
    //             platform/commerce/taishin works finished) — a neglected
    //             Meiji station never quietly inherits Reiwa techniques
    //   rTaishin  the seismic code standard the station was upgraded to
    //             (CFG.TAISHIN below; stations only — track gets era + R&D)
    //   rR&D      company research into quake-resistant structures (rd.js)
    // The multiplicative-survival composition means the factors reinforce
    // without double-counting and give diminishing returns.
    resilienceCap: 0.85,          // max damage reduction, ever
    eraResilienceMax: 0.40,       // a freshly built 2028 asset vs an 1872 one
  },

  // ---- Taishin (seismic building standards) --------------------------------
  // Real Japanese code milestones. When a standard takes effect, stations can
  // be retrofitted to it — one at a time or in bulk — at a cost/time drawn
  // from the station construction formulas (× inflation), and new stations
  // are automatically built to the standard of their day. `r` is the
  // standard's contribution to the resilience composition above.
  TAISHIN: {
    STANDARDS: [
      { year: 1920, name: "Urban Building Law (1920)",                    r: 0.10 },
      { year: 1924, name: "Seismic coefficient — post-quake revision (1924)", r: 0.22 },
      { year: 1950, name: "Building Standards Act (1950)",                r: 0.35 },
      { year: 1971, name: "Reinforced-concrete revision (1971)",          r: 0.45 },
      { year: 1981, name: "New Seismic Standard — shin-taishin (1981)",   r: 0.60 },
      { year: 1995, name: "Post-Kobe retrofit standard (1995)",           r: 0.70 },
    ],
    costFrac: 0.45,               // retrofit cost = this × station base construction cost
                                  //   (× inflation, × commerce-tier size factor)
    daysFrac: 0.5,                // retrofit time = this × the era's station build days
  },

  // ---- AI -----------------------------------------------------------------
  AI: {
    // first rivals arrive with the 1880s private-railway boom (企業勃興) —
    // before ~1885 population and rail adoption are too thin to carry a
    // second operator, exactly as in the real Meiji economy
    entryWindows: [ [1881, 1893], [1885, 1902], [1896, 1912], [1898, 1914], [1906, 1924], [1908, 1925] ], // all by Showa
    thinkDays: 1,                 // AI decides once per simulated day (7×/year)
    parallelTrackPenalty: 2.5,     // A* weight penalty for new hexes beside an AI's own track (fewer parallel/duplicate lines)
    // ---- expansion discipline (don't carpet the map) ----
    // An AI extends only when its existing lines are busy (reach follows real
    // demand), and its appetite tapers as the network grows, so it builds a
    // sensible spine instead of sprawling redundant track.
    expandChance: 0.22,           // base per-think chance to consider a new branch (× difficulty × size brake)
    expandLoadThresh: 0.55,       // mean line load (demand/capacity) required before expanding at all
    expandMinScore: 700,          // minimum underserved-demand score (latent riders × service gap,
                                  //   in demand-field units — see aiScoredTargets) for a new branch's far end
    expandCashGate: 150000,       // minimum cash (× inflation) to consider expanding
    trackSoftCap: 38,             // track-km scale at which expansion appetite is roughly halved
    names: ["Musashino Electric Rwy", "Keihin Kido", "Sobu Rapid Rail", "Joban Tetsudo", "Keio Heights Rwy", "Tobu Garden Line"],
    colors: ["#d2624a", "#5a9bd2", "#62b06a", "#b08ad2", "#e08a3a", "#3aa0a8"],
    // What DIFFICULTY controls, concretely (one setting per AI opponent,
    // chosen on the start screen):
    //   cashMult      starting capital when the company enters the market
    //   bufferMult    cash cushion demanded before committing to construction
    //                 (higher = more conservative, slower to build)
    //   expandMult    appetite: scales the per-think chance of new branches,
    //                 land speculation and station investment
    //   fareAggro     how hard fares are pushed to ration/attract demand, and
    //                 how lean the wage policy runs (see hr.js aiSetWage)
    //   breadth       expansion-target search depth — how many candidate
    //                 corridors are fully scored before choosing (decision
    //                 quality: a deeper search finds better corridors)
    //   rivalDiscount share of a RIVAL's existing service coverage the AI
    //                 ignores when scoring targets — aggression on contested
    //                 routes (0 = treats served corridors as off-limits,
    //                 0.45 = will build into a competitor's busy corridor)
    //   reactChance   per-think chance it inspects rivals' construction in
    //                 progress and races them to a corridor it also wants —
    //                 reaction speed to the player's visible expansion
    DEFAULT_DIFFICULTY: "normal",
    DIFFICULTIES: {
      easy:   { name: "Easy",   cashMult: 0.70, bufferMult: 1.40, expandMult: 0.6, fareAggro: 0.6, breadth: 4,  rivalDiscount: 0,    reactChance: 0    },
      normal: { name: "Normal", cashMult: 1.00, bufferMult: 1.15, expandMult: 1.0, fareAggro: 1.0, breadth: 9,  rivalDiscount: 0.20, reactChance: 0.25 },
      hard:   { name: "Hard",   cashMult: 1.40, bufferMult: 1.00, expandMult: 1.6, fareAggro: 1.4, breadth: 16, rivalDiscount: 0.45, reactChance: 0.60 },
    },
  },
  PLAYER_COLOR: "#e8c84a",

  // ---- Maintenance (recurring infrastructure upkeep) ---------------------
  // The ongoing cost of OWNING a network, accrued every sim-day (not just at
  // year end). Sprawling, idle or duplicate track is now a real liability —
  // the economic deterrent against carpeting the map with rails.
  MAINTENANCE: {
    trackPerKmYear: 1500,       // yen/km/year (Meiji grass) × inflation × terrain.buildMult (≈12% of build cost)
    trackElecExtra: 0.5,        // +50% to maintain electrified catenary
    trainMaintFrac: 0.12,       // train upkeep/year = this × current-era price at 3 cars
    trainAgePerYear: 0.03,      // +3% upkeep per year of the train's age
    trainAgeMax: 1.5,           // age multiplier capped here (an ancient train ≈ +50%)
    storedTrainMult: 0.4,       // depot-stored stock still costs this share to maintain
  },

  // ---- Workforce / HR ----------------------------------------------------
  // Running a railroad means employing people. Headcount scales with the
  // network; payroll is a daily operating cost; morale responds to pay and
  // overwork and feeds back into service quality, construction speed and
  // strike risk. A tight labor market raises the going wage (and can leave
  // an under-paying company short-staffed).
  HR: {
    // Headcount the network requires (abstract but legible).
    staffPerKm: 0.8,                 // permanent-way & signalling crews
    staffPerStationTier: 3,          // station staff, scales with 1 + commerce tier
    staffPerCar: 1.2,                // train crew + rolling-stock maintenance
    hqBase: 10,                      // head-office overhead (clerks, management) — kept lean so a
                                     // company still building its first line isn't bled dry pre-revenue
    hqPerKm: 0.06,
    // Prevailing annual wage per head (Meiji yen) × inflation × market tightness.
    // v0.4 rescale: read this as the full employment cost of one railway job
    // (pay + housing + provident schemes), sized against fare revenue so a
    // real workforce is a real expense.
    baseWage: 6000,
    wageLevelMin: 0.6, wageLevelMax: 1.6, wageLevelDefault: 1.0,
    // Morale (0..1).
    moraleDefault: 0.78,
    moraleDrift: 0.5,                // fraction of the gap to target closed each year
    payScoreSlope: 1.25,            // how sharply pay vs. the going rate moves morale
    overworkThreshold: 0.85,        // average line load above this fatigues staff
    overworkWeight: 1.1,
    expandFatiguePerKm: 0.0015,     // building lots of km/year tires the workforce
    // Morale → productivity (multiplies line capacity & construction speed).
    prodAtZero: 0.82, prodAtFull: 1.05,
    understaffProd: 0.5,            // productivity lost per unit of (goingWage − yourWage)
    understaffBuild: 0.5,           // construction slowdown per unit of underpayment
    // Strikes (company-scoped service disruption, not a global event).
    strikeMoraleFloor: 0.35,        // below this, a walkout becomes possible
    strikeRiskK: 1.6,               // × era militancy × (floor − morale)
    strikeCapMult: 0.45,            // effective capacity while a strike is on
    strikeDays: 45,                 // calendar days a strike lasts
    strikeMilitancyByEra: { meiji: 0.3, taisho: 1.0, showa1: 1.1, showa2: 0.8, heisei: 0.4, reiwa: 0.3 },
    // Labor-market tightness → prevailing wage & understaffing.
    scarcityByEra: { meiji: 0.2, taisho: 0.3, showa1: 0.4, showa2: 0.6, heisei: 0.5, reiwa: 0.72 },
    boomTightness: 0.5,             // × max(0, econ.cycle − 1): booms tighten labor
    expandTightnessK: 0.3,          // × clamp(industry km built last year / 300)
    tightnessNeutral: 0.35,
    tightnessWageK: 0.7,            // wageMult = 1 + this × max(0, tightness − neutral)
    wageMultMin: 0.85, wageMultMax: 1.7,
  },

  // ---- Annual awards / achievements --------------------------------------
  // A year-end ceremony recognizing the best (and worst) operators. Prizes
  // are modest PR money plus morale/reputation swings, so they nudge play
  // without dominating the balance.
  AWARDS: {
    cashFrac: 0.03,                 // a winner's prize = this × their year revenue
    cashCap: 100000,                // capped here (× inflation)
    moraleBonus: 0.06,              // morale lift for a good award
    moralePenalty: 0.06,            // morale hit for "Worst Employer"
    reputationStep: 0.05,
    minCompaniesForWorst: 2,        // no "worst" award in a one-company field
    worstMoraleCeiling: 0.5,        // and only if the laggard is genuinely unhappy
    milestoneCash: 40000,           // one-time milestone prize (× inflation)
  },

  SAVE_KEY: "trt_save_v1",
  SAVE_VERSION: 9,               // v9 (v0.5): player classes, loan/arrears state, campaign field —
                                 //     clean break: older saves are declined with a friendly message
                                 // v8: seismic resilience, randomized war state, R&D, causal inflation
                                 // v7: disaster recovery curves on active events (total/curve)
                                 // v6: multi-gauge track (per-hex rails), gauge works & station demolition jobs
  SAVE_MIN_VERSION: 9,           // v0.5 changed the world (water, classes, loans) — old saves can't load
};

/** Era record for a given year (drives the tech/economy progression — shared by
 *  both campaigns, always keyed to the actual year). */
function eraOf(year) {
  for (let i = CFG.ERAS.length - 1; i >= 0; i--) if (year >= CFG.ERAS[i].from) return CFG.ERAS[i];
  return CFG.ERAS[0];
}
// London campaign (Phase 11): the same 1872–2028 clock, but shown by the reigning
// monarch instead of the Japanese era. Boundaries are the real accession years, so
// the tech tables (year-keyed via eraOf) are untouched. Edward VIII's 1936 is
// folded into the George V→VI hand-over rather than given its own row.
CFG.ERAS_LONDON = [
  { from: 1872, name: "Victorian" },        // Victoria (reigning since 1837)
  { from: 1901, name: "Edwardian" },        // Edward VII
  { from: 1910, name: "Georgian (George V)" },
  { from: 1936, name: "Georgian (George VI)" },  // Edward VIII's 1936 folded in here
  { from: 1952, name: "Elizabethan" },      // Elizabeth II
  { from: 2022, name: "Carolean" },         // Charles III
];
/** Display name of the era for a given state+year: monarch reign for the London
 *  campaign, Japanese era otherwise. Purely cosmetic — never drives mechanics. */
function eraDisplayName(st, year) {
  if (st && st.campaign === "london") {
    const L = CFG.ERAS_LONDON;
    for (let i = L.length - 1; i >= 0; i--) if (year >= L[i].from) return L[i].name;
    return L[0].name;
  }
  return eraOf(year).name;
}
/** Price inflation multiplier for a given year in a given playthrough. The
 *  price level is built up causally year by year (updateInflation, main.js)
 *  and recorded in st.econ.priceHist; this is a pure lookup. Callers always
 *  ask for the current year, the previous year, or a founding year — all of
 *  which have been recorded by the time they ask. Unknown future years fall
 *  back to the latest known level; pre-1872 to the base. */
function inflationOf(st, year) {
  if (!st || !st.econ) return CFG.INFLATION.base;           // defensive (partial state)
  const h = st.econ.priceHist;
  if (h && h[year] !== undefined) return h[year];
  if (year <= CFG.START_YEAR) return CFG.INFLATION.base;
  return st.econ.priceLevel || CFG.INFLATION.base;
}
/** Rail adoption ramp (share of potential travelers willing to ride). */
function adoptionOf(year) {
  const r = CFG.PAX.adoptionRamp;
  if (year <= r[0][0]) return r[0][1];
  for (let i = 1; i < r.length; i++) {
    if (year <= r[i][0]) {
      const t = (year - r[i - 1][0]) / (r[i][0] - r[i - 1][0]);
      return r[i - 1][1] + t * (r[i][1] - r[i - 1][1]);
    }
  }
  return r[r.length - 1][1];
}
/** Max platform length (cars) allowed by year. */
function maxPlatformCars(year) {
  if (year >= CFG.UNLOCK.platform15) return 15;
  if (year >= CFG.UNLOCK.platform10) return 10;
  if (year >= CFG.UNLOCK.platform6) return 6;
  return 3;
}
/** Gauges available for new construction in a given year. */
function gaugesAvailable(year) {
  const g = ["narrow", "industrial"];
  if (year >= CFG.UNLOCK.stdGauge) { g.push("standard", "scotch"); }
  return g;
}
/** Spec record for a commerce level (1..5), or null. */
function commerceSpec(level) {
  return CFG.COMMERCE.levels[level] || null;
}
/** Highest commerce level a player may pay to construct in a given year
 *  (level 1 vending is automatic, never built). 0 if shops aren't available yet. */
function maxCommerceLevel(year) {
  let m = 0;
  for (let l = 2; l < CFG.COMMERCE.levels.length; l++) {
    if (year >= CFG.COMMERCE.levels[l].from) m = l;
  }
  return m;
}
