/**
 * BayanSynth Studio — Grid Overlay
 *
 * Draws the background grid for the piano roll area:
 * - Horizontal lines separating semitone rows
 * - Vertical lines at beat/bar boundaries
 * - Alternating row shading for black/white keys
 * - Clickable background named 'grid-bg' for node creation
 */

import React, { useMemo } from 'react';
import { Group, Rect, Line } from 'react-konva';
import { NOTE_RANGE, ROW_HEIGHT, PIXELS_PER_BEAT, isBlackKey } from '../../utils/constants';

export default function GridOverlay({ width, height, zoom = 1, panX = 0, panY = 0, snapDivision = '1/4' }) {
  const ppb = PIXELS_PER_BEAT * zoom; // pixels per beat on screen
  const totalRows = NOTE_RANGE.max - NOTE_RANGE.min;
  const contentHeight = totalRows * ROW_HEIGHT;

  // Visible beat range
  const visibleStartBeat = Math.max(0, Math.floor(panX / ppb));
  const visibleEndBeat = Math.ceil((panX + width) / ppb) + 1;

  // Row backgrounds (alternating for black/white keys)
  const rows = useMemo(() => {
    const result = [];
    for (let midi = NOTE_RANGE.max - 1; midi >= NOTE_RANGE.min; midi--) {
      const y = (NOTE_RANGE.max - midi - 1) * ROW_HEIGHT - panY;
      if (y + ROW_HEIGHT < 0 || y > height) continue; // cull off-screen
      const black = isBlackKey(midi);
      result.push({ midi, y, black });
    }
    return result;
  }, [panY, height]);

  // Vertical grid lines
  const vLines = useMemo(() => {
    const result = [];
    for (let beat = visibleStartBeat; beat <= visibleEndBeat; beat++) {
      const x = beat * ppb - panX;
      if (x < -2 || x > width + 2) continue;
      const isBar = beat % 4 === 0;
      result.push({ x, isBar, isBeat: true });

      // Sub-beat lines
      const subs =
        snapDivision === '1/16' ? 4 :
        snapDivision === '1/8' ? 2 :
        snapDivision === '1/4' ? 1 : 0;

      for (let s = 1; s < subs; s++) {
        const subX = x + (s / subs) * ppb;
        if (subX >= 0 && subX <= width) {
          result.push({ x: subX, isBar: false, isBeat: false });
        }
      }
    }
    return result;
  }, [visibleStartBeat, visibleEndBeat, ppb, panX, width, snapDivision]);

  return (
    <Group>
      {/* Full clickable background — named 'grid-bg' so PianoRoll click handler works */}
      <Rect
        name="grid-bg"
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#0d0d12"
      />

      {/* Row backgrounds */}
      {rows.map((row) => (
        <Rect
          key={`row_${row.midi}`}
          name="grid-bg"
          x={0}
          y={row.y}
          width={width}
          height={ROW_HEIGHT}
          fill={row.black ? '#0c0c10' : '#12121a'}
        />
      ))}

      {/* Horizontal row separators */}
      {rows.map((row) => (
        <Line
          key={`hline_${row.midi}`}
          points={[0, row.y + ROW_HEIGHT, width, row.y + ROW_HEIGHT]}
          stroke={row.midi % 12 === 0 ? '#2a2a3c' : '#161620'}
          strokeWidth={row.midi % 12 === 0 ? 1 : 0.5}
          listening={false}
        />
      ))}

      {/* Vertical grid lines */}
      {vLines.map((line, i) => (
        <Line
          key={`vline_${i}`}
          points={[line.x, 0, line.x, height]}
          stroke={
            line.isBar ? '#2a2a3c' :
            line.isBeat ? '#1a1a28' :
            '#141420'
          }
          strokeWidth={line.isBar ? 1 : 0.5}
          dash={line.isBeat ? undefined : [2, 4]}
          listening={false}
        />
      ))}
    </Group>
  );
}
