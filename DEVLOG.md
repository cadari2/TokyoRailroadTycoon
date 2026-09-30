# DEVLOG

## 2026-09-29 — Visual overhaul (90s tycoon-sim look)
- Rebuilt the entire look — chrome and map — in the spirit of RollerCoaster Tycoon / Transport Tycoon / SimCity 2000; the simulation and panel logic are untouched.
- Chrome (`css/style.css`, `index.html`): parchment windows with chunky bevels, teal title bars, RCT-style icon toolbar, bottom bar with LED cash/date, paper news-ticker slip over the map, bevelled modals with close boxes, chunky scrollbars; bundled pixel fonts (`assets/fonts/`, OFL) so it works offline.
- `js/art.js` (new): 16×16 pixel icons authored as character grids → data-URL PNGs → `.ico-*` CSS; procedural title-screen box art (dusk skyline, campaign landmark, steam train).
- `js/ui.js`: icon tabs/buttons, build-mode toolbox grid, window title bars, LED stat tiles, land-overlay toolbar toggle, two-column title screen with class cards, medal on the end screen.
- `js/render.js`: dithered terrain + trees/coast foam, oblique 2.5D buildings, station buildings with platforms and canopies, engine sheds, car-by-car trains, screen-space station name plates, bevelled demand legend.
- Verified with Playwright screenshots (start, all tabs, modals, 1872/1935/1995, zoom levels, demand overlay, Japanese UI, 400-px mobile) and `tools/domsmoke.js` (the two per-hex-rights failures pre-exist on the baseline).
- Next: PNG asset slots still work and override the procedural art; a night-lights layer (lit windows after dusk) and per-campaign terrain palettes are natural follow-ups.

## 2026-09-29 — First-steps coach (onboarding)
- Added a "🚉 First steps" checklist card at the top of the side panel (`firstStepsCard` in js/ui.js). Five steps (lay track → 2 stations → line → train → first riders), each derived from live game state so it works after load. Current step is highlighted with where-to-click guidance; the card dismisses itself once complete or via ✕; respects the "Show tutorial/tip text" setting. Its footer nudges toward few well-placed stations (supports the sparse-network goal).
- Decided against a modal/scripted tutorial: state-derived checklist can't desync and doesn't block play.
- Next: highlight the relevant Build-mode button for the current step; a follow-up "grow" phase (second line, transfers, R&D); coach dismissal (`ui.coachDone`) is not saved across reloads; step text is English-only (no i18n yet). Map-density problem, hex close-up view, and per-map BGM audit remain untouched.
- Audio: not audited this run.
