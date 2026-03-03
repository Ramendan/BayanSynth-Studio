/**
 * BayanSynth Studio — Pitch Curve Overlay
 *
 * Renders the F0 pitch contour for all visible nodes as glowing neon lines.
 * When Pencil Tool is active, allows drawing automation control points.
 */

import React, { useMemo } from 'react';
import { Group, Line, Circle, Rect } from 'react-konva';
import { PIXELS_PER_BEAT, ROW_HEIGHT, NOTE_RANGE, NOTE_HEIGHT } from '../../utils/constants';

/**
 * Convert a frequency (Hz) to a Y position on the piano roll.
 * Uses log-scale mapping: MIDI = 12 * log2(f / 440) + 69
 */
function freqToY(freq) {
  if (freq <= 0) return -100; // off-screen for unvoiced
  const midi = 12 * Math.log2(freq / 440) + 69;
  return (NOTE_RANGE.max - midi) * ROW_HEIGHT;
}

export default function PitchCurve({
  nodes,
  trackColor = '#00f0ff',
  bpm,
  zoom = 1,
  panX = 0,
  panY = 0,
  activeTool,
  selectedNodeId,
  onAutomationPointAdd,
  onAutomationPointDrag,
  // Tile overlay props
  showAutomation = true,
  renderedNodes = [],   // nodes with screenX, screenY, screenW, screenH
}) {
  const ppb = PIXELS_PER_BEAT * zoom;

  // ── Tile overlay: curve drawn within the node tile bounds (showAutomation = false) ──
  const tileOverlays = useMemo(() => {
    if (showAutomation) return [];   // global mode — skip tile view
    const result = [];
    for (const rn of renderedNodes) {
      if (!rn.automationPIT || rn.automationPIT.length < 2) continue;
      const pitMin = rn.pitMin ?? -1200;
      const pitMax = rn.pitMax ?? 1200;
      const pitRange = pitMax - pitMin;
      if (pitRange <= 0) continue;   // guard divide-by-zero
      const nodeStart = rn.start_time ?? 0;
      const nodeDur   = Math.max(rn.duration || 1, 0.001);
      const tileH     = rn.screenH ?? NOTE_HEIGHT;
      const tileW     = rn.screenW ?? 40;
      const tileX     = rn.screenX;
      const tileY     = rn.screenY;
      const pts       = [...rn.automationPIT].sort((a, b) => a.time - b.time);
      const linePoints = [];
      for (const pt of pts) {
        const fracT = Math.max(0, Math.min(1, (pt.time - nodeStart) / nodeDur));
        const x = tileX + fracT * tileW;
        const frac = Math.max(0, Math.min(1, (pt.value - pitMin) / pitRange));
        const y = tileY + tileH * (1 - frac);
        linePoints.push(x, y);
      }
      const zeroFrac = Math.max(0, Math.min(1, (0 - pitMin) / pitRange));
      result.push({
        key: rn.id,
        linePoints,
        zeroY: tileY + tileH * (1 - zeroFrac),
        tileX,
        tileY,
        tileW,
        tileH,
        isSelected: rn.id === selectedNodeId,
      });
    }
    return result;
  }, [showAutomation, renderedNodes, selectedNodeId]);

  // ── Global overlay: curve mapped to actual piano-roll pitch Y axis (showAutomation = true) ──
  const globalOverlays = useMemo(() => {
    if (!showAutomation) return [];   // tile mode — skip global view
    const result = [];
    for (const rn of renderedNodes) {
      if (!rn.automationPIT || rn.automationPIT.length < 2) continue;
      const baseMidi  = NOTE_RANGE.center + (rn.pitch_shift || 0);
      const nodeStart = rn.start_time ?? 0;
      const nodeDur   = Math.max(rn.duration || 1, 0.001);
      const tileX     = rn.screenX;
      const tileW     = rn.screenW ?? 40;
      const pts       = [...rn.automationPIT].sort((a, b) => a.time - b.time);
      const linePoints = [];
      for (const pt of pts) {
        // X: absolute timeline position
        const fracT = Math.max(0, Math.min(1, (pt.time - nodeStart) / nodeDur));
        const x = tileX + fracT * tileW;
        // Y: MIDI pitch = base + cents offset (1 semitone = 100 cents)
        const midi = baseMidi + pt.value / 100;
        const y = (NOTE_RANGE.max - midi - 1) * ROW_HEIGHT - panY;
        linePoints.push(x, y);
      }
      // Base note Y (0¢ offset — where the tile sits)
      const baseY = (NOTE_RANGE.max - baseMidi - 1) * ROW_HEIGHT - panY;
      result.push({
        key: rn.id,
        linePoints,
        baseY,
        tileX,
        tileW,
        isSelected: rn.id === selectedNodeId,
      });
    }
    return result;
  }, [showAutomation, renderedNodes, panY, selectedNodeId]);

  // Build pitch contour lines for each node
  const contours = useMemo(() => {
    return nodes
      .filter(n => n.pitchContour && n.pitchContour.length > 0)
      .map(node => {
        const contour = node.pitchContour;
        const startX = (node.start_time * bpm / 60) * ppb - panX;

        // Assume 100 hop-length at 16kHz sample rate
        const hopSeconds = 100 / 16000;
        const points = [];

        for (let i = 0; i < contour.length; i++) {
          if (contour[i] <= 0) continue; // skip unvoiced frames
          const time = i * hopSeconds;
          const x = startX + (time * bpm / 60) * ppb;
          const y = freqToY(contour[i]) - panY;
          points.push(x, y);
        }

        return { nodeId: node.id, points };
      });
  }, [nodes, bpm, ppb, panX, panY]);

  // Render automation PIT control points for selected node
  const automationPoints = useMemo(() => {
    if (!selectedNodeId) return [];
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node || !node.automationPIT) return [];

    const startX = (node.start_time * bpm / 60) * ppb - panX;
    return node.automationPIT.map((pt, i) => ({
      index: i,
      x: startX + (pt.time * bpm / 60) * ppb,
      y: (NOTE_RANGE.max - NOTE_RANGE.center - (node.pitch_shift || 0) - pt.value / 100) * ROW_HEIGHT - panY,
    }));
  }, [nodes, selectedNodeId, bpm, ppb, panX, panY]);

  return (
    <Group>
      {/* ── Tile overlays (off = in-tile mode) ── */}
      {tileOverlays.map(({ key, linePoints, zeroY, tileX, tileY, tileW, tileH, isSelected }) => (
        <Group key={`pto_${key}`} listening={false}>
          <Line
            points={[tileX, zeroY, tileX + tileW, zeroY]}
            stroke="#ff2dcc" strokeWidth={0.5} opacity={0.3} dash={[3, 3]}
          />
          <Line
            points={linePoints}
            stroke="#ff2dcc"
            strokeWidth={isSelected ? 2 : 1.5}
            opacity={isSelected ? 0.95 : 0.7}
            tension={0.4} lineCap="round"
            shadowColor="#ff2dcc"
            shadowBlur={isSelected ? 8 : 4}
            shadowOpacity={isSelected ? 0.6 : 0.35}
          />
        </Group>
      ))}

      {/* ── Global overlays (on = piano-roll pitch axis) ── */}
      {globalOverlays.map(({ key, linePoints, baseY, tileX, tileW, isSelected }) => (
        <Group key={`gpo_${key}`} listening={false}>
          {/* Base-pitch reference line (0¢ — where the tile is) */}
          <Line
            points={[tileX, baseY, tileX + tileW, baseY]}
            stroke="#ff2dcc" strokeWidth={0.5} opacity={0.25} dash={[3, 3]}
          />
          {/* Curve following actual pitch on the roll */}
          <Line
            points={linePoints}
            stroke="#ff2dcc"
            strokeWidth={isSelected ? 2.5 : 2}
            opacity={isSelected ? 1 : 0.8}
            tension={0.4} lineCap="round" lineJoin="round"
            shadowColor="#ff2dcc"
            shadowBlur={isSelected ? 12 : 6}
            shadowOpacity={isSelected ? 0.7 : 0.45}
          />
        </Group>
      ))}

      {/* F0 contour lines */}
      {contours.map(({ nodeId, points }) => (
        points.length >= 4 && (
          <Line
            key={`contour_${nodeId}`}
            points={points}
            stroke={trackColor}
            strokeWidth={1.5}
            opacity={0.8}
            tension={0.3}
            lineCap="round"
            lineJoin="round"
            shadowColor={trackColor}
            shadowBlur={6}
            shadowOpacity={0.5}
            listening={false}
          />
        )
      ))}

      {/* Automation control points (visible with Pencil tool) */}
      {activeTool === 'pencil' && automationPoints.map((pt) => (
        <Circle
          key={`apt_${pt.index}`}
          x={pt.x}
          y={pt.y}
          radius={4}
          fill={trackColor}
          stroke="#ffffff"
          strokeWidth={1}
          shadowColor={trackColor}
          shadowBlur={8}
          shadowOpacity={0.6}
          draggable
          onDragMove={(e) => {
            if (onAutomationPointDrag) {
              onAutomationPointDrag(selectedNodeId, pt.index, {
                x: e.target.x(),
                y: e.target.y(),
              });
            }
          }}
          onMouseEnter={(e) => {
            e.target.getStage().container().style.cursor = 'grab';
          }}
          onMouseLeave={(e) => {
            e.target.getStage().container().style.cursor = 'default';
          }}
        />
      ))}

      {/* Automation line connecting points */}
      {activeTool === 'pencil' && automationPoints.length >= 2 && (
        <Line
          points={automationPoints.flatMap(pt => [pt.x, pt.y])}
          stroke={trackColor}
          strokeWidth={1}
          opacity={0.4}
          dash={[4, 2]}
          listening={false}
        />
      )}
    </Group>
  );
}
