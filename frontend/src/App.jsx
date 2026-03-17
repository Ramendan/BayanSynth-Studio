/**
 * BayanSynth Studio — App Shell
 *
 * Thin layout shell: TopBar → Toolbar → (PianoRoll + Properties) → ParameterEditor → StatusBar
 * Overlays: HelpPanel, ContextMenu
 *
 * All state lives in Jotai atoms. Components self-subscribe.
 *
 * Feature-pass additions:
 *  - Space → play/pause                         [Item 15]
 *  - Ctrl+S / Ctrl+O / Ctrl+D shortcuts         [Item 15]
 *  - ? → help panel toggle                      [Item 20]
 *  - Waveform extraction after synthesis         [Item 10]
 *  - Real WAV export via api.exportTimeline      [Item 18]
 *  - Audio import handler                        [Item 9]
 *  - Context menu integration                    [Item 11]
 *  - Smart regeneration (generationHash)         [Item 12]
 */

import React, { useEffect, useCallback, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  tracksAtom,
  selectedNodeIdAtom,
  selectedTrackIdAtom,
  voicesAtom,
  statusTextAtom,
  isGeneratingAtom,
  isPlayingAtom,
  autoTashkeelAtom,
  updateNodeAtom,
  removeNodeAtom,
  addNodeAtom,
  zoomAtom,
  panAtom,
  activeToolAtom,
  helpOpenAtom,
  playheadAtom,
  isLoopingAtom,
  endNodeTimeAtom,
  duplicateSelectedAtom,
  computeGenerationHash,
  unsavedChangesAtom,
  settingsAtom,
  bpmAtom,
} from './store/atoms';
import { undoAtom, redoAtom } from './store/history';
import { saveProjectAtom, openProjectAtom } from './store/project';
import { listVoices, synthesize, exportTimeline, getSetupStatus, checkStatus } from './api';
import { getEngine } from './audio/AudioEngine';
import { getTransport } from './audio/TransportController';
import { TOOLS } from './utils/constants';

import TopBar from './components/TopBar';
import Toolbar from './components/Toolbar';
import PianoRoll from './components/PianoRoll/PianoRoll';
import PropertiesPanel from './components/PropertiesPanel';
import ParameterEditor from './components/ParameterEditor/ParameterEditor';
import StatusBar from './components/StatusBar';
import HelpPanel from './components/HelpPanel';
import ContextMenu from './components/ContextMenu';
import SettingsPanel from './components/SettingsPanel';
import VoiceClonePanel from './components/VoiceClonePanel';
import SetupScreen from './components/SetupScreen';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing...');
  // null = checking, false = needs first-run setup, true = models present
  const [setupReady, setSetupReady] = useState(null);
  // Model save paths returned by /api/setup/status (for display in SetupScreen)
  const [modelPaths, setModelPaths] = useState({ model_dir: '', lora_path: '' });
  const setVoices = useSetAtom(voicesAtom);
  const setStatus = useSetAtom(statusTextAtom);
  const [tracks, setTracks] = useAtom(tracksAtom);
  const [isGenerating, setGenerating] = useAtom(isGeneratingAtom);
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom);
  const updateNode = useSetAtom(updateNodeAtom);
  const removeNode = useSetAtom(removeNodeAtom);
  const addNode = useSetAtom(addNodeAtom);
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const selectedTrackId = useAtomValue(selectedTrackIdAtom);
  const setSelectedTrackId = useSetAtom(selectedTrackIdAtom);
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const saveProject = useSetAtom(saveProjectAtom);
  const openProject = useSetAtom(openProjectAtom);
  const duplicateSelected = useSetAtom(duplicateSelectedAtom);
  const zoom = useAtomValue(zoomAtom);
  const pan = useAtomValue(panAtom);
  const setActiveTool = useSetAtom(activeToolAtom);
  const [helpOpen, setHelpOpen] = useAtom(helpOpenAtom);
  const [playhead, setPlayhead] = useAtom(playheadAtom);
  const isLooping = useAtomValue(isLoopingAtom);
  const endNodeTime = useAtomValue(endNodeTimeAtom);
  const setUnsaved = useSetAtom(unsavedChangesAtom);
  const settings = useAtomValue(settingsAtom);
  const [autoTashkeel, setAutoTashkeelAtom] = useAtom(autoTashkeelAtom);
  const [bpm, setBpm] = useAtom(bpmAtom);
  const uiScale = Math.max(0.85, Math.min(1.5, (settings.fontSize || 14) / 14));
  // Mark unsaved changes whenever tracks mutate
  const tracksRef = React.useRef(tracks);
  useEffect(() => {
    if (tracksRef.current !== tracks) {
      setUnsaved(true);
      tracksRef.current = tracks;
    }
  }, [tracks, setUnsaved]);

  // Load voices on mount (and when custom dir changes)
  useEffect(() => {
    let mounted = true;
    const startup = async () => {
      try {
        setLoadingMsg('Connecting to backend...');
        // Check backend health with retries (generous timeout for slow machines)
        let attempts = 0;
        while (attempts < 20) {
          try {
            const st = await checkStatus();
            if (st && st.status === 'ok') break;
          } catch { /* retry */ }
          attempts++;
          setLoadingMsg(`Waiting for backend... (${attempts}/20)`);
          await new Promise(r => setTimeout(r, 1500));
        }

        // Check whether models are present (first-run setup guard)
        setLoadingMsg('Checking models...');
        const setup = await getSetupStatus();
        if (mounted) {
          setModelPaths({ model_dir: setup.model_dir || '', lora_path: setup.lora_path || '' });
        }
        if (mounted && !setup.ready) {
          setSetupReady(false);
          setLoading(false);
          return; // hand off to <SetupScreen>
        }
        if (mounted) setSetupReady(true);

        // Wait for models to finish loading (background load after server start)
        setLoadingMsg('Loading AI models...');
        let modelAttempts = 0;
        while (modelAttempts < 120) {
          try {
            const st = await checkStatus();
            if (st && st.models_ready) break;
          } catch { /* retry */ }
          modelAttempts++;
          setLoadingMsg(`Loading AI models... (${modelAttempts}s)`);
          await new Promise(r => setTimeout(r, 1000));
        }

        setLoadingMsg('Loading voices...');
        const voices = await listVoices(settings.customVoicesDir || null).catch(() => []);
        if (mounted) setVoices(voices);

        setLoadingMsg('Ready');
        // Small delay for smooth transition
        await new Promise(r => setTimeout(r, 400));
        if (mounted) {
          setLoading(false);
          setStatus('Ready');
        }
      } catch (err) {
        console.error('[BayanSynth] Startup error:', err);
        if (mounted) {
          setLoading(false);
          setStatus('Backend offline — some features may not work');
        }
      }
    };
    startup();
    return () => { mounted = false; };
  }, [setVoices, setStatus, settings.customVoicesDir]);

  // ── Apply theme to document root ───────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
    document.documentElement.lang = settings.language || 'en';
    document.documentElement.dir = 'ltr';
    document.documentElement.style.fontSize = `${settings.fontSize || 14}px`;
  }, [settings.theme, settings.fontSize, settings.language]);

  // ── Auto-tashkeel default → live atom ──────────
  useEffect(() => {
    setAutoTashkeelAtom(settings.autoTashkeel ?? true);
  }, [settings.autoTashkeel, setAutoTashkeelAtom]);

  // ── Default BPM for new projects (one-time) ─────
  useEffect(() => {
    if (settings.defaultBpm) setBpm(settings.defaultBpm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save timer ────────────────────────────
  useEffect(() => {
    if (!settings.autoSave) return;
    const ms = Math.max(1, settings.autoSaveInterval || 5) * 60 * 1000;
    const id = setInterval(() => {
      saveProject();
      setStatus('Auto-saved');
    }, ms);
    return () => clearInterval(id);
  }, [settings.autoSave, settings.autoSaveInterval, saveProject, setStatus]);

  // ── Playback quality → AudioEngine latency hint ─
  useEffect(() => {
    getEngine().setPlaybackQuality(settings.playbackQuality || 'balanced');
  }, [settings.playbackQuality]);

  // ── Synthesize single node ─────────────────────
  const synthesizeNode = useCallback(async (nodeId) => {
    // Use ref for latest tracks to avoid stale closure in synthesizeAll loops
    const currentTracks = tracksRef.current;
    const node = currentTracks.flatMap(t => t.nodes).find(n => n.id === nodeId);
    if (!node) return;
    if (!node.text.trim()) {
      setStatus(`Skipped node — no text entered. Type text in the Properties panel first.`);
      return;
    }

    // Smart regen: skip if hash matches (Item 12)
    const currentHash = computeGenerationHash(node);
    if (node.generationHash === currentHash && node.audioUrl) {
      setStatus(`Skipped "${node.text.slice(0, 20)}" — already generated`);
      return;
    }

    setGenerating(true);
    setStatus(`Generating: "${node.text.slice(0, 30)}..."`);

    try {
      const result = await synthesize({
        text: node.text,
        voice: node.voice,
        speed: node.speed,
        seed: node.seed,
        autoTashkeel,
        instruct: node.instruct,
      });

      // Extract waveform for display in note block (Item 10)
      const engine = getEngine();
      const { waveformData } = await engine.loadAndExtract(nodeId, result.url);

      updateNode({
        id: nodeId,
        audioUrl: result.url,
        duration: result.duration,
        originalDuration: result.duration,
        waveformData,
        generationHash: currentHash,
      });
      setStatus(`Done: ${result.duration.toFixed(1)}s in ${result.genTime.toFixed(1)}s`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [autoTashkeel, updateNode, setGenerating, setStatus]);

  // ── Synthesize all ─────────────────────────────
  const synthesizeAll = useCallback(async () => {
    const allNodes = tracksRef.current.flatMap(t => t.nodes).filter(n => n.text.trim() && n.nodeType !== 'imported');
    if (allNodes.length === 0) {
      setStatus('No nodes to generate');
      return;
    }

    // Warn if there are nodes without audio already
    const ungeneratedCount = allNodes.filter(n => !n.audioUrl).length;
    if (ungeneratedCount > 0 && ungeneratedCount < allNodes.length) {
      const proceed = window.confirm(
        `${ungeneratedCount} of ${allNodes.length} node(s) don't have audio yet.\n` +
        `Generate All will synthesize them. This may take a while.\n\nContinue?`
      );
      if (!proceed) return;
    }

    setGenerating(true);
    for (let i = 0; i < allNodes.length; i++) {
      setStatus(`Generating ${i + 1}/${allNodes.length}...`);
      await synthesizeNode(allNodes[i].id);
    }
    setGenerating(false);
    setStatus('All nodes generated');
  }, [synthesizeNode, setGenerating, setStatus]);

  // ── Export WAV (real export via API, Item 18) ───
  // Uses native save dialog in Electron, falls back to browser download
  const handleExport = useCallback(async () => {
    // Warn about ungenerated nodes
    const allNodes = tracksRef.current.flatMap(t => t.nodes).filter(n => n.nodeType !== 'imported');
    const ungenerated = allNodes.filter(n => n.text.trim() && !n.audioUrl);
    if (ungenerated.length > 0) {
      const proceed = window.confirm(
        `${ungenerated.length} node(s) have not been generated yet.\n` +
        `Their audio will be synthesized during export (may take a while).\n\nContinue?`
      );
      if (!proceed) return;
    }

    // Ask user where to save (Electron native dialog, else browser download)
    const exportPrefix = settings.exportPath?.trim() || `bayansynth_export_${Date.now()}`;
    let savePath = null;
    if (window.electronAPI?.saveFileDialog) {
      savePath = await window.electronAPI.saveFileDialog(`${exportPrefix}.wav`);
      if (!savePath) return; // User cancelled
    }

    setGenerating(true);
    setStatus('Exporting timeline...');
    try {
      const blob = await exportTimeline(tracks, autoTashkeel);

      if (savePath && window.electronAPI?.writeBinaryFile) {
        // Write binary to disk via Electron IPC
        const arrayBuf = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
          // Use chunked encoding — a single btoa() over a large array exhausts the call stack
          const CHUNK = 0x8000;
          let binary = '';
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
          }
          const base64 = btoa(binary);
        await window.electronAPI.writeBinaryFile(savePath, base64);
        setStatus(`Export complete — saved to ${savePath}`);
      } else {
        // Browser fallback: download via anchor
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportPrefix}.wav`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus('Export complete — file downloaded');
      }
    } catch (err) {
      setStatus(`Export error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [tracks, autoTashkeel, settings, setGenerating, setStatus]);

  // ── Import audio file (Item 9) ─────────────────
  const handleImportAudio = useCallback(async (file) => {
    const targetTrack = tracks.find(t => t.id === selectedTrackId) || tracks[0];
    if (!targetTrack) return;

    setStatus(`Importing: ${file.name}...`);
    const url = URL.createObjectURL(file);

    try {
      const engine = getEngine();
      const { buffer, waveform } = await engine.loadAndExtract(`import_${Date.now()}`, url);
      const duration = buffer.duration;

      addNode({
        trackId: targetTrack.id,
        text: file.name.replace(/\.[^.]+$/, ''),
        overrides: {
          nodeType: 'imported',
          audioUrl: url,
          duration,
          originalDuration: duration,
          waveformData: waveform,
          speed: 1.0,
          volume: 1.0,
        },
      });
      setStatus(`Imported: ${file.name} (${duration.toFixed(1)}s)`);
    } catch (err) {
      setStatus(`Import error: ${err.message}`);
    }
  }, [tracks, selectedTrackId, addNode, setStatus]);


  // ── Play/Pause toggle ──────────────────────────
  const togglePlayPause = useCallback(async () => {
    const transport = getTransport();
    if (isPlaying) {
      transport.pause();
      setIsPlaying(false);
    } else {
      await transport.play(tracks, playhead, {
        loop: isLooping,
        endTime: endNodeTime ?? undefined,
      });
      setIsPlaying(true);
    }
  }, [isPlaying, tracks, playhead, isLooping, endNodeTime, setIsPlaying]);

  // ── Global keyboard shortcuts ──────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const tag = e.target.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || e.target.isContentEditable;

      // Space → Play/Pause (Item 15)
      if (e.code === 'Space' && !inInput) {
        e.preventDefault();
        togglePlayPause();
        return;
      }

      // Undo/Redo/Duplicate — guarded so typing in text fields isn't affected
      if (ctrl && e.key === 'z' && !e.shiftKey && !inInput) {
        e.preventDefault();
        undo();
      } else if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !inInput) {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key === 's') {
        e.preventDefault();
        saveProject();
      } else if (ctrl && e.key === 'o') {
        e.preventDefault();
        openProject();
      } else if (ctrl && e.key === 'd' && !inInput) {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Delete' && selectedNodeId && !inInput) {
        e.preventDefault();
        if (settings.confirmDelete !== false) {
          if (!window.confirm('Delete this node?')) return;
        }
        removeNode(selectedNodeId);
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen(!helpOpen);
      } else if (!inInput) {
        // Tool shortcuts (only when not in text input)
        switch (e.key.toLowerCase()) {
          case 'v': setActiveTool(TOOLS.ARROW); break;
          case 'b': setActiveTool(TOOLS.PENCIL); break;
          case 'c': setActiveTool(TOOLS.SCISSOR); break;
          case 'd': setActiveTool(TOOLS.DELETE); break;
          case 'h': setActiveTool(TOOLS.PAN); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, undo, redo, removeNode, togglePlayPause, saveProject, openProject, duplicateSelected, helpOpen, setHelpOpen, setActiveTool]);

  // Expose synthesize functions globally for TopBar/Toolbar
  useEffect(() => {
    window.__studio = { synthesizeNode, synthesizeAll };
    return () => { delete window.__studio; };
  }, [synthesizeNode, synthesizeAll]);

  // ── First-run Setup Screen ────────────────────
  if (setupReady === false) {
    return (
      <SetupScreen
        modelDir={modelPaths.model_dir}
        loraPath={modelPaths.lora_path}
        onSetupComplete={async () => {
          setSetupReady(null);
          setLoading(true);
          setLoadingMsg('Verifying models…');
          const setup = await getSetupStatus().catch(() => ({ ready: true }));
          if (setup.ready) {
            setSetupReady(true);
            const voices = await listVoices(settings.customVoicesDir || null).catch(() => []);
            setVoices(voices);
            setLoading(false);
            setStatus('Ready');
          } else {
            setSetupReady(false);
            setLoading(false);
          }
        }}
      />
    );
  }

  // ── Loading Screen ───────────────────────────
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">BayanSynth Studio</div>
        <div className="loading-spinner" />
        <div className="loading-status">{loadingMsg}</div>
      </div>
    );
  }

  return (
    <div
      className="studio-layout"
      style={uiScale === 1
        ? undefined
        : {
            transform: `scale(${uiScale})`,
            transformOrigin: 'top left',
            width: `${100 / uiScale}vw`,
            height: `${100 / uiScale}vh`,
          }}
    >
      <TopBar
        onSynthesizeAll={synthesizeAll}
        onExport={handleExport}
        onImportAudio={handleImportAudio}
      />
      <Toolbar />

      <div className="main-area">
        <div className="editor-panel">
          <PianoRoll />
        </div>
        <PropertiesPanel />
      </div>

      <ParameterEditor zoom={zoom} panX={pan.x} />
      <StatusBar />

      {/* Overlays */}
      <HelpPanel />
      <ContextMenu />
      <SettingsPanel />
      <VoiceClonePanel />
    </div>
  );
}
