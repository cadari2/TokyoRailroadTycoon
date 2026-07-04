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

/* Era visual tints applied over terrain colors (subtle period mood). */
const ERA_TINT = {
  meiji: "#d8c49a", taisho: "#d8cdb0", showa1: "#cccccc",
  showa2: "#d9d9e2", heisei: "#dde4ea", reiwa: "#e2eaf2",
};

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
 *  the silhouette so the periods still read apart. */
function drawConsGlyph(c, h, x, y, era) {
  const cim = assetGet("cons_" + h.cons + "_" + era);
  if (cim) { c.drawImage(cim, x - 11, y - 11, 22, 22); return; }
  const cons = CFG.CONS[h.cons];
  const dev = Math.max(1, Math.min(5, h.dev || 1));
  const g = 0.9 + dev * 0.05;               // denser hexes draw a touch larger
  const ei = eraIndex(era);
  c.save();
  c.lineJoin = "miter"; c.lineCap = "butt";
  switch (h.cons) {
    case "rice": { // broad flat paddy field filling the hex
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
      inkRect(c, x - bw / 2, y - 1, bw, bh, cons.color);
      c.fillStyle = cons.accent;                       // roof
      c.beginPath();
      c.moveTo(x - bw / 2 - 2, y - 1); c.lineTo(x, y - 8 * g); c.lineTo(x + bw / 2 + 2, y - 1); c.closePath();
      c.fill(); c.strokeStyle = CONS_INK; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = CONS_INK; c.fillRect(x - 1.5, y + bh - 4, 3, 4);   // door
      break;
    }
    case "apartment": { // tall tower with a window grid — taller in later eras
      const w = 12 * g, hgt = (13 + ei * 1.4) * g, top = y - hgt * 0.62;
      inkRect(c, x - w / 2, top, w, hgt, cons.color);
      c.fillStyle = cons.accent;                       // windows
      const rows = Math.round(hgt / 3.4);
      for (let r = 0; r < rows; r++) for (let col = 0; col < 3; col++) {
        c.fillRect(x - w / 2 + 1.6 + col * (w - 3.2) / 3, top + 2 + r * (hgt - 3) / rows, (w - 3.2) / 3 - 1.2, 1.8);
      }
      break;
    }
    case "shop": { // wide storefront under a bold striped awning
      const w = 17 * g, hgt = 8 * g;
      inkRect(c, x - w / 2, y - hgt / 2 + 1.5, w, hgt, cons.color);
      c.fillStyle = cons.accent;                       // awning
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
    // subtle era tint
    c.fillStyle = ERA_TINT[era] + "18";
    c.fill();
    // terrain-specific texture (grass tufts, hachures, peaks, reeds, ripples, stonework, channels…)
    drawTerrainPattern(c, h.terrain, x, y, terr.accent, seed);
    // crisp hex border so adjacent tiles read apart, tile-grid style
    traceHexPath(c, col, row, 0.98);
    c.strokeStyle = shadeColor(terr.color, -18) + "a0";
    c.lineWidth = 0.8;
    c.stroke();
  }
  // construction glyph (placeholder shapes; replace via assets)
  if (h.cons && !h.track) drawConsGlyph(c, h, x, y, era);
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
  // pass 2: ballast roadbed (dark casing in tunnels)
  c.strokeStyle = h.track.tunnel ? "#3a3a46" : "#6e675e";
  c.lineWidth = 5;
  for (const s of segs) { c.beginPath(); c.moveTo(x, y); c.lineTo(s.mx, s.my); c.stroke(); }
  // pass 3: crossties + one pair of steel rails PER GAUGE, spread side-by-side
  // (two gauges share the hex but never connect — see addGauge/changeGauge)
  const tieHalf = N > 1 ? 3.4 : 2.6;
  for (const s of segs) {
    const dx = s.mx - x, dy = s.my - y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    c.strokeStyle = "#46362a"; c.lineWidth = 1.1; c.setLineDash([]);
    c.beginPath();
    for (let t = 1.6; t < len - 0.5; t += 3.1) {
      const cx = x + ux * t, cy = y + uy * t;
      c.moveTo(cx - px * tieHalf, cy - py * tieHalf);
      c.lineTo(cx + px * tieHalf, cy + py * tieHalf);
    }
    c.stroke();
    rails.forEach((rail, r) => {
      const mid = N > 1 ? (r - (N - 1) / 2) * 2.3 : 0;   // lateral offset of this rail-pair
      const gpx = rail.gauge === "standard" ? 2.1 : rail.gauge === "industrial" ? 1.1 : 1.6;
      if (rail.building) { c.strokeStyle = "#a89f94"; c.lineWidth = 0.8; c.setLineDash([2, 2]); }
      else { c.strokeStyle = h.track.dmg > 0 ? "#d04030" : "#d8d2c4"; c.lineWidth = 0.9; c.setLineDash([]); }
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
  if (h.track.dmg > 0) {     // damage marker
    c.strokeStyle = "#e03020"; c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4);
    c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4);
    c.stroke();
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
      if (job.kind === "demolish" || job.kind === "gauge" || job.kind === "stationdemo") {
        const i = job.hex;
        tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.7);
        ctx.strokeStyle = job.kind === "gauge" ? "#d8b23a" : "#c0392b"; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
        ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      for (let k = job.done; k < job.hexes.length; k++) {
        const i = job.hexes[k];
        tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.7);
        ctx.strokeStyle = co.color; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
        ctx.stroke(); ctx.setLineDash([]);
      }
    }

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
    // trains
    for (const tr of st.trains) {
      if (!tr.alive) continue;
      const line = st.lines[tr.line];
      if (!line || !line.alive || line.path.length < 2) continue;
      const t = clamp(tr.pos, 0, line.path.length - 1.001);
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
