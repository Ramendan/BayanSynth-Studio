/**
 * SetupScreen — First-run model downloader wizard
 *
 * Shown when the backend reports that the required model files are missing.
 * Streams live download progress from GET /api/setup/download (SSE) and
 * auto-proceeds to the DAW once the models are fully loaded.
 */

import React, { useState, useEffect, useRef } from 'react';
import { streamModelDownload, getSetupStatus } from '../api';

const STAGE_LABELS = {
  idle:    'Ready to download',
  base:    'Downloading CosyVoice3 base model…',
  lora:    'Downloading LoRA checkpoint…',
  loading: 'Loading models into memory…',
  done:    'Models ready!',
  error:   'Download failed',
};

export default function SetupScreen({ onSetupComplete, modelDir, loraPath }) {
  const [phase, setPhase] = useState('idle');    // idle | downloading | done | error
  const [progress, setProgress] = useState({ stage: 'idle', base_pct: 0, lora_pct: 0, message: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const cleanupRef = useRef(null);
  // Resolved paths — prefer props, fall back to a direct fetch
  const [resolvedDir, setResolvedDir]   = useState(modelDir  || '');
  const [resolvedLora, setResolvedLora] = useState(loraPath  || '');

  // If the parent didn't have paths yet (backend was still waking up), fetch them now
  useEffect(() => {
    if (resolvedDir) return; // already have it
    let cancelled = false;
    getSetupStatus()
      .then(s => {
        if (!cancelled && s.model_dir) {
          setResolvedDir(s.model_dir);
          setResolvedLora(s.lora_path || '');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [resolvedDir]);

  // Auto-proceed to DAW 1.5 s after success
  useEffect(() => {
    if (phase === 'done') {
      const t = setTimeout(onSetupComplete, 1500);
      return () => clearTimeout(t);
    }
  }, [phase, onSetupComplete]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => { if (cleanupRef.current) cleanupRef.current(); };
  }, []);

  function startDownload() {
    if (phase === 'downloading') return;
    setPhase('downloading');
    setErrorMsg('');
    setProgress({ stage: 'idle', base_pct: 0, lora_pct: 0, message: 'Starting…' });

    const cleanup = streamModelDownload(
      (prog) => setProgress(prog),
      ()     => { setPhase('done'); setProgress(p => ({ ...p, stage: 'done', base_pct: 100, lora_pct: 100, message: 'Models ready!' })); },
      (msg)  => { setPhase('error'); setErrorMsg(msg); },
    );
    cleanupRef.current = cleanup;
  }

  function retry() {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setPhase('idle');
    setErrorMsg('');
  }

  const stageLabel = STAGE_LABELS[progress.stage] || progress.message || '';

  return (
    <div className="setup-screen">
      <div className="setup-screen__card">
        {/* Logo */}
        <div className="setup-screen__logo">BayanSynth Studio</div>
        <div className="setup-screen__subtitle">
          وقت التثبيت &nbsp; First-time Setup
        </div>

        {/* Idle state */}
        {phase === 'idle' && (
          <>
            <p className="setup-screen__desc">
              The AI models (~3&thinsp;GB) need to be downloaded from
              Hugging Face before the studio can synthesize speech.
              You only need to do this once.
            </p>
            <ul className="setup-screen__model-list">
              <li>CosyVoice3 base model <span className="setup-dim">(~2.8 GB)</span></li>
              <li>BayanSynth LoRA checkpoint <span className="setup-dim">(~1.5 GB)</span></li>
            </ul>

            {/* Show where files will land */}
            {(resolvedDir || resolvedLora) && (
              <div className="setup-paths">
                <div className="setup-paths__label">Files will be saved to:</div>
                {resolvedDir && (
                  <div className="setup-paths__row">
                    <span className="setup-paths__key">Base model</span>
                    <code className="setup-paths__val">{resolvedDir}</code>
                  </div>
                )}
                {resolvedLora && (
                  <div className="setup-paths__row">
                    <span className="setup-paths__key">LoRA</span>
                    <code className="setup-paths__val">{resolvedLora}</code>
                  </div>
                )}
              </div>
            )}

            <button className="setup-btn" onClick={startDownload}>
              Download Models
            </button>
          </>
        )}

        {/* Downloading state */}
        {phase === 'downloading' && (
          <div className="setup-progress-section">
            <div className="setup-stage-label">{stageLabel}</div>

            <div className="setup-progress-row">
              <span className="setup-progress-label">Base Model (CosyVoice3)</span>
              <span className="setup-progress-pct">{progress.base_pct}%</span>
            </div>
            <div className="setup-progress-bar-wrap">
              <div
                className="setup-progress-bar"
                style={{ width: `${progress.base_pct}%` }}
              />
            </div>

            <div className="setup-progress-row" style={{ marginTop: '18px' }}>
              <span className="setup-progress-label">LoRA Checkpoint</span>
              <span className="setup-progress-pct">{progress.lora_pct}%</span>
            </div>
            <div className="setup-progress-bar-wrap">
              <div
                className="setup-progress-bar"
                style={{ width: `${progress.lora_pct}%`,
                         background: 'var(--magenta)',
                         boxShadow: 'var(--glow-magenta)' }}
              />
            </div>

            {progress.message && (
              <div className="setup-status-text">{progress.message}</div>
            )}

            <p className="setup-screen__hint">
              Do not close the app. Download runs in the background.
            </p>
          </div>
        )}

        {/* Success state */}
        {phase === 'done' && (
          <div className="setup-done">
            <span className="setup-done__icon">✓</span>
            <span>Models downloaded and loaded. Opening studio...</span>
          </div>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="setup-error">
            <div className="setup-error__title">Download failed</div>
            <div className="setup-error__msg">{errorMsg}</div>
            <div className="setup-error__hint">
              <p>Check your internet connection and try again.</p>
              <p style={{ marginTop: '8px' }}>
                You can also download the models manually:
              </p>
              <ol style={{ textAlign: 'left', margin: '8px 0', paddingLeft: '20px', fontSize: '12px' }}>
                <li>Base model: <code>huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512</code></li>
                <li>LoRA checkpoint: <code>huggingface.co/Ramendan/BayanSynthTTS-checkpoints</code></li>
              </ol>
              {resolvedDir && (
                <p style={{ fontSize: '12px' }}>
                  Place the base model files in: <code>{resolvedDir}</code>
                </p>
              )}
            </div>
            <button className="setup-btn setup-btn--retry" onClick={retry}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
