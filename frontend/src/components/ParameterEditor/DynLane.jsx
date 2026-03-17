/**
 * BayanSynth Studio — DYN Lane  (Pass 3)
 *
 * Dynamics (volume envelope) automation lane.
 * - Bottom-anchored waveform ghost that matches the audio content exactly.
 * - Floor / Ceil range sliders in the left sidebar to control the output
 *   volume range (floor = gain at curve bottom, ceil = gain at curve top).
 * - Pencil draws control points; handle drag moves them.
 * - pushHistory on mouseDown so the whole stroke = one undo step.
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Line } from 'react-konva';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  updateNodeAtom,
  bpmAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';
import { PIXELS_PER_BEAT } from '../../utils/constants';
const LANE_HEIGHT = 120;

export default function DynLane({ width = 800, zoom = 1, panX = 0, offsetX = 0, playhead = 0, relativeView = false }) {
  const tracks = useAtomValue(tracksAtom);
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const bpm = useAtomValue(bpmAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const isDrawing = useRef(false);

  // ── Find selected node ────────────────────────────────────────────────────
  const selectedNode = useMemo(() => {
    for (const track of tracks) {
      const node = track.nodes.find(n => n.id === selectedNodeId);
      if (node) return { ...node, track };
    }
    return null;
  }, [tracks, selectedNodeId]);

  const dynPoints  = selectedNode?.automationDYN || [];
  const dynFloor   = selectedNode?.dynFloor ?? 0;      // gain when curve is at 0
  const dynCeil    = selectedNode?.dynCeil  ?? 1.0;    // gain when curve is at 1
  const waveformData = selectedNode?.waveformData ?? null;

  // ── Local (per-node) coordinate helpers — fills the full canvas width ────
  // Automation points are stored in global timeline time, but DynLane always
  // displays the selected node's envelope filling the entire canvas (0 → width).
  const nodeStart    = selectedNode?.start_time ?? 0;
  const nodeDuration = selectedNode?.duration || 4;

  const timeToX = useCallback((time) => {
    if (relativeView) {
      return ((time - nodeStart) / nodeDuration) * width;
    }
    return (time * bpm / 60) * PIXELS_PER_BEAT * zoom - panX;
  }, [relativeView, nodeStart, nodeDuration, width, bpm, zoom, panX]);

  const xToTime = useCallback((x) => {
    if (relativeView) {
      return nodeStart + (x / width) * nodeDuration;
    }
    return ((x + panX) / (PIXELS_PER_BEAT * zoom)) * (60 / bpm);
  }, [relativeView, nodeStart, nodeDuration, width, panX, zoom, bpm]);

  const valueToY = (v) => LANE_HEIGHT * (1 - Math.max(0, Math.min(1, v)));
  // With snap-to-zero: anything within 8px of the bottom snaps to exactly 0
  const SNAP_PX = 8;
  const yToValue = (y) => {
    const raw = 1 - y / LANE_HEIGHT;
    if (raw < SNAP_PX / LANE_HEIGHT) return 0;
    return Math.max(0, Math.min(1, raw));
  };

  // ── Waveform ghost (bottom-anchored RMS bars) ────────────────────────────
  const waveformBars = useMemo(() => {
    if (!selectedNode || !waveformData || waveformData.length === 0) return [];
    const startTime   = selectedNode.start_time    ?? 0;
    const duration    = selectedNode.duration       || 4;
    const origDur     = selectedNode.originalDuration > 0
      ? selectedNode.originalDuration
      : duration;
    const engineSpeed = selectedNode.engineSpeed    || 1.0;
    const offset      = selectedNode.offset         || 0;
    const count       = waveformData.length;
    const barW        = 2;
    const bars        = [];

    // Map only the audible slice of the waveform
    // (skip the first `offset` seconds, then show `duration * engineSpeed` audio-seconds)
    const sampleStart = Math.round((offset / origDur) * count);
    const sampleEnd   = Math.min(count, Math.round(((offset + duration * engineSpeed) / origDur) * count));
    const sampleCount = Math.max(1, sampleEnd - sampleStart);

    for (let i = 0; i < sampleCount; i++) {
      const t   = startTime + (i / sampleCount) * duration;
      const x   = timeToX(t);
      if (x + barW < 0 || x > width) continue;
      const rms = Math.max(0, Math.min(1, waveformData[sampleStart + i]));
      const h   = rms * LANE_HEIGHT;
      bars.push({ x, y: LANE_HEIGHT - h, w: barW, h });
    }
    return bars;
  }, [selectedNode, waveformData, timeToX, width]);

  // ── Build bars from dynPoints ────────────────────────────────────────────
  const bars = useMemo(() => {
    if (!selectedNode || dynPoints.length === 0) return [];
    const startTime  = selectedNode.start_time ?? 0;
    const endTime    = startTime + (selectedNode.duration || 4);
    const barW       = 3;
    // Step in time units so each bar is barW pixels wide in local coordinates
    const stepTime   = (endTime - startTime) * barW / Math.max(width, 1);
    const result     = [];

    for (let t = startTime; t <= endTime; t += stepTime) {
      const x = timeToX(t);
      if (x + barW < 0 || x > width) continue;

      // Interpolate dynPoints to get curveValue at time t
      let curveValue = 1.0;
      if (dynPoints.length === 1) {
        curveValue = dynPoints[0].value;
      } else {
        const sorted = [...dynPoints].sort((a, b) => a.time - b.time);
        if (t <= sorted[0].time) {
          curveValue = sorted[0].value;
        } else if (t >= sorted[sorted.length - 1].time) {
          curveValue = sorted[sorted.length - 1].value;
        } else {
          for (let k = 0; k < sorted.length - 1; k++) {
            if (t >= sorted[k].time && t <= sorted[k + 1].time) {
              const frac = (t - sorted[k].time) / (sorted[k + 1].time - sorted[k].time);
              curveValue = sorted[k].value + frac * (sorted[k + 1].value - sorted[k].value);
              break;
            }
          }
        }
      }

      const h = Math.max(1, curveValue * LANE_HEIGHT);
      result.push({ x, y: LANE_HEIGHT - h, w: barW, h });
    }
    return result;
  }, [selectedNode, dynPoints, timeToX, zoom, width]);

  // ── Curve line for dynPoints ─────────────────────────────────────────────
  const linePoints = useMemo(() => {
    const sorted = [...dynPoints].sort((a, b) => a.time - b.time);
    return sorted.flatMap(p => [timeToX(p.time), valueToY(p.value)]);
  }, [dynPoints, timeToX]);

  // ── Playhead ─────────────────────────────────────────────────────────────
  const playheadLineX = useMemo(() => timeToX(playhead), [playhead, timeToX]);

  // ── Push history once per draw stroke ────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (!selectedNode) return;
    pushHistory();
    isDrawing.current = true;
    // Place a point at the initial click position too (not just on drag)
    const stage = e.target.getStage();
    const pos   = stage.getPointerPosition();
    const t     = xToTime(pos.x);
    const v     = yToValue(pos.y);
    if (t >= (selectedNode.start_time ?? 0) && t <= ((selectedNode.start_time ?? 0) + (selectedNode.duration || 4))) {
      const existing = dynPoints.find(p => Math.abs(timeToX(p.time) - pos.x) < 8);
      if (!existing) {
        updateNode({ id: selectedNode.id, automationDYN: [...dynPoints, { time: t, value: v }] });
      }
    }
  }, [selectedNode, pushHistory, dynPoints, xToTime, timeToX, updateNode]);

  const handleMouseUp = useCallback(() => { isDrawing.current = false; }, []);

  // ── Draw control points ──────────────────────────────────────────────────
  const handleDraw = useCallback((e) => {
    if (!isDrawing.current || !selectedNode) return;
    const stage = e.target.getStage();
    const pos   = stage.getPointerPosition();
    const t     = xToTime(pos.x);
    const v     = yToValue(pos.y);
    if (t < (selectedNode.start_time ?? 0) || t > ((selectedNode.start_time ?? 0) + (selectedNode.duration || 4))) return;
    const existing = dynPoints.find(p => Math.abs(timeToX(p.time) - pos.x) < 8);
    if (existing) return;
    updateNode({ id: selectedNode.id, automationDYN: [...dynPoints, { time: t, value: v }] });
  }, [selectedNode, dynPoints, xToTime, timeToX, updateNode]);

  // ── Drag a single control point ──────────────────────────────────────────
  const handlePointDrag = useCallback((index, e) => {
    if (!selectedNode) return;
    const pos = e.target.getStage().getPointerPosition();
    const t   = xToTime(pos.x);
    const v   = yToValue(pos.y);
    const pts = [...dynPoints];
    pts[index] = { ...pts[index], time: t, value: v };
    updateNode({ id: selectedNode.id, automationDYN: pts });
  }, [selectedNode, dynPoints, xToTime, updateNode]);

  // ── Reset curve ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    updateNode({ id: selectedNode.id, automationDYN: [] });
  }, [selectedNode, pushHistory, updateNode]);

  // ── Floor / Ceil updates ─────────────────────────────────────────────────
  const handleFloorChange = useCallback((val) => {
    if (!selectedNode) return;
    const floor = Math.min(parseFloat(val), dynCeil - 0.01);
    updateNode({ id: selectedNode.id, dynFloor: Math.max(0, floor) });
  }, [selectedNode, dynCeil, updateNode]);

  const handleCeilChange = useCallback((val) => {
    if (!selectedNode) return;
    const ceil = Math.max(parseFloat(val), dynFloor + 0.01);
    updateNode({ id: selectedNode.id, dynCeil: Math.min(2, ceil) });
  }, [selectedNode, dynFloor, updateNode]);

  const handleRangeReset = useCallback(() => {
    if (!selectedNode) return;
    updateNode({ id: selectedNode.id, dynFloor: 0, dynCeil: 1.0 });
  }, [selectedNode, updateNode]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!selectedNode) {
    return (
      <div className="param-lane dyn-lane empty">
        <span className="param-lane-hint">Select a note to edit dynamics</span>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="param-lane dyn-lane" style={{ display: 'flex', flexDirection: 'row' }}>

      {/* ── Left sidebar: range controls ── */}
      <div className="dyn-sidebar" style={{ width: offsetX, minWidth: offsetX }}>
        <span className="dyn-sidebar-title">Dyn Range</span>

        <div className="dyn-range-row">
          <span className="dyn-range-label">Ceil</span>
          <input
            type="range" min={0} max={2} step={0.01} value={dynCeil}
            onChange={e => handleCeilChange(e.target.value)}
            style={{ flex: 1, accentColor: '#ff4da6', cursor: 'pointer' }}
          />
          <span className="dyn-range-val">{dynCeil.toFixed(2)}</span>
        </div>

        <div className="dyn-range-row">
          <span className="dyn-range-label">Floor</span>
          <input
            type="range" min={0} max={1} step={0.01} value={dynFloor}
            onChange={e => handleFloorChange(e.target.value)}
            style={{ flex: 1, accentColor: '#00f0ff', cursor: 'pointer' }}
          />
          <span className="dyn-range-val">{dynFloor.toFixed(2)}</span>
        </div>

        <div className="dyn-range-row" style={{ justifyContent: 'space-between' }}>
          <span className="dyn-range-label" style={{ color: '#555' }}>Range</span>
          <span className="dyn-range-val" style={{ color: '#555' }}>
            {Math.round(dynFloor * 100)}–{Math.round(dynCeil * 100)}%
          </span>
          <button
            className="param-lane-reset-inline"
            onClick={handleRangeReset}
            title="Reset floor/ceil range"
          >
            ⟲
          </button>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 4px' }}>
          <button
            className="param-lane-reset-inline"
            onClick={handleReset}
            title="Reset dynamics curve"
          >
            ⟲ Curve
          </button>
        </div>
        <div style={{ cursor: 'crosshair' }}>
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

            {/* Waveform ghost — bottom-anchored RMS bars */}
            {waveformBars.map((bar, i) => (
              <Rect key={`wf${i}`} x={bar.x} y={bar.y} width={bar.w} height={bar.h}
                fill="#00f0ff" opacity={0.10} listening={false} />
            ))}

            {/* Floor guide (yellow dashed) — visible when floor > 0 */}
            {dynFloor > 0.005 && (
              <Line
                points={[0, LANE_HEIGHT * (1 - dynFloor), width, LANE_HEIGHT * (1 - dynFloor)]}
                stroke="#ffe566" strokeWidth={1} dash={[4, 4]} opacity={0.5} listening={false}
              />
            )}

            {/* Ceil guide (magenta dashed) — visible when ceil > 1 */}
            {dynCeil > 1.005 && (
              <Line
                points={[0, LANE_HEIGHT * (1 - dynCeil / 2), width, LANE_HEIGHT * (1 - dynCeil / 2)]}
                stroke="#ff4da6" strokeWidth={1} dash={[4, 4]} opacity={0.5} listening={false}
              />
            )}

            {/* DYN bars */}
            {bars.map((bar, i) => (
              <Rect key={`b${i}`} x={bar.x} y={bar.y} width={bar.w} height={bar.h}
                fill="#00f0ff" opacity={0.6} cornerRadius={1} listening={false} />
            ))}

            {/* Curve line */}
            {linePoints.length >= 4 && (
              <Line points={linePoints} stroke="#00f0ff" strokeWidth={2} tension={0.3}
                shadowColor="#00f0ff" shadowBlur={6} shadowOpacity={0.5} listening={false} />
            )}

            {/* Control point handles */}
            {dynPoints.map((p, i) => (
              <Rect key={`pt${i}`}
                x={timeToX(p.time) - 3} y={valueToY(p.value) - 3}
                width={6} height={6}
                fill="#00f0ff" stroke="#fff" strokeWidth={1} cornerRadius={1}
                draggable
                onDragMove={(e) => handlePointDrag(i, e)}
                onMouseEnter={(e) => { e.target.getStage().container().style.cursor = 'grab'; }}
                onMouseLeave={(e) => { e.target.getStage().container().style.cursor = 'crosshair'; }}
              />
            ))}

            {/* Playhead indicator */}
            {playheadLineX >= 0 && playheadLineX <= width && (
              <Line
                points={[playheadLineX, 0, playheadLineX, LANE_HEIGHT]}
                stroke="#ffffff" strokeWidth={1.5} opacity={0.6} dash={[3, 3]} listening={false}
              />
            )}
          </Layer>
        </Stage>
        </div>
      </div>
    </div>
  );
}
