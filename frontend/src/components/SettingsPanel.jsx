/**
 * BayanSynth Studio — Settings Panel (Modal)
 *
 * All global application preferences, each with a human-readable explanation:
 *  - Language / theme
 *  - Auto-save
 *  - Playback quality (replaces technical "buffer size")
 *  - Auto-tashkeel default
 *  - Default voice for new tracks
 *  - Default BPM for new projects
 *  - Confirm before deleting nodes
 *  - Export filename prefix
 *  - Custom voices folder
 *
 * Controlled by settingsOpenAtom. Persists to localStorage via updateSettingsAtom.
 */

import React, { useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { X, RefreshCw } from 'lucide-react';
import {
  settingsOpenAtom,
  settingsAtom,
  updateSettingsAtom,
  projectNameAtom,
  voicesAtom,
  statusTextAtom,
} from '../store/atoms';
import { listVoices } from '../api';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
];

const THEMES = [
  { code: 'dark',  label: 'Dark Neon (default)' },
  { code: 'light', label: 'Light' },
];

const QUALITY_LEVELS = [
  {
    code: 'low',
    label: 'Low latency',
    hint: 'Fastest audio response during playback. Best for short, interactive sessions.',
  },
  {
    code: 'balanced',
    label: 'Balanced (default)',
    hint: 'Good trade-off between responsiveness and stability. Recommended for most users.',
  },
  {
    code: 'high',
    label: 'High stability',
    hint: 'Smoothest playback for long timelines. May add a small delay before audio starts.',
  },
];

export default function SettingsPanel() {
  const [isOpen, setIsOpen] = useAtom(settingsOpenAtom);
  const settings = useAtomValue(settingsAtom);
  const updateSettings = useSetAtom(updateSettingsAtom);
  const [projectName, setProjectName] = useAtom(projectNameAtom);
  const voices = useAtomValue(voicesAtom);
  const setVoices = useSetAtom(voicesAtom);
  const setStatus = useSetAtom(statusTextAtom);

  const refreshVoices = useCallback(async () => {
    try {
      const v = await listVoices(settings.customVoicesDir || null);
      setVoices(v);
      setStatus(`Loaded ${v.length} voice(s)`);
    } catch {
      setStatus('Failed to refresh voices');
    }
  }, [settings.customVoicesDir, setVoices, setStatus]);

  if (!isOpen) return null;

  const currentQuality = QUALITY_LEVELS.find(q => q.code === (settings.playbackQuality || 'balanced'));

  return (
    <div className="settings-backdrop" onClick={() => setIsOpen(false)}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>

        <div className="settings-header">
          <h2>Settings</h2>
          <button className="help-close" onClick={() => setIsOpen(false)}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="settings-body">

          {/* ── Project ─────────────────────────────── */}
          <section className="settings-section">
            <h3>Project</h3>
            <div className="form-group">
              <label>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Untitled"
              />
            </div>
            <div className="form-group">
              <label>Default Tempo (BPM)</label>
              <input
                type="number"
                min={20}
                max={300}
                value={settings.defaultBpm || 120}
                onChange={(e) => updateSettings({
                  defaultBpm: Math.max(20, Math.min(300, parseInt(e.target.value) || 120)),
                })}
              />
              <span className="settings-hint">
                The starting tempo for every new project. You can still change it from the top bar at any time.
              </span>
            </div>
          </section>

          {/* ── Language ────────────────────────────── */}
          <section className="settings-section">
            <h3>Language</h3>
            <div className="form-group">
              <label>Interface Language</label>
              <select
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value })}
              >
                {LANGUAGES.map(({ code, label }) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              <span className="settings-hint">
                Switching to العربية enables right-to-left layout. Full Arabic translation coming soon.
              </span>
            </div>
          </section>

          {/* ── Appearance ─────────────────────────── */}
          <section className="settings-section">
            <h3>Appearance</h3>
            <div className="form-group">
              <label>Theme</label>
              <select
                value={settings.theme}
                onChange={(e) => updateSettings({ theme: e.target.value })}
              >
                {THEMES.map(({ code, label }) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
          </section>

          {/* ── Auto-Save ──────────────────────────── */}
          <section className="settings-section">
            <h3>Auto-Save</h3>
            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={(e) => updateSettings({ autoSave: e.target.checked })}
                />
                Save project automatically
              </label>
              <span className="settings-hint">
                Periodically saves your project in the background so you never lose progress.
              </span>
            </div>
            {settings.autoSave && (
              <div className="form-group">
                <label>Save every (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.autoSaveInterval}
                  onChange={(e) => updateSettings({
                    autoSaveInterval: Math.max(1, Math.min(60, parseInt(e.target.value) || 5)),
                  })}
                />
              </div>
            )}
          </section>

          {/* ── Synthesis ──────────────────────────── */}
          <section className="settings-section">
            <h3>Synthesis</h3>

            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.autoTashkeel ?? true}
                  onChange={(e) => updateSettings({ autoTashkeel: e.target.checked })}
                />
                Auto-diacritize Arabic text (Tashkeel)
              </label>
              <span className="settings-hint">
                When enabled, the AI automatically adds short vowel marks (harakat) to Arabic text before
                synthesizing speech. Disable this if you want full manual control or if your text already
                has diacritics.
              </span>
            </div>

            <div className="form-group">
              <label>Default Voice for New Tracks</label>
              <select
                value={settings.defaultVoice || ''}
                onChange={(e) => updateSettings({ defaultVoice: e.target.value })}
              >
                <option value="">(none — pick manually)</option>
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              <span className="settings-hint">
                The voice that is pre-selected when you add a new track. You can always change it per-track.
                Click the refresh button in Voice Library if the list is empty.
              </span>
            </div>
          </section>

          {/* ── Audio Playback ──────────────────────── */}
          <section className="settings-section">
            <h3>Audio Playback</h3>
            <div className="form-group">
              <label>Playback Quality</label>
              <select
                value={settings.playbackQuality || 'balanced'}
                onChange={(e) => updateSettings({ playbackQuality: e.target.value })}
              >
                {QUALITY_LEVELS.map(({ code, label }) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              <span className="settings-hint">
                {currentQuality?.hint}
                {' '}Takes effect when the audio engine is next created (restart the app if it sounds wrong).
              </span>
            </div>
          </section>

          {/* ── Editing ────────────────────────────── */}
          <section className="settings-section">
            <h3>Editing</h3>
            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.confirmDelete ?? true}
                  onChange={(e) => updateSettings({ confirmDelete: e.target.checked })}
                />
                Ask before deleting a node
              </label>
              <span className="settings-hint">
                Shows a confirmation prompt before permanently removing a node.
                Turn this off if you prefer faster editing without interruptions.
              </span>
            </div>
          </section>

          {/* ── Export ─────────────────────────────── */}
          <section className="settings-section">
            <h3>Export</h3>
            <div className="form-group">
              <label>Default Export Filename Prefix</label>
              <input
                type="text"
                value={settings.exportPath || ''}
                onChange={(e) => updateSettings({ exportPath: e.target.value })}
                placeholder="e.g. my_project  (leave blank for auto timestamp)"
              />
              <span className="settings-hint">
                The filename used when exporting your timeline as a WAV file.
                Leave blank to use an automatic date-and-time name.
              </span>
            </div>
          </section>

          {/* ── Voice Library ──────────────────────── */}
          <section className="settings-section">
            <h3>Voice Library</h3>
            <div className="form-group">
              <label>Custom Voices Folder</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={settings.customVoicesDir || ''}
                  onChange={(e) => updateSettings({ customVoicesDir: e.target.value })}
                  placeholder="e.g. C:\MyVoices  or  /home/user/voices"
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-icon"
                  onClick={refreshVoices}
                  title="Refresh voice list"
                  style={{ padding: '4px 8px' }}
                >
                  <RefreshCw size={14} strokeWidth={1.5} />
                </button>
              </div>
              <span className="settings-hint">
                Optional path to a folder containing your own voice reference files (.wav, .mp3, .flac).
                These appear alongside the built-in voices. Click refresh after changing the path.
              </span>
            </div>
          </section>

          {/* ── About ──────────────────────────────── */}
          <section className="settings-section" style={{ borderBottom: 'none', marginBottom: 0 }}>
            <h3>About</h3>
            <p className="settings-about">
              <strong>BayanSynth Studio</strong> v1.0<br />
              Arabic TTS Timeline Editor powered by CosyVoice3<br />
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                © 2026 BayanSynth Project — Apache 2.0 License
              </span>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
