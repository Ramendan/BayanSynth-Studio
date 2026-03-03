/**
 * BayanSynth Studio — Pitch Curve Overlay
 *
 * Renders the F0 pitch contour for all visible nodes as glowing neon lines.
 * When Pencil Tool is active, allows drawing automation control points.
 */

import React, { useMemo } from 'react';
import { Group, Line, Circle } from 'react-konva';
import { PIXELS_PER_BEAT, ROW_HEIGHT, NOTE_RANGE } from '../../utils/constants';

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
}) {
  const ppb = PIXELS_PER_BEAT * zoom;

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
