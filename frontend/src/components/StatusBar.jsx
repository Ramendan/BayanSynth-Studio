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
import { useI18n } from '../utils/useI18n';

export default function StatusBar() {
  const { t, number, plural } = useI18n();
  const status = useAtomValue(statusTextAtom);
  const generating = useAtomValue(isGeneratingAtom);
  const tracks = useAtomValue(tracksAtom);
  const bpm = useAtomValue(bpmAtom);
  const tool = useAtomValue(activeToolAtom);
  const selectedTrackId = useAtomValue(selectedTrackIdAtom);

  const nodeCount = tracks.reduce((sum, t) => sum + t.nodes.length, 0);

  const toolHint = tool === 'pencil'
    ? t('Click on the grid to create a note', 'انقر على الشبكة لإنشاء نغمة')
    : tool === 'scissor'
    ? t('Click on a note to split it', 'انقر على نغمة لتقسيمها')
    : t('Click to select, drag to move', 'انقر للتحديد واسحب للتحريك');

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  const trackLabel = selectedTrack ? selectedTrack.name : t('—', '—');

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span>{status}</span>
        <span style={{ color: '#4a4a58', marginLeft: 8 }}>{toolHint}</span>
      </div>
      <div className="statusbar-right">
        <span>{tool.toUpperCase()}</span>
        <span>{number(bpm)} {t('BPM', 'ن/د')}</span>
        <span>{plural(nodeCount, 'node', 'nodes', 'عقدة')}</span>
        <span>{plural(tracks.length, 'track', 'tracks', 'مسار')}</span>
        <span style={{ color: 'var(--cyan)' }}>{trackLabel}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {generating
            ? <><Loader2 size={12} strokeWidth={2} className="spin-icon" /> {t('Generating...', 'جارٍ التوليد...')}</>
            : <><Circle size={8} strokeWidth={0} fill="var(--success)" /> {t('Ready', 'جاهز')}</>
          }
        </span>
      </div>
    </div>
  );
}
