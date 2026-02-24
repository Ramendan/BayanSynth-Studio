// AudioEngine — Web Audio API playback with speed + volume control.
//
// Note: SoundTouchJS relied on AudioContext.createScriptProcessor which was
// removed in Chromium 111. Electron 31 ships Chromium 126, so that path
// crashes silently. We use native BufferSource.playbackRate for speed control
// (pitch shifts slightly during preview, but export applies real pitch-shift
// via librosa on the backend). AudioContext is created lazily on first use so
// we never violate the browser autoplay policy.

let _instance = null;

class AudioEngine {
  constructor() {
    this._ctx = null;
    this.sources = new Map();
  }

  get ctx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  async loadAudio(url) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  async playNode(node, onEnd) {
    if (!node.audioUrl) return;

    // Stop any prior playback of this node
    this.stopNode(node.id);

    const buffer = await this.loadAudio(node.audioUrl);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    // playbackRate shifts pitch slightly during preview but keeps the engine
    // simple and compatible with all Electron/Chrome versions.
    source.playbackRate.value = Math.max(0.1, Math.min(4.0, node.speed || 1.0));

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = Math.max(0, Math.min(2, node.volume || 1.0));

    source.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    source.start(0);
    source.onended = () => {
      this.sources.delete(node.id);
      if (onEnd) onEnd();
    };

    this.sources.set(node.id, { source, gainNode });
  }

  stopNode(nodeId) {
    const s = this.sources.get(nodeId);
    if (s) {
      try { s.source.stop(); } catch (_) { /* already stopped */ }
      try { s.source.disconnect(); } catch (_) {}
      this.sources.delete(nodeId);
    }
  }

  stopAll() {
    for (const id of [...this.sources.keys()]) {
      this.stopNode(id);
    }
  }
}

// Lazy singleton — AudioContext created on first user interaction.
export function getEngine() {
  if (!_instance) _instance = new AudioEngine();
  return _instance;
}

// Named export kept for backward compatibility with App.jsx import.
export const engine = new Proxy({}, {
  get(_, prop) { return getEngine()[prop]; },
});
