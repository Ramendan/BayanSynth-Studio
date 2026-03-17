/**
 * BayanSynth Studio — Top Bar
 *
 * Application title, project actions (Save/Load), global settings
 * (BPM, snap division, auto-tashkeel), Import Audio, End Marker, Help.
 * All icons from lucide-react.
 */

import React, { useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  FolderOpen, Save, Plus, Wand2, Download,
  FileAudio, HelpCircle, FlagTriangleRight, Settings, Mic,
} from 'lucide-react';
import {
  bpmAtom, snapDivisionAtom, autoTashkeelAtom, isGeneratingAtom,
  addTrackAtom, helpOpenAtom, endNodeTimeAtom, statusTextAtom,
  settingsOpenAtom, projectNameAtom, unsavedChangesAtom,
} from '../store/atoms';
import { voiceCloneOpenAtom } from './VoiceClonePanel';
import { saveProjectAtom, openProjectAtom } from '../store/project';
import { SNAP_DIVISIONS } from '../utils/constants';
import { useI18n } from '../utils/useI18n';

const ICO = { size: 14, strokeWidth: 1.5 };

export default function TopBar({ onSynthesizeAll, onExport, onImportAudio }) {
  const { t } = useI18n();
  const [bpm, setBpm] = useAtom(bpmAtom);
  const [snap, setSnap] = useAtom(snapDivisionAtom);
  const [autoTashkeel, setAutoTashkeel] = useAtom(autoTashkeelAtom);
  const [generating] = useAtom(isGeneratingAtom);
  const [endNodeTime, setEndNodeTime] = useAtom(endNodeTimeAtom);
  const addTrack = useSetAtom(addTrackAtom);
  const saveProject = useSetAtom(saveProjectAtom);
  const openProject = useSetAtom(openProjectAtom);
  const setHelpOpen = useSetAtom(helpOpenAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setVoiceCloneOpen = useSetAtom(voiceCloneOpenAtom);
  const projectName = useAtomValue(projectNameAtom);
  const unsaved = useAtomValue(unsavedChangesAtom);
  const setStatus = useSetAtom(statusTextAtom);

  const fileInputRef = useRef(null);

  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (onImportAudio) onImportAudio(file);
    e.target.value = '';
  };

  const toggleEndMarker = () => {
    if (endNodeTime != null) {
      setEndNodeTime(null);
      setStatus(t('End marker removed', 'تمت إزالة علامة النهاية'));
    } else {
      setEndNodeTime(10);
      setStatus(t('End marker set at 10s — drag on ruler to adjust', 'تم ضبط علامة النهاية عند 10 ثوانٍ — اسحبها من المسطرة للتعديل'));
    }
  };

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <h1>BayanSynth Studio</h1>
        <span className="project-name">{projectName}{unsaved ? ' •' : ''}</span>
      </div>

      <div className="topbar-controls">
        {/* BPM */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
          {t('BPM', 'السرعة')}
          <input
            className="bpm-input"
            type="number"
            min={40}
            max={300}
            value={bpm}
            onChange={(e) => setBpm(Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))}
          />
        </label>

        {/* Snap Division */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
          {t('Snap', 'الالتقاط')}
          <select
            className="snap-select"
            value={snap}
            onChange={(e) => setSnap(e.target.value)}
          >
            {Object.keys(SNAP_DIVISIONS).map(key => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </label>

        {/* Auto-Tashkeel Toggle */}
        <label className="toggle">
          <input
            type="checkbox"
            checked={autoTashkeel}
            onChange={(e) => setAutoTashkeel(e.target.checked)}
          />
          {t('Auto-Tashkeel', 'التشكيل التلقائي')}
        </label>
      </div>

      <div className="topbar-actions">
        {/* Project Save/Load */}
        <button className="btn btn-sm" onClick={openProject} title={t('Open Project (Ctrl+O)', 'فتح المشروع (Ctrl+O)')}>
          <FolderOpen {...ICO} /> {t('Open', 'فتح')}
        </button>
        <button className="btn btn-sm" onClick={saveProject} title={t('Save Project (Ctrl+S)', 'حفظ المشروع (Ctrl+S)')}>
          <Save {...ICO} /> {t('Save', 'حفظ')}
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        {/* Track & Synthesis */}
        <button className="btn btn-sm" onClick={() => addTrack()}>
          <Plus {...ICO} /> {t('Track', 'مسار')}
        </button>

        {/* Import Audio */}
        <button className="btn btn-sm" onClick={handleImportClick} title={t('Import audio file', 'استيراد ملف صوتي')}>
          <FileAudio {...ICO} /> {t('Import', 'استيراد')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={handleImportFile}
        />

        {/* Voice Cloning */}
        <button className="btn btn-sm" onClick={() => setVoiceCloneOpen(true)} title={t('Voice Cloning', 'استنساخ الصوت')}>
          <Mic {...ICO} /> {t('Clone Voice', 'استنساخ صوت')}
        </button>

        {/* End Marker toggle */}
        <button
          className={`btn btn-sm ${endNodeTime != null ? 'btn-active-toggle' : ''}`}
          onClick={toggleEndMarker}
          title={t('Toggle end marker', 'تفعيل/تعطيل علامة النهاية')}
        >
          <FlagTriangleRight {...ICO} /> {t('End', 'نهاية')}
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <button
          className="btn btn-sm"
          onClick={onSynthesizeAll}
          disabled={generating}
        >
          <Wand2 {...ICO} /> {t('Generate All', 'توليد الكل')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={onExport}
          disabled={generating}
        >
          <Download {...ICO} /> {t('Export WAV', 'تصدير WAV')}
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        {/* Help */}
        <button className="btn btn-sm" onClick={() => setHelpOpen(true)} title={t('Keyboard shortcuts & help (?)', 'اختصارات لوحة المفاتيح والمساعدة (?)')}>
          <HelpCircle {...ICO} />
        </button>

        {/* Settings (Item 23) */}
        <button className="btn btn-sm" onClick={() => setSettingsOpen(true)} title={t('Settings', 'الإعدادات')}>
          <Settings {...ICO} />
        </button>
      </div>
    </div>
  );
}
