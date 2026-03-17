/**
 * BayanSynth Studio — Time Ruler (X-axis header)
 *
 * Displays bars/beats and time (seconds) along the top of the piano roll.
 * Tick marks at bar, beat, and sub-beat boundaries.
 */

import React, { useMemo } from 'react';
import { Group, Rect, Text, Line } from 'react-konva';
import { PIXELS_PER_BEAT, beatToTime } from '../../utils/constants';
import { getThemeColors } from '../../utils/themeColors';

const RULER_H = 36;

export default function TimeRuler({ width, bpm = 120, zoom = 1, panX = 0, snapDivision = '1/4', onSeek, theme = 'dark' }) {
  const colors = getThemeColors(theme);

  const ppb = PIXELS_PER_BEAT * zoom;

  const lines = useMemo(() => {
    const result = [];
    const startBeat = Math.max(0, Math.floor(panX / ppb));
    const endBeat = Math.ceil((panX + width) / ppb) + 1;

    for (let beat = startBeat; beat <= endBeat; beat++) {
      const x = beat * ppb - panX;
      if (x < -20 || x > width + 20) continue;
      const isBar = beat % 4 === 0;
      const time = beatToTime(beat, bpm);

      result.push({ beat, x, isBar, time });

      // Sub-beats
      if (snapDivision === '1/16' || snapDivision === '1/8') {
        const sub = snapDivision === '1/16' ? 4 : 2;
        for (let s = 1; s < sub; s++) {
          const subBeat = beat + s / sub;
          const subX = subBeat * ppb - panX;
          if (subX >= 0 && subX <= width) {
            result.push({ beat: subBeat, x: subX, isBar: false, isSub: true, time: beatToTime(subBeat, bpm) });
          }
        }
      }
    }

    return result;
  }, [ppb, panX, width, bpm, snapDivision]);

  // Handle click-to-seek on the ruler
  const handleClick = (e) => {
    if (!onSeek) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const localX = pos.x;
    const beats = (localX + panX) / ppb;
    const timeSec = beatToTime(beats, bpm);
    onSeek(Math.max(0, timeSec));
  };

  return (
    <Group>
      {/* Background */}
        <Rect x={0} y={0} width={width} height={RULER_H} fill={colors.rulerBg} onClick={handleClick} />

      {lines.map((line, i) => {
        if (line.isSub) {
          return (
            <Line
              key={`sub_${i}`}
              points={[line.x, RULER_H - 6, line.x, RULER_H]}
                stroke={colors.rulerTickMinor}
              strokeWidth={0.5}
              listening={false}
            />
          );
        }

        return (
          <Group key={`beat_${i}`}>
            {/* Tick mark */}
            <Line
              points={[
                line.x, line.isBar ? 2 : RULER_H - 12,
                line.x, RULER_H,
              ]}
                stroke={line.isBar ? colors.rulerTickMajor : colors.rulerTickMinor}
              strokeWidth={line.isBar ? 1 : 0.5}
              listening={false}
            />

            {/* Bar number */}
            {line.isBar && (
              <Text
                x={line.x + 4}
                y={3}
                text={`${Math.floor(line.beat / 4) + 1}`}
                  fill={colors.rulerText}
                fontSize={11}
                fontFamily="Consolas, SF Mono, monospace"
                fontStyle="bold"
                listening={false}
              />
            )}

            {/* Time label */}
            {line.isBar && (
              <Text
                x={line.x + 4}
                y={15}
                text={`${line.time.toFixed(1)}s`}
                  fill={colors.rulerTextDim}
                fontSize={9}
                fontFamily="Consolas, SF Mono, monospace"
                listening={false}
              />
            )}
          </Group>
        );
      })}

      {/* Bottom border */}
      <Line
        points={[0, RULER_H, width, RULER_H]}
          stroke={colors.rulerBorder}
        strokeWidth={1}
        listening={false}
      />
    </Group>
  );
}
