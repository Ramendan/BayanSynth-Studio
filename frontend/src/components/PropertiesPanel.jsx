/**
 * BayanSynth Studio — Properties Panel (Right Sidebar)
 *
 * Two-group layout matching Vocaloid / Synth-V style:
 *  Group 1 — Generation Properties (amber outline)
 *    Text, Voice, Seed, Speed → changes that require re-synthesis
 *    Shows amber "re-generate needed" badge if generationHash differs
 *
 *  Group 2 — Audio Engine Properties (cyan outline)
 *    Pitch Shift, Volume, Pan, Fade, Duration → real-time, no re-gen
 *
 * Lucide-react icons throughout.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Dice5, Play, Square, Mic, Upload, AlertTriangle, Trash2, Copy,
  RotateCcw, Zap,
} from 'lucide-react';
import {
  tracksAtom,
  selectedNodeIdAtom,
  selectedNodeAtom,
  voicesAtom,
  updateNodeAtom,
  removeNodeAtom,
  duplicateSelectedAtom,
  statusTextAtom,
  autoTashkeelAtom,
  computeGenerationHash,
  NODE_GEN_DEFAULTS,
  NODE_ENGINE_DEFAULTS,
} from '../store/atoms';
import { pushHistoryAtom } from '../store/history';
import { arabicToPhonemes, hasDiacritics } from '../utils/phonemeMap';
import { midiToNoteName, NOTE_RANGE } from '../utils/constants';
import { getTrackColor } from '../utils/colorPalette';
import { diacritize, uploadVoice, listVoices, synthesize as synthesizeApi, audition as auditionApi, getVoicePreviewUrl } from '../api';
import { getEngine } from '../audio/AudioEngine';
import { blobToWavFile } from '../utils/audioWav';
import { useI18n } from '../utils/useI18n';

const MAX_RECORDING_DURATION = 30;

export default function PropertiesPanel() {
  const { t } = useI18n();
  const tracks = useAtomValue(tracksAtom);
  const selectedNode = useAtomValue(selectedNodeAtom);
  const voices = useAtomValue(voicesAtom);
  const setVoices = useSetAtom(voicesAtom);
  const autoTashkeel = useAtomValue(autoTashkeelAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const removeNode = useSetAtom(removeNodeAtom);
  const duplicateSelected = useSetAtom(duplicateSelectedAtom);
  const setStatus = useSetAtom(statusTextAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [auditioning, setAuditioning] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [previewingNode, setPreviewingNode] = useState(false);
  const [previewingPendingRecording, setPreviewingPendingRecording] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pendingRecordingBlob, setPendingRecordingBlob] = useState(null);
  const [pendingRecordingUrl, setPendingRecordingUrl] = useState(null);
  const [recordingName, setRecordingName] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const previewAudioRef = useRef(null);
  const previewAudioKeyRef = useRef(null);
  const nodePreviewIdRef = useRef(null);

  const stopManagedPreview = useCallback(() => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      if (audio.__revokeUrl) {
        URL.revokeObjectURL(audio.__revokeUrl);
      }
      previewAudioRef.current = null;
    }
    previewAudioKeyRef.current = null;
    setAuditioning(false);
    setPreviewingVoice(false);
    setPreviewingPendingRecording(false);
  }, []);

  const stopNodePreview = useCallback(() => {
    if (nodePreviewIdRef.current) {
      getEngine().stopNode(nodePreviewIdRef.current);
      nodePreviewIdRef.current = null;
    }
    setPreviewingNode(false);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingRecordingUrl) URL.revokeObjectURL(pendingRecordingUrl);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
      stopManagedPreview();
      stopNodePreview();
    };
  }, [pendingRecordingUrl, stopManagedPreview, stopNodePreview]);

  useEffect(() => {
    if (nodePreviewIdRef.current && selectedNode?.id !== nodePreviewIdRef.current) {
      stopNodePreview();
    }
  }, [selectedNode?.id, stopNodePreview]);

  // Find track context for color
  const trackContext = selectedNode
    ? tracks.find(t => t.nodes.some(n => n.id === selectedNode.id))
    : null;
  const trackColor = trackContext
    ? (trackContext.color || getTrackColor(trackContext.colorIndex ?? 0))
    : '#00f0ff';

  // Check if re-generation is needed
  const needsRegen = selectedNode && selectedNode.generationHash
    ? selectedNode.generationHash !== computeGenerationHash(selectedNode)
    : false;

  const update = useCallback((updates) => {
    if (!selectedNode) return;
    updateNode({ id: selectedNode.id, ...updates });
  }, [selectedNode, updateNode]);

  // ── Tashkeel (Haraka) ──────────────────────────
  const handleTashkeel = useCallback(async () => {
    if (!selectedNode) return;
    try {
      setStatus('Applying tashkeel...');
      const result = await diacritize(selectedNode.text);
      pushHistory();
      update({ text: result.diacritized });
      setStatus(t(`Tashkeel: ${(result.result_ratio * 100).toFixed(0)}% diacritized`, `التشكيل: ${(result.result_ratio * 100).toFixed(0)}%`));
    } catch {
      setStatus(t('Tashkeel failed', 'فشل التشكيل'));
    }
  }, [selectedNode, update, setStatus, pushHistory]);

  // ── Seed Audition (uses /api/audition endpoint) ──
  const handleAudition = useCallback(async () => {
    if (!selectedNode) return;
    if (previewAudioKeyRef.current === 'audition') {
      stopManagedPreview();
      setStatus(t('Seed preview stopped', 'تم إيقاف معاينة البذرة'));
      return;
    }
    stopManagedPreview();
    setAuditioning(true);
    setStatus(t('Auditioning seed...', 'جارٍ معاينة البذرة...'));
    try {
      const result = await auditionApi({
        text: selectedNode.text.slice(0, 20) || '\u0645\u0631\u062D\u0628\u0627',
        voice: selectedNode.voice,
        speed: selectedNode.speed,
        seed: selectedNode.seed,
        autoTashkeel,
      });
      const audio = new Audio(result.url);
      audio.__revokeUrl = result.url;
      previewAudioRef.current = audio;
      previewAudioKeyRef.current = 'audition';
      audio.onended = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        previewAudioKeyRef.current = null;
        setAuditioning(false);
      };
      audio.onerror = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        if (audio.__revokeUrl) URL.revokeObjectURL(audio.__revokeUrl);
        previewAudioKeyRef.current = null;
        setAuditioning(false);
        setStatus(t('Seed preview failed', 'فشلت معاينة البذرة'));
      };
      await audio.play();
    } catch (err) {
      setStatus(t(`Audition error: ${err.message}`, `خطأ في المعاينة: ${err.message}`));
      setAuditioning(false);
    }
  }, [selectedNode, autoTashkeel, setStatus, stopManagedPreview, t]);

  // ── Random seed ────────────────────────────────
  const randomizeSeed = useCallback(() => {
    pushHistory();
    update({ seed: Math.floor(Math.random() * 100000) });
  }, [update, pushHistory]);

  // ── Per-node Generate (Item 5) ─────────────────
  const handleGenerate = useCallback(async () => {
    if (!selectedNode || generating) return;
    if (!selectedNode.text.trim()) {
      setStatus(t('Add text to this node before generating.', 'أضف نصاً لهذه العقدة قبل التوليد.'));
      return;
    }
    setGenerating(true);
    setStatus(t('Generating audio for node...', 'جارٍ توليد الصوت للعقدة...'));
    try {
      const result = await synthesizeApi({
        text: selectedNode.text,
        voice: selectedNode.voice,
        speed: selectedNode.speed,
        seed: selectedNode.seed,
        autoTashkeel,
        instruct: selectedNode.instruct,
      });
      const engine = getEngine();
      const { waveformData } = await engine.loadAndExtract(selectedNode.id, result.url);
      pushHistory();
      update({
        audioUrl: result.url,
        duration: result.duration,
        originalDuration: result.duration,
        waveformData,
        generationHash: computeGenerationHash(selectedNode),
      });
      setStatus(`Generated: ${result.duration.toFixed(2)}s (${result.genTime.toFixed(1)}s)`);
    } catch (err) {
      setStatus(t(`Generate error: ${err.message}`, `خطأ في التوليد: ${err.message}`));
    } finally {
      setGenerating(false);
    }
  }, [selectedNode, generating, autoTashkeel, update, pushHistory, setStatus, t]);

  // ── Per-node Preview / Play (Item 5) ───────────
  const handlePreview = useCallback(async () => {
    if (!selectedNode?.audioUrl) return;
    try {
      const engine = getEngine();
      if (nodePreviewIdRef.current === selectedNode.id) {
        stopNodePreview();
        setStatus(t('Stopped node preview', 'تم إيقاف معاينة العقدة'));
        return;
      }
      stopManagedPreview();
      stopNodePreview();
      await engine.playNode(selectedNode, {
        onEnd: () => {
          nodePreviewIdRef.current = null;
          setPreviewingNode(false);
        },
      });
      nodePreviewIdRef.current = selectedNode.id;
      setPreviewingNode(true);
      setStatus(t('Playing node...', 'جارٍ تشغيل العقدة...'));
    } catch (err) {
      nodePreviewIdRef.current = null;
      setPreviewingNode(false);
      setStatus(t(`Play error: ${err.message}`, `خطأ في التشغيل: ${err.message}`));
    }
  }, [selectedNode, setStatus, stopManagedPreview, stopNodePreview, t]);

  // ── Remove node (Item 14) ─────────────────────
  const handleRemove = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    removeNode(selectedNode.id);
    setStatus(t('Node removed', 'تمت إزالة العقدة'));
  }, [selectedNode, pushHistory, removeNode, setStatus]);

  // ── Duplicate node (Item 14) ──────────────────
  const handleDuplicate = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    duplicateSelected();
    setStatus(t('Node duplicated', 'تم نسخ العقدة'));
  }, [selectedNode, pushHistory, duplicateSelected, setStatus]);

  // ── Revert generation defaults (Item 13) ──────
  const handleRevertGen = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    update(NODE_GEN_DEFAULTS);
    setStatus(t('Generation properties reverted', 'تمت إعادة خصائص التوليد إلى الافتراضي'));
  }, [selectedNode, pushHistory, update, setStatus]);

  // ── Revert engine defaults (Item 13) ──────────
  const handleRevertEngine = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    update(NODE_ENGINE_DEFAULTS);
    setStatus(t('Engine properties reverted', 'تمت إعادة خصائص المحرك إلى الافتراضي'));
  }, [selectedNode, pushHistory, update, setStatus]);

  // ── Recording ──────────────────────────────────
  const startRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ].find((m) => MediaRecorder.isTypeSupported(m)) || '';

      mediaRecorderRef.current = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        if (pendingRecordingUrl) URL.revokeObjectURL(pendingRecordingUrl);
        setPendingRecordingBlob(blob);
        setPendingRecordingUrl(URL.createObjectURL(blob));
        if (!recordingName.trim()) {
          setRecordingName(`voice_${Date.now()}`);
        }
        setStatus(t('Recording stopped — preview and save your voice', 'تم إيقاف التسجيل — عاين صوتك ثم احفظه'));
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
      mediaRecorderRef.current.start(250);
      setRecording(true);
      setRecordingTime(0);
      setStatus(t('Recording... speak naturally for 5–15 seconds', 'جارٍ التسجيل... تحدث بشكل طبيعي لمدة 5–15 ثانية'));

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setRecordingTime(elapsed);
        if (elapsed >= MAX_RECORDING_DURATION) {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          setRecording(false);
          setStatus(t('Recording stopped — preview and save your voice', 'تم إيقاف التسجيل — عاين صوتك ثم احفظه'));
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, 100);
    } catch {
      setStatus(t('Microphone access denied', 'تم رفض إذن الميكروفون'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setStatus(t('Recording stopped — preview and save your voice', 'تم إيقاف التسجيل — عاين صوتك ثم احفظه'));
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const clearPendingRecording = useCallback(() => {
    stopManagedPreview();
    if (pendingRecordingUrl) {
      URL.revokeObjectURL(pendingRecordingUrl);
    }
    setPendingRecordingBlob(null);
    setPendingRecordingUrl(null);
    setRecordingName('');
    setRecordingTime(0);
    setStatus(t('Recording cleared', 'تم مسح التسجيل'));
  }, [pendingRecordingUrl, setStatus, stopManagedPreview, t]);

  const playPendingRecording = useCallback(async () => {
    if (!pendingRecordingUrl) return;
    if (previewAudioKeyRef.current === 'pending-recording') {
      stopManagedPreview();
      setStatus(t('Recording preview stopped', 'تم إيقاف معاينة التسجيل'));
      return;
    }
    stopManagedPreview();
    setPreviewingPendingRecording(true);
    try {
      const audio = new Audio(pendingRecordingUrl);
      previewAudioRef.current = audio;
      previewAudioKeyRef.current = 'pending-recording';
      audio.onended = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        previewAudioKeyRef.current = null;
        setPreviewingPendingRecording(false);
      };
      audio.onerror = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        previewAudioKeyRef.current = null;
        setPreviewingPendingRecording(false);
        setStatus(t('Recording preview failed', 'فشلت معاينة التسجيل'));
      };
      await audio.play();
      setStatus(t('Previewing recording...', 'جارٍ معاينة التسجيل...'));
    } catch (err) {
      previewAudioKeyRef.current = null;
      setPreviewingPendingRecording(false);
      setStatus(t(`Recording preview failed: ${err.message}`, `فشلت معاينة التسجيل: ${err.message}`));
    }
  }, [pendingRecordingUrl, setStatus, stopManagedPreview, t]);

  const saveRecordedVoice = useCallback(async () => {
    if (!pendingRecordingBlob) return;
    try {
      stopManagedPreview();
      const safeName = recordingName.trim() || `voice_${Date.now()}`;
      const wavFile = await blobToWavFile(pendingRecordingBlob, safeName);
      const res = await uploadVoice(wavFile);
      update({ voice: res.filename });
      const updated = await listVoices();
      setVoices(updated);
      setPendingRecordingBlob(null);
      if (pendingRecordingUrl) {
        URL.revokeObjectURL(pendingRecordingUrl);
        setPendingRecordingUrl(null);
      }
      setRecordingName('');
      setRecordingTime(0);
      setStatus(t(`Voice recorded and saved: ${res.filename}`, `تم تسجيل الصوت وحفظه: ${res.filename}`));
    } catch (err) {
      setStatus(t(`Upload failed: ${err.message || 'Unknown error'}`, `فشل الرفع: ${err.message || 'خطأ غير معروف'}`));
    }
  }, [pendingRecordingBlob, pendingRecordingUrl, recordingName, setStatus, setVoices, stopManagedPreview, t, update]);

  const previewSelectedVoice = useCallback(async () => {
    if (!selectedNode) return;
    if (previewAudioKeyRef.current === 'voice') {
      stopManagedPreview();
      setStatus(t('Voice preview stopped', 'تم إيقاف معاينة الصوت'));
      return;
    }
    stopManagedPreview();
    setPreviewingVoice(true);
    setStatus(t('Previewing selected voice...', 'جارٍ معاينة الصوت المحدد...'));
    try {
      const audio = new Audio(getVoicePreviewUrl(selectedNode.voice || 'default.wav'));
      previewAudioRef.current = audio;
      previewAudioKeyRef.current = 'voice';
      audio.onended = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        previewAudioKeyRef.current = null;
        setPreviewingVoice(false);
      };
      audio.onerror = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        previewAudioKeyRef.current = null;
        setStatus(t('Voice preview failed', 'فشلت معاينة الصوت'));
        setPreviewingVoice(false);
      };
      await audio.play();
    } catch (err) {
      previewAudioKeyRef.current = null;
      setStatus(t(`Voice preview failed: ${err.message}`, `فشلت معاينة الصوت: ${err.message}`));
      setPreviewingVoice(false);
    }
  }, [selectedNode, setStatus, stopManagedPreview, t]);

  // ── Upload voice file ──────────────────────────
  const handleVoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (pendingRecordingUrl) URL.revokeObjectURL(pendingRecordingUrl);
      setPendingRecordingBlob(file);
      setPendingRecordingUrl(URL.createObjectURL(file));
      setRecordingName(file.name.replace(/\.[^.]+$/, ''));
      setRecordingTime(0);
      setStatus(t('Voice sample loaded — review and save it.', 'تم تحميل العينة — راجعها ثم احفظها.'));
    } catch (err) {
      setStatus(t(`Upload preparation failed: ${err.message || 'Unknown error'}`, `فشل تجهيز الرفع: ${err.message || 'خطأ غير معروف'}`));
    }
  };

  // ── Phoneme preview ────────────────────────────
  const phonemes = selectedNode ? arabicToPhonemes(selectedNode.text) : '';
  const midi = selectedNode ? NOTE_RANGE.center + (selectedNode.pitch_shift || 0) : 60;
  const noteName = midiToNoteName(midi);

  if (!selectedNode) {
    return (
      <div className="properties-panel collapsed">
        <h3>{t('Properties', 'الخصائص')}</h3>
        <p className="hint">{t('Select a note to edit', 'حدد نغمة للتحرير')}</p>
      </div>
    );
  }

  return (
    <div className="properties-panel" style={{ borderLeftColor: trackColor }}>
      {/* Header with node actions (Item 14) */}
      <div className="panel-header">
        <div className="color-swatch" style={{ background: trackColor }} />
        <h3>{noteName}</h3>
        <span className="node-type-badge">{selectedNode.nodeType || 'tts'}</span>
        <div className="panel-header-actions">
          <button className="btn-icon" onClick={handlePreview} title={t('Preview node', 'معاينة العقدة')} disabled={!selectedNode.audioUrl}>
            {previewingNode ? <Square size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
          </button>
          <button className="btn-icon" onClick={handleDuplicate} title={t('Duplicate node (Ctrl+D)', 'نسخ العقدة (Ctrl+D)')}>
            <Copy size={14} strokeWidth={1.5} />
          </button>
          <button className="btn-icon danger" onClick={handleRemove} title={t('Remove node (Del)', 'إزالة العقدة (Del)')}>
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ═══════════ GROUP 1: Generation / Import Properties ═══════════ */}
      {selectedNode.nodeType === 'imported' ? (
        <div className="panel-group panel-group-import">
          <div className="panel-group-title import-title">
            {t('Imported Audio', 'صوت مستورد')}
          </div>

          {/* Waveform preview */}
          {selectedNode.waveformData && selectedNode.waveformData.length > 0 && (
            <div className="panel-section">
              <label>{t('Waveform', 'الموجة الصوتية')}</label>
              <canvas
                ref={(canvas) => {
                  if (!canvas || !selectedNode.waveformData) return;
                  const ctx = canvas.getContext('2d');
                  const w = canvas.width;
                  const h = canvas.height;
                  const data = selectedNode.waveformData;
                  ctx.clearRect(0, 0, w, h);
                  const step = w / data.length;
                  const mid = h / 2;
                  const amp = h * 0.4;
                  ctx.fillStyle = trackColor + '33';
                  ctx.strokeStyle = trackColor + 'aa';
                  ctx.lineWidth = 1;
                  ctx.beginPath();
                  ctx.moveTo(0, mid);
                  for (let i = 0; i < data.length; i++) {
                    ctx.lineTo(i * step, mid - data[i] * amp);
                  }
                  for (let i = data.length - 1; i >= 0; i--) {
                    ctx.lineTo(i * step, mid + data[i] * amp);
                  }
                  ctx.closePath();
                  ctx.fill();
                  ctx.stroke();
                }}
                width={200}
                height={48}
                className="import-waveform-canvas"
              />
            </div>
          )}

          {/* Filename */}
          <div className="panel-section">
            <label>{t('File', 'الملف')}</label>
            <div className="import-filename">{selectedNode.text || t('(unnamed)', '(بدون اسم)')}</div>
          </div>

          {/* Duration info */}
          <div className="panel-section">
            <label>{t('Original Duration', 'المدة الأصلية')}</label>
            <div className="import-filename">{(selectedNode.originalDuration || selectedNode.duration || 0).toFixed(2)}s</div>
          </div>
        </div>
      ) : (
        <div className="panel-group panel-group-gen">
          <div className="panel-group-title gen-title">
            {t('Generation Properties', 'خصائص التوليد')}
            <button className="btn-revert" onClick={handleRevertGen} title="Revert to defaults">
              <RotateCcw size={11} strokeWidth={2} />
            </button>
            {needsRegen && (
              <span className="regen-badge" title="Text/voice/speed/seed changed — re-generate needed">
                <AlertTriangle size={12} strokeWidth={2} /> {t('Re-gen needed', 'إعادة توليد مطلوبة')}
              </span>
            )}
          </div>

          {/* Generate button (Item 5) */}
          <div className="panel-section">
            <button
              className={`btn-generate ${generating ? 'generating' : ''}`}
              onClick={handleGenerate}
              disabled={generating || !selectedNode.text}
              title={t('Generate audio for this node', 'توليد الصوت لهذه العقدة')}
            >
              <Zap size={14} strokeWidth={2} />
              {generating ? t('Generating...', 'جارٍ التوليد...') : t('Generate', 'توليد')}
            </button>
          </div>

          {/* Arabic Text (Item 4, 19: RTL + lang="ar") */}
          <div className="panel-section">
            <label>{t('Arabic Text', 'النص العربي')}</label>
            <textarea
              rows={3}
              value={selectedNode.text}
              onChange={(e) => update({ text: e.target.value })}
              onBlur={() => pushHistory()}
              placeholder="اكتب النص العربي هنا..."
              dir="rtl"
              lang="ar"
              className="arabic-input"
            />
            <div className="section-actions">
              <button className="btn-haraka" onClick={handleTashkeel} title={t('Apply diacritics (auto-tashkeel)', 'تطبيق التشكيل التلقائي')}>
                {t('Tashkeel', 'تشكيل')}
              </button>
              {!hasDiacritics(selectedNode.text) && (
                <span className="warning-badge">{t('No diacritics', 'بدون تشكيل')}</span>
              )}
            </div>
          </div>

          {/* Phoneme Display */}
          {phonemes && (
            <div className="panel-section">
              <label>{t('Phonemes', 'الفونيمات')}</label>
              <div className="phoneme-display">{phonemes}</div>
            </div>
          )}

          {/* Voice */}
          <div className="panel-section">
            <label>{t('Voice', 'الصوت')}</label>
            <select
              value={selectedNode.voice || ''}
              onChange={(e) => update({ voice: e.target.value || null })}
            >
                <option value="">{t('Default Female', 'الافتراضي الأنثوي')}</option>
              {voices.map(v => (
                <option key={v} value={v}>
                  {v.split(/[\\/]/).pop()}
                </option>
              ))}
            </select>
            <div className="section-actions">
              <label className="btn-sm upload-btn">
                <Upload size={12} strokeWidth={1.5} /> {t('Upload', 'رفع')}
                <input type="file" accept="audio/*" hidden onChange={handleVoiceUpload} />
              </label>
              <button
                className={`btn-sm ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? <Square size={12} strokeWidth={1.5} /> : <Mic size={12} strokeWidth={1.5} />} {recording ? t('Stop', 'إيقاف') : t('Rec', 'تسجيل')}
              </button>
              <button
                className="btn-sm"
                onClick={previewSelectedVoice}
                title={t('Preview selected/default voice', 'معاينة الصوت المحدد/الافتراضي')}
              >
                {previewingVoice ? <Square size={12} strokeWidth={1.5} /> : <Play size={12} strokeWidth={1.5} />} {previewingVoice ? t('Stop', 'إيقاف') : t('Preview', 'معاينة')}
              </button>
            </div>

            {recording && (
              <div className="recording-indicator" style={{ marginTop: 8 }}>
                <div className="recording-dot" />
                <span>{t('Recording...', 'جارٍ التسجيل...')} {recordingTime.toFixed(1)}s / {MAX_RECORDING_DURATION}s</span>
                <div className="recording-bar">
                  <div
                    className="recording-bar-fill"
                    style={{ width: `${(recordingTime / MAX_RECORDING_DURATION) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {pendingRecordingBlob && (
              <div className="panel-section" style={{ marginTop: 8 }}>
                <label>{t('Recording Name', 'اسم التسجيل')}</label>
                <input
                  type="text"
                  value={recordingName}
                  onChange={(e) => setRecordingName(e.target.value)}
                  placeholder={t('e.g. my_voice', 'مثال: صوتي')}
                />
                {pendingRecordingUrl && (
                  <audio src={pendingRecordingUrl} controls style={{ width: '100%', marginTop: 6 }} />
                )}
                <div className="section-actions" style={{ marginTop: 6 }}>
                  <button className="btn-sm" onClick={playPendingRecording}>
                    {previewingPendingRecording ? <Square size={12} strokeWidth={1.5} /> : <Play size={12} strokeWidth={1.5} />} {previewingPendingRecording ? t('Stop Preview', 'إيقاف المعاينة') : t('Play Recording', 'تشغيل التسجيل')}
                  </button>
                  <button className="btn-sm" onClick={saveRecordedVoice}>
                    <Upload size={12} strokeWidth={1.5} /> {t('Save Recording', 'حفظ التسجيل')}
                  </button>
                  <button className="btn-sm" onClick={clearPendingRecording}>
                    <Trash2 size={12} strokeWidth={1.5} /> {t('Clear', 'مسح')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Seed */}
          <div className="panel-section">
            <label>{t('Seed', 'البذرة')}</label>
            <div className="seed-row">
              <input
                type="number"
                value={selectedNode.seed}
                onChange={(e) => update({ seed: parseInt(e.target.value) || 0 })}
              />
              <button className="btn-dice" onClick={randomizeSeed} title={t('Random seed', 'بذرة عشوائية')}>
                <Dice5 size={16} strokeWidth={1.5} />
              </button>
              <button
                className="btn-dice"
                onClick={handleAudition}
                title={t('Audition seed (quick preview)', 'معاينة سريعة للبذرة')}
              >
                {auditioning ? <Square size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
              </button>
            </div>
          </div>

          {/* Speed (generation-time property) */}
          <div className="panel-section">
            <label>{t('Speed', 'السرعة')}: {(selectedNode.speed || 1).toFixed(2)}x</label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={selectedNode.speed || 1}
              onChange={(e) => update({ speed: parseFloat(e.target.value) })}
              style={{ accentColor: trackColor }}
            />
          </div>

          {/* Speaking Style Instruction (Item 18) */}
          <div className="panel-section">
            <label>{t('Speaking Style', 'أسلوب الإلقاء')}</label>
            <textarea
              rows={2}
              value={selectedNode.instruct || ''}
              onChange={(e) => update({ instruct: e.target.value })}
              onBlur={() => pushHistory()}
              placeholder="e.g. Speak cheerfully / اقرأ بصوت حماسي"
              className="instruct-input"
              dir="auto"
            />
            <div className="section-hint">
              {t('Controls tone, emotion, and pace. Leave empty for neutral.', 'يتحكم في النبرة والعاطفة والإيقاع. اتركه فارغاً للصوت المحايد.')}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ GROUP 2: Audio Engine Properties ═══════════ */}
      <div className="panel-group panel-group-engine">
        <div className="panel-group-title engine-title">
          {t('Audio Engine Properties', 'خصائص محرك الصوت')}
          <button className="btn-revert" onClick={handleRevertEngine} title="Revert to defaults">
            <RotateCcw size={11} strokeWidth={2} />
          </button>
        </div>

        {/* Pitch Shift */}
        <div className="panel-section">
          <label>{t('Pitch', 'الطبقة')}: {selectedNode.pitch_shift > 0 ? '+' : ''}{selectedNode.pitch_shift} st ({noteName})</label>
          <input
            type="range"
            min="-24"
            max="24"
            step="1"
            value={selectedNode.pitch_shift}
            onChange={(e) => update({ pitch_shift: parseInt(e.target.value) })}
            style={{ accentColor: trackColor }}
          />
        </div>

        {/* Volume */}
        <div className="panel-section">
          <label>{t('Volume', 'مستوى الصوت')}: {Math.round((selectedNode.volume ?? 1) * 100)}%</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={selectedNode.volume ?? 1}
            onChange={(e) => update({ volume: parseFloat(e.target.value) })}
            style={{ accentColor: trackColor }}
          />
        </div>

        {/* Per-node Pan */}
        <div className="panel-section">
          <label>{t('Pan', 'التموضع')}: {
            selectedNode.pan == null ? t('Track default', 'افتراضي المسار')
            : selectedNode.pan === 0 ? t('Center', 'الوسط')
            : selectedNode.pan > 0 ? t(`Right ${Math.round(selectedNode.pan * 100)}%`, `يمين ${Math.round(selectedNode.pan * 100)}%`)
            : t(`Left ${Math.round(Math.abs(selectedNode.pan) * 100)}%`, `يسار ${Math.round(Math.abs(selectedNode.pan) * 100)}%`)
          }</label>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={selectedNode.pan ?? 0}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              update({ pan: v === 0 ? null : v });
            }}
            style={{ accentColor: trackColor }}
          />
        </div>

        {/* Fade In / Out */}
        <div className="panel-section fade-section">
          <div>
            <label>{t('Fade In', 'تلاشي الدخول')}: {(selectedNode.fade_in || 0).toFixed(1)}s</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={selectedNode.fade_in || 0}
              onChange={(e) => update({ fade_in: parseFloat(e.target.value) })}
            />
          </div>
          <div>
            <label>{t('Fade Out', 'تلاشي الخروج')}: {(selectedNode.fade_out || 0).toFixed(1)}s</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={selectedNode.fade_out || 0}
              onChange={(e) => update({ fade_out: parseFloat(e.target.value) })}
            />
          </div>
        </div>

        {/* Duration (editable) */}
        <div className="panel-section">
          <label>{t('Duration (s)', 'المدة (ث)')}</label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={selectedNode.duration > 0 ? selectedNode.duration.toFixed(2) : ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (v > 0) {
                pushHistory();
                update({ duration: v });
              }
            }}
            placeholder={t('auto', 'تلقائي')}
            style={{ width: '100%' }}
          />
        </div>

        {/* Engine Speed (Item 9) — syncs with timeline node width */}
        <div className="panel-section">
          <label>{t('Engine Speed', 'سرعة المحرك')}: {(selectedNode.engineSpeed || 1).toFixed(2)}x</label>
          <input
            type="range"
            min="0.25"
            max="4.0"
            step="0.05"
            value={selectedNode.engineSpeed || 1}
            onChange={(e) => {
              const newSpeed = parseFloat(e.target.value);
              const origDur = selectedNode.originalDuration || selectedNode.duration || 1;
              const newDuration = origDur / newSpeed;
              update({ engineSpeed: newSpeed, duration: Math.max(0.1, newDuration) });
            }}
            style={{ accentColor: trackColor }}
          />
          <div className="section-hint">{t('Playback speed (stretch). 1.0 = original.', 'سرعة التشغيل (تمطيط). 1.0 = الأصلية.')}</div>
        </div>
      </div>

      {/* Keyboard shortcuts help */}
      <div className="panel-section shortcuts-hint">
        <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> {t('Undo', 'تراجع')}</span>
        <span><kbd>Del</kbd> {t('Remove', 'إزالة')}</span>
        <span><kbd>Ctrl</kbd>+<kbd>D</kbd> {t('Duplicate', 'نسخ')}</span>
        <span><kbd>Space</kbd> {t('Play/Pause', 'تشغيل/إيقاف')}</span>
      </div>
    </div>
  );
}
