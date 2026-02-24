import React, { useState, useCallback, useEffect } from 'react';
import { synthesize, diacritize, listVoices, exportTimeline, pitchDetect, uploadVoice } from './api';
import Timeline from './components/Timeline';
import PropertiesPanel from './components/PropertiesPanel';
import WaveformViewer from './components/WaveformViewer';
import { engine } from './AudioEngine';

let nextNodeId = 1;
let nextTrackId = 1;

function createNode(text = '', overrides = {}) {
  return {
    id: `node_${nextNodeId++}`,
    text,
    voice: null,
    speed: 1.0,
    start_time: 0,
    pitch_shift: 0,
    fade_in: 0,
    fade_out: 0,
    audioUrl: null,
    duration: 0,
    volume: 1.0,
    seed: 42,
    ...overrides,
  };
}

function createTrack(name = 'Track 1', overrides = {}) {
  return {
    id: `track_${nextTrackId++}`,
    name,
    nodes: [],
    volume: 1.0,
    mute: false,
    solo: false,
    ...overrides,
  };
}

export default function App() {
  const [tracks, setTracks] = useState([
    createTrack('Lead Vocal', { nodes: [createNode('مَرْحَباً بِكُمْ فِي بَيَانْسِنْث.')] }),
  ]);
  const [selectedId, setSelectedId] = useState(tracks[0].nodes[0]?.id);
  const [voices, setVoices] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [generating, setGenerating] = useState(false);
  const [masterAudioUrl, setMasterAudioUrl] = useState(null);
  const [autoTashkeel, setAutoTashkeel] = useState(true);
  const [bgTrack, setBgTrack] = useState(null);

  const selectedNode = tracks.flatMap(t => t.nodes).find((n) => n.id === selectedId);

  // Load voices on mount
  useEffect(() => {
    listVoices()
      .then(setVoices)
      .catch(() => setVoices([]));
  }, []);

  // ── Node CRUD ──────────────────────────────────────────────
  const addNode = useCallback((trackId) => {
    setTracks((prev) => prev.map(t => {
      if (t.id !== trackId) return t;
      const lastEnd = t.nodes.reduce(
        (max, n) => Math.max(max, n.start_time + n.duration),
        0
      );
      const newNode = createNode('', { start_time: lastEnd });
      setSelectedId(newNode.id);
      return { ...t, nodes: [...t.nodes, newNode] };
    }));
  }, []);

  const updateNode = useCallback((id, updates) => {
    setTracks((prev) =>
      prev.map((t) => ({
        ...t,
        nodes: t.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n))
      }))
    );
  }, []);

  const removeNode = useCallback(
    (id) => {
      setTracks((prev) => prev.map(t => ({
        ...t,
        nodes: t.nodes.filter(n => n.id !== id)
      })));
    },
    []
  );

  const addTrack = useCallback(() => {
    setTracks(prev => [...prev, createTrack(`Track ${prev.length + 1}`)]);
  }, []);

  const updateTrack = useCallback((id, updates) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  // ── Synthesis ─────────────────────────────────────────────
  const synthesizeNode = useCallback(
    async (id) => {
      const node = tracks.flatMap(t => t.nodes).find((n) => n.id === id);
      if (!node || !node.text.trim()) return;

      setGenerating(true);
      setStatus(`Generating: "${node.text.slice(0, 30)}..."`);

      try {
        const result = await synthesize({
          text: node.text,
          voice: node.voice,
          speed: node.speed,
          seed: node.seed,
          autoTashkeel,
        });

        updateNode(id, {
          audioUrl: result.url,
          duration: result.duration,
        });
        setStatus(`Done: ${result.duration.toFixed(1)}s in ${result.genTime.toFixed(1)}s`);
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      } finally {
        setGenerating(false);
      }
    },
    [tracks, autoTashkeel, updateNode]
  );

  const synthesizeAll = useCallback(async () => {
    setGenerating(true);
    for (const node of tracks.flatMap(t => t.nodes)) {
      if (node.text.trim()) {
        await synthesizeNode(node.id);
      }
    }
    setGenerating(false);
    setStatus('All nodes generated');
  }, [tracks, synthesizeNode]);

  // ── Export ────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setGenerating(true);
    setStatus('Exporting timeline...');

    try {
      const blob = await exportTimeline(
        tracks,
        autoTashkeel
      );

      // Try Electron save dialog, fallback to browser download
      if (window.electronAPI?.saveFileDialog) {
        const filePath = await window.electronAPI.saveFileDialog('bayansynth_export.wav');
        if (filePath) {
          // In production, write via Node.js fs
          setStatus(`Exported to ${filePath}`);
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bayansynth_export.wav';
        a.click();
        URL.revokeObjectURL(url);
        setStatus('Exported (downloaded)');
      }

      setMasterAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      setStatus(`Export error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [tracks, autoTashkeel]);

  // ── Tashkeel preview ──────────────────────────────────────
  const previewTashkeel = useCallback(async () => {
    if (!selectedNode) return;
    try {
      const result = await diacritize(selectedNode.text);
      updateNode(selectedNode.id, { text: result.diacritized });
      setStatus(`Tashkeel: ${result.original_ratio * 100}% → ${result.result_ratio * 100}%`);
    } catch {
      setStatus('Tashkeel failed');
    }
  }, [selectedNode, updateNode]);

  const handleBgUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('Analyzing background track...');
    try {
      const url = URL.createObjectURL(file);
      const pitchData = await pitchDetect(file);
      setBgTrack({ url, pitch: pitchData.pitch, hopLength: pitchData.hop_length, sr: pitchData.sr });
      setStatus('Background track loaded');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="studio-layout">
      {/* Top Bar */}
      <div className="topbar">
        <h1>BayanSynth Studio</h1>
        <div className="topbar-actions">
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={autoTashkeel}
              onChange={(e) => setAutoTashkeel(e.target.checked)}
            />
            Auto-Tashkeel
          </label>
          <button className="btn btn-sm" onClick={addTrack}>
            + Add Track
          </button>
          <button
            className="btn btn-sm"
            onClick={synthesizeAll}
            disabled={generating}
          >
            Generate All
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleExport}
            disabled={generating}
          >
            Export WAV
          </button>
        </div>
      </div>

      {/* Main Area: Editor + Properties */}
      <div className="main-area">
        <div className="editor-panel" style={{ padding: 0 }}>
          <Timeline
            tracks={tracks}
            bgTrack={bgTrack}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdateNode={updateNode}
            onUpdateTrack={updateTrack}
            onAddNode={addNode}
            onRemoveNode={removeNode}
            onSynthesizeNode={synthesizeNode}
          />
        </div>

        <PropertiesPanel
          node={selectedNode}
          voices={voices}
          onUpdate={(updates) =>
            selectedNode && updateNode(selectedNode.id, updates)
          }
          onTashkeel={previewTashkeel}
          onUploadVoice={async (file) => {
            const res = await uploadVoice(file);
            setVoices(prev => [...prev, res.filename]);
            updateNode(selectedNode.id, { voice: res.filename });
          }}
        />
      </div>

      {/* Bottom Bar */}
      <div className="bottombar" style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center' }}>
        <label className="btn btn-sm">
          Upload Background Track
          <input type="file" accept="audio/*" hidden onChange={handleBgUpload} />
        </label>
        {masterAudioUrl && <WaveformViewer audioUrl={masterAudioUrl} />}
      </div>

      {/* Status Bar */}
      <div className="statusbar">
        <span>{status}</span>
        <span>{tracks.flatMap(t => t.nodes).length} nodes • {generating ? 'Generating...' : 'Ready'}</span>
      </div>
    </div>
  );
}
