/**
 * BayanSynth Studio — Piano Roll (Main Container)
 *
 * Composes: PianoKeys | TimeRuler + GridOverlay + NoteBlocks + PitchCurve
 * Handles zoom, pan, tool dispatch, node creation/split, drag,
 * snap-ghost highlight, draggable playhead, and end-node marker.
 *
 * Key fixes from the feature pass:
 *  - NOTE_HEIGHT = NOTE_HEIGHT (1 tile = 1 node)  [Item 2]
 *  - Snap ghost rendered during drag                [Item 3]
 *  - Pencil creates on selectedTrackId              [Item 6]
 *  - Click on node transfers node between tracks    [see TrackHeaders]
 *  - Draggable playhead via TimeRuler click         [Item 16]
 *  - End-node marker line                           [Item 17]
 */

import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { Stage, Layer, Line, Group, Rect, Text } from 'react-konva';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  selectedTrackIdAtom,
  activeToolAtom,
  bpmAtom,
  snapDivisionAtom,
  zoomAtom,
  panAtom,
  playheadAtom,
  isPlayingAtom,
  addNodeAtom,
  updateNodeAtom,
  removeNodeAtom,
  splitNodeAtom,
  isGeneratingAtom,
  statusTextAtom,
  autoTashkeelAtom,
  voicesAtom,
  dragGhostAtom,
  endNodeTimeAtom,
  selectedNodeIdsAtom,
  showPitCurveAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';
import {
  PIXELS_PER_BEAT,
  ROW_HEIGHT,
  NOTE_HEIGHT,
  NOTE_RANGE,
  PIANO_KEY_WIDTH,
  midiToNoteName,
} from '../../utils/constants';
import { snapToGrid } from '../../utils/gridSnap';
import { getTrackColor } from '../../utils/colorPalette';

import PianoKeys from './PianoKeys';
import TimeRuler from './TimeRuler';
import GridOverlay from './GridOverlay';
import NoteBlock from './NoteBlock';
import PitchCurve from './PitchCurve';
import TrackHeaders from './TrackHeaders';

const RULER_HEIGHT = 36;
const HEADER_WIDTH = 160;
const totalRows = NOTE_RANGE.max - NOTE_RANGE.min;

export default function PianoRoll() {
  const containerRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 600 });

  const tracks = useAtomValue(tracksAtom);
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom);
  const selectedTrackId = useAtomValue(selectedTrackIdAtom);
  const activeTool = useAtomValue(activeToolAtom);
  const bpm = useAtomValue(bpmAtom);
  const snapDivision = useAtomValue(snapDivisionAtom);
  const [zoom, setZoom] = useAtom(zoomAtom);
  const [pan, setPan] = useAtom(panAtom);
  const [playhead, setPlayhead] = useAtom(playheadAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const voices = useAtomValue(voicesAtom);
  const autoTashkeel = useAtomValue(autoTashkeelAtom);
  const endNodeTime = useAtomValue(endNodeTimeAtom);
  const dragGhost = useAtomValue(dragGhostAtom);
  const setDragGhost = useSetAtom(dragGhostAtom);
  const showPitCurve = useAtomValue(showPitCurveAtom);

  const addNode = useSetAtom(addNodeAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const removeNode = useSetAtom(removeNodeAtom);
  const splitNode = useSetAtom(splitNodeAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const setStatus = useSetAtom(statusTextAtom);
  const setEndNodeTime = useSetAtom(endNodeTimeAtom);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Canvas dimensions
  const canvasWidth = stageSize.width - HEADER_WIDTH;
  const canvasHeight = stageSize.height;
  const gridWidth = Math.max(canvasWidth - PIANO_KEY_WIDTH, 400);
  const gridHeight = Math.max(canvasHeight - RULER_HEIGHT, 200);

  // Derived zoom values
  const ppb = PIXELS_PER_BEAT * zoom; // pixels per beat on screen

  // Playhead position in pixels (screen coords within grid)
  const playheadX = useMemo(() => {
    const beatsFromStart = (playhead / 60) * bpm;
    return beatsFromStart * ppb - pan.x;
  }, [playhead, bpm, ppb, pan.x]);

  // End node marker position
  const endMarkerX = useMemo(() => {
    if (endNodeTime == null) return null;
    const beatsFromStart = (endNodeTime / 60) * bpm;
    return beatsFromStart * ppb - pan.x;
  }, [endNodeTime, bpm, ppb, pan.x]);

  // All nodes across all tracks (flattened with track info)
  const allNodes = useMemo(() => {
    return tracks.flatMap((track, idx) =>
      track.nodes.map(node => ({
        ...node,
        trackId: track.id,
        trackIndex: idx,
        trackColor: track.color || getTrackColor(track.colorIndex ?? idx),
        trackMute: track.mute,
        trackSolo: track.solo,
        trackVisible: track.visible,
      }))
    );
  }, [tracks]);

  // Convert screen position (relative to grid origin) to time/midi
  const screenToGrid = useCallback((screenX, screenY) => {
    const gridX = (screenX + pan.x) / ppb; // in beats
    const gridY = screenY + pan.y; // in pixels (unzoomed Y)
    const timeSec = (gridX * 60) / bpm;
    const midi = NOTE_RANGE.max - Math.floor(gridY / ROW_HEIGHT);
    return { timeSec, midi, gridX };
  }, [pan.x, pan.y, ppb, bpm]);

  // Handle click on canvas area (node creation / selection)
  const handleStageClick = useCallback((e) => {
    const target = e.target;
    const targetName = target.name ? target.name() : '';

    // Allow clicks on the grid background or the Stage itself
    const isGridClick = target === e.currentTarget || targetName === 'grid-bg';
    if (!isGridClick) return;

    const stage = e.currentTarget;
    const pos = stage.getPointerPosition();

    // Convert to grid-local coords (subtract piano keys and ruler offset)
    const localX = pos.x - PIANO_KEY_WIDTH;
    const localY = pos.y - RULER_HEIGHT;

    if (localX < 0 || localY < 0) return;

    if (activeTool === 'pencil') {
      const { timeSec, midi } = screenToGrid(localX, localY);
      if (midi < NOTE_RANGE.min || midi > NOTE_RANGE.max) return;

      const snappedTime = snapToGrid(Math.max(0, timeSec), bpm, snapDivision);
      const pitchShift = midi - NOTE_RANGE.center;

      // Use selected track, fallback to first track
      const targetTrack = tracks.find(t => t.id === selectedTrackId) || tracks[0];
      if (!targetTrack) return;

      pushHistory();
      addNode({
        trackId: targetTrack.id,
        text: '\u0643\u0644\u0645\u0629', // كلمة
        overrides: {
          voice: voices[0] || null,
          speed: 1.0,
          start_time: snappedTime,
          pitch_shift: pitchShift,
          duration: 60 / bpm, // one beat duration
          volume: 1.0,
          seed: Math.floor(Math.random() * 10000),
        },
      });
      setStatus(`Added note at ${snappedTime.toFixed(2)}s — ${midiToNoteName(midi)}`);
    } else if (activeTool === 'arrow') {
      setSelectedNodeId(null);
    } else if (activeTool === 'pan') {
      // Pan tool: handled by drag (no-op on click)
    }
  }, [activeTool, bpm, snapDivision, zoom, pan, ppb, tracks, voices, selectedTrackId, addNode, pushHistory, setSelectedNodeId, setStatus, screenToGrid]);

  // Handle wheel for zoom / pan
  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();

    if (e.evt.ctrlKey) {
      // Zoom horizontally
      const dy = e.evt.deltaY;
      const factor = dy > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.max(0.25, Math.min(4, prev * factor)));
    } else if (e.evt.shiftKey) {
      // Horizontal pan
      setPan(prev => ({
        ...prev,
        x: Math.max(0, prev.x + e.evt.deltaY * 0.5),
      }));
    } else {
      // Vertical pan
      setPan(prev => ({
        ...prev,
        y: Math.max(0, Math.min(totalRows * ROW_HEIGHT - gridHeight, prev.y + e.evt.deltaY * 0.5)),
      }));
    }
  }, [gridHeight, setPan, setZoom]);

  // ── Pan tool: drag to move canvas ──────────────────────────
  const panDragRef = useRef(null);

  const handleStageMouseDown = useCallback((e) => {
    if (activeTool !== 'pan') return;
    const pos = e.target.getStage().getPointerPosition();
    panDragRef.current = { startX: pos.x, startY: pos.y, startPanX: pan.x, startPanY: pan.y };
  }, [activeTool, pan.x, pan.y]);

  const handleStageMouseMove = useCallback((e) => {
    if (!panDragRef.current) return;
    const pos = e.target.getStage().getPointerPosition();
    const dx = panDragRef.current.startX - pos.x;
    const dy = panDragRef.current.startY - pos.y;
    setPan({
      x: Math.max(0, panDragRef.current.startPanX + dx),
      y: Math.max(0, Math.min(totalRows * ROW_HEIGHT - gridHeight, panDragRef.current.startPanY + dy)),
    });
  }, [setPan, gridHeight]);

  const handleStageMouseUp = useCallback(() => {
    panDragRef.current = null;
  }, []);

  // Handle node selection — or delete if delete tool active
  const handleNodeSelect = useCallback((nodeId) => {
    if (activeTool === 'delete') {
      pushHistory();
      removeNode(nodeId);
      setStatus('Deleted note');
      return;
    }
    setSelectedNodeId(nodeId);
  }, [activeTool, setSelectedNodeId, pushHistory, removeNode, setStatus]);

  // Handle node drag move — show snap ghost
  const handleNodeDragMove = useCallback((nodeId, e) => {
    const group = e.target;
    const newX = group.x();
    const newY = group.y();
    const { timeSec, midi } = screenToGrid(newX, newY);
    const snappedTime = snapToGrid(Math.max(0, timeSec), bpm, snapDivision);
    const clampedMidi = Math.max(NOTE_RANGE.min, Math.min(NOTE_RANGE.max, midi));

    const beatStart = (snappedTime * bpm) / 60;
    const ghostX = beatStart * ppb - pan.x;
    const ghostY = (NOTE_RANGE.max - clampedMidi - 1) * ROW_HEIGHT - pan.y;

    // Find node width
    const node = allNodes.find(n => n.id === nodeId);
    const dur = node ? (node.duration || 0.5) : 0.5;
    const ghostW = (dur * bpm / 60) * ppb;

    setDragGhost({ x: ghostX, y: ghostY, w: ghostW, h: NOTE_HEIGHT });
  }, [screenToGrid, bpm, snapDivision, ppb, pan.x, pan.y, allNodes, setDragGhost]);

  // Handle node drag end — snap to grid, update start_time and pitch_shift
  const handleNodeDragEnd = useCallback((nodeId, e) => {
    setDragGhost(null);
    const group = e.target;
    const newX = group.x();
    const newY = group.y();

    const { timeSec, midi } = screenToGrid(newX, newY);
    const snappedTime = snapToGrid(Math.max(0, timeSec), bpm, snapDivision);
    const clampedMidi = Math.max(NOTE_RANGE.min, Math.min(NOTE_RANGE.max, midi));
    const newPitchShift = clampedMidi - NOTE_RANGE.center;

    // Force the group back to the snapped screen position so Konva + React stay in sync
    const snappedBeat = (snappedTime * bpm) / 60;
    group.x(snappedBeat * ppb - pan.x);
    group.y((NOTE_RANGE.max - clampedMidi - 1) * ROW_HEIGHT - pan.y);

    pushHistory();
    updateNode({ id: nodeId, start_time: snappedTime, pitch_shift: newPitchShift });
  }, [bpm, snapDivision, screenToGrid, pushHistory, updateNode, setDragGhost, ppb, pan.x, pan.y]);

  // Handle left-edge trim
  const handleTrimLeft = useCallback((nodeId, deltaPixels) => {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    const deltaTime = (deltaPixels / ppb) * (60 / bpm);
    const newStart = Math.max(0, node.start_time + deltaTime);
    const newDuration = Math.max(0.1, (node.duration || 1) - deltaTime);
    pushHistory();
    updateNode({ id: nodeId, start_time: newStart, duration: newDuration });
  }, [allNodes, ppb, bpm, pushHistory, updateNode]);

  // Handle right-edge stretch → computes engineSpeed (Item 9)
  // Shows a stretch ghost during the drag to indicate the new size
  const handleStretchMove = useCallback((nodeId, deltaPixels) => {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    const deltaTime = (deltaPixels / ppb) * (60 / bpm);
    const newDuration = Math.max(0.1, (node.duration || 1) + deltaTime);

    const beatStart = (node.start_time * bpm) / 60;
    const ghostX = beatStart * ppb - pan.x;
    const midi = NOTE_RANGE.center + (node.pitch_shift || 0);
    const ghostY = (NOTE_RANGE.max - midi - 1) * ROW_HEIGHT - pan.y;
    const ghostW = (newDuration * bpm / 60) * ppb;
    setDragGhost({ x: ghostX, y: ghostY, w: ghostW, h: NOTE_HEIGHT });
  }, [allNodes, ppb, bpm, pan.x, pan.y, setDragGhost]);

  const handleStretchRight = useCallback((nodeId, deltaPixels) => {
    setDragGhost(null);
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    const deltaTime = (deltaPixels / ppb) * (60 / bpm);
    const newDuration = Math.max(0.1, (node.duration || 1) + deltaTime);
    const origDur = node.originalDuration || node.duration || 1;
    const engineSpeed = origDur / newDuration; // faster if shorter, slower if longer

    pushHistory();
    updateNode({ id: nodeId, duration: newDuration, engineSpeed: Math.max(0.25, Math.min(4, engineSpeed)) });
  }, [allNodes, ppb, bpm, pushHistory, updateNode, setDragGhost]);

  // Handle scissor split
  const handleScissorSplit = useCallback((nodeId, pointerX) => {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    // pointerX is in grid-local screen coords
    const nodeScreenX = (node.start_time * bpm / 60) * ppb - pan.x;
    const splitOffset = ((pointerX - nodeScreenX) / ppb) * (60 / bpm);
    if (splitOffset <= 0.05 || splitOffset >= (node.duration || 1) - 0.05) return;
    const splitTime = node.start_time + splitOffset;
    pushHistory();
    splitNode({ nodeId, splitTime });
    setStatus('Split note');
  }, [allNodes, bpm, ppb, pan.x, pushHistory, splitNode, setStatus]);

  // Handle playhead seek (from TimeRuler click)
  const handleRulerSeek = useCallback((timeSec) => {
    setPlayhead(Math.max(0, timeSec));
  }, [setPlayhead]);

  // Handle end marker drag
  const handleEndMarkerDrag = useCallback((e) => {
    const markerScreenX = e.target.x();
    const beats = (markerScreenX + pan.x) / ppb;
    const timeSec = (beats * 60) / bpm;
    setEndNodeTime(Math.max(0, timeSec));
  }, [pan.x, ppb, bpm, setEndNodeTime]);

  // Handle playhead drag (triangle at top) — used by Layer 3 (legacy, kept for safety)
  const handlePlayheadDrag = useCallback((e) => {
    const x = e.target.x();
    const beats = (x + pan.x) / ppb;
    const timeSec = Math.max(0, (beats * 60) / bpm);
    setPlayhead(timeSec);
  }, [pan.x, ppb, bpm, setPlayhead]);

  // Handle playhead drag in overlay Layer 4 (absolute stage coords, includes PIANO_KEY_WIDTH)
  const handlePlayheadDragL4 = useCallback((e) => {
    const x = e.target.x() - PIANO_KEY_WIDTH;
    const beats = (x + pan.x) / ppb;
    const timeSec = Math.max(0, (beats * 60) / bpm);
    setPlayhead(timeSec);
  }, [pan.x, ppb, bpm, setPlayhead]);

  // Handle end marker drag in overlay Layer 4
  const handleEndMarkerDragL4 = useCallback((e) => {
    const x = e.target.x() - PIANO_KEY_WIDTH;
    const beats = (x + pan.x) / ppb;
    const timeSec = (beats * 60) / bpm;
    setEndNodeTime(Math.max(0, timeSec));
  }, [pan.x, ppb, bpm, setEndNodeTime]);

  // Compute node screen positions (filter hidden tracks)
  const renderedNodes = useMemo(() => {
    return allNodes
      .filter(node => node.trackVisible !== false)
      .map(node => {
        const beatStart = (node.start_time * bpm) / 60;
        const beatDur = ((node.duration || 0.5) * bpm) / 60;
        const x = beatStart * ppb - pan.x;
        const midi = NOTE_RANGE.center + (node.pitch_shift || 0);
        const y = (NOTE_RANGE.max - midi - 1) * ROW_HEIGHT - pan.y;
        const w = Math.max(beatDur * ppb, 20);
        return { ...node, screenX: x, screenY: y, screenW: w, screenH: NOTE_HEIGHT };
      });
  }, [allNodes, bpm, ppb, pan.x, pan.y]);

  return (
    <div className="piano-roll-container" ref={containerRef}>
      {/* Track Headers (DOM, pinned left) */}
      <TrackHeaders />

      {/* Canvas Area */}
      <div className={`piano-roll-canvas tool-${activeTool}`}>
        <Stage
          width={canvasWidth}
          height={canvasHeight}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onDblClick={handleStageClick}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
        >
          {/* Layer 1: Piano Keys (fixed left column) */}
          <Layer>
            <Group y={RULER_HEIGHT} clipX={0} clipY={0} clipWidth={PIANO_KEY_WIDTH} clipHeight={gridHeight}>
              <Group y={-pan.y}>
                <PianoKeys scrollY={pan.y} />
              </Group>
            </Group>
          </Layer>

          {/* Layer 2: Time Ruler (fixed top row, offset from piano keys) */}
          <Layer>
            <Group x={PIANO_KEY_WIDTH} clipX={0} clipY={0} clipWidth={gridWidth} clipHeight={RULER_HEIGHT}>
              <TimeRuler
                width={gridWidth}
                bpm={bpm}
                zoom={zoom}
                panX={pan.x}
                snapDivision={snapDivision}
                onSeek={handleRulerSeek}
              />
            </Group>
          </Layer>

          {/* Layer 3: Grid + Notes + Playhead */}
          <Layer
            x={PIANO_KEY_WIDTH}
            y={RULER_HEIGHT}
            clipX={0}
            clipY={0}
            clipWidth={gridWidth}
            clipHeight={gridHeight}
          >
            {/* Grid background */}
            <GridOverlay
              width={gridWidth}
              height={gridHeight}
              zoom={zoom}
              panX={pan.x}
              panY={pan.y}
              snapDivision={snapDivision}
            />

            {/* Snap ghost during drag */}
            {dragGhost && (
              <Rect
                x={dragGhost.x}
                y={dragGhost.y}
                width={dragGhost.w}
                height={dragGhost.h}
                fill="#ffffff11"
                stroke="#ffffff44"
                strokeWidth={1}
                dash={[4, 4]}
                cornerRadius={3}
                listening={false}
              />
            )}

            {/* Note blocks */}
            {renderedNodes.map(node => (
              <NoteBlock
                key={node.id}
                node={node}
                x={node.screenX}
                y={node.screenY}
                width={node.screenW}
                height={node.screenH}
                color={node.trackColor}
                selected={selectedNodeId === node.id}
                activeTool={activeTool}
                onSelect={handleNodeSelect}
                onDragEnd={handleNodeDragEnd}
                onDragMove={(e) => handleNodeDragMove(node.id, e)}
                onTrimLeft={(delta) => handleTrimLeft(node.id, delta)}
                onStretchRight={(delta) => handleStretchRight(node.id, delta)}
                onStretchMove={(delta) => handleStretchMove(node.id, delta)}
                onScissorClick={(pointerX) => handleScissorSplit(node.id, pointerX)}
              />
            ))}

            {/* Pitch curves per track */}
            {tracks.map((track, idx) => (
              <PitchCurve
                key={`pitch_${track.id}`}
                nodes={track.nodes}
                trackColor={track.color || getTrackColor(track.colorIndex ?? idx)}
                bpm={bpm}
                zoom={zoom}
                panX={pan.x}
                panY={pan.y}
                activeTool={activeTool}
                selectedNodeId={selectedNodeId}
                showAutomation={showPitCurve}
                renderedNodes={renderedNodes}
              />
            ))}

          </Layer>

          {/* Layer 4: Unclipped overlay — Playhead + End Marker hats sit in ruler, lines through grid */}
          <Layer>
            {/* Playhead — hat in ruler area, line through grid */}
            {playheadX >= -20 && playheadX <= gridWidth + 20 && (
              <Group
                x={PIANO_KEY_WIDTH + playheadX}
                draggable={!isPlaying}
                dragBoundFunc={(pos) => ({ x: Math.max(PIANO_KEY_WIDTH, pos.x), y: 0 })}
                onDragMove={handlePlayheadDragL4}
                onMouseEnter={(e) => { if (!isPlaying) e.target.getStage().container().style.cursor = 'ew-resize'; }}
                onMouseLeave={(e) => { e.target.getStage().container().style.cursor = ''; }}
              >
                <Rect x={-10} y={2} width={20} height={RULER_HEIGHT - 4} fill="#ffffffcc" cornerRadius={2} opacity={0.9} />
                <Text x={-5} y={Math.floor(RULER_HEIGHT / 2) - 5} text="▶" fill="#000" fontSize={10} fontStyle="bold" fontFamily="Consolas, SF Mono, monospace" />
                <Line
                  points={[0, RULER_HEIGHT, 0, canvasHeight]}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  opacity={0.9}
                  shadowColor="#ffffff"
                  shadowBlur={4}
                  shadowOpacity={0.5}
                  listening={false}
                />
              </Group>
            )}

            {/* End Marker — hat in ruler area, line through grid */}
            {endMarkerX != null && endMarkerX >= -20 && endMarkerX <= gridWidth + 20 && (
              <Group
                x={PIANO_KEY_WIDTH + endMarkerX}
                draggable
                dragBoundFunc={(pos) => ({ x: Math.max(PIANO_KEY_WIDTH, pos.x), y: 0 })}
                onDragMove={handleEndMarkerDragL4}
                onMouseEnter={(e) => { e.target.getStage().container().style.cursor = 'ew-resize'; }}
                onMouseLeave={(e) => { e.target.getStage().container().style.cursor = ''; }}
              >
                <Rect x={-8} y={2} width={16} height={RULER_HEIGHT - 4} fill="#ff4757" cornerRadius={2} />
                <Text x={-6} y={Math.floor(RULER_HEIGHT / 2) - 4} text="END" fill="#fff" fontSize={8} fontStyle="bold" fontFamily="Consolas, SF Mono, monospace" />
                <Line
                  points={[0, RULER_HEIGHT, 0, canvasHeight]}
                  stroke="#ff4757"
                  strokeWidth={2}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                />
              </Group>
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
