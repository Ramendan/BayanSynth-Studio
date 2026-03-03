/**
 * BayanSynth Studio — DYN Lane  (Pass 2)
 *
 * Dynamics (volume envelope) automation lane.
 * Waveform ghost background + automation curve overlay.
 * Pencil draws, Arrow drags control points.
 * pushHistory on mouseDown so drawing is one undo step.
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Line } from 'react-konva';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  updateNodeAtom,
  bpmAtom,
  activeToolAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';
import { PIXELS_PER_BEAT } from '../../utils/constants';

const LANE_HEIGHT = 120;
const BAR_WIDTH = 3;

export default function DynLane({ width = 800, zoom = 1, panX = 0 }) {
  const tracks = useAtomValue(tracksAtom);
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const activeTool = useAtomValue(activeToolAtom);
  const bpm = useAtomValue(bpmAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const isDrawing = useRef(false);

  // Find selected node
  const selectedNode = useMemo(() => {
    for (const track of tracks) {
      const node = track.nodes.find(n => n.id === selectedNodeId);
      if (node) return { ...node, track };
    }
    return null;
  }, [tracks, selectedNodeId]);

  const dynPoints = selectedNode?.automationDYN || [];

  const timeToX = useCallback((time) => {
    return (time * bpm / 60) * PIXELS_PER_BEAT * zoom - panX;
  }, [bpm, zoom, panX]);

  const xToTime = useCallback((x) => {
    return ((x + panX) / (PIXELS_PER_BEAT * zoom)) * (60 / bpm);
  }, [bpm, zoom, panX]);

  const valueToY = (value) => LANE_HEIGHT * (1 - Math.max(0, Math.min(1, value)));
  const yToValue = (y) => Math.max(0, Math.min(1, 1 - y / LANE_HEIGHT));

  // Push history once on mouse-down (whole draw stroke = one undo step)
  const handleMouseDown = useCallback(() => {
    if (!selectedNode) return;
    if (activeTool !== 'pencil' && activeTool !== 'arrow') return;
    pushHistory();
    isDrawing.current = true;
  }, [selectedNode, activeTool, pushHistory]);

  const handleDraw = useCallback((e) => {
    if (!isDrawing.current || !selectedNode) return;
    if (activeTool !== 'pencil' && activeTool !== 'arrow') return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const time = xToTime(pos.x);
    const value = yToValue(pos.y);

    const existing = [...(selectedNode.automationDYN || [])];
    const idx = existing.findIndex(p => Math.abs(p.time - time) < 0.02);
    if (idx >= 0) {
      existing[idx] = { time, value };
    } else {
      existing.push({ time, value });
      existing.sort((a, b) => a.time - b.time);
    }
    updateNode({ id: selectedNode.id, automationDYN: existing });
  }, [activeTool, selectedNode, xToTime, updateNode]);

  const handleMouseUp = useCallback(() => { isDrawing.current = false; }, []);

  // Arrow-tool: drag existing control points
  const handlePointDrag = useCallback((index, e) => {
    if (!selectedNode) return;
    const x = e.target.x() + 3; // offset for rect center
    const y = e.target.y() + 3;
    const time = xToTime(x);
    const value = yToValue(y);

    const existing = [...(selectedNode.automationDYN || [])];
    existing[index] = { time, value };
    existing.sort((a, b) => a.time - b.time);
    updateNode({ id: selectedNode.id, automationDYN: existing });
  }, [selectedNode, xToTime, updateNode]);

  // Reset to flat line at 0.7
  const handleReset = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    updateNode({ id: selectedNode.id, automationDYN: [] });
  }, [selectedNode, pushHistory, updateNode]);

  // Waveform ghost (dim background)
  const waveformLine = useMemo(() => {
    const wf = selectedNode?.waveformData;
    if (!wf || wf.length === 0) return [];
    const startX = timeToX(selectedNode.start_time);
    const dur = selectedNode.duration || 1;
    const endX = timeToX(selectedNode.start_time + dur);
    const nodeW = endX - startX;
    const pts = [];
    for (let i = 0; i < wf.length; i++) {
      const x = startX + (i / wf.length) * nodeW;
      const amp = Math.abs(wf[i]) * (LANE_HEIGHT * 0.4);
      pts.push(x, LANE_HEIGHT / 2 - amp);
    }
    // Mirror bottom
    for (let i = wf.length - 1; i >= 0; i--) {
      const x = startX + (i / wf.length) * nodeW;
      const amp = Math.abs(wf[i]) * (LANE_HEIGHT * 0.4);
      pts.push(x, LANE_HEIGHT / 2 + amp);
    }
    return pts;
  }, [selectedNode, timeToX]);

  // Bars
  const bars = useMemo(() => {
    if (!selectedNode) return [];
    const startX = timeToX(selectedNode.start_time);
    const duration = selectedNode.duration || 1;
    const numBars = Math.ceil((duration * bpm / 60) * PIXELS_PER_BEAT * zoom / (BAR_WIDTH + 1));

    return Array.from({ length: numBars }, (_, i) => {
      const x = startX + i * (BAR_WIDTH + 1);
      const t = selectedNode.start_time + (i / numBars) * duration;
      let value = 0.7;
      if (dynPoints.length >= 2) {
        const after = dynPoints.findIndex(p => p.time >= t);
        if (after <= 0) {
          value = dynPoints[0]?.value ?? 0.7;
        } else {
          const before = after - 1;
          const ratio = (t - dynPoints[before].time) / (dynPoints[after].time - dynPoints[before].time);
          value = dynPoints[before].value + ratio * (dynPoints[after].value - dynPoints[before].value);
        }
      } else if (dynPoints.length === 1) {
        value = dynPoints[0].value;
      }
      const h = value * LANE_HEIGHT;
      return { x, y: LANE_HEIGHT - h, w: BAR_WIDTH, h, value };
    });
  }, [selectedNode, dynPoints, bpm, zoom, timeToX]);

  const linePoints = useMemo(() => {
    return dynPoints.flatMap(p => [timeToX(p.time), valueToY(p.value)]);
  }, [dynPoints, timeToX]);

  if (!selectedNode) {
    return (
      <div className="param-lane dyn-lane empty">
        <span className="param-lane-hint">Select a note to edit dynamics</span>
      </div>
    );
  }

  return (
    <div className="param-lane dyn-lane">
      <button className="param-lane-reset" onClick={handleReset} title="Reset dynamics">⟲</button>
      <Stage
        width={width}
        height={LANE_HEIGHT}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleDraw}
      >
        <Layer>
          <Rect x={0} y={0} width={width} height={LANE_HEIGHT} fill="#0d0d12" />
          <Line points={[0, LANE_HEIGHT / 2, width, LANE_HEIGHT / 2]} stroke="#222" strokeWidth={1} dash={[4, 4]} />

          {/* Waveform ghost */}
          {waveformLine.length >= 4 && (
            <Line points={waveformLine} fill="#00f0ff" opacity={0.06} closed listening={false} />
          )}

          {bars.map((bar, i) => (
            <Rect key={i} x={bar.x} y={bar.y} width={bar.w} height={bar.h}
              fill="#00f0ff" opacity={0.6} cornerRadius={1} />
          ))}

          {linePoints.length >= 4 && (
            <Line points={linePoints} stroke="#00f0ff" strokeWidth={2} tension={0.3}
              shadowColor="#00f0ff" shadowBlur={6} shadowOpacity={0.5} listening={false} />
          )}

          {dynPoints.map((p, i) => (
            <Rect key={i} x={timeToX(p.time) - 3} y={valueToY(p.value) - 3}
              width={6} height={6} fill="#00f0ff" stroke="#fff" strokeWidth={1} cornerRadius={1}
              draggable={activeTool === 'arrow'}
              onDragMove={(e) => handlePointDrag(i, e)}
              onMouseEnter={(e) => { e.target.getStage().container().style.cursor = activeTool === 'arrow' ? 'grab' : 'crosshair'; }}
              onMouseLeave={(e) => { e.target.getStage().container().style.cursor = 'default'; }}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
