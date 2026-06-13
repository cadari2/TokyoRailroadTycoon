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

/** Terrain-specific texture overlay (drawn in the terrain's accent color) so each type reads apart at a glance. */
function drawTerrainPattern(c, terrain, x, y, accent, seed) {
  c.save();
  clipHexAt(c, x, y, 1);
  c.strokeStyle = accent; c.fillStyle = accent;
  switch (terrain) {
    case "grass": // scattered tufts of grass blades
      c.globalAlpha = 0.6; c.lineWidth = 0.9;
      for (let i = 0; i < 5; i++) {
        const bx = x + (hexHash2(seed, i) - 0.5) * HEX_W * 0.8;
        const by = y + (hexHash2(seed, i + 10) - 0.5) * HEX_H * 0.8;
        c.beginPath();
        c.moveTo(bx, by + 2.5); c.lineTo(bx - 1.2, by - 2);
        c.moveTo(bx, by + 2.5); c.lineTo(bx + 1.5, by - 1.8);
        c.stroke();
      }
      break;
    case "hill": // diagonal hachure lines (slope shading)
      c.globalAlpha = 0.35; c.lineWidth = 1.1;
      for (let t = -14; t <= 14; t += 4.5) {
        c.beginPath(); c.moveTo(x - 11, y + t - 5); c.lineTo(x + 11, y + t + 5); c.stroke();
      }
      break;
    case "mountain": // jagged peaks with snow caps
      c.globalAlpha = 0.9;
      c.beginPath();
      c.moveTo(x - 11, y + 10); c.lineTo(x - 2, y - 9); c.lineTo(x + 5, y + 1); c.lineTo(x + 11, y - 10); c.lineTo(x + 12, y + 10);
      c.closePath(); c.fill();
      c.fillStyle = "#f4f8ff"; c.globalAlpha = 0.95;
      c.beginPath(); c.moveTo(x - 4.5, y - 4.5); c.lineTo(x - 2, y - 9); c.lineTo(x + 0.5, y - 4); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x + 8.5, y - 5.5); c.lineTo(x + 11, y - 10); c.lineTo(x + 13, y - 5); c.closePath(); c.fill();
      break;
    case "swamp": // reed clusters + mud patch
      c.globalAlpha = 0.55; c.lineWidth = 1;
      for (const [dx, dy] of [[-6, -3], [5, 4]]) {
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(x + dx + i * 1.6, y + dy + 3);
          c.quadraticCurveTo(x + dx + i * 1.6 + 1, y + dy, x + dx + i * 1.6, y + dy - 3);
          c.stroke();
        }
      }
      c.globalAlpha = 0.3;
      c.beginPath(); c.ellipse(x + 1, y + 6, 4, 1.6, 0, 0, 7); c.fill();
      break;
    case "river": // horizontal ripple waves
      c.globalAlpha = 0.6; c.lineWidth = 1.3;
      for (const dy of [-5, 0, 5]) {
        c.beginPath();
        c.moveTo(x - 11, y + dy);
        c.quadraticCurveTo(x - 4, y + dy - 3, x, y + dy);
        c.quadraticCurveTo(x + 4, y + dy + 3, x + 11, y + dy);
        c.stroke();
      }
      break;
    case "moat": // ring of stone blocks around the hex edge
      c.globalAlpha = 0.55; c.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        const bx = x + HEX_SIZE * 0.78 * Math.cos(a), by = y + HEX_SIZE * 0.78 * Math.sin(a);
        c.strokeRect(bx - 2, by - 1.5, 4, 3);
      }
      break;
    case "canal": // straight channel banks + flow ticks
      c.globalAlpha = 0.6; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - 11, y - 4); c.lineTo(x + 11, y - 4); c.stroke();
      c.beginPath(); c.moveTo(x - 11, y + 4); c.lineTo(x + 11, y + 4); c.stroke();
      c.lineWidth = 0.8; c.globalAlpha = 0.4;
      for (let t = -8; t <= 8; t += 4) {
        c.beginPath(); c.moveTo(x + t, y - 4); c.lineTo(x + t, y + 4); c.stroke();
      }
      break;
  }
  c.restore();
}

/** Procedural construction glyph (uses the CONS color + accent) for the placeholder-art path. */
function drawConsGlyph(c, h, x, y, era) {
  const cim = assetGet("cons_" + h.cons + "_" + era);
  if (cim) { c.drawImage(cim, x - 8, y - 8, 16, 16); return; }
  const cons = CFG.CONS[h.cons];
  const s = 3 + h.dev * 1.1;
  c.save();
  c.fillStyle = cons.color;
  switch (h.cons) {
    case "rice": // paddy grid
      c.globalAlpha = 0.6; c.fillRect(x - 6, y - 3.5, 12, 7); c.globalAlpha = 1;
      c.strokeStyle = cons.accent; c.lineWidth = 0.6; c.globalAlpha = 0.7;
      for (let i = -6; i <= 6; i += 3) { c.beginPath(); c.moveTo(x + i, y - 3.5); c.lineTo(x + i, y + 3.5); c.stroke(); }
      for (let j = -3; j <= 3; j += 3) { c.beginPath(); c.moveTo(x - 6, y + j); c.lineTo(x + 6, y + j); c.stroke(); }
      break;
    case "road": // dashed centerline
      c.fillRect(x - 7, y - 1.6, 14, 3.2);
      c.strokeStyle = cons.accent; c.lineWidth = 0.6; c.setLineDash([1.5, 1.5]);
      c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.stroke();
      break;
    case "house": // walls + pitched roof
      c.fillRect(x - s / 2, y - s / 2 + 1, s, s);
      c.fillStyle = cons.accent;
      c.beginPath(); c.moveTo(x - s / 2 - 0.6, y - s / 2 + 1); c.lineTo(x, y - s); c.lineTo(x + s / 2 + 0.6, y - s / 2 + 1); c.closePath(); c.fill();
      break;
    case "apartment": // tower + window grid
      c.fillRect(x - s / 2, y - s, s, s * 1.6);
      c.fillStyle = cons.accent;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
        c.fillRect(x - s / 2 + 1 + col * (s / 2 - 0.5), y - s + 1 + row * (s * 1.6 / 3), s / 2 - 1.2, s * 1.6 / 3 - 1);
      }
      break;
    case "shop": // storefront + awning stripes
      c.fillRect(x - s, y - s / 2, s * 2, s);
      c.fillStyle = cons.accent;
      for (let i = -s; i < s; i += s / 2.5) c.fillRect(x + i, y - s / 2 - 1.6, s / 2.5 - 0.5, 1.8);
      break;
    case "school": // building + flagpole
      c.fillRect(x - s, y - s / 2, s * 2, s);
      c.strokeStyle = cons.accent; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x, y - s / 2); c.lineTo(x, y - s * 1.7); c.stroke();
      c.fillStyle = cons.accent;
      c.beginPath(); c.moveTo(x, y - s * 1.7); c.lineTo(x + s * 0.9, y - s * 1.45); c.lineTo(x, y - s * 1.2); c.closePath(); c.fill();
      break;
    case "civic": // building + emblem badge
      c.fillRect(x - s, y - s / 2, s * 2, s);
      c.fillStyle = cons.accent;
      c.beginPath(); c.arc(x, y, s * 0.45, 0, 7); c.fill();
      break;
  }
  c.restore();
}

function makeRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const worldW = HEX_W * (CFG.MAP_W + 1), worldH = HEX_H * CFG.MAP_H + HEX_SIZE * 2;
  const base = document.createElement("canvas");
  base.width = Math.ceil(worldW); base.height = Math.ceil(worldH);
  const bctx = base.getContext("2d");
  const cam = { x: worldW / 2, y: worldH / 2, zoom: 1.1 };

  function tracePath(c, col, row, scale) {
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

  /** Redraw the cached terrain + constructions + track layer. */
  function redrawBase(st) {
    const era = eraOf(st.time.year).key;
    bctx.fillStyle = "#26303a";
    bctx.fillRect(0, 0, base.width, base.height);
    for (let r = 0; r < CFG.MAP_H; r++) {
      for (let c = 0; c < CFG.MAP_W; c++) {
        const h = st.hexes[hexIdx(c, r)];
        const terr = CFG.TERRAIN[h.terrain];
        const img = assetGet("tile_" + h.terrain + "_" + era);
        const { x, y } = hexCenter(c, r);
        const seed = hexHash(c, r);
        if (img) {
          bctx.drawImage(img, x - HEX_W / 2, y - HEX_SIZE, HEX_W, HEX_SIZE * 2);
        } else {
          tracePath(bctx, c, r, 0.98);
          // per-hex brightness variance so same-terrain tiles don't look like a flat repeated stamp
          bctx.fillStyle = shadeColor(terr.color, (seed - 0.5) * 10);
          bctx.fill();
          // subtle era tint
          bctx.fillStyle = ERA_TINT[era] + "18";
          bctx.fill();
          // terrain-specific texture (grass tufts, hachures, peaks, reeds, ripples, stonework, channels…)
          drawTerrainPattern(bctx, h.terrain, x, y, terr.accent, seed);
          // thin hex border so adjacent tiles read apart
          tracePath(bctx, c, r, 0.98);
          bctx.strokeStyle = shadeColor(terr.color, -18) + "70";
          bctx.lineWidth = 0.6;
          bctx.stroke();
        }
        // construction glyph (placeholder shapes; replace via assets)
        if (h.cons && !h.track) drawConsGlyph(bctx, h, x, y, era);
      }
    }
    // track layer: ballast + crossties + twin steel rails through the six
    // sides where the same company has track, with a company-color halo
    for (let i = 0; i < st.hexes.length; i++) {
      const h = st.hexes[i];
      if (!h.track) continue;
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
      const gaugePx = h.track.gauge === "standard" ? 2.1 : h.track.gauge === "industrial" ? 1.1 : 1.6;
      // pass 1: company-color halo (ownership readable at a glance)
      bctx.strokeStyle = (co ? co.color : "#999") + "70";
      bctx.lineWidth = 7.5; bctx.lineCap = "round";
      for (const s of segs) { bctx.beginPath(); bctx.moveTo(x, y); bctx.lineTo(s.mx, s.my); bctx.stroke(); }
      // pass 2: ballast roadbed (dark casing in tunnels)
      bctx.strokeStyle = h.track.tunnel ? "#3a3a46" : "#6e675e";
      bctx.lineWidth = 5;
      for (const s of segs) { bctx.beginPath(); bctx.moveTo(x, y); bctx.lineTo(s.mx, s.my); bctx.stroke(); }
      // pass 3: crossties + rails per segment
      for (const s of segs) {
        const dx = s.mx - x, dy = s.my - y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, px = -uy, py = ux;
        bctx.strokeStyle = "#46362a"; bctx.lineWidth = 1.1;
        bctx.beginPath();
        for (let t = 1.6; t < len - 0.5; t += 3.1) {
          const cx = x + ux * t, cy = y + uy * t;
          bctx.moveTo(cx - px * 2.6, cy - py * 2.6);
          bctx.lineTo(cx + px * 2.6, cy + py * 2.6);
        }
        bctx.stroke();
        bctx.strokeStyle = h.track.dmg > 0 ? "#d04030" : "#d8d2c4";
        bctx.lineWidth = 0.9;
        for (const side of [-1, 1]) {
          bctx.beginPath();
          bctx.moveTo(x + px * gaugePx * side, y + py * gaugePx * side);
          bctx.lineTo(s.mx + px * gaugePx * side, s.my + py * gaugePx * side);
          bctx.stroke();
        }
      }
      if (!segs.length) {       // isolated stub: buffer-stop dot
        bctx.fillStyle = co ? co.color : "#999";
        bctx.beginPath(); bctx.arc(x, y, 3, 0, 7); bctx.fill();
        bctx.strokeStyle = "#d8d2c4"; bctx.lineWidth = 1;
        bctx.beginPath(); bctx.arc(x, y, 3, 0, 7); bctx.stroke();
      }
      if (h.track.dmg > 0) {     // damage marker
        bctx.strokeStyle = "#e03020"; bctx.lineWidth = 1.6;
        bctx.beginPath();
        bctx.moveTo(x - 4, y - 4); bctx.lineTo(x + 4, y + 4);
        bctx.moveTo(x + 4, y - 4); bctx.lineTo(x - 4, y + 4);
        bctx.stroke();
      }
      if (h.track.elec) {        // catenary mast hint
        bctx.strokeStyle = "#ffe9a0"; bctx.lineWidth = 1;
        bctx.beginPath(); bctx.moveTo(x + 4, y - 1); bctx.lineTo(x + 4, y - 5); bctx.stroke();
      }
    }
    st.renderDirty = false;
  }

  function worldToScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.zoom + canvas.width / 2, y: (wy - cam.y) * cam.zoom + canvas.height / 2 };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - canvas.width / 2) / cam.zoom + cam.x, y: (sy - canvas.height / 2) / cam.zoom + cam.y };
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

  function drawFrame(st, ui) {
    if (st.renderDirty) redrawBase(st);
    ctx.fillStyle = "#1b232b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(base, 0, 0);

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
    }
    // construction in progress: hatched hexes
    for (const job of st.builds) {
      const co = st.companies[job.co];
      for (let k = job.done; k < job.hexes.length; k++) {
        const i = job.hexes[k];
        tracePath(ctx, i % CFG.MAP_W, (i / CFG.MAP_W) | 0, 0.7);
        ctx.strokeStyle = co.color; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
        ctx.stroke(); ctx.setLineDash([]);
      }
    }

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
      const img = assetGet("station_l" + s.level);
      const sz = 5 + s.level * 2;
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
      if (cam.zoom >= 1.6) {
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
        ctx.fillStyle = co ? co.color : "#ccc";
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8;
        const len = 4 + tr.cars * 1.1;
        ctx.fillRect(-len / 2, -2.2, len, 4.4);
        ctx.strokeRect(-len / 2, -2.2, len, 4.4);
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
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // warm dawn/dusk glow at the shoulders of the day
    const dusk = Math.max(0, 0.18 - Math.abs(((f + 0.75) % 1) - 0.5) * 2) +
                 Math.max(0, 0.18 - Math.abs(((f + 0.25) % 1) - 0.5) * 2);
    if (dusk > 0.01) {
      ctx.fillStyle = "rgba(255,140,60," + (dusk * 0.45).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  return { cam, drawFrame, pickHex, screenToWorld, redrawBase };
}
