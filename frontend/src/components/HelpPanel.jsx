/**
 * BayanSynth Studio — Help Panel (Modal Overlay)
 *
 * Shows keyboard shortcuts and quick-start guide.
 * Controlled by helpOpenAtom.
 */

import React from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { helpOpenAtom } from '../store/atoms';
import { useI18n } from '../utils/useI18n';

const SHORTCUTS = [
  { keys: 'Space', action: 'Play / Pause' },
  { keys: 'V', action: 'Arrow Tool (select & move)' },
  { keys: 'B', action: 'Pencil Tool (draw notes)' },
  { keys: 'C', action: 'Scissor Tool (split notes)' },
  { keys: 'D', action: 'Delete Tool (click to remove notes)' },
  { keys: 'H', action: 'Pan Tool (drag canvas)' },
  { keys: 'Ctrl+Z', action: 'Undo' },
  { keys: 'Ctrl+Y', action: 'Redo' },
  { keys: 'Ctrl+S', action: 'Save project' },
  { keys: 'Ctrl+O', action: 'Open project' },
  { keys: 'Ctrl+D', action: 'Duplicate selected node(s)' },
  { keys: 'Delete', action: 'Remove selected node' },
  { keys: 'Ctrl+Wheel', action: 'Zoom in/out' },
  { keys: 'Shift+Wheel', action: 'Horizontal scroll' },
  { keys: 'Wheel', action: 'Vertical scroll' },
  { keys: '?', action: 'Toggle this help panel' },
];

export default function HelpPanel() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useAtom(helpOpenAtom);

  if (!isOpen) return null;

  return (
    <div className="help-backdrop" onClick={() => setIsOpen(false)}>
      <div className="help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2>BayanSynth Studio — Quick Reference</h2>
          <button className="help-close" onClick={() => setIsOpen(false)}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="help-body">
          <section>
            <h3>{t('Keyboard Shortcuts', 'اختصارات لوحة المفاتيح')}</h3>
            <table className="help-shortcuts">
              <tbody>
                {SHORTCUTS.map(({ keys, action }) => (
                  <tr key={keys}>
                    <td>
                      {keys.split('+').map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && ' + '}
                          <kbd>{k}</kbd>
                        </React.Fragment>
                      ))}
                    </td>
                    <td>{
                      action === 'Play / Pause' ? t(action, 'تشغيل / إيقاف') :
                      action === 'Arrow Tool (select & move)' ? t(action, 'أداة السهم (تحديد وتحريك)') :
                      action === 'Pencil Tool (draw notes)' ? t(action, 'أداة القلم (رسم النغمات)') :
                      action === 'Scissor Tool (split notes)' ? t(action, 'أداة المقص (تقسيم النغمات)') :
                      action === 'Delete Tool (click to remove notes)' ? t(action, 'أداة الحذف (انقر للإزالة)') :
                      action === 'Pan Tool (drag canvas)' ? t(action, 'أداة التحريك (سحب اللوحة)') :
                      action === 'Undo' ? t(action, 'تراجع') :
                      action === 'Redo' ? t(action, 'إعادة') :
                      action === 'Save project' ? t(action, 'حفظ المشروع') :
                      action === 'Open project' ? t(action, 'فتح المشروع') :
                      action === 'Duplicate selected node(s)' ? t(action, 'نسخ العقد المحددة') :
                      action === 'Remove selected node' ? t(action, 'إزالة العقدة المحددة') :
                      action === 'Zoom in/out' ? t(action, 'تكبير/تصغير') :
                      action === 'Horizontal scroll' ? t(action, 'تمرير أفقي') :
                      action === 'Vertical scroll' ? t(action, 'تمرير عمودي') :
                      action === 'Toggle this help panel' ? t(action, 'إظهار/إخفاء لوحة المساعدة') :
                      action
                    }</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3>{t('Workflow', 'سير العمل')}</h3>
            <ol className="help-steps">
              <li>Select a <strong>track</strong> in the left panel by clicking its header.</li>
              <li>Switch to <strong>Pencil Tool (B)</strong> and click on the grid to add a note.</li>
              <li>Edit the Arabic text, voice, speed, and <strong>instruct prompt</strong> in the <strong>Properties Panel</strong> (right).</li>
              <li>Click <strong>Generate</strong> on a single node or <strong>Generate All</strong> in the top bar to synthesize via CosyVoice3.</li>
              <li>Adjust pitch, volume, pan, and <strong>engine speed</strong> in the <strong>Audio Engine</strong> group — these are real-time and don't require re-generation.</li>
              <li>Use the <strong>Dynamics / Pitch / Vibrato</strong> lanes at the bottom for automation drawing.</li>
              <li>Drag the <strong>playhead</strong> or <strong>end marker</strong> directly on the ruler to set playback range.</li>
              <li>Click <strong>Export WAV</strong> to render the final mix.</li>
            </ol>
          </section>

          <section>
            <h3>{t('Tips', 'نصائح')}</h3>
            <ul className="help-tips">
              <li>Right-click a note to see the context menu (duplicate, delete, move to track).</li>
              <li>Drag the right edge of a note to stretch it — this adjusts engine speed for time-stretch.</li>
              <li>Use the <strong>Delete Tool (D)</strong> and click notes to remove them quickly.</li>
              <li>Use the <strong>Pan Tool (H)</strong> to drag the canvas viewport.</li>
              <li>Click the time ruler to seek the playhead.</li>
              <li>Use <strong>Revert</strong> buttons (⟲) in Properties Panel to reset generation or engine params to defaults.</li>
              <li>Import external audio files with the Import button — they bypass TTS generation.</li>
              <li>Open <strong>Settings</strong> (gear icon) to configure audio buffer size, auto-save, and project name.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
