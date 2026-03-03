/**
 * BayanSynth Studio — Note Block (Vocaloid-style "Word Note")
 *
 * A single note in the piano roll:
 *  - Top 20%: Arabic text
 *  - Bottom 80%: waveform visualization
 *  - Left edge handle: trim
 *  - Right edge handle: stretch (Rubberband)
 *  - Glow effect when selected
 *  - Phoneme label sub-line
 *
 * Receives x, y, width, height from parent (PianoRoll computes screen coords).
 */

import React, { useMemo, useRef } from 'react';
import { Group, Rect, Text, Line } from 'react-konva';

const HANDLE_WIDTH = 8;
const TEXT_RATIO = 0.2;      // top 20% for text
const WAVE_RATIO = 0.8;      // bottom 80% for waveform

export default function NoteBlock({
  node,
  x = 0,
  y = 0,
  width: noteWidth = 60,
  height: noteHeight = 60,
  color = '#00f0ff',
  selected = false,
  activeTool = 'arrow',
  onSelect,
  onDragEnd,
  onDragMove,
  onTrimLeft,
  onStretchRight,
  onStretchMove,
  onScissorClick,
}) {
  const groupRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const trimStartRef = useRef(0);
  const stretchStartRef = useRef(0);

  const textHeight = noteHeight * TEXT_RATIO;
  const waveHeight = noteHeight * WAVE_RATIO;
  const clampedWidth = Math.max(noteWidth, 20);

  // Generate waveform polyline from node.waveformData
  const waveformPoints = useMemo(() => {
    if (!node.waveformData || node.waveformData.length === 0) return null;
    const data = node.waveformData;
    const points = [];
    const step = clampedWidth / data.length;
    const centerY = textHeight + waveHeight / 2;
    const amp = waveHeight * 0.35;

    for (let i = 0; i < data.length; i++) {
      points.push(i * step, centerY - data[i] * amp);
    }
    for (let i = data.length - 1; i >= 0; i--) {
      points.push(i * step, centerY + data[i] * amp);
    }
    return points;
  }, [node.waveformData, clampedWidth, textHeight, waveHeight]);

  // Click handler
  const handleClick = (e) => {
    e.cancelBubble = true;
    if (activeTool === 'scissor') {
      const stage = e.target.getStage();
      const pointer = stage.getPointerPosition();
      // Convert to grid-local coords (parent layer already has correct offset)
      if (onScissorClick) onScissorClick(pointer.x - (e.target.getAbsolutePosition().x - x));
    } else {
      if (onSelect) onSelect(node.id);
    }
  };

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      draggable={activeTool === 'arrow'}
      onDragStart={(e) => {
        e.cancelBubble = true;
        dragStartRef.current = { x: e.target.x(), y: e.target.y() };
        if (onSelect) onSelect(node.id);
      }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        if (onDragMove) onDragMove(e);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        if (onDragEnd) onDragEnd(node.id, e);
      }}
      onClick={handleClick}
      onTap={handleClick}
    >
      {/* Main body */}
      <Rect
        width={clampedWidth}
        height={noteHeight}
        fill={color + (selected ? 'cc' : '88')}
        cornerRadius={4}
        stroke={selected ? color : 'transparent'}
        strokeWidth={selected ? 2 : 0}
        shadowColor={selected ? color : 'transparent'}
        shadowBlur={selected ? 15 : 0}
        shadowOpacity={selected ? 0.8 : 0}
      />

      {/* Text band (top 20%) */}
      <Rect
        y={0}
        width={clampedWidth}
        height={textHeight}
        fill={color + '44'}
        cornerRadius={[4, 4, 0, 0]}
      />

      {/* Arabic text */}
      <Text
        x={6}
        y={2}
        text={node.text || '(empty)'}
        fill="#ffffff"
        fontSize={11}
        fontFamily="'Noto Sans Arabic', 'Segoe UI', sans-serif"
        width={clampedWidth - 12}
        height={textHeight - 2}
        wrap="none"
        ellipsis={true}
        listening={false}
      />

      {/* Phoneme label (below text band) */}
      {node.phonemes && (
        <Text
          x={6}
          y={textHeight + 1}
          text={node.phonemes}
          fill="#ffffff66"
          fontSize={8}
          fontFamily="Consolas, SF Mono, monospace"
          width={clampedWidth - 12}
          wrap="none"
          ellipsis={true}
          listening={false}
        />
      )}

      {/* Waveform visualization */}
      {waveformPoints ? (
        <Line
          points={waveformPoints}
          fill={color + '33'}
          stroke={color + '88'}
          strokeWidth={1}
          closed={true}
          listening={false}
        />
      ) : (
        // Placeholder pattern when no audio yet
        <Group listening={false}>
          {Array.from({ length: Math.floor(clampedWidth / 6) }).map((_, i) => (
            <Line
              key={i}
              points={[
                i * 6 + 3, textHeight + waveHeight * 0.3,
                i * 6 + 3, textHeight + waveHeight * 0.7,
              ]}
              stroke={color + '22'}
              strokeWidth={1}
            />
          ))}
        </Group>
      )}

      {/* Duration indicator */}
      {node.duration > 0 && (
        <Text
          x={clampedWidth - 36}
          y={noteHeight - 12}
          text={`${node.duration.toFixed(1)}s`}
          fill="#ffffff44"
          fontSize={8}
          fontFamily="Consolas, SF Mono, monospace"
          listening={false}
        />
      )}

      {/* Left Edge Handle (trim) */}
      <Rect
        x={0}
        y={0}
        width={HANDLE_WIDTH}
        height={noteHeight}
        fill="transparent"
        draggable
        onDragStart={(e) => {
          e.cancelBubble = true;
          trimStartRef.current = e.target.x();
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          e.target.y(0);
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          const delta = e.target.x() - trimStartRef.current;
          e.target.x(0);
          e.target.y(0);
          if (onTrimLeft && Math.abs(delta) > 2) onTrimLeft(delta);
        }}
        onMouseEnter={(e) => {
          e.target.getStage().container().style.cursor = 'w-resize';
        }}
        onMouseLeave={(e) => {
          e.target.getStage().container().style.cursor = 'default';
        }}
      />

      {/* Right Edge Handle (stretch) */}
      <Rect
        x={clampedWidth - HANDLE_WIDTH}
        y={0}
        width={HANDLE_WIDTH}
        height={noteHeight}
        fill="transparent"
        draggable
        onDragStart={(e) => {
          e.cancelBubble = true;
          stretchStartRef.current = e.target.x();
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          e.target.y(0);
          if (onStretchMove) {
            const delta = e.target.x() - stretchStartRef.current;
            onStretchMove(delta);
          }
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          const delta = e.target.x() - stretchStartRef.current;
          e.target.x(clampedWidth - HANDLE_WIDTH);
          e.target.y(0);
          if (onStretchRight && Math.abs(delta) > 2) onStretchRight(delta);
        }}
        onMouseEnter={(e) => {
          e.target.getStage().container().style.cursor = 'e-resize';
        }}
        onMouseLeave={(e) => {
          e.target.getStage().container().style.cursor = 'default';
        }}
      />
    </Group>
  );
}
