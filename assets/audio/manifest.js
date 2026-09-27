/* =========================================================================
 * assets/audio/manifest.js — Audio manifest.
 *
 * Maps semantic game events to expected filenames. Drop a matching file into
 * assets/audio/bgm/ or assets/audio/sfx/ and it plays automatically; a slot
 * with no file present is silently muted (never an error). Edit the filenames
 * here if you name your files differently.
 *
 * WHY A .js FILE (not manifest.json): this game runs by opening index.html
 * directly (file://), and browsers refuse to fetch() a local .json under the
 * file:// origin. A <script> that assigns window.AUDIO_MANIFEST loads fine
 * either way, so the manifest is authored as data here.
 *
 * BGM — one track per era. The Tokyo campaign is keyed by CFG.ERAS (Japanese
 * eras); the London campaign is keyed by reigning monarch (CFG.BGM_LONDON),
 * with Elizabeth II's long reign split across two tracks and Charles III
 * (Carolean) borrowing the Reiwa track until it has its own. Tracks loop and
 * crossfade into each other as the years roll from one reign/era to the next.
 *
 * SFX — one clip per game event. Only the events that already exist in the
 * game and matter to the player are wired (see README §Audio for the list and
 * exactly which in-game moment fires each one). Slots without a file yet are
 * simply silent — add clips incrementally.
 * ========================================================================= */
window.AUDIO_MANIFEST = {
  bgm: {
    // --- Tokyo campaign: one track per Japanese era (CFG.ERAS keys) ---
    meiji:  "meiji.mp3",           // 1872–1911  Meiji
    taisho: "taisho.mp3",          // 1912–1925  Taisho
    showa1: "early_showa.mp3",     // 1926–1945  Early Showa
    showa2: "post_war_showa.mp3",  // 1946–1988  Late Showa
    heisei: "heisei.mp3",          // 1989–2018  Heisei
    reiwa:  "reiwa.mp3",           // 2019–2028  Reiwa
    // --- London campaign: one track per reigning monarch (CFG.BGM_LONDON) ---
    victoria:           "victoria.mp3",            // 1872–1900  Victoria
    edwardvii:          "edwardvii.mp3",           // 1901–1909  Edward VII
    georgev:            "georgev.mp3",             // 1910–1935  George V
    edwardviii:         "edwardviii.mp3",          // 1936       Edward VIII (abdication year)
    georgevi:           "georgevi.mp3",            // 1937–1951  George VI
    elizabethii_early:  "elizabethii_early.mp3",   // 1952–1986  Elizabeth II (first half)
    elizabethii_late:   "elizabethii_late.mp3",    // 1987–2021  Elizabeth II (second half)
    carolean:           "reiwa.mp3",               // 2022–2028  Charles III — borrows the Reiwa track for now
    // --- v0.6.1: New York / Melbourne / Paris (CFG.BGM_CAMPAIGN) ---
    // "chip:<song>" = a built-in chiptune composed live by js/chiptune.js
    // (placeholder until recorded tracks exist — point a slot at a file,
    // e.g. "nyc_gilded.mp3", and the recording takes over).
    nyc_gilded:       "chip:nyc_gilded",        // 1872–1918  Gilded Age / Progressive Era — "Bowery Rag"
    nyc_jazz:         "chip:nyc_jazz",          // 1919–1968  Jazz Age → mid-century — "Elevated Swing"
    nyc_modern:       "chip:nyc_modern",        // 1969–2028  Fiscal Crisis → Revival — "Uptown Express"
    melb_marvellous:  "chip:melb_marvellous",   // 1872–1900  Marvellous Melbourne / Land Bust
    melb_federation:  "chip:melb_federation",   // 1901–1945  Federation → Depression & War — waltz
    melb_modern:      "chip:melb_modern",       // 1946–2028  Postwar Sprawl → Modern Melbourne
    paris_belle:      "chip:paris_belle",       // 1872–1913  IIIe République / Belle Époque — valse musette
    paris_folles:     "chip:paris_folles",      // 1914–1944  Années Folles → Occupation — swing manouche
    paris_moderne:    "chip:paris_moderne",     // 1945–2028  Trente Glorieuses → Paris Moderne
  },
  sfx: {
    // --- player build / purchase actions (only the PLAYER's own actions) ---
    buy_land:          "buy_land.mp3",          // buying a land parcel
    build_rail:        "build_rail.mp3",        // starting a track-hex build
    build_station:     "build_station.mp3",     // starting a station / depot build
    purchase_train:    "purchase_train.mp3",    // buying rolling stock
    line_created:      "line_created.wav",       // opening a new line
    upgrade:           "upgrade.wav",            // platform / commerce / seismic / electrify upgrade
    construction_done: "construction_done.wav",  // your track construction completes
    research_done:     "research_done.wav",      // an R&D project completes
    bridge_done:       "bridge_done.wav",        // a track span across open water finishes
    reclaim_done:      "reclaim_done.wav",        // a land-reclamation job finishes
    // --- disasters (fire for everyone; distinct clip per disaster type) ---
    disaster_quake:    "disaster_quake.wav",     // an earthquake strikes
    disaster_fire:     "disaster_fire.wav",      // a great fire
    disaster_typhoon:  "disaster_typhoon.wav",   // a typhoon
    disaster_war:      "disaster_war.wav",       // an air-raid year during a war
    hex_destroyed:     "hex_destroyed.wav",      // a building is razed outright by disaster or war
    // --- economy (your money changing hands) ---
    land_sold:         "land_sold.wav",          // you sell a land parcel on the open market
    fare_changed:      "fare_changed.wav",        // you change a line/default fare
    tax_levied:        "tax_levied.wav",         // the year-end property-tax levy is charged
    kaido_rights:      "kaido_rights.wav",       // you buy kaidō crossing rights
    buyout:            "buyout.wav",             // you acquire a rival company
    award_good:        "award_good.wav",         // you win a year-end recognition
    award_bad:         "award_bad.wav",          // you earn a bad award ("worst employer")
    milestone:         "milestone.wav",          // you reach a one-time milestone
    // --- finance / distress ---
    loan_drawn:        "loan_drawn.wav",         // you draw a loan from the Kangyō Bank
    loan_repaid:       "loan_repaid.wav",        // you repay bank debt
    arrears_warning:   "arrears_warning.wav",    // taxes went unpaid — arrears carried
    sellout:           "sellout.wav",            // your railway is sold out from under you
    windup:            "windup.wav",             // a company is wound up (bankruptcy)
    // --- operations ---
    line_deleted:      "line_deleted.wav",       // you delete a line
    train_scrapped:    "train_scrapped.wav",     // you sell / scrap rolling stock
    strike_start:      "strike_start.wav",       // your workers walk out
    strike_end:        "strike_end.wav",         // a strike is settled
    company_enter:     "company_enter.wav",      // a new rival railway enters the market
    // --- UI / framing ---
    invalid_action:    "invalid_action.wav",     // a rejected action ("can't build here")
    start_screen:      "start_screen.wav",       // the title screen appears
    start_screen_button:"start_screen_button.wav",// a title-screen button is pressed
    game_start:        "game_start.wav",         // a new game begins
    victory:           "victory.wav",            // the final standings (game end)
    // Optional/reserved: per-stop train departures happen constantly, so they
    // are NOT auto-fired (they'd be a cacophony). Drop a file here and wire it
    // yourself if you want it.
    train_depart:      "train_depart.wav",
  },
};
