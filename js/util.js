/* =========================================================================
 * util.js — seeded RNG, value noise, heap, formatting helpers.
 * ========================================================================= */
"use strict";

/** Deterministic RNG (mulberry32). State is a single uint32 kept in `s.n`. */
function makeRng(seed) {
  return { n: seed >>> 0 };
}
function rnd(rng) {
  rng.n = (rng.n + 0x6D2B79F5) >>> 0;
  let t = rng.n;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rndInt(rng, lo, hi) { return lo + Math.floor(rnd(rng) * (hi - lo + 1)); }
function rndPick(rng, arr) { return arr[Math.floor(rnd(rng) * arr.length)]; }

/** 2D value noise with a few octaves; deterministic from seed. */
function makeNoise(seed) {
  const rng = makeRng(seed);
  const grid = new Float32Array(64 * 64);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd(rng);
  function at(x, y) {
    const xi = Math.floor(x) & 63, yi = Math.floor(y) & 63;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const g = (X, Y) => grid[(Y & 63) * 64 + (X & 63)];
    const a = g(xi, yi) + sx * (g(xi + 1, yi) - g(xi, yi));
    const b = g(xi, yi + 1) + sx * (g(xi + 1, yi + 1) - g(xi, yi + 1));
    return a + sy * (b - a);
  }
  return (x, y) => 0.55 * at(x, y) + 0.3 * at(x * 2.13, y * 2.13) + 0.15 * at(x * 4.7, y * 4.7);
}

/** Tiny binary min-heap for A-star / Dijkstra. Items are [priority, value]. */
function makeHeap() {
  const a = [];
  return {
    size: () => a.length,
    push(p, v) {
      a.push([p, v]);
      let i = a.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1;
        if (a[par][0] <= a[i][0]) break;
        [a[par], a[i]] = [a[i], a[par]]; i = par;
      }
    },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    },
  };
}

/** ¥ formatting with grouping; large values abbreviated. */
function fmtYen(v) {
  const neg = v < 0; v = Math.abs(Math.round(v));
  let s;
  if (v >= 1e12) s = (v / 1e12).toFixed(2) + "T";
  else if (v >= 1e9) s = (v / 1e9).toFixed(2) + "B";
  else if (v >= 1e6) s = (v / 1e6).toFixed(2) + "M";
  else s = v.toLocaleString("en-US");
  return (neg ? "-¥" : "¥") + s;
}
function fmtNum(v) { return Math.round(v).toLocaleString("en-US"); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Japanese era-year label, e.g. "Meiji 5" for 1872. */
function eraYearLabel(year) {
  if (year >= 2019) return "Reiwa " + (year - 2018);
  if (year >= 1989) return "Heisei " + (year - 1988);
  if (year >= 1926) return "Showa " + (year - 1925);
  if (year >= 1912) return "Taisho " + (year - 1911);
  return "Meiji " + (year - 1867);
}
function seasonOf(day) {
  if (day < 60 || day >= 335) return "Winter";
  if (day < 152) return "Spring";
  if (day < 244) return "Summer";
  return "Autumn";
}
