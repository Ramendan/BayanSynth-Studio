/**
 * BayanSynth Studio — VIB Lane
 *
 * Vibrato parameter lane with Rate, Depth, and Onset controls.
 * Shows a sine-wave preview of the vibrato effect.
 */

import React, { useMemo, useCallback, useRef } from 'react';
import { Stage, Layer, Rect, Line, Text } from 'react-konva';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  updateNodeAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';

const LANE_HEIGHT = 120;

export default function VibLane({ width = 800 }) {
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

  const vib = selectedNode?.automationVIB || { rate: 5.5, depth: 0, onset: 0.3 };

  const handleChange = useCallback((key, value) => {
    if (!selectedNode) return;
    // Push history once per slider drag (onMouseDown)
    if (!pushed.current) { pushHistory(); pushed.current = true; }
    const newVib = { ...vib, [key]: parseFloat(value) };
    updateNode({ id: selectedNode.id, automationVIB: newVib });
  }, [selectedNode, vib, updateNode, pushHistory]);

  const handleSliderUp = useCallback(() => { pushed.current = false; }, []);

  const handleReset = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    updateNode({ id: selectedNode.id, automationVIB: { rate: 5.5, depth: 0, onset: 0.3 } });
  }, [selectedNode, pushHistory, updateNode]);

  // Generate sine wave preview
  const wavePoints = useMemo(() => {
    if (!selectedNode) return [];
    const duration = selectedNode.duration || 1;
    const points = [];
    const numSamples = Math.min(width, 400);

    for (let i = 0; i < numSamples; i++) {
      const t = (i / numSamples) * duration;
      const x = (i / numSamples) * width;

      // Onset fade-in
      const onsetFade = t < vib.onset ? t / vib.onset : 1;

      // Sine vibrato: depth in cents -> scaled to lane height
      const amplitude = (vib.depth / 200) * LANE_HEIGHT * onsetFade;
      const y = LANE_HEIGHT / 2 + amplitude * Math.sin(2 * Math.PI * vib.rate * t);

      points.push(x, y);
    }
    return points;
  }, [selectedNode, vib, width]);

  if (!selectedNode) {
    return (
      <div className="param-lane vib-lane empty">
        <span className="param-lane-hint">Select a note to edit vibrato</span>
      </div>
    );
  }

  return (
    <div className="param-lane vib-lane">
      {/* Controls row */}
      <div className="vib-controls">
        <button className="param-lane-reset" onClick={handleReset} title="Reset vibrato">⟲</button>
        <label className="vib-control">
          <span>Rate</span>
          <input type="range" min="1" max="12" step="0.5" value={vib.rate}
            onMouseDown={() => { pushed.current = false; }}
            onMouseUp={handleSliderUp}
            onChange={(e) => handleChange('rate', e.target.value)} />
          <span className="vib-value">{vib.rate.toFixed(1)} Hz</span>
        </label>
        <label className="vib-control">
          <span>Depth</span>
          <input type="range" min="0" max="200" step="5" value={vib.depth}
            onMouseDown={() => { pushed.current = false; }}
            onMouseUp={handleSliderUp}
            onChange={(e) => handleChange('depth', e.target.value)} />
          <span className="vib-value">{vib.depth}¢</span>
        </label>
        <label className="vib-control">
          <span>Onset</span>
          <input type="range" min="0" max="1" step="0.05" value={vib.onset}
            onMouseDown={() => { pushed.current = false; }}
            onMouseUp={handleSliderUp}
            onChange={(e) => handleChange('onset', e.target.value)} />
          <span className="vib-value">{(vib.onset * 1000).toFixed(0)} ms</span>
        </label>
      </div>

      {/* Waveform preview */}
      <Stage width={width} height={LANE_HEIGHT}>
        <Layer>
          <Rect x={0} y={0} width={width} height={LANE_HEIGHT} fill="#0d0d12" />

          {/* Center line */}
          <Line
            points={[0, LANE_HEIGHT / 2, width, LANE_HEIGHT / 2]}
            stroke="#222"
            strokeWidth={1}
            dash={[4, 4]}
          />

          {/* Onset marker */}
          {vib.onset > 0 && (() => {
            const duration = selectedNode.duration || 1;
            const onsetX = (vib.onset / duration) * width;
            return (
              <>
                <Line
                  points={[onsetX, 0, onsetX, LANE_HEIGHT]}
                  stroke="#ffcc00"
                  strokeWidth={1}
                  dash={[3, 3]}
                  opacity={0.5}
                />
                <Text
                  x={onsetX + 3}
                  y={2}
                  text="onset"
                  fill="#ffcc00"
                  fontSize={9}
                  fontFamily="monospace"
                  opacity={0.6}
                />
              </>
            );
          })()}

          {/* Vibrato sine wave */}
          {wavePoints.length >= 4 && (
            <Line
              points={wavePoints}
              stroke="#a855f7"
              strokeWidth={2}
              tension={0}
              lineCap="round"
              shadowColor="#a855f7"
              shadowBlur={8}
              shadowOpacity={0.5}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
