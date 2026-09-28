# Dev Log

Running log for the autonomous improvement passes on Tokyo Railroad Tycoon.
Each entry: what changed, what was decided against and why, and what the
next pass should look at.

---

## 2026-09-28 — Guided onboarding walkthrough (v0.6.1)

**Why:** The single most-flagged problem with test audiences is that new
players don't know what to do first. The game already has a lot of
*local* guidance (per-mode status-bar hints, an `appendTip` contextual-tip
system, a "Show tutorial/tip text" checkbox), but nothing that walks a
brand-new player through the actual opening sequence: land is already
granted at founding, so the very first thing to do (lay track) isn't
obvious, and there was no explanation of the core feedback loop at all
before this pass.

**What I built:** A small, state-driven onboarding overlay (`js/ui.js`,
`TUTORIAL_STEPS` + `renderTutorial`/`startTutorial`/`endTutorial`), styled
as a floating card bottom-left over the map (`#tutorialBox` in
`index.html`/`css/style.css`) so it never blocks the panel or the canvas
click target it's pointing at:

1. Welcome + one-paragraph explanation of the core loop (manual "Got it").
2. Lay track — clears itself once `companyTrackHexes(st, player).length > 0`
   (i.e. once a hex's track actually finishes construction, not just when
   the job is queued).
3. Build a station — clears once the player has an `alive` station.
4. Create a line — clears once the player has an `alive` line.
5. Buy a train — clears once the player has an `alive`, non-`stored` train.
6. Wrap-up — explicitly states the reinvestment loop and warns against
   paving the whole map (ties back to the game's core mission), manual
   "Got it — finish".

Steps 2-5 are **not** a click-through slideshow: they poll the player's
actual state every frame (`renderTutorial` runs alongside `renderTopbar`
in the main loop) and auto-advance the instant the real action is done, in
whatever order the player does it, or skip ahead instantly on replay if
those steps are already satisfied. That avoids the classic tutorial-goes-
stale-if-you-explore-first problem.

Triggering: fires automatically on a fresh **Tokyo** campaign start (any
settings) the first time ever (localStorage `trt_tutorial_seen`), never on
a loaded/continued game, and never again once finished or skipped.
Replayable any time from **System → Settings** ("🎓 Replay getting-started
walkthrough") — useful for verifying it still works after future UI
changes, and for a player who skipped it early and wants it later.

**Tests:** Added 6 new steps to `tools/domsmoke.js` covering auto-start,
manual-step advancement, auto-advancement gated on construction actually
completing (not just being queued), reaching and finishing the last step
(and that finishing persists the seen-flag), and the System-panel replay
button. All pass. `tools/smoke.js` (headless sim, no DOM) is untouched and
unaffected since it never loads `js/ui.js`.

**Considered and decided against:**
- *Highlighting/pointing at specific DOM elements (e.g. drawing an arrow at
  the "Lay Track" button).* Would be more polished but meaningfully more
  code (positioning math that has to survive panel collapse/resize/mobile
  overlay) for a first pass. The status bar already prints a full
  instruction line for whatever mode is active, so the overlay's job is
  just to say *which* action comes next and *why*, not to point at pixels.
  Worth revisiting if playtesting shows people still miss the buttons.
- *Blocking modal instead of a floating card.* A modal would force
  attention but also fights with the actual thing being taught (you can't
  click a hex through a modal). The floating card stays out of the way.
- *Gating the trigger on "no track laid yet" instead of "never seen
  before".* Simpler, but would also fire for a player who loaded an old
  save or started a non-default game — the localStorage seen-flag is more
  precise about who's actually new.
- Did not touch the existing `appendTip`/`showTips` system — it's a
  different, complementary layer (always-on contextual one-liners) and
  conflating the two would have made this pass sprawl.

**Next steps for a future pass (in priority order per the standing brief):**
1. **User friendliness, continued:** the tutorial only covers the
   founding sequence (track → station → line → train). It says nothing
   about fares, the demand heatmap, land purchase/development for rental
   income, or reading the Finance panel once money starts flowing — those
   are all still discovered by trial and error. A natural follow-up is a
   *second*, much shorter walkthrough triggered the first time the
   player's cash crosses some multiple of starting cash (i.e. "now that
   you have money, here's what to do with it") rather than trying to
   cram everything into the founding walkthrough.
2. Two domsmoke failures pre-date this pass and are **not** something
   this pass touched (confirmed via `git stash` against HEAD before this
   commit): `v0.5.7 per-hex rights: drag along connected track...` and
   `...Make offer opens a negotiation dialog...` both fail with
   `mousedown on the rival's own track should start the selection` /
   a crash at `js/world.js:2917` (`st.hexes[key[0]].track.co` — looks
   like a hex whose track was expected to belong to a rival AI company
   doesn't, possibly an RNG-seed-dependent AI-placement issue in the test
   fixture rather than the trackage-rights feature itself). Worth a
   dedicated look — it's a real test failure, just pre-existing and out
   of scope for this pass's one-thing rule.
3. **Map density / sparse-network incentives** (the standing "most
   valuable thing you could crack" ask) is still unaddressed. Nothing in
   this pass touched it — flagging so the next pass doesn't lose the
   thread. Ideas worth exploring: an explicit land-value-capture bonus
   that scales *down* with nearby track density (so paving a hex next to
   three other rail hexes earns less than reaching a fresh district),
   or a maintenance-cost curve that punishes low-utilization redundant
   trackage harder than it currently does.
4. **Audio:** did not check for missing BGM/SFX or maps borrowing another
   map's track this pass — a future pass should audit
   `assets/audio/manifest.js` against `CFG.CAMPAIGNS` for gaps.
5. The close-up hex/station inspect view (art & presentation focus area)
   is still the flat top-down tile, just bigger — still open.
