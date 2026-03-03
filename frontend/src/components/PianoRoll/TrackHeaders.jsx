/**
 * BayanSynth Studio — Track Headers
 *
 * Vertical strip pinned to the left of the piano roll.
 * Features:
 *  - Track selection (click → selectedTrackIdAtom, .selected CSS highlight)
 *  - Color picker (input type=color)
 *  - Visibility toggle (Eye/EyeOff)
 *  - Pan slider (–1 to +1)
 *  - Mute/Solo/Delete with lucide-react icons
 *  - Volume slider
 */

import React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Eye, EyeOff, VolumeX, Headphones, Trash2, Plus,
} from 'lucide-react';
import {
  tracksAtom, addTrackAtom, updateTrackAtom, removeTrackAtom,
  selectedTrackIdAtom,
} from '../../store/atoms';
import { pushHistoryAtom } from '../../store/history';
import { ROW_HEIGHT, NOTE_RANGE } from '../../utils/constants';

const HEADER_WIDTH = 160;
const TRACK_LANE_HEIGHT = (NOTE_RANGE.max - NOTE_RANGE.min) * ROW_HEIGHT;
const ICO = { size: 13, strokeWidth: 1.5 };

export default function TrackHeaders() {
  const tracks = useAtomValue(tracksAtom);
  const [selectedTrackId, setSelectedTrackId] = useAtom(selectedTrackIdAtom);
  const addTrack = useSetAtom(addTrackAtom);
  const updateTrack = useSetAtom(updateTrackAtom);
  const removeTrack = useSetAtom(removeTrackAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);

  const handleMute = (trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    updateTrack({ id: trackId, mute: !track.mute });
  };

  const handleSolo = (trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    updateTrack({ id: trackId, solo: !track.solo });
  };

  const handleVolumeChange = (trackId, value) => {
    updateTrack({ id: trackId, volume: parseFloat(value) });
  };

  const handlePanChange = (trackId, value) => {
    updateTrack({ id: trackId, pan: parseFloat(value) });
  };

  const handleVisibilityToggle = (trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    updateTrack({ id: trackId, visible: !track.visible });
  };

  const handleColorChange = (trackId, color) => {
    updateTrack({ id: trackId, color });
  };

  const handleRemoveTrack = (trackId) => {
    pushHistory();
    removeTrack(trackId);
  };

  const handleAddTrack = () => {
    pushHistory();
    addTrack();
  };

  const handleRename = (trackId, newName) => {
    updateTrack({ id: trackId, name: newName });
  };

  return (
    <div className="track-headers" style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }}>
      {tracks.map((track, idx) => {
        const color = track.color || '#00f0ff';
        const isSelected = track.id === selectedTrackId;

        return (
          <div
            key={track.id}
            className={`track-header ${isSelected ? 'selected' : ''}`}
            style={{
              height: TRACK_LANE_HEIGHT,
              borderLeft: `3px solid ${color}`,
            }}
            onClick={() => setSelectedTrackId(track.id)}
          >
            {/* Color picker + name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(track.id, e.target.value)}
                className="track-color-input"
                title="Track color"
                onClick={(e) => e.stopPropagation()}
              />
              <input
                type="text"
                className="track-name-input"
                value={track.name}
                onChange={(e) => handleRename(track.id, e.target.value)}
                spellCheck={false}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Controls row: Mute / Solo / Visibility / Delete */}
            <div className="track-controls">
              <button
                className={`track-btn mute-btn ${track.mute ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleMute(track.id); }}
                title="Mute"
              >
                <VolumeX {...ICO} />
              </button>
              <button
                className={`track-btn solo-btn ${track.solo ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleSolo(track.id); }}
                title="Isolate (Solo)"
              >
                <Headphones {...ICO} />
              </button>
              <button
                className={`track-btn ${track.visible === false ? 'vis-off' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleVisibilityToggle(track.id); }}
                title={track.visible === false ? 'Show track' : 'Hide track'}
              >
                {track.visible === false ? <EyeOff {...ICO} /> : <Eye {...ICO} />}
              </button>
              {tracks.length > 1 && (
                <button
                  className="track-btn delete-btn"
                  onClick={(e) => { e.stopPropagation(); handleRemoveTrack(track.id); }}
                  title="Remove track"
                >
                  <Trash2 {...ICO} />
                </button>
              )}
            </div>

            {/* Volume slider */}
            <div className="track-volume">
              <label>Vol</label>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={track.volume ?? 1.0}
                onChange={(e) => handleVolumeChange(track.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="volume-slider"
                style={{ accentColor: color }}
              />
              <span className="volume-value">{Math.round((track.volume ?? 1.0) * 100)}%</span>
            </div>

            {/* Pan slider */}
            <div className="track-volume">
              <label>Pan</label>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={track.pan ?? 0}
                onChange={(e) => handlePanChange(track.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="volume-slider"
                style={{ accentColor: color }}
              />
              <span className="volume-value">
                {(track.pan ?? 0) === 0 ? 'C' : (track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(Math.abs(track.pan) * 100)}`)}
              </span>
            </div>
          </div>
        );
      })}

      {/* Add Track button */}
      <button
        className="add-track-btn"
        onClick={handleAddTrack}
        title="Add new track"
      >
        <Plus size={14} strokeWidth={1.5} /> Track
      </button>
    </div>
  );
}
