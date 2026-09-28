# Dev Log

## 2026-09-28 — Fix per-hex trackage-rights crash (v0.5.9.3)

**What:** `assetReservation(st, asker, "hexRights", key)` in `js/world.js`
read `st.hexes[key[0]].track.co` with no guard. If the anchor hex's track
disappears while a "per-hex trackage rights" selection panel is still open
(a disaster damages/removes the track, the hex gets demolished, a corridor
gets conveyed, etc.), the next render throws a `TypeError` reading `.co` of
`null` — a crash reachable in real play, not just under test, since
`hexRightsSection` (`js/ui.js`) calls `assetReservation` on every render
while the selection is non-empty. Fixed two ways:
- `assetReservation`'s `hexRights` branch now returns `Infinity` (matching
  the existing "no deal possible" convention used for the unknown-kind
  fallback) when the anchor hex has no track, instead of dereferencing it.
- `hexRightsSection` now prunes `ui.hexRightsSel` down to hexes that still
  hold the target's track *before* using the selection for anything, so a
  stale selection self-heals instead of ever reaching the reservation call
  in a broken state. This is the actual root-cause fix; the `world.js`
  guard is defense in depth for any other caller.

Also fixed `tools/domsmoke.js`'s own bug that was masking half of this:
its per-hex-rights drag-select test fired a synthetic `mousedown` without
`button: 0`. Real browsers default a primary-button `MouseEvent` to
`button: 0`; the test stub's `fire()` does not synthesize missing fields,
so the app's `e.button === 0` guard in `initCanvasInput` (`js/ui.js`) never
matched and the selection never started — `domsmoke.js` reported this as
if it were a game bug ("mousedown on the rival's own track should start
the selection"). It wasn't: added `button: 0` to the fired event.

**Why this, now:** two independent runs earlier today (branches
`claude/practical-noether-374e8b` and `claude/practical-noether-l2s0y1`,
neither merged) hit this same crash while building unrelated onboarding
features, confirmed it reproduces on a clean pre-change tree, and flagged
it as a clear, well-scoped "fix this next" — real bug, cheap and
unambiguous fix, matches focus area #2 (simulation bugs and loose ends).
Picking it up directly rather than re-attempting onboarding work, see
"process note" below.

**Decided against:**
- Guarding every hex in the `key` loop against a missing track, not just
  `key[0]` — the loop only reads `h.terrain`, never `h.track`, so only the
  anchor lookup was unsafe.
- Trying to keep a broken chain alive by re-anchoring to the first still-
  valid hex instead of filtering — simpler to drop invalid hexes and let
  the player re-select; a rights deal over a now-discontiguous chain isn't
  a coherent offer anyway.

**Testing:** `node tools/domsmoke.js` — 32/32 steps pass (both previously
failing trackage-rights steps now pass). `node tools/smoke.js` (headless
core sim, no DOM/UI — doesn't load `js/ui.js` and doesn't exercise
`hexRights` at all, since the AI only ever negotiates `"hex"`-kind deals
per `js/ai.js:573`) run in parallel to confirm no regression in the core
economy loop.

**Process note (for whoever reads this next):** `DEVLOG.md` did not exist
on this branch's base (`claude/modest-bell-3vvl69` / the last commit
merged there, 2026-07-20) even though it has been created and written to
by at least 7 separate scheduled runs *today alone*, each on its own
`claude/practical-noether-*` branch that was pushed but never opened as a
PR or merged anywhere. Because nothing merges back, every run starts from
the same stale base, can't see `DEVLOG.md` or any prior run's work, and
several of today's runs independently reinvented the same "first-time
player onboarding checklist" feature (at least 4 separate implementations
today: 9l4dtc, 9b1qnf, rod0jb, 1s1bmg, 374e8b — by title alone). That's
hours of duplicated work that never reaches the actual game. Two things
would fix this going forward: (1) something (the maintainer, or a
follow-up automation) periodically merging the best of these branches back
into the real trunk so `DEVLOG.md` and the feature work persist across
runs, and (2) if the schedule is meant to run this often, each run
checking recent sibling branches (not just its own branch's history) for
today's date before picking a focus area, to avoid exactly this collision.
Flagging this explicitly rather than silently adding an 8th onboarding
attempt.

**Next iteration should look at:**
1. The onboarding/first-time-player work already exists in several
   unmerged forms today (see branches above) — before writing a ninth
   version, either merge/cherry-pick the best existing attempt or read one
   of those branches' `DEVLOG.md` for what it covers.
2. The map-density problem (CORE MISSION) is still completely untouched
   and remains the single highest-value open design question.
3. The hex close-up/inspect view (art/presentation focus area) is still
   just the top-down tile at higher zoom plus a text panel — no dedicated
   denser single-hex rendering exists yet.
4. Audio: `bgmKey()` in `js/config.js` only branches Tokyo vs. London; New
   York, Melbourne and Paris all fall through to Tokyo's era BGM table and
   have no tracks of their own — confirmed still true as of this pass,
   not yet fixed by anyone.
