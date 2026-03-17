import { Midi } from '@tonejs/midi';
import { NOTE_RANGE } from './constants';
import { createNode, createTrack, resetIdCounters } from '../store/atoms';

const DEFAULT_BPM = 120;
const MAX_IMPORT_TRACKS = 4;
const MAX_NOTES_PER_TRACK = 128;
const DEFAULT_IMPORT_TEXT = 'la';

function clampMidi(midi) {
  return Math.max(NOTE_RANGE.min, Math.min(NOTE_RANGE.max, midi));
}

function pickLyricForTick(lyrics, tick) {
  if (!lyrics.length) return '';
  let best = lyrics[0];
  let bestDelta = Math.abs(lyrics[0].ticks - tick);
  for (let i = 1; i < lyrics.length; i++) {
    const delta = Math.abs(lyrics[i].ticks - tick);
    if (delta < bestDelta) {
      best = lyrics[i];
      bestDelta = delta;
    }
  }
  return bestDelta <= 240 ? best.text : '';
}

function sampleNotesIfNeeded(notes, maxNotes) {
  if (notes.length <= maxNotes) return notes;

  const sampled = [];
  const stride = notes.length / maxNotes;
  for (let i = 0; i < maxNotes; i++) {
    sampled.push(notes[Math.floor(i * stride)]);
  }
  return sampled;
}

export async function importMidiFileToTracks(file) {
  const data = await file.arrayBuffer();
  const midi = new Midi(data);

  const bpm = midi.header.tempos?.[0]?.bpm || DEFAULT_BPM;
  const lyrics = (midi.header.meta || []).filter((m) => m.type === 'lyrics' || m.type === 'text');

  resetIdCounters(1, 1);

  let droppedTracks = 0;
  let droppedNotes = 0;

  const playableTracks = midi.tracks.filter((t) => t.notes && t.notes.length > 0);
  if (playableTracks.length > MAX_IMPORT_TRACKS) {
    droppedTracks = playableTracks.length - MAX_IMPORT_TRACKS;
  }

  const tracks = playableTracks
    .slice(0, MAX_IMPORT_TRACKS)
    .map((track, idx) => {
      const sourceNotes = [...track.notes].sort((a, b) => a.time - b.time);
      const limitedNotes = sampleNotesIfNeeded(sourceNotes, MAX_NOTES_PER_TRACK);
      droppedNotes += Math.max(0, sourceNotes.length - limitedNotes.length);

      const nodes = limitedNotes.map((note) => {
        const midiPitch = clampMidi(Math.round(note.midi));
        const text = pickLyricForTick(lyrics, note.ticks) || DEFAULT_IMPORT_TEXT;
        return createNode(text, {
          start_time: Math.max(0, note.time),
          duration: Math.max(0.08, note.duration),
          originalDuration: Math.max(0.08, note.duration),
          pitch_shift: midiPitch - NOTE_RANGE.center,
          volume: Math.max(0, Math.min(1.5, (note.velocity || 1) * 1.5)),
        });
      });

      return createTrack(track.name || `MIDI Track ${idx + 1}`, idx, { nodes });
    });

  return {
    tracks: tracks.length ? tracks : [createTrack('MIDI Track 1', 0, { nodes: [] })],
    bpm,
    importMeta: {
      droppedTracks,
      droppedNotes,
      maxTracks: MAX_IMPORT_TRACKS,
      maxNotesPerTrack: MAX_NOTES_PER_TRACK,
    },
  };
}

export function exportTracksToMidi(tracks, bpm = DEFAULT_BPM) {
  const midi = new Midi();
  midi.header.setTempo(Math.max(20, Math.min(300, bpm || DEFAULT_BPM)));
  midi.header.name = 'BayanSynth Studio Export';

  tracks.forEach((srcTrack, idx) => {
    const outTrack = midi.addTrack();
    outTrack.name = srcTrack.name || `Track ${idx + 1}`;

    srcTrack.nodes
      .filter((n) => n.nodeType !== 'imported' && (n.duration || 0) > 0)
      .forEach((node) => {
        const midiPitch = clampMidi(NOTE_RANGE.center + (node.pitch_shift || 0));
        const start = Math.max(0, node.start_time || 0);
        const duration = Math.max(0.08, node.duration || 0.5);

        outTrack.addNote({
          midi: midiPitch,
          time: start,
          duration,
          velocity: Math.max(0.05, Math.min(1, (node.volume ?? 1) / 1.5)),
        });

        if (node.text && node.text.trim()) {
          midi.header.meta.push({
            type: 'lyrics',
            text: node.text,
            ticks: midi.header.secondsToTicks(start),
          });
        }
      });
  });

  return midi;
}
