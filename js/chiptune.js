/* =========================================================================
 * chiptune.js — A tiny WebAudio chiptune sequencer (v0.6.1) that gives the
 * campaigns without recorded music (New York, Melbourne, Paris) their own
 * period-flavoured placeholder BGM: 8-bit pulse lead, square comping,
 * triangle bass and noise drums, in the spirit of the NES/SNES tycoon games.
 *
 * Each song is DATA — tempo, metre, chord progression, a bass/comp style and
 * a seed. The melody is composed deterministically from the seed over the
 * chords (chord tones on strong beats, stepwise scale motion between, AABA
 * phrasing), so the same song always plays the same tune.
 *
 * A track quacks like the HTMLAudioElement audio.js already drives —
 * play() / pause() / .volume / .currentTime / .loop / .paused — so the era
 * crossfades, mute and the BGM volume bar all work unchanged. Referenced from
 * the manifest as "chip:<song key>". Replace any of them with a real
 * recording just by pointing the manifest slot at a file instead.
 * ========================================================================= */
"use strict";

const CHIP = { ctx: null, pulseWave: null, noise: null };

function chipCtx() {
  if (CHIP.ctx) return CHIP.ctx;
  const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { CHIP.ctx = new AC(); } catch (e) { return null; }
  const ac = CHIP.ctx;
  // 25% duty pulse — the classic NES lead timbre — as a Fourier series
  const N = 32, re = new Float32Array(N), im = new Float32Array(N), duty = 0.25;
  for (let n = 1; n < N; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  try { CHIP.pulseWave = ac.createPeriodicWave(re, im); } catch (e) { CHIP.pulseWave = null; }
  // one second of white noise for the drum channel
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff) - 1; }
  CHIP.noise = buf;
  return ac;
}

/* ---- tiny music theory --------------------------------------------------- */
const CHIP_NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const CHIP_QUAL = {
  "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  "6": [0, 4, 7, 9], m6: [0, 3, 7, 9], dim: [0, 3, 6, 9], aug: [0, 4, 8], sus: [0, 5, 7], "9": [0, 4, 7, 10, 14],
};
function chipChord(sym) {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(sym);
  const root = CHIP_NOTE[m[1]], q = CHIP_QUAL[m[2]] || CHIP_QUAL[""];
  return { root, tones: q.map(x => (root + x) % 12), bassTones: [root, (root + (q[2] || 7)) % 12] };
}
const CHIP_SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], blues: [0, 3, 5, 6, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11] };
const chipHz = midi => 440 * Math.pow(2, (midi - 69) / 12);
function chipRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ---- the songs ------------------------------------------------------------
 * bpm; beats per bar; key (tonic pitch class) & scale; prog = chords, one per
 * bar; bass: "oompah" | "walk" | "waltz" | "pedal" | "drive"; comp: rhythm of
 * chord stabs over the 8 eighth-note slots of a bar (x = stab); drums: kick/
 * snare/hat strings per eighth; swing: 0..0.33 delay on off-beat eighths;
 * lead: octave, rhythm density; seed. */
const CHIP_SONGS = {
  // ---- New York ----
  nyc_gilded: { title: "Bowery Rag", bpm: 112, beats: 4, key: 0, scale: "major", swing: 0.08,
    prog: ["C", "C", "A7", "A7", "D7", "G7", "C", "G7", "C", "C7", "F", "Fm6", "C", "A7", "D7", "G7"],
    bass: "oompah", comp: "..x...x.", drums: { k: "x...x...", s: "..x...x.", h: "xxxxxxxx" },
    lead: { oct: 5, density: 0.8 }, seed: 1872 },
  nyc_jazz: { title: "Elevated Swing", bpm: 132, beats: 4, key: 10, scale: "blues", swing: 0.3,
    prog: ["Bb7", "Eb7", "Bb7", "Bb7", "Eb7", "Eb7", "Bb7", "G7", "Cm7", "F7", "Bb7", "F7"],
    bass: "walk", comp: "x..x..x.", drums: { k: "x.......", s: "..x...x.", h: "x.xxx.xx" },
    lead: { oct: 5, density: 0.65 }, seed: 1925 },
  nyc_modern: { title: "Uptown Express", bpm: 118, beats: 4, key: 9, scale: "dorian", swing: 0,
    prog: ["Am7", "Am7", "D9", "D9", "Am7", "Am7", "Fmaj7", "E7"],
    bass: "drive", comp: ".x.x.x.x", drums: { k: "x..xx...", s: "..x...x.", h: "xxxxxxxx" },
    lead: { oct: 5, density: 0.7 }, seed: 1977 },
  // ---- Melbourne ----
  melb_marvellous: { title: "Marvellous Melbourne", bpm: 120, beats: 4, key: 7, scale: "major", swing: 0,
    prog: ["G", "G", "D7", "G", "C", "G", "A7", "D7", "G", "G7", "C", "A7", "G", "D7", "G", "G"],
    bass: "oompah", comp: "..x...x.", drums: { k: "x...x...", s: "..x...xx", h: "x.x.x.x." },
    lead: { oct: 5, density: 0.75 }, seed: 1880 },
  melb_federation: { title: "Federation Waltz", bpm: 150, beats: 3, key: 2, scale: "major", swing: 0,
    prog: ["D", "D", "A7", "A7", "A7", "A7", "D", "D", "D", "D7", "G", "G", "D", "A7", "D", "D"],
    bass: "waltz", comp: "..x.x.", drums: { k: "x.....", s: "..x.x.", h: "x.x.x." },
    lead: { oct: 5, density: 0.7 }, seed: 1901 },
  melb_modern: { title: "Flinders Street", bpm: 124, beats: 4, key: 4, scale: "minor", swing: 0,
    prog: ["Em", "C", "G", "D", "Em", "C", "Am", "B7"],
    bass: "drive", comp: "x.x.x.x.", drums: { k: "x...x...", s: "..x...x.", h: "xxxxxxxx" },
    lead: { oct: 5, density: 0.72 }, seed: 1956 },
  // ---- Paris ----
  paris_belle: { title: "Valse Musette", bpm: 168, beats: 3, key: 9, scale: "harmonic", swing: 0,
    prog: ["Am", "Am", "E7", "E7", "E7", "E7", "Am", "Am", "A7", "A7", "Dm", "Dm", "Am", "E7", "Am", "Am"],
    bass: "waltz", comp: "..x.x.", drums: { k: "x.....", s: "......", h: "..x.x." },
    lead: { oct: 5, density: 0.85 }, seed: 1889 },
  paris_folles: { title: "Swing Manouche", bpm: 150, beats: 4, key: 2, scale: "harmonic", swing: 0.28,
    prog: ["Dm6", "Dm6", "A7", "A7", "A7", "A7", "Dm6", "Dm6", "Gm6", "Gm6", "Dm6", "Dm6", "E7", "A7", "Dm6", "A7"],
    bass: "walk", comp: ".x.x.x.x", drums: { k: "x...x...", s: "........", h: "x.x.x.x." },
    lead: { oct: 5, density: 0.75 }, seed: 1934 },
  paris_moderne: { title: "Périphérique", bpm: 126, beats: 4, key: 5, scale: "major", swing: 0,
    prog: ["F", "Dm", "Bb", "C", "F", "Am", "Bb", "C7"],
    bass: "drive", comp: "x..x..x.", drums: { k: "x...x...", s: "..x...x.", h: "xxxxxxxx" },
    lead: { oct: 5, density: 0.7 }, seed: 1968 },
};

/** Compose a song into a flat event list over its whole loop: {t (in eighth
 *  slots), dur, ch, midi|drum}. Deterministic from song.seed. */
function chipCompose(song) {
  const rnd = chipRng(song.seed);
  const slots = song.beats * 2;                    // eighth notes per bar
  const scale = CHIP_SCALES[song.scale] || CHIP_SCALES.major;
  const scaleMidi = [];                            // playable scale tones, lead register
  for (let o = song.lead.oct - 1; o <= song.lead.oct + 1; o++)
    for (const d of scale) scaleMidi.push(12 * (o + 1) + ((song.key + d) % 12));
  scaleMidi.sort((a, b) => a - b);
  const leadLo = 12 * (song.lead.oct + 1) - 3, leadHi = 12 * (song.lead.oct + 2) + 4;
  const ev = [];
  const chords = song.prog.map(chipChord);
  // --- melody: phrases of 4 bars; form A A' B A over each 16 (repeat as needed)
  const phraseBars = 4;
  const phrases = {};
  function makePhrase(label, startBar) {
    const notes = [];
    let cur = 12 * (song.lead.oct + 1) + chords[startBar % chords.length].tones[0];
    for (let b = 0; b < phraseBars; b++) {
      const ch = chords[(startBar + b) % chords.length];
      for (let k = 0; k < slots; k++) {
        const strong = k % 2 === 0;
        const endOfPhrase = b === phraseBars - 1 && k >= slots - 2;
        if (endOfPhrase) { notes.push(k === slots - 2 ? { b, k, midi: nearestTone(cur, [song.key % 12]), dur: 2 } : null); continue; }
        if (!strong && rnd() > song.lead.density) { notes.push(null); continue; }
        if (strong && rnd() < 0.12 && k > 0) { notes.push(null); continue; }   // a breath
        let target;
        if (strong) target = nearestTone(cur + Math.round((rnd() - 0.5) * 7), ch.tones);
        else {
          const idx = scaleMidi.findIndex(m => m >= cur);
          const step = rnd() < 0.5 ? -1 : 1;
          target = scaleMidi[Math.max(0, Math.min(scaleMidi.length - 1, (idx < 0 ? scaleMidi.length - 1 : idx) + step))];
        }
        while (target < leadLo) target += 12;
        while (target > leadHi) target -= 12;
        cur = target;
        const long = strong && rnd() < 0.25;
        notes.push({ b, k, midi: target, dur: long ? 2 : 1 });
        if (long) { notes.push(null); k++; }
      }
    }
    return notes.filter(Boolean);
  }
  function nearestTone(midi, pcs) {
    let best = midi, bd = 99;
    for (let d = -6; d <= 6; d++) { const m = midi + d; if (pcs.includes(((m % 12) + 12) % 12) && Math.abs(d) < bd) { bd = Math.abs(d); best = m; } }
    return best;
  }
  const bars = Math.max(chords.length, 16);
  for (let pb = 0; pb < bars; pb += phraseBars) {
    const pos = (pb / phraseBars) % 4;              // A A' B A
    const label = pos === 2 ? "B" : "A";
    const key = label + ":" + (pb % chords.length);
    if (!phrases[key]) phrases[key] = makePhrase(label, pb);
    const ph = phrases[key];
    for (const n of ph) {
      let midi = n.midi;
      if (pos === 1 && n.b === phraseBars - 1) midi = nearestTone(midi + 2, chords[(pb + n.b) % chords.length].tones);  // A' answers A
      ev.push({ t: (pb + n.b) * slots + n.k, dur: n.dur, ch: "lead", midi });
    }
  }
  // --- bass, comping and drums, bar by bar
  for (let bar = 0; bar < bars; bar++) {
    const ch = chords[bar % chords.length];
    const next = chords[(bar + 1) % chords.length];
    const base = bar * slots;
    const bassMidi = pc => 36 + ((pc - 0 + 12) % 12) + (pc < 5 ? 12 : 0);
    if (song.bass === "oompah") {
      for (let beat = 0; beat < song.beats; beat++)
        ev.push({ t: base + beat * 2, dur: 1, ch: "bass", midi: bassMidi(beat % 2 === 0 ? ch.bassTones[beat % 4 === 0 ? 0 : 1] : ch.tones[1]) });
    } else if (song.bass === "waltz") {
      ev.push({ t: base, dur: 2, ch: "bass", midi: bassMidi(ch.root) });
    } else if (song.bass === "walk") {
      const walk = [ch.tones[0], ch.tones[1 % ch.tones.length], ch.tones[2 % ch.tones.length], (next.root + 11) % 12];
      for (let beat = 0; beat < song.beats; beat++) ev.push({ t: base + beat * 2, dur: 2, ch: "bass", midi: bassMidi(walk[beat % 4]) });
    } else if (song.bass === "drive") {
      for (let k = 0; k < slots; k++) ev.push({ t: base + k, dur: 1, ch: "bass", midi: bassMidi(k === slots - 1 ? ch.bassTones[1] : ch.root) + (k % 4 === 2 ? 12 : 0) });
    } else {
      ev.push({ t: base, dur: slots, ch: "bass", midi: bassMidi(ch.root) });
    }
    for (let k = 0; k < slots; k++) {
      if (song.comp[k % song.comp.length] === "x")
        for (const pc of ch.tones.slice(0, 3)) ev.push({ t: base + k, dur: 1, ch: "comp", midi: 60 + ((pc - 0 + 12) % 12) - (pc > 7 ? 12 : 0) });
      const D = song.drums;
      if (D.k[k % D.k.length] === "x") ev.push({ t: base + k, ch: "kick" });
      if (D.s[k % D.s.length] === "x") ev.push({ t: base + k, ch: "snare" });
      if (D.h[k % D.h.length] === "x") ev.push({ t: base + k, ch: "hat" });
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return { ev, loopSlots: bars * slots };
}

/* ---- the player ------------------------------------------------------------ */
function makeChipTrack(key) {
  const song = CHIP_SONGS[key];
  if (!song) return null;
  const ac = chipCtx();
  if (!ac) return null;
  const comp = chipCompose(song);
  const eighth = 60 / song.bpm / 2;
  const master = ac.createGain();
  master.gain.value = 0;
  master.connect(ac.destination);
  let vol = 0, timer = null, nextSlot = 0, nextTime = 0, evIdx = 0;

  function voice(type, midi, t, dur, level) {
    const o = ac.createOscillator(), g = ac.createGain();
    if (type === "pulse" && CHIP.pulseWave) o.setPeriodicWave(CHIP.pulseWave); else o.type = type === "pulse" ? "square" : type;
    o.frequency.value = chipHz(midi);
    const end = t + dur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.006);
    g.gain.setValueAtTime(level * 0.8, Math.max(t + 0.007, end - 0.04));
    g.gain.linearRampToValueAtTime(0, end);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(end + 0.02);
  }
  function drum(kind, t) {
    if (kind === "kick") {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.16);
      return;
    }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = CHIP.noise;
    f.type = kind === "hat" ? "highpass" : "bandpass";
    f.frequency.value = kind === "hat" ? 7000 : 1800;
    const len = kind === "hat" ? 0.04 : 0.13, lvl = kind === "hat" ? 0.07 : 0.22;
    g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + len + 0.01);
  }
  function slotTime(slot) {
    // swing delays each off-beat eighth
    return (slot % 2 === 1) ? eighth * song.swing : 0;
  }
  function schedule() {
    const ahead = ac.currentTime + 0.25;
    while (nextTime < ahead) {
      const slotInLoop = nextSlot % comp.loopSlots;
      if (slotInLoop === 0) evIdx = 0;
      const t0 = nextTime + slotTime(slotInLoop);
      while (evIdx < comp.ev.length && comp.ev[evIdx].t === slotInLoop) {
        const e = comp.ev[evIdx++];
        const dur = (e.dur || 1) * eighth * 0.95;
        if (e.ch === "lead") voice("pulse", e.midi, t0, dur, 0.13);
        else if (e.ch === "comp") voice("square", e.midi, t0, dur * 0.5, 0.028);
        else if (e.ch === "bass") voice("triangle", e.midi, t0, dur, 0.32);
        else drum(e.ch, t0);
      }
      nextSlot++; nextTime += eighth;
    }
  }
  const track = {
    loop: true, paused: true, duration: comp.loopSlots * eighth, chip: key, title: song.title,
    play() {
      if (ac.state === "suspended" && ac.resume) { try { ac.resume(); } catch (e) {} }
      if (!track.paused) return { catch() {} };
      track.paused = false;
      nextTime = ac.currentTime + 0.05;
      timer = setInterval(schedule, 60);
      schedule();
      return { catch() {}, then() {} };
    },
    pause() {
      track.paused = true;
      if (timer) { clearInterval(timer); timer = null; }
    },
    get volume() { return vol; },
    set volume(v) { vol = Math.max(0, Math.min(1, +v || 0)); master.gain.setTargetAtTime(vol, ac.currentTime, 0.03); },
    get currentTime() { return (nextSlot % comp.loopSlots) * eighth; },
    set currentTime(v) { if (!v) { nextSlot = 0; evIdx = 0; } },
    addEventListener() {}, removeEventListener() {},
  };
  return track;
}
