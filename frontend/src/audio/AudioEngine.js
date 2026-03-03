/**
 * BayanSynth Studio — Audio Engine  (Pass 2)
 *
 * Manages Web Audio API context, buffer loading, and per-node playback.
 *
 * Pass 2 fixes:
 *  - Pitch shift uses pre-rendered OfflineAudioContext (no detune → no speed change)
 *  - Split nodes honour duration limit (source.start 3rd arg)
 *  - engineSpeed applied via playbackRate (replaces old stretchRatio)
 *  - DYN automation drives gain breakpoints
 *  - Mid-node `intraNodeOffset` parameter for correct seek
 *  - Pitch buffer cache with per-node invalidation
 */

import { downsampleWaveform, initRubberband, olaTimeStretch } from './RubberbandProcessor';

let _instance = null;

// Map quality labels to Web Audio latencyHint values
function _bufSizeToLatency(size) {
  if (size <= 256)  return 'interactive';
  if (size <= 1024) return 'balanced';
  return 'playback';
}

function _qualityToLatency(quality) {
  if (quality === 'low')  return 'interactive';
  if (quality === 'high') return 'playback';
  return 'balanced';
}

class AudioEngine {
  constructor() {
    this._ctx = null;
    this._latencyHint = 'balanced';
    this.sources = new Map();       // nodeId → { source, gain, panner }
    this.buffers = new Map();       // nodeId → AudioBuffer (original)
    this._pitchCache = new Map();   // "nodeId:semitones" → AudioBuffer
    this._wasmReady = false;
  }

  /** Called by settings watcher; applies on next context creation. */
  setLatencyHint(bufferSize) {
    this._latencyHint = _bufSizeToLatency(bufferSize);
  }

  /** Called by playback quality setting; applies on next context creation. */
  setPlaybackQuality(quality) {
    this._latencyHint = _qualityToLatency(quality);
  }

  /* ────── Context ────── */

  get ctx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: this._latencyHint,
      });
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  get currentTime() {
    return this._ctx ? this._ctx.currentTime : 0;
  }

  get sampleRate() {
    return this.ctx.sampleRate;
  }

  async init() {
    this._wasmReady = await initRubberband();
  }

  /* ────── Buffer Loading ────── */

  async loadAudio(url) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  async loadNodeAudio(nodeId, url) {
    if (!url) return null;
    const buffer = await this.loadAudio(url);
    this.buffers.set(nodeId, buffer);
    this.invalidatePitchCache(nodeId);
    return buffer;
  }

  getBuffer(nodeId) {
    return this.buffers.get(nodeId) || null;
  }

  /**
   * Extract a downsampled waveform from an audio URL.
   */
  async extractWaveform(url, targetPoints = 200) {
    const buffer = await this.loadAudio(url);
    return downsampleWaveform(buffer, targetPoints);
  }

  /**
   * Load audio and extract waveform in one call.
   */
  async loadAndExtract(nodeId, url, targetPoints = 200) {
    if (!url) return { buffer: null, waveformData: null };
    const buffer = await this.loadAudio(url);
    this.buffers.set(nodeId, buffer);
    this.invalidatePitchCache(nodeId);
    const waveformData = downsampleWaveform(buffer, targetPoints);
    return { buffer, waveformData };
  }

  /* ────── Pitch-Shift (pre-rendered, Item 2) ────── */

  /**
   * Pre-render a pitch-shifted AudioBuffer that keeps the original duration.
   *
   * Two-stage process:
   *  1. OfflineAudioContext with playbackRate = pitchFactor → changes pitch AND
   *     duration (contentLength samples, not buffer.length).
   *  2. OLA time-stretch each channel back to buffer.length samples so the
   *     audio fills exactly the same wall-clock time as before.
   *
   * Quality: preview-grade (slight transient smearing).  Export uses
   * server-side librosa for formant-preserving results.
   */
  async pitchShiftBuffer(buffer, semitones) {
    if (semitones === 0) return buffer;

    const pitchFactor  = Math.pow(2, semitones / 12);
    // How many samples the pitched content occupies
    const contentLen   = Math.ceil(buffer.length / pitchFactor);

    // ── Stage 1: resample to shift pitch (changes duration) ─────────────
    const offline = new OfflineAudioContext(
      buffer.numberOfChannels,
      contentLen,
      buffer.sampleRate,
    );
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = pitchFactor;
    src.connect(offline.destination);
    src.start(0);
    const pitched = await offline.startRendering();

    // ── Stage 2: OLA time-stretch back to original length ───────────────
    const originalLen  = buffer.length;
    const numChannels  = buffer.numberOfChannels;
    const restored     = new OfflineAudioContext(numChannels, originalLen, buffer.sampleRate);
    const outBuf       = restored.createBuffer(numChannels, originalLen, buffer.sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const stretched = olaTimeStretch(pitched.getChannelData(ch), originalLen);
      outBuf.copyToChannel(stretched, ch);
    }

    return outBuf;
  }

  /**
   * Get (or create) a cached pitch-shifted buffer for a node.
   */
  async getPitchBuffer(nodeId, semitones) {
    if (semitones === 0) return this.buffers.get(nodeId) ?? null;
    const key = `${nodeId}:${semitones}`;
    if (this._pitchCache.has(key)) return this._pitchCache.get(key);
    const original = this.buffers.get(nodeId);
    if (!original) return null;
    const shifted = await this.pitchShiftBuffer(original, semitones);
    this._pitchCache.set(key, shifted);
    return shifted;
  }

  /**
   * Invalidate pitch cache entries for a node (call when buffer or pitch changes).
   */
  invalidatePitchCache(nodeId) {
    const prefix = `${nodeId}:`;
    for (const key of [...this._pitchCache.keys()]) {
      if (key.startsWith(prefix)) this._pitchCache.delete(key);
    }
  }

  /* ────── Vibrato LFO ────── */

  /**
   * Attach a vibrato LFO (via source.detune) for the given node.
   * The LFO sine wave adds on top of any PIT automation already scheduled.
   */
  _attachVibrato(source, node, contextTime, nodeDur) {
    const vib = node.automationVIB;
    if (!vib || !(vib.depth > 0)) return;
    const lfo     = this.ctx.createOscillator();
    lfo.type      = 'sine';
    lfo.frequency.value = Math.max(0.1, vib.rate || 5.5);
    const lfoGain = this.ctx.createGain();
    const depth   = vib.depth || 0;
    const onset   = Math.max(0, vib.onset || 0);
    if (onset > 0) {
      lfoGain.gain.setValueAtTime(0, contextTime);
      lfoGain.gain.linearRampToValueAtTime(depth, contextTime + Math.min(onset, nodeDur));
    } else {
      lfoGain.gain.setValueAtTime(depth, contextTime);
    }
    lfo.connect(lfoGain);
    lfoGain.connect(source.detune);
    lfo.start(contextTime);
    lfo.stop(contextTime + nodeDur + 0.05);
  }

  /* ────── Effects Chain (EQ, Reverb, Delay, Chorus) ────── */

  /**
   * Build an inline effects chain connected from gainNode.
   * Returns the output AudioNode to chain into the panner.
   * If no effects configured, returns gainNode unchanged.
   */
  _buildEffectsChain(effects, gainNode, contextTime, nodeDur) {
    if (!effects) return gainNode;
    const ctx = this.ctx;

    // EQ - always in chain (transparent when disabled or gains=0)
    const eqEnabled = effects.eq?.enabled;
    const eqLow  = ctx.createBiquadFilter();
    eqLow.type   = 'lowshelf';  eqLow.frequency.value  = 250;
    eqLow.gain.value  = eqEnabled ? (effects.eq.lowGain  ?? 0) : 0;
    const eqMid  = ctx.createBiquadFilter();
    eqMid.type   = 'peaking';   eqMid.frequency.value  = 1000; eqMid.Q.value = 1;
    eqMid.gain.value  = eqEnabled ? (effects.eq.midGain  ?? 0) : 0;
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type  = 'highshelf'; eqHigh.frequency.value = 4000;
    eqHigh.gain.value = eqEnabled ? (effects.eq.highGain ?? 0) : 0;
    gainNode.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);

    const hasReverb = effects.reverb?.enabled;
    const hasDelay  = effects.delay?.enabled;
    const hasChorus = effects.chorus?.enabled;
    if (!hasReverb && !hasDelay && !hasChorus) return eqHigh;

    // Master mix bus
    const masterOut = ctx.createGain();
    // Dry path
    const dryGain = ctx.createGain(); dryGain.gain.value = 1;
    eqHigh.connect(dryGain);
    dryGain.connect(masterOut);

    // Reverb (algorithmic impulse response via exponential noise)
    if (hasReverb) {
      const rev  = effects.reverb;
      const mix  = Math.max(0, Math.min(1, rev.mix   ?? 0.3));
      const decay = Math.max(0.1, rev.decay ?? 2.0);
      const sr   = ctx.sampleRate;
      const len  = Math.min(Math.floor(sr * decay), sr * 8);
      const impulse = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay * 0.5);
        }
      }
      const convolver = ctx.createConvolver(); convolver.buffer = impulse;
      const preDelay  = ctx.createDelay(0.5);
      preDelay.delayTime.value = Math.max(0, Math.min(0.5, rev.preDelay ?? 0.02));
      const reverbWet = ctx.createGain(); reverbWet.gain.value = mix;
      dryGain.gain.value = Math.max(0, 1 - mix * 0.5);
      eqHigh.connect(preDelay);
      preDelay.connect(convolver);
      convolver.connect(reverbWet);
      reverbWet.connect(masterOut);
    }

    // Delay (with feedback loop)
    if (hasDelay) {
      const del = effects.delay;
      const mix = Math.max(0, Math.min(1, del.mix ?? 0.2));
      const delayNode    = ctx.createDelay(2.0);
      delayNode.delayTime.value = Math.max(0.01, Math.min(2.0, del.time ?? 0.25));
      const feedbackGain = ctx.createGain();
      feedbackGain.gain.value = Math.max(0, Math.min(0.95, del.feedback ?? 0.3));
      const delayWet     = ctx.createGain(); delayWet.gain.value = mix;
      eqHigh.connect(delayNode);
      delayNode.connect(feedbackGain);
      feedbackGain.connect(delayNode); // feedback loop
      delayNode.connect(delayWet);
      delayWet.connect(masterOut);
    }

    // Chorus (LFO-modulated short delay)
    if (hasChorus) {
      const ch  = effects.chorus;
      const mix = Math.max(0, Math.min(1, ch.mix ?? 0.3));
      const chorusDelay   = ctx.createDelay(0.1);
      chorusDelay.delayTime.value = 0.025; // base 25 ms
      const chorusLFO     = ctx.createOscillator();
      chorusLFO.type      = 'sine';
      chorusLFO.frequency.value = Math.max(0.1, ch.rate ?? 1.5);
      const chorusLFOGain = ctx.createGain();
      chorusLFOGain.gain.value = Math.max(0, ch.depth ?? 0.5) * 0.01; // ±10 ms max
      chorusLFO.connect(chorusLFOGain);
      chorusLFOGain.connect(chorusDelay.delayTime);
      const chorusWet = ctx.createGain(); chorusWet.gain.value = mix;
      eqHigh.connect(chorusDelay);
      chorusDelay.connect(chorusWet);
      chorusWet.connect(masterOut);
      chorusLFO.start(contextTime);
      chorusLFO.stop(contextTime + nodeDur + 0.5);
    }

    return masterOut;
  }

  /* ────── Single-Node Playback (audition / preview) ────── */

  /**
   * Play a single node with pitch shift, volume, and pan.
   */
  async playNode(node, options = {}) {
    if (!node.audioUrl) return;

    const { onEnd, when, offset: startOffset, trackVolume = 1.0, trackPan = 0 } = options;

    this.stopNode(node.id);

    // Ensure original buffer is loaded
    let original = this.buffers.get(node.id);
    if (!original) {
      original = await this.loadAudio(node.audioUrl);
      this.buffers.set(node.id, original);
    }

    // Pre-rendered pitch shift (no detune → no speed change)
    const semitones = node.pitch_shift || 0;
    const playBuffer = semitones !== 0
      ? await this.getPitchBuffer(node.id, semitones)
      : original;

    const source = this.ctx.createBufferSource();
    source.buffer = playBuffer;

    // Engine speed via playbackRate
    const engineSpeed = node.engineSpeed || 1.0;
    if (engineSpeed !== 1.0) {
      source.playbackRate.value = engineSpeed;
    }

    // Duration (needed before vibrato/effects — compute early)
    const dur = node.duration ?? (playBuffer.duration / engineSpeed);
    const nodeContextTime = this.ctx.currentTime + (when || 0);

    // Gain node: node volume × track volume
    const baseVol = Math.max(0, Math.min(2, (node.volume || 1.0) * trackVolume));
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = baseVol;

    // Apply PIT automation breakpoints to source.detune (cents)
    if (node.automationPIT && node.automationPIT.length > 0) {
      const nodeStart = node.start_time ?? 0;
      source.detune.cancelScheduledValues(nodeContextTime);
      for (const pt of node.automationPIT) {
        const t = nodeContextTime + Math.max(0, pt.time - nodeStart);
        if (pt === node.automationPIT[0]) {
          source.detune.setValueAtTime(pt.value, t);
        } else {
          source.detune.linearRampToValueAtTime(pt.value, t);
        }
      }
    }

    // Vibrato LFO (adds sinusoidal pitch oscillation on top of PIT)
    this._attachVibrato(source, node, nodeContextTime, dur);

    // Fade in / out
    if (node.fade_in > 0) {
      gainNode.gain.setValueAtTime(0, nodeContextTime);
      gainNode.gain.linearRampToValueAtTime(baseVol, nodeContextTime + node.fade_in);
    }
    if (node.fade_out > 0 && dur > node.fade_out) {
      const fadeStart = nodeContextTime + dur - node.fade_out;
      gainNode.gain.setValueAtTime(baseVol, fadeStart);
      gainNode.gain.linearRampToValueAtTime(0, nodeContextTime + dur);
    }

    // Stereo panner: per-node pan if set, else track pan
    const pannerNode = this.ctx.createStereoPanner();
    const panValue = node.pan !== null && node.pan !== undefined ? node.pan : trackPan;
    pannerNode.pan.value = Math.max(-1, Math.min(1, panValue));

    // Effects chain (EQ → Reverb → Delay → Chorus)
    const effectsOut = this._buildEffectsChain(node.effects, gainNode, nodeContextTime, dur);

    // Chain: source → gain → [effects] → panner → destination
    source.connect(gainNode);
    effectsOut.connect(pannerNode);
    pannerNode.connect(this.ctx.destination);

    const playOffset = (node.offset || 0) + (startOffset || 0);
    const playWhen = when || 0;

    source.start(playWhen, playOffset, dur);
    source.onended = () => {
      this.sources.delete(node.id);
      if (onEnd) onEnd();
    };

    this.sources.set(node.id, { source, gain: gainNode, panner: pannerNode });
  }

  /* ────── Timeline Schedule (transport playback) ────── */

  /**
   * Schedule a node for timeline playback at an exact AudioContext time.
   *
   * @param {Object}  node
   * @param {number}  contextTime    — AudioContext start time
   * @param {number}  trackVolume
   * @param {number}  trackPan
   * @param {number}  intraNodeOffset — seconds into the node to skip (for mid-node seek)
   */
  async scheduleNode(node, contextTime, trackVolume = 1.0, trackPan = 0, intraNodeOffset = 0, prevNode = null) {
    if (!node.audioUrl) return;

    // Ensure original buffer is loaded
    let original = this.buffers.get(node.id);
    if (!original) {
      original = await this.loadAudio(node.audioUrl);
      this.buffers.set(node.id, original);
    }

    // Pre-rendered pitch shift (Item 2 — no detune, no speed change)
    const semitones = node.pitch_shift || 0;
    const playBuffer = semitones !== 0
      ? await this.getPitchBuffer(node.id, semitones)
      : original;

    const engineSpeed = node.engineSpeed || 1.0;

    const source = this.ctx.createBufferSource();
    source.buffer = playBuffer;

    // Engine speed via playbackRate
    if (engineSpeed !== 1.0) {
      source.playbackRate.value = engineSpeed;
    }

    // ── Gain (with DYN automation) ──
    const gainNode = this.ctx.createGain();
    const baseVol = Math.max(0, Math.min(2, (node.volume || 1.0) * trackVolume));
    gainNode.gain.value = baseVol;

    const nodeDur = node.duration || (playBuffer.duration / engineSpeed);

    // Apply DYN automation breakpoints to gain
    if (node.automationDYN && node.automationDYN.length > 1) {
      const dynFloor = node.dynFloor ?? 0;
      const dynCeil  = node.dynCeil  ?? 1.0;
      gainNode.gain.cancelScheduledValues(contextTime);
      for (const pt of node.automationDYN) {
        const t = contextTime + Math.max(0, pt.time - (node.start_time ?? 0));
        const mappedGain = dynFloor + pt.value * (dynCeil - dynFloor);
        const v = Math.max(0, Math.min(2, mappedGain * (node.volume || 1.0) * trackVolume));
        if (pt === node.automationDYN[0]) {
          gainNode.gain.setValueAtTime(v, t);
        } else {
          gainNode.gain.linearRampToValueAtTime(v, t);
        }
      }
    } else {
      // Fade in
      if (node.fade_in > 0) {
        gainNode.gain.setValueAtTime(0, contextTime);
        gainNode.gain.linearRampToValueAtTime(baseVol, contextTime + node.fade_in);
      }

      // Fade out
      if (node.fade_out > 0 && nodeDur > node.fade_out) {
        const fadeStart = contextTime + nodeDur - node.fade_out;
        gainNode.gain.setValueAtTime(baseVol, fadeStart);
        gainNode.gain.linearRampToValueAtTime(0, contextTime + nodeDur);
      }
    }

    // Apply PIT automation breakpoints to source.detune (cents)
    if (node.automationPIT && node.automationPIT.length > 0) {
      const nodeStart = node.start_time ?? 0;
      source.detune.cancelScheduledValues(contextTime);
      for (const pt of node.automationPIT) {
        const t = contextTime + Math.max(0, pt.time - nodeStart);
        if (pt === node.automationPIT[0]) {
          source.detune.setValueAtTime(pt.value, t);
        } else {
          source.detune.linearRampToValueAtTime(pt.value, t);
        }
      }
    }

    // Vibrato LFO (adds sinusoidal pitch oscillation on top of PIT)
    this._attachVibrato(source, node, contextTime, nodeDur);

    // Transition crossfade between prevNode and this node
    if (prevNode && node.transition && node.transition.type !== 'none') {
      const xf       = node.transition;
      const xfadeDur = Math.max(0.005, Math.min(xf.duration || 0.1, nodeDur));
      // Fade in current node (override any gain ramp already set)
      if (!node.automationDYN || node.automationDYN.length <= 1) {
        gainNode.gain.cancelScheduledValues(contextTime);
        gainNode.gain.setValueAtTime(0, contextTime);
        if (xf.type === 'cosine') {
          for (let s = 1; s <= 8; s++) {
            const frac = s / 8;
            const env  = 0.5 - 0.5 * Math.cos(Math.PI * frac);
            gainNode.gain.linearRampToValueAtTime(env * baseVol, contextTime + xfadeDur * frac);
          }
        } else if (xf.type === 'exponential') {
          gainNode.gain.setValueAtTime(0.001, contextTime);
          gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, baseVol), contextTime + xfadeDur);
        } else {
          gainNode.gain.linearRampToValueAtTime(baseVol, contextTime + xfadeDur);
        }
      }
      // Fade out previous node
      const prevEntry   = this.sources.get(prevNode.id);
      const prevBaseVol = Math.max(0.001, Math.min(2, (prevNode.volume || 1.0) * trackVolume));
      if (prevEntry) {
        prevEntry.gain.gain.cancelScheduledValues(contextTime);
        prevEntry.gain.gain.setValueAtTime(prevBaseVol, contextTime);
        if (xf.type === 'cosine') {
          for (let s = 1; s <= 8; s++) {
            const frac = s / 8;
            const env  = 0.5 + 0.5 * Math.cos(Math.PI * frac);
            prevEntry.gain.gain.linearRampToValueAtTime(env * prevBaseVol, contextTime + xfadeDur * frac);
          }
        } else if (xf.type === 'exponential') {
          prevEntry.gain.gain.exponentialRampToValueAtTime(0.001, contextTime + xfadeDur);
        } else {
          prevEntry.gain.gain.linearRampToValueAtTime(0, contextTime + xfadeDur);
        }
      }
    }

    // Stereo panner
    const pannerNode = this.ctx.createStereoPanner();
    const panValue = node.pan !== null && node.pan !== undefined ? node.pan : trackPan;
    pannerNode.pan.value = Math.max(-1, Math.min(1, panValue));

    // Effects chain (EQ → Reverb → Delay → Chorus)
    const effectsOut = this._buildEffectsChain(node.effects, gainNode, contextTime, nodeDur);

    // Chain: source → gain → [effects] → panner → destination
    source.connect(gainNode);
    effectsOut.connect(pannerNode);
    pannerNode.connect(this.ctx.destination);

    // Buffer offset = stored offset + intra-node seek
    const offset = (node.offset || 0) + intraNodeOffset;
    // Effective duration = node duration minus skipped portion (Item 3 — split duration)
    const effectiveDur = Math.max(0, nodeDur - intraNodeOffset);

    source.start(contextTime, offset, effectiveDur > 0 ? effectiveDur : undefined);
    source.onended = () => {
      this.sources.delete(node.id);
    };

    this.sources.set(node.id, { source, gain: gainNode, panner: pannerNode });
    return source;
  }

  /* ────── Stop / Cleanup ────── */

  stopNode(nodeId) {
    const s = this.sources.get(nodeId);
    if (s) {
      try { s.source.stop(); } catch (_) {}
      try { s.source.disconnect(); } catch (_) {}
      this.sources.delete(nodeId);
    }
  }

  stopAll() {
    for (const id of [...this.sources.keys()]) {
      this.stopNode(id);
    }
  }

  removeNodeBuffer(nodeId) {
    this.buffers.delete(nodeId);
    this.invalidatePitchCache(nodeId);
    this.stopNode(nodeId);
  }

  dispose() {
    this.stopAll();
    this.buffers.clear();
    this._pitchCache.clear();
    if (this._ctx) {
      this._ctx.close();
      this._ctx = null;
    }
  }
}

// ── Singleton Access ────────────────────────────────────────────
export function getEngine() {
  if (!_instance) {
    _instance = new AudioEngine();
  }
  return _instance;
}

export const engine = new Proxy({}, {
  get(_, prop) { return getEngine()[prop]; },
});

export default AudioEngine;
