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

import React, { useState, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Dice5, Play, Mic, Upload, AlertTriangle, Trash2, Copy,
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
import { diacritize, uploadVoice, listVoices, audition as auditionApi, synthesize as synthesizeApi } from '../api';
import { getEngine } from '../audio/AudioEngine';

export default function PropertiesPanel() {
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
  const [auditioning, setAuditioning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

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
      setStatus(`Tashkeel: ${(result.result_ratio * 100).toFixed(0)}% diacritized`);
    } catch {
      setStatus('Tashkeel failed');
    }
  }, [selectedNode, update, setStatus, pushHistory]);

  // ── Seed Audition (uses /api/audition endpoint) ──
  const handleAudition = useCallback(async () => {
    if (!selectedNode || auditioning) return;
    setAuditioning(true);
    setStatus('Auditioning seed...');
    try {
      const result = await auditionApi({
        text: selectedNode.text.slice(0, 20) || '\u0645\u0631\u062D\u0628\u0627',
        voice: selectedNode.voice,
        speed: selectedNode.speed,
        seed: selectedNode.seed,
        autoTashkeel,
      });
      const audio = new Audio(result.url);
      audio.play();
      audio.onended = () => setAuditioning(false);
      setStatus('Audition complete');
    } catch (err) {
      setStatus(`Audition error: ${err.message}`);
      setAuditioning(false);
    }
  }, [selectedNode, auditioning, autoTashkeel, setStatus]);

  // ── Random seed ────────────────────────────────
  const randomizeSeed = useCallback(() => {
    pushHistory();
    update({ seed: Math.floor(Math.random() * 100000) });
  }, [update, pushHistory]);

  // ── Per-node Generate (Item 5) ─────────────────
  const handleGenerate = useCallback(async () => {
    if (!selectedNode || generating) return;
    if (!selectedNode.text.trim()) {
      setStatus('Add text to this node before generating.');
      return;
    }
    setGenerating(true);
    setStatus('Generating audio for node...');
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
      setStatus(`Generate error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [selectedNode, generating, autoTashkeel, update, pushHistory, setStatus]);

  // ── Per-node Preview / Play (Item 5) ───────────
  const handlePreview = useCallback(async () => {
    if (!selectedNode?.audioUrl) return;
    try {
      const engine = getEngine();
      await engine.playNode(selectedNode);
      setStatus('Playing node...');
    } catch (err) {
      setStatus(`Play error: ${err.message}`);
    }
  }, [selectedNode, setStatus]);

  // ── Remove node (Item 14) ─────────────────────
  const handleRemove = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    removeNode(selectedNode.id);
    setStatus('Node removed');
  }, [selectedNode, pushHistory, removeNode, setStatus]);

  // ── Duplicate node (Item 14) ──────────────────
  const handleDuplicate = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    duplicateSelected();
    setStatus('Node duplicated');
  }, [selectedNode, pushHistory, duplicateSelected, setStatus]);

  // ── Revert generation defaults (Item 13) ──────
  const handleRevertGen = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    update(NODE_GEN_DEFAULTS);
    setStatus('Generation properties reverted');
  }, [selectedNode, pushHistory, update, setStatus]);

  // ── Revert engine defaults (Item 13) ──────────
  const handleRevertEngine = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    update(NODE_ENGINE_DEFAULTS);
    setStatus('Engine properties reverted');
  }, [selectedNode, pushHistory, update, setStatus]);

  // ── Recording ──────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        // Always use .wav extension — backend re-encodes to PCM WAV regardless
        const file = new File([blob], `rec_${Date.now()}.wav`, { type: 'audio/webm' });
        try {
          const res = await uploadVoice(file);
          update({ voice: res.filename });
          // Refresh voice list so the new voice appears in all dropdowns
          const updated = await listVoices();
          setVoices(updated);
          setStatus(`Voice recorded and saved: ${res.filename}`);
        } catch {
          setStatus('Upload failed');
        }
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch {
      setStatus('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // ── Upload voice file ──────────────────────────
  const handleVoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await uploadVoice(file);
      update({ voice: res.filename });
      // Refresh voice list so the new voice appears in all dropdowns
      const updated = await listVoices();
      setVoices(updated);
      setStatus(`Voice uploaded: ${res.filename}`);
    } catch {
      setStatus('Upload failed');
    }
  };

  // ── Phoneme preview ────────────────────────────
  const phonemes = selectedNode ? arabicToPhonemes(selectedNode.text) : '';
  const midi = selectedNode ? NOTE_RANGE.center + (selectedNode.pitch_shift || 0) : 60;
  const noteName = midiToNoteName(midi);

  if (!selectedNode) {
    return (
      <div className="properties-panel collapsed">
        <h3>Properties</h3>
        <p className="hint">Select a note to edit</p>
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
          <button className="btn-icon" onClick={handlePreview} title="Preview node" disabled={!selectedNode.audioUrl}>
            <Play size={14} strokeWidth={2} />
          </button>
          <button className="btn-icon" onClick={handleDuplicate} title="Duplicate node (Ctrl+D)">
            <Copy size={14} strokeWidth={1.5} />
          </button>
          <button className="btn-icon danger" onClick={handleRemove} title="Remove node (Del)">
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ═══════════ GROUP 1: Generation / Import Properties ═══════════ */}
      {selectedNode.nodeType === 'imported' ? (
        <div className="panel-group panel-group-import">
          <div className="panel-group-title import-title">
            Imported Audio
          </div>

          {/* Waveform preview */}
          {selectedNode.waveformData && selectedNode.waveformData.length > 0 && (
            <div className="panel-section">
              <label>Waveform</label>
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
            <label>File</label>
            <div className="import-filename">{selectedNode.text || '(unnamed)'}</div>
          </div>

          {/* Duration info */}
          <div className="panel-section">
            <label>Original Duration</label>
            <div className="import-filename">{(selectedNode.originalDuration || selectedNode.duration || 0).toFixed(2)}s</div>
          </div>
        </div>
      ) : (
        <div className="panel-group panel-group-gen">
          <div className="panel-group-title gen-title">
            Generation Properties
            <button className="btn-revert" onClick={handleRevertGen} title="Revert to defaults">
              <RotateCcw size={11} strokeWidth={2} />
            </button>
            {needsRegen && (
              <span className="regen-badge" title="Text/voice/speed/seed changed — re-generate needed">
                <AlertTriangle size={12} strokeWidth={2} /> Re-gen needed
              </span>
            )}
          </div>

          {/* Generate button (Item 5) */}
          <div className="panel-section">
            <button
              className={`btn-generate ${generating ? 'generating' : ''}`}
              onClick={handleGenerate}
              disabled={generating || !selectedNode.text}
              title="Generate audio for this node"
            >
              <Zap size={14} strokeWidth={2} />
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>

          {/* Arabic Text (Item 4, 19: RTL + lang="ar") */}
          <div className="panel-section">
            <label>Arabic Text</label>
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
              <button className="btn-haraka" onClick={handleTashkeel} title="Apply diacritics (auto-tashkeel)">
                Tashkeel
              </button>
              {!hasDiacritics(selectedNode.text) && (
                <span className="warning-badge">No diacritics</span>
              )}
            </div>
          </div>

          {/* Phoneme Display */}
          {phonemes && (
            <div className="panel-section">
              <label>Phonemes</label>
              <div className="phoneme-display">{phonemes}</div>
            </div>
          )}

          {/* Voice */}
          <div className="panel-section">
            <label>Voice</label>
            <select
              value={selectedNode.voice || ''}
              onChange={(e) => update({ voice: e.target.value || null })}
            >
              <option value="">Default</option>
              {voices.map(v => (
                <option key={v} value={v}>
                  {v.split(/[\\/]/).pop()}
                </option>
              ))}
            </select>
            <div className="section-actions">
              <label className="btn-sm upload-btn">
                <Upload size={12} strokeWidth={1.5} /> Upload
                <input type="file" accept="audio/*" hidden onChange={handleVoiceUpload} />
              </label>
              <button
                className={`btn-sm ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
              >
                <Mic size={12} strokeWidth={1.5} /> {recording ? 'Stop' : 'Rec'}
              </button>
            </div>
          </div>

          {/* Seed */}
          <div className="panel-section">
            <label>Seed</label>
            <div className="seed-row">
              <input
                type="number"
                value={selectedNode.seed}
                onChange={(e) => update({ seed: parseInt(e.target.value) || 0 })}
              />
              <button className="btn-dice" onClick={randomizeSeed} title="Random seed">
                <Dice5 size={16} strokeWidth={1.5} />
              </button>
              <button
                className="btn-dice"
                onClick={handleAudition}
                disabled={auditioning}
                title="Audition seed (quick preview)"
              >
                <Play size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Speed (generation-time property) */}
          <div className="panel-section">
            <label>Speed: {(selectedNode.speed || 1).toFixed(2)}x</label>
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
            <label>Speaking Style</label>
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
              Controls tone, emotion, and pace. Leave empty for neutral.
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ GROUP 2: Audio Engine Properties ═══════════ */}
      <div className="panel-group panel-group-engine">
        <div className="panel-group-title engine-title">
          Audio Engine Properties
          <button className="btn-revert" onClick={handleRevertEngine} title="Revert to defaults">
            <RotateCcw size={11} strokeWidth={2} />
          </button>
        </div>

        {/* Pitch Shift */}
        <div className="panel-section">
          <label>Pitch: {selectedNode.pitch_shift > 0 ? '+' : ''}{selectedNode.pitch_shift} st ({noteName})</label>
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
          <label>Volume: {Math.round((selectedNode.volume ?? 1) * 100)}%</label>
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
          <label>Pan: {
            selectedNode.pan == null ? 'Track default'
            : selectedNode.pan === 0 ? 'Center'
            : selectedNode.pan > 0 ? `Right ${Math.round(selectedNode.pan * 100)}%`
            : `Left ${Math.round(Math.abs(selectedNode.pan) * 100)}%`
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
            <label>Fade In: {(selectedNode.fade_in || 0).toFixed(1)}s</label>
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
            <label>Fade Out: {(selectedNode.fade_out || 0).toFixed(1)}s</label>
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
          <label>Duration (s)</label>
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
            placeholder="auto"
            style={{ width: '100%' }}
          />
        </div>

        {/* Engine Speed (Item 9) — syncs with timeline node width */}
        <div className="panel-section">
          <label>Engine Speed: {(selectedNode.engineSpeed || 1).toFixed(2)}x</label>
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
          <div className="section-hint">Playback speed (stretch). 1.0 = original.</div>
        </div>
      </div>

      {/* Keyboard shortcuts help */}
      <div className="panel-section shortcuts-hint">
        <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> Undo</span>
        <span><kbd>Del</kbd> Remove</span>
        <span><kbd>Ctrl</kbd>+<kbd>D</kbd> Duplicate</span>
        <span><kbd>Space</kbd> Play/Pause</span>
      </div>
    </div>
  );
}
