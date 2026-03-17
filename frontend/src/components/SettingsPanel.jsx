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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { X, RefreshCw, Play, Square } from 'lucide-react';
import {
  settingsOpenAtom,
  settingsAtom,
  updateSettingsAtom,
  projectNameAtom,
  voicesAtom,
  statusTextAtom,
} from '../store/atoms';
import { listVoices, getVoicePreviewUrl } from '../api';
import { useI18n } from '../utils/useI18n';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
];

const THEMES = [
  { code: 'dark',  label: 'Dark Neon (default)' },
  { code: 'light', label: 'Light' },
];

const FONT_SIZE_PRESETS = [
  { value: 12, label: 'Small', labelAr: 'صغير' },
  { value: 14, label: 'Medium (default)', labelAr: 'متوسط (افتراضي)' },
  { value: 17, label: 'Large', labelAr: 'كبير' },
];

const QUALITY_LEVELS = [
  {
    code: 'low',
    label: 'Low latency',
    labelAr: 'زمن استجابة منخفض',
    hint: 'Fastest audio response during playback. Best for short, interactive sessions.',
    hintAr: 'أسرع استجابة صوتية أثناء التشغيل. مناسب للجلسات القصيرة والتفاعلية.',
  },
  {
    code: 'balanced',
    label: 'Balanced (default)',
    labelAr: 'متوازن (افتراضي)',
    hint: 'Good trade-off between responsiveness and stability. Recommended for most users.',
    hintAr: 'توازن جيد بين سرعة الاستجابة والاستقرار. موصى به لمعظم المستخدمين.',
  },
  {
    code: 'high',
    label: 'High stability',
    labelAr: 'استقرار عالٍ',
    hint: 'Smoothest playback for long timelines. May add a small delay before audio starts.',
    hintAr: 'تشغيل أكثر سلاسة للمشاريع الطويلة. قد يضيف تأخيراً بسيطاً قبل بدء الصوت.',
  },
];

export default function SettingsPanel() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useAtom(settingsOpenAtom);
  const settings = useAtomValue(settingsAtom);
  const updateSettings = useSetAtom(updateSettingsAtom);
  const [projectName, setProjectName] = useAtom(projectNameAtom);
  const voices = useAtomValue(voicesAtom);
  const setVoices = useSetAtom(voicesAtom);
  const setStatus = useSetAtom(statusTextAtom);
  const [previewingDefaultVoice, setPreviewingDefaultVoice] = useState(false);
  const previewAudioRef = useRef(null);

  const stopDefaultPreview = useCallback((statusMessage = null) => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      previewAudioRef.current = null;
    }
    setPreviewingDefaultVoice(false);
    if (statusMessage) setStatus(statusMessage);
  }, [setStatus]);

  useEffect(() => () => stopDefaultPreview(), [stopDefaultPreview]);

  const refreshVoices = useCallback(async () => {
    try {
      const v = await listVoices(settings.customVoicesDir || null);
      setVoices(v);
      setStatus(`Loaded ${v.length} voice(s)`);
    } catch {
      setStatus('Failed to refresh voices');
    }
  }, [settings.customVoicesDir, setVoices, setStatus]);

  const previewDefaultVoice = useCallback(async () => {
    if (previewingDefaultVoice) {
      stopDefaultPreview(t('Voice preview stopped', 'تم إيقاف معاينة الصوت'));
      return;
    }
    setPreviewingDefaultVoice(true);
    setStatus(t('Previewing default voice...', 'جارٍ معاينة الصوت الافتراضي...'));
    try {
      const audio = new Audio(getVoicePreviewUrl(settings.defaultVoice || 'default.wav'));
      previewAudioRef.current = audio;
      audio.onended = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        setPreviewingDefaultVoice(false);
      };
      audio.onerror = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        setStatus(t('Voice preview failed', 'فشلت معاينة الصوت'));
        setPreviewingDefaultVoice(false);
      };
      await audio.play();
    } catch (err) {
      if (previewAudioRef.current) previewAudioRef.current = null;
      setStatus(t(`Voice preview failed: ${err.message}`, `فشلت معاينة الصوت: ${err.message}`));
      setPreviewingDefaultVoice(false);
    }
  }, [previewingDefaultVoice, setStatus, settings.defaultVoice, stopDefaultPreview, t]);

  if (!isOpen) return null;

  const currentQuality = QUALITY_LEVELS.find(q => q.code === (settings.playbackQuality || 'balanced'));

  return (
    <div className="settings-backdrop" onClick={() => setIsOpen(false)}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>

        <div className="settings-header">
          <h2>{t('Settings', 'الإعدادات')}</h2>
          <button className="help-close" onClick={() => setIsOpen(false)}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="settings-body">

          {/* ── Project ─────────────────────────────── */}
          <section className="settings-section">
            <h3>{t('Project', 'المشروع')}</h3>
            <div className="form-group">
              <label>{t('Project Name', 'اسم المشروع')}</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={t('Untitled', 'بدون عنوان')}
              />
            </div>
            <div className="form-group">
              <label>{t('Default Tempo (BPM)', 'السرعة الافتراضية (BPM)')}</label>
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
                {t('The starting tempo for every new project. You can still change it from the top bar at any time.', 'السرعة المبدئية لكل مشروع جديد. ويمكنك تغييرها لاحقاً من الشريط العلوي في أي وقت.')}
              </span>
            </div>
          </section>

          {/* ── Language ────────────────────────────── */}
          <section className="settings-section">
            <h3>{t('Language', 'اللغة')}</h3>
            <div className="form-group">
              <label>{t('Interface Language', 'لغة الواجهة')}</label>
              <select
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value })}
              >
                {LANGUAGES.map(({ code, label }) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              <span className="settings-hint">
                {t('Switch interface text between English and Arabic.', 'التبديل بين نصوص الواجهة بالإنجليزية والعربية.')}
              </span>
            </div>

          </section>

          {/* ── Appearance ─────────────────────────── */}
          <section className="settings-section">
            <h3>{t('Appearance', 'المظهر')}</h3>
            <div className="form-group">
              <label>{t('Theme', 'السمة')}</label>
              <select
                value={settings.theme}
                onChange={(e) => updateSettings({ theme: e.target.value })}
              >
                {THEMES.map(({ code, label }) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
              <div className="form-group">
                <label>{t('Font Size', 'حجم الخط')}</label>
                <select
                  value={String(settings.fontSize || 14)}
                  onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value, 10) || 14 })}
                >
                  {FONT_SIZE_PRESETS.map((preset) => (
                    <option key={`font_${preset.value}`} value={String(preset.value)}>
                      {t(preset.label, preset.labelAr)}
                    </option>
                  ))}
                </select>
                <span className="settings-hint">
                  {t('Scales the full UI for readability across the app, including timeline labels and panels.', 'يضبط مقياس الواجهة بالكامل لتحسين القراءة عبر التطبيق، بما في ذلك تسميات الخط الزمني واللوحات.')}
                </span>
              </div>
          </section>

          {/* ── Auto-Save ──────────────────────────── */}
          <section className="settings-section">
            <h3>{t('Auto-Save', 'الحفظ التلقائي')}</h3>
            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={(e) => updateSettings({ autoSave: e.target.checked })}
                />
                {t('Save project automatically', 'حفظ المشروع تلقائياً')}
              </label>
              <span className="settings-hint">
                {t('Periodically saves your project in the background so you never lose progress.', 'يحفظ مشروعك دورياً في الخلفية حتى لا تفقد تقدمك.')}
              </span>
            </div>
            {settings.autoSave && (
              <div className="form-group">
                <label>{t('Save every (minutes)', 'الحفظ كل (دقائق)')}</label>
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
            <h3>{t('Synthesis', 'التوليد')}</h3>

            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.autoTashkeel ?? true}
                  onChange={(e) => updateSettings({ autoTashkeel: e.target.checked })}
                />
                {t('Auto-diacritize Arabic text (Tashkeel)', 'تشكيل النص العربي تلقائياً')}
              </label>
              <span className="settings-hint">
                {t('When enabled, the AI automatically adds short vowel marks (harakat) to Arabic text before synthesizing speech. Disable this if you want full manual control or if your text already has diacritics.', 'عند التفعيل، يضيف الذكاء الاصطناعي علامات التشكيل تلقائياً قبل توليد الصوت. عطّل هذا الخيار إذا أردت تحكماً كاملاً أو إذا كان النص مُشكلاً بالفعل.')}
              </span>
            </div>

            <div className="form-group">
              <label>{t('Default Voice for New Tracks', 'الصوت الافتراضي للمسارات الجديدة')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={settings.defaultVoice || ''}
                  onChange={(e) => updateSettings({ defaultVoice: e.target.value })}
                >
                  <option value="">{t('(none — pick manually)', '(لا يوجد — اختر يدوياً)')}</option>
                  {voices.map((v) => {
                    const value = typeof v === 'string' ? v : v?.name;
                    if (!value) return null;
                    return <option key={value} value={value}>{value}</option>;
                  })}
                </select>
                <button
                  className="btn btn-sm"
                  onClick={previewDefaultVoice}
                  title={t('Preview selected default voice', 'معاينة الصوت الافتراضي المحدد')}
                >
                  {previewingDefaultVoice ? <Square size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />} {previewingDefaultVoice ? t('Stop', 'إيقاف') : t('Preview', 'معاينة')}
                </button>
              </div>
              <span className="settings-hint">
                {t('The voice that is pre-selected when you add a new track. You can always change it per-track. Click the refresh button in Voice Library if the list is empty.', 'الصوت المحدد مسبقاً عند إضافة مسار جديد. يمكنك تغييره لكل مسار في أي وقت. اضغط زر التحديث في مكتبة الأصوات إذا كانت القائمة فارغة.')}
              </span>
            </div>
          </section>

          {/* ── Audio Playback ──────────────────────── */}
          <section className="settings-section">
            <h3>{t('Audio Playback', 'تشغيل الصوت')}</h3>
            <div className="form-group">
              <label>{t('Playback Quality', 'جودة التشغيل')}</label>
              <select
                value={settings.playbackQuality || 'balanced'}
                onChange={(e) => updateSettings({ playbackQuality: e.target.value })}
              >
                {QUALITY_LEVELS.map(({ code, label, labelAr }) => (
                  <option key={code} value={code}>{t(label, labelAr)}</option>
                ))}
              </select>
              <span className="settings-hint">
                {t(currentQuality?.hint || '', currentQuality?.hintAr || '')}
                {' '}{t('Takes effect when the audio engine is next created (restart the app if it sounds wrong).', 'يتم تطبيقه عند إعادة إنشاء محرك الصوت (أعد تشغيل التطبيق إذا بدا الصوت غير صحيح).')}
              </span>
            </div>
          </section>

          {/* ── Editing ────────────────────────────── */}
          <section className="settings-section">
            <h3>{t('Editing', 'التحرير')}</h3>
            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.confirmDelete ?? true}
                  onChange={(e) => updateSettings({ confirmDelete: e.target.checked })}
                />
                {t('Ask before deleting a node', 'طلب التأكيد قبل حذف عقدة')}
              </label>
              <span className="settings-hint">
                {t('Shows a confirmation prompt before permanently removing a node. Turn this off if you prefer faster editing without interruptions.', 'يعرض نافذة تأكيد قبل حذف العقدة نهائياً. عطّل هذا الخيار إذا كنت تفضّل تحريراً أسرع بدون مقاطعات.')}
              </span>
            </div>
          </section>

          {/* ── Export ─────────────────────────────── */}
          <section className="settings-section">
            <h3>{t('Export', 'التصدير')}</h3>
            <div className="form-group">
              <label>{t('Default Export Filename Prefix', 'بادئة اسم ملف التصدير الافتراضية')}</label>
              <input
                type="text"
                value={settings.exportPath || ''}
                onChange={(e) => updateSettings({ exportPath: e.target.value })}
                placeholder={t('e.g. my_project  (leave blank for auto timestamp)', 'مثال: my_project  (اتركه فارغاً لاستخدام الوقت تلقائياً)')}
              />
              <span className="settings-hint">
                {t('The filename used when exporting your timeline as a WAV file. Leave blank to use an automatic date-and-time name.', 'اسم الملف المستخدم عند تصدير المخطط الزمني كملف WAV. اتركه فارغاً لاستخدام اسم تلقائي بالتاريخ والوقت.')}
              </span>
            </div>
          </section>

          {/* ── Voice Library ──────────────────────── */}
          <section className="settings-section">
            <h3>{t('Voice Library', 'مكتبة الأصوات')}</h3>
            <div className="form-group">
              <label>{t('Custom Voices Folder', 'مجلد الأصوات المخصص')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={settings.customVoicesDir || ''}
                  onChange={(e) => updateSettings({ customVoicesDir: e.target.value })}
                  placeholder={t('e.g. C:\\MyVoices  or  /home/user/voices', 'مثال: C:\\MyVoices  أو  /home/user/voices')}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-icon"
                  onClick={refreshVoices}
                  title={t('Refresh voice list', 'تحديث قائمة الأصوات')}
                  style={{ padding: '4px 8px' }}
                >
                  <RefreshCw size={14} strokeWidth={1.5} />
                </button>
              </div>
              <span className="settings-hint">
                {t('Optional path to a folder containing your own voice reference files (.wav, .mp3, .flac). These appear alongside the built-in voices. Click refresh after changing the path.', 'مسار اختياري لمجلد يحتوي على ملفاتك الصوتية المرجعية (.wav و .mp3 و .flac). ستظهر بجانب الأصوات المدمجة. اضغط تحديث بعد تغيير المسار.')}
              </span>
            </div>
          </section>

          {/* ── About ──────────────────────────────── */}
          <section className="settings-section" style={{ borderBottom: 'none', marginBottom: 0 }}>
            <h3>{t('About', 'حول')}</h3>
            <p className="settings-about">
              <strong>BayanSynth Studio</strong> v1.0<br />
              {t('Arabic TTS Timeline Editor powered by CosyVoice3', 'محرر مخطط زمني لتحويل النص العربي إلى كلام مدعوم بـ CosyVoice3')}<br />
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
