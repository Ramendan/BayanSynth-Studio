/**
 * BayanSynth Studio — Toolbar
 *
 * Tool selection (Arrow / Pencil / Scissor) + undo/redo + transport controls.
 * All emoji icons replaced with lucide-react SVG icons.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  MousePointer2, Pencil, Scissors, Trash2, Hand,
  Undo2, Redo2,
  Play, Pause, Square, Repeat,
} from 'lucide-react';
import {
  activeToolAtom, isPlayingAtom, playheadAtom, tracksAtom,
  isLoopingAtom, endNodeTimeAtom,
} from '../store/atoms';
import { undoAtom, redoAtom, canUndoAtom, canRedoAtom } from '../store/history';
import { getTransport } from '../audio/TransportController';
import { TOOLS } from '../utils/constants';

const ICO = { size: 16, strokeWidth: 1.5 };

export default function Toolbar() {
  const [activeTool, setActiveTool] = useAtom(activeToolAtom);
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom);
  const [playhead, setPlayhead] = useAtom(playheadAtom);
  const [isLooping, setIsLooping] = useAtom(isLoopingAtom);
  const tracks = useAtomValue(tracksAtom);
  const endNodeTime = useAtomValue(endNodeTimeAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const endTimeRef = useRef(endNodeTime);
  endTimeRef.current = endNodeTime;

  // Wire transport playhead updates to Jotai atom
  useEffect(() => {
    const transport = getTransport();
    transport.onPlayheadUpdate((pos) => setPlayhead(pos));
    transport.onPlaybackEnd(() => setIsPlaying(false));
  }, [setPlayhead, setIsPlaying]);

  const handlePlayPause = useCallback(async () => {
    const transport = getTransport();
    if (isPlaying) {
      transport.pause();
      setIsPlaying(false);
    } else {
      await transport.play(tracksRef.current, playhead, {
        loop: isLooping,
        endTime: endTimeRef.current ?? undefined,
      });
      setIsPlaying(true);
    }
  }, [isPlaying, playhead, isLooping, setIsPlaying]);

  const handleStop = useCallback(() => {
    const transport = getTransport();
    transport.stop();
    setIsPlaying(false);
    setPlayhead(0);
  }, [setIsPlaying, setPlayhead]);

  // Format time as mm:ss.ms
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  };

  return (
    <div className="toolbar">
      {/* Tool Selection */}
      <div className="toolbar-group">
        <button
          className={`tool-btn ${activeTool === TOOLS.ARROW ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.ARROW)}
          title="Arrow Tool (V) — Select & Move"
        >
          <MousePointer2 {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.PENCIL ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.PENCIL)}
          title="Pencil Tool (B) — Draw Notes"
        >
          <Pencil {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.SCISSOR ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.SCISSOR)}
          title="Scissor Tool (C) — Split Nodes"
        >
          <Scissors {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.DELETE ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.DELETE)}
          title="Delete Tool (D) — Remove Nodes"
        >
          <Trash2 {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.PAN ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.PAN)}
          title="Pan Tool (H) — Drag Canvas"
        >
          <Hand {...ICO} />
        </button>
      </div>

      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button
          className="tool-btn"
          onClick={() => undo()}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 {...ICO} />
        </button>
        <button
          className="tool-btn"
          onClick={() => redo()}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 {...ICO} />
        </button>
      </div>

      {/* Transport Controls */}
      <div className="toolbar-group transport-bar">
        <button
          className={`transport-btn ${isPlaying ? 'playing' : ''}`}
          onClick={handlePlayPause}
          title="Play / Pause (Space)"
        >
          {isPlaying ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
        <button
          className="transport-btn"
          onClick={handleStop}
          title="Stop"
        >
          <Square size={12} strokeWidth={2} />
        </button>
        <button
          className={`transport-btn ${isLooping ? 'playing' : ''}`}
          onClick={() => setIsLooping(!isLooping)}
          title="Toggle Loop"
        >
          <Repeat size={14} strokeWidth={1.5} />
        </button>

        <span className="transport-time">
          {formatTime(playhead)}
        </span>
      </div>
    </div>
  );
}
