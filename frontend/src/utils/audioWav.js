/**
 * Convert browser-recorded audio blobs (webm/ogg/etc.) to PCM WAV files.
 * This avoids backend decoder/ffmpeg differences for microphone recordings.
 */

function audioBufferToWavBlob(audioBuffer) {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Mix down to mono and write PCM16
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    let sample = 0;
    for (let c = 0; c < channels.length; c++) {
      sample += channels[c][i] || 0;
    }
    sample /= Math.max(1, channels.length);
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function blobToWavFile(blob, fileNameStem = 'voice') {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    // If WebAudio isn't available, fall back to original blob.
    return new File([blob], `${fileNameStem}.wav`, { type: blob.type || 'application/octet-stream' });
  }

  const ctx = new Ctx();
  try {
    const arr = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arr.slice(0));
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    return new File([wavBlob], `${fileNameStem}.wav`, { type: 'audio/wav' });
  } finally {
    try { await ctx.close(); } catch { /* ignore */ }
  }
}
