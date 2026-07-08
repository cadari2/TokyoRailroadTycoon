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
 * BGM — one track per era (keys are the CFG.ERAS keys). Tracks loop and
 * crossfade into each other as the years roll from one era to the next.
 *
 * SFX — one clip per game event. Only the events that already exist in the
 * game and matter to the player are wired (see README §Audio for the list and
 * exactly which in-game moment fires each one). Slots without a file yet are
 * simply silent — add clips incrementally.
 * ========================================================================= */
window.AUDIO_MANIFEST = {
  bgm: {
    meiji:  "meiji.mp3",           // 1872–1911  Meiji
    taisho: "taisho.mp3",          // 1912–1925  Taisho
    showa1: "early_showa.mp3",     // 1926–1945  Early Showa
    showa2: "post_war_showa.mp3",  // 1946–1988  Late Showa
    heisei: "heisei.mp3",          // 1989–2018  Heisei
    reiwa:  "reiwa.mp3",           // 2019–2028  Reiwa
  },
  sfx: {
    // --- player build / purchase actions (only the PLAYER's own actions) ---
    buy_land:          "buy_land.mp3",          // buying a land parcel
    build_rail:        "build_rail.mp3",        // starting a track-hex build
    build_station:     "build_station.mp3",     // starting a station / depot build
    purchase_train:    "purchase_train.mp3",    // buying rolling stock
    line_created:      "line_created.mp3",       // opening a new line
    upgrade:           "upgrade.mp3",            // platform / commerce / seismic / electrify upgrade
    construction_done: "construction_done.mp3",  // your track construction completes
    research_done:     "research_done.mp3",      // an R&D project completes
    bridge_done:       "bridge_done.mp3",        // a track span across open water finishes
    reclaim_done:      "reclaim_done.mp3",        // a land-reclamation job finishes
    // --- disasters (fire for everyone; distinct clip per disaster type) ---
    disaster_quake:    "disaster_quake.mp3",     // an earthquake strikes
    disaster_fire:     "disaster_fire.mp3",      // a great fire
    disaster_typhoon:  "disaster_typhoon.mp3",   // a typhoon
    disaster_war:      "disaster_war.mp3",       // an air-raid year during a war
    // --- economy (your money changing hands) ---
    land_sold:         "land_sold.mp3",          // you sell a land parcel on the open market
    fare_changed:      "fare_changed.mp3",        // you change a line/default fare
    tax_levied:        "tax_levied.mp3",         // the year-end property-tax levy is charged
    kaido_rights:      "kaido_rights.mp3",       // you buy kaidō crossing rights
    buyout:            "buyout.mp3",             // you acquire a rival company
    award_good:        "award_good.mp3",         // you win a year-end recognition
    award_bad:         "award_bad.mp3",          // you earn a bad award ("worst employer")
    milestone:         "milestone.mp3",          // you reach a one-time milestone
    // --- finance / distress ---
    loan_drawn:        "loan_drawn.mp3",         // you draw a loan from the Kangyō Bank
    loan_repaid:       "loan_repaid.mp3",        // you repay bank debt
    arrears_warning:   "arrears_warning.mp3",    // taxes went unpaid — arrears carried
    sellout:           "sellout.mp3",            // your railway is sold out from under you
    windup:            "windup.mp3",             // a company is wound up (bankruptcy)
    // --- operations ---
    line_deleted:      "line_deleted.mp3",       // you delete a line
    train_scrapped:    "train_scrapped.mp3",     // you sell / scrap rolling stock
    strike_start:      "strike_start.mp3",       // your workers walk out
    strike_end:        "strike_end.mp3",         // a strike is settled
    company_enter:     "company_enter.mp3",      // a new rival railway enters the market
    // --- UI / framing ---
    invalid_action:    "invalid_action.mp3",     // a rejected action ("can't build here")
    start_screen:      "start_screen.mp3",       // the title screen appears
    start_screen_button:"start_screen_button.mp3",// a title-screen button is pressed
    game_start:        "game_start.mp3",         // a new game begins
    victory:           "victory.mp3",            // the final standings (game end)
    // Optional/reserved: per-stop train departures happen constantly, so they
    // are NOT auto-fired (they'd be a cacophony). Drop a file here and wire it
    // yourself if you want it.
    train_depart:      "train_depart.mp3",
  },
};
