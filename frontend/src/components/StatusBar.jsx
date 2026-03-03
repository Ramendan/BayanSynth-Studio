/**
 * BayanSynth Studio — Status Bar
 *
 * Bottom bar showing status text, node count, generation state.
 * Uses lucide-react icons. Shows selected track ID indicator.
 */

import React from 'react';
import { useAtomValue } from 'jotai';
import { Loader2, Circle } from 'lucide-react';
import {
  statusTextAtom, isGeneratingAtom, tracksAtom, bpmAtom,
  activeToolAtom, selectedTrackIdAtom,
} from '../store/atoms';

export default function StatusBar() {
  const status = useAtomValue(statusTextAtom);
  const generating = useAtomValue(isGeneratingAtom);
  const tracks = useAtomValue(tracksAtom);
  const bpm = useAtomValue(bpmAtom);
  const tool = useAtomValue(activeToolAtom);
  const selectedTrackId = useAtomValue(selectedTrackIdAtom);

  const nodeCount = tracks.reduce((sum, t) => sum + t.nodes.length, 0);

  const toolHint = tool === 'pencil'
    ? 'Click on the grid to create a note'
    : tool === 'scissor'
    ? 'Click on a note to split it'
    : 'Click to select, drag to move';

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  const trackLabel = selectedTrack ? selectedTrack.name : '—';

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span>{status}</span>
        <span style={{ color: '#4a4a58', marginLeft: 8 }}>{toolHint}</span>
      </div>
      <div className="statusbar-right">
        <span>{tool.toUpperCase()}</span>
        <span>{bpm} BPM</span>
        <span>{nodeCount} node{nodeCount !== 1 ? 's' : ''}</span>
        <span>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
        <span style={{ color: 'var(--cyan)' }}>{trackLabel}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {generating
            ? <><Loader2 size={12} strokeWidth={2} className="spin-icon" /> Generating...</>
            : <><Circle size={8} strokeWidth={0} fill="var(--success)" /> Ready</>
          }
        </span>
      </div>
    </div>
  );
}
