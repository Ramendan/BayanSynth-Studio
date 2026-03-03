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
import { Group, Rect, Text, Line, Circle } from 'react-konva';

const HANDLE_WIDTH = 8;
const TEXT_RATIO = 0.2;      // top 20% for text
const WAVE_RATIO = 0.8;      // bottom 80% for waveform

// Badge colours (match EffectsLane / VibLane)
const BADGE = {
  reverb:  '#00f0ff',
  delay:   '#ff2dcc',
  chorus:  '#a855f7',
  eq:      '#ffd700',
  vib:     '#a855f7',
  trans:   '#22c55e',
};

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

  // ── Badge data ──────────────────────────────────────────────
  const badges = useMemo(() => {
    const list = [];
    // Effects — one dot per enabled effect
    const fx = node.effects;
    if (fx?.reverb?.enabled)  list.push({ key: 'reverb',  color: BADGE.reverb,  label: 'R' });
    if (fx?.delay?.enabled)   list.push({ key: 'delay',   color: BADGE.delay,   label: 'D' });
    if (fx?.chorus?.enabled)  list.push({ key: 'chorus',  color: BADGE.chorus,  label: 'C' });
    if (fx?.eq?.enabled)      list.push({ key: 'eq',      color: BADGE.eq,      label: 'E' });
    return list;
  }, [node.effects]);

  const hasVib   = (node.automationVIB?.depth ?? 0) > 0;
  const hasTrans = !!(node.transition && node.transition.type !== 'none');

  // Tiny sine-wave points for vibrato badge (drawn in text band)
  const vibWavePoints = useMemo(() => {
    if (!hasVib) return null;
    const pts = [];
    const W = 20; const H = 6; const S = 8;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(t * W, S + Math.sin(t * Math.PI * 2) * (H / 2));
    }
    return pts;
  }, [hasVib]);

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

      {/* ── Feature badges (text band, right side) ────────────── */}
      {clampedWidth >= 36 && (
        <Group listening={false}>
          {/* Effect dots: up to 4 small circles, right-to-left from right edge */}
          {badges.map((b, i) => {
            const cx = clampedWidth - 6 - i * 10;
            const cy = textHeight / 2;
            if (cx < 16) return null;
            return (
              <Circle
                key={b.key}
                x={cx}
                y={cy}
                radius={3.5}
                fill={b.color}
                shadowColor={b.color}
                shadowBlur={4}
                shadowOpacity={0.8}
                listening={false}
              />
            );
          })}

          {/* Vibrato mini sine wave */}
          {hasVib && vibWavePoints && (() => {
            const rightOffset = 6 + badges.length * 10;
            const x0 = clampedWidth - rightOffset - 24;
            if (x0 < 6) return null;
            return (
              <Line
                x={x0}
                points={vibWavePoints}
                stroke={BADGE.vib}
                strokeWidth={1.5}
                tension={0.4}
                opacity={0.9}
                shadowColor={BADGE.vib}
                shadowBlur={4}
                shadowOpacity={0.6}
                listening={false}
              />
            );
          })()}
        </Group>
      )}

      {/* Transition in-marker: soft green glow on left edge + small arrow */}
      {hasTrans && (
        <Group listening={false}>
          {/* Green glow overlay at left edge */}
          <Rect
            x={0}
            y={0}
            width={Math.min(18, clampedWidth * 0.25)}
            height={noteHeight}
            fill={BADGE.trans + '22'}
            cornerRadius={[4, 0, 0, 4]}
          />
          {/* Arrow "→" label */}
          <Text
            x={2}
            y={textHeight / 2 - 5}
            text="↝"
            fill={BADGE.trans}
            fontSize={10}
            opacity={0.9}
            shadowColor={BADGE.trans}
            shadowBlur={6}
            shadowOpacity={0.8}
          />
        </Group>
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
