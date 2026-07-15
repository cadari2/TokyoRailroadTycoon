/* =========================================================================
 * audio.js — Browser audio: looping per-era BGM with crossfades, and
 * one-shot SFX for game events. Reads assets/audio/manifest.js.
 *
 * Graceful degradation is the rule: any slot whose file is missing is
 * silently skipped (a failed play() promise is swallowed), so the game runs
 * with no audio files, some, or all — adding files never breaks anything.
 *
 * The sim core never calls in here. Instead it pushes semantic SFX names onto
 * st.sfxQueue (via queueSfx in util.js), which the browser render loop drains
 * through audioTick(); era BGM is driven the same way. This keeps the
 * DOM/audio-free simulation testable headless.
 * ========================================================================= */
"use strict";

const AudioState = {
  bgmVol: 0.6,          // 0..1 background-music volume (independent bar)
  sfxVol: 0.75,         // 0..1 sound-effects volume (independent bar)
  muted: false,
  unlocked: false,      // becomes true after the first user gesture (autoplay policy)
  ready: false,
  bgm: {},              // era key -> HTMLAudioElement (lazily created)
  sfxPool: {},          // sfx name -> small pool of reusable HTMLAudioElements
  playing: null,        // era key currently sounding
  curEra: null,         // era the game is in (target for BGM)
  _fade: null,
  seq: [],              // pending SFX names, played strictly in order (see pumpSfxSeq)
  seqBusy: false,       // a sequential SFX is currently sounding
};

// Cap the pending sequential-SFX backlog. Sounds now play one after another
// (never piled on top of each other), so a burst that queues many names at once
// — a debug fast-forward across decades, a year-end with tax+awards+strike —
// mustn't build a minutes-long audio backlog. Beyond this we drop the oldest.
const SFX_SEQ_MAX = 8;

// How many simultaneous copies of the SAME sfx may overlap. Elements are
// REUSED (rewound) beyond this. Chrome hard-caps the number of media players a
// page may ever create (~1000 for the page's lifetime); the old new-Audio()-
// per-shot approach silently hit that cap a few in-game decades in — SFX went
// mute and any BGM era first reached after the cap (Reiwa) never played.
const SFX_POOL_MAX = 4;

function audioManifest() {
  return (typeof window !== "undefined" && window.AUDIO_MANIFEST) || { bgm: {}, sfx: {} };
}

/** Set up audio once: restore saved prefs and arm a one-time unlock gesture. */
function audioInit() {
  if (AudioState.ready) return;
  AudioState.ready = true;
  try {
    const raw = localStorage.getItem("trt_audio");
    if (raw) {
      const p = JSON.parse(raw);
      // current prefs: independent bgm/sfx bars…
      if (typeof p.bgmVol === "number") AudioState.bgmVol = clamp(p.bgmVol, 0, 1);
      if (typeof p.sfxVol === "number") AudioState.sfxVol = clamp(p.sfxVol, 0, 1);
      // …migrate an older single "master" volume onto both bars (SFX a touch under)
      else if (typeof p.master === "number") {
        AudioState.bgmVol = clamp(p.master, 0, 1);
        AudioState.sfxVol = clamp(p.master * 0.9, 0, 1);
      }
      AudioState.muted = !!p.muted;
    }
  } catch (e) { /* no prefs */ }
  if (typeof window !== "undefined" && window.addEventListener) {
    const unlock = () => {
      AudioState.unlocked = true;
      // create every era's BGM element up front (a handful of elements, made
      // while the media-player budget is untouched) so late-game era
      // transitions never depend on being able to create players mid-session
      for (const era in (audioManifest().bgm || {})) bgmEl(era);
      if (!AudioState.muted && AudioState.curEra) crossfadeTo(AudioState.curEra);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
  }
}

function audioSavePrefs() {
  try { localStorage.setItem("trt_audio", JSON.stringify({ bgmVol: AudioState.bgmVol, sfxVol: AudioState.sfxVol, muted: AudioState.muted })); }
  catch (e) { /* ignore */ }
}

function makeAudioEl(path) {
  try { return (typeof Audio !== "undefined") ? new Audio(path) : null; }
  catch (e) { return null; }
}

/** Play a one-shot SFX by semantic name. Returns the sounding element and its
 *  play() promise (or {el:null} if muted, silent, or the file is missing) so a
 *  caller can chain on completion — see pumpSfxSeq. Elements are pooled per name
 *  and reused — never one fresh Audio() per shot — so the browser's lifetime
 *  media-player cap is never approached (see SFX_POOL_MAX). */
function playSfx(name) {
  if (AudioState.muted || AudioState.sfxVol <= 0) return { el: null };
  const file = (audioManifest().sfx || {})[name];
  if (!file) return { el: null };
  const pool = AudioState.sfxPool[name] || (AudioState.sfxPool[name] = { els: [], next: 0 });
  let a = pool.els.find(el => el.paused || el.ended);
  if (!a) {
    if (pool.els.length < SFX_POOL_MAX) {
      a = makeAudioEl("assets/audio/sfx/" + file);
      if (!a) return { el: null };
      pool.els.push(a);
    } else {
      a = pool.els[pool.next % pool.els.length];   // steal the oldest, round-robin
      pool.next++;
    }
  }
  try { a.currentTime = 0; } catch (e) { /* not seekable yet */ }
  a.volume = clamp(AudioState.sfxVol, 0, 1);
  const p = a.play();
  if (p && p.catch) p.catch(() => {});          // missing file / autoplay block → silent
  return { el: a, p };
}

/** Queue a semantic SFX name to play AFTER whatever is currently sounding —
 *  one clip at a time, never overlapping. Coalesces an immediate repeat and
 *  caps the backlog so a burst can't build a long tail (see SFX_SEQ_MAX). */
function enqueueSfx(name) {
  const q = AudioState.seq;
  if (q[q.length - 1] === name) return;         // drop a back-to-back duplicate
  q.push(name);
  while (q.length > SFX_SEQ_MAX) q.shift();      // burst overflow → drop the oldest
  pumpSfxSeq();
}

/** Drive the sequential SFX queue: start the next clip and, when it finishes
 *  (its `ended` event, its play() promise rejecting on autoplay-block, or a
 *  safety timeout so a never-firing `ended` can't wedge the queue), move on. */
function pumpSfxSeq() {
  if (AudioState.seqBusy) return;
  const name = AudioState.seq.shift();
  if (name === undefined) return;
  AudioState.seqBusy = true;
  const advance = () => { AudioState.seqBusy = false; pumpSfxSeq(); };
  const { el, p } = playSfx(name);
  if (!el) { advance(); return; }               // muted / missing / no audio → next now
  let done = false, timer = null;
  const finish = () => {
    if (done) return; done = true;
    if (el.removeEventListener) el.removeEventListener("ended", finish);
    if (timer) clearTimeout(timer);
    advance();
  };
  if (el.addEventListener) el.addEventListener("ended", finish);
  if (p && p.then) p.then(null, finish);        // autoplay-blocked → don't stall the queue
  // safety net if `ended` never fires: estimate from duration once known, else a
  // generous default that still can't wedge the queue forever.
  const ms = (isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 2500) + 300;
  timer = setTimeout(finish, ms);
}

/** Lazily get (and cache) the looping BGM element for an era, or null. */
function bgmEl(era) {
  const file = (audioManifest().bgm || {})[era];
  if (!file) return null;
  if (!(era in AudioState.bgm)) {
    const a = makeAudioEl("assets/audio/bgm/" + file);
    if (a) { a.loop = true; a.volume = 0; }
    AudioState.bgm[era] = a || null;
  }
  return AudioState.bgm[era];
}

/** Crossfade the looping BGM to `era` over ~1.5s (fades the old one out and
 *  the new one in together). Safe if either track is missing. */
function crossfadeTo(era) {
  if (!AudioState.unlocked || AudioState.muted) return;
  if (AudioState.playing === era) return;
  const next = bgmEl(era);
  const prevEra = AudioState.playing;
  const prev = prevEra ? AudioState.bgm[prevEra] : null;
  const target = AudioState.bgmVol;
  if (next) { try { next.currentTime = next.currentTime || 0; } catch (e) {} const p = next.play(); if (p && p.catch) p.catch(() => {}); }
  AudioState.playing = era;
  if (AudioState._fade) clearInterval(AudioState._fade);
  const dur = 1500, step = 60; let t = 0;
  AudioState._fade = setInterval(() => {
    t += step; const k = Math.min(1, t / dur);
    if (next) next.volume = clamp(target * k, 0, 1);
    if (prev && prev !== next) prev.volume = clamp(target * (1 - k), 0, 1);
    if (k >= 1) {
      if (prev && prev !== next) { try { prev.pause(); prev.currentTime = 0; } catch (e) {} }
      clearInterval(AudioState._fade); AudioState._fade = null;
    }
  }, step);
}

/** Per-frame: drain the sim's SFX queue and keep BGM tracking the game era. */
function audioTick(G) {
  const st = G && G.st;
  if (!st) return;
  if (st.sfxQueue && st.sfxQueue.length) {
    let batch = st.sfxQueue.slice();
    st.sfxQueue.length = 0;
    // the title-screen button click yields whenever a "real" sound fires in the
    // same moment (e.g. Start also queues game_start) — drop it so only the
    // meaningful clip is heard.
    if (batch.length > 1 && batch.indexOf("start_screen_button") !== -1)
      batch = batch.filter(n => n !== "start_screen_button");
    for (const n of batch) enqueueSfx(n);        // play them one after another, in order
  }
  // BGM key follows the campaign: Japanese era for Tokyo, reigning monarch for
  // London (Elizabeth II split across two tracks) — see CFG.bgmKey.
  const era = bgmKey(st, st.time.year);
  if (era !== AudioState.curEra) {
    AudioState.curEra = era;
    crossfadeTo(era);
  }
}

/* ---- controls (wired to the System panel + a topbar toggle) ---- */
/** BGM volume: takes effect on the currently-sounding track immediately (unless
 *  a crossfade is mid-flight, which will land on the new target itself). */
function setBgmVolume(v) {
  AudioState.bgmVol = clamp(+v || 0, 0, 1);
  const cur = AudioState.playing && AudioState.bgm[AudioState.playing];
  if (cur && !AudioState.muted && !AudioState._fade) cur.volume = AudioState.bgmVol;
  audioSavePrefs();
}
function bgmVolume() { return AudioState.bgmVol; }
/** SFX volume: read afresh by playSfx on every one-shot, so this just needs to
 *  store the level and persist it. */
function setSfxVolume(v) {
  AudioState.sfxVol = clamp(+v || 0, 0, 1);
  audioSavePrefs();
}
function sfxVolume() { return AudioState.sfxVol; }
function audioMuted() { return AudioState.muted; }
function setAudioMuted(m) {
  AudioState.muted = !!m;
  if (AudioState.muted) {
    for (const k in AudioState.bgm) { const a = AudioState.bgm[k]; if (a) { try { a.pause(); } catch (e) {} } }
    if (AudioState._fade) { clearInterval(AudioState._fade); AudioState._fade = null; }
    AudioState.playing = null;
  } else if (AudioState.unlocked && AudioState.curEra) {
    crossfadeTo(AudioState.curEra);
  }
  audioSavePrefs();
}
function toggleAudioMuted() { setAudioMuted(!AudioState.muted); return AudioState.muted; }
