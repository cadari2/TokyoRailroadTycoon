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

### Phase 1 — Data model & schema (foundation for everything)
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

### Phase 2 — Water map overhaul (task 8)
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

### Phase 3 — Kaidō → highway (task 9)
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

### Phase 4 — Loans & bankruptcy (tasks 11 + 2 coupling)
- Kangyō-Bank credit line: borrow/repay any amount within `creditLimit`
  (assets × class factor); interest accrues monthly in `dailyTick`; class sets rate.
- Tax delinquency: unpaid year-end obligations accumulate as arrears; at 3 consecutive
  delinquent years a compulsory loan is forced; if the credit line cannot cover it →
  **sell-out: game over in failure** (dedicated end screen, distinct from victory).
- AI parity: AI companies use the same credit line (replaces the "negative cash until
  −2× START_CASH" rope); wind-up rules re-expressed in loan terms.
- Finance panel: debt/rate/limit/arrears block + warning banner (Mockup D).
- Smoke: borrowing cap enforced, interest math, 3-year spiral ends the game.

### Phase 5 — Demand accuracy (task 10)
- Make the alternative mode explicit: per-era alternative set (walk/rickshaw →
  bicycle/bus → car) generating the competing generalized cost; monopoly fares are
  naturally capped because riders defect to the alternative, not to nothing.
- Highway corridors locally cheapen the car alternative (late game pressure on
  parallel rail).
- Re-verify the core loop: stations + good connections → residential/commercial growth
  → region population; ensure population growth is driven by accessibility.
- Re-tune with `tools/balance.js`; document target curves in comments.

### Phase 6 — Bug fixes (task 3)
- **Fares**: delete the annual re-indexing in `main.js` (lines ~134–145); add a
  below-comfort warning chip in the Lines panel + one-click "raise to comfortable".
- **Construction skip**: make the skip crew-aware — simulate crew allocation forward to
  find the true sim-day count to the next completion (replacing the estimate), and
  label crew-starved jobs "waiting for crew" in the queue so remaining-day figures
  read honestly.
- General sweep: run `tools/smoke.js` + `domsmoke.js`, fix anything found; audit
  save/load round-trip of all new fields.

### Phase 7 — Unique hex names (task 4)
- Extend `data/machinames.js` with pre-WWII names to cover all ~2,500 hexes: more inner
  pools + new peripheral ward/gun groups (post towns, Edo-period villages, pre-merger
  ōaza). Directional/新 prefixes at most once each per larger region, last resort only.
- Replace the periphery fallback (`hexAreaName`) with pool-based assignment +
  uniqueness assertion; smoke test: **no duplicate names on any seed**.

### Phase 8 — Sound hooks (task 5)
Wire `queueSfx` at currently-silent moments; add manifest slots (user provides assets
after review). **List approved** — implement all of the below:
- UI: invalid action ("can't build here"), start-screen, start-screen button.
- Economy: land sold, fare changed, year-end tax levied, good award won, bad award ("worst employer"), milestone.
- Ops: line deleted, train scrapped/stored, strike start, strike end.
- Mechanics: loan drawn, loan repaid, tax-arrears warning, bankruptcy/sell-out, reclamation complete, bridge complete, kaidō rights purchased, buyout completed, new company enters the game, buy out a company.

### Phase 9 — Japanese interface (task 6)
- String table `data/i18n.js` (`t(key)`), languages `en`/`ja`; toggle on start screen +
  System panel; persisted in localStorage. Hex names stay bilingual in both languages.
- Mechanical: sweep `ui.js`/`render.js`/start screen for literals. Done after Phase 10's
  tab merge would be ideal, but the merge is smaller — do i18n after UI tidy if
  convenient; they touch the same lines.

### Phase 10 — UI tidy (task 7, Option 3)
- Merge tabs: Build · Lines · Money (Finance+Property) · Company (R&D+Workforce+Companies) · System (Log folded in as a sub-tab or drawer).
- Summary-first: 4 stat tiles atop each panel; long explanations move to tooltips;
  collapsible sections for secondary content. Target ~60% less visible text.

### Phase 11 — London campaign (task 12)
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
