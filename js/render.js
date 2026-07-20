/* =========================================================================
 * render.js — Canvas rendering: cached terrain+infrastructure layer,
 * dynamic stations/trains/overlays, day/night tint with rush-hour glow,
 * era-tinted palettes, and the asset loading system (PNG sprites with
 * procedural placeholders until art is supplied).
 * ========================================================================= */
"use strict";

const SQRT3 = Math.sqrt(3);
const HEX_SIZE = 14;                       // px at zoom 1 (pointy-top)
const HEX_W = SQRT3 * HEX_SIZE;
const HEX_H = 1.5 * HEX_SIZE;

/* ---- Asset system ----------------------------------------------------------
 * PLACEHOLDERS ACTIVE. Drop PNGs in assets/ named per ASSET_MANIFEST and they
 * are used automatically. Sizes: hex tiles 48×42, constructions 32×32,
 * stations 32×32, trains 24×12, icons 16×16. Layers: terrain → construction
 * → track → station → train.
 */
const ASSET_MANIFEST = (() => {
  const keys = [];
  for (const t in CFG.TERRAIN) for (const e of CFG.ERAS) keys.push("tile_" + t + "_" + e.key);
  for (const c in CFG.CONS) for (const e of CFG.ERAS) keys.push("cons_" + c + "_" + e.key);
  for (let l = 1; l <= 3; l++) keys.push("station_l" + l);
  for (const l of ["imperial_palace", "parliament", "castle", "london_bridge", "tower_bridge"]) keys.push("landmark_" + l);
  for (let l = 1; l <= 5; l++) keys.push("commerce_l" + l);
  for (const t in CFG.TRAINS) keys.push("train_" + t);
  return keys;
})();
const Assets = { img: {}, tried: {} };
function assetGet(key) {
  if (Assets.img[key]) return Assets.img[key].complete ? Assets.img[key] : null;
  if (Assets.tried[key]) return null;
  Assets.tried[key] = true;
  const im = new Image();
  im.onload = () => { Assets.img[key] = im; if (window.Game) Game.st.renderDirty = true; };
  im.onerror = () => {};
  im.src = "assets/" + key + ".png";
  return null;
}

/* Era visual tints applied over terrain colors — the period's colour mood.
 * Warm sepia Meiji cooling through neutral Shōwa grays to blue-white Reiwa;
 * drawn at ERA_TINT_ALPHA so the shift is visible at a glance, not homeopathic. */
const ERA_TINT = {
  meiji: "#d8c49a", taisho: "#d8cdb0", showa1: "#cccccc",
  showa2: "#d9d9e2", heisei: "#dde4ea", reiwa: "#e2eaf2",
};
const ERA_TINT_ALPHA = "2c";   // ≈17% — strong enough that eras read apart

/* Era-specific building palette for the placeholder art: the same bold
 * silhouettes re-dressed per period, so the CITY itself ages — dark wooden
 * Meiji roofs, warm Taishō/Shōwa tile and terracotta, cool Heisei/Reiwa slate
 * and glass. [body, accent] overrides per construction type; types not listed
 * keep their CFG.CONS colors. */
const ERA_CONS = {
  meiji:  { house: ["#e3d3b4", "#6d4a30"], apartment: ["#cec4b2", "#6b5236"], shop: ["#e3cf9a", "#8a4030"] },
  taisho: { house: ["#e6d8c0", "#8a4438"], apartment: ["#c8bfb2", "#56606e"], shop: ["#e9d59c", "#a83b30"] },
  showa1: { house: ["#e8dcc6", "#a8503a"], apartment: ["#bcc3c9", "#44586e"], shop: ["#ecd9a0", "#c0392b"] },
  showa2: { house: ["#ece0c8", "#b55c31"], apartment: ["#b3c1cf", "#3f5f96"], shop: ["#f0dc9e", "#d04a28"] },
  heisei: { house: ["#e9e4d6", "#64748a"], apartment: ["#aebccb", "#3f5f96"], shop: ["#efe2b0", "#c04a68"] },
  reiwa:  { house: ["#eceadf", "#4a5f78"], apartment: ["#a9c0d6", "#2f5a8f"], shop: ["#f2e6bc", "#b04a8a"] },
};
/** Body/accent colors for a construction type in a given era. */
function consColors(cons, type, era) {
  const o = (ERA_CONS[era] || {})[type];
  return o ? { color: o[0], accent: o[1] } : { color: cons.color, accent: cons.accent };
}

function hexCenter(col, row) {
  return { x: HEX_W * (col + 0.5 * (row & 1)) + HEX_W / 2, y: HEX_H * row + HEX_SIZE };
}
function hexCenterIdx(idx) { return hexCenter(idx % CFG.MAP_W, (idx / CFG.MAP_W) | 0); }

/** Demand heatmap colour ramp: cool (low) → warm (high). t in [0,1] → [r,g,b]. */
const DEMAND_STOPS = [
  [0.00, [46, 86, 172]], [0.25, [42, 158, 176]], [0.50, [82, 178, 84]],
  [0.75, [228, 198, 64]], [1.00, [216, 72, 52]],
];
function demandColor(t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let k = 1; k < DEMAND_STOPS.length; k++) {
    if (t <= DEMAND_STOPS[k][0]) {
      const a = DEMAND_STOPS[k - 1], b = DEMAND_STOPS[k];
      const f = (t - a[0]) / (b[0] - a[0]);
      return [Math.round(a[1][0] + f * (b[1][0] - a[1][0])),
              Math.round(a[1][1] + f * (b[1][1] - a[1][1])),
              Math.round(a[1][2] + f * (b[1][2] - a[1][2]))];
    }
  }
  return DEMAND_STOPS[DEMAND_STOPS.length - 1][1];
}

/** Draw the commerce ("ekinaka") badge for a station: a distinct glyph per
 *  developed style (vending dot → kiosk awning → retail storefront → mall block
 *  → station-city towers), tinted by COMMERCE.glyphColor. `building` dims it to
 *  show works are still under way. Nothing drawn for level 0. */
function drawCommerceGlyph(ctx, p, sz, level, building) {
  if (!level) return;
  const r0 = sz * 0.5;
  const img = assetGet("commerce_l" + level);
  if (img) {
    ctx.save();
    ctx.globalAlpha = building ? 0.45 : 1;
    const g = 8;
    ctx.drawImage(img, p.x + r0 - 2, p.y - r0 - g + 2, g, g);
    ctx.restore();
    return;
  }
  const col = (CFG.COMMERCE.glyphColor || [])[level] || "#ffffff";
  ctx.save();
  ctx.globalAlpha = building ? 0.45 : 1;
  ctx.fillStyle = col;
  ctx.strokeStyle = "#1c1c1c";
  ctx.lineWidth = 0.6;
  const r = sz * 0.5, x = p.x + r + 1.5, y = p.y - r - 1.5;   // top-right corner of the station
  if (level === 1) {                       // vending: a small coin dot
    ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); ctx.stroke();
  } else if (level === 2) {                // shops: a striped awning
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 1.5); ctx.lineTo(x + 3, y + 1.5);
    ctx.lineTo(x + 2, y - 1.5); ctx.lineTo(x - 2, y - 1.5); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (level === 3) {                // retail concourse: storefront + sign
    ctx.fillRect(x - 3, y - 2.5, 6, 5); ctx.strokeRect(x - 3, y - 2.5, 6, 5);
    ctx.fillStyle = "#fff"; ctx.fillRect(x - 2, y - 1.5, 1.6, 1.6); ctx.fillRect(x + 0.4, y - 1.5, 1.6, 1.6);
  } else if (level === 4) {                // shopping mall: a broad block beside the station
    ctx.fillRect(x - 3.5, y - 3.5, 7, 7); ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
    ctx.fillStyle = "#fff";
    for (let wy = -2; wy <= 1.5; wy += 1.8) for (let wx = -2.4; wx <= 1.2; wx += 1.8) ctx.fillRect(x + wx, y + wy, 1, 1);
  } else {                                 // integrated station city: twin towers
    ctx.fillRect(x - 4, y - 1, 3, 5); ctx.strokeRect(x - 4, y - 1, 3, 5);
    ctx.fillRect(x, y - 4.5, 3.2, 8.5); ctx.strokeRect(x, y - 4.5, 3.2, 8.5);
    ctx.fillStyle = "#fff";
    for (let wy = -3.5; wy <= 2.5; wy += 1.6) ctx.fillRect(x + 1, y + wy, 1.2, 0.9);
  }
  ctx.restore();
}

/** Deterministic per-hex hash in [0,1) — used for stable texture variance (no Math.random, so the cached base layer never flickers). */
function hexHash(col, row) {
  let h = (col * 374761393 + row * 668265263 + 0x9e3779b9) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 10000) / 10000;
}
/** Second-stage hash for placing several sub-elements within one hex from a single seed. */
function hexHash2(seed, i) {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
/** Lighten (percent > 0) or darken (percent < 0) a "#rrggbb" color string. */
function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = clamp(((num >> 16) & 0xff) + amt, 0, 255);
  const g = clamp(((num >> 8) & 0xff) + amt, 0, 255);
  const b = clamp((num & 0xff) + amt, 0, 255);
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

/** Clip the canvas to a hexagon centered at (x,y) — keeps texture overlays from bleeding into neighbors. */
function clipHexAt(c, x, y, scale) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    const px = x + HEX_SIZE * (scale || 1) * Math.cos(a);
    const py = y + HEX_SIZE * (scale || 1) * Math.sin(a);
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
  c.clip();
}

/* Redesigned art (v0.5) — the goal is IDENTIFIABILITY WHEN ZOOMED OUT:
 * terrain textures and building icons now fill far more of the hex, with
 * bolder marks and a dark ink outline so silhouettes read at a glance and
 * types separate by shape as well as colour. Era mood is preserved by the
 * ERA_TINT overlay, and buildings evolve a little across the eras (taller
 * towers, brighter shop signage) so Meiji still reads apart from Reiwa. */
const CONS_INK = "#241b12";                 // dark outline that makes a silhouette pop
const ERA_ORDER = ["meiji", "taisho", "showa1", "showa2", "heisei", "reiwa"];
function eraIndex(era) { const i = ERA_ORDER.indexOf(era); return i < 0 ? 0 : i; }

/** Terrain-specific texture overlay, bold enough to read the terrain type at a
 *  zoomed-out glance. Clipped to the hex so it never bleeds into neighbours. */
function drawTerrainPattern(c, terrain, x, y, accent, seed) {
  c.save();
  clipHexAt(c, x, y, 1);
  c.strokeStyle = accent; c.fillStyle = accent;
  switch (terrain) {
    case "grass": // scattered grass tufts — kept light (grass is the default backdrop)
      c.globalAlpha = 0.55;
      for (let i = 0; i < 5; i++) {
        const bx = x + (hexHash2(seed, i) - 0.5) * HEX_W * 0.8;
        const by = y + (hexHash2(seed, i + 10) - 0.5) * HEX_H * 0.7;
        c.fillRect(bx - 1.8, by, 1.5, 2.2);
        c.fillRect(bx, by - 1.8, 1.5, 3.8);
        c.fillRect(bx + 1.8, by, 1.5, 2.2);
      }
      break;
    case "hill": { // bold stacked contour humps (reads as rolling high ground)
      c.globalAlpha = 0.5;
      for (const [dy, w] of [[6, 11], [1, 8], [-4, 5]]) {
        c.beginPath();
        c.moveTo(x - w, y + dy);
        c.quadraticCurveTo(x, y + dy - w * 0.9, x + w, y + dy);
        c.closePath(); c.fill();
      }
      break;
    }
    case "mountain": { // big dark massif with a bold snow cap and a hard outline
      c.globalAlpha = 0.92;
      c.beginPath();
      c.moveTo(x - 12, y + 11); c.lineTo(x - 4, y - 6); c.lineTo(x + 1, y + 2);
      c.lineTo(x + 7, y - 11); c.lineTo(x + 12, y + 11);
      c.closePath(); c.fill();
      c.strokeStyle = CONS_INK; c.lineWidth = 1; c.globalAlpha = 0.5; c.stroke();
      c.fillStyle = "#f4f8ff"; c.globalAlpha = 0.98;   // snow caps
      c.beginPath(); c.moveTo(x - 4, y - 6); c.lineTo(x - 6.5, y - 1); c.lineTo(x - 1.5, y - 1); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x + 7, y - 11); c.lineTo(x + 4, y - 5); c.lineTo(x + 10, y - 5); c.closePath(); c.fill();
      break;
    }
    case "swamp": { // murky mottled pools + tall reed clumps
      c.globalAlpha = 0.45;
      for (const [dx, dy, r] of [[-5, -3, 4], [4, 2, 5], [-3, 5, 3]]) {
        c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill();
      }
      c.globalAlpha = 0.85; c.lineWidth = 1.1; c.strokeStyle = accent;
      for (const [dx, dy] of [[-7, 1], [-5, 2], [6, -1], [8, 0]]) {
        c.beginPath(); c.moveTo(x + dx, y + dy + 4); c.lineTo(x + dx, y + dy - 5); c.stroke();
      }
      break;
    }
    case "river": { // strong horizontal current bands (unmistakably water)
      c.globalAlpha = 0.7; c.lineWidth = 2; c.lineCap = "round";
      for (const dy of [-6, -1, 4]) {
        c.beginPath();
        c.moveTo(x - 11, y + dy);
        c.bezierCurveTo(x - 4, y + dy - 2.5, x + 4, y + dy + 2.5, x + 11, y + dy);
        c.stroke();
      }
      break;
    }
    case "moat": { // bold stone revetment ring around open water
      c.globalAlpha = 0.75;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        const bx = x + HEX_SIZE * 0.8 * Math.cos(a), by = y + HEX_SIZE * 0.8 * Math.sin(a);
        c.fillRect(bx - 2.4, by - 2, 4.8, 4);
      }
      break;
    }
    case "sea": { // deep open water: long rolling wave crests + a dark depth wash
      c.globalAlpha = 0.30; c.fillStyle = "#1c4166";       // depth tint under the crests
      c.fillRect(x - HEX_W, y - HEX_H, HEX_W * 2, HEX_H * 2);
      c.globalAlpha = 0.8; c.lineWidth = 1.8; c.lineCap = "round"; c.strokeStyle = accent;
      for (const dy of [-7, -1, 5]) {
        const ph = (hexHash2(seed, dy) - 0.5) * 6;         // per-hex phase so the sea shimmers
        c.beginPath();
        c.moveTo(x - 12 + ph, y + dy);
        c.bezierCurveTo(x - 5 + ph, y + dy - 3, x + 2 + ph, y + dy + 3, x + 9 + ph, y + dy);
        c.stroke();
        // whitecap tick at the crest
        c.globalAlpha = 0.5; c.strokeStyle = "#eaf4fc";
        c.beginPath(); c.moveTo(x - 2 + ph, y + dy - 1.5); c.lineTo(x + 2 + ph, y + dy - 1.5); c.stroke();
        c.globalAlpha = 0.8; c.strokeStyle = accent;
      }
      break;
    }
    case "lake": { // still water: concentric ripple rings, calmer than the sea
      c.globalAlpha = 0.7; c.lineWidth = 1.4; c.strokeStyle = accent;
      const lx = x + (hexHash2(seed, 3) - 0.5) * 6, ly = y + (hexHash2(seed, 7) - 0.5) * 5;
      for (const r of [3, 6.5, 10]) {
        c.beginPath(); c.arc(lx, ly, r, 0, 7); c.stroke();
      }
      c.globalAlpha = 0.45;
      c.beginPath(); c.arc(lx, ly, 1.6, 0, 7); c.fill();
      break;
    }
    case "canal": { // straight masonry channel with flow ticks
      c.globalAlpha = 0.7; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - 11, y - 5); c.lineTo(x + 11, y - 5); c.stroke();
      c.beginPath(); c.moveTo(x - 11, y + 5); c.lineTo(x + 11, y + 5); c.stroke();
      c.globalAlpha = 0.5;
      for (let t = -8; t <= 8; t += 3.5) c.fillRect(x + t - 1, y - 3.5, 2, 7);
      break;
    }
  }
  c.restore();
}

/** Trace + fill a rectangle, then stroke it in ink — the building-silhouette idiom. */
function inkRect(c, x, y, w, h, fill) {
  c.fillStyle = fill; c.fillRect(x, y, w, h);
  c.strokeStyle = CONS_INK; c.lineWidth = 1.2; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** Procedural construction icon — bold, hex-filling silhouettes so building
 *  TYPE is legible when zoomed out. dev (1..5) scales size a touch; era nudges
 *  the silhouette so the periods still read apart. `campaign` re-dresses a few
 *  types per city (London's farms are wheat, not rice paddies). */
function drawConsGlyph(c, h, x, y, era, campaign) {
  const cim = assetGet("cons_" + h.cons + "_" + era);
  if (cim) { c.drawImage(cim, x - 11, y - 11, 22, 22); return; }
  const cons = CFG.CONS[h.cons];
  const pal = consColors(cons, h.cons, era);   // era-dressed body/accent (ERA_CONS)
  const dev = Math.max(1, Math.min(5, h.dev || 1));
  const g = 0.9 + dev * 0.05;               // denser hexes draw a touch larger
  const ei = eraIndex(era);
  c.save();
  c.lineJoin = "miter"; c.lineCap = "butt";
  switch (h.cons) {
    case "rice": {
      if (campaignOf(campaign).wheat) {   // wheat field: golden block, stalk rows with heads
        inkRect(c, x - 10, y - 7, 20, 14, "#e2c46a");
        c.strokeStyle = "#a8842e"; c.lineWidth = 1; c.globalAlpha = 0.95;
        for (let i = -8; i <= 8; i += 3.2) {   // upright stalks
          c.beginPath(); c.moveTo(x + i, y + 6); c.lineTo(x + i, y - 3.5); c.stroke();
        }
        c.fillStyle = "#c69b3a";               // grain heads atop each stalk
        for (let i = -8; i <= 8; i += 3.2) c.fillRect(x + i - 1, y - 6, 2, 3);
        break;
      }
      // Tokyo: broad flat paddy field filling the hex
      inkRect(c, x - 10, y - 7, 20, 14, cons.color);
      c.strokeStyle = cons.accent; c.lineWidth = 1; c.globalAlpha = 0.9;
      for (let i = -6; i <= 6; i += 4) { c.beginPath(); c.moveTo(x + i, y - 6); c.lineTo(x + i, y + 6); c.stroke(); }
      c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x + 9, y); c.stroke();
      break;
    }
    case "road": { // bold paved band with a dashed centre line
      inkRect(c, x - 11, y - 4, 22, 8, cons.color);
      c.strokeStyle = "#efe08a"; c.lineWidth = 1.2; c.setLineDash([2.4, 2]);
      c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x + 10, y); c.stroke(); c.setLineDash([]);
      break;
    }
    case "house": { // a clear detached house: square body + big peaked roof
      const bw = 12 * g, bh = 8 * g;
      inkRect(c, x - bw / 2, y - 1, bw, bh, pal.color);
      c.fillStyle = pal.accent;                        // roof — its colour ages with the era
      c.beginPath();
      c.moveTo(x - bw / 2 - 2, y - 1); c.lineTo(x, y - 8 * g); c.lineTo(x + bw / 2 + 2, y - 1); c.closePath();
      c.fill(); c.strokeStyle = CONS_INK; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = CONS_INK; c.fillRect(x - 1.5, y + bh - 4, 3, 4);   // door
      break;
    }
    case "apartment": { // tall tower with a window grid — taller in later eras
      const w = 12 * g, hgt = (13 + ei * 1.4) * g, top = y - hgt * 0.62;
      inkRect(c, x - w / 2, top, w, hgt, pal.color);
      c.fillStyle = pal.accent;                        // windows
      const rows = Math.round(hgt / 3.4);
      for (let r = 0; r < rows; r++) for (let col = 0; col < 3; col++) {
        c.fillRect(x - w / 2 + 1.6 + col * (w - 3.2) / 3, top + 2 + r * (hgt - 3) / rows, (w - 3.2) / 3 - 1.2, 1.8);
      }
      break;
    }
    case "shop": { // wide storefront under a bold striped awning
      const w = 17 * g, hgt = 8 * g;
      inkRect(c, x - w / 2, y - hgt / 2 + 1.5, w, hgt, pal.color);
      c.fillStyle = pal.accent;                        // awning
      c.fillRect(x - w / 2 - 1, y - hgt / 2 - 2.5, w + 2, 4);
      c.strokeStyle = CONS_INK; c.lineWidth = 1.1; c.strokeRect(x - w / 2 - 0.5, y - hgt / 2 - 2, w + 1, 4);
      c.fillStyle = "#fff"; c.globalAlpha = 0.85;      // awning stripes
      for (let i = -w / 2; i < w / 2 - 1; i += 4) c.fillRect(x + i + 1.5, y - hgt / 2 - 2.5, 2, 4);
      c.globalAlpha = 1;
      if (ei >= 4) { c.fillStyle = "#ffe36a"; c.fillRect(x - 2, y - hgt / 2 + 3, 4, hgt - 4); } // modern lit sign
      break;
    }
    case "school": { // broad institutional block, window band + tall flag
      const w = 18 * g, hgt = 9 * g;
      inkRect(c, x - w / 2, y - hgt / 2 + 1, w, hgt, cons.color);
      c.fillStyle = cons.accent;
      for (let i = -w / 2 + 2.5; i < w / 2 - 2; i += 3.4) c.fillRect(x + i, y - 1.5, 2, 4);
      c.strokeStyle = CONS_INK; c.lineWidth = 1;       // flagpole
      c.beginPath(); c.moveTo(x - w / 2 + 2, y - hgt / 2 + 1); c.lineTo(x - w / 2 + 2, y - hgt / 2 - 7); c.stroke();
      c.fillStyle = "#d0403a"; c.fillRect(x - w / 2 + 2, y - hgt / 2 - 7, 5, 3.2);
      break;
    }
    case "office_s": { // low walk-up office block: flat roof, wide window band, sign
      const w = 13 * g, hgt = 9 * g;
      inkRect(c, x - w / 2, y - hgt / 2 + 1, w, hgt, pal.color);
      c.fillStyle = pal.accent;                        // two window bands
      for (const dy of [-hgt * 0.22, hgt * 0.18]) {
        for (let i = -w / 2 + 1.6; i < w / 2 - 1.6; i += 3.1) c.fillRect(x + i, y + dy, 2, 2.2);
      }
      c.fillStyle = CONS_INK; c.fillRect(x - 1.5, y + hgt / 2 - 3, 3, 4);   // entrance
      c.fillStyle = pal.accent; c.fillRect(x - w / 2, y - hgt / 2 - 1.4, w, 2);  // parapet sign band
      break;
    }
    case "office_l": { // full office tower: tall slab, dense glass grid, roof mast
      const w = 14 * g, hgt = (17 + ei * 1.6) * g, top = y - hgt * 0.68;
      inkRect(c, x - w / 2, top, w, hgt, pal.color);
      c.fillStyle = pal.accent;                        // glass curtain grid
      const rows = Math.round(hgt / 2.8);
      for (let r = 0; r < rows; r++) for (let col = 0; col < 4; col++) {
        c.fillRect(x - w / 2 + 1.3 + col * (w - 2.6) / 4, top + 1.6 + r * (hgt - 3) / rows, (w - 2.6) / 4 - 1, 1.5);
      }
      c.strokeStyle = CONS_INK; c.lineWidth = 1;       // roof mast
      c.beginPath(); c.moveTo(x, top); c.lineTo(x, top - 5); c.stroke();
      c.fillStyle = "#d04030"; c.fillRect(x - 0.9, top - 5.6, 1.8, 1.8);    // beacon
      break;
    }
    case "civic": { // solid hall with a domed roof + emblem (government)
      const w = 15 * g, hgt = 8 * g;
      inkRect(c, x - w / 2, y - hgt / 2 + 2, w, hgt, cons.color);
      c.fillStyle = cons.accent;                       // dome
      c.beginPath(); c.arc(x, y - hgt / 2 + 2, w * 0.28, Math.PI, 0); c.closePath(); c.fill();
      c.strokeStyle = CONS_INK; c.lineWidth = 1.1; c.stroke();
      c.fillStyle = "#fff"; c.fillRect(x - 0.6, y - hgt / 2 - w * 0.28 + 2, 1.2, 3);   // spire
      c.fillStyle = cons.accent;                       // columns
      for (const dx of [-w * 0.28, 0, w * 0.28]) c.fillRect(x + dx - 0.8, y - 1, 1.6, hgt - 3);
      break;
    }
  }
  c.restore();
}

/* ---- Landmark sprites (v0.5.3) ---------------------------------------------
 * One-of-a-kind places drawn over their hex: the Imperial Palace (Tokyo), the
 * Palace of Westminster, castles (Buckingham Palace, the Tower of London) and
 * the two great Thames crossings (London Bridge, Tower Bridge). Landmarks are
 * assigned by generateMap (h.landmark), regenerate from the seed, and are
 * purely cosmetic — ownership/build rules come from the usual owner flags.
 * A PNG named landmark_<key>.png in assets/ overrides the procedural art. */
function drawLandmark(c, key, x, y) {
  const img = assetGet("landmark_" + key);
  if (img) { c.drawImage(img, x - 12, y - 12, 24, 24); return; }
  c.save();
  c.lineJoin = "miter"; c.lineCap = "butt";
  switch (key) {
    case "imperial_palace": { // stone ramparts, white keep, two-tier green roofs
      inkRect(c, x - 10, y + 2, 20, 6, "#8d8678");            // sloped stone base
      inkRect(c, x - 6, y - 3, 12, 6, "#f2ead6");             // main keep wall
      c.fillStyle = "#2f6a4f";                                // lower roof
      c.beginPath(); c.moveTo(x - 8.5, y - 3); c.lineTo(x - 6, y - 6.5); c.lineTo(x + 6, y - 6.5); c.lineTo(x + 8.5, y - 3); c.closePath();
      c.fill(); c.strokeStyle = CONS_INK; c.lineWidth = 1.1; c.stroke();
      inkRect(c, x - 3.4, y - 9.5, 6.8, 3.2, "#f2ead6");      // upper storey
      c.fillStyle = "#2f6a4f";                                // upper roof, upswept eaves
      c.beginPath(); c.moveTo(x - 6, y - 9.5); c.lineTo(x, y - 13); c.lineTo(x + 6, y - 9.5); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = "#d8b23a"; c.fillRect(x - 0.7, y - 14.5, 1.4, 2);   // golden shachihoko finial
      break;
    }
    case "parliament": { // long gothic river front + Victoria Tower + Big Ben clock tower
      inkRect(c, x - 11, y - 2, 22, 8, "#cbb98a");            // main body
      c.fillStyle = "#a89468";                                // window bays
      for (let i = -9; i <= 8; i += 2.6) c.fillRect(x + i, y - 0.5, 1.2, 5);
      inkRect(c, x - 11, y - 7, 5, 6, "#cbb98a");             // Victoria Tower (broad)
      inkRect(c, x + 6.5, y - 11, 3.6, 9.5, "#cbb98a");       // clock tower (slender)
      c.fillStyle = "#f4f0dc";                                // clock face
      c.beginPath(); c.arc(x + 8.3, y - 8.5, 1.5, 0, 7); c.fill();
      c.strokeStyle = CONS_INK; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = "#3f5445";                                // both spires
      c.beginPath(); c.moveTo(x - 11.6, y - 7); c.lineTo(x - 8.5, y - 10.5); c.lineTo(x - 5.4, y - 7); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x + 6.1, y - 11); c.lineTo(x + 8.3, y - 14.5); c.lineTo(x + 10.5, y - 11); c.closePath(); c.fill();
      break;
    }
    case "castle": { // crenellated keep with twin turrets and a flying standard
      inkRect(c, x - 4.5, y - 6, 9, 12, "#b8b2a4");           // central keep
      inkRect(c, x - 9.5, y - 3, 5, 9, "#a9a396");            // west turret
      inkRect(c, x + 4.5, y - 3, 5, 9, "#a9a396");            // east turret
      c.fillStyle = "#b8b2a4";                                // battlements
      for (const [bx, by, n] of [[-4.5, -8, 3], [-9.5, -5, 2], [4.5, -5, 2]]) {
        for (let k = 0; k < n; k++) c.fillRect(x + bx + k * 3.2, y + by, 1.8, 2.2);
      }
      c.fillStyle = CONS_INK; c.fillRect(x - 1.2, y + 2, 2.4, 4);       // gate
      c.strokeStyle = CONS_INK; c.lineWidth = 0.8;                      // flagpole + standard
      c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x, y - 12.5); c.stroke();
      c.fillStyle = "#c03030"; c.fillRect(x, y - 12.5, 4, 2.4);
      break;
    }
    case "london_bridge": { // stone arch bridge carrying the road over the Thames (N–S)
      c.fillStyle = "#9a917f";                                          // roadway band
      c.fillRect(x - 3.5, y - HEX_SIZE, 7, HEX_SIZE * 2);
      c.strokeStyle = CONS_INK; c.lineWidth = 1;
      c.strokeRect(x - 3.5, y - HEX_SIZE, 7, HEX_SIZE * 2);
      c.strokeStyle = "#6e675e"; c.lineWidth = 1.4;                     // arch rings below the deck
      for (const dy of [-7, 0, 7]) {
        c.beginPath(); c.arc(x - 5.5, y + dy, 2.6, Math.PI * 1.5, Math.PI * 0.5, true); c.stroke();
        c.beginPath(); c.arc(x + 5.5, y + dy, 2.6, Math.PI * 0.5, Math.PI * 1.5, true); c.stroke();
      }
      c.strokeStyle = "#efe08a"; c.lineWidth = 0.9; c.setLineDash([2, 2.4]);   // centre line
      c.beginPath(); c.moveTo(x, y - HEX_SIZE + 1); c.lineTo(x, y + HEX_SIZE - 1); c.stroke();
      c.setLineDash([]);
      break;
    }
    case "tower_bridge": { // twin gothic towers, high walkways, blue bascule span (N–S)
      c.strokeStyle = "#3a5a8c"; c.lineWidth = 2.2;                     // suspension chains to the banks
      c.beginPath(); c.moveTo(x - 2.6, y - 5); c.quadraticCurveTo(x - 2.6, y - 11, x - 3.6, y - HEX_SIZE); c.stroke();
      c.beginPath(); c.moveTo(x - 2.6, y + 5); c.quadraticCurveTo(x - 2.6, y + 11, x - 3.6, y + HEX_SIZE); c.stroke();
      c.beginPath(); c.moveTo(x + 2.6, y - 5); c.quadraticCurveTo(x + 2.6, y - 11, x + 3.6, y - HEX_SIZE); c.stroke();
      c.beginPath(); c.moveTo(x + 2.6, y + 5); c.quadraticCurveTo(x + 2.6, y + 11, x + 3.6, y + HEX_SIZE); c.stroke();
      c.fillStyle = "#5a7ca8";                                          // bascule roadway
      c.fillRect(x - 2.8, y - HEX_SIZE, 5.6, HEX_SIZE * 2);
      c.strokeStyle = CONS_INK; c.lineWidth = 0.9;
      c.strokeRect(x - 2.8, y - HEX_SIZE, 5.6, HEX_SIZE * 2);
      inkRect(c, x - 4.2, y - 7.5, 8.4, 5, "#ded6c2");                  // north tower
      inkRect(c, x - 4.2, y + 2.5, 8.4, 5, "#ded6c2");                  // south tower
      c.fillStyle = "#4a6a90";                                          // tower caps
      c.beginPath(); c.moveTo(x - 4.6, y - 7.5); c.lineTo(x, y - 11); c.lineTo(x + 4.6, y - 7.5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x - 4.6, y + 7.5); c.lineTo(x, y + 11); c.lineTo(x + 4.6, y + 7.5); c.closePath(); c.fill();
      c.strokeStyle = "#ded6c2"; c.lineWidth = 1.2;                     // twin high-level walkways
      c.beginPath(); c.moveTo(x - 2.2, y - 2.5); c.lineTo(x - 2.2, y + 2.5); c.stroke();
      c.beginPath(); c.moveTo(x + 2.2, y - 2.5); c.lineTo(x + 2.2, y + 2.5); c.stroke();
      break;
    }
    case "eiffel_tower": { // v0.6: latticed iron pylon — curved legs, two decks, spire
      c.strokeStyle = "#6b5d4f"; c.lineWidth = 1.6;               // the two curved legs
      c.beginPath(); c.moveTo(x - 8, y + 8); c.quadraticCurveTo(x - 2.5, y - 2, x - 1, y - 12); c.stroke();
      c.beginPath(); c.moveTo(x + 8, y + 8); c.quadraticCurveTo(x + 2.5, y - 2, x + 1, y - 12); c.stroke();
      c.lineWidth = 1.1;                                          // ground arch between the legs
      c.beginPath(); c.arc(x, y + 8, 4.6, Math.PI, 0); c.stroke();
      c.fillStyle = "#6b5d4f";                                    // the two observation decks
      c.fillRect(x - 5.6, y + 0.5, 11.2, 1.6);
      c.fillRect(x - 3.2, y - 6, 6.4, 1.4);
      c.lineWidth = 0.6;                                          // lattice cross-bracing
      for (const [ly, lw] of [[6.5, 6.4], [3.5, 5.6], [-2.5, 4.2], [-9, 2.2]]) {
        c.beginPath(); c.moveTo(x - lw / 2, y + ly); c.lineTo(x + lw / 2, y + ly - 2.4); c.stroke();
        c.beginPath(); c.moveTo(x + lw / 2, y + ly); c.lineTo(x - lw / 2, y + ly - 2.4); c.stroke();
      }
      c.lineWidth = 1.4;                                          // spire + beacon
      c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x, y - 15); c.stroke();
      c.fillStyle = "#e8c860"; c.fillRect(x - 0.8, y - 15.8, 1.6, 1.6);
      break;
    }
    case "arc_triomphe": { // v0.6: the great arch on the Étoile — attic, vault, reliefs
      inkRect(c, x - 9, y - 9, 18, 15, "#d9cdb4");                // the mass of the arch
      c.fillStyle = "#c4b696";                                    // attic band
      c.fillRect(x - 9, y - 9, 18, 3);
      c.strokeStyle = CONS_INK; c.lineWidth = 0.8;
      c.strokeRect(x - 9, y - 9, 18, 15);
      c.fillStyle = "#8d8272";                                    // the vault (opening)
      c.beginPath();
      c.moveTo(x - 3.6, y + 6); c.lineTo(x - 3.6, y - 1);
      c.arc(x, y - 1, 3.6, Math.PI, 0);
      c.lineTo(x + 3.6, y + 6); c.closePath(); c.fill();
      c.strokeStyle = CONS_INK; c.lineWidth = 0.7; c.stroke();
      c.fillStyle = "#b0a284";                                    // sculpted relief panels
      c.fillRect(x - 7.6, y - 5, 2.6, 4); c.fillRect(x + 5, y - 5, 2.6, 4);
      c.fillStyle = "#5a6a86";                                    // tricolore over the tomb
      c.fillRect(x - 0.9, y + 2.4, 1.8, 3.6);
      break;
    }
    case "louvre": { // v0.6: long palace front with pavilion roofs + the glass pyramid
      inkRect(c, x - 11, y - 3, 22, 8, "#e3d8c0");                // the Grande Galerie front
      c.fillStyle = "#c9bda0";                                    // window bays
      for (let i = -9.5; i <= 8.5; i += 2.4) c.fillRect(x + i, y - 1.5, 1.1, 5);
      c.fillStyle = "#3f4a5a";                                    // mansard pavilion roofs
      for (const px of [-8.4, 0, 8.4]) {
        c.beginPath(); c.moveTo(x + px - 3, y - 3); c.lineTo(x + px, y - 6.4); c.lineTo(x + px + 3, y - 3); c.closePath(); c.fill();
      }
      c.strokeStyle = CONS_INK; c.lineWidth = 0.8;
      c.strokeRect(x - 11, y - 3, 22, 8);
      c.fillStyle = "#a8c8e0cc";                                  // the glass pyramid, forecourt
      c.beginPath(); c.moveTo(x - 3.4, y + 9); c.lineTo(x, y + 4.6); c.lineTo(x + 3.4, y + 9); c.closePath(); c.fill();
      c.strokeStyle = "#5a7ca8"; c.lineWidth = 0.7; c.stroke();
      c.beginPath(); c.moveTo(x, y + 4.6); c.lineTo(x, y + 9); c.stroke();
      break;
    }
  }
  c.restore();
}

/* ---- Shared hex drawing (used by BOTH the cached base layer and the
 * zoomed-in direct-vector path, so the two look identical) ---------------- */

/** The base layer is rasterized at this supersampling factor (device-
 *  independent). Above BASE_SCALE×1.5 effective magnification, drawFrame
 *  stops magnifying the bitmap and redraws the visible hexes as vectors —
 *  crisp at any zoom, and cheap because few hexes are visible that far in. */
const BASE_SCALE = 2;

function traceHexPath(c, col, row, scale) {
  const { x, y } = hexCenter(col, row);
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    const px = x + HEX_SIZE * (scale || 1) * Math.cos(a);
    const py = y + HEX_SIZE * (scale || 1) * Math.sin(a);
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
}

/** One hex's terrain + construction glyph. */
function drawHexBase(c, st, col, row, era) {
  const h = st.hexes[hexIdx(col, row)];
  const terr = CFG.TERRAIN[h.terrain];
  const img = assetGet("tile_" + h.terrain + "_" + era);
  const { x, y } = hexCenter(col, row);
  const seed = hexHash(col, row);
  if (img) {
    c.drawImage(img, x - HEX_W / 2, y - HEX_SIZE, HEX_W, HEX_SIZE * 2);
  } else {
    traceHexPath(c, col, row, 0.98);
    // per-hex brightness variance so same-terrain tiles don't look like a flat repeated stamp
    c.fillStyle = shadeColor(terr.color, (seed - 0.5) * 10);
    c.fill();
    // era tint — the period's colour mood (sepia Meiji → blue-white Reiwa)
    c.fillStyle = ERA_TINT[era] + ERA_TINT_ALPHA;
    c.fill();
    // terrain-specific texture (grass tufts, hachures, peaks, reeds, ripples, stonework, channels…)
    drawTerrainPattern(c, h.terrain, x, y, terr.accent, seed);
    // crisp hex border so adjacent tiles read apart, tile-grid style
    traceHexPath(c, col, row, 0.98);
    c.strokeStyle = shadeColor(terr.color, -18) + "a0";
    c.lineWidth = 0.8;
    c.stroke();
  }
  // kaidō corridor: a continuous road band toward neighbouring kaidō hexes,
  // styled by state (dirt track → paved road → expressway)
  if (h.kaido) drawKaido(c, st, hexIdx(col, row), x, y);
  // construction glyph (placeholder shapes; replace via assets)
  if (h.cons && !h.track) drawConsGlyph(c, h, x, y, era, st.campaign);
  // one-of-a-kind landmark art (palaces, Parliament, castles, Thames bridges)
  if (h.landmark) drawLandmark(c, h.landmark, x, y);
}

/** Kaidō road band: connects to adjacent kaidō hexes so the corridor reads as
 *  one continuous road. Dirt = ochre track; paved = grey with a centre line;
 *  highway = wide dark carriageway with a dashed white line. */
function drawKaido(c, st, i, x, y) {
  const k = st.hexes[i].kaido;
  const state = k.state;
  const col = i % CFG.MAP_W, row = (i / CFG.MAP_W) | 0;
  const segs = [];
  for (let d = 0; d < 6; d++) {
    const nb = hexNeighbor(col, row, d);
    if (nb < 0) continue;
    const nk = st.hexes[nb].kaido;
    // join only hexes of the same route (or at a marked junction hex, where
    // one route historically branches off another) — separate roads that
    // merely pass close never fuse into one blob
    if (!nk || (nk.route !== k.route && !nk.junction && !k.junction)) continue;
    const n = hexCenterIdx(nb);
    segs.push({ mx: (x + n.x) / 2, my: (y + n.y) / 2 });
  }
  const style = state === "highway" ? { w: 7, color: "#3c3f45", line: "#e8e8ee", dash: [4, 4] } :
                state === "paved"   ? { w: 5, color: "#8b8f96", line: "#d8d8de", dash: [] } :
                                      { w: 4.4, color: "#b09055", line: "#8a6f3e", dash: [2, 3] };
  c.save();
  c.lineCap = "round";
  const draw = (width, colr, dash) => {
    c.strokeStyle = colr; c.lineWidth = width; c.setLineDash(dash || []);
    if (!segs.length) { c.beginPath(); c.arc(x, y, width * 0.7, 0, 7); c.stroke(); return; }
    for (const s of segs) { c.beginPath(); c.moveTo(x, y); c.lineTo(s.mx, s.my); c.stroke(); }
  };
  draw(style.w, style.color);
  draw(1, style.line, style.dash);
  c.setLineDash([]);
  c.restore();
}

/** One hex's track: ballast + crossties + twin steel rails through the six
 *  sides where the same company has track, with a company-color halo. */
function drawHexTrack(c, st, i) {
  const h = st.hexes[i];
  if (!h.track) return;
  const co = st.companies[h.track.co];
  const { x, y } = hexCenterIdx(i);
  const col = i % CFG.MAP_W, row = (i / CFG.MAP_W) | 0;
  const segs = [];
  for (let d = 0; d < 6; d++) {
    const nb = hexNeighbor(col, row, d);
    if (nb < 0) continue;
    const nt = st.hexes[nb].track;
    if (!nt || nt.co !== h.track.co) continue;
    const n = hexCenterIdx(nb);
    segs.push({ mx: (x + n.x) / 2, my: (y + n.y) / 2 });
  }
  const rails = trackRailList(h.track);
  const N = rails.length;
  // pass 1: company-color halo (ownership readable at a glance)
  c.strokeStyle = (co ? co.color : "#999") + "70";
  c.lineWidth = 7.5; c.lineCap = "round";
  for (const s of segs) { c.beginPath(); c.moveTo(x, y); c.lineTo(s.mx, s.my); c.stroke(); }
  // bridge / causeway over water: trestle bents (paired pier posts) under the
  // roadbed so crossings read apart from plain ground-level track
  const terHex = CFG.TERRAIN[h.terrain];
  if ((terHex.bridge || terHex.causeway) && !h.track.tunnel) {
    c.strokeStyle = "#4a3826"; c.lineWidth = 1.6; c.lineCap = "butt";
    for (const s of segs) {
      const dx = s.mx - x, dy = s.my - y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      for (const t of [len * 0.35, len * 0.75]) {
        const cx = x + ux * t, cy = y + uy * t;
        c.beginPath();
        c.moveTo(cx - 2.2, cy + 2); c.lineTo(cx - 2.8, cy + 6);
        c.moveTo(cx + 2.2, cy + 2); c.lineTo(cx + 2.8, cy + 6);
        c.stroke();
      }
    }
    c.lineCap = "round";
  }
  // pass 2: ballast roadbed (dark casing in tunnels) — a multi-rail hex
  // (double track / second gauge) gets a visibly wider bed
  c.strokeStyle = h.track.tunnel ? "#3a3a46" : "#6e675e";
  c.lineWidth = 5 + 4.2 * (N - 1);
  if (h.track.tunnel) c.setLineDash([5, 3]);
  for (const s of segs) { c.beginPath(); c.moveTo(x, y); c.lineTo(s.mx, s.my); c.stroke(); }
  c.setLineDash([]);
  if (h.track.tunnel) {
    c.fillStyle = "#171a22";
    for (const s of segs) { c.beginPath(); c.arc(s.mx, s.my, 3.4, 0, 7); c.fill(); }
  }
  // pass 3: crossties + one pair of steel rails PER RAIL, spread side-by-side
  // so a double-tracked hex reads as TWO distinct parallel tracks (v0.5.9 —
  // each rail-pair gets its own tie bed; two gauges likewise sit alongside
  // but never connect — see addGauge/changeGauge)
  const railSpread = 4.6;                               // center-to-center spacing of parallel rail-pairs
  for (const s of segs) {
    const dx = s.mx - x, dy = s.my - y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    rails.forEach((rail, r) => {
      const mid = N > 1 ? (r - (N - 1) / 2) * railSpread : 0;   // lateral offset of this rail-pair
      const tieHalf = N > 1 ? 2.1 : 2.6;
      c.strokeStyle = "#46362a"; c.lineWidth = 1.1; c.setLineDash([]);
      c.beginPath();
      for (let t = 1.6; t < len - 0.5; t += 3.1) {
        const cx = x + ux * t, cy = y + uy * t;
        c.moveTo(cx + px * (mid - tieHalf), cy + py * (mid - tieHalf));
        c.lineTo(cx + px * (mid + tieHalf), cy + py * (mid + tieHalf));
      }
      c.stroke();
      const gpx = rail.gauge === "standard" ? 2.1 : rail.gauge === "industrial" ? 1.1 : 1.6;
      if (rail.building) { c.strokeStyle = "#a89f94"; c.lineWidth = 0.8; c.setLineDash([2, 2]); }
      else { c.strokeStyle = "#d8d2c4"; c.lineWidth = 0.9; c.setLineDash([]); }
      for (const side of [-1, 1]) {
        const off = mid + gpx * side;
        c.beginPath();
        c.moveTo(x + px * off, y + py * off);
        c.lineTo(s.mx + px * off, s.my + py * off);
        c.stroke();
      }
    });
    c.setLineDash([]);
  }
  if (!segs.length) {       // isolated stub: buffer-stop dot
    c.fillStyle = co ? co.color : "#999";
    c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill();
    c.strokeStyle = "#d8d2c4"; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, 3, 0, 7); c.stroke();
  }
  if (h.track.dmg > 0) {
    // v0.5.9: damaged track shows the damage itself — a torn gap in the
    // permanent way with buckled rail ends kicked sideways and debris on the
    // ballast — instead of an abstract red ✕. Deterministic per hex so the
    // wreckage doesn't shimmer between frames.
    const jig = (i % 7) / 7 - 0.5;                     // stable per-hex jitter
    for (const s of segs) {
      const dx = s.mx - x, dy = s.my - y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const gt = len * (0.5 + 0.14 * jig);             // where the break sits
      const gx = x + ux * gt, gy = y + uy * gt;
      // the gap: ballast swallows the rails for a short stretch
      c.strokeStyle = h.track.tunnel ? "#3a3a46" : "#6e675e";
      c.lineWidth = 5.6 + 4.2 * (N - 1); c.lineCap = "butt";
      c.beginPath();
      c.moveTo(gx - ux * 2.4, gy - uy * 2.4); c.lineTo(gx + ux * 2.4, gy + uy * 2.4);
      c.stroke();
      // buckled rail ends: short red-hot stubs kicked off the alignment
      c.strokeStyle = "#d04030"; c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(gx - ux * 2.6, gy - uy * 2.6);
      c.lineTo(gx - ux * 1.0 + px * 2.2, gy - uy * 1.0 + py * 2.2);
      c.moveTo(gx + ux * 2.6, gy + uy * 2.6);
      c.lineTo(gx + ux * 1.0 - px * 2.4, gy + uy * 1.0 - py * 2.4);
      c.stroke();
      // debris: dark clods scattered beside the break
      c.fillStyle = "#3d322a";
      c.fillRect(gx + px * 2.6 - 0.6, gy + py * 2.6 - 0.6, 1.2, 1.2);
      c.fillRect(gx - px * 3.0 - 0.5, gy - py * 3.0 - 0.5, 1.0, 1.0);
      c.fillRect(gx + ux * 1.8 + px * 1.2 - 0.5, gy + uy * 1.8 + py * 1.2 - 0.5, 1.0, 1.0);
      c.lineCap = "round";
    }
    if (!segs.length) {                                 // isolated damaged stub
      c.strokeStyle = "#d04030"; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3);
      c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3);
      c.stroke();
    }
  }
  if (rails.some(rl => rl.elec)) {   // catenary mast hint (any electrified rail)
    c.strokeStyle = "#ffe9a0"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + 4, y - 1); c.lineTo(x + 4, y - 5); c.stroke();
  }
}

function makeRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;          // crisp pixel scaling — 8-bit look when zoomed
  const worldW = HEX_W * (CFG.MAP_W + 1), worldH = HEX_H * CFG.MAP_H + HEX_SIZE * 2;
  // base layer cache, supersampled ×BASE_SCALE so it stays sharp on HiDPI
  // screens and at moderate zoom
  const base = document.createElement("canvas");
  base.width = Math.ceil(worldW * BASE_SCALE); base.height = Math.ceil(worldH * BASE_SCALE);
  const bctx = base.getContext("2d");
  bctx.imageSmoothingEnabled = false;
  const cam = { x: worldW / 2, y: worldH / 2, zoom: 1.1 };
  const tracePath = traceHexPath;

  // The camera and all pointer math live in CSS pixels; the canvas backing
  // store is sized in DEVICE pixels (CSS × devicePixelRatio) and drawFrame
  // scales everything up by dpr. Without this, a HiDPI browser renders the
  // game at half resolution and bilinear-upscales it — the classic
  // "everything is slightly blurry" canvas bug.
  const view = { w: canvas.width || 800, h: canvas.height || 600, dpr: 1 };
  function resize() {
    view.dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    view.w = canvas.clientWidth || view.w;
    view.h = canvas.clientHeight || view.h;
    canvas.width = Math.max(1, Math.round(view.w * view.dpr));
    canvas.height = Math.max(1, Math.round(view.h * view.dpr));
  }
  resize();
  // v0.5.9 bugfix: the canvas can change CSS size without a window `resize`
  // event (side-panel expand/collapse, tab layout reflow, browser zoom). When
  // that happened, view.w/h went stale and every pointer→world conversion was
  // shifted by half the size delta — "the selected hex is slightly offset from
  // the pointer". Observe the element itself so view always matches reality.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => resize()).observe(canvas);
  }
  /** Cheap stale-size guard for pointer math (belt & braces for browsers
   *  without ResizeObserver or before the observer's callback has run). */
  function syncViewSize() {
    if (canvas.clientWidth && (canvas.clientWidth !== view.w || canvas.clientHeight !== view.h)) resize();
  }

  /** Redraw the cached terrain + constructions + track layer (supersampled). */
  function redrawBase(st) {
    const era = eraOf(st.time.year).key;
    bctx.setTransform(BASE_SCALE, 0, 0, BASE_SCALE, 0, 0);
    bctx.imageSmoothingEnabled = false;
    bctx.fillStyle = "#26303a";
    bctx.fillRect(0, 0, worldW, worldH);
    for (let r = 0; r < CFG.MAP_H; r++) {
      for (let c = 0; c < CFG.MAP_W; c++) drawHexBase(bctx, st, c, r, era);
    }
    for (let i = 0; i < st.hexes.length; i++) {
      if (st.hexes[i].track) drawHexTrack(bctx, st, i);
    }
    st.renderDirty = false;
  }

  /** Zoomed-in path: draw the visible hexes directly as vectors (with a
   *  one-hex margin so track segments reaching across the edge still draw).
   *  Far zoomed in, few hexes are visible, so this stays cheap — and it is
   *  perfectly sharp at any zoom level, unlike magnifying the cache. */
  function drawVisibleHexes(st) {
    const era = eraOf(st.time.year).key;
    const tl = screenToWorld(0, 0), br = screenToWorld(view.w, view.h);
    const c0 = Math.max(0, Math.floor(tl.x / HEX_W) - 2);
    const c1 = Math.min(CFG.MAP_W - 1, Math.ceil(br.x / HEX_W) + 1);
    const r0 = Math.max(0, Math.floor(tl.y / HEX_H) - 2);
    const r1 = Math.min(CFG.MAP_H - 1, Math.ceil(br.y / HEX_H) + 1);
    ctx.fillStyle = "#26303a";
    ctx.fillRect(hexCenter(c0, r0).x - HEX_W * 1.5, hexCenter(c0, r0).y - HEX_H * 1.5,
                 (c1 - c0 + 3) * HEX_W, (r1 - r0 + 3) * HEX_H);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) drawHexBase(ctx, st, c, r, era);
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = hexIdx(c, r);
        if (st.hexes[i].track) drawHexTrack(ctx, st, i);
      }
    }
  }

  function worldToScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.zoom + view.w / 2, y: (wy - cam.y) * cam.zoom + view.h / 2 };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - view.w / 2) / cam.zoom + cam.x, y: (sy - view.h / 2) / cam.zoom + cam.y };
  }
  /** Hex index under a screen point, or -1. */
  function pickHex(sx, sy) {
    syncViewSize();               // v0.5.9: never pick through a stale viewport size
    const w = screenToWorld(sx, sy);
    const rowGuess = Math.round((w.y - HEX_SIZE) / HEX_H);
    let best = -1, bestD = Infinity;
    for (let r = rowGuess - 1; r <= rowGuess + 1; r++) {
      if (r < 0 || r >= CFG.MAP_H) continue;
      const colGuess = Math.round((w.x - HEX_W / 2) / HEX_W - 0.5 * (r & 1));
      for (let c = colGuess - 1; c <= colGuess + 1; c++) {
        if (c < 0 || c >= CFG.MAP_W) continue;
        const ctr = hexCenter(c, r);
        const d = (ctr.x - w.x) ** 2 + (ctr.y - w.y) ** 2;
        if (d < bestD && d < HEX_SIZE * HEX_SIZE * 1.4) { bestD = d; best = hexIdx(c, r); }
      }
    }
    return best;
  }

  /** Stroke a line's hex path as a polyline (used by the route overlays). */
  function strokeLinePath(path, color, width, alpha, dash) {
    if (!path || path.length < 2) return;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let k = 0; k < path.length; k++) {
      const c = hexCenterIdx(path[k]);
      if (k === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Overlay the route of the line selected in the Lines panel: a translucent
   *  colored band along its path with a bright dashed core, and rings on its
   *  served stops so the line is easy to trace across the map. */
  function drawSelectedLine(st, ui) {
    const id = ui && ui.selectedLine;
    if (id == null || id < 0) return;
    const line = st.lines[id];
    if (!line || !line.alive || line.path.length < 2) return;
    const co = st.companies[line.co];
    const color = co ? co.color : "#ffe34a";
    strokeLinePath(line.path, color, 6, 0.40);
    strokeLinePath(line.path, "#fff7cc", 1.6, 0.95, [5, 4]);
    ctx.save();
    ctx.globalAlpha = 1; ctx.strokeStyle = "#fff7cc"; ctx.lineWidth = 2;
    for (const sid of line.stations) {
      if (!line.stops[sid]) continue;
      const s = st.stations[sid];
      if (!s || !s.alive) continue;
      const pc = hexCenterIdx(s.hex);
      ctx.beginPath(); ctx.arc(pc.x, pc.y, 7, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  /** Overlay the routes of ALL the player's operating lines at once (the
   *  Lines panel's "Show all my routes" toggle — v0.5.1). Each line gets its
   *  own hue (golden-angle spaced, so neighbours in the list stay distinct)
   *  with a thin dashed core, making shared corridors and gaps in coverage
   *  readable at a glance. */
  function drawAllPlayerLines(st, ui) {
    if (!ui || !ui.showAllLines) return;
    const p = st.companies.find(c => c.isPlayer);
    if (!p) return;
    let k = 0;
    for (const line of st.lines) {
      if (!line.alive || line.co !== p.id || line.path.length < 2) continue;
      const hue = Math.round((k * 137.5) % 360);
      strokeLinePath(line.path, "hsl(" + hue + ",85%,60%)", 5, 0.45);
      strokeLinePath(line.path, "hsl(" + hue + ",95%,85%)", 1.4, 0.9, [5, 4]);
      k++;
    }
  }

  /** Overlay every line coming in & out of the clicked station hex (inspect),
   *  each in its operator's colour, with each station node ringed white. Covers
   *  EVERY operating station sharing the hex (shared station hexes from 1946),
   *  so clicking a station highlights all lines passing through it. */
  function drawStationLines(st, ui) {
    const sid = ui && ui.focusStation;
    if (sid == null || sid < 0) return;
    const station = st.stations[sid];
    if (!station || !station.alive) return;
    // all operating stations on the same hex (so multi-company hubs highlight fully)
    const hexSids = st.hexes[station.hex].stations.filter(id => st.stations[id] && st.stations[id].alive);
    const sidSet = new Set(hexSids.length ? hexSids : [sid]);
    let drew = false;
    for (const line of st.lines) {
      if (!line.alive || !line.stations || !line.stations.some(s => sidSet.has(s))) continue;
      const co = st.companies[line.co];
      strokeLinePath(line.path, co ? co.color : "#ffe34a", 5, 0.34);
      strokeLinePath(line.path, "#fff7cc", 1.3, 0.85, [5, 4]);
      drew = true;
    }
    ctx.save();
    ctx.globalAlpha = 1; ctx.strokeStyle = drew ? "#ffffff" : "#9fd6ff"; ctx.lineWidth = 2.5;
    for (const id of sidSet) {
      const pc = hexCenterIdx(st.stations[id].hex);
      ctx.beginPath(); ctx.arc(pc.x, pc.y, 9, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFrame(st, ui) {
    // all drawing happens in CSS-pixel space, scaled up to device pixels
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1b232b";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.w / 2, view.h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    // mag = device pixels per world unit. While the supersampled cache is at
    // or above native resolution (mild magnification tolerated for the 8-bit
    // look), blit it — smoothing only when minifying, so zoomed-out stays
    // clean. Past that, redraw the visible hexes as vectors: crisp at any
    // zoom instead of ever-larger nearest-neighbor blocks.
    const mag = cam.zoom * view.dpr;
    if (mag <= BASE_SCALE * 1.5) {
      if (st.renderDirty) redrawBase(st);
      ctx.imageSmoothingEnabled = mag < BASE_SCALE;
      ctx.drawImage(base, 0, 0, base.width, base.height, 0, 0, worldW, worldH);
      ctx.imageSmoothingEnabled = false;
    } else {
      drawVisibleHexes(st);
    }

    // land ownership tint
    if (ui.showOwners) {
      for (const co of st.companies) {
        if (!co.alive) continue;
        ctx.fillStyle = co.color + "30";
        for (const i of co.land) {
          tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.95);
          ctx.fill();
        }
      }
      // private holdouts (owners who never sell): dark tint + red edge
      ctx.fillStyle = "rgba(18,18,22,0.40)";
      ctx.strokeStyle = "#d24a4a";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < st.hexes.length; i++) {
        if (st.hexes[i].owner !== -2) continue;
        tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.9);
        ctx.fill(); ctx.stroke();
      }
      // company estate outlines: each railway's colour along the sides of its
      // parcels that face land it does NOT own (same idea as the holdout red
      // edge) — contiguous holdings read as one outlined block, not per-hex
      // cells, and two rivals' facing borders both stay visible (inset)
      ctx.lineWidth = 1.3;
      for (const co of st.companies) {
        if (!co.alive || !co.land.length) continue;
        ctx.strokeStyle = co.color;
        ctx.beginPath();
        for (const i of co.land) {
          const col = i % CFG.MAP_W, row = (i / CFG.MAP_W) | 0;
          const cc = hexCenter(col, row);
          const dirs = (row & 1) ? HEX_DIRS_ODD : HEX_DIRS_EVEN;
          for (let d = 0; d < 6; d++) {
            const nb = hexNeighbor(col, row, d);
            if (nb >= 0 && st.hexes[nb].owner === co.id) continue;   // same estate — no border here
            // the edge shared with neighbour d: hex-side long, perpendicular
            // to the centre line, centred on the midpoint (hexCenter is pure
            // geometry, so an off-map neighbour still yields the right edge)
            const nc = hexCenter(col + dirs[d][0], row + dirs[d][1]);
            const dx = nc.x - cc.x, dy = nc.y - cc.y;
            const len = Math.hypot(dx, dy) || 1;
            const px = -dy / len * HEX_SIZE / 2, py = dx / len * HEX_SIZE / 2;
            const mx = (cc.x + nc.x) / 2, my = (cc.y + nc.y) / 2;
            const k = 0.88;   // inset toward the owner's side
            ctx.moveTo(cc.x + (mx - px - cc.x) * k, cc.y + (my - py - cc.y) * k);
            ctx.lineTo(cc.x + (mx + px - cc.x) * k, cc.y + (my + py - cc.y) * k);
          }
        }
        ctx.stroke();
      }
    }
    // demand heatmap: where the riders are (works from turn one, no track needed)
    if (ui.showDemand) {
      const dm = demandFieldCached(st);
      for (let i = 0; i < dm.field.length; i++) {
        const v = Math.sqrt(dm.field[i] / dm.max);     // sqrt spreads the low end for readability
        if (v < 0.04) continue;
        const c = demandColor(v);
        ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.18 + 0.46 * v).toFixed(3) + ")";
        tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.96);
        ctx.fill();
      }
    }
    // construction in progress: hatched hexes (track jobs list hexes; the
    // demolish / gauge / station-demolition jobs each carry a single hex)
    for (const job of st.builds) {
      const co = st.companies[job.co];
      if (job.kind === "demolish" || job.kind === "gauge" || job.kind === "stationdemo" || job.kind === "reclaim") {
        const i = job.hex;
        tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.7);
        ctx.strokeStyle = job.kind === "gauge" ? "#d8b23a" :
                          job.kind === "reclaim" ? "#c9a86a" : "#c0392b";
        ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
        ctx.stroke(); ctx.setLineDash([]);
        if (job.kind === "reclaim") {
          // land-fill hatching: diagonal earth strokes filling in as work advances
          const p = hexCenterIdx(i);
          ctx.strokeStyle = "#c9a86a"; ctx.globalAlpha = 0.65; ctx.lineWidth = 1.4;
          const frac = Math.min(1, (job.progress || 0) / (job.total || 1));
          const nH = 1 + Math.round(4 * frac);
          for (let hln = 0; hln < nH; hln++) {
            const dy = -6 + hln * 3.2;
            ctx.beginPath(); ctx.moveTo(p.x - 8, p.y + dy + 4); ctx.lineTo(p.x + 8, p.y + dy - 4); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        continue;
      }
      // electrification hatches over EXISTING track in catenary-amber (not new
      // rail being laid, so it reads distinctly from a track corridor)
      const jobStroke = job.kind === "electrify" ? "#d8b23a" : co.color;
      for (let k = job.done; k < job.hexes.length; k++) {
        const i = job.hexes[k];
        tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.7);
        ctx.strokeStyle = jobStroke; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
        ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // every operating player line at once (Lines panel toggle)
    drawAllPlayerLines(st, ui);
    // highlighted line route (selected in the Lines panel, or being edited)
    drawSelectedLine(st, ui);
    // all lines in/out of the focused station (inspect selection)
    drawStationLines(st, ui);

    // stations (+ rush-hour passenger glow)
    const phase = dayPhase(st.time.frac);
    for (const s of st.stations) {
      if (!s.alive) continue;
      const co = st.companies[s.co];
      const p = hexCenterIdx(s.hex);
      if (s.board > 0 && phase.glow > 0.2 && !s.building) {
        ctx.fillStyle = "rgba(255,235,160," + (0.12 * phase.glow * Math.min(1, s.board / 300)).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(p.x, p.y, 14 + 6 * phase.glow, 0, 7); ctx.fill();
      }
      // 3 sprite slots vs. 6 commerce tiers (0..5): bucket two tiers per slot
      const visualTier = Math.min(3, 1 + Math.floor(effectiveCommerce(st, s) / 2));
      const img = assetGet("station_l" + visualTier);
      const sz = 5 + visualTier * 2;
      if (s.isDepot) {
        // yard icon: wider shed with siding lines, distinct from the station square
        const w = sz * 1.6, hgt = sz * 0.9;
        ctx.fillStyle = s.building ? "#888" : "#5a5048";
        ctx.strokeStyle = co ? co.color : "#444"; ctx.lineWidth = 1.5;
        ctx.fillRect(p.x - w / 2, p.y - hgt / 2, w, hgt);
        ctx.strokeRect(p.x - w / 2, p.y - hgt / 2, w, hgt);
        ctx.strokeStyle = "#d8d2c4"; ctx.lineWidth = 0.8;
        for (const dy of [-hgt * 0.25, hgt * 0.25]) {
          ctx.beginPath(); ctx.moveTo(p.x - w / 2 + 1, p.y + dy); ctx.lineTo(p.x + w / 2 - 1, p.y + dy); ctx.stroke();
        }
        if (s.depotAsStation) {
          const ssz = sz * 0.7;
          ctx.fillStyle = s.building ? "#888" : "#f5f1e6";
          ctx.strokeStyle = co ? co.color : "#444"; ctx.lineWidth = 1.5;
          ctx.fillRect(p.x - ssz / 2, p.y - hgt / 2 - ssz * 0.8, ssz, ssz);
          ctx.strokeRect(p.x - ssz / 2, p.y - hgt / 2 - ssz * 0.8, ssz, ssz);
        }
      } else if (img) ctx.drawImage(img, p.x - sz / 2, p.y - sz / 2, sz, sz);
      else {
        ctx.fillStyle = s.building ? "#888" : "#f5f1e6";
        ctx.strokeStyle = co ? co.color : "#444"; ctx.lineWidth = 2;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        ctx.strokeRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      if (s.underground && !s.building) {
        ctx.strokeStyle = co ? co.color : "#444"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.9, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = co ? co.color : "#444"; ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.45, 0, 7); ctx.fill();
      }
      // commerce (ekinaka) badge — a distinct glyph per developed style, so the
      // station's commercial character reads from the hex at a glance
      if (!s.building) drawCommerceGlyph(ctx, p, sz, effectiveCommerce(st, s), !!s.commerceBuilding);
      if (cam.zoom >= 1.0) {
        ctx.font = "7px monospace"; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        ctx.fillText(s.name, p.x, p.y - sz);
      }
      if (ui.lineSel && ui.lineSel.includes(s.id)) {
        ctx.strokeStyle = "#7CFC9A"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, sz + 2, 0, 7); ctx.stroke();
      }
    }
    // trains (stored depot trains stay invisible until assigned to a line)
    for (const tr of st.trains) {
      if (!tr.alive) continue;
      const extra = tr.stored && tr._extraOn >= 0;
      if (tr.stored && !extra) continue;
      const line = st.lines[extra ? tr._extraOn : tr.line];
      if (!line || !line.alive || line.path.length < 2) continue;
      const t = clamp(extra ? (tr._extraPos || 0) : tr.pos, 0, line.path.length - 1.001);
      const i0 = Math.floor(t), f = t - i0;
      const a = hexCenterIdx(line.path[i0]), b = hexCenterIdx(line.path[Math.min(i0 + 1, line.path.length - 1)]);
      const x = lerp(a.x, b.x, f), y = lerp(a.y, b.y, f);
      const img = assetGet("train_" + tr.type);
      const co = st.companies[tr.co];
      if (img) ctx.drawImage(img, x - 6, y - 3, 12, 6);
      else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        // pixel-art locomotive: body block + roofline stripe + window row +
        // undercarriage/wheels, with a type-specific nose (shinkansen wedge,
        // steam stack + trailing smoke) and a pantograph for electrified stock.
        const tcfg = CFG.TRAINS[tr.type] || {};
        const isSteam = tr.type.startsWith("steam");
        const isShinkansen = tcfg.gauge === "standard";
        const isElec = !!tcfg.elec && !isSteam;
        const body = co ? co.color : "#cccccc";
        const roof = shadeColor(body, 35);
        const under = shadeColor(body, -45);
        const len = 4 + tr.cars * 1.1, half = len / 2, bh = 1.9;
        // undercarriage + pixel wheels
        ctx.fillStyle = under;
        ctx.fillRect(-half, bh - 0.3, len, 0.7);
        for (let wx = -half + 1; wx < half - 0.3; wx += 2.2) ctx.fillRect(wx, bh + 0.2, 1, 0.7);
        // main body block
        ctx.fillStyle = body;
        ctx.fillRect(-half, -bh, len, bh * 2);
        // roofline stripe
        ctx.fillStyle = roof;
        ctx.fillRect(-half, -bh, len, 0.7);
        // window row, roughly one block per car
        ctx.fillStyle = "#bfe6ff";
        const nWin = clamp(Math.round(tr.cars), 1, 8);
        for (let i = 0; i < nWin; i++) {
          ctx.fillRect(-half + (i + 0.5) * (len / nWin) - 0.6, -bh + 1.1, 1.2, 1);
        }
        // front nose, by type
        if (isShinkansen) {           // stepped aerodynamic wedge
          ctx.fillStyle = body;
          ctx.fillRect(half, -bh + 0.5, 1.3, bh * 2 - 1);
          ctx.fillRect(half + 1.3, -bh + 1.1, 1, bh * 2 - 2.2);
          ctx.fillRect(half + 2.3, -bh + 1.7, 0.7, bh * 2 - 3.4);
        } else if (isSteam) {         // smokestack near the front + trailing smoke puffs
          const sx = half - len * 0.18;
          ctx.fillStyle = "#2a2a2a";
          ctx.fillRect(sx - 0.6, -bh - 1.3, 1.2, 1.3);
          ctx.fillStyle = "#d8d8d8cc";
          ctx.fillRect(sx - 1.8, -bh - 2.6, 1.1, 1.1);
          ctx.fillRect(sx - 3.0, -bh - 3.6, 1.3, 1.3);
        }
        // pantograph for electrified stock (incl. shinkansen)
        if (isElec) {
          const px = half - len * 0.28;
          ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 0.35;
          ctx.beginPath();
          ctx.moveTo(px - 1.1, -bh); ctx.lineTo(px - 0.45, -bh - 1.1);
          ctx.lineTo(px + 0.45, -bh - 1.1); ctx.lineTo(px + 1.1, -bh);
          ctx.stroke();
        }
        // headlight + crisp outline
        ctx.fillStyle = "#fff6c0";
        ctx.fillRect(half - 0.4, -0.5, 0.6, 1);
        ctx.strokeStyle = "#1c1c1c"; ctx.lineWidth = 0.5;
        ctx.strokeRect(-half, -bh, len, bh * 2);
        ctx.restore();
      }
      // v0.5.9: a train held at a passing loop (waiting for an oncoming or
      // faster train on single track) shows a red home signal above it
      if (tr._held) {
        ctx.fillStyle = "#e03020";
        ctx.beginPath(); ctx.arc(x, y - 5.5, 1.4, 0, 7); ctx.fill();
        ctx.strokeStyle = "#1c1c1c"; ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.arc(x, y - 5.5, 1.4, 0, 7); ctx.stroke();
      }
    }
    // hover & persistent selection (Inspect)
    if (ui.hover >= 0) {
      tracePath(ctx, ui.hover % CFG.MAP_W, (ui.hover / CFG.MAP_W) | 0, 1);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5 / cam.zoom; ctx.stroke();
    }
    if (ui.selected >= 0) {
      tracePath(ctx, ui.selected % CFG.MAP_W, (ui.selected / CFG.MAP_W) | 0, 1.05);
      ctx.strokeStyle = "#7CFC9A"; ctx.lineWidth = 2.5 / cam.zoom; ctx.stroke();
      tracePath(ctx, ui.selected % CFG.MAP_W, (ui.selected / CFG.MAP_W) | 0, 0.85);
      ctx.strokeStyle = "#7CFC9A60"; ctx.lineWidth = 1.5 / cam.zoom; ctx.stroke();
    }
    ctx.restore();

    // ---- day/night tint: smooth cosine over the ~43-second day, darkest
    // at midnight (frac 0/1), fully clear at noon — no flashing ----
    const f = st.time.frac;
    const night = Math.pow((1 + Math.cos(2 * Math.PI * f)) / 2, 1.5) * 0.38;
    if (night > 0.01) {
      ctx.fillStyle = "rgba(8,14,38," + night.toFixed(3) + ")";
      ctx.fillRect(0, 0, view.w, view.h);
    }
    // warm dawn/dusk glow at the shoulders of the day
    const dusk = Math.max(0, 0.18 - Math.abs(((f + 0.75) % 1) - 0.5) * 2) +
                 Math.max(0, 0.18 - Math.abs(((f + 0.25) % 1) - 0.5) * 2);
    if (dusk > 0.01) {
      ctx.fillStyle = "rgba(255,140,60," + (dusk * 0.45).toFixed(3) + ")";
      ctx.fillRect(0, 0, view.w, view.h);
    }

    // demand-heatmap legend (screen space)
    if (ui.showDemand) {
      const bw = 150, bh = 12, bx = 12, by = view.h - 34;
      for (let px = 0; px < bw; px++) {
        const c = demandColor(px / (bw - 1));
        ctx.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
        ctx.fillRect(bx + px, by, 1, bh);
      }
      ctx.strokeStyle = "#1b232b"; ctx.lineWidth = 1; ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
      ctx.fillStyle = "#f4f1e4"; ctx.font = "11px monospace"; ctx.textAlign = "left";
      ctx.fillText("Demand: low", bx, by - 4);
      ctx.textAlign = "right"; ctx.fillText("high", bx + bw, by - 4);
      ctx.textAlign = "left";
    }
  }

  return { cam, view, resize, drawFrame, pickHex, screenToWorld, redrawBase };
}
