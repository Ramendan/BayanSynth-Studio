/**
 * BayanSynth Studio API client
 */

const API_BASE = '/api';

export async function checkStatus() {
  const res = await fetch(`${API_BASE}/status`);
  return res.json();
}

export async function synthesize({ text, voice, speed, seed, autoTashkeel }) {
  const res = await fetch(`${API_BASE}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: voice || null,
      speed: speed || 1.0,
      seed: seed || 42,
      auto_tashkeel: autoTashkeel !== false,
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

export async function diacritize(text) {
  const res = await fetch(`${API_BASE}/tashkeel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function listVoices() {
  const res = await fetch(`${API_BASE}/voices`);
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
