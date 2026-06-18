/* =========================================================================
 * config.js — All tuning constants for Tokyo Railroad Tycoon.
 * Everything balance-related lives here so the game can be retuned in one place.
 * ========================================================================= */
"use strict";

const CFG = {
  VERSION: "0.3",                         // game release version (distinct from SAVE_VERSION)
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

  START_CASH: 360000,                     // Meiji yen — realistic early rail entrepreneur scale (normal difficulty)
  AI_COUNT: 6,                            // default number of computer rivals (max — limited by AI.entryWindows/names/colors)

  // ---- Eras --------------------------------------------------------------
  ERAS: [
    { key: "meiji",  name: "Meiji",       from: 1872, to: 1911, inflation: 1   },
    { key: "taisho", name: "Taisho",      from: 1912, to: 1925, inflation: 2   },
    { key: "showa1", name: "Early Showa", from: 1926, to: 1945, inflation: 4   },
    { key: "showa2", name: "Late Showa",  from: 1946, to: 1988, inflation: 60  },
    { key: "heisei", name: "Heisei",      from: 1989, to: 2018, inflation: 220 },
    { key: "reiwa",  name: "Reiwa",       from: 2019, to: 2028, inflation: 260 },
  ],

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
  },

  // Constructions on hexes (placeholders; influence pop/jobs and land value).
  // accent: secondary tone used by the construction's glyph (roofs, awnings,
  // paddy lines, flags) for at-a-glance readability.
  CONS: {
    rice:      { pop: 10,  att: 3,   valueMult: 0.8, color: "#d8d27a", accent: "#a8b955" },
    road:      { pop: 5,   att: 10,  valueMult: 1.0, color: "#9c9488", accent: "#e8d370" },
    house:     { pop: 90,  att: 10,  valueMult: 1.2, color: "#e8dcc6", accent: "#a8503a" },
    apartment: { pop: 280, att: 35,  valueMult: 1.7, color: "#cfc6cf", accent: "#7a5a78" },
    shop:      { pop: 20,  att: 240, valueMult: 1.8, color: "#ecd9a0", accent: "#c0392b" },
    school:    { pop: 8,   att: 320, valueMult: 1.3, color: "#cfd9e6", accent: "#e0e6ec" },
    civic:     { pop: 8,   att: 150, valueMult: 1.2, color: "#aab0b8", accent: "#d04030" },  // police/fire
  },

  // ---- Land economics ----------------------------------------------------
  LAND: {
    baseRural: 90,                 // yen, edge of map, Meiji
    baseCenterBonus: 7500,         // added at exact center, exponential falloff
    centerFalloff: 6.5,            // hex radius e-folding
    demandValueK: 0.35,            // how much global rail demand inflates all land
    priceMult: 1.10,               // global land-price multiplier (normal difficulty: +10%)
    taxYearly: 0.03,               // property tax + management, levied at year end
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
    baseCost: 2400,               // yen/hex (≈1 km), Meiji, grass
    elecExtra: 0.5,               // +50% for electrified
    // Calendar days to lay 1 hex (≈1 km) of track. Grounded in history: a km of
    // hand-built Meiji permanent way (surveying, earthworks, sleepers, rail) took
    // the better part of a year; mechanization, prefabrication and heavy plant
    // steadily compress this toward the modern pace. ~30 calendar days = 1
    // simulated month, and separate single-hex jobs build in parallel.
    daysPerHexByEra: { meiji: 300, taisho: 210, showa1: 140, showa2: 80, heisei: 50, reiwa: 38 },
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
    baseCost: 9000,
    centralMult: 3.0,             // central land makes stations pricier (scales w/ land value)
    platformUpgradeCost: 6000,    // per car slot added (×inflation)
    yearlyMaint: 9000,            // yen/station/year lump (×inflation), levied at year end
    buildDays: 240,               // calendar days to build a new station
    platformDaysPerCar: 70,       // calendar days to lengthen a platform by one car
    catchment: 2,                 // hex radius
    busyBoard: 400,                // boardings/day a station needs to count as "busy" (service level, growth pull)
    demolishCost: 7000,           // yen ×inflation to tear a station down (scales with commerce tier); the rail is left in place
    demolishDays: 200,            // calendar days to demolish a station
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
    levels: [
      null,
      { key: "vending", name: "Platform vending",            from: 1876, auto: true,
        buildCost: 1200,   buildDays: 30,   landShare: 0.00, maintYear: 300,    incomePerPax: 0.015 },
      { key: "shops",   name: "Station shops & kiosks",      from: 1880,
        buildCost: 9000,   buildDays: 240,  landShare: 0.10, maintYear: 3300,   incomePerPax: 0.060 },
      { key: "retail",  name: "Retail & restaurant concourse", from: 1950,
        buildCost: 30000,  buildDays: 600,  landShare: 0.25, maintYear: 44000,  incomePerPax: 0.200 },
      { key: "mall",    name: "Station shopping mall",       from: 1960,
        buildCost: 90000,  buildDays: 1095, landShare: 0.50, maintYear: 246000, incomePerPax: 0.450 },
      { key: "complex", name: "Integrated station city",     from: 2000,
        buildCost: 260000, buildDays: 1825, landShare: 0.80, maintYear: 930000, incomePerPax: 0.850 },
    ],
    // map glyph tint per level (the at-a-glance "style" of the station hex)
    glyphColor: [null, "#4fd0d8", "#e0922f", "#d8b23a", "#d24a9b", "#f5d24a"],
  },

  // ---- Depots --------------------------------------------------------------
  // A depot stores rolling stock removed from deleted lines so trains are
  // never scrapped. It can optionally double as a passenger station, but the
  // yard/maintenance facilities eat into the catchment's commerce.
  DEPOT: {
    baseCost: 5000,                // cheaper than a full station — yard only
    landMultDepot: 0.20,           // land-cost share when depot-only
    landMultStation: 0.55,         // land-cost share when doubling as a station
    buildDays: 150,                // calendar days to build a depot
    yearlyMaint: 5000,             // yen/depot/year lump (×inflation), levied at year end
    commerceMult: 0.45,            // pop/attraction multiplier when doubling as a station
  },

  // ---- Redevelopment --------------------------------------------------------
  // Tear up your own track and turn the parcel into rent-earning property
  // (the land stays yours; rent flows through the existing developed-land
  // income loop). Construction cost = a flat build price (×inflation) plus a
  // share of the hex's land value, so central redevelopment costs more.
  DEVELOP: {
    demolishCost: 1800,            // yen ×inflation ×terrain.buildMult to tear up 1 km of track
    landShare: 0.30,               // construction also costs this share of the hex's land value
    demolishDays: 60,              // calendar days to clear a parcel (×terrain.buildMult); track/buildings stay until done
    // builds: dev (development level) · cost (yen ×inflation) · days (calendar days to construct)
    builds: {
      shop:      { label: "Shopping center",       dev: 3, cost: 16000, days: 420 },
      apartment: { label: "Housing complex",       dev: 3, cost: 20000, days: 480 },
      house:     { label: "Townhouses",            dev: 2, cost: 9000,  days: 240 },
      civic:     { label: "Civic / office complex", dev: 2, cost: 13000, days: 300 },
    },
  },

  // ---- Trains ------------------------------------------------------------
  // speed km/h (hex=1km), capPerCar passengers, unlock year, needs
  TRAINS: {
    steam_local:  { name: "Steam Local",      speed: 35,  cap: 55,  cost: 8500,   from: 1872 },
    steam_exp:    { name: "Steam Express",    speed: 48,  cap: 50,  cost: 12000,  from: 1885 },
    emu_local:    { name: "EMU Local",        speed: 55,  cap: 80,  cost: 16000,  from: 1905, elec: true },
    emu_rapid:    { name: "EMU Rapid",        speed: 68,  cap: 75,  cost: 21000,  from: 1918, elec: true },
    emu_exp:      { name: "EMU Express",      speed: 80,  cap: 70,  cost: 27000,  from: 1932, elec: true },
    special_exp:  { name: "Special Express",  speed: 95,  cap: 64,  cost: 36000,  from: 1950, elec: true },
    shinkansen:   { name: "Shinkansen",       speed: 210, cap: 90,  cost: 90000,  from: 1955, elec: true, gauge: "standard" },
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
    // non-rail alternative cost per km (walking→bus→car); rail competes against this
    altPerKmByEra: { meiji: 18, taisho: 16, showa1: 14, showa2: 9, heisei: 8, reiwa: 8 },  // equiv min/km
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
    defaultFarePerKm: 0.25,       // yen/km at Meiji scale (×inflation-indexed yearly)
    reassignDays: 1,              // O-D refresh cadence in simulated days
    // --- comfort & rider segmentation (so pricier express trains attract demand) ---
    // A crowding "discomfort" cost charged in fare-equivalent yen per km of a
    // packed segment (×inflation), independent of value-of-time — so a jammed
    // local is genuinely unpleasant even in eras when time is nearly worthless,
    // pushing some riders onto an emptier (and dearer) express.
    comfortCostPerKm: 0.9,        // yen/km of discomfort at 2× crowding (load − 1 = 1)
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
    majorPer100y: 2,              // hard cap on destructive majors
    minMajorGapYears: 12,
  },

  // ---- AI -----------------------------------------------------------------
  AI: {
    entryWindows: [ [1874, 1888], [1884, 1902], [1896, 1912], [1898, 1914], [1906, 1924], [1908, 1925] ], // all by Showa
    thinkDays: 1,                 // AI decides once per simulated day (7×/year)
    parallelTrackPenalty: 2.5,     // A* weight penalty for new hexes beside an AI's own track (fewer parallel/duplicate lines)
    // ---- expansion discipline (don't carpet the map) ----
    // An AI extends only when its existing lines are busy (reach follows real
    // demand), and its appetite tapers as the network grows, so it builds a
    // sensible spine instead of sprawling redundant track.
    expandChance: 0.22,           // base per-think chance to consider a new branch (× difficulty × size brake)
    expandLoadThresh: 0.55,       // mean line load (demand/capacity) required before expanding at all
    expandMinScore: 360,          // minimum neighbourhood demand score for a new corridor's far end
    expandCashGate: 60000,        // minimum cash (× inflation) to consider expanding
    trackSoftCap: 38,             // track-km scale at which expansion appetite is roughly halved
    names: ["Musashino Electric Rwy", "Keihin Kido", "Sobu Rapid Rail", "Joban Tetsudo", "Keio Heights Rwy", "Tobu Garden Line"],
    colors: ["#d2624a", "#5a9bd2", "#62b06a", "#b08ad2", "#e08a3a", "#3aa0a8"],
    // Difficulty tunes how richly an AI starts, how big a cash buffer it
    // keeps before committing to construction, how often it expands or
    // speculates, and how hard it leans on fares to manage demand.
    DEFAULT_DIFFICULTY: "normal",
    DIFFICULTIES: {
      easy:   { name: "Easy",   cashMult: 0.70, bufferMult: 1.40, expandMult: 0.6, fareAggro: 0.6 },
      normal: { name: "Normal", cashMult: 1.00, bufferMult: 1.15, expandMult: 1.0, fareAggro: 1.0 },
      hard:   { name: "Hard",   cashMult: 1.40, bufferMult: 1.00, expandMult: 1.6, fareAggro: 1.4 },
    },
  },
  PLAYER_COLOR: "#e8c84a",

  // ---- Maintenance (recurring infrastructure upkeep) ---------------------
  // The ongoing cost of OWNING a network, accrued every sim-day (not just at
  // year end). Sprawling, idle or duplicate track is now a real liability —
  // the economic deterrent against carpeting the map with rails.
  MAINTENANCE: {
    trackPerKmYear: 170,        // yen/km/year (Meiji grass) × inflation × terrain.buildMult
    trackElecExtra: 0.5,        // +50% to maintain electrified catenary
    trainMaintFrac: 0.05,       // train upkeep/year = this × current-era price at 3 cars
    trainAgePerYear: 0.03,      // +3% upkeep per year of the train's age
    trainAgeMax: 1.8,           // age multiplier capped here (an ancient train ≈ +80%)
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
    hqBase: 16,                      // head-office overhead (clerks, management)
    hqPerKm: 0.06,
    // Prevailing annual wage per head (Meiji yen) × inflation × market tightness.
    baseWage: 150,
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
    wageMultMin: 0.85, wageMultMax: 1.9,
  },

  // ---- Annual awards / achievements --------------------------------------
  // A year-end ceremony recognizing the best (and worst) operators. Prizes
  // are modest PR money plus morale/reputation swings, so they nudge play
  // without dominating the balance.
  AWARDS: {
    cashFrac: 0.03,                 // a winner's prize = this × their year revenue
    cashCap: 40000,                 // capped here (× inflation)
    moraleBonus: 0.06,              // morale lift for a good award
    moralePenalty: 0.06,            // morale hit for "Worst Employer"
    reputationStep: 0.05,
    minCompaniesForWorst: 2,        // no "worst" award in a one-company field
    worstMoraleCeiling: 0.5,        // and only if the laggard is genuinely unhappy
    milestoneCash: 12000,           // one-time milestone prize (× inflation)
  },

  SAVE_KEY: "trt_save_v1",
  SAVE_VERSION: 6,               // v6: multi-gauge track (per-hex rails), gauge works & station demolition jobs
  SAVE_MIN_VERSION: 3,           // oldest save version still loadable (newer fields default in)
};

/** Era record for a given year. */
function eraOf(year) {
  for (let i = CFG.ERAS.length - 1; i >= 0; i--) if (year >= CFG.ERAS[i].from) return CFG.ERAS[i];
  return CFG.ERAS[0];
}
/** Price inflation multiplier, interpolated within eras for smoothness. */
function inflationOf(year) {
  const e = eraOf(year);
  const i = CFG.ERAS.indexOf(e);
  const next = CFG.ERAS[i + 1];
  if (!next) return e.inflation;
  const t = (year - e.from) / (next.from - e.from);
  return e.inflation * Math.pow(next.inflation / e.inflation, Math.max(0, Math.min(1, t)));
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
