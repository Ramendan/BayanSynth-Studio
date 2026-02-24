import React, { useState, useCallback, useRef, useEffect } from 'react';
import { synthesize, diacritize, listVoices, exportTimeline } from './api';
import Timeline from './components/Timeline';
import PropertiesPanel from './components/PropertiesPanel';
import WaveformViewer from './components/WaveformViewer';

let nextNodeId = 1;

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
    ...overrides,
  };
}

export default function App() {
  const [nodes, setNodes] = useState([
    createNode('مَرْحَباً بِكُمْ فِي بَيَانْسِنْث.'),
  ]);
  const [selectedId, setSelectedId] = useState(nodes[0]?.id);
  const [voices, setVoices] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [generating, setGenerating] = useState(false);
  const [masterAudioUrl, setMasterAudioUrl] = useState(null);
  const [autoTashkeel, setAutoTashkeel] = useState(true);

  const selectedNode = nodes.find((n) => n.id === selectedId);

  // Load voices on mount
  useEffect(() => {
    listVoices()
      .then(setVoices)
      .catch(() => setVoices([]));
  }, []);

  // ── Node CRUD ──────────────────────────────────────────────
  const addNode = useCallback(() => {
    const lastEnd = nodes.reduce(
      (max, n) => Math.max(max, n.start_time + n.duration),
      0
    );
    const newNode = createNode('', { start_time: lastEnd });
    setNodes((prev) => [...prev, newNode]);
    setSelectedId(newNode.id);
  }, [nodes]);

  const updateNode = useCallback((id, updates) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
    );
  }, []);

  const removeNode = useCallback(
    (id) => {
      setNodes((prev) => prev.filter((n) => n.id !== id));
      if (selectedId === id) {
        setSelectedId(nodes[0]?.id !== id ? nodes[0]?.id : nodes[1]?.id);
      }
    },
    [selectedId, nodes]
  );

  // ── Synthesis ─────────────────────────────────────────────
  const synthesizeNode = useCallback(
    async (id) => {
      const node = nodes.find((n) => n.id === id);
      if (!node || !node.text.trim()) return;

      setGenerating(true);
      setStatus(`Generating: "${node.text.slice(0, 30)}..."`);

      try {
        const result = await synthesize({
          text: node.text,
          voice: node.voice,
          speed: node.speed,
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
    [nodes, autoTashkeel, updateNode]
  );

  const synthesizeAll = useCallback(async () => {
    setGenerating(true);
    for (const node of nodes) {
      if (node.text.trim()) {
        await synthesizeNode(node.id);
      }
    }
    setGenerating(false);
    setStatus('All nodes generated');
  }, [nodes, synthesizeNode]);

  // ── Export ────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setGenerating(true);
    setStatus('Exporting timeline...');

    try {
      const blob = await exportTimeline(
        nodes.map((n) => ({
          id: n.id,
          text: n.text,
          voice: n.voice,
          speed: n.speed,
          start_time: n.start_time,
          fade_in: n.fade_in,
          fade_out: n.fade_out,
        })),
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
  }, [nodes, autoTashkeel]);

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

  return (
    <div className="studio-layout">
      {/* Top Bar */}
      <div className="topbar">
        <h1>🎵 BayanSynth Studio</h1>
        <div className="topbar-actions">
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={autoTashkeel}
              onChange={(e) => setAutoTashkeel(e.target.checked)}
            />
            Auto-Tashkeel
          </label>
          <button className="btn btn-sm" onClick={addNode}>
            + Add Node
          </button>
          <button
            className="btn btn-sm"
            onClick={synthesizeAll}
            disabled={generating}
          >
            ▶ Generate All
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleExport}
            disabled={generating}
          >
            💾 Export WAV
          </button>
        </div>
      </div>

      {/* Main Area: Editor + Properties */}
      <div className="main-area">
        <div className="editor-panel">
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`node-card ${selectedId === node.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(node.id)}
            >
              <div className="node-card-header">
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {node.id}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      synthesizeNode(node.id);
                    }}
                    disabled={generating || !node.text.trim()}
                  >
                    ▶
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(node.id);
                    }}
                    style={{ color: 'var(--accent)' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="node-card-text">
                {node.text || '(empty — click to edit)'}
              </div>
              <div className="node-card-meta">
                <span>⏱ {node.duration.toFixed(1)}s</span>
                <span>🔊 {node.speed}x</span>
                <span>📍 {node.start_time.toFixed(1)}s</span>
              </div>
              {node.audioUrl && (
                <audio
                  src={node.audioUrl}
                  controls
                  style={{ width: '100%', height: 28, marginTop: 4 }}
                />
              )}
            </div>
          ))}
        </div>

        <PropertiesPanel
          node={selectedNode}
          voices={voices}
          onUpdate={(updates) =>
            selectedNode && updateNode(selectedNode.id, updates)
          }
          onTashkeel={previewTashkeel}
        />
      </div>

      {/* Timeline */}
      <div className="timeline">
        <Timeline
          nodes={nodes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpdateNode={updateNode}
        />
        <WaveformViewer audioUrl={masterAudioUrl} />
      </div>

      {/* Status Bar */}
      <div className="statusbar">
        <span>{status}</span>
        <span>{nodes.length} nodes • {generating ? '⏳ Generating...' : '✅ Ready'}</span>
      </div>
    </div>
  );
}
