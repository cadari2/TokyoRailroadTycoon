/* =========================================================================
 * hexnames.js — Hex name data.
 *
 * FORMAT: spiralIndex → display name.
 * Hexes are numbered from the CENTER hex (spiral index 0), then outward in
 * CLOCKWISE rings: ring 1 = indices 1..6 (starting due east of center),
 * ring 2 = 7..18, ring k starts at 3k(k-1)+1 and holds 6k hexes.
 *
 * Supply your Taisho-era block names here. A few samples are pre-filled as
 * placeholders. Any hex without an entry shows "#<spiralIndex>".
 * ========================================================================= */
"use strict";

window.HEX_NAMES = {
  0: "日本橋",
  1: "京橋",
  2: "銀座",
  3: "丸の内",
  4: "神田",
  5: "浅草橋",
  6: "深川",
  7: "上野",
  // ... add more: spiralIndex: "name"
};
