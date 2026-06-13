/* =========================================================================
 * hexnames.js — Optional per-hex name overrides.
 *
 * Every hex is automatically given an area name by hexAreaName() in map.js,
 * laid out to roughly match the geography of modern Tokyo around the
 * Imperial Palace (the center hex). This file is OPTIONAL: use it to rename
 * individual hexes, keyed by spiral index. Any entry here wins over the
 * automatic area name; leave it empty to use the automatic names everywhere.
 *
 * Spiral index: the center hex is 0, then hexes are numbered outward in
 * CLOCKWISE rings — ring 1 = indices 1..6 (starting due east of center),
 * ring k starts at 3k(k-1)+1 and holds 6k hexes.
 * ========================================================================= */
"use strict";

window.HEX_NAMES = {
  // 0: "皇居",      // example: rename the center hex
  // 1275 is the center on the default 50×50 map; its spiral index is 0.
};
