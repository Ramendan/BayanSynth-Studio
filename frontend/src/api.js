/**
 * BayanSynth Studio — API Client
 *
 * Endpoints:
 *   POST /api/synthesize     — Full TTS synthesis
 *   POST /api/tashkeel       — Arabic diacritization
 *   GET  /api/voices          — List available voice references
 *   POST /api/voices/upload   — Upload voice reference file
 *   POST /api/pitch_detect    — Extract F0 contour
 *   POST /api/export          — Server-side mixdown
 *   POST /api/phonemize       — Buckwalter transliteration
 *   POST /api/audition        — Quick 2s preview synthesis
 *   GET  /api/status          — Backend health check
 */

const API_BASE = '/api';

// ── Setup / first-run ─────────────────────────────
/**
 * Check whether the required model files are present on the backend host.
 * Returns { ready: bool, base_model: bool, lora: bool }.
 * Falls back to { ready: true } when the backend is unreachable (dev mode).
 */
export async function getSetupStatus() {
  try {
    const res = await fetch(`${API_BASE}/setup/status`);
    if (!res.ok) return { ready: true };
    return res.json();
  } catch {
    return { ready: true };
  }
}

/**
 * Open an SSE stream that triggers the background model download and reports
 * live progress back to the caller.
 *
 * @param {(progress: {stage,base_pct,lora_pct,message}) => void} onProgress
 * @param {() => void} onDone   called when stage === 'done'
 * @param {(msg: string) => void} onError  called on error events or lost connection
 * @returns {() => void}  cleanup function — call to close the SSE stream
 */
export function streamModelDownload(onProgress, onDone, onError) {
  const es = new EventSource(`${API_BASE}/setup/download`);

  es.onmessage = (evt) => {
    try {
      const d = JSON.parse(evt.data);
      if (d.type === 'done')        { es.close(); onDone(); }
      else if (d.type === 'error')  { es.close(); onError(d.message || 'Unknown error'); }
      else                          { onProgress(d); }
    } catch {
      // malformed event — ignore
    }
  };

  es.onerror = () => {
    es.close();
    onError('Connection to backend lost. Is the server running?');
  };

  return () => es.close();
}

/**
 * Compose the instruct string from a speaking-style instruction.
 * The backend's BayanSynthTTS.synthesize() auto-appends <|endofprompt|>
 * if missing, so we just pass the raw style text.
 * When empty/null, the backend uses its default instruct.
 */
function composeInstruct(styleText) {
  if (!styleText || !styleText.trim()) return null;
  return styleText.trim();
}

// ── Health ───────────────────────────────────────
export async function checkStatus() {
  const res = await fetch(`${API_BASE}/status`);
  return res.json();
}

// ── Synthesis ────────────────────────────────────
export async function synthesize({ text, voice, speed, seed, autoTashkeel, instruct }) {
  const res = await fetch(`${API_BASE}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: voice || null,
      speed: speed || 1.0,
      seed: seed || 42,
      auto_tashkeel: autoTashkeel !== false,
      instruct: composeInstruct(instruct),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Synthesis failed: ${err}`);
  }

  const duration = parseFloat(res.headers.get('X-Duration') || '0');
  const genTime = parseFloat(res.headers.get('X-Generation-Time') || '0');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  return { url, blob, duration, genTime };
}

// ── Audition (quick short preview) ───────────────
export async function audition({ text, voice, speed, seed, autoTashkeel, instruct, maxDuration = 2.0 }) {
  const res = await fetch(`${API_BASE}/audition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text?.slice(0, 30) || 'مرحبا',
      voice: voice || null,
      speed: speed || 1.0,
      seed: seed || 42,
      auto_tashkeel: autoTashkeel !== false,
      instruct: composeInstruct(instruct),
      max_duration: maxDuration,
    }),
  });

  if (!res.ok) {
    // Fallback to full synthesis if audition endpoint not available
    return synthesize({ text: text?.slice(0, 20), voice, speed, seed, autoTashkeel });
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const duration = parseFloat(res.headers.get('X-Duration') || '0');
  return { url, blob, duration };
}

// ── Tashkeel / Diacritization ────────────────────
export async function diacritize(text) {
  const res = await fetch(`${API_BASE}/tashkeel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

// ── Phonemize (Buckwalter transliteration) ───────
export async function phonemize(text) {
  try {
    const res = await fetch(`${API_BASE}/phonemize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return { phonemes: '' };
    return res.json();
  } catch {
    return { phonemes: '' };
  }
}

// ── Voices ───────────────────────────────────────
export async function listVoices(customDir = null) {
  const params = customDir ? `?voices_dir=${encodeURIComponent(customDir)}` : '';
  const res = await fetch(`${API_BASE}/voices${params}`);
  const data = await res.json();
  return data.voices || [];
}

export async function uploadVoice(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/voices/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

// ── Pitch Detection ──────────────────────────────
export async function pitchDetect(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/pitch_detect`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Pitch detection failed');
  return res.json();
}

// ── Export ────────────────────────────────────────
export async function exportTimeline(tracks, autoTashkeel = true) {
  const res = await fetch(`${API_BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tracks,
      sample_rate: 24000,
      auto_tashkeel: autoTashkeel,
    }),
  });

  if (!res.ok) {
    throw new Error('Export failed');
  }

  const blob = await res.blob();
  return blob;
}

// ── Voice Management ─────────────────────────────
export async function deleteVoice(name) {
  const res = await fetch(`${API_BASE}/voices/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function renameVoice(oldName, newName) {
  const res = await fetch(`${API_BASE}/voices/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_name: oldName, new_name: newName }),
  });
  if (!res.ok) throw new Error('Rename failed');
  return res.json();
}

// ── Pitch Process (server-side librosa, for export) ──
export async function pitchProcess(blob, semitones) {
  const formData = new FormData();
  formData.append('file', blob, 'audio.wav');
  const res = await fetch(`${API_BASE}/pitch_process?semitones=${semitones}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Pitch processing failed');
  const outBlob = await res.blob();
  return { url: URL.createObjectURL(outBlob), blob: outBlob };
}
