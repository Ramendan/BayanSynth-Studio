/**
 * BayanSynth Studio — Piano Keys (Y-axis sidebar)
 *
 * Renders a vertical piano keyboard on the left edge of the PianoRoll.
 * White keys have a lighter fill, black keys are darker.
 * Octave labels (C2, C3, C4, ...) are shown at "C" boundaries.
 */

import React, { useMemo } from 'react';
import { Group, Rect, Text, Line } from 'react-konva';
import { NOTE_RANGE, ROW_HEIGHT, PIANO_KEY_WIDTH, midiToNoteName, isBlackKey } from '../../utils/constants';

export default function PianoKeys({ scrollY = 0, scaleY = 1 }) {
  const keys = useMemo(() => {
    const result = [];
    for (let midi = NOTE_RANGE.max - 1; midi >= NOTE_RANGE.min; midi--) {
      const y = (NOTE_RANGE.max - midi - 1) * ROW_HEIGHT;
      const black = isBlackKey(midi);
      const isC = midi % 12 === 0;
      result.push({ midi, y, black, isC, name: midiToNoteName(midi) });
    }
    return result;
  }, []);

  return (
    <Group>
      {/* Background */}
      <Rect
        x={0}
        y={0}
        width={PIANO_KEY_WIDTH}
        height={keys.length * ROW_HEIGHT}
        fill="#0e0e12"
      />

      {keys.map((k) => (
        <Group key={k.midi} y={k.y}>
          {/* Key rectangle */}
          <Rect
            x={0}
            y={0}
            width={PIANO_KEY_WIDTH}
            height={ROW_HEIGHT}
            fill={k.black ? '#0a0a0e' : '#1a1a22'}
            stroke="#1e1e28"
            strokeWidth={0.5}
          />

          {/* Highlight C rows */}
          {k.isC && (
            <Line
              points={[0, ROW_HEIGHT, PIANO_KEY_WIDTH, ROW_HEIGHT]}
              stroke="#2a2a3c"
              strokeWidth={1}
            />
          )}

          {/* Label — only show on C notes and F/A for orientation */}
          {(k.isC || k.midi % 12 === 5 || k.midi % 12 === 9) && (
            <Text
              x={4}
              y={ROW_HEIGHT / 2 - 5}
              text={k.name}
              fill={k.isC ? '#888898' : '#4a4a58'}
              fontSize={k.isC ? 11 : 9}
              fontFamily="Consolas, SF Mono, monospace"
              fontStyle={k.isC ? 'bold' : 'normal'}
            />
          )}

          {/* Black key accent — thin colored bar on left edge */}
          {k.black && (
            <Rect
              x={0}
              y={0}
              width={3}
              height={ROW_HEIGHT}
              fill="#2a2a3c"
            />
          )}
        </Group>
      ))}

      {/* Right border */}
      <Line
        points={[PIANO_KEY_WIDTH - 1, 0, PIANO_KEY_WIDTH - 1, keys.length * ROW_HEIGHT]}
        stroke="#2a2a3c"
        strokeWidth={1}
      />
    </Group>
  );
}
