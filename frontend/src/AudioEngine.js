import SoundTouch from 'soundtouchjs';

class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.sources = new Map();
  }

  async loadAudio(url) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  async playNode(node, onEnd) {
    if (!node.audioUrl) return;
    
    const buffer = await this.loadAudio(node.audioUrl);
    
    // If speed is 1.0, use native playback
    if (node.speed === 1.0) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      
      const gainNode = this.ctx.createGain();
      gainNode.gain.value = node.volume || 1.0;
      
      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      
      source.start(0);
      source.onended = onEnd;
      this.sources.set(node.id, { source, gainNode });
      return;
    }

    // Use SoundTouchJS for high-quality time stretching
    const st = new SoundTouch.SoundTouch();
    st.tempo = node.speed;
    if (node.pitch_shift) {
      st.pitchSemitones = node.pitch_shift;
    }
    
    const source = new SoundTouch.WebAudioBufferSource(buffer);
    const filter = new SoundTouch.SimpleFilter(source, st);
    
    const scriptNode = this.ctx.createScriptProcessor(4096, 1, 1);
    scriptNode.onaudioprocess = (e) => {
      const l = e.outputBuffer.getChannelData(0);
      const framesExtracted = filter.extract(l, 4096);
      if (framesExtracted === 0) {
        scriptNode.disconnect();
        if (onEnd) onEnd();
      }
    };
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = node.volume || 1.0;
    
    scriptNode.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    this.sources.set(node.id, { source: scriptNode, gainNode });
  }

  stopNode(nodeId) {
    const s = this.sources.get(nodeId);
    if (s) {
      if (s.source.stop) s.source.stop();
      else s.source.disconnect();
      this.sources.delete(nodeId);
    }
  }
  
  stopAll() {
    for (const [id, s] of this.sources.entries()) {
      if (s.source.stop) s.source.stop();
      else s.source.disconnect();
    }
    this.sources.clear();
  }
}

export const engine = new AudioEngine();
