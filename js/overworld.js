/* =========================================================================
 * overworld.js — The start-screen world map (v0.6.1).
 *
 * A chunky pixel-art world (continents rasterized from a few dozen rough
 * lon/lat outlines into a 96×48 grid, 8-bit style) with the five campaign
 * cities pinned on it. A dotted "voyage" line traces the unlock journey
 * Tokyo → London → New York → Melbourne (Paris sits apart: it is earned by
 * achievements). Unlocked cities glow and can be picked; locked ones are
 * grey with their unlock condition shown on selection. Browser-only.
 * ========================================================================= */
"use strict";

// Rough continental outlines, [lon, lat] — deliberately coarse: at 3.75° a
// cell only the silhouettes matter.
const OW_POLYS = [
  // North America
  [[-168,66],[-162,70],[-140,70],[-125,72],[-95,72],[-80,74],[-62,66],[-55,52],[-66,45],[-70,42],[-76,35],[-81,31],[-80,25],[-82,27],[-90,29],[-97,26],[-97,20],[-88,21],[-87,15],[-83,9],[-78,8],[-85,11],[-92,15],[-105,20],[-110,23],[-115,30],[-118,34],[-124,40],[-124,48],[-130,55],[-140,60],[-150,60],[-158,58],[-165,62]],
  // Greenland
  [[-50,60],[-42,60],[-20,70],[-18,80],[-40,83],[-60,80],[-70,78],[-55,70]],
  // South America
  [[-78,8],[-72,12],[-60,10],[-50,0],[-35,-5],[-39,-15],[-48,-25],[-58,-35],[-65,-42],[-68,-55],[-75,-50],[-73,-40],[-71,-30],[-70,-18],[-76,-12],[-81,-5],[-80,0]],
  // Eurasia
  [[-10,36],[-9,43],[-2,44],[-5,48],[2,51],[8,54],[10,58],[5,62],[15,69],[28,71],[40,67],[60,70],[80,73],[100,77],[120,73],[140,72],[180,69],[180,63],[163,60],[157,51],[143,59],[135,54],[141,46],[130,42],[127,35],[122,40],[121,31],[122,25],[110,20],[108,12],[104,9],[100,13],[103,1],[98,8],[94,18],[88,22],[80,15],[77,8],[72,20],[67,25],[57,25],[50,30],[36,34],[36,36],[27,37],[26,40],[23,36],[20,40],[16,38],[12,44],[8,44],[3,43],[-1,37]],
  // Arabia
  [[35,28],[39,22],[43,13],[52,17],[59,22],[56,26],[50,30],[48,30],[36,33]],
  // Africa
  [[-17,21],[-10,30],[-5,36],[10,37],[20,31],[32,31],[35,28],[43,12],[51,12],[40,-2],[40,-15],[35,-24],[32,-29],[20,-35],[17,-30],[12,-17],[13,-5],[9,4],[-5,5],[-12,8],[-17,15]],
  // Madagascar
  [[44,-25],[49,-12],[50,-16],[47,-25]],
  // Great Britain & Ireland
  [[-5,50],[1,51],[2,53],[-3,56],[-2,58],[-5,58],[-6,56],[-3,54],[-5,52]],
  [[-10,52],[-6,52],[-6,55],[-10,54]],
  // Japan (Honshū–Kyūshū, Hokkaidō)
  [[130,31],[132,34],[135,34],[140,35],[141,38],[142,41],[140,41],[139,38],[136,37],[133,35],[130,33]],
  [[140,42],[145,43],[143,45],[141,45]],
  // Maritime SE Asia & New Guinea
  [[109,1],[117,7],[119,1],[116,-4],[110,-3]],
  [[95,5],[106,-6],[102,-4]],
  [[131,-1],[141,-3],[150,-10],[141,-9]],
  // Australia, Tasmania, New Zealand
  [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-26],[151,-33],[147,-38],[140,-38],[135,-35],[129,-32],[115,-34]],
  [[144.5,-40.5],[148.5,-40.5],[147,-43.5]],
  [[172,-34],[178,-38],[174,-41],[171,-44],[167,-46],[172,-41]],
];
const OW_CITIES = {
  tokyo:     { lon: 139.7, lat: 35.7,  dx: 6,   dy: -6 },
  london:    { lon: -0.1,  lat: 51.5,  dx: -44, dy: -8 },
  nyc:       { lon: -74.0, lat: 40.7,  dx: 6,   dy: 12 },
  melbourne: { lon: 145.0, lat: -37.8, dx: -78, dy: 12 },
  paris:     { lon: 2.35,  lat: 48.85, dx: 6,   dy: 12 },
};
const OW_W = 96, OW_H = 48, OW_CELL = 4;

function owInPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
let OW_MASK = null;
function owMask() {
  if (OW_MASK) return OW_MASK;
  OW_MASK = new Uint8Array(OW_W * OW_H);
  for (let y = 0; y < OW_H; y++) for (let x = 0; x < OW_W; x++) {
    const lon = -180 + (x + 0.5) * 360 / OW_W, lat = 90 - (y + 0.5) * 180 / OW_H;
    let land = lat < -68;                                  // Antarctica
    for (const poly of OW_POLYS) if (!land && owInPoly(lon, lat, poly)) land = true;
    OW_MASK[y * OW_W + x] = land ? 1 : 0;
  }
  return OW_MASK;
}
const owPx = (lon, lat) => ({ x: (lon + 180) / 360 * OW_W * OW_CELL, y: (90 - lat) / 180 * OW_H * OW_CELL });

/** Build the overworld widget. opts: { isUnlocked(key), lockHint(key),
 *  onStart(key), selected } → a DOM element. */
function buildOverworld(opts) {
  const wrap = el("div", "overworld");
  const cv = el("canvas", "owCanvas");
  cv.width = OW_W * OW_CELL; cv.height = OW_H * OW_CELL;
  wrap.appendChild(cv);
  const info = el("div", "owInfo");
  wrap.appendChild(info);
  let sel = opts.selected || "tokyo", t0 = Date.now(), raf = null;

  function draw() {
    const c = cv.getContext && cv.getContext("2d");
    if (!c) return;
    const mask = owMask(), tick = Math.floor((Date.now() - t0) / 400);
    for (let y = 0; y < OW_H; y++) for (let x = 0; x < OW_W; x++) {
      const land = mask[y * OW_W + x];
      const polar = y < 5 || y > OW_H - 6;
      let col;
      if (land) {
        const coast = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => {
          const nx = (x + dx + OW_W) % OW_W, ny = y + dy;
          return ny >= 0 && ny < OW_H && !mask[ny * OW_W + nx];
        });
        col = polar ? "#dfe8ec" : coast ? "#8aa855" : ((x * 7 + y * 13) % 5 === 0 ? "#5f8a3e" : "#6d9a47");
        if (!polar && y > 17 && y < 26 && (x * 3 + y) % 4 === 0) col = "#a89a5a";   // desert/savanna belt
      } else {
        col = ((x + y) & 1) ? "#1d4f7a" : "#21578a";
        if ((x * 5 + y * 3 + tick) % 23 === 0) col = "#3a7ab0";               // glinting waves
      }
      c.fillStyle = col; c.fillRect(x * OW_CELL, y * OW_CELL, OW_CELL, OW_CELL);
    }
    // the voyage: the unlock chain, dotted
    const chain = ["tokyo", "london", "nyc", "melbourne"];
    c.setLineDash([3, 4]); c.lineWidth = 1.5;
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = OW_CITIES[chain[i]], b = OW_CITIES[chain[i + 1]];
      const pa = owPx(a.lon, a.lat), pb = owPx(b.lon, b.lat);
      c.strokeStyle = opts.isUnlocked(chain[i + 1]) ? "rgba(255,227,120,0.9)" : "rgba(200,200,200,0.35)";
      c.beginPath(); c.moveTo(pa.x, pa.y);
      // gentle arc over the sea
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 - 18;
      c.quadraticCurveTo(mx, my, pb.x, pb.y); c.stroke();
    }
    c.setLineDash([]);
    // city pins
    c.font = "bold 10px monospace"; c.textBaseline = "middle";
    for (const key of Object.keys(OW_CITIES)) {
      if (!CFG.CAMPAIGNS[key]) continue;
      const city = OW_CITIES[key], p = owPx(city.lon, city.lat);
      const open = opts.isUnlocked(key), isSel = key === sel;
      const blink = isSel && (tick & 1);
      c.fillStyle = "#101418"; c.fillRect(p.x - 4, p.y - 4, 9, 9);
      c.fillStyle = open ? (blink ? "#fff6c0" : "#ffd84a") : "#8a8f94";
      c.fillRect(p.x - 3, p.y - 3, 7, 7);
      if (isSel) { c.strokeStyle = "#fff"; c.lineWidth = 1; c.strokeRect(p.x - 6.5, p.y - 6.5, 14, 14); }
      const label = (open ? "" : "🔒") + CFG.CAMPAIGNS[key].title;
      c.fillStyle = "rgba(10,14,18,0.7)";
      const m = c.measureText && c.measureText(label);
      const w = (m && m.width) || label.length * 6;
      c.fillRect(p.x + city.dx - 2, p.y + city.dy - 7, w + 4, 13);
      c.fillStyle = open ? "#ffe9a0" : "#b8bec4";
      c.fillText(label, p.x + city.dx, p.y + city.dy);
    }
  }
  function renderInfo() {
    info.textContent = "";
    const spec = CFG.CAMPAIGNS[sel];
    if (!spec) return;
    const open = opts.isUnlocked(sel);
    info.appendChild(el("div", "owTitle", (open ? "🚂 " : "🔒 ") + spec.title + " — " + (OW_BLURB[sel] || "")));
    if (open) info.appendChild(btn("Start — " + spec.startLabel, "ubtn go", () => opts.onStart(sel)));
    else info.appendChild(el("div", "dim small", "Locked. To unlock: " + opts.lockHint(sel) + "."));
  }
  cv.addEventListener("click", e => {
    const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { left: 0, top: 0, width: cv.width, height: cv.height };
    const sx = (e.clientX - r.left) * cv.width / (r.width || cv.width), sy = (e.clientY - r.top) * cv.height / (r.height || cv.height);
    let best = null, bd = 22 * 22;
    for (const key of Object.keys(OW_CITIES)) {
      const p = owPx(OW_CITIES[key].lon, OW_CITIES[key].lat);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = key; }
    }
    if (best) { sel = best; renderInfo(); draw(); }
  });
  draw(); renderInfo();
  // gentle animation (blinking pin, glinting sea) while the start screen shows
  if (typeof setInterval === "function") {
    const iv = setInterval(() => {
      if (!wrap.isConnected && wrap.isConnected !== undefined) { clearInterval(iv); return; }
      const ss = document.getElementById("startScreen");
      if (ss && ss.classList.contains("hidden")) return;       // in game: don't burn frames
      draw();
    }, 400);
  }
  wrap._select = (key) => { sel = key; renderInfo(); draw(); };
  return wrap;
}

const OW_BLURB = {
  tokyo: "1872: Japan's first railway is about to open. Build the network that makes a megacity.",
  london: "1872: the world's first Underground is nine years old. Thread the Thames and the turnpikes.",
  nyc: "1872: horsecars and the first elevated line. Tame Manhattan, the rivers and the Gilded Age.",
  melbourne: "1872: Marvellous Melbourne, gold-rush rich, on the banks of the Yarra.",
  paris: "1872: Haussmann's boulevards, a Seine to bridge, and a Métro still thirty years away.",
};
