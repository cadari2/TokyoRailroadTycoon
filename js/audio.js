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
  master: 0.6,          // 0..1 master volume
  sfxScale: 0.9,        // SFX are mixed a touch under BGM
  muted: false,
  unlocked: false,      // becomes true after the first user gesture (autoplay policy)
  ready: false,
  bgm: {},              // era key -> HTMLAudioElement (lazily created)
  playing: null,        // era key currently sounding
  curEra: null,         // era the game is in (target for BGM)
  _fade: null,
};

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
      if (typeof p.master === "number") AudioState.master = clamp(p.master, 0, 1);
      AudioState.muted = !!p.muted;
    }
  } catch (e) { /* no prefs */ }
  if (typeof window !== "undefined" && window.addEventListener) {
    const unlock = () => {
      AudioState.unlocked = true;
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
  try { localStorage.setItem("trt_audio", JSON.stringify({ master: AudioState.master, muted: AudioState.muted })); }
  catch (e) { /* ignore */ }
}

function makeAudioEl(path) {
  try { return (typeof Audio !== "undefined") ? new Audio(path) : null; }
  catch (e) { return null; }
}

/** Play a one-shot SFX by semantic name. No-op if muted, silent, or the file
 *  is missing (the play() promise just rejects and we swallow it). */
function playSfx(name) {
  if (AudioState.muted || AudioState.master <= 0) return;
  const file = (audioManifest().sfx || {})[name];
  if (!file) return;
  const a = makeAudioEl("assets/audio/sfx/" + file);
  if (!a) return;
  a.volume = clamp(AudioState.master * AudioState.sfxScale, 0, 1);
  const p = a.play();
  if (p && p.catch) p.catch(() => {});          // missing file / autoplay block → silent
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
  const target = AudioState.master;
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
    for (const n of st.sfxQueue) playSfx(n);
    st.sfxQueue.length = 0;
  }
  const era = eraOf(st.time.year).key;
  if (era !== AudioState.curEra) {
    AudioState.curEra = era;
    crossfadeTo(era);
  }
}

/* ---- controls (wired to the System panel + a topbar toggle) ---- */
function setMasterVolume(v) {
  AudioState.master = clamp(+v || 0, 0, 1);
  const cur = AudioState.playing && AudioState.bgm[AudioState.playing];
  if (cur && !AudioState.muted && !AudioState._fade) cur.volume = AudioState.master;
  audioSavePrefs();
}
function masterVolume() { return AudioState.master; }
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
