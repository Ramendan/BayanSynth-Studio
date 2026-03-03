/**
 * BayanSynth Studio — Global Constants
 * Mirrors Vocaloid 6 / Synthesizer V layout constants.
 */

// ── Canvas Dimensions ───────────────────────────────────────────
export const PIXELS_PER_BEAT = 80;
export const TRACK_HEIGHT = 100;
export const PIANO_KEY_WIDTH = 60;
export const HEADER_WIDTH = 160;
export const RULER_HEIGHT = 36;
export const ROW_HEIGHT = 28;          // Height of each semitone row in the piano roll
export const NOTE_HEIGHT = ROW_HEIGHT; // Each node fits exactly one row height
export const PARAMETER_EDITOR_HEIGHT = 200;
export const TOOLBAR_HEIGHT = 36;
export const TOPBAR_HEIGHT = 48;
export const STATUSBAR_HEIGHT = 30;
export const TRANSPORT_HEIGHT = 36;

// ── Note Range ──────────────────────────────────────────────────
export const NOTE_RANGE = {
  min: 36,   // C2
  max: 84,   // C6
  center: 60 // C4
};

export const NUM_ROWS = NOTE_RANGE.max - NOTE_RANGE.min; // 48

// ── Default Values ──────────────────────────────────────────────
export const DEFAULT_BPM = 120;
export const DEFAULT_SNAP = '1/4';
export const DEFAULT_SPEED = 1.0;
export const DEFAULT_VOLUME = 1.0;
export const DEFAULT_SEED = 42;
export const SAMPLE_RATE = 24000;

// ── Snap Divisions (in beats) ───────────────────────────────────
export const SNAP_DIVISIONS = {
  'off':  0,
  '1/16': 0.25,
  '1/8':  0.5,
  '1/4':  1,
  '1/2':  2,
  'beat': 1,
  'bar':  4,
};

// ── Tools ───────────────────────────────────────────────────────
export const TOOLS = {
  ARROW: 'arrow',
  PENCIL: 'pencil',
  SCISSOR: 'scissor',
  DELETE: 'delete',
  PAN: 'pan',
};

// ── Default Instruct Prompt ─────────────────────────────────────
// System prompt is prepended automatically by the API layer.
// This constant holds only the speaking-style instruction (empty = neutral).
export const DEFAULT_INSTRUCT = '';

// Fixed system prompt prefix required by CosyVoice3's instruct2 mode.
export const INSTRUCT_SYSTEM_PROMPT = 'You are a helpful assistant.<|endofprompt|>';

// ── Parameter Lanes ─────────────────────────────────────────────
export const PARAM_LANES = {
  DYN: 'DYN',
  PIT: 'PIT',
  VIB: 'VIB',
};

// ── Note Names ──────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

export function isBlackKey(midi) {
  const n = midi % 12;
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
}

// ── Time Conversion ─────────────────────────────────────────────
export function timeToBeat(timeSeconds, bpm) {
  return (timeSeconds * bpm) / 60;
}

export function beatToTime(beat, bpm) {
  return (beat * 60) / bpm;
}

export function beatToPixel(beat, pixelsPerBeat = PIXELS_PER_BEAT) {
  return beat * pixelsPerBeat;
}

export function pixelToBeat(pixel, pixelsPerBeat = PIXELS_PER_BEAT) {
  return pixel / pixelsPerBeat;
}

export function timeToPixel(timeSeconds, bpm, pixelsPerBeat = PIXELS_PER_BEAT) {
  return timeToBeat(timeSeconds, bpm) * pixelsPerBeat;
}

export function pixelToTime(pixel, bpm, pixelsPerBeat = PIXELS_PER_BEAT) {
  return beatToTime(pixel / pixelsPerBeat, bpm);
}

// ── MIDI / Y-axis Conversion ────────────────────────────────────
export function midiToY(midi) {
  return (NOTE_RANGE.max - midi) * ROW_HEIGHT;
}

export function yToMidi(y) {
  return NOTE_RANGE.max - Math.floor(y / ROW_HEIGHT);
}

export function pitchShiftToMidi(pitchShift) {
  return NOTE_RANGE.center + pitchShift;
}

export function midiToPitchShift(midi) {
  return midi - NOTE_RANGE.center;
}
