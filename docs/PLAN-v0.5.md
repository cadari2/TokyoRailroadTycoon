# Tokyo Railroad Tycoon v0.5 — Implementation Plan

Planning session, 2026-07-07. Covers the 12-task request (funds, player classes, bugs,
unique names, sound gaps, Japanese UI, UI tidy, water bodies, kaidō→highway, demand
accuracy, loans/bankruptcy, London campaign). Approved decisions from the interview are
baked in below. Implementation happens in a fresh session, phase by phase.

Mockups referenced (published as artifacts during planning):
- A · Start screen with player classes + language toggle
- B · UI option 1 (icon rail) — NOT chosen
- C · UI option 2 (command bar) — NOT chosen
- D · Water / kaidō / loan visual & rules spec — basis for Phases 2–4

---

## Overview

Twelve tasks, three of which are structural (water map overhaul, kaidō corridors,
London campaign), two economic (loans/bankruptcy, demand accuracy), and the rest
bounded features and fixes. One coordinated save-schema break (SAVE_VERSION bump,
old saves declined with a clear message). All sim-side work lands with coverage in
`tools/smoke.js` since the sim is deliberately headless-testable.

## Approach Chosen (interview decisions)

| Topic | Decision |
|---|---|
| UI simplification | **Option 3 — tidy the existing tabs**: merge 9 tabs → ~5, stat tiles, cut prose. No inspector rebuild. |
| London | **Full second campaign**, 1863–2028, minimal engine change except hex names (no kanji), hex art, map layout (Thames), and a monarch-reign era list: Victoria (–1901), Edward VII (1901–10), George V (1910–36), Edward VIII (1936), George VI (1936–52), Elizabeth II (1952–2022), Charles III (2022–). Unlocked by surviving the Tokyo campaign. Quakes & taishin disabled; war kept but probability-timed. |
| Player classes | Funds + loan terms + **starting land grants**: kazoku = one 2–3-hex plot near the palace **and** a second 2–3-hex plot further out; zaibatsu = one 2–3-hex plot central-ish (outside palace area); shizoku/heimin = none. No other bonuses. |
| Fare drift "bug" | **Remove auto inflation-indexing** of fares. Fares stay exactly where set; UI warns when a fare falls far below the era-comfortable level. |
| Save compatibility | **Break cleanly**: bump SAVE_VERSION, raise SAVE_MIN_VERSION, decline old saves with a "new game required" message. |
| Hex names | Pre-WWII Tokyo-region names for the periphery; directional/新 prefixes (北・南・東・西・新) allowed **at most once each per larger region**, as a last resort. |

Class table (zaibatsu anchors task 1's ¥850,000):

| Class | Reading | Difficulty | Start cash | Credit limit | Interest | Land grant |
|---|---|---|---|---|---|---|
| 華族 Kazoku | kazoku | 易しい yasashii | ¥1,300,000 | generous (×0.9 of assets) | low (4%) | 2–3 hexes near palace + 2–3 hexes further out |
| 財閥 Zaibatsu | zaibatsu | 普通 futsuu | **¥850,000** | standard (×0.6) | market (6.5%) | 2–3 hexes central-ish |
| 士族 Shizoku | shizoku | 難しい muzukashii | ¥520,000 | tight (×0.45) | high (9%) | none |
| 平民 Heimin | heimin | 無理 muri | ¥300,000 | usurious (×0.35) | punitive (12%) | none |

(Exact multipliers to be tuned in `tools/balance.js` during implementation.)

## High-Risk Areas (ranked)

1. **Map generation overhaul (task 8).** There is currently *no sea or lake*; Tokyo Bay
   is land. New hydrology must guarantee: every river sources in mountain, descends
   through valleys, terminates in sea; bay in the SE; occasional lakes; swamp near
   mouths/coasts. Everything downstream assumed land: initial town anchors, land-value
   falloff, A* pathfinding, AI corridor scoring, holdout placement, demand field. Needs
   a determinism test across many seeds (river-reaches-sea invariant).
2. **Loan/bankruptcy (task 11) + classes (task 2).** First debt concept in the game;
   touches dailyTick (interest accrual), year-end (tax delinquency counter), UI
   (Finance panel), save schema, and — for fairness — AI companies should draw on the
   same credit mechanic instead of running unlimited negative cash.
3. **Kaidō corridors (task 9).** Roads become a network-level, government-owned object
   with per-hex era state (dirt → paved from 1945 → highway by ~1960, converting
   city-outward), purchasable crossing rights, and a mode-share effect on demand.
   Interacts with rivers (kaidō need fords/bridges) and names (post towns).
4. **Demand accuracy (task 10).** Rebalancing `altPerKmByEra` into an explicit
   alternative-modes model (walk/rickshaw/bicycle/bus/car by era) so monopoly pricing
   is capped by the alternative's generalized cost; highway corridors strengthen the
   car alternative locally. Risk: destabilizing the carefully-tuned v0.4 economy.
5. **London campaign (task 12).** Era-keyed constants (`daysPerHexByEra`,
   `votByEra`, `scarcityByEra`, …) are indexed by era *key*; a new era list means a
   mapping layer or per-campaign constant tables. Also: victory→unlock flow,
   campaign field in saves, Latin-only name rendering.
6. **Fare de-indexing (task 3a).** Removing `main.js` fare re-indexing changes
   long-run balance (idle player fares now erode in real terms). Mitigate with the
   below-comfort warning and a one-click "raise to era-comfortable" action.

## Step-by-Step Implementation Plan

Phased riskiest-first; mechanical work last. Each phase = one PR, smoke-tested.

### Phase 1 — Data model & schema (foundation for everything) ✅ DONE
Implemented 2026-07-07 (this session). Notes:
- `CFG.PLAYER_CLASSES` + `CFG.DEFAULT_PLAYER_CLASS` + `CFG.GRANT_RINGS`; `st.playerClass`,
  `st.campaign`; company fields `playerClass/debt/rate/creditFactor/taxArrears/delinquentYears`;
  `classTermsOf()` / `creditLimitOf()` helpers (mechanics come in Phase 4).
- New `sea`/`lake` terrain keys defined (`reclaimable`, `water`, not buildable) — generator
  wires them in Phase 2. `hex.kaido` deferred to Phase 3 (no state needed before it).
- `SAVE_VERSION: 9`, `SAVE_MIN_VERSION: 9`, friendly decline message for pre-v0.5 saves;
  campaign/class/credit fields serialize + validate on load.
- Start screen: class picker (radio rows: name, difficulty, funds, grant count); zaibatsu
  default anchors task 1's ¥850,000. Land grants placed at newGame via `grantStartingLand`
  (contiguous 2–3-hex plots, seed-jittered, skips water/holdouts/palace/foreign land).
- Smoke coverage added: per-class cash/terms/grants, grant placement rings, credit-limit
  scaling, v9 save round-trip, pre-v9 decline. Full suite green.
- Define in `config.js` / `world.js` / `save.js`, in one pass:
  - `CFG.PLAYER_CLASSES` (table above), `st.playerClass`.
  - Loan state per company: `co.debt`, `co.rate`, `co.creditLimit()`, `co.taxArrears`,
    `co.delinquentYears`.
  - New terrain keys: `sea`, `lake` (river/moat/canal keep `bridge: true`; sea/lake get
    `reclaimable: true`, not bridgeable-by-buildings, rail allowed as causeway).
  - Kaidō: `hex.kaido = { route: "tokaido"|…, state: "dirt"|"paved"|"highway", rightsOwner }`.
  - Campaign: `st.campaign = "tokyo"|"london"`; era tables become per-campaign.
  - `SAVE_VERSION: 9`, `SAVE_MIN_VERSION: 9`, friendly decline message for older saves.
- Start-screen: player-class picker per Mockup A (start cash ¥850,000 for zaibatsu —
  task 1 — is subsumed here). Grant plots at game start (owner = player, near-palace /
  mid-ring placement with seed jitter, skipping holdouts/water).

### Phase 2 — Water map overhaul (task 8) ✅ DONE
Implemented 2026-07-07 (this session). Notes:
- Generator: jittered Tokyo Bay heart (always sea; coastline follows lowlands; old city
  within 8 of the palace never floods), rivers walk downhill with bayward pull and are
  guaranteed to reach the sea (`carveToSea` fallback; gorges cut straight through
  mountains so no river segment is ever orphaned), 0–2 inland lakes, coastal/lakeshore
  swamp. Town anchors and satellites relocate to `nearestDryLand`.
- Rules: land value 0 on water, `buyLand` refuses water, rivers can't be reclaimed,
  sea/lake reclaim ~¥45,000/hex over ~700 days (era-scaled) via a `reclaim` build job;
  causeway (rail/station on sea/lake) uses bridge time mult + station `bridgeMult` 2.2.
  Reclaimed hexes carry `h.reclaimed` and persist in saves (`hx.rec`) since terrain
  regenerates from seed. Combined "reclaim + build in one order" deferred to Phase 10.
- Render: sea (rolling crests + whitecaps + depth wash) and lake (concentric ripples)
  art; bridge/causeway trestle bents under track; reclaim-job hatching that fills in
  with progress (and the job-hatch loop now handles single-hex `reclaim` jobs — it
  previously crashed on them).
- AI: `planTrack` forbids AI from planning new causeways (reuse of own water track ok);
  AI entry capital raised ×1.3→×1.6 — the water map makes first corridors dearer and
  entrants were dying pre-revenue (survival restored to pre-overhaul levels across seeds).
- Fixed a pre-existing period-2 oscillation in O-D crowding feedback (`_load` now damped
  50/50) that the map change exposed via the express-vs-local smoke test.
- Smoke coverage added: bay/rivers exist and every river hex drains to the sea across
  5 seeds (flood-fill check); full reclamation lifecycle incl. save round-trip; water
  purchase/reclaim refusals; station bridge premium. Full suite green.
- `map.js` generator: carve Tokyo Bay (SE coastline from elevation + distance field),
  lower eastern lowlands, run rivers strictly downhill until they hit sea (guaranteed
  by carving when stuck), 0–2 lakes in inland basins, swamp scattered near mouths,
  coasts and lake shores.
- Rules (Mockup D): rail/station over river = bridge (cost ×3 / time ×2, existing
  mults; station bridge ×2.2); **no reclamation possible on rivers**; sea/lake
  reclaimable (~¥45,000/hex Meiji, ~700 days, era-scaled) via the construction-job
  system; combined "reclaim + build" order queues both with summed cost; rail/stations
  on sea/lake need no reclamation (causeway pricing).
- Render: distinct art per water type (ripples/waves/depth tint), bridge trestle glyph,
  reclamation hatching.
- Update: town anchors avoid water, land value = 0 on water until reclaimed, A* and AI
  scoring treat sea/lake as impassable-except-causeway, holdouts never on water.
- Smoke tests: every river reaches sea over N seeds; reclamation lifecycle; bridge cost.

### Phase 3 — Kaidō → highway (task 9) ✅ DONE
Implemented 2026-07-07 (this session). Notes:
- `CFG.KAIDO` (routes/angles/jitter, rights pricing, era years, alt-mode mults).
  Generator walks the four named corridors from Nihonbashi (Ōshū splits from the
  Nikkō road ~5 hexes out, i.e. Senju), fords rivers, skirts mountains/sea, stops at
  the map edge. Land under them becomes government pseudo-owner `-3`. Old 5 random
  road spokes removed; "road" kept in CONS as legacy key only. Roadside urban pull
  (post-town strips) baked into cons placement.
- Crossing rights: `kaidoRightsCost` (state-scaled × inflation), `buyKaidoRights`
  (Inspect button) or bundled automatically into track quotes (`trackPlanCost` /
  `buildTrackHex` count unpaid rights as landCost; `approveTrack`/build grants them).
  `planTrack` passable now crosses owner `-3`; stations remain impossible on the road
  (ownership requirement). Rights persist per company on the hex, and in saves
  (`hx.kr`); corridors + states regenerate from seed/year on load (`updateKaido`).
- Era evolution: dirt → paved spreading outward 1945–60 → expressway spreading from
  1960–72 (`updateKaido` at new year). Demand hook: stations within 2 hexes of a
  paved/highway kaidō face a stronger non-rail alternative (altPerKm × 0.88/0.72).
- Render: continuous road band styled per state (ochre dirt / grey paved with centre
  line / dark expressway with dashed white line). Inspect + hover show route name,
  state, rights price; hover shows government ownership.
- Smoke coverage: four routes with real length, zero isolated road hexes, government
  ownership, buy refusal, rights bundling in quotes, rights persistence through
  save/load, dirt-in-Meiji / paved-by-1952 / expressway-core-by-1970, alt-mode
  strengthening. Full suite green; AI survival unchanged.
- Replace the 5 random road spokes with 4 named corridors from Nihonbashi:
  Tōkaidō (S/SW via Shinagawa toward Yokohama), Kōshū Kaidō (W via Naitō-Shinjuku),
  Nikkō & Ōshū Kaidō (N via Senju, splitting), plus their historic bearings; per-seed
  jitter, same hexes all game. No isolated road hexes anywhere.
- Government pseudo-owner (`owner: -3`); crossing/building **rights purchasable**
  (price scales with corridor state); rights persist on the hex.
- Era evolution: dirt until 1945; paving spreads outward from the center 1945–1960;
  highway from ~1960. Rendering per state (Mockup D timeline).
- Demand hook: paved/highway hexes strengthen the local non-rail alternative (feeds
  Phase 4) and add a small development pull along the corridor.
- Remove `road` from CONS or keep as legacy alias for kaidō art only.

### Phase 4 — Loans & bankruptcy (tasks 11 + 2 coupling) ✅ DONE
Implemented 2026-07-07 (this session). Notes:
- `borrowLoan`/`repayLoan`/`availableCredit` in world.js; `creditLimitOf` now uses NET
  WORTH (company value − debt) × class factor so drawn cash can't collateralize more
  credit. Interest accrues monthly in `dailyTick` (debt × rate ⁄ 12, one tick = one
  month), folded into operating cost + surfaced as `stats.interestToday`.
- Year-end levy reworked: tax + upkeep + carried arrears must be paid from positive
  cash; the shortfall becomes `taxArrears` and bumps `delinquentYears`. At 3 straight
  years: compulsory loan if the line covers it (arrears cleared, debt booked), else
  SELL-OUT — player: `st.ended`/`endReason:"sellout"` with a dedicated end-screen
  banner; AI: wound up.
- AI parity: aiTick treasury desk draws on the line to cover overdrafts and repays
  when flush; the wind-up rule now keys on cash + remaining credit headroom instead
  of raw negative cash (rope = the Kangyō line, same as the player).
- Finance panel: Kangyō Bank block (debt, rate, monthly interest, limit, headroom,
  Borrow…/Repay… with amount modal) + red arrears warning banner with the 3-year rule.
- Smoke: cap enforcement, refusal at exhaustion, monthly interest math, repayment,
  debt save round-trip, no-credit spiral → sell-out, with-credit spiral → compulsory
  loan. Full suite green; AI survival unchanged (4/6 thriving at 1930).
- Kangyō-Bank credit line: borrow/repay any amount within `creditLimit`
  (assets × class factor); interest accrues monthly in `dailyTick`; class sets rate.
- Tax delinquency: unpaid year-end obligations accumulate as arrears; at 3 consecutive
  delinquent years a compulsory loan is forced; if the credit line cannot cover it →
  **sell-out: game over in failure** (dedicated end screen, distinct from victory).
- AI parity: AI companies use the same credit line (replaces the "negative cash until
  −2× START_CASH" rope); wind-up rules re-expressed in loan terms.
- Finance panel: debt/rate/limit/arrears block + warning banner (Mockup D).
- Smoke: borrowing cap enforced, interest math, 3-year spiral ends the game.

### Phase 5 — Demand accuracy (task 10) ✅ DONE
Implemented 2026-07-07 (this session). Notes:
- `CFG.PAX.ALT_MODES` replaces the `altPerKmByEra` scalar: per-era mode sets
  (walk/rickshaw → +bicycle → +bus → +car) with minPerKm, yenPerKm (nominal via
  inflation) and access time. assignOD takes the CHEAPEST mode's generalized cost per
  O-D as the competing alternative — monopoly fares are capped by defection to a real
  mode, and the money leg finally responds to inflation.
- Road-bound modes (rickshaw/bus/car) ride the kaidō: their in-vehicle time scales by
  KAIDO.altMult near a paved/highway corridor, so expressways locally cheapen the car
  alternative late-game (Phase 3's blanket multiplier refined to road modes only).
- Effective curve calibrated to the tuned v0.4 targets (18/16/14/9/8/8 min/km-equiv;
  measured 18.0/16.1/12.9/8.2/7.0/6.8) so the economy stays on scale.
- Core loop re-verified: growth remains accessibility-driven (boardings × desirability
  × affordability); two fixes — development never builds on the kaidō roadbed, and
  growth no longer spawns legacy random "road" cons.
- `tools/balance.js` re-run: rev/cost ratios now hold a healthy 1.0–3.0 band through
  2029 (v0.4 baseline let the leader hit 9+ — money had stopped mattering); player-seat
  minimum cash stays positive. Smoke adds: era progression of alt cost, target-curve
  bounds, highway-cheapens-car check, monopoly-cap check. Full suite green.
- Make the alternative mode explicit: per-era alternative set (walk/rickshaw →
  bicycle/bus → car) generating the competing generalized cost; monopoly fares are
  naturally capped because riders defect to the alternative, not to nothing.
- Highway corridors locally cheapen the car alternative (late game pressure on
  parallel rail).
- Re-verify the core loop: stations + good connections → residential/commercial growth
  → region population; ensure population growth is driven by accessibility.
- Re-tune with `tools/balance.js`; document target curves in comments.

### Phase 6 — Bug fixes (task 3) ✅ DONE
Implemented 2026-07-07 (this session). Notes:
- Fares: the annual re-indexing of PINNED prices (line overrides + player-set company
  default) is gone — a fare stays exactly where set and erodes in real terms. Lines
  following an unset company default still track the era reference rate (that's the
  market's price, not a pinned one). Lines panel: warning chip + one-click "raise to
  era-comfortable" on any pinned fare below 40% of the comfort level, and the same
  warning/raise for an eroded pinned company default.
- Construction skip: `daysToNextCompletion` now REPLAYS the FIFO crew allocation day
  by day over a copy of the queue (multi-crew corridors, crew-starved tail jobs), so
  the skip lands exactly on the first real completion. The Build-panel queue labels
  zero-slot jobs "waiting for crew (~N days of work queued)" and now also lists
  reclamation jobs.
- Sweep: both suites green; save/load of all new v0.5 fields covered by the
  Phase 1–5 round-trip tests.
- Smoke added: pinned fares immune to year rollover, follower tracks the default,
  crew-aware skip completes the first job but not the waiting tail.
- **Fares**: delete the annual re-indexing in `main.js` (lines ~134–145); add a
  below-comfort warning chip in the Lines panel + one-click "raise to comfortable".
- **Construction skip**: make the skip crew-aware — simulate crew allocation forward to
  find the true sim-day count to the next completion (replacing the estimate), and
  label crew-starved jobs "waiting for crew" in the queue so remaining-day figures
  read honestly.
- General sweep: run `tools/smoke.js` + `domsmoke.js`, fix anything found; audit
  save/load round-trip of all new fields.

### Phase 7 — Unique hex names (task 4) ✅ DONE
- Extend `data/machinames.js` with pre-WWII names to cover all ~2,500 hexes: more inner
  pools + new peripheral ward/gun groups (post towns, Edo-period villages, pre-merger
  ōaza). Directional/新 prefixes at most once each per larger region, last resort only.
- Replace the periphery fallback (`hexAreaName`) with pool-based assignment +
  uniqueness assertion; smoke test: **no duplicate names on any seed**.

**Implementation notes:**
- `data/machinames.js`: added 10 new peripheral ward/gun groups (Hachioji, Hino-Tama,
  Ome-Fussa, Kitatama, Ageo-Konosu, Noda-Sekiyado, Sakura-Yachiyo, Kazusa, Shonan,
  Atsugi-Zama), ~160 real pre-war [kanji, romaji] pairs, positioned by (dc,dr) hex
  offset from the palace so each gun sits in its true compass direction.
- `js/map.js` `assignAreaNames` rewritten for **global** uniqueness (was local-only):
  (1) global dedupe — a name that legitimately existed in several wards is kept by the
  first ward only; (2) every ward claims its nearest hexes (REACH cap removed) and hands
  them distinct machi by proximity; (3) overflow pass — periphery hexes past a spent pool
  take a directional/新-prefixed variant of the nearest ward's names (新X → 北X → 南X →
  東X → 西X), each prefix+name combo used at most once; (4) absolute fallback (empty data
  file) numbers district anchors. `hexAreaName` retained only as that last-ditch base.
  Purely positional → regenerates identically through save/load.
- `tools/smoke.js`: replaced the ≥85%-local-core-unique test with **no duplicate hex
  names on any seed** across 8 seeds (all report 2500/2500 distinct); `_allowed`-name
  check widened to accept prefixed variants; west-side keyword list gained 新宿/内藤
  (內藤新宿 now legitimately lands at 18,25 after the dedupe shuffle). All 128 smoke +
  28 dom checks green.

### Phase 8 — Sound hooks (task 5) ✅ DONE
Wire `queueSfx` at currently-silent moments; add manifest slots (user provides assets
after review). **List approved** — implement all of the below:
- UI: invalid action ("can't build here"), start-screen, start-screen button.
- Economy: land sold, fare changed, year-end tax levied, good award won, bad award ("worst employer"), milestone.
- Ops: line deleted, train scrapped/stored, strike start, strike end.
- Mechanics: loan drawn, loan repaid, tax-arrears warning, bankruptcy/sell-out, reclamation complete, bridge complete, kaidō rights purchased, buyout completed, new company enters the game, buy out a company.

**Implementation notes:**
- New `queueSfx` calls, all gated to the PLAYER (`co.isPlayer`) so a rival's actions
  stay silent, following the existing convention: `land_sold` (`sellLand`), `kaido_rights`
  (`buyKaidoRights`), `buyout` (`buyOutCompany`), `bridge_done` vs `construction_done`
  (`processBuilds` now flags a job that spanned bridge/causeway/water), `train_scrapped`
  (`sellTrain`, so `scrapStoredTrain` inherits it), `tax_levied` (year-end levy in
  `onNewYear`), `company_enter` (a rival enters — fired for everyone), `strike_start`
  (`maybeStrike`), `strike_end` (`sim.js`, when a player strike ticks to 0), and
  `award_good`/`award_bad`/`milestone` (all three routed through `grantAward`, keyed on
  `opts.bad` and a `Milestone —` label prefix).
- UI-only moments in `ui.js`: `line_deleted` (the Delete-line confirm), `invalid_action`
  via a new `denyStatus(st, msg)` helper wired at the "can't build here" rejections
  (track/station/depot clicks), `start_screen` (queued when the title screen is built)
  and `start_screen_button` (both Continue and Start-new-game buttons — the latter rides
  in on the fresh state's queue alongside `game_start`).
- `assets/audio/manifest.js`: added slots for all 16 new names **plus** 6 that prior
  phases fired but had never been registered (`fare_changed`, `loan_drawn`, `loan_repaid`,
  `arrears_warning`, `sellout`, `reclaim_done`). Every fired name now has a slot
  (validated); missing files stay silent as before.
- `tools/smoke.js`: a Phase-8 block asserts the queue actually receives the right names
  for borrow/repay/sell-land/awards/milestone, that a fresh game queues `game_start`, and
  that a rival's award stays silent for the player. All 136 smoke + 28 dom checks green.

### Phase 10 — UI tidy (task 7, Option 3) ✅ DONE
*(Reordered ahead of Phase 9 per the note below — i18n threads through fewer,
tidier lines once the tabs are merged.)*
- Merge tabs: Build · Lines · Money (Finance+Property) · Company (R&D+Workforce+Companies) · System (Log folded in as a sub-tab or drawer).
- Summary-first: 4 stat tiles atop each panel; long explanations move to tooltips;
  collapsible sections for secondary content. Target ~60% less visible text.

**Implementation notes:**
- `js/ui.js`: `TABS` reduced from nine to five (Build · Lines · Money · Company ·
  System). A `SUBPANELS` map gives each parent tab its sub-panels — Money =
  Finance/Property, Company = R&D/Workforce/Rivals, System = Settings/Log — drawn
  behind an in-panel sub-tab row (`.subtab`), with per-parent selection remembered in
  `ui.subtab`. A `LEGACY_TAB` map normalizes old/deep-link names ("Finance", "Log", …)
  onto their new parent+sub-panel so existing callers and any saved UI state still route.
- `statTiles(G, panel)` draws four summary tiles atop **every** panel (Year·era, Cash,
  Net worth, Net/day), the numbers a player watches constantly — net-worth and a negative
  daily net turn amber. `collapsible(G, …)` folds secondary content away (open-state in
  `ui.collapse`); the Finance panel now shows five headline rows and tucks its long
  breakdown behind a collapsed "Full breakdown" section.
- `css/style.css`: `.statTiles`/`.statTile`, `.subtabs`/`.subtab`, `.collapseHead`/
  `.collapseBody`.
- `tools/domsmoke.js`: the panel-render test now walks all five parents × their
  sub-panels, asserts four stat tiles render on each, that multi-sub parents draw their
  sub-tab buttons, and that legacy tab names still resolve. 28 dom checks green.

### Phase 9 — Japanese interface (task 6) ✅ DONE
- String table `data/i18n.js` (`t(key)`), languages `en`/`ja`; toggle on start screen +
  System panel; persisted in localStorage. Hex names stay bilingual in both languages.
- Mechanical: sweep `ui.js`/`render.js`/start screen for literals. Done after Phase 10's
  tab merge would be ideal, but the merge is smaller — do i18n after UI tidy if
  convenient; they touch the same lines.

**Implementation notes:**
- `data/i18n.js`: a small `window.I18N = { en, ja }` table with `t(key, ...args)`
  (positional `{0}` substitution), `getLang`/`setLang`/`languages`. Language persists in
  `localStorage` (`trt_lang`); lookups fall back English → key so a partial table never
  blanks or throws. Authored as `.js` (not `.json`) for the same `file://` reason as the
  audio manifest; loaded right after `util.js`.
- `js/ui.js`: the persistent shell is fully bilingual — tabs, sub-tabs, the four summary
  stat tiles, the top bar (title/Demand/Pause·Resume/Menu), the start screen (title,
  subtitle, speed/save/continue/load/start), and the common modal-button keys.
  Crucially the **routing keys stay English** (`ui.tab` is still `"Build"`); only the
  displayed label goes through `t()`. `buildTabs`/`syncTopbarLabels` relabel the static
  chrome; `applyLang(G, lang)` persists, relabels, rebuilds the start screen if it's
  showing, and re-renders. Language toggles live on both the start screen and the System
  panel. Tab highlighting now keys off `G._tabBtns` (key-based) instead of button text.
- Map place names are already bilingual (`皇居 (Kokyo)`), so they read in either language
  with no table. Deep panel prose and transient status lines fall back to English for now;
  the framework is in place to migrate them literal-by-literal (swap `"…"` → `t("…")`).
- `tools/domsmoke.js`: loads `data/i18n.js`; a new test flips to Japanese, asserts `t()`
  and the tab/stat-tile labels localize while the routing key and hex names stay put, then
  reverts. All checks green.

### Phase 11 — London campaign (task 12) ✅ DONE
- Unlock: surviving to 2029 in Tokyo sets a localStorage flag; victory screen offers
  "New game — London 1863".
- Map: Thames (1-hex river, west→east, widening to estuary/sea in the east), un-buyable
  public hexes (Parliament, Buckingham Palace/royal parks — reuse the palace-hex
  mechanic), London area names Latin-only (Mayfair, Clerkenwell, Southwark, Seven
  Dials, Limehouse, …) in a `data/londonnames.js`.
- Eras: monarch list (Victoria → Charles III; Edward VIII's 1936 folded visually into
  a "1936" flash but constants-wise merged with George V/VI to keep era tables sane).
  Era-keyed constant tables get a campaign-aware lookup mapping monarch eras onto the
  existing tech progression by year.
- **Earthquakes & taishin disabled** for the London campaign: no major or minor quakes,
  no taishin standards/retrofits (the seismic UI and R&D branch hide when
  `st.campaign === "london"`). **War stays enabled** and stands in for the Blitz — but
  its timing remains the existing **probability-based** roll (`EVENTS.warChance` etc.),
  NOT pinned to 1939–45; a London game may see the "Blitz" early, late, or never, just
  as the Tokyo war can land in any year.
- Everything else minimal-change per decision: same sim, events, economy (kanji-free
  strings via the i18n layer).

**Implementation notes:**
- **Scope call — the shared 1872 clock.** London runs on the *same* 1872–2028 economic
  timeline as Tokyo rather than a separate 1863 start. `CFG.START_YEAR` is threaded through
  inflation (`priceHist`), `syncClock`, `eraOf`, adoption, AI entry and `END_YEAR`, so a
  second start year would have rippled everywhere for pure flavour. Instead the tech/economy
  progression is untouched and London simply *presents* the reigning monarch. The years the
  monarch table uses (Victoria 1872–1901 … Charles III 2022–) are historically correct for
  those actual years, so nothing is faked — only the "1863" label is dropped in favour of an
  honest "London 1872". Noted as a deliberate deviation.
- `js/main.js` / `js/map.js`: `campaign` ("tokyo" | "london") threads
  `newGame(opts.campaign) → freshState(seed, campaign) → generateMap(seed, campaign)`.
  Tokyo's bay + radial rivers + kaidō live behind `campaign !== "london"`; London gets a
  dedicated water pass — the **Thames** meanders west→east one row south of Westminster
  (centre stays dry on the north bank) and fans into a **sea estuary** across the eastern
  quarter, with tidal marsh on the downstream banks. Two **public parcels** reuse the
  holdout mechanic (owner `-2`, never sells): Westminster (Parliament) at centre and
  Buckingham Palace with its royal-park ring, three hexes west.
- `data/londonnames.js`: 31 district groups (~330 real names) anchored by hex offset from
  Westminster; `machiGroups`/`assignAreaNames` are campaign-aware — London pools are plain
  Latin strings, the centre reads "Westminster (Parliament)", and overflow uses genuine
  English prefixes (New/North/South/East/West/Upper/Lower/Great/Little/Old), each combo
  once. Result: **2500 unique, Latin-only, zero numbered fallbacks.**
- `js/config.js`: `CFG.ERAS_LONDON` (monarch reigns) + `eraDisplayName(st, year)` — a
  cosmetic lookup layered over the unchanged year-keyed `eraOf` (tech). Edward VIII's 1936
  is folded into the George V→VI hand-over. Wired into the top-bar clock, the stat tiles and
  the Build panel; the pop read-out and end-screen chrome go campaign-aware too.
- **Seismic off in London:** `majorQuakeAllowed` and the minor-quake branch early-return on
  `campaign === "london"`; the bulk + per-station seismic-retrofit UI hides; and the
  `taishin_rnd` R&D project is unresearchable (so it never lists). War is left enabled and
  keeps its existing probability-based timing (the "Blitz" can land any year, or never).
- **Unlock + entry:** finishing a Tokyo game at the end year sets a `localStorage` flag
  (`trt_london_unlocked`); the end screen shows a one-time unlock banner and a
  "New game — London 1872" button, and the start screen gains a "Start — London 1872"
  button once unlocked. `js/save.js` regenerates the correct map by passing `campaign` to
  `freshState` *before* the terrain is built (fixing a load-time Tokyo-map bug).
- `tools/smoke.js`: a Phase-11 block builds a London game and asserts campaign flag, the
  Westminster public centre, the Thames+estuary, 2500 unique Latin-only names with historic
  districts present, monarch-era display, quakes/seismic-R&D disabled, a clean ~50-year run
  with zero earthquakes and the player surviving, and a campaign+map save round-trip. All
  smoke + dom checks green.

## Resolved Decisions (interview follow-up, 2026-07-07)

All five planning open-questions are now settled:

1. **London seismic** — quakes and taishin **disabled** in London; war kept but
   probability-timed, not history-matched (folded into Phase 11 above).
2. **Class fund figures** — ¥1,300k / 850k / 520k / 300k **confirmed** (850k anchor
   fixed; remainder still fine-tunable in `tools/balance.js` without further sign-off).
3. **Reclamation pricing** — ≈¥45,000/hex, ≈700 days (Meiji, era-scaled) **accepted**
   as the Phase 2 starting point.
4. **Kaidō trunk** — **confirmed**: four routes with Nikkō + Ōshū sharing the northern
   trunk to Senju before splitting.
5. **Sound list** — **approved as written** (Phase 8); implement the full list, no trims.

No open questions remain — the plan is ready for implementation.
