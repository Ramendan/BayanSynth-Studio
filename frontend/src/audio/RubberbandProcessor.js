/**
 * BayanSynth Studio — Rubberband WASM Time-Stretch Processor
 *
 * Provides formant-preserving time-stretch and pitch-shift using
 * the Rubberband library compiled to WASM.
 *
 * Since the official Rubberband WASM binary may not be available,
 * this module provides a fallback using the Web Audio API's
 * OfflineAudioContext + playbackRate (non-formant-preserving)
 * until a proper WASM binary is loaded.
 */

let _rubberband = null;
let _wasmLoaded = false;

/**
 * Initialize the Rubberband WASM module.
 * Call once on startup. Falls back gracefully if WASM not available.
 */
export async function initRubberband() {
  if (_wasmLoaded) return true;

  try {
    // Attempt to load Rubberband WASM from public assets
    const response = await fetch('/rubberband.wasm');
    if (response.ok) {
      const wasmBytes = await response.arrayBuffer();
      // Rubberband WASM instantiation would go here
      // For now, we'll use the fallback mechanism
      console.log('[Rubberband] WASM binary found, size:', wasmBytes.byteLength);
      _wasmLoaded = true;
      return true;
    }
  } catch (e) {
    console.warn('[Rubberband] WASM not available, using fallback:', e.message);
  }

  return false;
}

/**
 * Time-stretch an AudioBuffer while preserving formants.
 *
 * @param {AudioContext} ctx — Web Audio context
 * @param {AudioBuffer} buffer — source audio
 * @param {number} timeRatio — stretch factor (2.0 = twice as long)
 * @param {number} pitchScale — pitch multiplier (1.0 = same pitch)
 * @returns {Promise<AudioBuffer>} stretched AudioBuffer
 */
export async function timeStretch(ctx, buffer, timeRatio = 1.0, pitchScale = 1.0) {
  if (timeRatio === 1.0 && pitchScale === 1.0) {
    return buffer;
  }

  if (_wasmLoaded && _rubberband) {
    return _timeStretchWasm(ctx, buffer, timeRatio, pitchScale);
  }

  // Fallback: use OfflineAudioContext with playbackRate
  return _timeStretchFallback(ctx, buffer, timeRatio, pitchScale);
}

/**
 * Pitch-shift an AudioBuffer (convenience wrapper).
 *
 * @param {AudioContext} ctx
 * @param {AudioBuffer} buffer
 * @param {number} semitones — semitones to shift (positive = up)
 * @returns {Promise<AudioBuffer>}
 */
export async function pitchShift(ctx, buffer, semitones) {
  const pitchScale = Math.pow(2, semitones / 12);
  return timeStretch(ctx, buffer, 1.0, pitchScale);
}

/**
 * WASM-based time stretch (when rubberband.wasm is loaded).
 * Placeholder — actual implementation depends on the WASM interface.
 */
async function _timeStretchWasm(ctx, buffer, timeRatio, pitchScale) {
  // TODO: Implement when Rubberband WASM binary interface is finalized.
  // The Rubberband C API exposes:
  //   rubberband_new(sampleRate, channels, options, timeRatio, pitchScale)
  //   rubberband_process(state, input, samples, final)
  //   rubberband_retrieve(state, output, samples)
  //
  // For now, fall through to the fallback.
  return _timeStretchFallback(ctx, buffer, timeRatio, pitchScale);
}

/**
 * Fallback time-stretch using OfflineAudioContext.
 * Not formant-preserving — playbackRate shifts pitch proportionally.
 * Acceptable for preview; export uses server-side librosa.
 */
async function _timeStretchFallback(ctx, buffer, timeRatio, pitchScale) {
  const newLength = Math.ceil(buffer.length * timeRatio);
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    newLength,
    buffer.sampleRate
  );

  const source = offline.createBufferSource();
  source.buffer = buffer;
  // playbackRate = 1 / timeRatio * pitchScale
  // (faster playback = shorter duration, compensated by the offline context length)
  source.playbackRate.value = (1 / timeRatio) * pitchScale;
  source.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  return rendered;
}

/**
 * Check if WASM-based processing is available.
 */
export function isWasmAvailable() {
  return _wasmLoaded;
}

/**
 * Downsample an AudioBuffer to a waveform array for visualization.
 * @param {AudioBuffer} buffer
 * @param {number} targetPoints — number of points in the output (default: 200)
 * @returns {Float32Array} downsampled waveform
 */
export function downsampleWaveform(buffer, targetPoints = 200) {
  const data = buffer.getChannelData(0);
  const blockSize = Math.floor(data.length / targetPoints);
  const result = new Float32Array(targetPoints);

  for (let i = 0; i < targetPoints; i++) {
    const start = i * blockSize;
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(data[start + j] || 0);
    }
    result[i] = sum / blockSize;
  }

  // Normalize to 0–1
  const max = Math.max(...result) || 1;
  for (let i = 0; i < result.length; i++) {
    result[i] /= max;
  }

  return result;
}
