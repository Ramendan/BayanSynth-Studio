/**
 * BayanSynth Studio — PIT Lane  (Pass 2)
 *
 * Pitch automation lane (cents offset from base pitch).
 * Waveform ghost background + curve overlay.
 * Pencil draws, Arrow drags. pushHistory on mouseDown.
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Line, Circle, Text } from 'react-konva';
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
const CENT_RANGE = 1200;

export default function PitLane({ width = 800, zoom = 1, panX = 0 }) {
  const tracks = useAtomValue(tracksAtom);
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const activeTool = useAtomValue(activeToolAtom);
  const bpm = useAtomValue(bpmAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const isDrawing = useRef(false);

  const selectedNode = useMemo(() => {
    for (const track of tracks) {
      const node = track.nodes.find(n => n.id === selectedNodeId);
      if (node) return { ...node, track };
    }
    return null;
  }, [tracks, selectedNodeId]);

  const pitPoints = selectedNode?.automationPIT || [];

  const timeToX = useCallback((time) => {
    return (time * bpm / 60) * PIXELS_PER_BEAT * zoom - panX;
  }, [bpm, zoom, panX]);

  const xToTime = useCallback((x) => {
    return ((x + panX) / (PIXELS_PER_BEAT * zoom)) * (60 / bpm);
  }, [bpm, zoom, panX]);

  const centsToY = (cents) => (LANE_HEIGHT / 2) * (1 - cents / CENT_RANGE);
  const yToCents = (y) => (1 - y / (LANE_HEIGHT / 2)) * CENT_RANGE;

  // Push history once per stroke
  const handleMouseDown = useCallback(() => {
    if (!selectedNode) return;
    if (activeTool !== 'pencil' && activeTool !== 'arrow') return;
    pushHistory();
    isDrawing.current = true;
  }, [selectedNode, activeTool, pushHistory]);

  const handleDraw = useCallback((e) => {
    if (!isDrawing.current || activeTool !== 'pencil' || !selectedNode) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const time = xToTime(pos.x);
    const cents = yToCents(pos.y);

    const existing = [...(selectedNode.automationPIT || [])];
    const idx = existing.findIndex(p => Math.abs(p.time - time) < 0.02);
    if (idx >= 0) {
      existing[idx] = { time, value: cents };
    } else {
      existing.push({ time, value: cents });
      existing.sort((a, b) => a.time - b.time);
    }
    updateNode({ id: selectedNode.id, automationPIT: existing });
  }, [activeTool, selectedNode, xToTime, updateNode]);

  const handleMouseUp = useCallback(() => { isDrawing.current = false; }, []);

  const handlePointDrag = useCallback((index, e) => {
    if (!selectedNode) return;
    const x = e.target.x();
    const y = e.target.y();
    const time = xToTime(x);
    const cents = yToCents(y);

    const existing = [...(selectedNode.automationPIT || [])];
    existing[index] = { time, value: cents };
    existing.sort((a, b) => a.time - b.time);
    updateNode({ id: selectedNode.id, automationPIT: existing });
  }, [selectedNode, xToTime, updateNode]);

  const handleReset = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    updateNode({ id: selectedNode.id, automationPIT: [] });
  }, [selectedNode, pushHistory, updateNode]);

  // Waveform ghost
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
    for (let i = wf.length - 1; i >= 0; i--) {
      const x = startX + (i / wf.length) * nodeW;
      const amp = Math.abs(wf[i]) * (LANE_HEIGHT * 0.4);
      pts.push(x, LANE_HEIGHT / 2 + amp);
    }
    return pts;
  }, [selectedNode, timeToX]);

  const curvePoints = useMemo(() => {
    if (pitPoints.length < 2) return [];
    return pitPoints.flatMap(p => [timeToX(p.time), centsToY(p.value)]);
  }, [pitPoints, timeToX]);

  if (!selectedNode) {
    return (
      <div className="param-lane pit-lane empty">
        <span className="param-lane-hint">Select a note to edit pitch</span>
      </div>
    );
  }

  return (
    <div className="param-lane pit-lane">
      <button className="param-lane-reset" onClick={handleReset} title="Reset pitch curve">⟲</button>
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
          <Line points={[0, LANE_HEIGHT / 2, width, LANE_HEIGHT / 2]} stroke="#333" strokeWidth={1} />

          {[-600, -300, 300, 600].map(cents => (
            <Line key={cents} points={[0, centsToY(cents), width, centsToY(cents)]}
              stroke="#1a1a1a" strokeWidth={0.5} dash={[2, 4]} />
          ))}

          <Text x={2} y={centsToY(600) - 6} text="+600¢" fill="#444" fontSize={9} fontFamily="monospace" />
          <Text x={2} y={centsToY(-600) - 6} text="-600¢" fill="#444" fontSize={9} fontFamily="monospace" />
          <Text x={2} y={LANE_HEIGHT / 2 - 6} text="0¢" fill="#555" fontSize={9} fontFamily="monospace" />

          {/* Waveform ghost */}
          {waveformLine.length >= 4 && (
            <Line points={waveformLine} fill="#ff2dcc" opacity={0.06} closed listening={false} />
          )}

          {curvePoints.length >= 4 && (
            <Line points={curvePoints} stroke="#ff2dcc" strokeWidth={2} tension={0.4} lineCap="round"
              shadowColor="#ff2dcc" shadowBlur={8} shadowOpacity={0.5} listening={false} />
          )}

          {pitPoints.map((p, i) => (
            <Circle key={i} x={timeToX(p.time)} y={centsToY(p.value)} radius={5}
              fill="#ff2dcc" stroke="#fff" strokeWidth={1} shadowColor="#ff2dcc" shadowBlur={6}
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
