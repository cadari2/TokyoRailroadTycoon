# Railroad Tycoon v0.5.2 — Design Plan (proposal — NOT yet implemented)

This document plans the next release. Nothing in here ships with v0.5.1; it is
the agreed starting point for the v0.5.2 work. Priorities are ordered by the
main complaint: **the game lacks challenge in the last third of a playthrough**
(roughly 1975 onward — the player's network is built, cash compounds, the AI
has stopped moving, and nothing new pushes back).

---

## 1. Late-game challenge (the core problem)

By late Shōwa the player has won without the game saying so. Six fixes, from
cheapest to deepest — the first four together should carry the release:

**1a. Late AI entrants ("second wind").** Today all rivals enter by 1925
(`CFG.AI.entryWindows`) and the survivors calcify. Add two late entry windows:
a postwar reconstruction operator (1946–1955) and a publicly backed rapid-transit
authority (1958–1968) that enters with era-scaled capital (already supported —
entrants get `START_CASH × inflation × 1.6`), a hard difficulty profile, and a
mandate to attack the busiest under-served corridors — i.e. the player's.

**1b. AI competence ramp.** The AI currently knows: extend when busy, add a
train, nudge fares. Teach it the tools the player uses (all already exist as
functions): build a **depot** when a line wants a 3rd train (v0.5.1 requires
this), overlay an **express** on its busiest local corridor (`createLineVia`),
**electrify/regauge** a corridor when the sums work, buy **crossing rights**
proactively, and **renew old track**. Gate the fancier behaviours by difficulty
so "easy" stays easy.

**1c. Aging infrastructure.** Track and stations already record built/renewed
years but only earthquakes read them. Make age itself expensive: permanent-way
maintenance multiplier grows past ~40 years since renewal; a "renew track"
action (cheaper than rebuild, closes the line hex-by-hex like regauging) resets
it. An old network stops being free money and the late game becomes a rolling
renewal programme — exactly what real railways spend their last third doing.

**1d. Demographic transition.** Population growth is currently monotonic.
Give the growth engine a national demography curve: rapid growth to ~1970,
plateau ~1990–2010, gentle decline after (Tokyo); London/NYC/Melbourne get
their own curves. Late game shifts from "growth lifts every line" to fighting
for share of a fixed, then shrinking, market — the classic hard endgame.

**1e. Regulatory pressure.** From late Shōwa, fare-cap ordinances (fares above
the era-comfortable level draw a Ministry warning, then fines/reputation loss)
and minimum-service mandates on chartered lines (a line left trainless for
years forfeits its charter — the corridor opens to rivals).

**1f. Graded endgame scoring.** Replace the single survival check with graded
victory at END_YEAR: transport share, profitability, reputation, network reach
— bronze/silver/gold. Gives the last decades a target other than "don't die."

## 2. Missing mechanics (candidates, in priority order)

1. **Freight** — the actual backbone of Meiji–early Shōwa railways. A second
   demand layer (factories/ports/mines as producers, city hexes as consumers),
   freight yards as station analogues, decline after 1960 as the kaidō become
   highways. Big but transformative; schedule first if only one lands.
2. **Shares & takeovers** — AI companies list on the exchange; the player can
   buy stakes for dividends or control (and be bought in turn if public and
   weak — a real late-game threat). Builds on the existing buyout machinery.
3. **Through-service agreements** — negotiated direct running between networks
   (the `through_service` R&D exists; make it a per-pair contract with revenue
   split, not just a multiplier).
4. **Level crossings** — where track crosses a paved/highway kaidō at grade,
   capacity is pinched; a grade-separation project (bridge/underpass) removes
   it. Pairs naturally with 1c and the road-growth mechanics from v0.5.1.
5. **Seasonal/tourism demand** — resort corridors (beach, mountain, shrine)
   with season-weighted attraction; uses the existing `seasonOf`.

## 3. Computer-player logic improvements (file-level notes)

- `ai.js aiScoredTargets`: score corridors (chains of 2–3 anchors via the
  demand-field ridge), not just endpoints; hard AI plans `createLineVia`
  waypoint routes along the ridge instead of A→B.
- New `ai.plan` kinds: `expressOverlay`, `electrify`, `depot`, `renewTrack`,
  `crossingRights` — each with a cash gate and a difficulty gate.
- Fare logic: per-line target load factor (0.8–1.05 by difficulty) replacing
  the blunt ±8% nudges; respects the 1e fare caps.
- React to the player: when a player line's load exceeds ~1.2 for a year, hard
  AI scores a parallel/relief corridor with the rival-discount already in CFG.
- Wind-down sanity: an AI in hopeless decline sells outlying branches (uses
  the v0.5.1 auto-sell path) before the bank does it for them.

## 4. Campaign framework (groundwork NYC/Melbourne need)

Campaigns are currently two string compares (`"tokyo" | "london"`) scattered
across ~10 files. Before adding two more cities:

- `CFG.CAMPAIGNS` registry: `{ key, title, currency, startYear, endYear,
  eraLabel(), mapBuilder(), namePools, roads, aiNames, holdoutNames,
  disasters: {quake, storm, ...}, unlockAfter }`.
- `generateMap` splits into shared helpers (elevation, rivers-to-sea with the
  v0.5.1 invariants, roads walker, towns, holdouts) + a small per-city terrain
  script.
- Save schema v11: `campaign` becomes an open key validated against the
  registry; everything else already regenerates from seed.
- Unlock chain: Tokyo → London → **New York** → **Melbourne** (each completes
  to unlock the next; localStorage flags like `trt_london_unlocked`).

## 5. New York City campaign (after London)

- **Map:** Hudson along the west edge (sea-grade river, expensive to cross),
  East River splitting a dense Manhattan spine from the Brooklyn/Queens
  flatlands, the harbor in the south **touching the map edge** (open sea),
  hills in the Bronx/Westchester north, Jersey shore west of the Hudson.
  Centre hex: City Hall.
- **Roads:** Broadway (the diagonal, N–NW up the island), Boston Post Road
  (NE), Kings Highway (SE through Brooklyn), Albany Post Road (N along the
  Hudson). Same corridor mechanics as the kaidō.
- **Currency:** `$`. **Era labels:** Gilded Age 1872–1900, Progressive Era
  1901–1929, Depression & War 1930–1945, Postwar 1946–1974, Fiscal Crisis
  1975–1989, Revival 1990–2028 — the Fiscal Crisis era is the built-in
  late-game difficulty spike (§1 pressures cranked up, city near-bankrupt,
  maintenance crisis).
- **Flavour mechanics:** elevated railways (early cheap urban track with a
  growing blight penalty on adjacent land value), river tunnels unlock ~1904,
  ferry competition as a strong water-crossing alt-mode, blizzard/hurricane
  disasters instead of earthquakes.
- **Names:** fictionalized companies ("Gotham Elevated", "Interborough
  Transit", "Brooklyn Heights RR", …), estate holdouts ("the Astor estate",
  "Trinity Church lands", …), neighbourhood name pools per borough in
  `data/nycnames.js`.

## 6. Melbourne campaign (after NYC)

- **Map:** Port Phillip Bay fills the south **touching the map edge**, the
  Yarra winding east→west into it, flat basalt plains west, the Dandenong
  hills east, bayside arc of suburbs. Centre hex: Flinders Street.
- **Roads:** Sydney Road (N), St Kilda Road (S), Dandenong Road (SE), Geelong
  Road (SW), Heidelberg Road (NE).
- **Currency:** `£` (Australian pounds; a 1966 decimal-currency flavour event
  switches the symbol to `$` — display only). **Era labels:** Marvellous
  Melbourne 1872–1891, Land Bust 1892–1900, Federation 1901–1928, Depression &
  War 1929–1945, Postwar Sprawl 1946–1980, Modern Melbourne 1981–2028.
- **Flavour mechanics:** the **1890s land bust** (the existing land-bubble
  machinery scripted to a guaranteed early crash — a famously brutal opening),
  strong tram competition as the road alt-mode in the inner ring, broad gauge
  (5'3" / 1600 mm) as the local standard added to `CFG.GAUGES`, bushfire and
  heatwave disasters, a late "level crossing removal" civic programme that
  pays the player to grade-separate (ties into §2.4).
- **Names:** fictionalized companies ("Hobsons Bay United Rwy", "Yarra Valley
  Rail Co.", …), suburb pools in `data/melbnames.js`.

## 7. Sequencing

| Phase | Content | Size |
|---|---|---|
| 1 | §4 campaign framework + save v11 | M |
| 2 | §1a–1d late-game challenge, §3 AI ramp | L |
| 3 | §5 New York (map, names, eras, elevated/tunnel/ferry) | L |
| 4 | §6 Melbourne (map, names, eras, land bust, broad gauge) | M |
| 5 | §1e–1f, §2 picks (freight first) as scope allows | L |

## 8. Testing

- Headless: campaign-matrix smoke (all four cities × the §1 invariants:
  water rules, roads, names ASCII where required, AI solvency curves).
- Balance harness (`tools/balance.js`): assert the AI's late-game share —
  in a hands-off run the top AI should still be growing pax in 2000+.
- Save round-trips per campaign at v11; refuse v10 gracefully.
- Playwright: boot each campaign, check currency symbol, era label, road
  names, and one full era transition of BGM/SFX.
