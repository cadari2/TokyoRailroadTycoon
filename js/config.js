/* =========================================================================
 * config.js — All tuning constants for Tokyo Railroad Tycoon.
 * Everything balance-related lives here so the game can be retuned in one place.
 * ========================================================================= */
"use strict";

const CFG = {
  MAP_W: 50,
  MAP_H: 50,
  CENTER: { col: 25, row: 25 },          // fictional Nihonbashi / Edo center

  YEAR_SECONDS: 300,                      // 5 real minutes = 1 in-game year (at yukkuri speed)
  // The year is SIMULATED as one representative week: 5 work days + 2
  // holidays, each with its own ~43-second day/night cycle. Every simulated
  // day stands for ~52 calendar days of traffic and construction progress.
  DAYS_PER_YEAR: 7,
  // Game-speed presets chosen on the start screen (real-time multiplier on
  // YEAR_SECONDS). yukkuri ゆっくり is the base 5-minute year.
  SPEEDS: [
    { key: "katatsumuri", name: "カタツムリ Katatsumuri (½×)", mult: 0.5 },
    { key: "yukkuri",     name: "ゆっくり Yukkuri (1×)",        mult: 1   },
    { key: "sakusaku",    name: "サクサク Sakusaku (2×)",       mult: 2   },
    { key: "isoge",       name: "急げ Isoge (5×)",             mult: 5   },
  ],
  DEFAULT_SPEED: "yukkuri",
  CAL_DAYS_PER_SIM_DAY: 365 / 7,
  TRAIN_VISUAL: 0.05,                     // visual hex/sec per km/h (aesthetic scale)
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
    holdoutFrac: 0.10,             // share of developed hexes held by private owners who never sell (2× the original scattering)
    palaceRadius: 2,               // hexes within this radius of CENTER are Imperial Palace grounds/moat
    palaceMult: 60,                // price multiplier at the palace hex itself (the Kokyo is not for sale)
    palaceRingMult: 20,             // price multiplier for the surrounding grounds & moat (radius 1-2)
  },

  // ---- Construction ------------------------------------------------------
  // NOTE: no recurring track/train maintenance — the only running costs are
  // property tax and a station-building upkeep lump, levied at year end.
  TRACK: {
    baseCost: 2400,               // yen/hex (≈1 km), Meiji, grass
    elecExtra: 0.5,               // +50% for electrified
    // calendar days to build 1 hex of track (≈52 days = 1 simulated day)
    daysPerHexByEra: { meiji: 100, taisho: 75, showa1: 55, showa2: 35, heisei: 25, reiwa: 20 },
    tunnelTimeMult: 3, bridgeTimeMult: 2,
  },
  STATION: {
    baseCost: 9000,
    centralMult: 3.0,             // central land makes stations pricier (scales w/ land value)
    upgradeCostMult: 2.2,         // modifying established stations is expensive; ×level
    platformUpgradeCost: 6000,    // per car slot added (×inflation)
    yearlyMaint: 9000,            // yen/station/year lump (×inflation, ×level), levied at year end
    buildDays: 100,               // calendar days
    maxLevel: 3,
    catchment: 2,                 // hex radius
  },

  // ---- Depots --------------------------------------------------------------
  // A depot stores rolling stock removed from deleted lines so trains are
  // never scrapped. It can optionally double as a passenger station, but the
  // yard/maintenance facilities eat into the catchment's commerce.
  DEPOT: {
    baseCost: 5000,                // cheaper than a full station — yard only
    landMultDepot: 0.20,           // land-cost share when depot-only
    landMultStation: 0.55,         // land-cost share when doubling as a station
    buildDays: 70,                 // calendar days
    yearlyMaint: 5000,             // yen/depot/year lump (×inflation, ×level), levied at year end
    commerceMult: 0.45,            // pop/attraction multiplier when doubling as a station
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
  SERVICE_HOURS: 18,              // operating hours per day
  DWELL_MIN: 1.0,                 // minutes per stop
  TRANSFER_MIN: 5,                // transfer penalty minutes

  // ---- Passengers --------------------------------------------------------
  PAX: {
    gravityK: 0.30,               // master demand scale
    costLambda: 30,               // generalized-cost decay (yen-equivalent minutes)
    votByEra: { meiji: 0.15, taisho: 0.3, showa1: 0.6, showa2: 6, heisei: 22, reiwa: 26 }, // yen/min
    // non-rail alternative cost per km (walking→bus→car); rail competes against this
    altPerKmByEra: { meiji: 18, taisho: 16, showa1: 14, showa2: 9, heisei: 8, reiwa: 8 },  // equiv min/km
    adoptionRamp: [ [1872, 0.35], [1900, 0.6], [1925, 0.85], [1955, 1.0], [2028, 1.0] ],
    holidayMult: 0.55,            // days 6 & 7 of each week
    crowdDesirePenalty: 0.5,      // desirability loss at 2x overcapacity
    // --- rider realism (route choice & where people locate) ---
    crowdTimePenalty: 0.8,        // crowded trains feel slower: +80% in-vehicle time at 2× load (route choice)
    waitWeight: 1.0,             // half-headway wait, weighted into generalized cost (frequency matters)
    comfortFareMult: 1.6,         // fares up to 1.6× the era default ride "comfortable"; above this, demand erodes
    affordSpread: 0.6,            // how sharply demand falls once fares exceed the comfortable level
    destLambda: 1.0,              // destination-choice competition spread (× costLambda × VoT)
    defaultFarePerKm: 0.25,       // yen/km at Meiji scale (×inflation-indexed yearly)
    reassignDays: 1,              // O-D refresh cadence in simulated days
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

  SAVE_KEY: "trt_save_v1",
  SAVE_VERSION: 2,               // v2: week-per-year sim, year-end cost levy
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
