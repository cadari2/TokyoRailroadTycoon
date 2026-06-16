/* =========================================================================
 * hexnames.js — Optional per-hex name overrides.
 *
 * Every hex is automatically given a UNIQUE place name by assignAreaNames()
 * in map.js — the nearest district (laid out to echo modern Tokyo around the
 * Imperial Palace at the center hex) plus a cardinal sub-prefix and chōme, so
 * no two hexes share a name. This file is OPTIONAL: use it to rename
 * individual hexes, keyed by spiral index. Any entry here wins over the
 * automatic name; leave it empty to use the automatic names everywhere.
 *
 * Spiral index: the center hex is 0, then hexes are numbered outward in
 * CLOCKWISE rings — ring 1 = indices 1..6 (starting due east of center),
 * ring k starts at 3k(k-1)+1 and holds 6k hexes.
 * ========================================================================= */
"use strict";

window.HEX_NAMES = {
  // 0: "皇居 (Kokyo)",      // example: rename the center hex
  // 1275 is the center on the default 50×50 map; its spiral index is 0.
};
