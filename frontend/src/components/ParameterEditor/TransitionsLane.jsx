/**
 * BayanSynth Studio — Transitions Lane
 *
 * Shows transitions (crossfades) between adjacent nodes on the same track.
 * For each pair of overlapping or adjacent nodes, provides:
 *  - Crossfade duration slider
 *  - Transition curve type (linear, exponential, cosine)
 *
 * Transition data is stored on the LATER node as `transition`.
 */

import React, { useMemo, useCallback, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  selectedTrackAtom,
  updateNodeAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';

const TRANSITION_TYPES = [
  { value: 'linear', label: 'Linear' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'cosine', label: 'Cosine (S-Curve)' },
  { value: 'none', label: 'None (Cut)' },
];

const DEFAULT_TRANSITION = { type: 'linear', duration: 0.1 };

export default function TransitionsLane({ width = 800 }) {
  const tracks = useAtomValue(tracksAtom);
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const selectedTrack = useAtomValue(selectedTrackAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const pushed = useRef(false);

  // Find all adjacent node pairs on the selected track
  const pairs = useMemo(() => {
    if (!selectedTrack || selectedTrack.nodes.length < 2) return [];
    const sorted = [...selectedTrack.nodes].sort((a, b) => a.start_time - b.start_time);
    const result = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gap = curr.start_time - (prev.start_time + (prev.duration || 0));
      // Only show for adjacent/overlapping nodes (gap < 0.5s)
      if (gap < 0.5) {
        result.push({
          prevNode: prev,
          currNode: curr,
          gap,
          transition: curr.transition || DEFAULT_TRANSITION,
        });
      }
    }
    return result;
  }, [selectedTrack]);

  const handleChange = useCallback((nodeId, key, value) => {
    if (!pushed.current) { pushHistory(); pushed.current = true; }
    // Read existing transition
    const track = tracks.find(t => t.nodes.some(n => n.id === nodeId));
    const node = track?.nodes.find(n => n.id === nodeId);
    const existing = node?.transition || { ...DEFAULT_TRANSITION };
    const updated = {
      ...existing,
      [key]: key === 'type' ? value : parseFloat(value),
    };
    updateNode({ id: nodeId, transition: updated });
  }, [tracks, updateNode, pushHistory]);

  const handleSliderUp = useCallback(() => { pushed.current = false; }, []);

  if (!selectedTrack) {
    return (
      <div className="param-lane transitions-lane empty">
        <span className="param-lane-hint">Select a track to view transitions</span>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="param-lane transitions-lane">
        <div className="transition-empty">
          No adjacent nodes found on this track. Place notes close together to create transitions.
        </div>
      </div>
    );
  }

  return (
    <div className="param-lane transitions-lane">
      <div className="transition-list">
        {pairs.map(({ prevNode, currNode, gap, transition }, i) => {
          const isSelected = currNode.id === selectedNodeId || prevNode.id === selectedNodeId;
          return (
            <div
              key={i}
              className="transition-item"
              style={{
                borderColor: isSelected ? 'var(--magenta)' : undefined,
                background: isSelected ? '#ff2dcc08' : undefined,
              }}
            >
              <div className="transition-nodes">
                <strong style={{ color: 'var(--text)' }}>
                  {prevNode.text?.slice(0, 12) || '(empty)'} → {currNode.text?.slice(0, 12) || '(empty)'}
                </strong>
                <br />
                Gap: {gap < 0 ? `${(-gap * 1000).toFixed(0)}ms overlap` : `${(gap * 1000).toFixed(0)}ms`}
              </div>

              <select
                value={transition.type}
                onChange={(e) => handleChange(currNode.id, 'type', e.target.value)}
              >
                {TRANSITION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                Duration
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={transition.duration}
                  onMouseDown={() => { pushed.current = false; }}
                  onMouseUp={handleSliderUp}
                  onChange={(e) => handleChange(currNode.id, 'duration', e.target.value)}
                />
                <span style={{ fontFamily: 'monospace', fontSize: 10, minWidth: 40 }}>
                  {(transition.duration * 1000).toFixed(0)}ms
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
