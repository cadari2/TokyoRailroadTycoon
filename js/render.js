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
        const img = assetGet("tile_" + h.terrain + "_" + era);
        const { x, y } = hexCenter(c, r);
        if (img) {
          bctx.drawImage(img, x - HEX_W / 2, y - HEX_SIZE, HEX_W, HEX_SIZE * 2);
        } else {
          tracePath(bctx, c, r, 0.98);
          bctx.fillStyle = CFG.TERRAIN[h.terrain].color;
          bctx.fill();
          // subtle era tint
          bctx.fillStyle = ERA_TINT[era] + "18";
          bctx.fill();
        }
        // construction glyph (placeholder shapes; replace via assets)
        if (h.cons && !h.track) {
          const cim = assetGet("cons_" + h.cons + "_" + era);
          if (cim) bctx.drawImage(cim, x - 8, y - 8, 16, 16);
          else {
            bctx.fillStyle = CFG.CONS[h.cons].color;
            const s = 3 + h.dev * 1.1;
            if (h.cons === "rice") { bctx.globalAlpha = 0.55; bctx.fillRect(x - 5, y - 3, 10, 6); bctx.globalAlpha = 1; }
            else if (h.cons === "road") { bctx.fillRect(x - 6, y - 1.5, 12, 3); }
            else if (h.cons === "apartment") { bctx.fillRect(x - s / 2, y - s, s, s * 1.6); }
            else if (h.cons === "shop") { bctx.fillRect(x - s, y - s / 2, s * 2, s); }
            else if (h.cons === "school" || h.cons === "civic") {
              bctx.fillRect(x - s, y - s / 2, s * 2, s);
              bctx.fillStyle = "#fff"; bctx.fillRect(x - 1, y - s / 2 - 2, 2, 2);
            } else { bctx.fillRect(x - s / 2, y - s / 2, s, s); } // house
          }
        }
      }
    }
    // track layer: connect through the six sides where same company has track
    for (let i = 0; i < st.hexes.length; i++) {
      const h = st.hexes[i];
      if (!h.track) continue;
      const co = st.companies[h.track.co];
      const { x, y } = hexCenterIdx(i);
      const col = i % CFG.MAP_W, row = (i / CFG.MAP_W) | 0;
      let links = 0;
      for (let d = 0; d < 6; d++) {
        const nb = hexNeighbor(col, row, d);
        if (nb < 0) continue;
        const nt = st.hexes[nb].track;
        if (!nt || nt.co !== h.track.co) continue;
        links++;
        const n = hexCenterIdx(nb);
        const mx = (x + n.x) / 2, my = (y + n.y) / 2;
        bctx.strokeStyle = h.track.tunnel ? "#3a3a44" : "#2e2a26";
        bctx.lineWidth = 5;
        bctx.beginPath(); bctx.moveTo(x, y); bctx.lineTo(mx, my); bctx.stroke();
        bctx.strokeStyle = h.track.dmg > 0 ? "#d04030" : (co ? co.color : "#999");
        bctx.lineWidth = h.track.gauge === "standard" ? 2.6 : 1.8;
        if (h.track.elec) bctx.setLineDash([]);
        bctx.beginPath(); bctx.moveTo(x, y); bctx.lineTo(mx, my); bctx.stroke();
      }
      if (!links) { // isolated stub
        bctx.fillStyle = co ? co.color : "#999";
        bctx.beginPath(); bctx.arc(x, y, 3, 0, 7); bctx.fill();
      }
      if (h.track.elec) { bctx.fillStyle = "#ffe9a0"; bctx.fillRect(x - 1, y - 1, 2, 2); }
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
    // track plan preview
    if (ui.plan && ui.plan.path) {
      ctx.strokeStyle = "#7CFC9A"; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ui.plan.path.forEach((i, k) => {
        const p = hexCenterIdx(i);
        k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.stroke(); ctx.setLineDash([]);
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
      if (img) ctx.drawImage(img, p.x - sz / 2, p.y - sz / 2, sz, sz);
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
    // hover & selection
    if (ui.hover >= 0) {
      tracePath(ctx, ui.hover % CFG.MAP_W, (ui.hover / CFG.MAP_W) | 0, 1);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5 / cam.zoom; ctx.stroke();
    }
    if (ui.trackStart >= 0) {
      tracePath(ctx, ui.trackStart % CFG.MAP_W, (ui.trackStart / CFG.MAP_W) | 0, 1);
      ctx.strokeStyle = "#7CFC9A"; ctx.lineWidth = 2.5 / cam.zoom; ctx.stroke();
    }
    ctx.restore();

    // ---- day/night tint (visualized days, commute rushes) ----
    const f = st.time.frac;
    let night = 0;
    if (f < 0.23 || f > 0.88) night = 0.32;
    else if (f < 0.3) night = 0.32 * (0.3 - f) / 0.07;
    else if (f > 0.8) night = 0.32 * (f - 0.8) / 0.08;
    if (night > 0.01) {
      ctx.fillStyle = "rgba(10,16,40," + night.toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  return { cam, drawFrame, pickHex, screenToWorld, redrawBase };
}
