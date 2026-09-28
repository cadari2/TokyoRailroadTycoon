# DEVLOG

Running log of autonomous iteration passes on Tokyo Railroad Tycoon. Each
entry: what changed and why, what was considered and rejected, and what the
next pass should look at. Read this before starting new work — don't repeat
or contradict a recent decision without a clear reason.

Core mission (repeated here so every entry is judged against it): good
public transportation drives demand, demand drives population and money,
that growth funds more well-connected transport. Nothing should dilute that
loop. Standing problem: paving every hex in rail is the "efficient" play
and it kills both the realism and the fun — sparse, deliberate networks
should be the rewarding style.

---

## 2026-09-28 — First-game onboarding walkthrough

**What:** Added `js/tutorial.js`, a short, state-driven checklist for
brand-new players: lay track → build a station → build a second station →
create a line → buy a train → check Finance. It renders as a small
non-blocking box (bottom-left, under the map, never covers the panel or
blocks clicks) and:

- Advances on its own the instant the underlying game state proves the
  step is done (`companyTrackKm > 0`, two line-stop stations exist, a line
  exists, a train exists, etc.) — checked once a frame from the main loop
  — rather than requiring a "Next" click through prose. Only the opening
  and closing beats, and the "watch the money" beat after the train is
  running, need an explicit click, since there's nothing in game state to
  detect for those.
- Jumps the UI to the relevant tab/mode when a step begins (and reopens the
  side panel if the player — or the mobile default — had collapsed it), so
  the instruction is never pointing at something off-screen.
- Pulses the Build-mode button / tab the current step wants (CSS
  `.tut-pulse`, a soft glow — same visual language a highlight would use
  elsewhere, no new UI idiom).
- Only triggers automatically the first time a player starts a genuinely
  new game (`localStorage.trt_tutorial_done` unset); can be skipped anytime,
  and is replayable from System → Settings ("▶ Replay first-game
  walkthrough") regardless of that flag.
- Ends itself (without marking "seen") if the player loads or imports a
  different save mid-walkthrough, so it doesn't flash through steps against
  state it wasn't written for.

**Why this, now:** the brief named user friendliness — specifically "test
audiences don't know what to do" — as the most-flagged problem, ahead of
everything else. The game already had a one-line status-bar welcome message
and a `showTips` flag that just gates inline panel prose; there was no
actual guided path from "empty map" to "a train is running and earning
fares." This is the single most load-bearing gap for a new player, and it's
also the on-ramp to the core loop itself (service → riders → cash → more
service), so teaching it well is teaching the game's whole thesis, not a
side quest.

**Why this design, specifically:** RCT/OpenTTD-style tutorials that just
narrate over a demo don't transfer — the player watches, doesn't do. Tying
each step to real state means the walkthrough is honest: it only advances
when the player actually performed the action anywhere in the real UI
(there's no separate "tutorial mode" input path to fall out of sync with
the real game). It also means it can't get stuck: if state satisfies a
later step out of order (e.g. a very fast player builds both stations
before the box catches up), the frame tick just walks forward until it's
caught up.

**Considered and rejected:**
- *A blocking modal wizard* (click Next through N cards before you can
  touch the map) — the classic tutorial-as-cutscene. Rejected: it teaches
  nothing about the actual interaction model and trains players to
  click-through without reading, exactly what OpenTTD veterans complain
  about in other city-builders.
- *Restricting input to only the "correct" next action* (disable every
  other button until the step is done) — more guided, but it fights the
  game's actual openness (you can lay track, then go check Finance, then
  come back) and would need special-casing in a lot of already-large
  `ui.js`. The pulse + auto-advance gets most of the benefit without
  constraining play.
- *A localized (EN/JA) walkthrough via `data/i18n.js`* — the i18n table's
  documented scope is "persistent chrome," and deep panel prose is already
  English-only by design; the walkthrough text follows that existing
  precedent rather than expanding i18n scope as a side effect of an
  onboarding pass. Worth revisiting once the i18n table's scope is
  deliberately widened.
- *Teaching sparse-network play in the tutorial itself* (the map-density
  problem in the brief) — tempting, since onboarding is exactly where a
  habit gets set, but a first walkthrough already has five real actions to
  land; qualitative "don't overbuild" advice is folded into the last
  step's copy instead of a mechanical seventh step. The bigger, mechanical
  version of that idea (make sparse networks actually score/feel better,
  not just get told to build fewer hexes) is still the open problem below.

**Verification:** `node tools/smoke.js` (headless sim, doesn't touch
`tutorial.js`) and `node tools/domsmoke.js` (full DOM boot incl.
`tutorial.js`, clicks through the real build/station/line/train/save flow)
both pass end to end with no new failures.

**Next steps for a future pass:**
1. **Map density is still the big open problem.** This pass explicitly
   scoped it out. The walkthrough can *tell* a new player not to pave every
   hex, but nothing in the simulation currently makes a sparse, deliberate
   network more rewarding than a dense one beyond "it costs less to build."
   Ideas worth prototyping: a land-value/desirability penalty for
   over-provided corridors (diminishing marginal ridership per parallel
   hex of track already near capacity), or a scoring/achievement axis that
   rewards revenue-per-track-km rather than raw network size. This is
   still the single most valuable unsolved design problem per the brief.
2. The tutorial's `done` checks assume a single-player-company happy path;
   if a future pass adds co-op or spectator modes, `player(st)` may need a
   guard.
3. No audio cue on step completion (deliberately — the underlying action
   already plays its own SFX, e.g. `line_created`, and stacking a second
   cue felt like noise). If playtesting says step transitions are too
   quiet to notice, `queueSfx(st, "award")` is sitting right there unused
   for this.
4. Audio flag carried over from before this pass (not investigated this
   round): confirm no campaign is still silently borrowing another
   campaign's BGM track beyond the documented Charles III → Reiwa
   placeholder in `assets/audio/manifest.js`.
