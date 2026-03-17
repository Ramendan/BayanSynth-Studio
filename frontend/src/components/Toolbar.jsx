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
  Undo2, Redo2, Copy,
  Play, Pause, Square, Repeat,
} from 'lucide-react';
import {
  activeToolAtom, isPlayingAtom, playheadAtom, tracksAtom,
  isLoopingAtom, endNodeTimeAtom,
  selectedNodeIdAtom, duplicateSelectedAtom,
} from '../store/atoms';
import { undoAtom, redoAtom, canUndoAtom, canRedoAtom } from '../store/history';
import { pushHistoryAtom } from '../store/history';
import { getTransport } from '../audio/TransportController';
import { TOOLS } from '../utils/constants';
import { useI18n } from '../utils/useI18n';

const ICO = { size: 16, strokeWidth: 1.5 };

export default function Toolbar() {
  const { t } = useI18n();
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
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const duplicateSelected = useSetAtom(duplicateSelectedAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);

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
          title={t('Arrow Tool (V) — Select & Move', 'أداة السهم (V) — تحديد وتحريك')}
        >
          <MousePointer2 {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.PENCIL ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.PENCIL)}
          title={t('Pencil Tool (B) — Draw Notes', 'أداة القلم (B) — رسم النغمات')}
        >
          <Pencil {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.SCISSOR ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.SCISSOR)}
          title={t('Scissor Tool (C) — Split Nodes', 'أداة المقص (C) — تقسيم العقد')}
        >
          <Scissors {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.DELETE ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.DELETE)}
          title={t('Delete Tool (D) — Remove Nodes', 'أداة الحذف (D) — إزالة العقد')}
        >
          <Trash2 {...ICO} />
        </button>
        <button
          className={`tool-btn ${activeTool === TOOLS.PAN ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.PAN)}
          title={t('Pan Tool (H) — Drag Canvas', 'أداة التحريك (H) — سحب اللوحة')}
        >
          <Hand {...ICO} />
        </button>
      </div>

      {/* Undo / Redo / Duplicate */}
      <div className="toolbar-group">
        <button
          className="tool-btn"
          onClick={() => undo()}
          disabled={!canUndo}
          title={t('Undo (Ctrl+Z)', 'تراجع (Ctrl+Z)')}
        >
          <Undo2 {...ICO} />
        </button>
        <button
          className="tool-btn"
          onClick={() => redo()}
          disabled={!canRedo}
          title={t('Redo (Ctrl+Y)', 'إعادة (Ctrl+Y)')}
        >
          <Redo2 {...ICO} />
        </button>
        <button
          className="tool-btn"
          onClick={() => { pushHistory(); duplicateSelected(); }}
          disabled={!selectedNodeId}
          title={t('Duplicate Selected Node (Ctrl+D)', 'نسخ العقدة المحددة (Ctrl+D)')}
        >
          <Copy {...ICO} />
        </button>
      </div>

      {/* Transport Controls */}
      <div className="toolbar-group transport-bar">
        <button
          className={`transport-btn ${isPlaying ? 'playing' : ''}`}
          onClick={handlePlayPause}
          title={t('Play / Pause (Space)', 'تشغيل / إيقاف (Space)')}
        >
          {isPlaying ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
        <button
          className="transport-btn"
          onClick={handleStop}
          title={t('Stop', 'إيقاف')}
        >
          <Square size={12} strokeWidth={2} />
        </button>
        <button
          className={`transport-btn ${isLooping ? 'playing' : ''}`}
          onClick={() => setIsLooping(!isLooping)}
          title={t('Toggle Loop', 'تفعيل/تعطيل التكرار')}
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
