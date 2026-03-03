/**
 * BayanSynth Studio — Transport Controller
 *
 * Manages play/stop/pause/seek/loop for the timeline.
 * Schedules all nodes using the AudioEngine and drives
 * the playhead position via requestAnimationFrame.
 */

import { getEngine } from './AudioEngine';

class TransportController {
  constructor() {
    this._playing = false;
    this._paused = false;
    this._startTime = 0;
    this._startOffset = 0;
    this._animFrameId = null;
    this._onPlayheadUpdate = null;
    this._onPlaybackEnd = null;
    this._scheduledSources = [];
    this._looping = false;
    this._loopStart = 0;
    this._loopEnd = 16;
    this._endTime = null;      // End Node position (seconds)
  }

  get isPlaying() {
    return this._playing;
  }

  get isPaused() {
    return this._paused;
  }

  get currentPosition() {
    if (!this._playing) return this._startOffset;
    const engine = getEngine();
    const elapsed = engine.currentTime - this._startTime;
    return this._startOffset + elapsed;
  }

  onPlayheadUpdate(cb) {
    this._onPlayheadUpdate = cb;
  }

  onPlaybackEnd(cb) {
    this._onPlaybackEnd = cb;
  }

  /**
   * Play the timeline from a given position.
   * @param {Object[]} tracks — array of track objects
   * @param {number} fromTime — start position in seconds
   * @param {Object} options — { loop, loopStart, loopEnd, endTime }
   */
  async play(tracks, fromTime = 0, options = {}) {
    const engine = getEngine();

    // Stop any existing playback first
    this.stop();

    this._playing = true;
    this._paused = false;
    this._startOffset = fromTime;
    this._startTime = engine.ctx.currentTime;
    this._looping = options.loop || false;
    this._loopStart = options.loopStart || 0;
    this._loopEnd = options.loopEnd || 16;
    this._endTime = options.endTime ?? null;

    // Determine which tracks to play (handle solo/mute/visible)
    const hasSolo = tracks.some(t => t.solo);
    const activeTracks = tracks.filter(t => {
      if (t.mute) return false;
      if (t.visible === false) return false;
      if (hasSolo && !t.solo) return false;
      return true;
    });

    const contextNow = engine.ctx.currentTime;

    for (const track of activeTracks) {
      // Sort by start time so prevNode tracking is correct for transitions
      const sortedNodes = [...track.nodes].sort((a, b) => a.start_time - b.start_time);
      let lastScheduledNode = null;

      for (const node of sortedNodes) {
        if (!node.audioUrl) continue;

        const nodeEnd = node.start_time + (node.duration || 0);
        if (nodeEnd <= fromTime) continue;
        // Skip nodes that haven't started yet... unless they start during playback
        if (node.start_time > fromTime + 600) continue; // arbitrary lookahead limit

        // Mid-node seek: if playhead is inside this node, skip into it
        const intraNodeOffset = Math.max(0, fromTime - node.start_time);
        const delay = Math.max(0, node.start_time - fromTime);
        const contextWhen = contextNow + delay;

        try {
          const source = await engine.scheduleNode(
            node, contextWhen, track.volume, track.pan || 0, intraNodeOffset, lastScheduledNode
          );
          if (source) {
            this._scheduledSources.push(source);
          }
        } catch (err) {
          console.warn(`[Transport] Failed to schedule ${node.id}:`, err.message);
        }

        lastScheduledNode = node;
      }
    }

    this._startPlayheadAnimation(tracks);
  }

  pause() {
    if (!this._playing) return;
    this._startOffset = this.currentPosition;
    this._playing = false;
    this._paused = true;
    getEngine().stopAll();
    this._cancelAnimation();
  }

  async resume(tracks) {
    if (!this._paused) return;
    await this.play(tracks, this._startOffset, {
      loop: this._looping,
      loopStart: this._loopStart,
      loopEnd: this._loopEnd,
      endTime: this._endTime,
    });
  }

  stop() {
    this._playing = false;
    this._paused = false;
    this._startOffset = 0;
    getEngine().stopAll();
    this._cancelAnimation();
    this._scheduledSources = [];
    if (this._onPlayheadUpdate) {
      this._onPlayheadUpdate(0);
    }
  }

  async seek(time, tracks) {
    const wasPlaying = this._playing;
    this.stop();
    this._startOffset = time;
    if (this._onPlayheadUpdate) {
      this._onPlayheadUpdate(time);
    }
    if (wasPlaying && tracks) {
      await this.play(tracks, time, {
        loop: this._looping,
        loopStart: this._loopStart,
        loopEnd: this._loopEnd,
        endTime: this._endTime,
      });
    }
  }

  async toggle(tracks, fromTime = 0) {
    if (this._playing) {
      this.pause();
    } else if (this._paused) {
      await this.resume(tracks);
    } else {
      await this.play(tracks, fromTime);
    }
  }

  _startPlayheadAnimation(tracks) {
    this._cancelAnimation();

    const tick = () => {
      if (!this._playing) return;

      const pos = this.currentPosition;

      // Determine effective end time
      const endTime = this._endTime ?? tracks.reduce((max, t) =>
        Math.max(max, ...t.nodes.map(n => n.start_time + (n.duration || 0))),
        0
      );

      // Loop handling
      if (this._looping && pos >= (this._endTime ?? this._loopEnd)) {
        // Cancel animation before restarting to prevent race
        this._cancelAnimation();
        this.play(tracks, this._loopStart, {
          loop: true,
          loopStart: this._loopStart,
          loopEnd: this._endTime ?? this._loopEnd,
          endTime: this._endTime,
        });
        return;
      }

      if (this._onPlayheadUpdate) {
        this._onPlayheadUpdate(pos);
      }

      // Check if playback has passed end
      if (pos >= endTime && !this._looping) {
        this.stop();
        if (this._onPlaybackEnd) {
          this._onPlaybackEnd();
        }
        return;
      }

      this._animFrameId = requestAnimationFrame(tick);
    };

    this._animFrameId = requestAnimationFrame(tick);
  }

  _cancelAnimation() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  dispose() {
    this.stop();
    this._onPlayheadUpdate = null;
    this._onPlaybackEnd = null;
  }
}

// ── Singleton ───────────────────────────────────────────────────
let _instance = null;

export function getTransport() {
  if (!_instance) {
    _instance = new TransportController();
  }
  return _instance;
}

export default TransportController;
