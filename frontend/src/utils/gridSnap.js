/**
 * BayanSynth Studio — Grid Snapping Utilities
 */

import { SNAP_DIVISIONS } from './constants';

/**
 * Snap a time value (seconds) to the nearest grid line.
 * @param {number} timeSeconds — the raw time to snap
 * @param {number} bpm — beats per minute
 * @param {string} division — snap division key ('1/16', '1/8', '1/4', 'beat', 'bar', 'off')
 * @returns {number} snapped time in seconds
 */
export function snapToGrid(timeSeconds, bpm, division = '1/4') {
  const divBeats = SNAP_DIVISIONS[division];
  if (!divBeats || division === 'off') return timeSeconds;

  const secondsPerBeat = 60 / bpm;
  const gridSeconds = divBeats * secondsPerBeat;

  return Math.round(timeSeconds / gridSeconds) * gridSeconds;
}

/**
 * Snap a beat value to the nearest grid division.
 * @param {number} beat — the raw beat value
 * @param {string} division — snap division key
 * @returns {number} snapped beat value
 */
export function snapBeatToGrid(beat, division = '1/4') {
  const divBeats = SNAP_DIVISIONS[division];
  if (!divBeats || division === 'off') return beat;

  return Math.round(beat / divBeats) * divBeats;
}

/**
 * Snap a MIDI note to the nearest integer (semitone).
 * @param {number} midi — raw (possibly fractional) MIDI value
 * @returns {number} rounded MIDI note integer
 */
export function snapToSemitone(midi) {
  return Math.round(midi);
}

/**
 * Get the grid line positions (in beats) for a visible range.
 * @param {number} startBeat — first visible beat
 * @param {number} endBeat — last visible beat
 * @param {number} bpm — beats per minute
 * @param {string} division — grid division
 * @returns {{ beat: number, isBar: boolean, isBeat: boolean }[]}
 */
export function getGridLines(startBeat, endBeat, bpm, division = '1/4') {
  const divBeats = SNAP_DIVISIONS[division] || 1;
  const lines = [];

  const start = Math.floor(startBeat / divBeats) * divBeats;
  for (let b = start; b <= endBeat; b += divBeats) {
    if (b < startBeat) continue;
    lines.push({
      beat: b,
      isBar: b % 4 === 0,       // 4/4 time signature
      isBeat: b % 1 === 0,
    });
  }

  return lines;
}
