/**
 * BayanSynth Studio — Jotai Atom Store
 *
 * All application state is managed as Jotai atoms.
 * Components subscribe to individual atoms for fine-grained reactivity.
 */

import { atom } from 'jotai';
import { DEFAULT_BPM, DEFAULT_SNAP, TOOLS, PARAM_LANES, DEFAULT_SEED, DEFAULT_INSTRUCT } from '../utils/constants';
import { getTrackColor } from '../utils/colorPalette';

// ── ID Generators ───────────────────────────────────────────────
let _nextNodeId = 1;
let _nextTrackId = 1;

export function generateNodeId() {
  return `node_${_nextNodeId++}`;
}

export function generateTrackId() {
  return `track_${_nextTrackId++}`;
}

export function resetIdCounters(nodeCount = 1, trackCount = 1) {
  _nextNodeId = nodeCount;
  _nextTrackId = trackCount;
}

// ── Node / Track Factories ──────────────────────────────────────

export function createNode(text = '', overrides = {}) {
  return {
    id: generateNodeId(),
    nodeType: 'tts',          // 'tts' | 'imported' | 'end'
    text,
    voice: null,
    speed: 1.0,
    start_time: 0,
    pitch_shift: 0,
    fade_in: 0,
    fade_out: 0,
    audioUrl: null,
    duration: 0,
    originalDuration: 0,
    volume: 1.0,
    pan: null,                // null = use track pan
    seed: DEFAULT_SEED,
    offset: 0,
    stretchRatio: 1.0,
    engineSpeed: 1.0,
    instruct: DEFAULT_INSTRUCT,
    waveformData: null,
    pitchContour: null,
    phonemes: null,
    generationHash: null,
    automationDYN: [],
    automationPIT: [],
    automationVIB: { rate: 5.5, depth: 0, onset: 0.3 },
    dynFloor: 0,       // gain 0..1 when curve value is at bottom
    dynCeil: 1.0,      // gain 0..2 when curve value is at top
    ...overrides,
  };
}

export function createTrack(name = 'Track 1', colorIndex = 0, overrides = {}) {
  return {
    id: generateTrackId(),
    name,
    color: getTrackColor(colorIndex),
    colorIndex,
    nodes: [],
    volume: 1.0,
    pan: 0,
    mute: false,
    solo: false,
    visible: true,
    defaultPitch: 0,
    defaultVolume: 1.0,
    defaultSpeed: 1.0,
    ...overrides,
  };
}

// ── Core State Atoms ────────────────────────────────────────────

export const tracksAtom = atom([
  createTrack('Lead Vocal', 0, {
    nodes: [createNode('\u0645\u064E\u0631\u0652\u062D\u064E\u0628\u0627\u064B \u0628\u0650\u0643\u064F\u0645\u0652 \u0641\u0650\u064A \u0628\u064E\u064A\u064E\u0627\u0646\u0652\u0633\u0650\u0646\u0652\u062B.', {
      duration: 2.0,
      start_time: 0,
      pitch_shift: 0,
    })]
  }),
]);

export const selectedTrackIdAtom = atom('track_1');
export const selectedNodeIdsAtom = atom(new Set());

export const selectedNodeIdAtom = atom(
  (get) => {
    const ids = get(selectedNodeIdsAtom);
    return ids.size > 0 ? [...ids][0] : null;
  },
  (get, set, id) => {
    set(selectedNodeIdsAtom, id ? new Set([id]) : new Set());
  }
);

export const selectedNodeAtom = atom((get) => {
  const id = get(selectedNodeIdAtom);
  if (!id) return null;
  const tracks = get(tracksAtom);
  for (const t of tracks) {
    const node = t.nodes.find(n => n.id === id);
    if (node) return node;
  }
  return null;
});

export const selectedTrackAtom = atom((get) => {
  const id = get(selectedNodeIdAtom);
  if (!id) return null;
  const tracks = get(tracksAtom);
  return tracks.find(t => t.nodes.some(n => n.id === id)) || null;
});

// ── Tool State ──────────────────────────────────────────────────
export const activeToolAtom = atom(TOOLS.ARROW);

// ── Transport & Timeline ────────────────────────────────────────
export const bpmAtom = atom(DEFAULT_BPM);
export const snapDivisionAtom = atom(DEFAULT_SNAP);
export const zoomAtom = atom(1);
export const panAtom = atom({ x: 0, y: 0 });
export const playheadAtom = atom(0);
export const isPlayingAtom = atom(false);
export const isLoopingAtom = atom(false);
export const loopStartAtom = atom(0);
export const loopEndAtom = atom(16);

// ── End Node ────────────────────────────────────────────────────
export const endNodeTimeAtom = atom(null);

// ── Parameter Editor ────────────────────────────────────────────
export const parameterDrawerOpenAtom = atom(false);
export const activeParamLaneAtom = atom(PARAM_LANES.PIT);
export const paramDrawerHeightAtom = atom(200);

// ── Global Settings ─────────────────────────────────────────────
export const autoTashkeelAtom = atom(true);
export const voicesAtom = atom([]);

// ── UI State ────────────────────────────────────────────────────
export const statusTextAtom = atom('Ready');
export const isGeneratingAtom = atom(false);
export const masterAudioUrlAtom = atom(null);
export const helpOpenAtom = atom(false);
export const contextMenuAtom = atom(null);
export const dragGhostAtom = atom(null);
export const settingsOpenAtom = atom(false);
export const toastsAtom = atom([]);
export const showPitCurveAtom = atom(true);  // show pitch automation overlay on timeline tiles
export const paramRelativeViewAtom = atom(false); // false = timeline/global, true = selected-node relative

// ── Project Tracking ────────────────────────────────────────────
export const projectNameAtom = atom('Untitled');
export const unsavedChangesAtom = atom(false);

// ── Settings (persisted to localStorage) ────────────────────────
const SETTINGS_KEY = 'bayansynth_settings';
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}
const _defaults = {
  language: 'en',
  theme: 'dark',
  autoSave: false,
  autoSaveInterval: 5,
  exportPath: '',
  playbackQuality: 'balanced',   // 'low' | 'balanced' | 'high'
  defaultVoice: '',              // voice name applied to new tracks
  autoTashkeel: true,            // auto-diacritize Arabic text before synthesis
  defaultBpm: 120,               // BPM used when creating a new project
  confirmDelete: true,           // confirm prompt before deleting a node
    fontSize: 14,                  // UI base font size in px (12–20)
};
export const settingsAtom = atom({
  ..._defaults,
  ...loadSettings(),
});
export const updateSettingsAtom = atom(null, (get, set, updates) => {
  const next = { ...get(settingsAtom), ...updates };
  set(settingsAtom, next);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
});

// ── Write Atoms (actions) ───────────────────────────────────────

export const updateNodeAtom = atom(null, (get, set, { id, ...updates }) => {
  set(tracksAtom, get(tracksAtom).map(t => ({
    ...t,
    nodes: t.nodes.map(n => {
      if (n.id !== id) return n;

      // When start_time changes, shift all automation point times by the same delta
      // so the curve stays anchored relative to the node content.
      if (updates.start_time !== undefined && updates.start_time !== n.start_time) {
        const delta = updates.start_time - (n.start_time ?? 0);
        if (n.automationDYN && n.automationDYN.length > 0) {
          updates = {
            ...updates,
            automationDYN: n.automationDYN.map(p => ({ ...p, time: p.time + delta })),
          };
        }
        if (n.automationPIT && n.automationPIT.length > 0) {
          updates = {
            ...updates,
            automationPIT: n.automationPIT.map(p => ({ ...p, time: p.time + delta })),
          };
        }
      }

      return { ...n, ...updates };
    }),
  })));
});

export const removeNodeAtom = atom(null, (get, set, id) => {
  let fallbackSelection = null;
  const nextTracks = get(tracksAtom).map(t => {
    const idx = t.nodes.findIndex(n => n.id === id);
    if (idx === -1) return t;

    const nextNodes = t.nodes.filter(n => n.id !== id);
    if (nextNodes.length > 0) {
      const neighborIdx = Math.min(idx, nextNodes.length - 1);
      fallbackSelection = nextNodes[neighborIdx].id;
    }

    return {
      ...t,
      nodes: nextNodes,
    };
  });

  set(tracksAtom, nextTracks);

  const selectedIds = new Set(get(selectedNodeIdsAtom));
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    if (selectedIds.size === 0 && fallbackSelection) {
      selectedIds.add(fallbackSelection);
    }
    set(selectedNodeIdsAtom, selectedIds);
  }
});

export const addNodeAtom = atom(null, (get, set, { trackId, text, overrides }) => {
  const tracks = get(tracksAtom);
  const targetTrack = tracks.find(t => t.id === trackId);
  set(tracksAtom, tracks.map(t => {
    if (t.id !== trackId) return t;
    const lastEnd = t.nodes.reduce(
      (max, n) => Math.max(max, n.start_time + (n.duration || 0)), 0
    );
    const newNode = createNode(text || '', {
      voice: overrides?.voice || null,
      speed: overrides?.speed ?? t.defaultSpeed,
      volume: overrides?.volume ?? t.defaultVolume,
      pitch_shift: overrides?.pitch_shift ?? t.defaultPitch,
      start_time: overrides?.start_time ?? lastEnd,
      ...overrides,
    });
    set(selectedNodeIdAtom, newNode.id);
    return { ...t, nodes: [...t.nodes, newNode] };
  }));
});

export const addTrackAtom = atom(null, (get, set) => {
  const tracks = get(tracksAtom);
  const newTrack = createTrack(`Track ${tracks.length + 1}`, tracks.length);
  set(tracksAtom, [...tracks, newTrack]);
  set(selectedTrackIdAtom, newTrack.id);
});

export const updateTrackAtom = atom(null, (get, set, { id, ...updates }) => {
  set(tracksAtom, get(tracksAtom).map(t =>
    t.id === id ? { ...t, ...updates } : t
  ));
});

export const removeTrackAtom = atom(null, (get, set, id) => {
  const tracks = get(tracksAtom).filter(t => t.id !== id);
  set(tracksAtom, tracks);
  if (get(selectedTrackIdAtom) === id && tracks.length > 0) {
    set(selectedTrackIdAtom, tracks[0].id);
  }
});

export const moveNodeToTrackAtom = atom(null, (get, set, { nodeId, targetTrackId }) => {
  const tracks = get(tracksAtom);
  let movedNode = null;
  const updated = tracks.map(t => {
    const idx = t.nodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      movedNode = t.nodes[idx];
      return { ...t, nodes: t.nodes.filter(n => n.id !== nodeId) };
    }
    return t;
  });
  if (!movedNode) return;
  set(tracksAtom, updated.map(t => {
    if (t.id !== targetTrackId) return t;
    return { ...t, nodes: [...t.nodes, movedNode] };
  }));
});

export const splitNodeAtom = atom(null, (get, set, { nodeId, splitTime }) => {
  let rightNodeId = null;
  set(tracksAtom, get(tracksAtom).map(t => {
    const idx = t.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return t;

    const node = t.nodes[idx];
    const relSplit = splitTime - node.start_time;
    if (relSplit <= 0 || relSplit >= node.duration) return t;

    let leftWaveform = null;
    let rightWaveform = null;
    if (node.waveformData && node.waveformData.length > 0) {
      const splitIdx = Math.round((relSplit / node.duration) * node.waveformData.length);
      leftWaveform = new Float32Array(node.waveformData.slice(0, splitIdx));
      rightWaveform = new Float32Array(node.waveformData.slice(splitIdx));
    }

    const leftNode = {
      ...node,
      duration: relSplit,
      fade_out: 0,
      waveformData: leftWaveform,
    };

    const rightNode = createNode(node.text, {
      nodeType: node.nodeType,
      voice: node.voice,
      speed: node.speed,
      start_time: splitTime,
      pitch_shift: node.pitch_shift,
      duration: node.duration - relSplit,
      originalDuration: node.originalDuration,
      volume: node.volume,
      pan: node.pan,
      seed: node.seed,
      offset: node.offset + relSplit,
      fade_in: 0,
      fade_out: node.fade_out,
      audioUrl: node.audioUrl,
      waveformData: rightWaveform,
      pitchContour: node.pitchContour,
      phonemes: node.phonemes,
      generationHash: node.generationHash,
    });
    rightNodeId = rightNode.id;

    const newNodes = [...t.nodes];
    newNodes.splice(idx, 1, leftNode, rightNode);
    return { ...t, nodes: newNodes };
  }));

  // Keep editing flow continuous: after split, select the newly created right segment.
  if (rightNodeId && get(selectedNodeIdAtom) === nodeId) {
    set(selectedNodeIdAtom, rightNodeId);
  }
});

export const duplicateSelectedAtom = atom(null, (get, set) => {
  const selectedIds = get(selectedNodeIdsAtom);
  if (selectedIds.size === 0) return;

  const newIds = new Set();
  set(tracksAtom, get(tracksAtom).map(t => {
    const dupes = [];
    for (const n of t.nodes) {
      if (selectedIds.has(n.id)) {
        // Deep-copy all mutable data to ensure full independence (Item 10)
        const dupe = createNode(n.text, {
          nodeType: n.nodeType,
          voice: n.voice,
          speed: n.speed,
          pitch_shift: n.pitch_shift,
          fade_in: n.fade_in,
          fade_out: n.fade_out,
          volume: n.volume,
          pan: n.pan,
          seed: n.seed,
          offset: n.offset,
          stretchRatio: n.stretchRatio,
          engineSpeed: n.engineSpeed,
          instruct: n.instruct,
          start_time: n.start_time + (n.duration || 1),
          audioUrl: n.audioUrl,
          duration: n.duration,
          originalDuration: n.originalDuration,
          // Deep-copy typed arrays and automation data
          waveformData: n.waveformData ? new Float32Array(n.waveformData) : null,
          pitchContour: n.pitchContour ? [...n.pitchContour] : null,
          phonemes: n.phonemes,
          generationHash: null, // Force re-identification as separate entity
          automationDYN: n.automationDYN.map(p => ({ ...p })),
          automationPIT: n.automationPIT.map(p => ({ ...p })),
          automationVIB: { ...n.automationVIB },
        });
        dupes.push(dupe);
        newIds.add(dupe.id);
      }
    }
    return dupes.length > 0
      ? { ...t, nodes: [...t.nodes, ...dupes] }
      : t;
  }));
  set(selectedNodeIdsAtom, newIds);
});

export function computeGenerationHash(node) {
  return JSON.stringify({
    text: node.text,
    voice: node.voice,
    speed: node.speed,
    seed: node.seed,
    instruct: node.instruct,
  });
}

// ── Node Default Factories (for Revert) ─────────────────────────
export const NODE_GEN_DEFAULTS = {
  text: '',
  voice: null,
  speed: 1.0,
  seed: DEFAULT_SEED,
  instruct: DEFAULT_INSTRUCT,
};

export const NODE_ENGINE_DEFAULTS = {
  pitch_shift: 0,
  volume: 1.0,
  pan: null,
  fade_in: 0,
  fade_out: 0,
  engineSpeed: 1.0,
  offset: 0,
};

export const TRACK_DEFAULTS = {
  volume: 1.0,
  pan: 0,
  mute: false,
  solo: false,
  visible: true,
};
