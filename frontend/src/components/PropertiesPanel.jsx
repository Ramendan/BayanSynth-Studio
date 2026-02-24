import React from 'react';

/**
 * Properties panel — edit the selected timeline node's parameters.
 */
export default function PropertiesPanel({ node, voices, onUpdate, onTashkeel }) {
  if (!node) {
    return (
      <div className="properties-panel">
        <h3>Properties</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Select a node to edit its properties
        </p>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      <h3>Properties — {node.id}</h3>

      <div className="form-group">
        <label>Arabic Text</label>
        <textarea
          rows={4}
          value={node.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="اكتب النص العربي هنا..."
        />
        <button
          className="btn btn-sm"
          style={{ marginTop: 4 }}
          onClick={onTashkeel}
        >
          ✨ Apply Tashkeel
        </button>
      </div>

      <div className="form-group">
        <label>Voice</label>
        <select
          value={node.voice || ''}
          onChange={(e) => onUpdate({ voice: e.target.value || null })}
        >
          <option value="">Default</option>
          {voices.map((v) => (
            <option key={v} value={v}>
              {v.split(/[\\/]/).pop()}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Speed: {node.speed}x</label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={node.speed}
          onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Start Time: {node.start_time.toFixed(1)}s</label>
        <input
          type="range"
          min="0"
          max="120"
          step="0.1"
          value={node.start_time}
          onChange={(e) => onUpdate({ start_time: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Fade In: {node.fade_in.toFixed(1)}s</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={node.fade_in}
          onChange={(e) => onUpdate({ fade_in: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Fade Out: {node.fade_out.toFixed(1)}s</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={node.fade_out}
          onChange={(e) => onUpdate({ fade_out: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Pitch Shift: {node.pitch_shift} semitones</label>
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={node.pitch_shift}
          onChange={(e) => onUpdate({ pitch_shift: parseInt(e.target.value) })}
        />
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          (Coming soon)
        </span>
      </div>

      {node.audioUrl && (
        <div className="form-group">
          <label>Preview</label>
          <audio src={node.audioUrl} controls style={{ width: '100%' }} />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            Duration: {node.duration.toFixed(2)}s
          </div>
        </div>
      )}
    </div>
  );
}
