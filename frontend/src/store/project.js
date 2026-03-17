/**
 * BayanSynth Studio — Project Persistence
 *
 * Serializes/deserializes the full project state to JSON.
 * Audio blobs are stored as Base64 within the project file for portability.
 */

import { atom } from 'jotai';
import {
  tracksAtom, bpmAtom, snapDivisionAtom, autoTashkeelAtom,
  resetIdCounters, endNodeTimeAtom, projectNameAtom, unsavedChangesAtom,
  updateNodeAtom,
} from './atoms';
import { clearHistoryAtom } from './history';
import { getEngine } from '../audio/AudioEngine';
import { DEFAULT_INSTRUCT, DEFAULT_SEED } from '../utils/constants';

const PROJECT_VERSION = 2;
const PROJECT_EXTENSION = '.bayan';

export const serializeProjectAtom = atom(null, async (get) => {
  const tracks = get(tracksAtom);
  const bpm = get(bpmAtom);
  const snap = get(snapDivisionAtom);
  const autoTashkeel = get(autoTashkeelAtom);
  const endNodeTime = get(endNodeTimeAtom);
  const projectName = get(projectNameAtom);

  const serializedTracks = await Promise.all(tracks.map(async (track) => ({
    ...track,
    nodes: await Promise.all(track.nodes.map(async (node) => {
      const serialized = { ...node };
      if (node.audioUrl) {
        try {
          const res = await fetch(node.audioUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          const base64 = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          serialized.audioBase64 = base64;
        } catch {
          serialized.audioBase64 = null;
        }
      }
      delete serialized.audioUrl;
      delete serialized.waveformData;
      return serialized;
    })),
  })));

  return JSON.stringify({
    version: PROJECT_VERSION,
    appName: 'BayanSynth Studio',
    savedAt: new Date().toISOString(),
    projectName,
    bpm,
    snap,
    autoTashkeel,
    endNodeTime,
    tracks: serializedTracks,
  }, null, 2);
});

export const loadProjectAtom = atom(null, async (get, set, jsonString) => {
  try {
    const data = JSON.parse(jsonString);
    if (!data.version || !data.tracks) {
      throw new Error('Invalid project file');
    }

    const tracks = await Promise.all(data.tracks.map(async (track) => ({
      ...track,
      // Ensure new track fields have defaults
      pan: track.pan ?? 0,
      visible: track.visible !== false,
      defaultPitch: track.defaultPitch ?? 0,
      defaultVolume: track.defaultVolume ?? 1.0,
      defaultSpeed: track.defaultSpeed ?? 1.0,
      nodes: await Promise.all(track.nodes.map(async (node) => {
        const restored = { ...node };
        if (node.audioBase64) {
          try {
            const res = await fetch(node.audioBase64);
            const blob = await res.blob();
            restored.audioUrl = URL.createObjectURL(blob);
          } catch {
            restored.audioUrl = null;
          }
        } else {
          restored.audioUrl = null;
        }
        delete restored.audioBase64;
        restored.waveformData = null;
        restored.nodeType = restored.nodeType || 'tts';
        restored.originalDuration = restored.originalDuration || restored.duration || 0;
        restored.pan = restored.pan ?? null;
        restored.generationHash = restored.generationHash || null;
        restored.automationDYN = restored.automationDYN || [];
        restored.automationPIT = restored.automationPIT || [];
        restored.automationVIB = restored.automationVIB || { rate: 5.5, depth: 0, onset: 0.3 };
        // Pass 2 fields
        restored.engineSpeed = restored.engineSpeed ?? 1.0;
        restored.instruct = restored.instruct ?? DEFAULT_INSTRUCT;
        restored.stretchRatio = restored.stretchRatio ?? 1.0;
        restored.offset = restored.offset ?? 0;
        restored.seed = restored.seed ?? DEFAULT_SEED;
        return restored;
      })),
    })));

    let maxNodeId = 0;
    let maxTrackId = 0;
    for (const t of tracks) {
      const tNum = parseInt(t.id.replace('track_', ''), 10);
      if (tNum > maxTrackId) maxTrackId = tNum;
      for (const n of t.nodes) {
        const nNum = parseInt(n.id.replace('node_', ''), 10);
        if (nNum > maxNodeId) maxNodeId = nNum;
      }
    }
    resetIdCounters(maxNodeId + 1, maxTrackId + 1);

    set(tracksAtom, tracks);
    if (data.bpm) set(bpmAtom, data.bpm);
    if (data.snap) set(snapDivisionAtom, data.snap);
    if (data.autoTashkeel !== undefined) set(autoTashkeelAtom, data.autoTashkeel);
    if (data.endNodeTime !== undefined) set(endNodeTimeAtom, data.endNodeTime);
    if (data.projectName) set(projectNameAtom, data.projectName);
    set(unsavedChangesAtom, false);
    set(clearHistoryAtom);

    // Re-extract waveforms for nodes that have audio (async, non-blocking)
    const engine = getEngine();
    for (const t of tracks) {
      for (const n of t.nodes) {
        if (n.audioUrl) {
          engine.loadAndExtract(n.id, n.audioUrl).then(({ waveform }) => {
            set(updateNodeAtom, { id: n.id, waveformData: waveform });
          }).catch(() => { /* silent — audio may be invalid */ });
        }
      }
    }

    return { success: true, trackCount: tracks.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

export const saveProjectAtom = atom(null, async (get, set) => {
  const json = await set(serializeProjectAtom);

  if (window.electronAPI?.saveFileDialog) {
    const filePath = await window.electronAPI.saveFileDialog('project.bayan');
    if (filePath && window.electronAPI.writeFile) {
      await window.electronAPI.writeFile(filePath, json);
      set(unsavedChangesAtom, false);
      return { success: true, path: filePath };
    }
      // User cancelled the native dialog — don't fall through to browser download
      return { success: false, error: 'Cancelled' };
  }

  // Browser fallback
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `project${PROJECT_EXTENSION}`;
  a.click();
  URL.revokeObjectURL(url);
  set(unsavedChangesAtom, false);
  return { success: true, path: 'downloaded' };
});

export const openProjectAtom = atom(null, async (get, set) => {
  let jsonString;

  if (window.electronAPI?.openFileDialog && window.electronAPI?.readFile) {
    const filePath = await window.electronAPI.openFileDialog();
    if (!filePath) return { success: false, error: 'Cancelled' };
    const result = await window.electronAPI.readFile(filePath);
    // Electron IPC returns { success, data } — unwrap it
    jsonString = (result && typeof result === 'object' && result.data) ? result.data : result;
  } else {
    // Browser fallback
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bayan,.json';
    const file = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files[0]);
      input.click();
    });
    if (!file) return { success: false, error: 'Cancelled' };
    jsonString = await file.text();
  }

  return set(loadProjectAtom, jsonString);
});
