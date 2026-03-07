/**
 * BayanSynth Studio — Voice Cloning Panel (Modal)
 *
 * Full voice cloning workflow:
 *  1. Record your voice (5–15s recommended)
 *  2. Or upload an existing WAV file
 *  3. Preview / playback the recording
 *  4. Save to voice library
 *  5. Test-synthesize with the new voice
 *
 * Follows the BayanSynth GUIDE.md workflow.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  Mic, Square, Play, Upload, Save, X, Volume2, Trash2, Check, FolderOpen,
} from 'lucide-react';
import {
  voicesAtom,
  statusTextAtom,
  selectedNodeAtom,
  updateNodeAtom,
} from '../store/atoms';
import { uploadVoice, listVoices, deleteVoice, openVoicesFolder, synthesize as synthesizeApi } from '../api';

// Voice clone panel open state (module-level for simplicity)
import { atom } from 'jotai';
export const voiceCloneOpenAtom = atom(false);

const MAX_DURATION = 30; // max recording time in seconds

export default function VoiceClonePanel() {
  const [isOpen, setIsOpen] = useAtom(voiceCloneOpenAtom);
  const [voices, setVoices] = useAtom(voicesAtom);
  const setStatus = useSetAtom(statusTextAtom);
  const selectedNode = useAtomValue(selectedNodeAtom);
  const updateNode = useSetAtom(updateNodeAtom);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [voiceName, setVoiceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testText, setTestText] = useState('مَرْحَباً بِكُمْ فِي اخْتِبَارِ الصَّوْتِ');
  const [savedVoicePath, setSavedVoicePath] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const streamRef = useRef(null);

  // Cleanup on unmount/close
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Start recording
  const startRecording = useCallback(async () => {
    // Guard: don't start if already recording
    if (mediaRecorderRef.current?.state === 'recording') return;
    try {
      // Request microphone without sampleRate constraint — browsers typically
      // run audio at 44.1 kHz or 48 kHz natively; the server resamples to 24 kHz.
      // Requesting an unsupported sampleRate can throw NotSupportedError.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      // Find the best supported mimeType — don't force an unsupported one
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ].find(m => MediaRecorder.isTypeSupported(m)) || '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start(250); // collect chunks every 250ms
      setRecording(true);
      setRecordingTime(0);
      setSavedVoicePath(null);

      // Timer — NOTE: do NOT call stopRecording() here because its useCallback
      // captures recording=false (stale closure at definition time).  Instead,
      // drive the recorder directly through its ref so the auto-stop always works.
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setRecordingTime(elapsed);
        if (elapsed >= MAX_DURATION) {
          // Stop via ref — avoids stale 'recording' state in closure
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          setRecording(false);
          clearInterval(timerRef.current);
          timerRef.current = null;
          setStatus('Recording stopped — preview and save your voice');
        }
      }, 100);

      setStatus('Recording... speak naturally for 5–15 seconds');
    } catch (err) {
      setStatus(`Microphone access denied: ${err.message}`);
    }
  }, [audioUrl, setStatus]);

  // Stop recording — checks mediaRecorder state directly (avoids stale React closure)
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setStatus('Recording stopped — preview and save your voice');
    }
  }, [setStatus]);

  // Play preview
  const playPreview = useCallback(() => {
    if (!audioUrl) return;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    const audio = new Audio(audioUrl);
    audioPlayerRef.current = audio;
    audio.play();
  }, [audioUrl]);

  // Upload file instead of recording
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAudioBlob(file);
    const url = URL.createObjectURL(file);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(url);
    setVoiceName(file.name.replace(/\.[^.]+$/, ''));
    setSavedVoicePath(null);
    setStatus(`Loaded voice file: ${file.name}`);
  }, [audioUrl, setStatus]);

  // Save to voice library
  const handleSave = useCallback(async () => {
    if (!audioBlob) return;
    setSaving(true);
    setStatus('Saving voice to library...');
    try {
      const name = voiceName.trim() || `voice_${Date.now()}`;
      // Always use .wav as the file extension — the backend re-encodes everything
      // to 24-kHz PCM WAV and saves with .wav, regardless of the source format
      // (WebM, Opus, MP3 …).  Using .wav avoids a naming mismatch where the
      // saved file has a .webm extension but is actually a WAV.
      const file = new File([audioBlob], `${name}.wav`, { type: audioBlob.type });
      const res = await uploadVoice(file);
      setSavedVoicePath(res.filename);

      // Refresh voice list
      const voices = await listVoices();
      setVoices(voices);

      setStatus(`Voice saved: ${res.filename}`);
    } catch (err) {
      setStatus(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [audioBlob, voiceName, setVoices, setStatus]);

  // Delete a voice from the library
  const handleDeleteVoice = useCallback(async (voiceFile) => {
    try {
      await deleteVoice(voiceFile);
      const updated = await listVoices();
      setVoices(updated);
      // Clear savedVoicePath if we just deleted the one we saved
      if (savedVoicePath === voiceFile) setSavedVoicePath(null);
      setStatus(`Deleted voice: ${voiceFile}`);
    } catch (err) {
      setStatus(`Delete failed: ${err.message}`);
    }
  }, [savedVoicePath, setVoices, setStatus]);

  // Play a voice from the library (streamed from /voices/)
  const playLibraryVoice = useCallback((voiceFile) => {
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    const audio = new Audio(`/voices/${encodeURIComponent(voiceFile)}`);
    audioPlayerRef.current = audio;
    audio.play().catch(() => {
      // Fallback: can't preview (built-in voices aren't served via /voices/)
      setStatus(`Cannot preview built-in voice: ${voiceFile}`);
    });
  }, [setStatus]);

  // Apply a library voice to selected node (from the library browser)
  const applyLibraryVoice = useCallback((voiceFile) => {
    if (!selectedNode) {
      setStatus('Select a node on the timeline first, then apply a voice.');
      return;
    }
    updateNode({ id: selectedNode.id, voice: voiceFile });
    setStatus(`Applied "${voiceFile}" to selected node`);
  }, [selectedNode, updateNode, setStatus]);

  // Apply voice to selected node
  const applyToNode = useCallback(() => {
    if (!selectedNode || !savedVoicePath) return;
    updateNode({ id: selectedNode.id, voice: savedVoicePath });
    setStatus(`Voice "${savedVoicePath}" applied to node`);
  }, [selectedNode, savedVoicePath, updateNode, setStatus]);

  // Test synthesize with the new voice
  const handleTest = useCallback(async () => {
    if (!savedVoicePath || testing) return;
    setTesting(true);
    setStatus('Testing voice clone...');
    try {
      const result = await synthesizeApi({
        text: testText,
        voice: savedVoicePath,
        speed: 1.0,
        seed: 42,
        autoTashkeel: true,
      });
      const audio = new Audio(result.url);
      audio.play();
      audio.onended = () => setTesting(false);
      setStatus(`Voice clone test: ${result.duration.toFixed(1)}s generated`);
    } catch (err) {
      setStatus(`Test failed: ${err.message}`);
      setTesting(false);
    }
  }, [savedVoicePath, testing, testText, setStatus]);

  // Clear recording
  const handleClear = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setVoiceName('');
    setSavedVoicePath(null);
    setRecordingTime(0);
  }, [audioUrl]);

  if (!isOpen) return null;

  return (
    <div className="settings-backdrop" onClick={() => setIsOpen(false)}>
      <div className="settings-panel voice-clone-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Voice Cloning</h2>
          <button className="help-close" onClick={() => setIsOpen(false)}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="settings-body">
          {/* Step 1: Record or Upload */}
          <section className="settings-section">
            <h3>Step 1 — Record or Upload</h3>
            <p className="settings-hint" style={{ marginBottom: 12 }}>
              Record 5–15 seconds of clear speech in a quiet room, or upload an existing audio file.
            </p>

            <div className="voice-clone-actions">
              {!recording ? (
                <button
                  className="btn btn-primary"
                  onClick={startRecording}
                  disabled={saving || testing}
                >
                  <Mic size={14} strokeWidth={2} /> Start Recording
                </button>
              ) : (
                <button
                  className="btn btn-danger"
                  onClick={stopRecording}
                >
                  <Square size={14} strokeWidth={2} /> Stop ({recordingTime.toFixed(1)}s)
                </button>
              )}

              <label className="btn btn-sm upload-btn" style={{ cursor: 'pointer' }}>
                <Upload size={14} strokeWidth={1.5} /> Upload File
                <input type="file" accept="audio/*" hidden onChange={handleFileUpload} />
              </label>
            </div>

            {/* Recording level indicator */}
            {recording && (
              <div className="recording-indicator">
                <div className="recording-dot" />
                <span>Recording... {recordingTime.toFixed(1)}s / {MAX_DURATION}s</span>
                <div className="recording-bar">
                  <div
                    className="recording-bar-fill"
                    style={{ width: `${(recordingTime / MAX_DURATION) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Step 2: Preview */}
          {audioUrl && !recording && (
            <section className="settings-section">
              <h3>Step 2 — Preview</h3>
              <div className="voice-clone-actions">
                <button className="btn btn-sm" onClick={playPreview}>
                  <Play size={14} strokeWidth={2} /> Play Recording
                </button>
                <button className="btn btn-sm" onClick={handleClear}>
                  <Trash2 size={14} strokeWidth={1.5} /> Clear
                </button>
              </div>
              <audio src={audioUrl} controls style={{ width: '100%', marginTop: 8 }} />
            </section>
          )}

          {/* Step 3: Save */}
          {audioBlob && !recording && (
            <section className="settings-section">
              <h3>Step 3 — Save to Library</h3>
              <div className="form-group">
                <label>Voice Name</label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="e.g. my_voice"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !audioBlob}
                style={{ marginTop: 8 }}
              >
                {saving ? 'Saving...' : (
                  <>
                    <Save size={14} strokeWidth={1.5} /> Save Voice
                  </>
                )}
              </button>
              {savedVoicePath && (
                <div className="voice-saved-badge">
                  <Check size={14} strokeWidth={2} /> Saved as: {savedVoicePath}
                </div>
              )}
            </section>
          )}

          {/* Step 4: Test */}
          {savedVoicePath && (
            <section className="settings-section">
              <h3>Step 4 — Test Voice</h3>
              <div className="form-group">
                <label>Test Text</label>
                <textarea
                  rows={2}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  dir="rtl"
                  lang="ar"
                  className="arabic-input"
                />
              </div>
              <div className="voice-clone-actions" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleTest}
                  disabled={testing}
                >
                  <Volume2 size={14} strokeWidth={1.5} />
                  {testing ? 'Generating...' : 'Test Synthesize'}
                </button>
                {selectedNode && (
                  <button className="btn btn-sm" onClick={applyToNode}>
                    <Check size={14} strokeWidth={1.5} /> Apply to Selected Node
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Voice Library */}
          {voices.length > 0 && (
            <section className="settings-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3>Voice Library ({voices.length})</h3>
                <button
                  className="btn btn-sm"
                  onClick={() => openVoicesFolder().catch(() => setStatus('Could not open voices folder'))}
                  title="Open voices folder in Explorer"
                >
                  <FolderOpen size={14} strokeWidth={1.5} /> Open Folder
                </button>
              </div>
              <p className="settings-hint" style={{ marginBottom: 8 }}>
                Saved voices — click <strong>Apply</strong> to assign to the selected node.
              </p>
              <div className="voice-library-list">
                {voices.map((v) => {
                  const label = v.split(/[/\\]/).pop();
                  const isActive = selectedNode?.voice === v;
                  return (
                    <div key={v} className={`voice-library-item${isActive ? ' active' : ''}`}>
                      <span className="voice-library-name" title={v}>{label}</span>
                      <div className="voice-library-actions">
                        {selectedNode && (
                          <button
                            className="btn btn-sm"
                            onClick={() => applyLibraryVoice(v)}
                            title="Apply to selected node"
                          >
                            <Check size={12} strokeWidth={2} /> Apply
                          </button>
                        )}
                        <button
                          className="btn btn-sm"
                          onClick={() => playLibraryVoice(label)}
                          title="Preview voice"
                        >
                          <Play size={12} strokeWidth={2} />
                        </button>
                        <button
                          className="btn btn-sm btn-danger-sm"
                          onClick={() => handleDeleteVoice(v)}
                          title="Delete voice"
                        >
                          <Trash2 size={12} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Tips */}
          <section className="settings-section">
            <h3>Tips for Best Results</h3>
            <ul className="voice-clone-tips">
              <li>Record in a quiet room, 15–30 cm from the microphone</li>
              <li>Speak naturally at normal pace for 5–15 seconds</li>
              <li>You can speak in any language — the model extracts speaker characteristics</li>
              <li>The cleaner the recording, the better the voice clone quality</li>
              <li>Avoid background music, echo, or other speakers</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
