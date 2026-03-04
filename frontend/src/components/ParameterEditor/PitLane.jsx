/**
 * BayanSynth Studio — PIT Lane  (Pass 3)
 *
 * Pitch automation lane (cents offset from base pitch).
 * - Sidebar with Min/Max range sliders + ⟲ Range button (grouped with sliders).
 * - ⟲ Curve button above canvas area.
 * - Waveform ghost correctly aligned using duration/offset/engineSpeed.
 * - Click-to-place on mouseDown; draw on drag.
 * - centsToY / yToCents respect the pitMin/pitMax range.
 * - Snap-to-zero within 8px of center line.
 * - pushHistory on mouseDown.
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Line, Circle, Text } from 'react-konva';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  updateNodeAtom,
  bpmAtom,
  showPitCurveAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';
import { PIXELS_PER_BEAT } from '../../utils/constants';

const LANE_HEIGHT = 120;
const DEFAULT_MIN = -1200;  // cents
const DEFAULT_MAX = 1200;   // cents

export default function PitLane({ width = 800, zoom = 1, panX = 0, offsetX = 0, playhead = 0 }) {
  const tracks = useAtomValue(tracksAtom);
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const bpm = useAtomValue(bpmAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const [showPitCurve, setShowPitCurve] = useAtom(showPitCurveAtom);
  const isDrawing = useRef(false);

  const selectedNode = useMemo(() => {
    for (const track of tracks) {
      const node = track.nodes.find(n => n.id === selectedNodeId);
      if (node) return { ...node, track };
    }
    return null;
  }, [tracks, selectedNodeId]);

  const pitPoints   = selectedNode?.automationPIT || [];
  const pitMin      = selectedNode?.pitMin ?? DEFAULT_MIN;
  const pitMax      = selectedNode?.pitMax ?? DEFAULT_MAX;
  const waveformData = selectedNode?.waveformData ?? null;

  const timeToX = useCallback((time) => {
    return (time * bpm / 60) * PIXELS_PER_BEAT * zoom - panX;
  }, [bpm, zoom, panX]);

  const xToTime = useCallback((x) => {
    return ((x + panX) / (PIXELS_PER_BEAT * zoom)) * (60 / bpm);
  }, [bpm, zoom, panX]);

  // Range-aware coordinate helpers
  const centsToY = useCallback((cents) => {
    const range = pitMax - pitMin;
    if (range <= 0) return LANE_HEIGHT / 2;
    return Math.max(0, Math.min(LANE_HEIGHT, LANE_HEIGHT * (1 - (cents - pitMin) / range)));
  }, [pitMin, pitMax]);

  const yToCents = useCallback((y) => {
    const range = pitMax - pitMin;
    if (range <= 0) return 0;
    const raw = pitMin + (1 - y / LANE_HEIGHT) * range;
    // Snap to 0¢ within 8px of the centre line
    const SNAP_CENTS = range * (8 / LANE_HEIGHT);
    if (Math.abs(raw) < SNAP_CENTS) return 0;
    return Math.max(pitMin, Math.min(pitMax, raw));
  }, [pitMin, pitMax]);

  // ── Range controls ───────────────────────────────────────────────────────
  const handleMinChange = useCallback((val) => {
    if (!selectedNode) return;
    const v = Math.max(-2400, Math.min(parseFloat(val), pitMax - 1));
    updateNode({ id: selectedNode.id, pitMin: v });
  }, [selectedNode, pitMax, updateNode]);

  const handleMaxChange = useCallback((val) => {
    if (!selectedNode) return;
    const v = Math.min(2400, Math.max(parseFloat(val), pitMin + 1));
    updateNode({ id: selectedNode.id, pitMax: v });
  }, [selectedNode, pitMin, updateNode]);

  const handleRangeReset = useCallback(() => {
    if (!selectedNode) return;
    updateNode({ id: selectedNode.id, pitMin: DEFAULT_MIN, pitMax: DEFAULT_MAX });
  }, [selectedNode, updateNode]);

  // ── Push history + place point on initial click ──────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (!selectedNode) return;
    pushHistory();
    isDrawing.current = true;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const t = xToTime(pos.x);
    const cents = yToCents(pos.y);
    if (t >= (selectedNode.start_time ?? 0) && t <= ((selectedNode.start_time ?? 0) + (selectedNode.duration || 4))) {
      const existing = [...pitPoints];
      const idx = existing.findIndex(p => Math.abs(timeToX(p.time) - pos.x) < 8);
      if (idx < 0) {
        existing.push({ time: t, value: cents });
        existing.sort((a, b) => a.time - b.time);
        updateNode({ id: selectedNode.id, automationPIT: existing });
      }
    }
  }, [selectedNode, pushHistory, pitPoints, xToTime, timeToX, yToCents, updateNode]);

  const handleDraw = useCallback((e) => {
    if (!isDrawing.current || !selectedNode) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const t = xToTime(pos.x);
    const cents = yToCents(pos.y);
    if (t < (selectedNode.start_time ?? 0) || t > ((selectedNode.start_time ?? 0) + (selectedNode.duration || 4))) return;
    const existing = [...pitPoints];
    const idx = existing.findIndex(p => Math.abs(timeToX(p.time) - pos.x) < 8);
    if (idx >= 0) {
      existing[idx] = { time: t, value: cents };
    } else {
      existing.push({ time: t, value: cents });
      existing.sort((a, b) => a.time - b.time);
    }
    updateNode({ id: selectedNode.id, automationPIT: existing });
  }, [selectedNode, pitPoints, xToTime, timeToX, yToCents, updateNode]);

  const handleMouseUp = useCallback(() => { isDrawing.current = false; }, []);

  const handlePointDrag = useCallback((index, e) => {
    if (!selectedNode) return;
    const pos = e.target.getStage().getPointerPosition();
    const t = xToTime(pos.x);
    const cents = yToCents(pos.y);
    const pts = [...pitPoints];
    pts[index] = { ...pts[index], time: t, value: cents };
    pts.sort((a, b) => a.time - b.time);
    updateNode({ id: selectedNode.id, automationPIT: pts });
  }, [selectedNode, pitPoints, xToTime, yToCents, updateNode]);

  const handleReset = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    updateNode({ id: selectedNode.id, automationPIT: [] });
  }, [selectedNode, pushHistory, updateNode]);

  // ── Waveform ghost — correctly aligned with timeline ────────────────────
  const waveformBars = useMemo(() => {
    if (!selectedNode || !waveformData || waveformData.length === 0) return [];
    const startTime   = selectedNode.start_time      ?? 0;
    const duration    = selectedNode.duration         || 4;
    const origDur     = selectedNode.originalDuration > 0
      ? selectedNode.originalDuration
      : duration;
    const engineSpeed = selectedNode.engineSpeed      || 1.0;
    const offset      = selectedNode.offset           || 0;
    const count       = waveformData.length;
    const barW        = 2;
    const bars        = [];
    const pitRange    = pitMax - pitMin;
    const midY        = pitRange > 0
      ? LANE_HEIGHT * (1 - (0 - pitMin) / pitRange)
      : LANE_HEIGHT / 2; // zeroY — guard for degenerate range

    const sampleStart = Math.round((offset / origDur) * count);
    const sampleEnd   = Math.min(count, Math.round(((offset + duration * engineSpeed) / origDur) * count));
    const sampleCount = Math.max(1, sampleEnd - sampleStart);

    for (let i = 0; i < sampleCount; i++) {
      const t   = startTime + (i / sampleCount) * duration;
      const x   = timeToX(t);
      if (x + barW < 0 || x > width) continue;
      const rms = Math.max(0, Math.min(1, waveformData[sampleStart + i]));
      const h   = rms * (LANE_HEIGHT * 0.4);
      bars.push({ x, y: midY - h, w: barW, h: h * 2 });
    }
    return bars;
  }, [selectedNode, waveformData, timeToX, width]);

  const curvePoints = useMemo(() => {
    if (pitPoints.length < 2) return [];
    return pitPoints.flatMap(p => [timeToX(p.time), centsToY(p.value)]);
  }, [pitPoints, timeToX, centsToY]);

  const playheadLineX = useMemo(() => timeToX(playhead), [playhead, timeToX]);
  const zeroY = centsToY(0);

  if (!selectedNode) {
    return (
      <div className="param-lane pit-lane empty">
        <span className="param-lane-hint">Select a note to edit pitch</span>
      </div>
    );
  }

  return (
    <div className="param-lane pit-lane" style={{ display: 'flex', flexDirection: 'row' }}>

      {/* ── Left sidebar: range controls ── */}
      <div className="dyn-sidebar" style={{ width: offsetX, minWidth: offsetX }}>
        <span className="dyn-sidebar-title">Pit Range</span>

        <div className="dyn-range-row">
          <span className="dyn-range-label">Max</span>
          <input
            type="range" min={1} max={2400} step={1} value={pitMax}
            onChange={e => handleMaxChange(e.target.value)}
            style={{ flex: 1, accentColor: '#ff2dcc', cursor: 'pointer' }}
          />
          <span className="dyn-range-val">{pitMax > 0 ? `+${pitMax}` : pitMax}¢</span>
        </div>

        <div className="dyn-range-row">
          <span className="dyn-range-label">Min</span>
          <input
            type="range" min={-2400} max={-1} step={1} value={pitMin}
            onChange={e => handleMinChange(e.target.value)}
            style={{ flex: 1, accentColor: '#aa88ff', cursor: 'pointer' }}
          />
          <span className="dyn-range-val">{pitMin}¢</span>
        </div>

        <div className="dyn-range-row" style={{ justifyContent: 'space-between' }}>
          <span className="dyn-range-label" style={{ color: '#555' }}>Range</span>
          <span className="dyn-range-val" style={{ color: '#555' }}>
            {pitMin}¢–{pitMax > 0 ? `+${pitMax}` : pitMax}¢
          </span>
          <button
            className="param-lane-reset-inline"
            onClick={handleRangeReset}
            title="Reset pitch range"
          >
            ⟲
          </button>
        </div>

        <div className="dyn-range-row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <span className="dyn-range-label" style={{ color: '#555' }}>Timeline</span>
          <button
            className="param-lane-reset-inline"
            onClick={() => setShowPitCurve(v => !v)}
            title={showPitCurve ? 'Switch to in-tile view' : 'Switch to global piano-roll view'}
            style={{
              color: showPitCurve ? '#ff2dcc' : undefined,
              borderColor: showPitCurve ? '#ff2dcc55' : undefined,
            }}
          >
            {showPitCurve ? '◉ global' : '◯ in-tile'}
          </button>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 4px' }}>
          <button
            className="param-lane-reset-inline"
            onClick={handleReset}
            title="Reset pitch curve"
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

              {/* Centre line (0¢) */}
              <Line points={[0, zeroY, width, zeroY]} stroke="#333" strokeWidth={1} />

              {/* Grid guides */}
              {[-600, -300, 300, 600]
                .filter(c => c > pitMin && c < pitMax)
                .map(cents => (
                  <Line key={cents}
                    points={[0, centsToY(cents), width, centsToY(cents)]}
                    stroke="#1a1a1a" strokeWidth={0.5} dash={[2, 4]} />
                ))
              }
              {600 < pitMax && (
                <Text x={2} y={centsToY(600) - 6} text="+600¢" fill="#444" fontSize={9} fontFamily="monospace" />
              )}
              {-600 > pitMin && (
                <Text x={2} y={centsToY(-600) - 6} text="-600¢" fill="#444" fontSize={9} fontFamily="monospace" />
              )}
              <Text x={2} y={zeroY - 6} text="0¢" fill="#555" fontSize={9} fontFamily="monospace" />

              {/* Max/Min range guides */}
              {pitMax < 1199 && (
                <Line points={[0, centsToY(pitMax), width, centsToY(pitMax)]}
                  stroke="#ff2dcc" strokeWidth={1} dash={[4, 4]} opacity={0.4} listening={false} />
              )}
              {pitMin > -1199 && (
                <Line points={[0, centsToY(pitMin), width, centsToY(pitMin)]}
                  stroke="#aa88ff" strokeWidth={1} dash={[4, 4]} opacity={0.4} listening={false} />
              )}

              {/* Waveform ghost — centred on zero line */}
              {waveformBars.map((bar, i) => (
                <Rect key={`wf${i}`} x={bar.x} y={bar.y} width={bar.w} height={bar.h}
                  fill="#ff2dcc" opacity={0.10} listening={false} />
              ))}

              {/* Curve line */}
              {curvePoints.length >= 4 && (
                <Line points={curvePoints} stroke="#ff2dcc" strokeWidth={2} tension={0.4} lineCap="round"
                  shadowColor="#ff2dcc" shadowBlur={8} shadowOpacity={0.5} listening={false} />
              )}

              {/* Control point handles */}
              {pitPoints.map((p, i) => (
                <Circle key={i} x={timeToX(p.time)} y={centsToY(p.value)} radius={5}
                  fill="#ff2dcc" stroke="#fff" strokeWidth={1} shadowColor="#ff2dcc" shadowBlur={6}
                  draggable
                  onDragMove={(e) => handlePointDrag(i, e)}
                  onMouseEnter={(e) => { e.target.getStage().container().style.cursor = 'grab'; }}
                  onMouseLeave={(e) => { e.target.getStage().container().style.cursor = 'crosshair'; }}
                />
              ))}

              {/* Playhead */}
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
