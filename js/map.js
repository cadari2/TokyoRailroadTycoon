/* =========================================================================
 * map.js — Hex grid math (odd-r offset + cube coords), procedural terrain
 * generation for fictionalized Greater Tokyo, spiral indexing for names.
 *
 * Coordinates: hexes are stored in a flat array indexed by row*MAP_W+col
 * using "odd-r" offset coordinates (pointy-top hexes, odd rows shifted
 * right). Cube coordinates are used for distance and ring/spiral walks.
 * ========================================================================= */
"use strict";

const HEX_DIRS_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];   // E NE NW W SW SE
const HEX_DIRS_ODD  = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

function hexIdx(col, row) { return row * CFG.MAP_W + col; }
function inMap(col, row) { return col >= 0 && col < CFG.MAP_W && row >= 0 && row < CFG.MAP_H; }

/** Neighbor index in direction d (0..5), or -1 if off-map. */
function hexNeighbor(col, row, d) {
  const dirs = (row & 1) ? HEX_DIRS_ODD : HEX_DIRS_EVEN;
  const c = col + dirs[d][0], r = row + dirs[d][1];
  return inMap(c, r) ? hexIdx(c, r) : -1;
}
function neighborsOf(idx) {
  const col = idx % CFG.MAP_W, row = (idx / CFG.MAP_W) | 0, out = [];
  for (let d = 0; d < 6; d++) { const n = hexNeighbor(col, row, d); if (n >= 0) out.push(n); }
  return out;
}

/** odd-r offset → cube coords. */
function offsetToCube(col, row) {
  const x = col - ((row - (row & 1)) >> 1);
  const z = row;
  return [x, -x - z, z];
}
function cubeToOffset(x, y, z) {
  const col = x + ((z - (z & 1)) >> 1);
  return [col, z];
}
function hexDist(a, b) {
  const [ax, ay, az] = offsetToCube(a % CFG.MAP_W, (a / CFG.MAP_W) | 0);
  const [bx, by, bz] = offsetToCube(b % CFG.MAP_W, (b / CFG.MAP_W) | 0);
  return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz)) / 2;
}
/** All in-map hex indices within radius r of idx (including itself). */
function hexesWithin(idx, r) {
  const col = idx % CFG.MAP_W, row = (idx / CFG.MAP_W) | 0;
  const [cx, , cz] = offsetToCube(col, row);
  const out = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = Math.max(-r, -dx - r); dz <= Math.min(r, -dx + r); dz++) {
      const [c, rr] = cubeToOffset(cx + dx, 0, cz + dz);
      if (inMap(c, rr)) out.push(hexIdx(c, rr));
    }
  }
  return out;
}

/* ---- Spiral indexing (for hex names) ------------------------------------
 * Index 0 = center. Ring k starts at 3k(k-1)+1, walks 6k hexes CLOCKWISE
 * starting due east of center. On a pointy-top map with +z downward, the
 * clockwise cube direction order starting East is:
 * E(1,-1,0) SE(0,-1,1) SW(-1,0,1) W(-1,1,0) NW(0,1,-1) NE(1,0,-1).
 */
const SPIRAL_DIRS = [[-1, 0, 1], [-1, 1, 0], [0, 1, -1], [1, 0, -1], [1, -1, 0], [0, -1, 1]];

function computeSpiralIndices() {
  const map = new Int32Array(CFG.MAP_W * CFG.MAP_H).fill(-1);
  const [ccx, , ccz] = offsetToCube(CFG.CENTER.col, CFG.CENTER.row);
  const ccy = -ccx - ccz;
  let spiral = 0;
  const place = (x, y, z) => {
    const [c, r] = cubeToOffset(x, y, z);
    if (inMap(c, r)) map[hexIdx(c, r)] = spiral;
    spiral++;
  };
  place(ccx, ccy, ccz);
  const maxRing = CFG.MAP_W + CFG.MAP_H; // covers all corners
  for (let k = 1; k <= maxRing; k++) {
    // start due east of center, k steps out
    let x = ccx + k, y = ccy - k, z = ccz;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        place(x, y, z);
        x += SPIRAL_DIRS[side][0]; y += SPIRAL_DIRS[side][1]; z += SPIRAL_DIRS[side][2];
      }
    }
  }
  return map;
}

/* ---- Map generation ------------------------------------------------------ */

/**
 * Generate the 50×50 hex map: terrain (clustered mountains in the west,
 * rivers flowing through valleys to the eastern bay side, swamp near river
 * mouths, moat ring near the center, canals in the old city), plus initial
 * constructions (dense urban core fading to rice fields).
 */
function generateMap(seed) {
  const noise = makeNoise(seed);
  const rng = makeRng(seed ^ 0x9e3779b9);
  const W = CFG.MAP_W, H = CFG.MAP_H;
  const hexes = new Array(W * H);
  const centerIdx = hexIdx(CFG.CENTER.col, CFG.CENTER.row);

  // 1) Elevation: noise + westward ridge bias (mountains cluster west/northwest)
  const elev = new Float32Array(W * H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const n = noise(c * 0.16, r * 0.16);
      const westBias = clamp((14 - c) / 14, 0, 1) * 0.45 + clamp((10 - r) / 10, 0, 1) * 0.2;
      elev[hexIdx(c, r)] = n * 0.8 + westBias;
    }
  }

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = hexIdx(c, r);
      const e = elev[i];
      let terrain = "grass";
      if (e > 0.92) terrain = "mountain";
      else if (e > 0.72) terrain = "hill";
      else if (e < 0.30 && c > W * 0.6 && noise(c * 0.3 + 7, r * 0.3) > 0.55) terrain = "swamp"; // eastern lowlands
      hexes[i] = {
        col: c, row: r, terrain, cons: null, dev: 0,
        owner: -1, value: 0, track: null, stations: [],
        spiral: -1, name: null, repair: 0,
      };
    }
  }

  // 2) Rivers: start at random mountain/hill hexes, walk downhill (lowest
  //    neighbor elevation) toward the east/south edge — rivers in valleys.
  const riverCount = 3 + rndInt(rng, 0, 1);
  for (let n = 0; n < riverCount; n++) {
    // pick a high source in the western half
    let best = -1, bestE = -1;
    for (let t = 0; t < 60; t++) {
      const c = rndInt(rng, 2, (W / 2) | 0), r = rndInt(rng, 2, H - 3);
      const i = hexIdx(c, r);
      if (elev[i] > bestE) { bestE = elev[i]; best = i; }
    }
    let cur = best, guard = 0;
    while (cur >= 0 && guard++ < 200) {
      const h = hexes[cur];
      if (h.terrain !== "mountain") h.terrain = "river";
      const nbs = neighborsOf(cur);
      // prefer the lowest neighbor with a slight eastward pull
      let next = -1, score = Infinity;
      for (const nb of nbs) {
        if (hexes[nb].terrain === "river") continue;
        const col = nb % W;
        const s = elev[nb] - col * 0.004 + rnd(rng) * 0.05;
        if (s < score) { score = s; next = nb; }
      }
      if (next < 0) break;
      const ncol = next % W, nrow = (next / W) | 0;
      cur = next;
      if (ncol >= W - 1 || nrow >= H - 1 || nrow <= 0) { hexes[cur].terrain = "river"; break; }
    }
  }

  // 3) Moat: partial ring at radius 2 around the center (castle moat).
  for (const i of hexesWithin(centerIdx, 2)) {
    if (hexDist(i, centerIdx) === 2 && rnd(rng) < 0.7 && hexes[i].terrain === "grass") {
      hexes[i].terrain = "moat";
    }
  }
  // 4) Canals: short segments near center, east side (old merchant city).
  for (let n = 0; n < 5; n++) {
    let i = hexIdx(CFG.CENTER.col + rndInt(rng, 1, 8), CFG.CENTER.row + rndInt(rng, -6, 6));
    for (let s = 0; s < rndInt(rng, 2, 5); s++) {
      if (hexes[i] && hexes[i].terrain === "grass") hexes[i].terrain = "canal";
      const nb = neighborsOf(i); if (!nb.length) break;
      i = rndPick(rng, nb);
    }
  }

  // 5) Initial constructions: dense core, satellite towns, rice in plains.
  const towns = [centerIdx];
  for (let n = 0; n < 7; n++) {
    const ang = rnd(rng) * Math.PI * 2, d = rndInt(rng, 8, 19);
    const c = clamp(Math.round(CFG.CENTER.col + Math.cos(ang) * d), 2, W - 3);
    const r = clamp(Math.round(CFG.CENTER.row + Math.sin(ang) * d * 0.9), 2, H - 3);
    towns.push(hexIdx(c, r));
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = hexIdx(c, r), h = hexes[i];
      if (h.terrain !== "grass" && h.terrain !== "hill") continue;
      let urban = 0;
      for (let t = 0; t < towns.length; t++) {
        const d = hexDist(i, towns[t]);
        const w = t === 0 ? 7.5 : 3.8;          // center town much bigger
        urban = Math.max(urban, Math.exp(-d / w));
      }
      const roll = rnd(rng);
      if (urban > 0.45 && roll < urban * 1.25) {
        h.cons = roll < 0.16 ? "shop" : roll < 0.22 ? "school" : roll < 0.26 ? "civic" : "house";
        h.dev = urban > 0.85 ? 3 : urban > 0.6 ? 2 : 1;
      } else if (urban > 0.25 && roll < urban * 1.1) {
        h.cons = roll < 0.12 ? "shop" : "house"; h.dev = 1;
      } else if (h.terrain === "grass" && roll < 0.55) {
        h.cons = "rice"; h.dev = 1;
      }
    }
  }
  // A few roads radiating from the center (old highways)
  for (let d = 0; d < 5; d++) {
    let i = centerIdx;
    for (let s = 0; s < rndInt(rng, 12, 22); s++) {
      const nb = hexNeighbor(i % W, (i / W) | 0, d < 5 ? d : rndInt(rng, 0, 5));
      if (nb < 0) break;
      i = nb;
      if (hexes[i].terrain === "grass" && !hexes[i].cons) { hexes[i].cons = "road"; hexes[i].dev = 1; }
    }
  }

  // 6) Spiral indices + names
  const spiral = computeSpiralIndices();
  for (let i = 0; i < hexes.length; i++) {
    hexes[i].spiral = spiral[i];
    const NAMES = (typeof window !== "undefined" && window.HEX_NAMES) || {};
    hexes[i].name = NAMES[spiral[i]] || null;
  }
  return hexes;
}

/** Population a hex contributes (residents). */
function hexPop(h) {
  if (!h.cons || h.track) return 0;            // rail hexes generate nothing themselves
  return (CFG.CONS[h.cons].pop || 0) * Math.max(1, h.dev);
}
/** Attraction (jobs/shops/schools) a hex contributes. */
function hexAtt(h) {
  if (!h.cons || h.track) return 0;
  return (CFG.CONS[h.cons].att || 0) * Math.max(1, h.dev);
}
