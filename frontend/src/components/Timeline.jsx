import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Line, Group } from 'react-konva';

const PIXELS_PER_SECOND = 100;
const TRACK_HEIGHT = 80;
const HEADER_WIDTH = 150;

export default function Timeline({ tracks, bgTrack, selectedId, onSelect, onUpdateNode, onUpdateTrack, onAddNode, onRemoveNode, onSynthesizeNode }) {
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const stageRef = useRef(null);

  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    if (e.evt.ctrlKey) {
      // Zoom
      const oldScale = scale.x;
      const pointer = stage.getPointerPosition();
      const mousePointTo = {
        x: (pointer.x - position.x) / oldScale,
        y: (pointer.y - position.y) / scale.y,
      };

      const newScale = e.evt.deltaY > 0 ? oldScale * 0.9 : oldScale * 1.1;
      setScale({ x: newScale, y: 1 });
      setPosition({
        x: pointer.x - mousePointTo.x * newScale,
        y: position.y,
      });
    } else if (e.evt.shiftKey) {
      // Pan X
      setPosition({ x: position.x - e.evt.deltaY, y: position.y });
    } else {
      // Pan Y
      setPosition({ x: position.x, y: position.y - e.evt.deltaY });
    }
  };

  const maxTime = Math.max(
    10,
    ...tracks.flatMap(t => t.nodes.map(n => n.start_time + Math.max(n.duration, 1)))
  );
  const stageWidth = window.innerWidth - 320; // minus properties panel
  const stageHeight = window.innerHeight - 48 - 36 - 60; // minus topbar, bottombar, statusbar

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-primary)', position: 'relative' }}>
      <Stage
        width={stageWidth}
        height={stageHeight}
        onWheel={handleWheel}
        draggable
        ref={stageRef}
        x={position.x}
        y={position.y}
        scale={scale}
        onDragEnd={(e) => {
          setPosition({ x: e.target.x(), y: e.target.y() });
        }}
      >
        <Layer>
          {/* Grid */}
          {Array.from({ length: Math.ceil(maxTime) + 5 }).map((_, i) => (
            <Line
              key={`grid_${i}`}
              points={[i * PIXELS_PER_SECOND + HEADER_WIDTH, 0, i * PIXELS_PER_SECOND + HEADER_WIDTH, tracks.length * TRACK_HEIGHT]}
              stroke="#2a3a5c"
              strokeWidth={1 / scale.x}
              dash={[4, 4]}
            />
          ))}

          {/* Background Track Pitch Contour */}
          {bgTrack && bgTrack.pitch && (
            <Line
              points={bgTrack.pitch.flatMap((p, i) => {
                const time = (i * bgTrack.hopLength) / bgTrack.sr;
                // Map pitch 50-2000Hz to Y axis (log scale roughly)
                const y = p > 0 ? tracks.length * TRACK_HEIGHT - (Math.log2(p / 50) / Math.log2(2000 / 50)) * (tracks.length * TRACK_HEIGHT) : -10;
                return [time * PIXELS_PER_SECOND + HEADER_WIDTH, y];
              })}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth={2 / scale.x}
              tension={0.5}
            />
          )}

          {/* Tracks */}
          {tracks.map((track, trackIdx) => (
            <Group key={track.id} y={trackIdx * TRACK_HEIGHT}>
              {/* Track Header (Fixed X) */}
              <Group x={-position.x / scale.x}>
                <Rect width={HEADER_WIDTH} height={TRACK_HEIGHT} fill="#16213e" stroke="#2a3a5c" strokeWidth={1 / scale.x} />
                <Text x={10} y={10} text={track.name} fill="#e0e0e0" fontSize={14} />
                <Rect x={10} y={30} width={20} height={20} fill={track.mute ? '#e94560' : '#2a3a5c'} cornerRadius={4} onClick={() => onUpdateTrack(track.id, { mute: !track.mute })} />
                <Text x={15} y={34} text="M" fill="#fff" fontSize={12} listening={false} />
                <Rect x={35} y={30} width={20} height={20} fill={track.solo ? '#ffc107' : '#2a3a5c'} cornerRadius={4} onClick={() => onUpdateTrack(track.id, { solo: !track.solo })} />
                <Text x={40} y={34} text="S" fill="#fff" fontSize={12} listening={false} />
                <Rect x={60} y={30} width={20} height={20} fill="#2a3a5c" cornerRadius={4} onClick={() => onAddNode(track.id)} />
                <Text x={65} y={34} text="+" fill="#fff" fontSize={12} listening={false} />
              </Group>

              {/* Track Background */}
              <Rect x={HEADER_WIDTH} width={maxTime * PIXELS_PER_SECOND} height={TRACK_HEIGHT} fill="rgba(255,255,255,0.02)" stroke="#2a3a5c" strokeWidth={1 / scale.x} />

              {/* Nodes */}
              {track.nodes.map((node) => {
                const nodeWidth = Math.max(node.duration || 2, 0.5) * PIXELS_PER_SECOND;
                const isSelected = selectedId === node.id;
                return (
                  <Group
                    key={node.id}
                    x={node.start_time * PIXELS_PER_SECOND + HEADER_WIDTH}
                    y={10 - (node.pitch_shift || 0) * 5}
                    draggable
                    onDragStart={(e) => {
                      onSelect(node.id);
                      e.target.setAttr('opacity', 0.5);
                    }}
                    onDragEnd={(e) => {
                      e.target.setAttr('opacity', 1);
                      const newX = Math.max(HEADER_WIDTH, e.target.x());
                      const newTime = (newX - HEADER_WIDTH) / PIXELS_PER_SECOND;
                      
                      // Calculate pitch shift based on Y position
                      // Y=10 is 0 shift. Each 5px is 1 semitone.
                      const newY = e.target.y();
                      const pitchShift = Math.round((10 - newY) / 5);
                      
                      onUpdateNode(node.id, { start_time: newTime, pitch_shift: pitchShift });
                      e.target.x(newX);
                      e.target.y(10 - pitchShift * 5);
                    }}
                    onClick={() => onSelect(node.id)}
                  >
                    <Rect
                      width={nodeWidth}
                      height={TRACK_HEIGHT - 20}
                      fill={isSelected ? '#ff6b81' : '#e94560'}
                      cornerRadius={4}
                      shadowColor="black"
                      shadowBlur={isSelected ? 10 : 0}
                      shadowOpacity={0.5}
                    />
                    <Text
                      x={5}
                      y={5}
                      text={node.text || '(empty)'}
                      fill="#fff"
                      fontSize={12}
                      width={nodeWidth - 10}
                      wrap="none"
                      ellipsis={true}
                      listening={false}
                    />
                    {/* Stretch Handle Right */}
                    <Rect
                      x={nodeWidth - 10}
                      y={0}
                      width={10}
                      height={TRACK_HEIGHT - 20}
                      fill="rgba(255,255,255,0.2)"
                      draggable
                      onDragMove={(e) => {
                        e.cancelBubble = true;
                        const newWidth = Math.max(20, e.target.x() + 10);
                        e.target.x(newWidth - 10);
                        e.target.y(0);
                        const newDuration = newWidth / PIXELS_PER_SECOND;
                        // Update speed based on original duration vs new duration
                        if (node.audioUrl && node.duration) {
                           const originalDuration = node.duration * node.speed;
                           const newSpeed = originalDuration / newDuration;
                           onUpdateNode(node.id, { speed: Math.max(0.5, Math.min(2.0, newSpeed)) });
                        }
                      }}
                      onMouseEnter={(e) => {
                        const container = e.target.getStage().container();
                        container.style.cursor = 'ew-resize';
                      }}
                      onMouseLeave={(e) => {
                        const container = e.target.getStage().container();
                        container.style.cursor = 'default';
                      }}
                    />
                  </Group>
                );
              })}
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
