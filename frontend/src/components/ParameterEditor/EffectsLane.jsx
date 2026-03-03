/**
 * BayanSynth Studio — Effects Lane
 *
 * Per-node audio effects: Reverb, Delay, Chorus, EQ.
 * Each effect has an enable toggle + parameter sliders.
 * Values are stored in node.effects (object with sub-objects).
 */

import React, { useMemo, useCallback, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  updateNodeAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';

const DEFAULT_EFFECTS = {
  reverb:  { enabled: false, mix: 0.3, decay: 2.0, preDelay: 0.02 },
  delay:   { enabled: false, time: 0.25, feedback: 0.3, mix: 0.2 },
  chorus:  { enabled: false, rate: 1.5, depth: 0.5, mix: 0.3 },
  eq:      { enabled: false, lowGain: 0, midGain: 0, highGain: 0 },
};

export default function EffectsLane({ width = 800 }) {
  const tracks = useAtomValue(tracksAtom);
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const pushed = useRef(false);

  const selectedNode = useMemo(() => {
    for (const track of tracks) {
      const node = track.nodes.find(n => n.id === selectedNodeId);
      if (node) return node;
    }
    return null;
  }, [tracks, selectedNodeId]);

  const effects = selectedNode?.effects || DEFAULT_EFFECTS;

  const handleChange = useCallback((effectKey, paramKey, value) => {
    if (!selectedNode) return;
    if (!pushed.current) { pushHistory(); pushed.current = true; }
    const updated = {
      ...effects,
      [effectKey]: {
        ...(effects[effectKey] || DEFAULT_EFFECTS[effectKey]),
        [paramKey]: typeof value === 'boolean' ? value : parseFloat(value),
      },
    };
    updateNode({ id: selectedNode.id, effects: updated });
  }, [selectedNode, effects, updateNode, pushHistory]);

  const handleSliderUp = useCallback(() => { pushed.current = false; }, []);

  const handleReset = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    updateNode({ id: selectedNode.id, effects: { ...DEFAULT_EFFECTS } });
  }, [selectedNode, pushHistory, updateNode]);

  if (!selectedNode) {
    return (
      <div className="param-lane effects-lane empty">
        <span className="param-lane-hint">Select a note to edit effects</span>
      </div>
    );
  }

  const reverb = effects.reverb || DEFAULT_EFFECTS.reverb;
  const delay = effects.delay || DEFAULT_EFFECTS.delay;
  const chorus = effects.chorus || DEFAULT_EFFECTS.chorus;
  const eq = effects.eq || DEFAULT_EFFECTS.eq;

  return (
    <div className="param-lane effects-lane">
      <button className="param-lane-reset" onClick={handleReset} title="Reset effects">⟲</button>
      <div className="effects-grid">

        {/* Reverb */}
        <div className="effect-group" style={{ borderColor: reverb.enabled ? '#00f0ff44' : undefined }}>
          <div className="effect-toggle">
            <h4 style={{ color: reverb.enabled ? '#00f0ff' : 'var(--text-dim)' }}>Reverb</h4>
            <label className="toggle">
              <input type="checkbox" checked={reverb.enabled}
                onChange={(e) => handleChange('reverb', 'enabled', e.target.checked)} />
            </label>
          </div>
          <div className="effect-slider">
            <label>Mix</label>
            <input type="range" min="0" max="1" step="0.05" value={reverb.mix}
              disabled={!reverb.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('reverb', 'mix', e.target.value)} />
            <span className="effect-value">{(reverb.mix * 100).toFixed(0)}%</span>
          </div>
          <div className="effect-slider">
            <label>Decay</label>
            <input type="range" min="0.1" max="8" step="0.1" value={reverb.decay}
              disabled={!reverb.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('reverb', 'decay', e.target.value)} />
            <span className="effect-value">{reverb.decay.toFixed(1)}s</span>
          </div>
          <div className="effect-slider">
            <label>Pre-Delay</label>
            <input type="range" min="0" max="0.1" step="0.005" value={reverb.preDelay}
              disabled={!reverb.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('reverb', 'preDelay', e.target.value)} />
            <span className="effect-value">{(reverb.preDelay * 1000).toFixed(0)}ms</span>
          </div>
        </div>

        {/* Delay */}
        <div className="effect-group" style={{ borderColor: delay.enabled ? '#ff2dcc44' : undefined }}>
          <div className="effect-toggle">
            <h4 style={{ color: delay.enabled ? '#ff2dcc' : 'var(--text-dim)' }}>Delay</h4>
            <label className="toggle">
              <input type="checkbox" checked={delay.enabled}
                onChange={(e) => handleChange('delay', 'enabled', e.target.checked)} />
            </label>
          </div>
          <div className="effect-slider">
            <label>Time</label>
            <input type="range" min="0.05" max="1" step="0.05" value={delay.time}
              disabled={!delay.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('delay', 'time', e.target.value)} />
            <span className="effect-value">{(delay.time * 1000).toFixed(0)}ms</span>
          </div>
          <div className="effect-slider">
            <label>Feedback</label>
            <input type="range" min="0" max="0.9" step="0.05" value={delay.feedback}
              disabled={!delay.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('delay', 'feedback', e.target.value)} />
            <span className="effect-value">{(delay.feedback * 100).toFixed(0)}%</span>
          </div>
          <div className="effect-slider">
            <label>Mix</label>
            <input type="range" min="0" max="1" step="0.05" value={delay.mix}
              disabled={!delay.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('delay', 'mix', e.target.value)} />
            <span className="effect-value">{(delay.mix * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Chorus */}
        <div className="effect-group" style={{ borderColor: chorus.enabled ? '#a855f744' : undefined }}>
          <div className="effect-toggle">
            <h4 style={{ color: chorus.enabled ? '#a855f7' : 'var(--text-dim)' }}>Chorus</h4>
            <label className="toggle">
              <input type="checkbox" checked={chorus.enabled}
                onChange={(e) => handleChange('chorus', 'enabled', e.target.checked)} />
            </label>
          </div>
          <div className="effect-slider">
            <label>Rate</label>
            <input type="range" min="0.1" max="5" step="0.1" value={chorus.rate}
              disabled={!chorus.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('chorus', 'rate', e.target.value)} />
            <span className="effect-value">{chorus.rate.toFixed(1)}Hz</span>
          </div>
          <div className="effect-slider">
            <label>Depth</label>
            <input type="range" min="0" max="1" step="0.05" value={chorus.depth}
              disabled={!chorus.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('chorus', 'depth', e.target.value)} />
            <span className="effect-value">{(chorus.depth * 100).toFixed(0)}%</span>
          </div>
          <div className="effect-slider">
            <label>Mix</label>
            <input type="range" min="0" max="1" step="0.05" value={chorus.mix}
              disabled={!chorus.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('chorus', 'mix', e.target.value)} />
            <span className="effect-value">{(chorus.mix * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* EQ */}
        <div className="effect-group" style={{ borderColor: eq.enabled ? '#ffd70044' : undefined }}>
          <div className="effect-toggle">
            <h4 style={{ color: eq.enabled ? '#ffd700' : 'var(--text-dim)' }}>EQ</h4>
            <label className="toggle">
              <input type="checkbox" checked={eq.enabled}
                onChange={(e) => handleChange('eq', 'enabled', e.target.checked)} />
            </label>
          </div>
          <div className="effect-slider">
            <label>Low</label>
            <input type="range" min="-12" max="12" step="0.5" value={eq.lowGain}
              disabled={!eq.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('eq', 'lowGain', e.target.value)} />
            <span className="effect-value">{eq.lowGain > 0 ? '+' : ''}{eq.lowGain.toFixed(1)}dB</span>
          </div>
          <div className="effect-slider">
            <label>Mid</label>
            <input type="range" min="-12" max="12" step="0.5" value={eq.midGain}
              disabled={!eq.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('eq', 'midGain', e.target.value)} />
            <span className="effect-value">{eq.midGain > 0 ? '+' : ''}{eq.midGain.toFixed(1)}dB</span>
          </div>
          <div className="effect-slider">
            <label>High</label>
            <input type="range" min="-12" max="12" step="0.5" value={eq.highGain}
              disabled={!eq.enabled}
              onMouseDown={() => { pushed.current = false; }}
              onMouseUp={handleSliderUp}
              onChange={(e) => handleChange('eq', 'highGain', e.target.value)} />
            <span className="effect-value">{eq.highGain > 0 ? '+' : ''}{eq.highGain.toFixed(1)}dB</span>
          </div>
        </div>

      </div>
    </div>
  );
}
