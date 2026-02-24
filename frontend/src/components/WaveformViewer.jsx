import React, { useRef, useEffect } from 'react';

/**
 * WaveformViewer — uses WaveSurfer.js to render audio waveform.
 */
export default function WaveformViewer({ audioUrl }) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let ws;
    async function init() {
      // Dynamic import for WaveSurfer (works with Vite)
      const WaveSurfer = (await import('wavesurfer.js')).default;

      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }

      ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: '#e94560',
        progressColor: '#00d2a0',
        cursorColor: '#ffc107',
        height: 100,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        responsive: true,
        normalize: true,
        backend: 'WebAudio',
      });

      wavesurferRef.current = ws;

      if (audioUrl) {
        ws.load(audioUrl);
      }
    }

    init();

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  return (
    <div className="waveform-container" style={{ position: 'relative' }}>
      {!audioUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-dim)',
            fontSize: 13,
          }}
        >
          Export timeline to see waveform
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {audioUrl && (
        <button
          className="btn btn-sm"
          style={{ position: 'absolute', bottom: 4, right: 4, zIndex: 10 }}
          onClick={handlePlayPause}
        >
          ▶/⏸
        </button>
      )}
    </div>
  );
}
